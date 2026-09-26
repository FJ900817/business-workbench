/** Deterministic XHS execution-contract projection and L1 draft validation. */

import { createHash } from 'node:crypto'
import { z } from 'zod'
import { countXhsFullCharacters } from './execution-telemetry.ts'
import {
  parseXhsDraftFormat,
  recoverXhsHistoricalDraft,
  renderXhsDraftFormat,
  XHS_DRAFT_FORMAT,
  xhsDraftFormatIssueCodeSchema,
} from './xhs-draft-format.ts'
import type { XhsDraftEvidence } from './xhs-draft-format.ts'
import { compileXhsTaskCardContract, xhsTaskCardMachineContractSchema } from './xhs-task-card-contract.ts'
import { compareXhsTopics } from './xhs-topics.ts'

/** Version of the TaskCard hard-rule projection. */
export const XHS_HARD_CONTRACT_VERSION = 3 as const
/** Version of the persisted L1 validation result. */
export const XHS_HARD_VALIDATION_VERSION = 4 as const
/** Stable identifier for the deterministic validator. */
export const XHS_HARD_VALIDATOR = 'xhs-hard-contract-l1-v3' as const

const locationSchema = z.enum(['标题', '开头', '中段', '末尾'])
const statusSchema = z.enum(['PASS', 'WARN', 'FAIL'])
const failureClassSchema = z.enum(['FORMAT_CONTRACT_FAIL', 'HARD_CONTRACT_FAIL'])
/** Machine-readable identity and hard rules compiled from one frozen TaskCard. */
export const xhsExecutionContractProjectionSchema = xhsTaskCardMachineContractSchema.extend({
  version: z.literal(XHS_HARD_CONTRACT_VERSION),
}).strict()

/** Frozen TaskCard hard-rule projection. */
export type XhsExecutionContractProjection = z.infer<typeof xhsExecutionContractProjectionSchema>

const positionSchema = z.object({ codePointOffset: z.number().int().nonnegative() }).strict()
const countCheckSchema = z.object({
  status: z.enum(['PASS', 'FAIL', 'NOT_EVALUATED']), actual: z.number().int().nonnegative().nullable(),
  requiredMin: z.number().int().nonnegative(), requiredMax: z.number().int().nonnegative(),
}).strict()
const exactCountCheckSchema = z.object({
  status: z.enum(['PASS', 'FAIL', 'NOT_EVALUATED']), actual: z.number().int().nonnegative().nullable(), required: z.number().int().nonnegative(),
}).strict()
const topicCheckSchema = exactCountCheckSchema.extend({
  expected_topics: z.array(z.string()),
  actual_topics: z.array(z.string()).nullable(),
  missing_topics: z.array(z.string()),
  unexpected_topics: z.array(z.string()),
  duplicate_topics: z.array(z.string()),
  order_matches: z.boolean().nullable(),
}).strict()

/** Strict JSON format stored in each XHS L1 Validation Artifact. */
export const xhsHardValidationResultSchema = z.object({
  version: z.literal(XHS_HARD_VALIDATION_VERSION),
  validator: z.literal(XHS_HARD_VALIDATOR),
  status: statusSchema,
  failureClass: failureClassSchema.nullable(),
  format: z.object({
    contract: z.literal(XHS_DRAFT_FORMAT),
    status: z.enum(['PASS', 'FAIL']),
    issues: z.array(xhsDraftFormatIssueCodeSchema),
  }).strict(),
  hardContractStatus: statusSchema.nullable(),
  projection: xhsExecutionContractProjectionSchema,
  facts: z.object({
    draftSha256: z.string().regex(/^[a-f0-9]{64}$/),
    actualTitleCharacters: z.number().int().nonnegative().nullable(),
    actualBodyCharacters: z.number().int().nonnegative().nullable(),
    modelDeclaredTitleCharacters: z.number().int().nonnegative().nullable(),
    modelDeclaredBodyCharacters: z.number().int().nonnegative().nullable(),
  }).strict(),
  checks: z.object({
    titleRange: countCheckSchema,
    bodyRange: countCheckSchema,
    pinnedComments: exactCountCheckSchema,
    unpinnedComments: exactCountCheckSchema,
    topics: topicCheckSchema,
  }).strict(),
  keywordEvidence: z.array(z.object({
    keyword: z.string().min(1),
    requiredLocations: z.array(z.object({ location: locationSchema, count: z.number().int().positive() }).strict()),
    exactOccurrences: z.number().int().nonnegative(),
    positions: z.array(positionSchema),
    minimumOccurrencesPass: z.boolean(),
    titleOccurrences: z.number().int().nonnegative(),
    titleRequirementPass: z.boolean().nullable(),
    unresolvedRequiredLocations: z.array(z.enum(['开头', '中段', '末尾'])),
  }).strict()),
  deferredChecks: z.array(z.enum(['keyword-location', 'body-structure', 'product-module', 'explicit-prohibition'])),
}).strict()

