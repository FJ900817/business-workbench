/** Runtime constructors for Business Workbench opaque ids. */

import { createHash } from 'node:crypto'
import type {
  BusinessArtifactId as ArtifactId,
  BusinessAttemptId as AttemptId,
  BusinessBatchId as BatchId,
  BusinessJobId as JobId,
  BusinessExecutionPackageId as PackageId,
  BusinessAgentRunId as AgentRunId,
  BusinessOutputBundleId as OutputBundleId,
} from './types.ts'

/**
 * Brand a validated UUID as a Batch id.
 * @param value - UUID validated at its durable or generation boundary.
 * @returns the opaque Batch id.
 */
export const BusinessBatchId = (value: string): BatchId => value as BatchId
/**
 * Brand a validated UUID as a Job id.
 * @param value - UUID validated at its durable or generation boundary.
 * @returns the opaque Job id.
 */
export const BusinessJobId = (value: string): JobId => value as JobId
/**
 * Brand a validated UUID as an Attempt id.
 * @param value - UUID validated at its durable or generation boundary.
 * @returns the opaque Attempt id.
 */
export const BusinessAttemptId = (value: string): AttemptId => value as AttemptId
/**
 * Brand a validated immutable Artifact id.
 * @param value - Artifact id validated at its durable or derivation boundary.
 * @returns the opaque Artifact id.
 */
export const BusinessArtifactId = (value: string): ArtifactId => value as ArtifactId
/**
 * Brand a validated frozen execution-package id.
 * @param value - Package id validated at a durable or derivation boundary.
 * @returns the opaque execution-package id.
 */
export const BusinessExecutionPackageId = (value: string): PackageId => value as PackageId
/**
 * Brand a validated restricted Agent Run id.
 * @param value - Agent Run id validated at a durable or derivation boundary.
 * @returns the opaque Agent Run id.
 */
export const BusinessAgentRunId = (value: string): AgentRunId => value as AgentRunId
/**
 * Brand a validated output-bundle id.
 * @param value - Output-bundle id validated at a durable or derivation boundary.
 * @returns the opaque output-bundle id.
 */
export const BusinessOutputBundleId = (value: string): OutputBundleId => value as OutputBundleId

/**
 * Derive one retry-stable restricted Agent Run id.
 * @param jobId - Owning Job.
 * @param attemptId - Owning Attempt.
 * @param action - Host policy action.
 * @param idempotencyKey - Stable invocation key.
 * @returns the deterministic Agent Run id.
 */
export function deriveBusinessAgentRunId(
  jobId: JobId,
  attemptId: AttemptId,
  action: string,
  idempotencyKey: string,
): AgentRunId {
  const digest = createHash('sha256')
    .update(String(jobId)).update('\0')
    .update(String(attemptId)).update('\0')
    .update(action).update('\0')
    .update(idempotencyKey).digest('hex')
  return BusinessAgentRunId(`agent_run_${digest}`)
}

/**
 * Derive the sole output-bundle id for one Agent Run.
 * @param jobId - Owning Job.
 * @param attemptId - Producing Attempt.
 * @param agentRunId - Producing Agent Run.
 * @returns deterministic output-bundle id.
 */
export function deriveBusinessOutputBundleId(
  jobId: JobId,
  attemptId: AttemptId,
  agentRunId: AgentRunId,
): OutputBundleId {
  const digest = createHash('sha256')
    .update(String(jobId)).update('\0')
    .update(String(attemptId)).update('\0')
    .update(String(agentRunId)).digest('hex')
  return BusinessOutputBundleId(`output_bundle_${digest}`)
}

/**
 * Derive one retry-stable execution-package id.
 * @param jobId - Owning Job.
 * @param attemptId - Owning Attempt.
 * @param idempotencyKey - Stable package-creation key.
 * @returns the deterministic package id.
 */
export function deriveBusinessExecutionPackageId(jobId: JobId, attemptId: AttemptId, idempotencyKey: string): PackageId {
  const digest = createHash('sha256')
    .update(String(jobId)).update('\0')
    .update(String(attemptId)).update('\0')
    .update(idempotencyKey).digest('hex')
  return BusinessExecutionPackageId(`package_${digest}`)
}

/**
 * Derive one retry-stable, path-safe Artifact id from the operation identity.
 * @param jobId - Owning Job.
 * @param attemptId - Producing Attempt.
 * @param type - Artifact category.
 * @param idempotencyKey - Stable commit operation key.
 * @returns the deterministic Artifact id.
 */
export function deriveBusinessArtifactId(
  jobId: JobId,
  attemptId: AttemptId,
  type: string,
  idempotencyKey: string,
): ArtifactId {
  const digest = createHash('sha256')
    .update(String(jobId))
    .update('\0')
    .update(String(attemptId))
    .update('\0')
    .update(type)
    .update('\0')
    .update(idempotencyKey)
    .digest('hex')
  return BusinessArtifactId(`artifact_${digest}`)
}
