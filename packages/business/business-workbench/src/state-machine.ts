/** Closed Business Job transition rules. */

import { BusinessWorkbenchError } from './errors.ts'
import type { BusinessJobStatus } from './types.ts'

const transitions: Readonly<Record<BusinessJobStatus, readonly BusinessJobStatus[]>> = Object.freeze({
  draft: Object.freeze(['ready', 'cancelled'] as const),
  ready: Object.freeze(['running', 'cancelled'] as const),
  running: Object.freeze(['interrupted', 'completed', 'failed', 'cancelled'] as const),
  interrupted: Object.freeze(['ready', 'cancelled'] as const),
  completed: Object.freeze([] as const),
  failed: Object.freeze(['ready', 'cancelled'] as const),
  cancelled: Object.freeze([] as const),
})

/**
 * Return whether one state change belongs to the closed lifecycle.
 * @param from - Current durable Job state.
 * @param to - Requested next Job state.
 * @returns whether the transition is admitted.
 */
export function isBusinessJobTransitionAllowed(from: BusinessJobStatus, to: BusinessJobStatus): boolean {
  return transitions[from].includes(to)
}

/**
 * Reject an illegal state skip, reversal, or post-terminal mutation.
 * @param from - Current durable Job state.
 * @param to - Requested next Job state.
 */
export function assertBusinessJobTransition(from: BusinessJobStatus, to: BusinessJobStatus): void {
  if (!isBusinessJobTransitionAllowed(from, to)) {
    throw new BusinessWorkbenchError(
      'INVALID_TRANSITION',
      `business-workbench: cannot transition Job from '${from}' to '${to}'`,
    )
  }
}
