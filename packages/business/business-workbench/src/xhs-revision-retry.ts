/** Immutable review documents and closed second-pass eligibility rules. */

import { createHash } from 'node:crypto'
import { z } from 'zod'
import { BusinessWorkbenchError } from './errors.ts'
import { BusinessAttemptId, BusinessJobId, BusinessOutputBundleId } from './ids.ts'
import type {
  BusinessArtifact,
  BusinessOutputBundle,
  XhsExecutionLineage,
  XhsReviewArtifactDocument,
  XhsReviewArtifactDocumentV1,
  XhsReviewArtifactDocumentV2,
  XhsReviewCandidateType,
  XhsRetryReason,
  XhsSecondPassPreflight,
} from './types.ts'
import { xhsHardValidationArtifactSchema } from './xhs-hard-contract.ts'

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const nonblankSchema = z.string().trim().min(1)

const reviewV1Schema = z.object({
  review_version: z.literal(1),
  project: z.literal('xhs'),
  source_job_id: z.uuid().transform(BusinessJobId),
  source_attempt_id: z.uuid().transform(BusinessAttemptId),
  source_draft_artifact: nonblankSchema,
  source_draft_sha256: sha256Schema,
  review_result: z.enum(['PASS', 'MODIFY', 'FAIL']),
  required_changes: z.array(nonblankSchema),
  quality_suggestions: z.array(nonblankSchema),
  preserve: z.array(nonblankSchema),
  reviewer_type: z.enum(['human', 'external_business_ai']),
  reviewed_at: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  provenance: z.object({
    source_output_bundle_id: z.string().regex(/^output_bundle_[a-f0-9]{64}$/).transform(BusinessOutputBundleId),
    source: z.literal('authoritative-intermediate-output-bundle'),
  }).strict(),
  review_sha256: sha256Schema,
}).strict()

const reviewV2Schema = z.object({
  review_version: z.literal(2),
  project: z.literal('xhs'),
  source_job_id: z.uuid().transform(BusinessJobId),
  source_attempt_id: z.uuid().transform(BusinessAttemptId),
  source_artifact_id: z.string().regex(/^output_bundle_[a-f0-9]{64}$/).transform(BusinessOutputBundleId),
  source_artifact_path: nonblankSchema,
  source_draft_sha256: sha256Schema,
  source_candidate_type: z.enum(['first_pass', 'revision', 'retry', 'contract_repair', 'length_repair']),
  source_revision_number: z.union([z.literal(1), z.literal(2)]).optional(),
  source_retry_number: z.literal(1).optional(),
  review_result: z.enum(['PASS', 'MODIFY', 'FAIL']),
  required_changes: z.array(nonblankSchema),
  quality_suggestions: z.array(nonblankSchema),
  preserve: z.array(nonblankSchema),
  reviewer_type: z.enum(['human', 'external_business_ai']),
  reviewed_at: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  provenance: z.object({
    source_output_bundle_id: z.string().regex(/^output_bundle_[a-f0-9]{64}$/).transform(BusinessOutputBundleId),
    source: z.literal('authoritative-intermediate-output-bundle'),
  }).strict(),
  review_sha256: sha256Schema,
}).strict().superRefine((review, ctx) => {
  if (review.source_artifact_id !== review.provenance.source_output_bundle_id) {
    ctx.addIssue({ code: 'custom', path: ['source_artifact_id'], message: 'source Artifact id does not match provenance' })
  }
  if (review.source_candidate_type === 'first_pass'
    && (review.source_revision_number !== undefined || review.source_retry_number !== undefined)) {
    ctx.addIssue({ code: 'custom', path: ['source_candidate_type'], message: 'First Pass review cannot name revision or retry numbers' })
  }
  if (review.source_candidate_type === 'revision'
    && (review.source_revision_number === undefined || review.source_retry_number !== undefined)) {
    ctx.addIssue({ code: 'custom', path: ['source_candidate_type'], message: 'Revision review requires only its source revision number' })
  }
  if (review.source_candidate_type === 'retry'
    && (review.source_retry_number === undefined || review.source_revision_number !== undefined)) {
    ctx.addIssue({ code: 'custom', path: ['source_candidate_type'], message: 'Retry review requires only its source retry number' })
  }
  if ((review.source_candidate_type === 'contract_repair' || review.source_candidate_type === 'length_repair')
    && (review.source_revision_number !== undefined || review.source_retry_number !== undefined)) {
    ctx.addIssue({ code: 'custom', path: ['source_candidate_type'], message: 'Repair review cannot name revision or retry numbers' })
  }
})

