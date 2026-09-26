import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { businessBatchParticipation } from '../src/index.ts'
import {
  migrateBusinessWorkbenchV4JsonFile,
  planBusinessWorkbenchV4Migration,
} from '../src/schema-v5-migration.ts'
import { batchRequest, setupHarness } from './helpers.ts'

const roots: string[] = []
const ownerId = 'schema-v5-migration-owner'

interface StoredBatchRecord extends Record<string, unknown> {
  readonly id: string
  readonly jobIds: string[]
}

interface StoredJobRecord extends Record<string, unknown> {
  revision: number
  status: string
}

interface StoredDocument {
  readonly unit: { version: number }
  readonly tables: {
    readonly batches: Record<string, StoredBatchRecord>
    readonly jobs: Record<string, StoredJobRecord>
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function sha256(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex')
}

async function v4Fixture(): Promise<{
  readonly root: string
  readonly storagePath: string
  readonly v4Text: string
  readonly v4Document: StoredDocument
  readonly batchId: string
  readonly participantJobId: string
}> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-business-schema-v4-fixture-'))
  roots.push(root)
  const harness = await setupHarness(root)
  const service = harness.ctx.businessWorkbench
  const batch = await service.createBatch(batchRequest('legacy-v4-batch'))
  let job = service.listJobs(batch.id)[0]!
  job = await service.transitionJob({ jobId: job.id, expectedRevision: job.revision, idempotencyKey: 'ready', status: 'ready' })
  job = await service.createAttempt({ jobId: job.id, expectedRevision: job.revision, idempotencyKey: 'attempt' })
  job = await service.acquireExecutionLease({
    jobId: job.id,
    attemptId: job.currentAttempt!,
    expectedRevision: job.revision,
    idempotencyKey: 'lease',
    ownerId,
  })
  await service.commitArtifact({
    jobId: job.id,
    attemptId: job.currentAttempt!,
    expectedRevision: job.revision,
    idempotencyKey: 'artifact',
    ownerId,
    type: 'intermediate',
    content: 'legacy artifact bytes',
  })
  const afterArtifact = service.getJob(job.id)!
  await service.completeAttempt({
    jobId: job.id,
    attemptId: job.currentAttempt!,
    expectedRevision: afterArtifact.revision,
    idempotencyKey: 'fail',
    ownerId,
    outcome: 'failed',
    reason: 'historical fixture failure',
  })
  await harness.dispose(false)

  const storagePath = join(root, 'storages', 'business_workbench.json')
  const v5 = JSON.parse(await readFile(storagePath, 'utf8')) as StoredDocument
  v5.unit.version = 4
  for (const stored of Object.values(v5.tables.batches)) {
    Reflect.deleteProperty(stored, 'mode')
    Reflect.deleteProperty(stored, 'participatingJobIds')
  }
  const v4Text = `${JSON.stringify(v5, null, 2)}\n`
  await writeFile(storagePath, v4Text)
  return { root, storagePath, v4Text, v4Document: v5, batchId: batch.id, participantJobId: job.id }
}

describe('Business Workbench V4 to V5 migration', () => {
  it('preserves the complete legacy graph, marks one participant, reopens, and repeats idempotently', async () => {
    const fixture = await v4Fixture()
    const sourceHash = sha256(fixture.v4Text)
    const result = await migrateBusinessWorkbenchV4JsonFile({
      storagePath: fixture.storagePath,
      expectedSourceHash: sourceHash,
    })
    expect(result).toMatchObject({
      status: 'migrated', sourceHash, batches: 1, jobs: 4, attempts: 1, artifacts: 1, participantCounts: [1],
    })
    expect(result).not.toHaveProperty('content')
    const v5Text = await readFile(fixture.storagePath, 'utf8')
    const v5 = JSON.parse(v5Text) as StoredDocument
    expect(v5.unit.version).toBe(5)
    expect(v5.tables.jobs).toEqual(fixture.v4Document.tables.jobs)
    const migratedBatch = v5.tables.batches[fixture.batchId]
    if (migratedBatch === undefined) throw new Error('migrated fixture Batch is missing')
    const { mode: _mode, participatingJobIds: _participants, ...historicalBatch } = migratedBatch
    expect(historicalBatch).toEqual(fixture.v4Document.tables.batches[fixture.batchId])
    expect(migratedBatch).toMatchObject({ mode: 'legacy-fixed4', participatingJobIds: [fixture.participantJobId] })

    const reopened = await setupHarness(fixture.root)
    try {
      const batch = reopened.ctx.businessWorkbench.getBatch(fixture.batchId as never)!
      expect(businessBatchParticipation(batch)).toMatchObject({
        mode: 'legacy-fixed4', expectedJobs: 1, actualJobs: 1, participatingJobIds: [fixture.participantJobId],
      })
      expect(reopened.ctx.businessWorkbench.listJobs(batch.id)).toHaveLength(4)
      const participant = reopened.ctx.businessWorkbench.getJob(fixture.participantJobId as never)!
      expect(participant).toMatchObject({ status: 'failed', revision: 5 })
      expect(participant.attempts).toHaveLength(1)
      expect(participant.artifactRefs).toHaveLength(1)
      await expect(reopened.ctx.businessWorkbench.verifyArtifacts(participant.id)).resolves.toHaveLength(1)
    } finally {
      await reopened.dispose(false)
    }

    const repeated = await migrateBusinessWorkbenchV4JsonFile({
      storagePath: fixture.storagePath,
      expectedSourceHash: result.targetHash,
    })
    expect(repeated).toMatchObject({ status: 'already-current', sourceHash: result.targetHash, targetHash: result.targetHash })
    expect(repeated).not.toHaveProperty('content')
    expect(await readFile(fixture.storagePath, 'utf8')).toBe(v5Text)
  })

  it('rejects ambiguous or unsupported input without rendering a migration', async () => {
    const fixture = await v4Fixture()
    const ambiguous = structuredClone(fixture.v4Document)
    const ambiguousBatch = ambiguous.tables.batches[fixture.batchId]
    if (ambiguousBatch === undefined) throw new Error('ambiguous fixture Batch is missing')
    const secondJobId = ambiguousBatch.jobIds[1]
    const secondJob = secondJobId === undefined ? undefined : ambiguous.tables.jobs[secondJobId]
    if (secondJob === undefined) throw new Error('test fixture requires a second Job')
    secondJob.status = 'ready'
    secondJob.revision = 1
    await expect(Promise.resolve().then(() => planBusinessWorkbenchV4Migration(`${JSON.stringify(ambiguous)}\n`)))
      .rejects.toThrow(/ambiguous participant count 2/)
    const unsupported = structuredClone(fixture.v4Document)
    unsupported.unit.version = 3
    expect(() => planBusinessWorkbenchV4Migration(`${JSON.stringify(unsupported)}\n`)).toThrow(/schema 3 is unsupported/)
  })

  it('leaves the exact V4 bytes in place when atomic publication fails', async () => {
    const fixture = await v4Fixture()
    const failure = new Error('injected publication failure')
    const writeFileAtomic = vi.fn().mockRejectedValue(failure)
    await expect(migrateBusinessWorkbenchV4JsonFile({
      storagePath: fixture.storagePath,
      expectedSourceHash: sha256(fixture.v4Text),
    }, { writeFileAtomic })).rejects.toBe(failure)
    expect(writeFileAtomic).toHaveBeenCalledOnce()
    expect(await readFile(fixture.storagePath, 'utf8')).toBe(fixture.v4Text)
  })

  it('rejects an unmigrated V4 file at V5 open without changing it', async () => {
    const fixture = await v4Fixture()
    await expect(setupHarness(fixture.root)).rejects.toMatchObject({ code: 'version-mismatch' })
    expect(await readFile(fixture.storagePath, 'utf8')).toBe(fixture.v4Text)
  })
})
