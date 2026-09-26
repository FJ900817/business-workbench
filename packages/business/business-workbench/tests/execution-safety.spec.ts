import { mkdir, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BusinessReadBoundary, type BusinessJob, type BusinessWorkbenchService } from '../src/index.ts'
import { batchRequest, setupHarness } from './helpers.ts'

const fixtures: Awaited<ReturnType<typeof setupHarness>>[] = []
const ownerId = 'phase2-owner'

afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose()))
})

async function fixture(leaseDurationMs = 60_000) {
  const value = await setupHarness(undefined, leaseDurationMs)
  fixtures.push(value)
  return value
}

async function runningJob(service: BusinessWorkbenchService): Promise<BusinessJob> {
  const batch = await service.createBatch(batchRequest())
  let job = service.listJobs(batch.id)[0]!
  job = await service.transitionJob({ jobId: job.id, expectedRevision: job.revision, idempotencyKey: 'ready', status: 'ready' })
  job = await service.createAttempt({ jobId: job.id, expectedRevision: job.revision, idempotencyKey: 'attempt' })
  return service.acquireExecutionLease({
    jobId: job.id, attemptId: job.currentAttempt!, expectedRevision: job.revision, idempotencyKey: 'lease', ownerId,
  })
}

describe('Business execution safety boundary', () => {
  it('grants one owner, renews by CAS, and requires an explicit Attempt after release', async () => {
    const { ctx } = await fixture()
    const service = ctx.businessWorkbench
    let job = await runningJob(service)
    expect(service.getExecutionStatus(job.id)).toMatchObject({ state: 'owned', ownerId })
    await expect(service.acquireExecutionLease({
      jobId: job.id, attemptId: job.currentAttempt!, expectedRevision: job.revision,
      idempotencyKey: 'competing-acquire', ownerId: 'other-owner',
    })).rejects.toMatchObject({ code: 'LEASE_CONFLICT' })
    await expect(service.renewExecutionLease({
      jobId: job.id, attemptId: job.currentAttempt!, expectedRevision: job.revision,
      idempotencyKey: 'wrong-owner-renew', ownerId: 'other-owner',
    })).rejects.toMatchObject({ code: 'LEASE_OWNER_MISMATCH' })
    job = await service.renewExecutionLease({
      jobId: job.id, attemptId: job.currentAttempt!, expectedRevision: job.revision, idempotencyKey: 'renew', ownerId,
    })
    job = await service.releaseExecutionLease({
      jobId: job.id, attemptId: job.currentAttempt!, expectedRevision: job.revision, idempotencyKey: 'release', ownerId,
    })
    expect(job).toMatchObject({ status: 'interrupted', currentAttempt: null })
    const next = await service.createAttempt({ jobId: job.id, expectedRevision: job.revision, idempotencyKey: 'attempt-2' })
    expect(next.attempts).toMatchObject([{ sequence: 1, status: 'interrupted' }, { sequence: 2, status: 'pending' }])
  })

  it('expires execution deterministically and never reports it as owned', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-29T00:00:00Z'))
    const { ctx } = await fixture(10)
    const service = ctx.businessWorkbench
    const running = await runningJob(service)
    vi.advanceTimersByTime(11)
    expect(service.getExecutionStatus(running.id)).toMatchObject({ state: 'expired' })
    await expect(service.renewExecutionLease({
      jobId: running.id, attemptId: running.currentAttempt!, expectedRevision: running.revision,
      idempotencyKey: 'late-renew', ownerId,
    })).rejects.toMatchObject({ code: 'LEASE_EXPIRED' })
    await expect(service.recoverInterruptedExecutions()).resolves.toBe(1)
    expect(service.getJob(running.id)).toMatchObject({ status: 'interrupted', statusReason: 'lease-expired' })
  })

  it('freezes only admitted xhs and shared truth inputs and rejects escape paths', async () => {
    const value = await fixture()
    const service = value.ctx.businessWorkbench
    const running = await runningJob(service)
    const base = {
      jobId: running.id,
      attemptId: running.currentAttempt!,
      expectedRevision: running.revision,
      ownerId,
      workflowVersion: 'xhs-body-v0.1',
      allowedCapabilities: ['artifact-write'],
      allowedSkills: [],
    } as const

    const deniedPaths = [
      ['../secret.md', 'PATH_INVALID'],
      ['/tmp/secret.md', 'PATH_INVALID'],
      ['gzh/current-task.md', 'READ_DENIED'],
      ['enterprise/private.md', 'READ_DENIED'],
      ['archive/old.md', 'READ_DENIED'],
      ['shared/product-truth', 'READ_DENIED'],
    ] as const
    for (const [path, code] of deniedPaths) {
      await expect(service.createExecutionPackage({ ...base, idempotencyKey: `deny-${path}`, inputs: [{ role: 'denied', path, required: true }], allowedReadRoots: [], allowedReadFiles: [path] }))
        .rejects.toMatchObject({ code })
    }
    await expect(service.createExecutionPackage({
      ...base,
      idempotencyKey: 'unlisted',
      inputs: [{ role: 'unlisted', path: 'xhs/current-task.md', required: true }],
      allowedReadRoots: [],
      allowedReadFiles: [],
    })).rejects.toMatchObject({ code: 'READ_DENIED' })

    const outside = join(value.root, 'outside.md')
    const link = join(value.root, 'business-inputs', 'xhs-source', 'rules', 'escape.md')
    await writeFile(outside, 'outside')
    await symlink(outside, link)
    await expect(service.createExecutionPackage({
      ...base,
      idempotencyKey: 'symlink-escape',
      inputs: [{ role: 'rule', path: 'xhs/rules/escape.md', required: true }],
      allowedReadRoots: ['xhs/rules'],
      allowedReadFiles: [],
    })).rejects.toMatchObject({ code: 'READ_DENIED' })

    const executionPackage = await service.createExecutionPackage({
      ...base,
      idempotencyKey: 'valid-package',
      inputs: [
        { role: 'task-card', path: 'xhs/current-task.md', required: true },
        { role: 'account-rule', path: 'xhs/rules/account.md', required: true },
        { role: 'product-truth', path: 'shared/product-truth/product.md', required: true },
      ],
      allowedReadRoots: ['xhs/rules', 'shared/product-truth'],
      allowedReadFiles: ['xhs/current-task.md'],
    })
    expect(executionPackage.inputs).toHaveLength(3)
    await expect(service.verifyExecutionPackage(running.id, running.currentAttempt!)).resolves.toEqual({
      packageId: executionPackage.id, manifestHash: executionPackage.manifestHash, inputCount: 3,
    })
    await expect(service.readExecutionInput({ jobId: running.id, attemptId: running.currentAttempt!, ownerId, path: 'xhs/current-task.md' }))
      .resolves.toMatchObject({ content: 'current task' })
    await expect(service.readExecutionInput({ jobId: running.id, attemptId: running.currentAttempt!, ownerId, path: 'xhs/not-listed.md' }))
      .rejects.toMatchObject({ code: 'READ_DENIED' })
  })

  it('fails closed when an admitted logical root has no physical mount', async () => {
    const value = await fixture()
    const xhsRoot = join(value.root, 'business-inputs', 'xhs-source')
    const boundary = new BusinessReadBoundary({ xhs: xhsRoot })
    await boundary.initialize()
    await expect(boundary.freezeInputs(
      [{ role: 'product-truth', path: 'shared/product-truth/product.md', required: true }],
      [],
      ['shared/product-truth/product.md'],
    )).rejects.toMatchObject({ code: 'READ_DENIED' })
  })

  it('reports input drift without changing the frozen package', async () => {
    const value = await fixture()
    const service = value.ctx.businessWorkbench
    const running = await runningJob(service)
    const executionPackage = await service.createExecutionPackage({
      jobId: running.id, attemptId: running.currentAttempt!, expectedRevision: running.revision,
      idempotencyKey: 'package', ownerId, workflowVersion: 'xhs-body-v0.1',
      inputs: [{ role: 'task-card', path: 'xhs/current-task.md', required: true }],
      allowedReadRoots: [], allowedReadFiles: ['xhs/current-task.md'], allowedCapabilities: [], allowedSkills: [],
    })
    await writeFile(join(value.root, 'business-inputs', 'xhs-source', 'current-task.md'), 'changed task')
    await expect(service.verifyExecutionPackage(running.id, running.currentAttempt!)).rejects.toMatchObject({ code: 'INPUT_DRIFT' })
    expect(service.getJob(running.id)!.attempts[0]!.executionPackage).toEqual(executionPackage)
  })

  it('discovers but does not mutate orphan Artifact files', async () => {
    const value = await fixture()
    const service = value.ctx.businessWorkbench
    let running = await runningJob(service)
    const artifact = await service.commitArtifact({
      jobId: running.id, attemptId: running.currentAttempt!, expectedRevision: running.revision,
      idempotencyKey: 'artifact', ownerId, type: 'intermediate', content: 'referenced',
    })
    running = service.getJob(running.id)!
    const orphanPath = join(dirname(join(service.artifactRoot, artifact.path)), `artifact_${'b'.repeat(64)}.md`)
    await mkdir(dirname(orphanPath), { recursive: true })
    await writeFile(orphanPath, 'orphan')
    const reconciliation = await service.reconcileArtifacts()
    expect(reconciliation.referencedCount).toBe(1)
    expect(reconciliation.orphanArtifacts).toEqual([expect.objectContaining({ bytes: 6 })])
    expect(service.getJob(running.id)!.artifactRefs).toEqual([artifact])
  })
})
