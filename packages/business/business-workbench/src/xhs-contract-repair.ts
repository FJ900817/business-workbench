/** Closed eligibility and scope derivation for one XHS deterministic-contract repair. */

import { BusinessWorkbenchError } from './errors.ts'
import type { BusinessArtifact, BusinessAttempt, XhsContractRepairField, XhsReviewArtifactDocument, XhsSecondPassPreflight } from './types.ts'
import type { XhsHardValidationResult } from './xhs-hard-contract.ts'

/** Derive the only fields a Contract Repair may change from deterministic failure evidence.
 * @param result - Verified hard-validation result for the exact source Candidate.
 * @returns Closed failed-item and repair-field lists.
 */
export function deriveXhsContractRepairScope(result: XhsHardValidationResult): Readonly<{
  failedContractItems: readonly string[]
  repairedFields: readonly XhsContractRepairField[]
}> {
  if (result.format.status !== 'PASS' || result.failureClass !== 'HARD_CONTRACT_FAIL' || result.hardContractStatus !== 'FAIL') {
    throw new BusinessWorkbenchError('XHS_CONTRACT_REPAIR_NOT_ALLOWED', 'business-workbench: Contract Repair requires a structurally complete hard-contract failure')
  }
  const failedContractItems: string[] = []
  const repairedFields = new Set<XhsContractRepairField>()
  if (result.checks.titleRange.status === 'FAIL') {
    failedContractItems.push('titleRange')
    repairedFields.add('title-length')
  }
  if (result.checks.bodyRange.status === 'FAIL') {
    failedContractItems.push('bodyRange')
    repairedFields.add('body-length')
  }
  if (result.checks.pinnedComments.status === 'FAIL' || result.checks.unpinnedComments.status === 'FAIL') {
    throw new BusinessWorkbenchError('XHS_CONTRACT_REPAIR_NOT_ALLOWED', 'business-workbench: comment changes require business Revision')
  }
  if (result.checks.topics.status === 'FAIL') {
    const topics = result.checks.topics
    const sameTruth = topics.actual_topics !== null
      && topics.actual_topics.length === topics.expected_topics.length
      && topics.duplicate_topics.length === 0
      && topics.missing_topics.length === 0
      && topics.unexpected_topics.length === 0
    if (!sameTruth) {
      throw new BusinessWorkbenchError('XHS_CONTRACT_REPAIR_NOT_ALLOWED', 'business-workbench: allowed_topics truth changes require business Review')
    }
    failedContractItems.push('topics.order')
    repairedFields.add('allowed-topics-formatting')
  }
  for (const keyword of result.keywordEvidence) {
    if (!keyword.minimumOccurrencesPass) {
      failedContractItems.push(`keyword:${keyword.keyword}:occurrences`)
      repairedFields.add('keyword-occurrences')
    }
    if (keyword.titleRequirementPass === false) {
      failedContractItems.push(`keyword:${keyword.keyword}:title`)
      repairedFields.add('keyword-title-position')
    }
  }
  if (result.facts.modelDeclaredTitleCharacters !== null
    && result.facts.actualTitleCharacters !== result.facts.modelDeclaredTitleCharacters) {
    failedContractItems.push('metadata.titleCharacters')
    repairedFields.add('declared-title-characters')
  }
  if (result.facts.modelDeclaredBodyCharacters !== null
    && result.facts.actualBodyCharacters !== result.facts.modelDeclaredBodyCharacters) {
    failedContractItems.push('metadata.bodyCharacters')
    repairedFields.add('declared-body-characters')
  }
  if (failedContractItems.length === 0 || repairedFields.size === 0) {
    throw new BusinessWorkbenchError('XHS_CONTRACT_REPAIR_NOT_ALLOWED', 'business-workbench: hard failure has no admitted Contract Repair field')
  }
  return Object.freeze({
    failedContractItems: Object.freeze(failedContractItems),
    repairedFields: Object.freeze([...repairedFields]),
  })
}

/** Enforce one Contract Repair per exact source Candidate.
 * @param existingRepairs - Existing repair packages that name the Candidate.
 * @returns Nothing when the one-repair allowance remains available.
 */
export function assertXhsContractRepairAvailable(existingRepairs: number): void {
  if (existingRepairs >= 1) {
    throw new BusinessWorkbenchError('XHS_CONTRACT_REPAIR_LIMIT_REACHED', 'business-workbench: source Candidate already has its one admitted Contract Repair')
  }
}

/**
 * Determine whether an Attempt consumed the sole Contract Repair execution allowance.
 * @param attempt - Attempt that may contain pre-dispatch or executed repair evidence.
 * @returns `true` only after a repair Agent session was started.
 */
export function xhsContractRepairConsumedAllowance(attempt: Pick<BusinessAttempt, 'agentRuns'>): boolean {
  return attempt.agentRuns.some(run => run.action === 'xhs-body-contract-repair-v0' && run.sessionId !== 'not-started')
}

/** Build the public ready result after every relationship has been verified.
 * @param reviewArtifact - PASS Review Artifact bound to the source Candidate.
 * @param review - Parsed PASS Review document.
 * @param validationArtifact - Matching deterministic hard-validation Artifact.
 * @param scope - Host-derived repair scope.
 * @returns Immutable zero-model preflight result.
 */
export function contractRepairPreflight(
  reviewArtifact: BusinessArtifact,
  review: XhsReviewArtifactDocument,
  validationArtifact: BusinessArtifact,
  scope: ReturnType<typeof deriveXhsContractRepairScope>,
): XhsSecondPassPreflight {
  if (review.review_result !== 'PASS') {
    throw new BusinessWorkbenchError('XHS_CONTRACT_REPAIR_NOT_ALLOWED', 'business-workbench: Contract Repair requires a PASS business Review')
  }
  return Object.freeze({
    status: 'CONTRACT_REPAIR_READY',
    sourceJobId: review.source_job_id,
    sourceAttemptId: review.source_attempt_id,
    sourceDraftSha256: review.source_draft_sha256,
    reviewArtifactId: reviewArtifact.artifactId,
    hardValidationArtifactId: validationArtifact.artifactId,
    failedContractItems: scope.failedContractItems,
    repairedFields: scope.repairedFields,
  })
}
