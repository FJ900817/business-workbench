import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import { describe, expect, it } from 'vitest'
import BusinessWorkbenchService, { XHS_PROJECT_RELATIVE_PATH } from '../src/index.ts'
import { batchRequest } from './helpers.ts'

const vaultRoot = process.env.DSH_BUSINESS_XHS_PRODUCTION_VAULT ?? ''
const enabled = process.env.DSH_BUSINESS_REAL_SOURCE_SMOKE === '1' && existsSync(vaultRoot)

describe.skipIf(!enabled)('XHS production source dry run', () => {
  it('builds and verifies one real package without starting an Agent or committing an Artifact', { retry: 0 }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-business-real-source-'))
    const ctx = new Context()
    try {
      await ctx.plugin(Storage)
      await ctx.plugin(StorageJson, { root: join(root, 'storages') })
      await ctx.plugin(StorageDomain, { backend: 'json' })
      await ctx.plugin(BusinessWorkbenchService, {
        dshHome: root,
        readRoots: { xhs: join(vaultRoot, XHS_PROJECT_RELATIVE_PATH) },
        xhsProductionSource: { vaultRoot },
        leaseDurationMs: 60_000,
      })
      const service = ctx.businessWorkbench
      const batch = await service.createBatch(batchRequest('real-production-source-dry-run'))
      let job = service.listJobs(batch.id)[0]!
      job = await service.transitionJob({ jobId: job.id, expectedRevision: job.revision, idempotencyKey: 'ready', status: 'ready' })
      job = await service.createAttempt({ jobId: job.id, expectedRevision: job.revision, idempotencyKey: 'attempt' })
      job = await service.acquireExecutionLease({
        jobId: job.id, attemptId: job.currentAttempt!, expectedRevision: job.revision,
        idempotencyKey: 'lease', ownerId: 'phase4c0-real-source',
      })
      const result = await service.createXhsProductionExecutionPackage({
        jobId: job.id,
        attemptId: job.currentAttempt!,
        expectedRevision: job.revision,
        idempotencyKey: 'package',
        ownerId: 'phase4c0-real-source',
        identity: { account: 'account1', productionMonth: '2026-08', productionWeek: '第01周', note: 'note002' },
      })
      await expect(service.verifyExecutionPackage(job.id, job.currentAttempt!)).resolves.toMatchObject({ inputCount: 3 })
      expect(result.sourceManifest.inputs.map(input => input.role)).toEqual(['taskCard', 'writingRule', 'goldenSample'])
      expect(result.sourceManifest.skillSource).toMatchObject({ account: 'account1', logicalSkillId: 'xhs-s3-account1' })
      expect(service.getJob(job.id)?.artifactRefs).toEqual([])
      expect(service.getJob(job.id)?.attempts[0]?.agentRuns).toEqual([])
      expect(service.getJob(job.id)?.attempts[0]?.outputBundle).toBeNull()
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })
})
