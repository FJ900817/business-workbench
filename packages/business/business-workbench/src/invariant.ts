/** Package-owned invariant companion for `@deepseek-ai/dsh-business-workbench`. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import type { DomainChanged } from '@deepseek-ai/dsh-storage-domain'
import type { BusinessBatch, BusinessJob } from './types.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-business-workbench'

/** Cordis companion plugin name. */
export const name = 'business-workbench-invariant'
/** Registry required before this package can reserve its invariant ownership. */
export const inject = ['invariants']

/** Validate relationships that must hold at every durable Job publication. */
function validateJob(job: BusinessJob, fail: (message: string) => never): void {
  const active = job.attempts.filter(attempt => attempt.status === 'pending' || attempt.status === 'running')
  if (job.status === 'running') {
    if (job.currentAttempt === null || active.length !== 1 || active[0]?.id !== job.currentAttempt || active[0].status !== 'running') {
      fail(`running Job '${job.id}' does not name its one running Attempt`)
    }
    if (active[0].lease?.status !== 'active') fail(`running Job '${job.id}' does not retain an active lease`)
  } else if (job.status === 'ready' && job.currentAttempt !== null) {
    if (active.length !== 1 || active[0]?.id !== job.currentAttempt || active[0].status !== 'pending') {
      fail(`ready Job '${job.id}' does not name its pending Attempt`)
    }
  } else if (job.currentAttempt !== null || active.length !== 0) {
    fail(`non-running Job '${job.id}' retains an active Attempt`)
  }
  const attempts = new Set(job.attempts.map(attempt => attempt.id))
  for (const artifact of job.artifactRefs) {
    if (artifact.jobId !== job.id || !attempts.has(artifact.attemptId)) {
      fail(`Artifact '${artifact.artifactId}' is not related to its owning Job and Attempt`)
    }
  }
  for (const attempt of job.attempts) {
    const executionPackage = attempt.executionPackage
    if (executionPackage !== null
      && (executionPackage.jobId !== job.id || executionPackage.attemptId !== attempt.id)) {
      fail(`execution package '${executionPackage.id}' is not related to its owning Job and Attempt`)
    }
  }
}

/** Runtime relations for published Job and ready Batch records. */
const install: InvariantInstaller = Object.assign(
  (ctx: Context, fail: (message: string) => never) => {
    ctx.on('domain/changed', (change: DomainChanged) => {
      if (change.domain !== 'business_workbench' || change.operation === 'deleted') return
      if (change.table === 'jobs') {
        validateJob(change.value as BusinessJob, fail)
        return
      }
      if (change.table !== 'batches') return
      const batch = change.value as BusinessBatch
      if (batch.status !== 'ready') return
      const expectedStoredJobs = batch.mode === 'single' ? 1 : 4
      if (new Set(batch.jobIds).size !== expectedStoredJobs) {
        fail(`ready ${batch.mode} Batch '${batch.id}' does not own ${expectedStoredJobs} distinct stored Job id(s)`)
      }
      const expectedParticipants = batch.mode === 'single' ? 1 : batch.mode === 'quad' ? 4 : batch.participatingJobIds.length
      if (![1, 4].includes(expectedParticipants)
        || new Set(batch.participatingJobIds).size !== expectedParticipants
        || !batch.participatingJobIds.every(jobId => batch.jobIds.includes(jobId))) {
        fail(`ready ${batch.mode} Batch '${batch.id}' has invalid participating Job ids`)
      }
      for (const jobId of batch.jobIds) {
        const job = ctx.businessWorkbench.getJob(jobId)
        if (job === undefined || job.batchId !== batch.id) {
          fail(`ready Batch '${batch.id}' does not own declared Job '${jobId}'`)
        }
      }
    })
  },
  { inject: ['businessWorkbench'] },
)

/** Register the Business Workbench invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