/** Strict persisted JSON body for every readable business-review version. */
export const xhsReviewArtifactDocumentSchema = z.discriminatedUnion('review_version', [
  reviewV1Schema,
  reviewV2Schema,
]).superRefine((review, ctx) => {
  const { review_sha256: _hash, ...base } = review
  if (xhsReviewDocumentHash(base as XhsReviewArtifactDocumentInput) !== review.review_sha256) {
    ctx.addIssue({ code: 'custom', path: ['review_sha256'], message: 'review hash does not match fields' })
  }
  if (review.review_result === 'MODIFY' && review.required_changes.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['required_changes'], message: 'MODIFY review requires at least one required change' })
  }
}) as z.ZodType<XhsReviewArtifactDocument>

type XhsReviewArtifactDocumentInput =
  | Omit<XhsReviewArtifactDocumentV1, 'review_sha256'>
  | Omit<XhsReviewArtifactDocumentV2, 'review_sha256'>

/** Hash stable review fields without the self-referential digest.
 * @param review - Review fields excluding the digest.
 * @returns The SHA-256 digest of the canonical JSON fields.
 */
export function xhsReviewDocumentHash(
  review: XhsReviewArtifactDocumentInput,
): string {
  return createHash('sha256').update(JSON.stringify(review), 'utf8').digest('hex')
}

/** Encode one validated immutable review document.
 * @param review - Review fields excluding the digest.
 * @returns The frozen document and its persisted JSON content.
 */
export function buildXhsReviewArtifactDocument(
  review: XhsReviewArtifactDocumentInput,
): { readonly document: XhsReviewArtifactDocument; readonly content: string } {
  const document = xhsReviewArtifactDocumentSchema.parse({
    ...review,
    review_sha256: xhsReviewDocumentHash(review),
  })
  return Object.freeze({ document: Object.freeze(document), content: `${JSON.stringify(document, null, 2)}\n` })
}

/** Parse and verify one persisted review body.
 * @param content - Persisted review JSON.
 * @returns The validated immutable review document.
 */
export function parseXhsReviewArtifactDocument(content: string): XhsReviewArtifactDocument {
  try {
    return Object.freeze(xhsReviewArtifactDocumentSchema.parse(JSON.parse(content)))
  } catch (error) {
    throw new BusinessWorkbenchError('XHS_REVIEW_INVALID', 'business-workbench: Review Artifact is invalid', {}, { cause: error })
  }
}

/** Determine whether a validation Artifact represents a structural retry condition.
 * @param validationContent - Persisted hard-validation JSON.
 * @returns The admitted retry reason, or null for a non-structural result.
 */
export function xhsStructuralRetryReason(validationContent: string): XhsRetryReason | null {
  let parsed: z.infer<typeof xhsHardValidationArtifactSchema>
  try {
    parsed = xhsHardValidationArtifactSchema.parse(JSON.parse(validationContent))
  } catch (error) {
    throw new BusinessWorkbenchError('XHS_RETRY_NOT_ALLOWED', 'business-workbench: source validation evidence is invalid', {}, { cause: error })
  }
  if (parsed.result.failureClass !== 'FORMAT_CONTRACT_FAIL') return null
  const issues = new Set(parsed.result.format.issues)
  if (issues.has('REQUIRED_SECTION_MISSING')) return 'REQUIRED_BODY_MISSING'
  return 'FORMAT_CONTRACT_FAIL'
}

/** Enforce the single structural retry limit.
 * @param existingRetries - Number of existing retry executions for the source attempt.
 * @returns Nothing when the one-retry limit remains available.
 */
export function assertXhsRetryAvailable(existingRetries: number): void {
  if (existingRetries >= 1) {
    throw new BusinessWorkbenchError('XHS_RETRY_LIMIT_REACHED', 'business-workbench: source execution already has its one admitted Retry')
  }
}

/** Restrict structural Retry to the original execution.
 * @param lineage - Source Attempt lineage, which must be absent.
 * @returns Nothing when the source is an original execution.
 */
export function assertXhsRetrySource(lineage: XhsExecutionLineage | undefined): void {
  if (lineage !== undefined) {
    throw new BusinessWorkbenchError('XHS_RETRY_NOT_ALLOWED', 'business-workbench: a Revision or Retry execution cannot become a structural Retry')
  }
}

/** Immutable candidate classification derived only from execution lineage. */
export interface XhsReviewCandidateDescriptor {
  readonly candidateType: XhsReviewCandidateType
  readonly revisionNumber?: 1 | 2
  readonly retryNumber?: 1
}

