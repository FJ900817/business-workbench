/** Structural validation and deterministic manifests for XHS output bundles. */

import { createHash } from 'node:crypto'
import { z } from 'zod'
import { BusinessWorkbenchError } from './errors.ts'
import type { BusinessWorkbenchErrorDetail } from './errors.ts'
import { deriveBusinessOutputBundleId } from './ids.ts'
import type {
  BusinessAgentRun,
  BusinessExecutionPackage,
  BusinessOutputBundle,
  BusinessOutputBundleContent,
  BusinessOutputBundleEntry,
  XhsBodyPrepareOutputName,
} from './types.ts'

/** Maximum UTF-8 draft size admitted by the Phase 4B structural check. */
export const XHS_DRAFT_MAX_BYTES = 64 * 1024
/** Current three-file output format. */
export const XHS_OUTPUT_VERSION = 1 as const

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const idSchema = z.string().min(1)
const timestampSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

/** Host-encoded draft envelope; the Agent text transport does not emit JSON. */
export const xhsAgentDraftResponseSchema = z.object({ draft: z.string() }).strict()

/** Host-authored draft metadata JSON schema. */
export const xhsDraftMetadataSchema = z.object({
  jobId: idSchema,
  attemptId: idSchema,
  executionPackageId: idSchema,
  action: z.enum(['xhs-body-prepare-v0', 'xhs-body-revise-v0', 'xhs-body-retry-v0', 'xhs-body-contract-repair-v0', 'xhs-body-length-repair-v0']),
  project: z.literal('xhs'),
  artifactType: z.literal('intermediate'),
  generatedAt: timestampSchema,
  provider: idSchema,
  model: idSchema,
  skillManifestHash: sha256Schema,
  inputManifestHash: sha256Schema,
  outputVersion: z.literal(XHS_OUTPUT_VERSION),
}).strict()

const inputSnapshotSchema = z.object({
  role: idSchema,
  path: idSchema,
  hash: sha256Schema,
  bytes: z.number().int().nonnegative(),
}).strict()

const skillSnapshotSchema = z.object({
  skillId: idSchema,
  source: idSchema,
  provider: idSchema,
  contentHash: sha256Schema,
  snapshotHash: sha256Schema,
  bytes: z.number().int().nonnegative(),
}).strict()

/** Host-authored generation provenance JSON schema. */
export const xhsProvenanceSchema = z.object({
  job: z.object({ id: idSchema }).strict(),
  attempt: z.object({ id: idSchema }).strict(),
  executionPackage: z.object({ id: idSchema, manifestHash: sha256Schema }).strict(),
  inputs: z.array(inputSnapshotSchema).min(3).max(5),
  skills: z.array(skillSnapshotSchema).max(1),
  actionPolicyVersion: idSchema,
  provider: idSchema,
  model: idSchema,
  agentRun: z.object({ id: idSchema, sessionId: idSchema }).strict(),
  startedAt: timestampSchema,
  endedAt: timestampSchema,
  status: z.literal('completed'),
  draftHash: sha256Schema,
  metadataHash: sha256Schema,
  lineage: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('revision'), sourceJobId: idSchema, sourceAttemptId: idSchema,
      sourceOutputBundleId: idSchema, sourceDraftPath: idSchema, sourceDraftSha256: sha256Schema,
      reviewArtifactId: idSchema, reviewSha256: sha256Schema,
      revisionNumber: z.union([z.literal(1), z.literal(2)]),
    }).strict(),
    z.object({
      kind: z.literal('contract-repair'), sourceJobId: idSchema, sourceAttemptId: idSchema,
      sourceOutputBundleId: idSchema, sourceDraftPath: idSchema, sourceDraftSha256: sha256Schema,
      businessReviewArtifactId: idSchema, businessReviewSha256: sha256Schema,
      hardValidationArtifactId: idSchema, hardValidationSha256: sha256Schema,
      failedContractItems: z.array(idSchema).min(1), repairNumber: z.literal(1),
      repairedFields: z.array(z.enum([
        'title-length', 'body-length', 'keyword-occurrences', 'keyword-title-position',
        'declared-title-characters', 'declared-body-characters', 'allowed-topics-formatting',
      ])).min(1),
    }).strict(),
    z.object({
      kind: z.literal('length-repair'), sourceJobId: idSchema, sourceAttemptId: idSchema,
      sourceOutputBundleId: idSchema, sourceDraftPath: idSchema, sourceDraftSha256: sha256Schema,
      businessReviewArtifactId: idSchema, businessReviewSha256: sha256Schema,
      hardValidationArtifactId: idSchema, hardValidationSha256: sha256Schema,
      failedContractItems: z.array(z.enum(['titleRange', 'bodyRange'])).min(1).max(2), repairNumber: z.literal(1),
    }).strict(),
    z.object({
      kind: z.literal('retry'), retryOfJobId: idSchema, retryOfAttemptId: idSchema,
      retryOfOutputBundleId: idSchema.optional(),
      retryReason: z.enum(['EMPTY_DRAFT', 'FORMAT_CONTRACT_FAIL', 'REQUIRED_BODY_MISSING']), retryNumber: z.literal(1),
    }).strict(),
  ]).optional(),
}).strict()