/** Deterministic L1 result over an unmodified XHS draft. */
export type XhsHardValidationResult = z.infer<typeof xhsHardValidationResultSchema>

/** Version-5-compatible body stored in an existing Business `validation` Artifact. */
export const xhsHardValidationArtifactSchema = z.object({
  businessSchemaVersion: z.literal(5),
  jobId: z.string().min(1),
  attemptId: z.string().min(1),
  executionPackageId: z.string().min(1),
  outputBundleId: z.string().min(1),
  validatedAt: z.number().int().nonnegative(),
  result: xhsHardValidationResultSchema,
}).strict()

type KeywordLocation = z.infer<typeof locationSchema>

/** Read-only two-layer result for one historical Draft. */
export interface XhsHistoricalDraftReplayResult {
  readonly originalFormatStatus: 'PASS' | 'FORMAT_CONTRACT_FAIL'
  readonly formatIssues: readonly z.infer<typeof xhsDraftFormatIssueCodeSchema>[]
  readonly recoveryStatus: 'NOT_NEEDED' | 'RECOVERED' | 'AMBIGUOUS'
  readonly recoveredDeterministicEvidence: Readonly<{
    actualTitleCharacters: number
    actualBodyCharacters: number
    pinnedComments: number
    unpinnedComments: number
    topics: number
    topicValues: readonly string[]
    modelDeclaredTitleCharacters: number | null
    modelDeclaredBodyCharacters: number | null
  }> | null
  readonly hardContractStatus: 'PASS' | 'WARN' | 'FAIL' | null
  readonly checks: z.infer<typeof xhsHardValidationResultSchema>['checks'] | null
  readonly keywordEvidence: readonly Readonly<{
    keyword: string
    requiredLocations: readonly Readonly<{ location: KeywordLocation; count: number }>[]
    exactOccurrences: number
    positions: readonly Readonly<{ codePointOffset: number }>[]
    minimumOccurrencesPass: boolean
    titleOccurrences: number
    titleRequirementPass: boolean | null
    unresolvedRequiredLocations: readonly Exclude<KeywordLocation, '标题'>[]
  }>[]
}

/**
 * Project one frozen TaskCard's compiled contract into the checklist and L1 validator.
 * @param taskCard - Exact frozen TaskCard text.
 * @returns validated immutable hard-rule projection.
 */
export function projectXhsExecutionContract(taskCard: string): XhsExecutionContractProjection {
  const contract = compileXhsTaskCardContract(taskCard)
  return Object.freeze(xhsExecutionContractProjectionSchema.parse({
    ...contract,
    version: XHS_HARD_CONTRACT_VERSION,
  }))
}

/**
 * Render only projected TaskCard rules at the end of the restricted user instruction.
 * @param projection - Validated TaskCard projection.
 * @returns concise model-visible checklist with no new creative guidance.
 */
export function renderXhsExecutionChecklist(projection: XhsExecutionContractProjection): string {
  const keywords = projection.requiredExactKeywords.length === 0
    ? '无'
    : projection.requiredExactKeywords.map(requirement => `${requirement.keyword}（${requirement.requiredLocations.map(location => `${location.location}×${location.count}`).join(' / ')}）`).join('；')
  return [
    '【本篇执行硬合同】',
    `- note_type：${projection.noteType}`,
    `- 标题：${projection.titleRange.min}—${projection.titleRange.max}全字符；字符数由 Host 计算，模型自报不作为生产事实`,
    `- 正文：${projection.bodyRange.min}—${projection.bodyRange.max}全字符；字符数由 Host 计算，模型自报不作为生产事实`,
    `- 精确关键词：${keywords}`,
    `- 正文结构：${projection.requiredBodyStructure.join('；')}`,
    `- 产品模块：${projection.productModule}`,
    `- 评论：置顶${projection.comments.pinned}条 + 非置顶${projection.comments.unpinned}条`,
    `- 关联话题：${projection.allowedTopics.length === 0 ? '无' : projection.allowedTopics.map(topic => `#${topic}`).join(' ')}`,
    ...(projection.explicitProhibitions.length === 0 ? [] : [`- 明确禁止：${projection.explicitProhibitions.join('；')}`]),
    '',
    renderXhsDraftFormat(),
  ].join('\n')
}

function exactPositions(text: string, keyword: string): readonly { codePointOffset: number }[] {
  const positions: { codePointOffset: number }[] = []
  let offset = 0
  while (true) {
    const found = text.indexOf(keyword, offset)
    if (found < 0) return Object.freeze(positions)
    positions.push(Object.freeze({ codePointOffset: Array.from(text.slice(0, found)).length }))
    offset = found + keyword.length
  }
}

