import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { businessBatchParticipation } from '../src/index.ts'
import type { BusinessJob } from '../src/index.ts'
import { batchRequest, input, setupHarness, singleBatchRequest } from './helpers.ts'

const harnesses: Awaited<ReturnType<typeof setupHarness>>[] = []
const ownerId = 'phase2-test-owner'

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map(harness => harness.dispose()))
})

async function harness() {
  const value = await setupHarness()
  harnesses.push(value)
  return value
}

async function readyJob(service: ReturnType<typeof serviceOf>, job: BusinessJob, key: string) {
  return service.transitionJob({
    jobId: job.id,
    expectedRevision: job.revision,
    idempotencyKey: key,
    status: 'ready',
  })
}

function serviceOf(harness: Awaited<ReturnType<typeof setupHarness>>) {
  return harness.ctx.businessWorkbench
}

describe('BusinessWorkbenchService', () => {
  it('creates one idempotent Batch with exactly four isolated Jobs', async () => {
    const fixture = await harness()
    const service = serviceOf(fixture)
    const batch = await service.createBatch(batchRequest())
    const repeated = await service.createBatch(batchRequest())
    expect(repeated).toEqual(batch)
    expect(batch.status).toBe('ready')
    expect(batch.mode).toBe('quad')
    expect(batch.jobIds).toHaveLength(4)
    expect(batch.participatingJobIds).toEqual(batch.jobIds)
    expect(businessBatchParticipation(batch)).toMatchObject({ expectedJobs: 4, actualJobs: 4 })
    expect(new Set(batch.jobIds).size).toBe(4)
    expect(service.listJobs(batch.id)).toMatchObject([
      { id: batch.jobIds[0], status: 'draft', revision: 0 },
      { id: batch.jobIds[1], status: 'draft', revision: 0 },
      { id: batch.jobIds[2], status: 'draft', revision: 0 },
      { id: batch.jobIds[3], status: 'draft', revision: 0 },
    ])
    await expect(service.createBatch({
      ...batchRequest(),
      inputs: [input(9), input(2), input(3), input(4)],
    })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  })

  it('creates one idempotent single Batch with exactly one participating Job', async () => {
    const fixture = await harness()
    const service = serviceOf(fixture)
    const batch = await service.createBatch(singleBatchRequest())
    expect(await service.createBatch(singleBatchRequest())).toEqual(batch)
    expect(batch).toMatchObject({ mode: 'single', status: 'ready' })
    expect(batch.jobIds).toHaveLength(1)
    expect(batch.participatingJobIds).toEqual(batch.jobIds)
    expect(service.listJobs(batch.id)).toMatchObject([{ id: batch.jobIds[0], status: 'draft', revision: 0 }])
    expect(businessBatchParticipation(batch)).toEqual({
      mode: 'single', expectedJobs: 1, actualJobs: 1, participatingJobIds: batch.jobIds,
    })
  })

  it('keeps four Job states, Attempts, and Artifacts independent when one fails', async () => {
    const fixture = await harness()
    const service = serviceOf(fixture)
    const batch = await service.createBatch(batchRequest())
    const initial = service.listJobs(batch.id)

    const job1 = await readyJob(service, initial[0]!, 'job1-ready')
    const job2Ready = await readyJob(service, initial[1]!, 'job2-ready')
    const job2Pending = await service.createAttempt({
      jobId: job2Ready.id, expectedRevision: job2Ready.revision, idempotencyKey: 'job2-attempt',
    })
    const job2Running = await service.acquireExecutionLease({
      jobId: job2Pending.id, attemptId: job2Pending.currentAttempt!, expectedRevision: job2Pending.revision,
      idempotencyKey: 'job2-lease', ownerId,
    })
    const job2Artifact = await service.commitArtifact({
      jobId: job2Running.id,
      attemptId: job2Running.currentAttempt!,
      expectedRevision: job2Running.revision,
      idempotencyKey: 'job2-artifact',
      ownerId,
      type: 'intermediate',
      content: 'Job 2 draft',
    })

    const job3Ready = await readyJob(service, initial[2]!, 'job3-ready')
    const job3Pending = await service.createAttempt({
      jobId: job3Ready.id, expectedRevision: job3Ready.revision, idempotencyKey: 'job3-attempt',
    })
    const job3Running = await service.acquireExecutionLease({
      jobId: job3Pending.id, attemptId: job3Pending.currentAttempt!, expectedRevision: job3Pending.revision,
      idempotencyKey: 'job3-lease', ownerId,
    })
    const job3Failed = await service.completeAttempt({
      jobId: job3Running.id,
      attemptId: job3Running.currentAttempt!,
      expectedRevision: job3Running.revision,
      idempotencyKey: 'job3-fail',
      ownerId,
      outcome: 'failed',
      reason: 'isolated failure',
    })

    const job4Ready = await readyJob(service, initial[3]!, 'job4-ready')
    const job4Pending = await service.createAttempt({
      jobId: job4Ready.id, expectedRevision: job4Ready.revision, idempotencyKey: 'job4-attempt',
    })
    const job4Running = await service.acquireExecutionLease({
      jobId: job4Pending.id, attemptId: job4Pending.currentAttempt!, expectedRevision: job4Pending.revision,
      idempotencyKey: 'job4-lease', ownerId,
    })
    const job4Completed = await service.completeAttempt({
      jobId: job4Running.id,
      attemptId: job4Running.currentAttempt!,
      expectedRevision: job4Running.revision,
      idempotencyKey: 'job4-complete',
      ownerId,
      outcome: 'completed',
    })

    const after = service.listJobs(batch.id)
    expect(after[0]).toEqual(job1)
    expect(after[0]!.artifactRefs).toEqual([])
    expect(after[1]!.artifactRefs).toEqual([job2Artifact])
    expect(after[2]).toEqual(job3Failed)
    expect(after[2]!.status).toBe('failed')
    expect(after[3]).toEqual(job4Completed)
    expect(after[3]!.status).toBe('completed')
    expect(service.getBatch(batch.id)).toEqual(batch)
  })

  it('enforces CAS before mutation and rejects invalid state changes', async () => {
    const fixture = await harness()
    const service = serviceOf(fixture)
    const batch = await service.createBatch(batchRequest())
    const job = service.listJobs(batch.id)[0]!
    const ready = await readyJob(service, job, 'ready')

    await expect(service.transitionJob({
      jobId: job.id,
      expectedRevision: job.revision,
      idempotencyKey: 'stale-cancel',
      status: 'cancelled',
    })).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
      detail: { currentRevision: ready.revision },
    })
    await expect(service.transitionJob({
      jobId: job.id,
      expectedRevision: ready.revision,
      idempotencyKey: 'skip-complete',
      status: 'completed',
    })).rejects.toMatchObject({ code: 'INVALID_OPERATION' })
    expect(service.getJob(job.id)).toEqual(ready)
  })

  it('retains Attempt history and makes start, Artifact, and completion retries idempotent', async () => {
    const fixture = await harness()
    const service = serviceOf(fixture)
    const batch = await service.createBatch(batchRequest())
    let job = await readyJob(service, service.listJobs(batch.id)[0]!, 'ready-1')
    job = await service.createAttempt({
      jobId: job.id, expectedRevision: job.revision, idempotencyKey: 'attempt-1',
    })
    const repeatedStart = await service.createAttempt({
      jobId: job.id, expectedRevision: job.revision - 1, idempotencyKey: 'attempt-1',
    })
    expect(repeatedStart).toEqual(job)
    job = await service.acquireExecutionLease({
      jobId: job.id, attemptId: job.currentAttempt!, expectedRevision: job.revision,
      idempotencyKey: 'lease-1', ownerId,
    })

    const artifact = await service.commitArtifact({
      jobId: job.id,
      attemptId: job.currentAttempt!,
      expectedRevision: job.revision,
      idempotencyKey: 'artifact-1',
      ownerId,
      type: 'intermediate',
      content: 'stable artifact',
    })
    const afterArtifact = service.getJob(job.id)!
    const repeatedArtifact = await service.commitArtifact({
      jobId: job.id,
      attemptId: job.currentAttempt!,
      expectedRevision: job.revision,
      idempotencyKey: 'artifact-1',
      ownerId,
      type: 'intermediate',
      content: 'stable artifact',
    })
    const deduplicatedArtifact = await service.commitArtifact({
      jobId: job.id,
      attemptId: job.currentAttempt!,
      expectedRevision: job.revision,
      idempotencyKey: 'artifact-same-content-other-key',
      ownerId,
      type: 'intermediate',
      content: 'stable artifact',
    })
    expect(repeatedArtifact).toEqual(artifact)
    expect(deduplicatedArtifact).toEqual(artifact)
    expect(service.getJob(job.id)).toEqual(afterArtifact)
    await expect(service.commitArtifact({
      jobId: job.id,
      attemptId: job.currentAttempt!,
      expectedRevision: afterArtifact.revision,
      idempotencyKey: 'artifact-1',
      ownerId,
      type: 'intermediate',
      content: 'different artifact',
    })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })

    job = await service.completeAttempt({
      jobId: job.id,
      attemptId: job.currentAttempt!,
      expectedRevision: afterArtifact.revision,
      idempotencyKey: 'complete-1',
      ownerId,
      outcome: 'failed',
      reason: 'retryable',
    })
    const repeatedComplete = await service.completeAttempt({
      jobId: job.id,
      attemptId: job.attempts[0]!.id,
      expectedRevision: job.revision - 1,
      idempotencyKey: 'complete-1-retry-with-new-key',
      ownerId,
      outcome: 'failed',
      reason: 'retryable',
    })
    expect(repeatedComplete).toEqual(job)
    job = await service.transitionJob({
      jobId: job.id,
      expectedRevision: job.revision,
      idempotencyKey: 'ready-2',
      status: 'ready',
    })
    job = await service.createAttempt({
      jobId: job.id, expectedRevision: job.revision, idempotencyKey: 'attempt-2',
    })
    job = await service.acquireExecutionLease({
      jobId: job.id, attemptId: job.currentAttempt!, expectedRevision: job.revision,
      idempotencyKey: 'lease-2', ownerId,
    })
    expect(job.attempts).toMatchObject([
      { sequence: 1, status: 'failed' },
      { sequence: 2, status: 'running' },
    ])
  })

  it('publishes owner-private verified files atomically and fails on later corruption', async () => {
    const fixture = await harness()
    const service = serviceOf(fixture)
    const batch = await service.createBatch(batchRequest())
    let job = await readyJob(service, service.listJobs(batch.id)[0]!, 'ready')
    job = await service.createAttempt({
      jobId: job.id, expectedRevision: job.revision, idempotencyKey: 'attempt',
    })
    job = await service.acquireExecutionLease({
      jobId: job.id, attemptId: job.currentAttempt!, expectedRevision: job.revision,
      idempotencyKey: 'lease', ownerId,
    })
    const artifact = await service.commitArtifact({
      jobId: job.id,
      attemptId: job.currentAttempt!,
      expectedRevision: job.revision,
      idempotencyKey: 'artifact',
      ownerId,
      type: 'final',
      content: '完整正文',
    })
    await expect(service.getArtifact(artifact.artifactId)).resolves.toEqual({
      artifact,
      content: '完整正文',
    })
    await expect(service.verifyArtifacts(job.id)).resolves.toEqual([{
      artifactId: artifact.artifactId,
      hash: artifact.hash,
      bytes: artifact.bytes,
    }])
    expect(await readdir(join(service.artifactRoot, 'tmp'))).toEqual(['output-bundles'])

    await writeFile(join(service.artifactRoot, artifact.path), 'corrupt')
    await expect(service.verifyArtifacts(job.id)).rejects.toMatchObject({ code: 'ARTIFACT_CORRUPT' })
    expect(await readFile(join(fixture.root, 'storages', 'business_workbench.json'), 'utf8'))
      .toContain(artifact.hash)
  })
})