/** Complete file bodies staged before one authoritative state update. */
export interface XhsOutputBundleFiles {
  readonly 'draft.md': string
  readonly 'draft-metadata.json': string
  readonly 'provenance.json': string
}

/** Inputs needed to build Host-authored XHS outputs. */
export interface BuildXhsOutputBundleRequest {
  readonly batchId: string
  readonly run: BusinessAgentRun
  readonly executionPackage: BusinessExecutionPackage
  readonly actionPolicyVersion: string
  /** Host-encoded JSON from {@link wrapXhsAgentText}, not an inferred model format. */
  readonly modelOutput: string
  readonly completedAt: number
}

/** Validated immutable bundle and its exact staged bytes. */
export interface BuiltXhsOutputBundle {
  readonly bundle: BusinessOutputBundle
  readonly files: XhsOutputBundleFiles
}

/** SHA-256 of UTF-8 bytes. */
function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/**
 * Stable relative directory for one authoritative bundle.
 * @param batchId - owning Batch identity.
 * @param jobId - owning Job identity.
 * @param attemptId - owning Attempt identity.
 * @param bundleId - deterministic Attempt-owned bundle identity.
 * @returns portable path below the private Business data root.
 */
export function xhsOutputBundleRelativePath(
  batchId: string,
  jobId: string,
  attemptId: string,
  bundleId: string,
): string {
  return ['projects', 'xhs', 'batches', batchId, 'jobs', jobId, 'attempts', attemptId, 'intermediate', bundleId].join('/')
}

/**
 * Hash the bundle manifest without its self-referential digest.
 * @param bundle - all manifest fields except the resulting hash.
 * @returns SHA-256 of the stable JSON representation.
 */
export function xhsOutputBundleManifestHash(bundle: Omit<BusinessOutputBundle, 'manifestHash'>): string {
  return hash(JSON.stringify(bundle))
}

/**
 * Parse and bound the strict internal draft envelope; no fence removal or JSON repair.
 * @param modelOutput - Host-encoded JSON, or explicit legacy JSON for structural inspection.
 * @returns validated Markdown draft.
 */
export function parseXhsAgentDraft(modelOutput: string): string {
  let value: unknown
  try {
    value = JSON.parse(modelOutput)
  } catch {
    // JSON.parse SyntaxError text can quote response bodies; expose only content-free evidence.
    throw outputInvalid('invalid-json', 'internal-json', modelOutput)
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value) && !Object.hasOwn(value, 'draft')) {
    throw outputInvalid('missing-draft', 'internal-json', modelOutput)
  }
  const parsed = xhsAgentDraftResponseSchema.safeParse(value)
  if (!parsed.success) throw outputInvalid('schema-invalid', 'internal-json', modelOutput)
  if (parsed.data.draft.trim().length === 0) throw outputInvalid('empty-draft', 'internal-json', modelOutput)
  if (parsed.data.draft.includes('\0')) throw outputInvalid('invalid-character', 'internal-json', modelOutput)
  if (Buffer.byteLength(parsed.data.draft, 'utf8') > XHS_DRAFT_MAX_BYTES) {
    throw outputInvalid('too-large', 'internal-json', modelOutput)
  }
  return parsed.data.draft
}

type OutputDiagnostics = NonNullable<BusinessWorkbenchErrorDetail['xhsOutputDiagnostics']>

function outputInvalid(
  kind: OutputDiagnostics['kind'], stage: OutputDiagnostics['stage'], output: string, finishReason?: string,
): BusinessWorkbenchError {
  return new BusinessWorkbenchError('XHS_BODY_OUTPUT_INVALID', `business-workbench: XHS output rejected (${kind})`, {
    xhsOutputDiagnostics: { version: 1, kind, stage, outputBytes: Buffer.byteLength(output), outputHash: hash(output),
      ...(finishReason === undefined ? {} : { finishReason }) },
  })
}