function rangeCheck(actual: number | null, required: { min: number; max: number }) {
  return Object.freeze({ status: actual !== null && actual >= required.min && actual <= required.max ? 'PASS' as const : 'FAIL' as const,
    actual, requiredMin: required.min, requiredMax: required.max })
}

function exactCheck(actual: number, required: number) {
  return Object.freeze({ status: actual === required ? 'PASS' as const : 'FAIL' as const, actual, required })
}

function notEvaluatedRange(required: { min: number; max: number }) {
  return Object.freeze({ status: 'NOT_EVALUATED' as const, actual: null, requiredMin: required.min, requiredMax: required.max })
}

function notEvaluatedExact(required: number) {
  return Object.freeze({ status: 'NOT_EVALUATED' as const, actual: null, required })
}

function topicCheck(expected: readonly string[], actual: readonly string[]) {
  const comparison = compareXhsTopics(expected, actual)
  return Object.freeze({
    status: comparison.status,
    actual: actual.length,
    required: expected.length,
    expected_topics: [...comparison.expectedTopics],
    actual_topics: [...comparison.actualTopics],
    missing_topics: [...comparison.missingTopics],
    unexpected_topics: [...comparison.unexpectedTopics],
    duplicate_topics: [...comparison.duplicateTopics],
    order_matches: comparison.orderMatches,
  })
}

function topicsNotEvaluated(expected: readonly string[]) {
  return Object.freeze({
    status: 'NOT_EVALUATED' as const,
    actual: null,
    required: expected.length,
    expected_topics: [...expected],
    actual_topics: null,
    missing_topics: [],
    unexpected_topics: [],
    duplicate_topics: [],
    order_matches: null,
  })
}

function evaluateHardContract(
  draft: string,
  projection: XhsExecutionContractProjection,
  evidence: XhsDraftEvidence,
) {
  const actualTitleCharacters = countXhsFullCharacters(evidence.title)
  const actualBodyCharacters = countXhsFullCharacters(evidence.body)
  const keywordEvidence = projection.requiredExactKeywords.map((requirement) => {
    const positions = exactPositions(draft, requirement.keyword)
    const titleOccurrences = exactPositions(evidence.title, requirement.keyword).length
    const titleRequired = requirement.requiredLocations.find(location => location.location === '标题')?.count
    const unresolvedRequiredLocations = requirement.requiredLocations
      .map(location => location.location)
      .filter((location): location is Exclude<KeywordLocation, '标题'> => location !== '标题')
    return Object.freeze({
      keyword: requirement.keyword,
      requiredLocations: requirement.requiredLocations,
      exactOccurrences: positions.length,
      positions,
      minimumOccurrencesPass: positions.length >= requirement.requiredLocations.reduce((total, location) => total + location.count, 0),
      titleOccurrences,
      titleRequirementPass: titleRequired === undefined ? null : titleOccurrences === titleRequired,
      unresolvedRequiredLocations: Object.freeze(unresolvedRequiredLocations),
    })
  })
  const checks = Object.freeze({
    titleRange: rangeCheck(actualTitleCharacters, projection.titleRange),
    bodyRange: rangeCheck(actualBodyCharacters, projection.bodyRange),
    pinnedComments: exactCheck(evidence.pinnedComments, projection.comments.pinned),
    unpinnedComments: exactCheck(evidence.unpinnedComments, projection.comments.unpinned),
    topics: topicCheck(projection.allowedTopics, evidence.topicValues),
  })
  const failed = Object.values(checks).some(check => check.status === 'FAIL')
    || keywordEvidence.some(item => !item.minimumOccurrencesPass || item.titleRequirementPass === false)
  const deferredChecks = Object.freeze([
    ...(keywordEvidence.some(item => item.unresolvedRequiredLocations.length > 0) ? ['keyword-location' as const] : []),
    ...(projection.requiredBodyStructure.length > 0 ? ['body-structure' as const] : []),
    ...(projection.productModule.length > 0 ? ['product-module' as const] : []),
    ...(projection.explicitProhibitions.length > 0 ? ['explicit-prohibition' as const] : []),
  ])
  return Object.freeze({
    status: failed ? 'FAIL' as const : deferredChecks.length > 0 ? 'WARN' as const : 'PASS' as const,
    facts: Object.freeze({
      actualTitleCharacters,
      actualBodyCharacters,
      modelDeclaredTitleCharacters: evidence.modelDeclaredTitleCharacters,
      modelDeclaredBodyCharacters: evidence.modelDeclaredBodyCharacters,
    }),
    checks,
    keywordEvidence: Object.freeze(keywordEvidence),
    deferredChecks,
  })
}

