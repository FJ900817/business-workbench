/** Deterministic route and validation for XHS cover-plan handoff replay. */

import { z } from 'zod'
import { BusinessWorkbenchError } from './errors.ts'
import { parseXhsCoverHandoffArtifact } from './xhs-cover-handoff.ts'
import type { XhsCoverHandoffArtifact } from './xhs-cover-handoff.ts'

/** Cover-plan structure validated without model or image execution. */
export const XHS_COVER_PLAN_VERSION = 'xhs-cover-plan-v0.1' as const

const pageSchema = z.object({
  page: z.enum(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']),
  templateId: z.enum(['S01', 'S02', 'S06', 'S05', 'S03_G3.7-B_POSTER', 'S10', 'S07', 'S12']),
  objective: z.string().min(1),
  title: z.object({
    lines: z.tuple([z.string().min(1), z.string().min(1)]),
    hanCharacters: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
    status: z.literal('PASS'),
  }).strict(),
  bodyDirection: z.string().min(1),
  image: z.discriminatedUnion('count', [
    z.object({ count: z.literal(0), requirement: z.null() }).strict(),
    z.object({
      count: z.literal(1),
      requirement: z.object({
        fieldId: z.literal('page.image.hero'),
        width: z.literal(920),
        height: z.literal(446.59375),
        aspectRatio: z.literal('2.060038:1'),
        objectFit: z.literal('cover'),
        objectPosition: z.literal('50% 55%'),
        direction: z.string().min(1),
        sourceRequired: z.literal(true),
      }).strict(),
    }).strict(),
  ]),
  proofPoint: z.string().min(1),
  prohibitions: z.array(z.string().min(1)).min(1),
  continuity: z.string().min(1),
}).strict()

/** Complete P1-P8 shadow Cover Plan. */
export const xhsCoverPlanSchema = z.object({
  planVersion: z.literal(XHS_COVER_PLAN_VERSION),
  status: z.literal('PASS'),
  sourceHandoffArtifactId: z.string().min(1),
  sourceHandoffArtifactSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  sourceNoteSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  route: z.object({
    noteType: z.literal('search_solution'),
    visualFamily: z.literal('Swiss'),
    visualRoute: z.literal('search_solution'),
    templateLibraryVersion: z.literal('V2_1_Swiss_Purple_QingYa'),
    titleRuleAuthority: z.literal('shared-swiss-production-rule'),
    englishNodes: z.tuple([z.literal('SENSE'), z.literal('JUDGE'), z.literal('ACT')]),
    p5ImageSlotSource: z.literal('Swiss_recommendation'),
  }).strict(),
  pageOrder: z.tuple([
    z.literal('P1'), z.literal('P2'), z.literal('P3'), z.literal('P4'),
    z.literal('P5'), z.literal('P6'), z.literal('P7'), z.literal('P8'),
  ]),
  pages: z.tuple([pageSchema, pageSchema, pageSchema, pageSchema, pageSchema, pageSchema, pageSchema, pageSchema]),
  gates: z.object({
    sourceNote: z.literal('PASS'),
    titlePairContract: z.literal('PASS'),
    route: z.literal('PASS'),
    templateSequence: z.literal('PASS'),
    titleContract: z.literal('PASS'),
    imageSlots: z.literal('PASS'),
  }).strict(),
  createdAt: z.string().min(1),
}).strict()

/** Complete validated P1-P8 cover plan. */
export type XhsCoverPlan = z.infer<typeof xhsCoverPlanSchema>

/** Semantic inputs supplied for one page; structural fields are Host-owned. */
export interface XhsCoverPlanPageInput {
  readonly page: XhsCoverPlan['pageOrder'][number]
  readonly objective: string
  readonly title: readonly [string, string]
  readonly bodyDirection: string
  readonly imageDirection?: string
  readonly proofPoint: string
  readonly prohibitions: readonly string[]
  readonly continuity: string
}

const PAGE_ORDER = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'] as const
const TEMPLATE_ORDER = ['S01', 'S02', 'S06', 'S05', 'S03_G3.7-B_POSTER', 'S10', 'S07', 'S12'] as const
const TITLE_RANGES = [
  [[5, 6], [7, 8]], [[6, 7], [5, 6]], [[5, 6], [5, 6]], [[5, 6], [5, 6]],
  [[5, 6], [5, 6]], [[5, 6], [5, 6]], [[5, 6], [5, 6]], [[5, 6], [5, 6]],
] as const

function reject(message: string): never {
  throw new BusinessWorkbenchError('XHS_COVER_PLAN_INVALID', `business-workbench: ${message}`)
}

/**
 * Count Chinese Han characters under the formal Swiss title rule.
 * @param value - One controlled title line.
 * @returns Han-character count; digits and punctuation do not contribute.
 */
export function countXhsSwissTitleCharacters(value: string): number {
  return (value.match(/\p{Script=Han}/gu) ?? []).length
}

function assertTitleContract(index: number, page: string, counts: readonly [number, number]): void {
  const ranges = TITLE_RANGES[index]
  if (ranges === undefined) return reject('Cover Plan title range is unavailable')
  const [[firstMin, firstMax], [secondMin, secondMax]] = ranges
  if (counts[0] < firstMin || counts[0] > firstMax || counts[1] < secondMin || counts[1] > secondMax) {
    return reject(`${page} title violates the shared Swiss line capacity`)
  }
  if (page === 'P1' && counts[1] <= counts[0]) {
    return reject('P1 second title line must be strictly longer than the first')
  }
}

function verifiedHandoff(artifact: XhsCoverHandoffArtifact): XhsCoverHandoffArtifact {
  return parseXhsCoverHandoffArtifact(`${JSON.stringify(artifact)}\n`)
}

/**
 * Build and validate the fixed search-solution Swiss Cover Plan.
 * @param request - Verified handoff, eight semantic page inputs, and creation time.
 * @returns Host-authored route, line counts, image slots, and plan gates.
 */
export function buildXhsSearchSolutionCoverPlan(request: {
  readonly handoff: XhsCoverHandoffArtifact
  readonly pages: readonly XhsCoverPlanPageInput[]
  readonly createdAt: string
}): XhsCoverPlan {
  const handoff = verifiedHandoff(request.handoff)
  if (handoff.note_type !== 'search_solution'
    || handoff.template_family !== 'swiss'
    || handoff.visual_route !== 'search_solution'
    || handoff.template_library_version !== 'V2_1_Swiss_Purple_QingYa') {
    return reject('handoff route differs from the fixed search_solution Swiss route')
  }
  if (request.pages.length !== PAGE_ORDER.length) return reject('Cover Plan must contain exactly P1-P8')
  const pages = request.pages.map((input, index) => {
    const expectedPage = PAGE_ORDER[index]
    const templateId = TEMPLATE_ORDER[index]
    const ranges = TITLE_RANGES[index]
    if (expectedPage === undefined || templateId === undefined || ranges === undefined || input.page !== expectedPage) {
      return reject('Cover Plan page order differs from P1-P8')
    }
    const counts = input.title.map(countXhsSwissTitleCharacters) as [number, number]
    assertTitleContract(index, expectedPage, counts)
    const image = expectedPage === 'P5'
      ? {
        count: 1 as const,
        requirement: {
          fieldId: 'page.image.hero' as const,
          width: 920 as const,
          height: 446.59375 as const,
          aspectRatio: '2.060038:1' as const,
          objectFit: 'cover' as const,
          objectPosition: '50% 55%' as const,
          direction: input.imageDirection ?? reject('P5 requires one explicit image direction'),
          sourceRequired: true as const,
        },
      }
      : { count: 0 as const, requirement: null }
    if (expectedPage !== 'P5' && input.imageDirection !== undefined) return reject(`${expectedPage} must not declare an image`)
    return {
      page: expectedPage,
      templateId,
      objective: input.objective,
      title: { lines: input.title, hanCharacters: counts, status: 'PASS' as const },
      bodyDirection: input.bodyDirection,
      image,
      proofPoint: input.proofPoint,
      prohibitions: input.prohibitions,
      continuity: input.continuity,
    }
  })
  const verifiedNumber = handoff.title_pair_contract.verified_number
  if (verifiedNumber !== null && !pages[0]?.title.lines.join('').includes(String(verifiedNumber))) {
    return reject('P1 title omits the approved verified_number')
  }
  return Object.freeze(xhsCoverPlanSchema.parse({
    planVersion: XHS_COVER_PLAN_VERSION,
    status: 'PASS',
    sourceHandoffArtifactId: handoff.artifact_id,
    sourceHandoffArtifactSha256: handoff.artifact_sha256,
    sourceNoteSha256: handoff.source_note_sha256,
    route: {
      noteType: 'search_solution',
      visualFamily: 'Swiss',
      visualRoute: 'search_solution',
      templateLibraryVersion: 'V2_1_Swiss_Purple_QingYa',
      titleRuleAuthority: 'shared-swiss-production-rule',
      englishNodes: ['SENSE', 'JUDGE', 'ACT'],
      p5ImageSlotSource: 'Swiss_recommendation',
    },
    pageOrder: PAGE_ORDER,
    pages,
    gates: {
      sourceNote: 'PASS',
      titlePairContract: 'PASS',
      route: 'PASS',
      templateSequence: 'PASS',
      titleContract: 'PASS',
      imageSlots: 'PASS',
    },
    createdAt: request.createdAt,
  }))
}

/**
 * Revalidate a persisted Cover Plan, including Host-derived title counts and slots.
 * @param plan - Unknown persisted JSON value.
 * @returns the validated plan.
 */
export function parseXhsCoverPlan(plan: unknown): XhsCoverPlan {
  const parsed = xhsCoverPlanSchema.safeParse(plan)
  if (!parsed.success) return reject('Cover Plan is malformed or incomplete')
  for (const [index, page] of parsed.data.pages.entries()) {
    const expectedPage = PAGE_ORDER[index]
    const expectedTemplate = TEMPLATE_ORDER[index]
    const counts = page.title.lines.map(countXhsSwissTitleCharacters)
    if (page.page !== expectedPage || page.templateId !== expectedTemplate
      || page.title.hanCharacters[0] !== counts[0] || page.title.hanCharacters[1] !== counts[1]) {
      return reject('Cover Plan contains forged page, template, or title-count evidence')
    }
    assertTitleContract(index, page.page, counts as [number, number])
    const expectedImageCount = page.page === 'P5' ? 1 : 0
    if (page.image.count !== expectedImageCount) return reject('Cover Plan image slots differ from the fixed route')
  }
  return Object.freeze(parsed.data)
}
