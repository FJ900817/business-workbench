/** Immutable, content-free execution observations outside the frozen V5 Job schema. */

import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { link, mkdir, open, realpath, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { BusinessWorkbenchError } from './errors.ts'
import type { BusinessAgentExecutionMetrics, BusinessAgentRun } from './types.ts'

const natural = z.number().int().nonnegative()
const metricsSchema = z.object({
  requestStartedAt: natural, firstResponseAt: natural.optional(), responseCompletedAt: natural,
  agentDurationMs: natural, finishReason: z.string().optional(), toolCalls: natural,
  tokenUsage: z.object({
    inputTokens: natural, outputTokens: natural, reasoningTokens: natural.optional(),
    cacheReadTokens: natural.optional(), cacheWriteTokens: natural.optional(),
  }).strict().optional(),
}).strict()
const receiptSchema = z.object({
  version: z.literal(1), jobId: z.string(), attemptId: z.string(), agentRunId: z.string(), sessionId: z.string(),
  provider: z.string(), model: z.string(), reasoningEffort: z.string().nullable(), maxTokens: natural.nullable(),
  draftHash: z.string().regex(/^[a-f0-9]{64}$/), finalTextBytes: natural,
  titleCharacters: natural.nullable(), modelDeclaredTitleCharacters: natural.nullable(), titleCountMatches: z.boolean().nullable(),
  telemetryStatus: z.enum(['complete', 'incomplete']), missingFields: z.array(z.string()), metrics: metricsSchema.nullable(),
}).strict()

/** One Unicode code point counts once, including punctuation, spaces, Latin letters, and digits; no trimming or weighting.
 * @param text - Exact text, excluding Markdown heading syntax when counting a title.
 * @returns deterministic full-character count.
 */
export function countXhsFullCharacters(text: string): number {
  return Array.from(text).length
}

/** Content-free machine counts; model-authored labels remain separate and never alter the draft.
 * @param draft - Unmodified Markdown output.
 * @returns measured title count and an explicit comparison with the model's label.
 */
export function xhsTitleCharacterObservation(draft: string): Pick<z.infer<typeof receiptSchema>, 'titleCharacters' | 'modelDeclaredTitleCharacters' | 'titleCountMatches'> {
  const lines = draft.split(/\r?\n/u)
  const headingIndex = lines.findIndex(line => line.startsWith('# '))
  const heading = headingIndex < 0 ? undefined : lines[headingIndex]?.slice(2)
  const title = heading !== undefined && /^标题（(?:\d+|XXX)全字符）$/u.test(heading)
    ? lines.slice(headingIndex + 1).find(line => line.length > 0)
    : heading
  const declared = /^标题字符数：[ \t]*(\d+)/mu.exec(draft)?.[1]
  const titleCharacters = title === undefined ? null : countXhsFullCharacters(title)
  const modelDeclaredTitleCharacters = declared === undefined ? null : Number(declared)
  return { titleCharacters, modelDeclaredTitleCharacters,
    titleCountMatches: titleCharacters === null || modelDeclaredTitleCharacters === null
      ? null : titleCharacters === modelDeclaredTitleCharacters }
}

function hash(value: string): string { return createHash('sha256').update(value).digest('hex') }
function hasCode(error: unknown, code: string): boolean { return error instanceof Error && 'code' in error && error.code === code }

function missingObservations(metrics: z.infer<typeof metricsSchema> | null): string[] {
  return metrics === null ? ['metrics'] : [
    ...(metrics.finishReason === undefined ? ['finishReason'] : []),
    ...(metrics.tokenUsage === undefined ? ['tokenUsage'] : metrics.tokenUsage.reasoningTokens === undefined ? ['reasoningTokens'] : []),
  ]
}

/** Owner-private write-once observations; a receipt cannot make output authoritative or authorize execution. */
export class BusinessExecutionTelemetryStore {
  /** @param root - Business artifact root; receipt paths never come from model output. */
  constructor(private readonly root: string) {}

  /** Persist observed metrics before output settlement, or record missing observations during recovery.
   * @param run - Durable run identity.
   * @param draft - Exact decoded draft, used only for hashes, bytes, and deterministic counts.
   * @param metrics - Fresh runtime observations; absence never becomes zero usage.
   * @returns existing or newly durable receipt, verified against run and output identity.
   */
  async ensure(run: BusinessAgentRun, draft: string, metrics?: BusinessAgentExecutionMetrics): Promise<z.infer<typeof receiptSchema>> {
    const canonicalRoot = await realpath(this.root)
    const directory = join(canonicalRoot, 'execution-observations')
    await mkdir(directory, { recursive: true, mode: 0o700 })
    if (await realpath(directory) !== directory) throw new BusinessWorkbenchError('TELEMETRY_CORRUPT', 'business-workbench: observation directory is not a physical child')
    if (process.platform !== 'win32') {
      const parent = await open(canonicalRoot, constants.O_RDONLY)
      try { await parent.sync() } finally { await parent.close() }
    }
    const path = join(directory, `${hash(run.id)}.json`)
    const identity = { jobId: run.jobId, attemptId: run.attemptId, agentRunId: run.id, sessionId: run.sessionId,
      provider: run.model.provider, model: run.model.model,
      reasoningEffort: run.model.reasoningEffort ?? null, maxTokens: run.model.maxTokens ?? null,
      draftHash: hash(draft), finalTextBytes: Buffer.byteLength(draft), ...xhsTitleCharacterObservation(draft) }
    const read = async () => {
      const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
      try {
        const value = receiptSchema.parse(JSON.parse(await handle.readFile('utf8')))
        for (const [key, expected] of Object.entries(identity)) {
          if (value[key as keyof typeof identity] !== expected) throw new Error('observation identity mismatch')
        }
        const missing = missingObservations(value.metrics)
        if (JSON.stringify(missing) !== JSON.stringify(value.missingFields)
          || value.telemetryStatus !== (missing.length === 0 ? 'complete' : 'incomplete')) throw new Error('observation completeness mismatch')
        return value
      } finally { await handle.close() }
    }
    try { return await read() } catch (error) {
      if (!hasCode(error, 'ENOENT')) throw new BusinessWorkbenchError('TELEMETRY_CORRUPT', 'business-workbench: execution observation failed verification', {}, { cause: error })
    }
    const missingFields = missingObservations(metrics ?? null)
    const record = receiptSchema.parse({ version: 1, ...identity, telemetryStatus: missingFields.length === 0 ? 'complete' : 'incomplete', missingFields, metrics: metrics ?? null })
    const staging = `${path}.${randomUUID()}.tmp`
    try {
      const handle = await open(staging, 'wx', 0o600)
      try { await handle.writeFile(JSON.stringify(record) + '\n'); await handle.sync() } finally { await handle.close() }
      try { await link(staging, path) } catch (error) { if (!hasCode(error, 'EEXIST')) throw error }
      if (process.platform !== 'win32') {
        const parent = await open(directory, constants.O_RDONLY)
        try { await parent.sync() } finally { await parent.close() }
      }
      return await read()
    } catch (error) {
      throw new BusinessWorkbenchError('TELEMETRY_WRITE_FAILED', 'business-workbench: could not persist execution observations', {}, { cause: error })
    } finally {
      try { await unlink(staging) } catch (error) { if (!hasCode(error, 'ENOENT')) throw error }
    }
  }
}