/** Classify one candidate without trusting Review-authored metadata.
 * @param lineage - Source Attempt lineage, absent only for an original First Pass.
 * @returns Candidate type and its deterministic sequence number.
 */
export function xhsReviewCandidate(lineage: XhsExecutionLineage | undefined): XhsReviewCandidateDescriptor {
  if (lineage === undefined) return Object.freeze({ candidateType: 'first_pass' })
  if (lineage.kind === 'revision') {
    return Object.freeze({ candidateType: 'revision', revisionNumber: lineage.revisionNumber })
  }
  if (lineage.kind === 'retry') return Object.freeze({ candidateType: 'retry', retryNumber: lineage.retryNumber })
  return Object.freeze({ candidateType: lineage.kind === 'contract-repair' ? 'contract_repair' : 'length_repair' })
}

/** Derive the next bounded revision number from the reviewed candidate.
 * @param candidate - Host-derived candidate classification.
 * @returns Revision 1 or 2 when the bounded flow admits another revision.
 */
export function nextXhsRevisionNumber(candidate: XhsReviewCandidateDescriptor): 1 | 2 {
  if (candidate.candidateType === 'contract_repair' || candidate.candidateType === 'length_repair') {
    throw new BusinessWorkbenchError('MAX_REVISION_REACHED', 'business-workbench: Repair output cannot enter business Revision')
  }
  if (candidate.candidateType !== 'revision') return 1
  if (candidate.revisionNumber === 1) return 2
  throw new BusinessWorkbenchError('MAX_REVISION_REACHED', 'business-workbench: source candidate already reached Revision 2')
}

/** Read the source draft path from either supported Review version. */
function reviewSourcePath(review: XhsReviewArtifactDocument): string {
  return review.review_version === 1 ? review.source_draft_artifact : review.source_artifact_path
}

/** Verify a Review points to the exact authoritative source draft.
 * @param review - Persisted review document.
 * @param sourceBundle - Authoritative source output bundle.
 * @param sourceDraftHash - Digest of the source draft bytes.
 * @param candidate - Candidate classification derived from source execution lineage.
 * @returns Nothing when all source identities match.
 */
export function assertXhsReviewSource(
  review: XhsReviewArtifactDocument,
  sourceBundle: BusinessOutputBundle,
  sourceDraftHash: string,
  candidate: XhsReviewCandidateDescriptor,
): void {
  const draft = sourceBundle.entries.find(entry => entry.name === 'draft.md')
  if (review.source_job_id !== sourceBundle.jobId
    || review.source_attempt_id !== sourceBundle.attemptId
    || review.provenance.source_output_bundle_id !== sourceBundle.id
    || draft === undefined
    || reviewSourcePath(review) !== draft.path
    || review.source_draft_sha256 !== sourceDraftHash
    || draft.hash !== sourceDraftHash) {
    throw new BusinessWorkbenchError('XHS_REVIEW_INVALID', 'business-workbench: Review Artifact names another source draft')
  }
  if (review.review_version === 1) {
    if (candidate.candidateType !== 'first_pass') {
      throw new BusinessWorkbenchError('XHS_REVIEW_INVALID', 'business-workbench: version-1 Review is valid only for an original First Pass')
    }
    return
  }
  if (review.source_artifact_id !== sourceBundle.id
    || review.source_candidate_type !== candidate.candidateType
    || review.source_revision_number !== candidate.revisionNumber
    || review.source_retry_number !== candidate.retryNumber) {
    throw new BusinessWorkbenchError('XHS_REVIEW_INVALID', 'business-workbench: Review candidate metadata differs from source lineage')
  }
}

/** Build the public immutable revision readiness result.
 * @param reviewArtifact - Persisted Review Artifact metadata.
 * @param review - Validated Review Artifact document.
 * @param revisionNumber - Host-derived next revision number.
 * @returns The immutable revision preflight result.
 */
export function revisionPreflight(
  reviewArtifact: BusinessArtifact,
  review: XhsReviewArtifactDocument,
  revisionNumber: 1 | 2,
): XhsSecondPassPreflight {
  if (review.review_result !== 'MODIFY') {
    throw new BusinessWorkbenchError('XHS_REVIEW_INVALID', 'business-workbench: only a MODIFY review may start a revision')
  }
  return Object.freeze({
    status: 'REVISION_READY',
    sourceJobId: review.source_job_id,
    sourceAttemptId: review.source_attempt_id,
    sourceDraftSha256: review.source_draft_sha256,
    reviewArtifactId: reviewArtifact.artifactId,
    revisionNumber,
  })
}
