import { describe, expect, it } from 'vitest'
import {
  buildXhsCoverHandoffArtifact,
  buildXhsSearchSolutionCoverPlan,
  countXhsSwissTitleCharacters,
  parseXhsCoverHandoffArtifact,
  parseXhsCoverPlan,
  serializeXhsCoverHandoffArtifact,
  type XhsCoverPlanPageInput,
} from '../src/index.ts'

const sourceContent = `---
content_status: final
finalized_at: 2026-09-05T22:37:23+0800
---
## 标题（19全字符）

设计师审美提升难？每天20分钟分4步练

## 正文（12全字符）

每天20分钟，按看、拆、存、仿练习。
`

const sha256 = '9e468003c5fee0bad7f2a1594b74c595585883d918633da4a140e438fe8f41ef'

function handoff() {
  return buildXhsCoverHandoffArtifact({
    sourceNote: {
      path: 'project/account2/2026-08/第02周/note001/小红书笔记完整方案.md',
      content: sourceContent,
      expectedSha256: sha256,
      noteId: 'account2-2026-08-week02-note001',
      noteType: 'search_solution',
    },
    route: {
      templateFamily: 'swiss', visualRoute: 'search_solution', templateLibraryVersion: 'V2_1_Swiss_Purple_QingYa',
    },
    titlePairContract: {
      body_title: '设计师审美提升难？每天20分钟分4步练',
      core_problem_or_object: '想提升设计审美，但不知道每天练什么、怎么练、练多久。',
      core_answer_or_judgment: '按看、拆、存、仿建立每天可执行的训练步骤。',
      verified_number: '20分钟',
      p1_title_direction: '突出不知道怎么练的痛点，以每天20分钟作为行动抓手。',
    },
    fieldSources: {
      body_title: { stage: 's3-finalization', method: 'deterministic-copy', reference: 'final-body-title' },
      core_problem_or_object: { stage: 'human-business-decision', method: 'human-confirmed', reference: 'decision' },
      core_answer_or_judgment: { stage: 'human-business-decision', method: 'human-confirmed', reference: 'decision' },
      verified_number: { stage: 'human-business-decision', method: 'human-confirmed', reference: 'decision' },
      p1_title_direction: { stage: 'human-business-decision', method: 'human-confirmed', reference: 'decision' },
    },
    decisionSource: { kind: 'human-confirmed', reference: 'account2-note001-title-pair-v0.1' },
    createdAt: '2026-09-11T12:00:00+08:00',
    lineage: {
      project: 'xhs', account: 'account2', production_month: '2026-08', production_week: '第02周', note: 'note001',
      task_id: 'T-A2-20260902-001', topic_id: 'L04',
      task_card_path: 'project/account2/2026-08/第02周/note001/写作任务卡.md',
      task_card_sha256: '2b7fa0029d1f4776b62a57b53f0048951f757cdaaf053e97fb01fa87beb7b321',
    },
  })
}

const pageInputs = [
  ['P1', ['审美怎么练', '每天只安排20分钟']],
  ['P2', ['不是看得更多', '而是判断更清']],
  ['P3', ['看拆存仿四步', '把感觉变判断']],
  ['P4', ['训练容易卡住', '先避开三件事']],
  ['P5', ['一个局部案例', '拆清判断依据']],
  ['P6', ['每天只练20分钟', '按四步练判断']],
  ['P7', ['练审美别贪多', '每次只练一点']],
  ['P8', ['审美训练清单', '每天照着练习']],
] as const

