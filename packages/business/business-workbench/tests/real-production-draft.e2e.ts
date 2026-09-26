import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as LlmDeepSeek from '@deepseek-ai/dsh-llm-deepseek'
import SessionStore from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { describe, expect, it, vi } from 'vitest'
import BusinessWorkbenchService, {
  BUSINESS_WORKBENCH_SCHEMA_VERSION,
  BusinessWorkbenchError,
  XHS_PROJECT_RELATIVE_PATH,
  XhsProductionSourceResolver,
  xhsBodyPrepareIdempotencyKey,
  xhsProvenanceSchema,
} from '../src/index.ts'

const enabled = process.env.DSH_BUSINESS_REAL_PRODUCTION_DRAFT === '1'
const vaultRoot = process.env.DSH_BUSINESS_XHS_PRODUCTION_VAULT ?? ''
const dshHome = process.env.DSH_BUSINESS_PRODUCTION_DSH_HOME ?? join(homedir(), '.dsh')
const credentialPath = process.env.DSH_BUSINESS_SMOKE_CREDENTIALS ?? join(homedir(), '.dsh', '.credentials.yaml')
const reportPath = process.env.DSH_BUSINESS_EXPERIMENT_REPORT_PATH ?? ''
const softwareHead = process.env.DSH_BUSINESS_SOFTWARE_HEAD ?? ''
const baselinePath = join(
  vaultRoot,
  XHS_PROJECT_RELATIVE_PATH,
  '01_小红书生产创作系统/03_内容生产/小红书/产品1-视觉审美认知系统/账号1/2026-08/第01周/note002/小红书笔记完整方案.md',
)

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function forbiddenTool(name: string, executed: () => void): ToolDefinition {
  return {
    name,
    description: `forbidden ${name}`,
    parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'string' }, render: () => [] },
    execute: () => { executed(); return Promise.resolve('forbidden') },
  }
}

