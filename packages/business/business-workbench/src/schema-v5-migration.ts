/** One explicit JSON-storage migration from Business Workbench schema 4 to 5. */

import { createHash, randomBytes } from 'node:crypto'
import { lstat, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import type { BusinessBatch, BusinessJob } from './types.ts'
import { BusinessBatchId, BusinessJobId } from './ids.ts'
import {
  businessBatchSchema,
  businessInputReferenceSchema,
  businessJobSchema,
  BUSINESS_WORKBENCH_SCHEMA_VERSION,
} from './spec.ts'

const revisionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const timestampSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const batchIdSchema = z.uuid().transform(BusinessBatchId)
const jobIdSchema = z.uuid().transform(BusinessJobId)

const v4BatchSchema = z.object({
  id: batchIdSchema,
  project: z.literal('xhs'),
  type: z.literal('xhs-body'),
  status: z.enum(['creating', 'ready']),
  jobIds: z.tuple([jobIdSchema, jobIdSchema, jobIdSchema, jobIdSchema]),
  inputs: z.tuple([
    businessInputReferenceSchema,
    businessInputReferenceSchema,
    businessInputReferenceSchema,
    businessInputReferenceSchema,
  ]),
  revision: revisionSchema,
  createKey: z.string().min(1),
  createFingerprint: sha256Schema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).strict()

const v4DocumentSchema = z.object({
  unit: z.object({ name: z.literal('business_workbench'), version: z.literal(4) }).strict(),
  global: z.null(),
  tables: z.object({
    batches: z.record(z.string(), v4BatchSchema),
    jobs: z.record(z.string(), businessJobSchema),
  }).strict(),
}).strict()

const v5DocumentSchema = z.object({
  unit: z.object({ name: z.literal('business_workbench'), version: z.literal(5) }).strict(),
  global: z.null(),
  tables: z.object({
    batches: z.record(z.string(), businessBatchSchema),
    jobs: z.record(z.string(), businessJobSchema),
  }).strict(),
}).strict()

interface MigrationDocument {
  readonly unit: { readonly name: 'business_workbench'; readonly version: 5 }
  readonly global: null
  readonly tables: {
    readonly batches: Readonly<Record<string, BusinessBatch>>
    readonly jobs: Readonly<Record<string, BusinessJob>>
  }
}

/** Non-sensitive counts and hashes emitted by the one supported migration. */
export interface BusinessWorkbenchV4MigrationResult {
  readonly status: 'migrated' | 'already-current'
  readonly sourceHash: string
  readonly targetHash: string
  readonly batches: number
  readonly jobs: number
  readonly attempts: number
  readonly artifacts: number
  readonly participantCounts: readonly (1 | 4)[]
}

/** Explicit file migration arguments; the caller must create and verify a recovery point first. */
export interface BusinessWorkbenchV4MigrationOptions {
  readonly storagePath: string
  readonly expectedSourceHash: string
}

/** Package-internal writer substitution used to prove failed publication preserves V4 bytes. */
export interface BusinessWorkbenchV4MigrationInternals {
  readonly writeFileAtomic: typeof writeFileAtomically
}

interface PlannedMigration extends BusinessWorkbenchV4MigrationResult {
  readonly content: string
}

/** Remove the rendered storage bytes from the operator-visible result. */
function publicResult(planned: PlannedMigration): BusinessWorkbenchV4MigrationResult {
  return Object.freeze({
    status: planned.status,
    sourceHash: planned.sourceHash,
    targetHash: planned.targetHash,
    batches: planned.batches,
    jobs: planned.jobs,
    attempts: planned.attempts,
    artifacts: planned.artifacts,
    participantCounts: planned.participantCounts,
  })
}

/** Hash raw storage bytes without parsing or normalizing them. */
function sha256(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex')
}

/** Atomically replace one existing owner-private storage file through a random exclusive sibling. */
async function writeFileAtomically(filename: string, content: string, options: { readonly mode: number }): Promise<void> {
  const temporary = `${filename}.${randomBytes(6).toString('hex')}.tmp`
  try {
    await writeFile(temporary, content, { mode: options.mode, flag: 'wx' })
    await rename(temporary, filename)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

/** Whether one V4 Job has durable evidence that it participated in execution. */
function hasParticipationEvidence(job: BusinessJob): boolean {
  return job.status !== 'draft'
    || job.revision !== 0
    || job.currentAttempt !== null
    || job.attempts.length !== 0
    || job.artifactRefs.length !== 0
    || job.operations.length !== 0
    || job.statusReason !== undefined
}

/** Reject a V4 graph whose participant set cannot be established without guessing. */
function migrateV4Document(document: z.infer<typeof v4DocumentSchema>): MigrationDocument {
  const ownedJobs = new Set<string>()
  const batches: Record<string, BusinessBatch> = {}
  for (const [key, batch] of Object.entries(document.tables.batches)) {
    if (batch.id !== key) throw new Error(`business-workbench migration: Batch key '${key}' does not match its id`)
    const jobs = batch.jobIds.map((jobId, index) => {
      const job = document.tables.jobs[jobId]
      const input = batch.inputs[index]
      if (job === undefined || input === undefined || job.id !== jobId || job.batchId !== batch.id) {
        throw new Error(`business-workbench migration: Batch '${batch.id}' has an invalid Job relationship`)
      }
      if (job.input.reference !== input.reference || job.input.sha256 !== input.sha256) {
        throw new Error(`business-workbench migration: Batch '${batch.id}' and Job '${jobId}' disagree on input identity`)
      }
      ownedJobs.add(jobId)
      return job
    })
    const participants = jobs.filter(hasParticipationEvidence).map(job => job.id)
    if (participants.length !== 1 && participants.length !== 4) {
      throw new Error(`business-workbench migration: Batch '${batch.id}' has ambiguous participant count ${participants.length}`)
    }
    const participatingJobIds: BusinessBatch['participatingJobIds'] = (() => {
      const [first, second, third, fourth] = participants
      if (participants.length === 1 && first !== undefined) return [first]
      if (participants.length === 4 && first !== undefined && second !== undefined && third !== undefined && fourth !== undefined) {
        return [first, second, third, fourth]
      }
      throw new Error(`business-workbench migration: Batch '${batch.id}' has an invalid participant set`)
    })()
    batches[key] = {
      ...batch,
      mode: 'legacy-fixed4',
      jobIds: batch.jobIds,
      participatingJobIds,
      inputs: batch.inputs,
    }
  }
  for (const [key, job] of Object.entries(document.tables.jobs)) {
    if (job.id !== key) throw new Error(`business-workbench migration: Job key '${key}' does not match its id`)
    if (!ownedJobs.has(key)) throw new Error(`business-workbench migration: Job '${key}' has no owning V4 Batch`)
  }
  const migrated: MigrationDocument = {
    unit: { name: 'business_workbench', version: BUSINESS_WORKBENCH_SCHEMA_VERSION },
    global: null,
    tables: { batches, jobs: document.tables.jobs },
  }
  return v5DocumentSchema.parse(migrated)
}

/** Compute counts shared by migrated and already-current result reports. */
function summarize(
  document: MigrationDocument,
  status: BusinessWorkbenchV4MigrationResult['status'],
  sourceHash: string,
  targetHash: string,
): BusinessWorkbenchV4MigrationResult {
  const jobs = Object.values(document.tables.jobs)
  return Object.freeze({
    status,
    sourceHash,
    targetHash,
    batches: Object.keys(document.tables.batches).length,
    jobs: jobs.length,
    attempts: jobs.reduce((total, job) => total + job.attempts.length, 0),
    artifacts: jobs.reduce((total, job) => total + job.artifactRefs.length, 0),
    participantCounts: Object.freeze(Object.values(document.tables.batches)
      .map(batch => batch.participatingJobIds.length)),
  })
}

/**
 * Parse and render either the sole V4→V5 upgrade or an unchanged valid V5 file.
 * @param content - Complete JSON storage text to validate and plan.
 * @returns rendered bytes plus content-free migration counts and hashes.
 */
export function planBusinessWorkbenchV4Migration(content: string): PlannedMigration {
  let raw: unknown
  try {
    raw = JSON.parse(content)
  } catch (error) {
    throw new Error('business-workbench migration: storage is not valid JSON', { cause: error })
  }
  const version = (raw as { unit?: { version?: unknown } } | null)?.unit?.version
  const sourceHash = sha256(content)
  if (version === 5) {
    const current = v5DocumentSchema.parse(raw) as MigrationDocument
    return Object.freeze({ ...summarize(current, 'already-current', sourceHash, sourceHash), content })
  }
  if (version !== 4) throw new Error(`business-workbench migration: stored schema ${String(version)} is unsupported`)
  const migrated = migrateV4Document(v4DocumentSchema.parse(raw))
  const nextContent = `${JSON.stringify(migrated, null, 2)}\n`
  return Object.freeze({ ...summarize(migrated, 'migrated', sourceHash, sha256(nextContent)), content: nextContent })
}

/**
 * Atomically migrate one explicitly named JSON storage file after hash confirmation.
 * @param options - Exact storage path and recovery-manifest source hash.
 * @param internals - Package-internal writer override for failure tests.
 * @returns non-sensitive migration counts and before/after hashes.
 */
export async function migrateBusinessWorkbenchV4JsonFile(
  options: BusinessWorkbenchV4MigrationOptions,
  internals: BusinessWorkbenchV4MigrationInternals = { writeFileAtomic: writeFileAtomically },
): Promise<BusinessWorkbenchV4MigrationResult> {
  if (!/^[a-f0-9]{64}$/u.test(options.expectedSourceHash)) {
    throw new Error('business-workbench migration: expectedSourceHash must be SHA-256')
  }
  const file = await lstat(options.storagePath)
  if (!file.isFile() || file.isSymbolicLink()) throw new Error('business-workbench migration: storage path must be a regular non-symlink file')
  const original = await readFile(options.storagePath, 'utf8')
  const planned = planBusinessWorkbenchV4Migration(original)
  if (planned.sourceHash !== options.expectedSourceHash) {
    throw new Error(`business-workbench migration: source hash changed from approved ${options.expectedSourceHash}`)
  }
  if (planned.status === 'already-current') return publicResult(planned)
  const beforeCommit = await readFile(options.storagePath)
  if (sha256(beforeCommit) !== planned.sourceHash) throw new Error('business-workbench migration: source changed before atomic publication')
  await internals.writeFileAtomic(options.storagePath, planned.content, { mode: file.mode & 0o777 })
  const committed = await readFile(options.storagePath, 'utf8')
  if (sha256(committed) !== planned.targetHash) throw new Error('business-workbench migration: committed V5 hash does not match the plan')
  planBusinessWorkbenchV4Migration(committed)
  return publicResult(planned)
}
