/** Derived participation facts for future Business metrics. */

import type { BusinessBatch, BusinessBatchJobIds, BusinessBatchMode } from './types.ts'

/** Counts and exact Job identities admitted to Business quality metrics. */
export interface BusinessBatchParticipation {
  readonly mode: BusinessBatchMode
  readonly expectedJobs: 1 | 4
  readonly actualJobs: 1 | 4
  readonly participatingJobIds: BusinessBatchJobIds
}

/**
 * Project one Batch onto its explicit participating Jobs.
 * @param batch - Schema-validated version-5 Batch.
 * @returns exact participant identities and closed one/four counts.
 */
export function businessBatchParticipation(batch: BusinessBatch): BusinessBatchParticipation {
  const expectedJobs = batch.mode === 'quad' ? 4 : batch.mode === 'single' ? 1 : batch.participatingJobIds.length
  return Object.freeze({
    mode: batch.mode,
    expectedJobs,
    actualJobs: batch.participatingJobIds.length,
    participatingJobIds: batch.participatingJobIds,
  })
}
