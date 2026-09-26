/** Immutable handoff from one approved XHS final body to cover planning. */

import { createHash } from 'node:crypto'
import { z } from 'zod'
import { BusinessWorkbenchError } from './errors.ts'

/** Version of the final-body to cover handoff Artifact. */
export const XHS_COVER_HANDOFF_VERSION = 'xhs-cover-handoff-v0.1' as const

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u)
const nonblankSchema = z.string().trim().min(1)
const coverNoteTypeSchema = z.enum(['hot_traffic', 'search_solution', 'recommendation_conversion'])

/** Five fields owned by the formal body-title/P1-title pairing interface. */
export const xhsTitlePairContractSchema = z.object({
  body_title: nonblankSchema.max(20),
  core_problem_or_object: nonblankSchema,
  core_answer_or_judgment: nonblankSchema,
  verified_number: z.union([z.number().int(), nonblankSchema, z.null()]),
  p1_title_direction: nonblankSchema,
}).strict()

/** Formal title-pair values consumed read-only by S15. */
export type XhsTitlePairContract = z.infer<typeof xhsTitlePairContractSchema>

const fieldSourceSchema = z.object({
  stage: z.enum(['s3-finalization', 'human-business-decision']),
  method: z.enum(['deterministic-copy', 'human-confirmed']),
  reference: nonblankSchema,
}).strict()

const handoffPayloadSchema = z.object({
  artifact_version: z.literal(XHS_COVER_HANDOFF_VERSION),
  note_id: z.string().regex(/^[a-zA-Z0-9_-]+$/u),
  note_type: coverNoteTypeSchema,
  template_family: z.enum(['editorial', 'swiss']),
  visual_route: nonblankSchema,
  template_library_version: z.enum(['V1_1_Editorial_Clean', 'V2_1_Swiss_Purple_QingYa']),
  production_mode: z.literal('review'),
  source_note_path: z.string().regex(/^(?!\/)(?!.*\.\.).+/u),
  source_note_sha256: sha256Schema,
  source_note_bytes: z.number().int().positive(),
  content_status: z.literal('final'),
  finalized_at: nonblankSchema,
  workflow_status: z.literal('cover_plan_ready'),
  title_pair_contract: xhsTitlePairContractSchema,
  field_sources: z.object({
    body_title: fieldSourceSchema,
    core_problem_or_object: fieldSourceSchema,
    core_answer_or_judgment: fieldSourceSchema,
    verified_number: fieldSourceSchema,
    p1_title_direction: fieldSourceSchema,
  }).strict(),
  decision_source: z.object({
    kind: z.literal('human-confirmed'),
    reference: nonblankSchema,
  }).strict(),
  created_at: nonblankSchema,
  lineage: z.object({
    project: z.literal('xhs'),
    account: z.enum(['account1', 'account2', 'account3', 'account4']),
    production_month: z.string().regex(/^\d{4}-\d{2}$/u),
    production_week: z.string().regex(/^第\d{2}周$/u),
    note: z.string().regex(/^note\d{3}$/u),
    task_id: nonblankSchema,
    topic_id: nonblankSchema,
    task_card_path: z.string().regex(/^(?!\/)(?!.*\.\.).+/u),
    task_card_sha256: sha256Schema,
  }).strict(),
}).strict()

/** Complete immutable handoff Artifact, including a content-derived identity. */
export const xhsCoverHandoffArtifactSchema = handoffPayloadSchema.extend({
  artifact_id: z.string().regex(/^xhs-cover-handoff-[a-f0-9]{64}$/u),
  artifact_sha256: sha256Schema,
}).strict()

/** Parsed final-body frontmatter and title needed by the handoff gate. */
interface XhsFinalBodyIdentity {
  readonly contentStatus: string | undefined
  readonly finalizedAt: string | undefined
  readonly title: string | undefined
}

/** Caller-supplied facts for one approved final-body handoff. */
export interface BuildXhsCoverHandoffRequest {
  readonly sourceNote: {
    readonly path: string
    readonly content: string
    readonly expectedSha256: string
    readonly noteId: string
    readonly noteType: z.infer<typeof coverNoteTypeSchema>
  }
  readonly route: {
    readonly templateFamily: 'editorial' | 'swiss'
    readonly visualRoute: string
    readonly templateLibraryVersion: 'V1_1_Editorial_Clean' | 'V2_1_Swiss_Purple_QingYa'
  }
  readonly titlePairContract: XhsTitlePairContract
  readonly fieldSources: z.input<typeof handoffPayloadSchema>['field_sources']
  readonly decisionSource: z.input<typeof handoffPayloadSchema>['decision_source']
  readonly createdAt: string
  readonly lineage: z.input<typeof handoffPayloadSchema>['lineage']
}

/** Validated immutable final-body handoff Artifact. */
export type XhsCoverHandoffArtifact = z.infer<typeof xhsCoverHandoffArtifactSchema>

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

