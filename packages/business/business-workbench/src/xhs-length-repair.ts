/** Bounded title/body length patching after an exact PASS business Review. */

import { createHash } from 'node:crypto'
import { z } from 'zod'
import { BusinessWorkbenchError } from './errors.ts'
import { countXhsFullCharacters } from './execution-telemetry.ts'
import { parseXhsDraftFormat } from './xhs-draft-format.ts'
import { validateXhsDraft } from './xhs-hard-contract.ts'
import type { XhsExecutionContractProjection, XhsHardValidationResult } from './xhs-hard-contract.ts'
import type { XhsReviewArtifactDocument } from './types.ts'

/** Stable format for an untrusted model proposal. */
export const XHS_LENGTH_REPAIR_PROPOSAL_VERSION = 1 as const
/** Stable format for Host trial evidence. */
export const XHS_LENGTH_REPAIR_EVIDENCE_VERSION = 1 as const
/** Stable format for the final human patch decision. */
export const XHS_LENGTH_REPAIR_APPROVAL_VERSION = 1 as const

const localTextSchema = z.string().min(1).max(2_000).refine(value => !/[\r\n]/u.test(value), 'patch text must be one local line')
const bodyPatchSchema = z.object({ old_text: localTextSchema, new_text: localTextSchema }).strict()
const bodyOptionSchema = z.object({ patches: z.array(bodyPatchSchema).min(1).max(6) }).strict()

/** Only model response admitted by the length-repair action. */
export const xhsLengthRepairProposalSchema = z.object({
  proposal_version: z.literal(XHS_LENGTH_REPAIR_PROPOSAL_VERSION),
  title_candidates: z.array(localTextSchema).max(3),
  body_options: z.array(bodyOptionSchema).max(3),
}).strict().superRefine((value, ctx) => {
  if (value.title_candidates.length === 0 && value.body_options.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'proposal must contain a title candidate or body option' })
  }
})

/** Parsed model proposal whose content is not yet a Candidate. */
export type XhsLengthRepairProposal = z.infer<typeof xhsLengthRepairProposalSchema>

/** Closed zero-model eligibility facts. */
export interface XhsLengthRepairEligibility {
  readonly status: 'LENGTH_REPAIR_READY'
  readonly failedContractItems: readonly ('titleRange' | 'bodyRange')[]
}

/** One independently applied trial. */
export interface XhsLengthRepairTrial {
  readonly titleCandidateIndex: number | null
  readonly bodyOptionIndex: number | null
  readonly status: 'PASS' | 'PATCH_INVALID' | 'HARD_CONTRACT_FAIL'
  readonly reason?: string
  readonly titleCharacters?: number
  readonly bodyCharacters?: number
  readonly editDistance?: number
  readonly draftSha256?: string
}

/** Host settlement of one and only one model proposal. */
export type XhsLengthRepairSettlement = Readonly<
  | { status: 'PROPOSAL_INVALID'; rawProposal: string; reason: string; trials: readonly XhsLengthRepairTrial[] }
  | { status: 'LENGTH_REPAIR_UNSATISFIED'; proposal: XhsLengthRepairProposal; trials: readonly XhsLengthRepairTrial[] }
  | {
    status: 'CANDIDATE_READY'
    proposal: XhsLengthRepairProposal
    trials: readonly XhsLengthRepairTrial[]
    selected: XhsLengthRepairTrial
    draft: string
    sourceDraftSha256: string
    repairedDraftSha256: string
    before: Readonly<{ title: string; titleCharacters: number; bodyCharacters: number }>
    after: Readonly<{ title: string; titleCharacters: number; bodyCharacters: number }>
  }
>

