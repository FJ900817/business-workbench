import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  assertXhsLengthRepairEligibility,
  buildXhsLengthRepairApproval,
  buildXhsReviewArtifactDocument,
  countXhsFullCharacters,
  projectXhsExecutionContract,
  settleXhsLengthRepairProposal,
  validateXhsDraft,
  xhsLengthRepairProposalSchema,
} from '../src/index.ts'

function taskCard(title = '2—4', body = '3—5'): string {
  return [
    '> [!note]- 机器执行参数',
    '>',
    '> - task_id：T-A1-20260809-099',
    '> - topic_id：C099',
    '> - status：已确认',
    '> - note_type：热点流量型（hot_traffic）',
    '> - account：账号1',
    '> - production_month：2026-08',
    '> - production_week：第01周',
    '> - note：note099',
    '> - SEO高亮词：无',
    '> - compiler_version：XHS-PROD-1.3',
    '>',
    `> **标题：** 类型｜${title}全字符`,
    '>',
    `> **正文：** ${body}全字符`,
    '>',
    '> **评论：** 置顶1条 + 非置顶2条',
    '>',
    '> **关键词执行**',
    '>',
    '> - 无正式关键词',
    '>',
    '> **正文结构**',
    '>',
    '> - 保持核心判断',
    '>',
    '> **评论区**',
    '>',
    '> - 禁止虚构经历',
    '>',
    '> **10个关联话题**',
    '>',
    '> #甲 #乙 #丙 #丁 #戊 #己 #庚 #辛 #壬 #癸',
    '>',
    '> **转化模式**',
    '>',
    '> - 产品模块：测试模块',
  ].join('\n')
}