/**
 * Wrap final Markdown text deterministically without extracting or repairing model JSON.
 * One initial BOM is removable; all remaining draft bytes, including whitespace, are preserved.
 * Leading JSON containers or code fences are reserved transport prefixes and fail closed.
 * @param output - Complete final text returned by the tool-free Restricted Agent.
 * @param finishReason - Observed provider finish reason; absence is not proof of truncation.
 * @returns strict Host JSON for the existing three-file bundle builder.
 */
export function wrapXhsAgentText(output: string, finishReason?: string): string {
  const reject = (kind: OutputDiagnostics['kind']): never => { throw outputInvalid(kind, 'agent-text', output, finishReason) }
  if (finishReason === 'max-tokens') reject('truncated')
  if (finishReason !== undefined && finishReason !== 'stop') reject('unsupported-format')
  const draft = output.startsWith('\uFEFF') ? output.slice(1) : output
  if (Buffer.byteLength(draft) > XHS_DRAFT_MAX_BYTES) reject('too-large')
  if (draft.trim().length === 0) reject('empty-draft')
  if (draft.includes('\0') || draft.includes('\uFEFF')) reject('invalid-character')
  const prefix = draft.trimStart()
  if (prefix.startsWith('```') || prefix.startsWith('~~~')) reject('unsupported-format')
  if (prefix.startsWith('{') || prefix.startsWith('[')) {
    try { parseXhsAgentDraft(prefix) } catch (error) {
      // Diagnose an explicitly forbidden JSON prefix; never use its draft or retry as text.
      if (error instanceof BusinessWorkbenchError && error.detail.xhsOutputDiagnostics !== undefined) {
        reject(error.detail.xhsOutputDiagnostics.kind)
      }
      throw error
    }
    reject('unsupported-format')
  }
  return JSON.stringify({ draft })
}

/**
 * Build and cross-check the complete three-file Host result.
 * @param request - settled execution facts and untrusted model response.
 * @returns immutable bundle manifest and exact file bodies.
 */
export function buildXhsOutputBundle(request: BuildXhsOutputBundleRequest): BuiltXhsOutputBundle {
  const draft = parseXhsAgentDraft(request.modelOutput)
  const draftHash = hash(draft)
  const metadata = xhsDraftMetadataSchema.parse({
    jobId: request.run.jobId,
    attemptId: request.run.attemptId,
    executionPackageId: request.executionPackage.id,
    action: request.run.action,
    project: request.executionPackage.project,
    artifactType: 'intermediate',
    generatedAt: request.completedAt,
    provider: request.run.model.provider,
    model: request.run.model.model,
    skillManifestHash: request.executionPackage.skillManifestHash,
    inputManifestHash: request.executionPackage.manifestHash,
    outputVersion: XHS_OUTPUT_VERSION,
  })
  const metadataBody = `${JSON.stringify(metadata, null, 2)}\n`
  const metadataHash = hash(metadataBody)
  const provenance = xhsProvenanceSchema.parse({
    job: { id: request.run.jobId },
    attempt: { id: request.run.attemptId },
    executionPackage: { id: request.executionPackage.id, manifestHash: request.executionPackage.manifestHash },
    inputs: request.executionPackage.inputs.map(input => ({
      role: input.role,
      path: input.path,
      hash: input.sha256,
      bytes: input.bytes,
    })),
    skills: request.executionPackage.skillSnapshots.map(skill => ({
      skillId: skill.skillId,
      source: skill.source,
      provider: skill.provider,
      contentHash: skill.contentHash,
      snapshotHash: skill.snapshotHash,
      bytes: skill.bytes,
    })),
    actionPolicyVersion: request.actionPolicyVersion,
    provider: request.run.model.provider,
    model: request.run.model.model,
    agentRun: { id: request.run.id, sessionId: request.run.sessionId },
    startedAt: request.run.startedAt,
    endedAt: request.completedAt,
    status: 'completed',
    draftHash,
    metadataHash,
    ...(request.executionPackage.lineage === undefined ? {} : { lineage: request.executionPackage.lineage }),
  })
  const provenanceBody = `${JSON.stringify(provenance, null, 2)}\n`
  const files: XhsOutputBundleFiles = Object.freeze({
    'draft.md': draft,
    'draft-metadata.json': metadataBody,
    'provenance.json': provenanceBody,
  })
  const bundleId = deriveBusinessOutputBundleId(request.run.jobId, request.run.attemptId, request.run.id)
  const path = xhsOutputBundleRelativePath(request.batchId, request.run.jobId, request.run.attemptId, bundleId)
  const specifications = [
    ['draft.md', 'text/markdown'],
    ['draft-metadata.json', 'application/json'],
    ['provenance.json', 'application/json'],
  ] as const
  const entries = specifications.map(([name, mediaType]) => Object.freeze({
    name,
    mediaType,
    path: `${path}/${name}`,
    hash: hash(files[name]),
    bytes: Buffer.byteLength(files[name], 'utf8'),
  })) as unknown as readonly [BusinessOutputBundleEntry, BusinessOutputBundleEntry, BusinessOutputBundleEntry]
  const base: Omit<BusinessOutputBundle, 'manifestHash'> = Object.freeze({
    id: bundleId,
    jobId: request.run.jobId,
    attemptId: request.run.attemptId,
    agentRunId: request.run.id,
    executionPackageId: request.executionPackage.id,
    action: request.run.action as BusinessOutputBundle['action'],
    actionPolicyVersion: request.actionPolicyVersion,
    project: 'xhs',
    type: 'intermediate',
    outputVersion: XHS_OUTPUT_VERSION,
    idempotencyKey: request.run.idempotencyKey,
    path,
    entries,
    createdAt: request.completedAt,
  })
  const bundle: BusinessOutputBundle = Object.freeze({ ...base, manifestHash: xhsOutputBundleManifestHash(base) })
  assertXhsOutputBundle(bundle, files)
  return Object.freeze({ bundle, files })
}