/** Durable human decision over one machine-valid repaired Candidate. */
export interface XhsLengthRepairApprovalDocument {
  readonly approval_version: typeof XHS_LENGTH_REPAIR_APPROVAL_VERSION
  readonly project: 'xhs'
  readonly source_draft_sha256: string
  readonly repaired_draft_sha256: string
  readonly decision: 'APPROVE' | 'REJECT'
  readonly status: 'APPROVED' | 'REJECTED'
  readonly next: 'PROMOTION_ELIGIBLE' | 'STOP'
  readonly title: Readonly<{ before: string; after: string; beforeCharacters: number; afterCharacters: number }>
  readonly body: Readonly<{ beforeCharacters: number; afterCharacters: number }>
  readonly decided_at: number
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function occurrences(value: string, needle: string): number {
  let count = 0
  let offset = 0
  while (true) {
    const found = value.indexOf(needle, offset)
    if (found < 0) return count
    count += 1
    offset = found + needle.length
  }
}

function patchBody(source: string, option: XhsLengthRepairProposal['body_options'][number]): string {
  const ranges = option.patches.map((patch) => {
    if (occurrences(source, patch.old_text) !== 1) {
      throw new Error(`old_text must occur exactly once: ${JSON.stringify(patch.old_text)}`)
    }
    const start = source.indexOf(patch.old_text)
    return { ...patch, start, end: start + patch.old_text.length }
  }).toSorted((left, right) => left.start - right.start)
  for (let index = 1; index < ranges.length; index += 1) {
    const previous = ranges[index - 1]
    const current = ranges[index]
    if (previous !== undefined && current !== undefined && current.start < previous.end) {
      throw new Error('body patches overlap')
    }
  }
  let result = source
  for (const patch of ranges.toReversed()) {
    result = `${result.slice(0, patch.start)}${patch.new_text}${result.slice(patch.end)}`
  }
  return result
}

function replaceUnique(source: string, oldText: string, newText: string, name: string): string {
  if (occurrences(source, oldText) !== 1) throw new Error(`${name} source range is not unique`)
  return source.replace(oldText, newText)
}

function renderTrial(sourceDraft: string, title: string, body: string): string {
  const parsed = parseXhsDraftFormat(sourceDraft)
  if (parsed.status !== 'PASS') throw new Error('source Draft no longer satisfies the format contract')
  let draft = replaceUnique(sourceDraft, `# ${parsed.evidence.title}`, `# ${title}`, 'title')
  draft = replaceUnique(draft, parsed.evidence.body, body, 'body')
  const metadata = `标题字符数：${countXhsFullCharacters(title)} + 正文字符数：${countXhsFullCharacters(body)}`
  const metadataPattern = /^标题字符数：[^\r\n]+$/mu
  if ([...draft.matchAll(new RegExp(metadataPattern.source, 'gmu'))].length !== 1) throw new Error('metadata source range is not unique')
  return draft.replace(metadataPattern, metadata)
}

function levenshtein(left: string, right: string): number {
  const a = Array.from(left)
  const b = Array.from(right)
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row]
    for (let column = 1; column <= b.length; column += 1) {
      current[column] = Math.min(
        (current[column - 1] ?? 0) + 1,
        (previous[column] ?? 0) + 1,
        (previous[column - 1] ?? 0) + (a[row - 1] === b[column - 1] ? 0 : 1),
      )
    }
    previous = current
  }
  return previous[b.length] ?? 0
}

function onlyLengthFailures(result: XhsHardValidationResult): readonly ('titleRange' | 'bodyRange')[] {
  if (result.format.status !== 'PASS' || result.failureClass !== 'HARD_CONTRACT_FAIL' || result.hardContractStatus !== 'FAIL') return []
  if (result.checks.pinnedComments.status !== 'PASS' || result.checks.unpinnedComments.status !== 'PASS'
    || result.checks.topics.status !== 'PASS'
    || result.keywordEvidence.some(item => !item.minimumOccurrencesPass || item.titleRequirementPass === false)) return []
  const failed = [
    ...(result.checks.titleRange.status === 'FAIL' ? ['titleRange' as const] : []),
    ...(result.checks.bodyRange.status === 'FAIL' ? ['bodyRange' as const] : []),
  ]
  return failed
}

/** Verify all zero-model eligibility conditions for safe length repair.
 * @param review - Business PASS Review bound to the source Candidate.
 * @param result - Deterministic validation of that exact source Candidate.
 * @returns The only admitted title/body length failures.
 */
export function assertXhsLengthRepairEligibility(
  review: XhsReviewArtifactDocument,
  result: XhsHardValidationResult,
): XhsLengthRepairEligibility {
  if (review.review_result !== 'PASS') {
    throw new BusinessWorkbenchError('XHS_LENGTH_REPAIR_NOT_ALLOWED', 'business-workbench: length repair requires a PASS business Review')
  }
  if (review.source_draft_sha256 !== result.facts.draftSha256) {
    throw new BusinessWorkbenchError('XHS_LENGTH_REPAIR_NOT_ALLOWED', 'business-workbench: Review and validation name different source drafts')
  }
  const failedContractItems = onlyLengthFailures(result)
  if (failedContractItems.length === 0) {
    throw new BusinessWorkbenchError('XHS_LENGTH_REPAIR_NOT_ALLOWED', 'business-workbench: only titleRange or bodyRange failures may enter length repair')
  }
  return Object.freeze({ status: 'LENGTH_REPAIR_READY', failedContractItems: Object.freeze(failedContractItems) })
}