function draft(title = '甲', body = '核心甲乙丙丁戊己'): string {
  return [
    `# ${title}`,
    '',
    `标题字符数：${countXhsFullCharacters(title)} + 正文字符数：${countXhsFullCharacters(body)}`,
    '',
    body,
    '',
    '## 置顶评论',
    '',
    '置顶保持',
    '',
    '## 非置顶评论',
    '',
    '评论1：',
    '评论一保持',
    '',
    '评论2：',
    '评论二保持',
    '',
    '## 关联话题',
    '',
    '#甲 #乙 #丙 #丁 #戊 #己 #庚 #辛 #壬 #癸',
  ].join('\n')
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function fixture(titleRange = '2—4', bodyRange = '3—5', source = draft()) {
  const projection = projectXhsExecutionContract(taskCard(titleRange, bodyRange))
  const validation = validateXhsDraft(source, projection)
  const review = buildXhsReviewArtifactDocument({
    review_version: 2,
    project: 'xhs',
    source_job_id: '00000000-0000-4000-8000-000000000001' as never,
    source_attempt_id: '00000000-0000-4000-8000-000000000002' as never,
    source_artifact_id: `output_bundle_${'a'.repeat(64)}` as never,
    source_artifact_path: 'source/draft.md',
    source_draft_sha256: hash(source),
    source_candidate_type: 'revision',
    source_revision_number: 2,
    review_result: 'PASS',
    required_changes: [],
    quality_suggestions: [],
    preserve: ['核心'],
    reviewer_type: 'human',
    reviewed_at: 1,
    provenance: { source_output_bundle_id: `output_bundle_${'a'.repeat(64)}` as never, source: 'authoritative-intermediate-output-bundle' },
  }).document
  return { projection, validation, review, source }
}

function proposal(titleCandidates = ['甲乙'], bodyOptions = [{ patches: [{ old_text: '核心甲乙丙丁戊己', new_text: '核心甲乙' }] }]): string {
  return JSON.stringify({ proposal_version: 1, title_candidates: titleCandidates, body_options: bodyOptions })
}

describe('XHS bounded length repair', () => {
  it('admits a PASS review with titleRange and bodyRange failures', () => {
    expect(assertXhsLengthRepairEligibility(fixture().review, fixture().validation)).toEqual({
      status: 'LENGTH_REPAIR_READY', failedContractItems: ['titleRange', 'bodyRange'],
    })
  })

  it('admits titleRange as the only failure', () => {
    const current = fixture('2—4', '3—20')
    expect(assertXhsLengthRepairEligibility(current.review, current.validation).failedContractItems).toEqual(['titleRange'])
  })

  it('admits bodyRange as the only failure', () => {
    const current = fixture('1—4', '3—5')
    expect(assertXhsLengthRepairEligibility(current.review, current.validation).failedContractItems).toEqual(['bodyRange'])
  })

  it('blocks a non-PASS business Review', () => {
    const current = fixture()
    expect(() => assertXhsLengthRepairEligibility({ ...current.review, review_result: 'FAIL' }, current.validation))
      .toThrow(expect.objectContaining({ code: 'XHS_LENGTH_REPAIR_NOT_ALLOWED' }))
  })

  it('blocks Format failure', () => {
    const current = fixture('2—4', '3—5', 'not a draft')
    expect(() => assertXhsLengthRepairEligibility(current.review, current.validation)).toThrow('only titleRange or bodyRange')
  })

  it('blocks comment or topic failures', () => {
    const source = draft().replace('评论2：', '另一个标签：')
    const current = fixture('2—4', '3—5', source)
    expect(() => assertXhsLengthRepairEligibility(current.review, current.validation)).toThrow('only titleRange or bodyRange')
  })

  it('blocks a Review SHA mismatch', () => {
    const current = fixture()
    expect(() => assertXhsLengthRepairEligibility({ ...current.review, source_draft_sha256: 'b'.repeat(64) }, current.validation))
      .toThrow('different source drafts')
  })

  it('rejects an entire draft instead of accepting it as a proposal', () => {
    const current = fixture()
    expect(settleXhsLengthRepairProposal(current.source, current.source, current.review, current.validation, current.projection).status)
      .toBe('PROPOSAL_INVALID')
  })

  it('rejects extra proposal fields that could carry a complete draft', () => {
    expect(xhsLengthRepairProposalSchema.safeParse({ proposal_version: 1, title_candidates: [], body_options: [], draft: 'full' }).success).toBe(false)
  })

  it('marks an absent old_text patch invalid', () => {
    const current = fixture()
    const result = settleXhsLengthRepairProposal(proposal(['甲乙'], [{ patches: [{ old_text: '不存在', new_text: '短句' }] }]),
      current.source, current.review, current.validation, current.projection)
    expect(result.status).toBe('LENGTH_REPAIR_UNSATISFIED')
    expect(result.trials[0]).toMatchObject({ status: 'PATCH_INVALID' })
  })

  it('marks a repeated old_text patch invalid', () => {
    const source = draft('甲', '核心核心甲乙丙丁')
    const current = fixture('2—4', '3—5', source)
    const result = settleXhsLengthRepairProposal(proposal(['甲乙'], [{ patches: [{ old_text: '核心', new_text: '核' }] }]),
      source, current.review, current.validation, current.projection)
    expect(result.trials[0]).toMatchObject({ status: 'PATCH_INVALID' })
  })

  it('rejects overlapping patches', () => {
    const current = fixture()
    const result = settleXhsLengthRepairProposal(proposal(['甲乙'], [{ patches: [
      { old_text: '核心甲乙', new_text: '核心' }, { old_text: '甲乙丙', new_text: '甲' },
    ] }]), current.source, current.review, current.validation, current.projection)
    expect(result.trials[0]).toMatchObject({ status: 'PATCH_INVALID', reason: 'body patches overlap' })
  })

  it('cannot modify comments through a body patch', () => {
    const current = fixture()
    const result = settleXhsLengthRepairProposal(proposal(['甲乙'], [{ patches: [{ old_text: '评论一保持', new_text: '修改评论' }] }]),
      current.source, current.review, current.validation, current.projection)
    expect(result.trials[0]).toMatchObject({ status: 'PATCH_INVALID' })
  })

  it('cannot modify topics through a body patch', () => {
    const current = fixture()
    const result = settleXhsLengthRepairProposal(proposal(['甲乙'], [{ patches: [{ old_text: '#甲', new_text: '#替换' }] }]),
      current.source, current.review, current.validation, current.projection)
    expect(result.trials[0]).toMatchObject({ status: 'PATCH_INVALID' })
  })

  it('requires every Review preserve string to survive', () => {
    const current = fixture()
    const result = settleXhsLengthRepairProposal(proposal(['甲乙'], [{ patches: [{ old_text: '核心甲乙丙丁戊己', new_text: '甲乙' }] }]),
      current.source, current.review, current.validation, current.projection)
    expect(result.trials[0]).toMatchObject({ status: 'HARD_CONTRACT_FAIL', reason: 'protected Review content changed' })
  })

  it('Host generates exact title/body metadata with the validator character counter', () => {
    const current = fixture()
    const result = settleXhsLengthRepairProposal(proposal(), current.source, current.review, current.validation, current.projection)
    expect(result.status).toBe('CANDIDATE_READY')
    if (result.status !== 'CANDIDATE_READY') return
    expect(result.draft).toContain('标题字符数：2 + 正文字符数：4')
    expect(validateXhsDraft(result.draft, current.projection).facts).toMatchObject({ actualTitleCharacters: 2, actualBodyCharacters: 4,
      modelDeclaredTitleCharacters: 2, modelDeclaredBodyCharacters: 4 })
  })

  it('trials each body option from the unchanged source', () => {
    const current = fixture()
    const result = settleXhsLengthRepairProposal(proposal(['甲乙'], [
      { patches: [{ old_text: '核心甲乙丙丁戊己', new_text: '核心甲乙' }] },
      { patches: [{ old_text: '核心甲乙丙丁戊己', new_text: '核心甲乙丙' }] },
    ]), current.source, current.review, current.validation, current.projection)
    expect(result.trials).toHaveLength(2)
    expect(result.trials.every(trial => trial.status === 'PASS')).toBe(true)
  })

  it('returns UNSATISFIED without a Candidate when every trial fails', () => {
    const current = fixture()
    const result = settleXhsLengthRepairProposal(proposal(['仍然太长标题'], [{ patches: [{ old_text: '核心甲乙丙丁戊己', new_text: '还是非常长的正文内容' }] }]),
      current.source, current.review, current.validation, current.projection)
    expect(result).toMatchObject({ status: 'LENGTH_REPAIR_UNSATISFIED' })
    expect(result).not.toHaveProperty('draft')
  })

  it('selects the passing trial with the smallest edit distance', () => {
    const current = fixture()
    const result = settleXhsLengthRepairProposal(proposal(['甲乙', '甲乙丙'], [
      { patches: [{ old_text: '核心甲乙丙丁戊己', new_text: '核心甲乙' }] },
      { patches: [{ old_text: '核心甲乙丙丁戊己', new_text: '核心甲乙丙' }] },
    ]), current.source, current.review, current.validation, current.projection)
    expect(result.status).toBe('CANDIDATE_READY')
    if (result.status === 'CANDIDATE_READY') expect(result.selected).toMatchObject({ titleCandidateIndex: 0, bodyOptionIndex: 1 })
  })

  it('returns exactly one repaired Candidate while preserving the source bytes', () => {
    const current = fixture()
    const before = Buffer.from(current.source)
    const result = settleXhsLengthRepairProposal(proposal(), current.source, current.review, current.validation, current.projection)
    expect(result.status).toBe('CANDIDATE_READY')
    expect(Buffer.from(current.source)).toEqual(before)
    expect(result).toHaveProperty('draft')
  })

  it.each([
    ['APPROVE', 'APPROVED', 'PROMOTION_ELIGIBLE'],
    ['REJECT', 'REJECTED', 'STOP'],
  ] as const)('turns %s into a terminal approval state without another repair', (decision, status, next) => {
    const current = fixture()
    const result = settleXhsLengthRepairProposal(proposal(), current.source, current.review, current.validation, current.projection)
    if (result.status !== 'CANDIDATE_READY') throw new Error('fixture did not produce a Candidate')
    expect(buildXhsLengthRepairApproval(result, decision, 2)).toMatchObject({ decision, status, next, decided_at: 2 })
  })

  it('caps proposals at three title candidates and three body options', () => {
    expect(xhsLengthRepairProposalSchema.safeParse({ proposal_version: 1,
      title_candidates: ['一', '二', '三', '四'], body_options: [] }).success).toBe(false)
    expect(xhsLengthRepairProposalSchema.safeParse({ proposal_version: 1, title_candidates: [],
      body_options: Array.from({ length: 4 }, () => ({ patches: [{ old_text: '旧', new_text: '新' }] })) }).success).toBe(false)
  })
})