/**
 * Validate one raw First-Pass Draft without changing it or calling a model.
 * @param draft - Exact authoritative Markdown bytes decoded as UTF-8.
 * @param projection - Hard rules projected from the same Attempt's frozen TaskCard.
 * @returns deterministic facts, evidence, and L1 status.
 */
export function validateXhsDraft(draft: string, projection: XhsExecutionContractProjection): XhsHardValidationResult {
  const format = parseXhsDraftFormat(draft)
  const evaluated = format.status === 'PASS' ? evaluateHardContract(draft, projection, format.evidence) : null
  return Object.freeze(xhsHardValidationResultSchema.parse({
    version: XHS_HARD_VALIDATION_VERSION,
    validator: XHS_HARD_VALIDATOR,
    status: evaluated?.status ?? 'FAIL',
    failureClass: format.status === 'FAIL' ? 'FORMAT_CONTRACT_FAIL' : evaluated?.status === 'FAIL' ? 'HARD_CONTRACT_FAIL' : null,
    format: { contract: XHS_DRAFT_FORMAT, status: format.status, issues: format.issues },
    hardContractStatus: evaluated?.status ?? null,
    projection,
    facts: {
      draftSha256: createHash('sha256').update(draft, 'utf8').digest('hex'),
      actualTitleCharacters: evaluated?.facts.actualTitleCharacters ?? null,
      actualBodyCharacters: evaluated?.facts.actualBodyCharacters ?? null,
      modelDeclaredTitleCharacters: evaluated?.facts.modelDeclaredTitleCharacters ?? null,
      modelDeclaredBodyCharacters: evaluated?.facts.modelDeclaredBodyCharacters ?? null,
    },
    checks: evaluated?.checks ?? {
      titleRange: notEvaluatedRange(projection.titleRange),
      bodyRange: notEvaluatedRange(projection.bodyRange),
      pinnedComments: notEvaluatedExact(projection.comments.pinned),
      unpinnedComments: notEvaluatedExact(projection.comments.unpinned),
      topics: topicsNotEvaluated(projection.allowedTopics),
    },
    keywordEvidence: evaluated?.keywordEvidence ?? [],
    deferredChecks: evaluated?.deferredChecks ?? [],
  }))
}

/**
 * Replay a historical Draft without making its obsolete layout valid for production.
 * @param draft - Exact historical Markdown bytes decoded as UTF-8.
 * @param projection - Frozen hard rules for the historical Attempt.
 * @returns original format status plus hard-rule evidence only after deterministic recovery.
 */
export function replayXhsHistoricalDraft(
  draft: string,
  projection: XhsExecutionContractProjection,
): XhsHistoricalDraftReplayResult {
  const format = parseXhsDraftFormat(draft)
  const recovered = format.status === 'PASS'
    ? { status: 'NOT_NEEDED' as const, evidence: format.evidence }
    : recoverXhsHistoricalDraft(draft)
  if (recovered.evidence === null) return Object.freeze({
    originalFormatStatus: 'FORMAT_CONTRACT_FAIL',
    formatIssues: format.issues,
    recoveryStatus: 'AMBIGUOUS',
    recoveredDeterministicEvidence: null,
    hardContractStatus: null,
    checks: null,
    keywordEvidence: Object.freeze([]),
  })
  const evaluated = evaluateHardContract(draft, projection, recovered.evidence)
  return Object.freeze({
    originalFormatStatus: format.status === 'PASS' ? 'PASS' : 'FORMAT_CONTRACT_FAIL',
    formatIssues: format.issues,
    recoveryStatus: recovered.status,
    recoveredDeterministicEvidence: Object.freeze({ ...evaluated.facts,
      pinnedComments: recovered.evidence.pinnedComments,
      unpinnedComments: recovered.evidence.unpinnedComments,
      topics: recovered.evidence.topics,
      topicValues: recovered.evidence.topicValues }),
    hardContractStatus: evaluated.status,
    checks: evaluated.checks,
    keywordEvidence: evaluated.keywordEvidence,
  })
}

/**
 * Encode one validated result as stable UTF-8 JSON for an immutable Business Artifact.
 * @param identity - Durable Job, Attempt, package, and output-bundle identities.
 * @param validatedAt - Host observation time shared with output settlement.
 * @param result - Deterministic result over the exact bundle draft.
 * @returns newline-terminated validated JSON.
 */
export function buildXhsHardValidationArtifact(
  identity: { readonly jobId: string; readonly attemptId: string; readonly executionPackageId: string; readonly outputBundleId: string },
  validatedAt: number,
  result: XhsHardValidationResult,
): string {
  const artifact = xhsHardValidationArtifactSchema.parse({
    businessSchemaVersion: 5,
    ...identity,
    validatedAt,
    result,
  })
  return `${JSON.stringify(artifact, null, 2)}\n`
}