/** Parse and trial one model proposal without treating it as a Candidate.
 * @param rawProposal - Untrusted JSON proposal returned by the restricted Agent.
 * @param sourceDraft - Exact immutable source Candidate.
 * @param review - Business PASS Review for the source Candidate.
 * @param sourceValidation - Deterministic validation for the source Candidate.
 * @param projection - Frozen TaskCard requirements used to validate every trial.
 * @returns Evidence for an invalid, unsatisfied, or single selected proposal.
 */
export function settleXhsLengthRepairProposal(
  rawProposal: string,
  sourceDraft: string,
  review: XhsReviewArtifactDocument,
  sourceValidation: XhsHardValidationResult,
  projection: XhsExecutionContractProjection,
): XhsLengthRepairSettlement {
  assertXhsLengthRepairEligibility(review, sourceValidation)
  let proposal: XhsLengthRepairProposal
  try {
    proposal = xhsLengthRepairProposalSchema.parse(JSON.parse(rawProposal))
  } catch (error) {
    return Object.freeze({ status: 'PROPOSAL_INVALID', rawProposal, reason: error instanceof Error ? error.message : 'invalid proposal', trials: Object.freeze([]) })
  }
  const parsedSource = parseXhsDraftFormat(sourceDraft)
  if (parsedSource.status !== 'PASS' || sha256(sourceDraft) !== review.source_draft_sha256) {
    throw new BusinessWorkbenchError('XHS_LENGTH_REPAIR_NOT_ALLOWED', 'business-workbench: source Draft differs from reviewed format-complete Candidate')
  }
  const titleChoices = sourceValidation.checks.titleRange.status === 'FAIL'
    ? proposal.title_candidates.map((title, index) => ({ title, index }))
    : [{ title: parsedSource.evidence.title, index: null }]
  const bodyChoices = sourceValidation.checks.bodyRange.status === 'FAIL'
    ? proposal.body_options.map((option, index) => ({ option, index }))
    : [{ option: null, index: null }]
  const trials: XhsLengthRepairTrial[] = []
  const passing: { trial: XhsLengthRepairTrial; draft: string }[] = []
  for (const titleChoice of titleChoices) for (const bodyChoice of bodyChoices) {
    try {
      const body = bodyChoice.option === null ? parsedSource.evidence.body : patchBody(parsedSource.evidence.body, bodyChoice.option)
      const draft = renderTrial(sourceDraft, titleChoice.title, body)
      const parsedTrial = parseXhsDraftFormat(draft)
      const protectedMissing = review.preserve.filter(value => value.length > 0 && !draft.includes(value))
      const unchangedCommentsAndTopics = parsedTrial.status === 'PASS'
        && parsedTrial.evidence.pinnedComments === parsedSource.evidence.pinnedComments
        && parsedTrial.evidence.unpinnedComments === parsedSource.evidence.unpinnedComments
        && JSON.stringify(parsedTrial.evidence.topicValues) === JSON.stringify(parsedSource.evidence.topicValues)
      const validation = validateXhsDraft(draft, projection)
      const pass = validation.format.status === 'PASS' && validation.hardContractStatus !== 'FAIL'
        && unchangedCommentsAndTopics && protectedMissing.length === 0
      const trial: XhsLengthRepairTrial = Object.freeze({
        titleCandidateIndex: titleChoice.index,
        bodyOptionIndex: bodyChoice.index,
        status: pass ? 'PASS' : 'HARD_CONTRACT_FAIL',
        ...(pass ? {} : { reason: protectedMissing.length > 0 ? 'protected Review content changed' : !unchangedCommentsAndTopics ? 'comments or topics changed' : 'hard contract remains failed' }),
        ...(parsedTrial.status === 'PASS' ? {
          titleCharacters: countXhsFullCharacters(parsedTrial.evidence.title),
          bodyCharacters: countXhsFullCharacters(parsedTrial.evidence.body),
        } : {}),
        editDistance: levenshtein(sourceDraft, draft),
        draftSha256: sha256(draft),
      })
      trials.push(trial)
      if (pass) passing.push({ trial, draft })
    } catch (error) {
      trials.push(Object.freeze({ titleCandidateIndex: titleChoice.index, bodyOptionIndex: bodyChoice.index,
        status: 'PATCH_INVALID', reason: error instanceof Error ? error.message : 'invalid patch' }))
    }
  }
  if (passing.length === 0) return Object.freeze({ status: 'LENGTH_REPAIR_UNSATISFIED', proposal, trials: Object.freeze(trials) })
  passing.sort((left, right) => (left.trial.editDistance ?? 0) - (right.trial.editDistance ?? 0)
    || (left.trial.titleCandidateIndex ?? -1) - (right.trial.titleCandidateIndex ?? -1)
    || (left.trial.bodyOptionIndex ?? -1) - (right.trial.bodyOptionIndex ?? -1))
  const selected = passing[0]
  if (selected === undefined) throw new Error('business-workbench: passing length-repair trial disappeared')
  const parsedAfter = parseXhsDraftFormat(selected.draft)
  if (parsedAfter.status !== 'PASS') throw new Error('business-workbench: selected length-repair Draft lost format evidence')
  return Object.freeze({ status: 'CANDIDATE_READY', proposal, trials: Object.freeze(trials), selected: selected.trial,
    draft: selected.draft, sourceDraftSha256: sha256(sourceDraft), repairedDraftSha256: sha256(selected.draft),
    before: Object.freeze({ title: parsedSource.evidence.title,
      titleCharacters: countXhsFullCharacters(parsedSource.evidence.title),
      bodyCharacters: countXhsFullCharacters(parsedSource.evidence.body) }),
    after: Object.freeze({ title: parsedAfter.evidence.title,
      titleCharacters: countXhsFullCharacters(parsedAfter.evidence.title),
      bodyCharacters: countXhsFullCharacters(parsedAfter.evidence.body) }) })
}