/**
 * Validate file presence, schemas, hashes, and all cross-references.
 * @param bundle - durable bundle manifest.
 * @param files - exact bundle file bodies.
 */
export function assertXhsOutputBundle(bundle: BusinessOutputBundle, files: XhsOutputBundleFiles): void {
  const reject = (message: string): never => {
    throw new BusinessWorkbenchError('XHS_BODY_OUTPUT_INVALID', `business-workbench: ${message}`, { subjectId: bundle.id })
  }
  const persistedEntries: unknown = bundle.entries
  if (!Array.isArray(persistedEntries) || persistedEntries.length !== 3) reject('output bundle must contain exactly three files')
  const expectedNames: readonly XhsBodyPrepareOutputName[] = ['draft.md', 'draft-metadata.json', 'provenance.json']
  for (const [index, name] of expectedNames.entries()) {
    const entry = bundle.entries[index] ?? reject(`output bundle entry ${index + 1} must be '${name}'`)
    if (entry.name !== name || entry.path !== `${bundle.path}/${name}`) reject(`output bundle entry ${index + 1} must be '${name}'`)
    const content = files[name]
    if (entry.hash !== hash(content) || entry.bytes !== Buffer.byteLength(content, 'utf8')) reject(`output bundle entry '${name}' failed hash or size verification`)
  }
  parseXhsAgentDraft(JSON.stringify({ draft: files['draft.md'] }))
  let metadata: z.infer<typeof xhsDraftMetadataSchema>
  let provenance: z.infer<typeof xhsProvenanceSchema>
  try {
    metadata = xhsDraftMetadataSchema.parse(JSON.parse(files['draft-metadata.json']))
    provenance = xhsProvenanceSchema.parse(JSON.parse(files['provenance.json']))
  } catch (error) {
    throw new BusinessWorkbenchError('XHS_BODY_OUTPUT_INVALID', 'business-workbench: metadata or provenance schema validation failed', { subjectId: bundle.id }, { cause: error })
  }
  if (metadata.jobId !== bundle.jobId || metadata.attemptId !== bundle.attemptId
    || metadata.executionPackageId !== bundle.executionPackageId
    || metadata.action !== bundle.action
    || provenance.job.id !== bundle.jobId || provenance.attempt.id !== bundle.attemptId
    || provenance.executionPackage.id !== bundle.executionPackageId || provenance.agentRun.id !== bundle.agentRunId) {
    reject('metadata or provenance names another execution')
  }
  if (provenance.draftHash !== bundle.entries[0].hash || provenance.metadataHash !== bundle.entries[1].hash) reject('provenance output hashes do not match bundle entries')
  const { manifestHash, ...base } = bundle
  if (manifestHash !== xhsOutputBundleManifestHash(base)) reject('output bundle manifest hash does not match its fields')
}


/**
 * Convert verified bundle files to the public read result.
 * @param bundle - verified manifest.
 * @param files - verified file bodies.
 * @returns immutable public read result.
 */
export function outputBundleContent(
  bundle: BusinessOutputBundle,
  files: XhsOutputBundleFiles,
): BusinessOutputBundleContent {
  return Object.freeze({ bundle, files: Object.freeze({ ...files }) })
}