function parseFinalBodyIdentity(content: string): XhsFinalBodyIdentity {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(content)?.[1]
  const scalar = (name: string): string | undefined => frontmatter
    ?.split(/\r?\n/u)
    .map(line => new RegExp(`^${name}:\\s*(.+)$`, 'u').exec(line)?.[1])
    .find((value): value is string => value !== undefined)
  const matches = [...content.matchAll(/^## 标题(?:（[^\r\n]+）)?\r?\n\r?\n([^\r\n]+)$/gmu)]
  return Object.freeze({
    contentStatus: scalar('content_status'),
    finalizedAt: scalar('finalized_at'),
    title: matches.length === 1 ? matches[0]?.[1] : undefined,
  })
}

function reject(code: 'XHS_TITLE_PAIR_CONTRACT_MISSING' | 'XHS_BODY_TITLE_P1_PAIR_FAILED', message: string): never {
  throw new BusinessWorkbenchError(code, `business-workbench: ${message}`)
}

function payloadText(payload: z.output<typeof handoffPayloadSchema>): string {
  return `${JSON.stringify(payload, null, 2)}\n`
}

/**
 * Build an immutable handoff only from a hash-matched approved final body and explicit title-pair values.
 * @param request - Exact source bytes, formal route, human decision, and lineage.
 * @returns a content-addressed handoff Artifact.
 */
export function buildXhsCoverHandoffArtifact(request: BuildXhsCoverHandoffRequest): XhsCoverHandoffArtifact {
  const sourceHash = sha256(request.sourceNote.content)
  if (sourceHash !== request.sourceNote.expectedSha256) {
    return reject('XHS_BODY_TITLE_P1_PAIR_FAILED', 'final body SHA-256 differs from the approved source identity')
  }
  const identity = parseFinalBodyIdentity(request.sourceNote.content)
  if (identity.contentStatus !== 'final' || identity.finalizedAt === undefined || identity.title === undefined) {
    return reject('XHS_TITLE_PAIR_CONTRACT_MISSING', 'final body lacks an unambiguous title, content_status=final, or finalized_at')
  }
  let titlePairContract: XhsTitlePairContract
  try {
    titlePairContract = xhsTitlePairContractSchema.parse(request.titlePairContract)
  } catch {
    return reject('XHS_TITLE_PAIR_CONTRACT_MISSING', 'title_pair_contract is absent or incomplete')
  }
  if (titlePairContract.body_title !== identity.title) {
    return reject('XHS_BODY_TITLE_P1_PAIR_FAILED', 'title_pair_contract.body_title differs from the final body title')
  }
  if (titlePairContract.verified_number !== null
    && !request.sourceNote.content.includes(String(titlePairContract.verified_number))) {
    return reject('XHS_BODY_TITLE_P1_PAIR_FAILED', 'verified_number is not present in the final body')
  }
  const payload = handoffPayloadSchema.parse({
    artifact_version: XHS_COVER_HANDOFF_VERSION,
    note_id: request.sourceNote.noteId,
    note_type: request.sourceNote.noteType,
    template_family: request.route.templateFamily,
    visual_route: request.route.visualRoute,
    template_library_version: request.route.templateLibraryVersion,
    production_mode: 'review',
    source_note_path: request.sourceNote.path,
    source_note_sha256: sourceHash,
    source_note_bytes: Buffer.byteLength(request.sourceNote.content, 'utf8'),
    content_status: 'final',
    finalized_at: identity.finalizedAt,
    workflow_status: 'cover_plan_ready',
    title_pair_contract: titlePairContract,
    field_sources: request.fieldSources,
    decision_source: request.decisionSource,
    created_at: request.createdAt,
    lineage: request.lineage,
  })
  const artifactSha256 = sha256(payloadText(payload))
  return Object.freeze(xhsCoverHandoffArtifactSchema.parse({
    ...payload,
    artifact_id: `xhs-cover-handoff-${artifactSha256}`,
    artifact_sha256: artifactSha256,
  }))
}

/**
 * Parse and re-hash a persisted handoff Artifact.
 * @param content - UTF-8 JSON Artifact body.
 * @returns the verified immutable handoff.
 */
export function parseXhsCoverHandoffArtifact(content: string): XhsCoverHandoffArtifact {
  let artifact: XhsCoverHandoffArtifact
  try {
    artifact = xhsCoverHandoffArtifactSchema.parse(JSON.parse(content))
  } catch {
    return reject('XHS_TITLE_PAIR_CONTRACT_MISSING', 'cover handoff Artifact is absent, malformed, or incomplete')
  }
  const { artifact_id: artifactId, artifact_sha256: artifactSha256, ...payload } = artifact
  const actualHash = sha256(payloadText(handoffPayloadSchema.parse(payload)))
  if (artifactSha256 !== actualHash || artifactId !== `xhs-cover-handoff-${actualHash}`) {
    return reject('XHS_BODY_TITLE_P1_PAIR_FAILED', 'cover handoff Artifact identity or hash is invalid')
  }
  return Object.freeze(artifact)
}

/**
 * Serialize one verified handoff with a single trailing newline.
 * @param artifact - Complete immutable handoff.
 * @returns stable UTF-8 JSON.
 */
export function serializeXhsCoverHandoffArtifact(artifact: XhsCoverHandoffArtifact): string {
  const verified = parseXhsCoverHandoffArtifact(`${JSON.stringify(artifact)}\n`)
  return `${JSON.stringify(verified, null, 2)}\n`
}