describe.skipIf(!enabled)('first real XHS production draft', () => {
  it('commits exactly one intermediate production bundle and stops', { retry: 0, timeout: 150_000 }, async () => {
    if (!existsSync(vaultRoot) || !existsSync(credentialPath) || reportPath.length === 0 || softwareHead.length === 0) {
      throw new Error('real production draft requires explicit Vault, credential, report, and software HEAD inputs')
    }
    expect(BUSINESS_WORKBENCH_SCHEMA_VERSION).toBe(5)
    const projectRoot = join(vaultRoot, XHS_PROJECT_RELATIVE_PATH)
    const identity = { account: 'account1', productionMonth: '2026-08', productionWeek: '第01周', note: 'note002' } as const
    const baselineExists = existsSync(baselinePath)
    const baselineBefore = baselineExists ? await stat(baselinePath) : undefined
    const credentialBefore = sha256(await readFile(credentialPath))
    const preflightResolver = new XhsProductionSourceResolver(vaultRoot)
    await preflightResolver.initialize(projectRoot)
    const preflight = await preflightResolver.resolve(identity, Date.now())
    const taskCard = preflight.sourceManifest.inputs.find(input => input.role === 'taskCard')
    if (taskCard === undefined) throw new Error('production source resolver returned no task card')

    const ctx = new Context()
    const totalJobStartedAt = Date.now()
    let reportWritten = false
    let providerInvocationStarted = false
    try {
      vi.stubEnv('DSH_HOME', dshHome)
      await ctx.plugin(Storage)
      await ctx.plugin(StorageJson, { root: join(dshHome, 'storages') })
      await ctx.plugin(StorageDomain, { backend: 'json' })
      await ctx.plugin(LlmRuntime)
      await ctx.plugin(LocalCredentialProvider, { path: credentialPath, watch: false })
      await ctx.plugin(LlmDeepSeek, { thinking: 'enabled', reasoningEffort: 'low' })
      await ctx.plugin(SessionStore)
      await ctx.plugin(SystemPrompt, { persona: 'ambient production context must stay hidden' })
      await ctx.plugin(ToolRuntime, { mode: 'code' })
      await ctx.plugin(AgentRegistry)
      await ctx.plugin(AgentLoop, { agents: [] })
      await ctx.plugin(BusinessWorkbenchService, {
        dshHome,
        readRoots: { xhs: projectRoot },
        xhsProductionSource: { vaultRoot },
        leaseDurationMs: 120_000,
        restrictedAgent: {
          provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'low',
          maxTokens: 4_096, timeoutMs: 90_000,
        },
      })
      const service = ctx.businessWorkbench
      const historicalBatches = service.listBatches()
      expect(historicalBatches).toHaveLength(1)
      const historicalBatch = historicalBatches[0]!
      const historicalJobs = service.listJobs(historicalBatch.id)
      expect(historicalBatch).toMatchObject({ mode: 'legacy-fixed4' })
      expect(historicalBatch.jobIds).toHaveLength(4)
      expect(historicalBatch.participatingJobIds).toHaveLength(1)
      let forbiddenExecutions = 0
      for (const name of ['fs', 'bash', 'workspace-scan', 'skill-discovery', 'subagent', 'gzh-writing']) {
        ctx.tools.register(forbiddenTool(name, () => { forbiddenExecutions += 1 }))
      }

      const batch = await service.createBatch({
        idempotencyKey: 'phase4c1-retry-first-real-draft-account1-2026-08-week01-note002',
        project: 'xhs',
        type: 'xhs-body',
        mode: 'single',
        inputs: [
          { reference: `${identity.account}/${identity.productionMonth}/${identity.productionWeek}/${identity.note}`, sha256: taskCard.sha256 },
        ],
      })
      expect(batch).toMatchObject({ mode: 'single' })
      expect(batch.jobIds).toHaveLength(1)
      expect(batch.participatingJobIds).toEqual(batch.jobIds)
      expect(service.listJobs(batch.id)).toHaveLength(1)
      let job = service.listJobs(batch.id)[0]!
      job = await service.transitionJob({ jobId: job.id, expectedRevision: job.revision, idempotencyKey: 'phase4c1-retry:ready', status: 'ready' })
      job = await service.createAttempt({ jobId: job.id, expectedRevision: job.revision, idempotencyKey: 'phase4c1-retry:attempt' })
      job = await service.acquireExecutionLease({
        jobId: job.id, attemptId: job.currentAttempt!, expectedRevision: job.revision,
        idempotencyKey: 'phase4c1-retry:lease', ownerId: 'phase4c1-retry-first-real-draft',
      })
      const packageStartedAt = performance.now()
      const prepared = await service.createXhsProductionExecutionPackage({
        jobId: job.id, attemptId: job.currentAttempt!, expectedRevision: job.revision,
        idempotencyKey: 'phase4c1-retry:package', ownerId: 'phase4c1-retry-first-real-draft', identity,
      })
      const packageTotalMs = performance.now() - packageStartedAt
      await service.verifyExecutionPackage(job.id, job.currentAttempt!)
      providerInvocationStarted = true
      const result = await service.runRestrictedAgent({
        jobId: job.id,
        attemptId: job.currentAttempt!,
        executionPackageId: prepared.executionPackage.id,
        ownerId: 'phase4c1-retry-first-real-draft',
        action: 'xhs-body-prepare-v0',
        idempotencyKey: xhsBodyPrepareIdempotencyKey(job.currentAttempt!),
        xhs: { mode: 'production', account: 'account1', noteType: 'dry-search' },
      })
      if (result.kind !== 'output-bundle' || result.executionMetrics === undefined) {
        throw new Error('production Agent did not return a fresh output bundle')
      }
      const content = await service.getOutputBundle(result.outputBundle.id)
      const completed = await service.finalizeXhsOutputBundle(job.id, job.currentAttempt!)
      const untouchedJobs = service.listJobs(batch.id).slice(1)
      expect(untouchedJobs).toEqual([])
      expect(untouchedJobs.every(candidate => candidate.status === 'draft'
        && candidate.attempts.length === 0 && candidate.artifactRefs.length === 0)).toBe(true)
      expect(forbiddenExecutions).toBe(0)
      expect(completed.status).toBe('completed')
      expect(completed.artifactRefs).toHaveLength(1)
      expect(completed.artifactRefs[0]).toMatchObject({ type: 'validation' })
      expect(completed.attempts[0]?.outputBundle?.id).toBe(result.outputBundle.id)
      expect(await service.reconcileOutputBundles()).toMatchObject({ referencedCount: 1, orphanBundles: [] })
      expect(await service.reconcileArtifacts()).toMatchObject({ referencedCount: 1, orphanArtifacts: [] })
      expect(service.getBatch(historicalBatch.id)).toEqual(historicalBatch)
      expect(service.listJobs(historicalBatch.id)).toEqual(historicalJobs)
      expect(sha256(await readFile(credentialPath))).toBe(credentialBefore)
      const baselineAfter = baselineExists ? await stat(baselinePath) : undefined
      if (baselineBefore !== undefined && baselineAfter !== undefined) {
        expect({ size: baselineAfter.size, mtimeMs: baselineAfter.mtimeMs, ino: baselineAfter.ino })
          .toEqual({ size: baselineBefore.size, mtimeMs: baselineBefore.mtimeMs, ino: baselineBefore.ino })
      }
      const totalJobCompletedAt = Date.now()
      const report = {
        experiment: 'business-layer-v0.1-phase4c1-retry-first-real-draft',
        softwareHead,
        schemaVersion: BUSINESS_WORKBENCH_SCHEMA_VERSION,
        comparisonMode: 'architecture + model mixed',
        identity: prepared.sourceManifest.identity,
        baseline: { exists: baselineExists, path: baselinePath },
        sourceManifest: prepared.sourceManifest,
        model: result.run.model,
        generation: { providerRequestCount: 1, successfulCount: 1, transportRetryCount: 0, toolCalls: result.executionMetrics.toolCalls },
        timing: {
          executionPackageTotalMs: packageTotalMs,
          ...prepared.timing,
          requestStartedAt: result.executionMetrics.requestStartedAt,
          firstResponseAt: result.executionMetrics.firstResponseAt ?? null,
          responseCompletedAt: result.executionMetrics.responseCompletedAt,
          agentDurationMs: result.executionMetrics.agentDurationMs,
          structuralBundleMs: Math.max(0, result.outputBundle.createdAt - result.executionMetrics.responseCompletedAt),
          totalJobMs: totalJobCompletedAt - totalJobStartedAt,
        },
        tokenUsage: result.executionMetrics.tokenUsage ?? null,
        engineering: { errors: 0, unauthorizedActions: forbiddenExecutions, otherBatchJobsTouched: 0 },
        business: {
          batchId: batch.id, batchMode: batch.mode, storedJobs: batch.jobIds.length,
          participatingJobs: batch.participatingJobIds.length, jobId: completed.id,
          attemptId: completed.attempts[0]?.id, status: completed.status,
        },
        outputBundle: result.outputBundle,
        artifactPath: join(dshHome, 'business-workbench', 'v0.1', result.outputBundle.path, 'draft.md'),
        draft: content.files['draft.md'],
        productionObsidianWritten: false,
        provenance: xhsProvenanceSchema.parse(JSON.parse(content.files['provenance.json'])),
      }
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' })
      reportWritten = true
    } catch (error) {
      if (!reportWritten) {
        const failure = error instanceof BusinessWorkbenchError
          ? { name: error.name, code: error.code, message: error.message, detail: error.detail }
          : { name: error instanceof Error ? error.name : 'Unknown', message: error instanceof Error ? error.message : String(error) }
        await writeFile(reportPath, `${JSON.stringify({
          experiment: 'business-layer-v0.1-phase4c1-retry-first-real-draft', softwareHead,
          schemaVersion: BUSINESS_WORKBENCH_SCHEMA_VERSION,
          generation: { providerInvocationStarted, successfulCount: 0, transportRetryCount: 0 },
          failure, productionObsidianWritten: false,
        }, null, 2)}\n`, { flag: 'wx' })
      }
      throw error
    } finally {
      vi.unstubAllEnvs()
      await ctx.fiber.dispose()
    }
  })
})