describe('XHS cover handoff and plan', () => {
  it('builds and revalidates one immutable five-field handoff', () => {
    const built = handoff()
    expect(parseXhsCoverHandoffArtifact(serializeXhsCoverHandoffArtifact(built))).toEqual(built)
    expect(built.title_pair_contract.verified_number).toBe('20分钟')
  })

  it('blocks missing title-pair fields and source-title conflicts', () => {
    expect(() => buildXhsCoverHandoffArtifact({
      ...handoffRequest(),
      titlePairContract: { ...handoffRequest().titlePairContract, body_title: '' },
    })).toThrow(expect.objectContaining({ code: 'XHS_TITLE_PAIR_CONTRACT_MISSING' }))
    expect(() => buildXhsCoverHandoffArtifact({
      ...handoffRequest(),
      titlePairContract: { ...handoffRequest().titlePairContract, body_title: '另一标题' },
    })).toThrow(expect.objectContaining({ code: 'XHS_BODY_TITLE_P1_PAIR_FAILED' }))
  })

  it('locks the Swiss route, title lines, English nodes, and sole P5 image slot', () => {
    const plan = buildXhsSearchSolutionCoverPlan({
      handoff: handoff(),
      createdAt: '2026-09-11T12:01:00+08:00',
      pages: pageInputs.map(([page, title]) => ({
        page,
        title,
        objective: `${page} objective`,
        bodyDirection: `${page} body direction`,
        ...(page === 'P5' ? { imageDirection: 'one sourced design detail' } : {}),
        proofPoint: `${page} proof`,
        prohibitions: ['no invented facts'],
        continuity: `${page} continuity`,
      })),
    })
    expect(parseXhsCoverPlan(plan)).toEqual(plan)
    expect(plan.pages.map(page => page.templateId)).toEqual(['S01', 'S02', 'S06', 'S05', 'S03_G3.7-B_POSTER', 'S10', 'S07', 'S12'])
    expect(plan.pages.map(page => page.image.count)).toEqual([0, 0, 0, 0, 1, 0, 0, 0])
    expect(plan.route.englishNodes).toEqual(['SENSE', 'JUDGE', 'ACT'])
  })

  it('rejects a title-capacity violation before a plan is emitted', () => {
    const pages: XhsCoverPlanPageInput[] = pageInputs.map(([page, title]) => ({
      page,
      title,
      objective: `${page} objective`,
      bodyDirection: `${page} body direction`,
      ...(page === 'P5' ? { imageDirection: 'one sourced design detail' } : {}),
      proofPoint: `${page} proof`,
      prohibitions: ['no invented facts'],
      continuity: `${page} continuity`,
    }))
    pages[0] = { ...pages[0]!, title: ['太短', '仍然太短'] }
    expect(() => buildXhsSearchSolutionCoverPlan({ handoff: handoff(), pages, createdAt: '2026-09-11T12:01:00+08:00' }))
      .toThrow(expect.objectContaining({ code: 'XHS_COVER_PLAN_INVALID' }))
  })

  it('rechecks title capacity when a persisted plan is parsed', () => {
    const plan = buildXhsSearchSolutionCoverPlan({
      handoff: handoff(),
      createdAt: '2026-09-11T12:01:00+08:00',
      pages: pageInputs.map(([page, title]) => ({
        page,
        title,
        objective: `${page} objective`,
        bodyDirection: `${page} body direction`,
        ...(page === 'P5' ? { imageDirection: 'one sourced design detail' } : {}),
        proofPoint: `${page} proof`,
        prohibitions: ['no invented facts'],
        continuity: `${page} continuity`,
      })),
    })
    const forged = structuredClone(plan)
    forged.pages[0].title.lines = ['太短', '每天只安排20分钟']
    forged.pages[0].title.hanCharacters = [2, 7]
    expect(() => parseXhsCoverPlan(forged))
      .toThrow(expect.objectContaining({ code: 'XHS_COVER_PLAN_INVALID' }))
  })

  it('uses the formal Han-only title count', () => {
    expect(countXhsSwissTitleCharacters('每天只练20分钟')).toBe(6)
  })
})

function handoffRequest(): Parameters<typeof buildXhsCoverHandoffArtifact>[0] {
  const built = handoff()
  return {
    sourceNote: {
      path: built.source_note_path,
      content: sourceContent,
      expectedSha256: built.source_note_sha256,
      noteId: built.note_id,
      noteType: built.note_type,
    },
    route: {
      templateFamily: built.template_family,
      visualRoute: built.visual_route,
      templateLibraryVersion: built.template_library_version,
    },
    titlePairContract: built.title_pair_contract,
    fieldSources: built.field_sources,
    decisionSource: built.decision_source,
    createdAt: built.created_at,
    lineage: built.lineage,
  }
}