/** Build the terminal human decision without starting another repair or promotion.
 * @param settlement - Single machine-valid Candidate selected by the Host.
 * @param decision - The only admitted human decision.
 * @param decidedAt - Durable decision timestamp.
 * @returns Closed approval record that never performs promotion.
 */
export function buildXhsLengthRepairApproval(
  settlement: Extract<XhsLengthRepairSettlement, { status: 'CANDIDATE_READY' }>,
  decision: 'APPROVE' | 'REJECT',
  decidedAt: number,
): XhsLengthRepairApprovalDocument {
  return buildXhsLengthRepairApprovalFromDrafts(settlement.draft, settlement.before.title,
    settlement.before.titleCharacters, settlement.before.bodyCharacters, settlement.sourceDraftSha256, decision, decidedAt)
}

/** Build the terminal human decision from verified source and repaired Draft facts.
 * @param repairedDraft - Exact machine-valid repaired Candidate.
 * @param sourceTitle - Exact source title shown in the before/after diff.
 * @param sourceTitleCharacters - Host-counted source title characters.
 * @param sourceBodyCharacters - Host-counted source body characters.
 * @param sourceDraftSha256 - Exact source Candidate digest.
 * @param decision - The only admitted human decision.
 * @param decidedAt - Durable decision timestamp.
 * @returns Closed approval record that never performs promotion.
 */
export function buildXhsLengthRepairApprovalFromDrafts(
  repairedDraft: string,
  sourceTitle: string,
  sourceTitleCharacters: number,
  sourceBodyCharacters: number,
  sourceDraftSha256: string,
  decision: 'APPROVE' | 'REJECT',
  decidedAt: number,
): XhsLengthRepairApprovalDocument {
  const repaired = parseXhsDraftFormat(repairedDraft)
  if (repaired.status !== 'PASS') throw new BusinessWorkbenchError('XHS_LENGTH_REPAIR_NOT_ALLOWED', 'business-workbench: Patch Approval requires a format-complete repaired Candidate')
  return Object.freeze({
    approval_version: XHS_LENGTH_REPAIR_APPROVAL_VERSION,
    project: 'xhs',
    source_draft_sha256: sourceDraftSha256,
    repaired_draft_sha256: sha256(repairedDraft),
    decision,
    status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
    next: decision === 'APPROVE' ? 'PROMOTION_ELIGIBLE' : 'STOP',
    title: Object.freeze({ before: sourceTitle, after: repaired.evidence.title,
      beforeCharacters: sourceTitleCharacters, afterCharacters: countXhsFullCharacters(repaired.evidence.title) }),
    body: Object.freeze({ beforeCharacters: sourceBodyCharacters, afterCharacters: countXhsFullCharacters(repaired.evidence.body) }),
    decided_at: decidedAt,
  })
}
