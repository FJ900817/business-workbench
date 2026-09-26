import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  buildXhsHardValidationArtifact,
  parseXhsDraftFormat,
  projectXhsExecutionContract,
  replayXhsHistoricalDraft,
  renderXhsExecutionChecklist,
  validateXhsDraft,
  xhsHardValidationArtifactSchema,
} from '../src/index.ts'
import { compileXhsTaskCardContract } from '../src/xhs-task-card-contract.ts'

function taskCard(noteType = '干货搜索型（dry_search）'): string {
  return [
    'human-readable material outside the machine section',
    '> [!note]- 机器执行参数',
    '>',
    '> - task_id：T-A1-20260809-099',
    '> - topic_id：C099',
    '> - status：已确认',
    `> - note_type：${noteType}`,
    '> - account：账号1',
    '> - production_month：2026-08',
    '> - production_week：第01周',
    '> - note：note099',
    '> - SEO高亮词：甲',
    '> - compiler_version：XHS-PROD-1.3',
    '>',
    '> **标题：** 类型｜2—4全字符',
    '>',
    '> **正文：** 3—5全字符',
    '>',
    '> **评论：** 置顶1条 + 非置顶2条',
    '>',
    '> **关键词执行**',
    '>',
    '> - 主词：甲（标题×1 / 开头×1）',
    '> - 语义词：乙（中段×1，产品价值词）',
    '> - 「近义词」不得替代主词',
    '> - 关键词源文保持纯文本，禁止 Markdown 手工加粗',
    '>',
    '> **正文结构**',
    '>',
    '> - 开头：先提出问题',
    '> - 结尾：承接产品',
    '>',
    '> **评论区**',
    '>',
    '> - 置顶：补充方法',
    '> - 禁止虚构经历',
    '>',
    '> **10个关联话题**',
    '>',
    '> #甲 #乙 #丙 #丁 #戊 #己 #庚 #辛 #壬 #癸',
    '>',
    '> **转化模式**',
    '>',
    '> - 产品模块：测试模块',
    '',
  ].join('\n')
}

describe('XHS hard contract projection', () => {
  it.each([
    ['干货搜索型（dry_search）', 'dry-search'],
    ['干货推荐型（recommendation）', 'recommendation'],
    ['热点流量型（hot_traffic）', 'hot-traffic'],
  ] as const)('projects %s without adding rules', (source, expected) => {
    const projection = projectXhsExecutionContract(taskCard(source))
    expect(projection).toMatchObject({
      version: 3,
      schemaVersion: 2,
      compilerVersion: 'XHS-PROD-1.3',
      project: 'xhs',
      account: 'account1',
      production: { month: '2026-08', week: '第01周', note: 'note099' },
      taskId: 'T-A1-20260809-099',
      topicId: 'C099',
      noteType: expected,
      status: '已确认',
      confirmed: true,
      titleRange: { min: 2, max: 4 },
      bodyRange: { min: 3, max: 5 },
      comments: { pinned: 1, unpinned: 2 },
      topicCount: 10,
      allowedTopics: ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'],
      productModule: '测试模块',
      requiredBodyStructure: ['开头：先提出问题', '结尾：承接产品'],
      explicitProhibitions: ['关键词源文保持纯文本，禁止 Markdown 手工加粗', '禁止虚构经历'],
    })
    expect(projection.requiredExactKeywords).toEqual([
      { keyword: '甲', requiredLocations: [{ location: '标题', count: 1 }, { location: '开头', count: 1 }] },
      { keyword: '乙', requiredLocations: [{ location: '中段', count: 1 }] },
    ])
    const checklist = renderXhsExecutionChecklist(projection)
    expect(checklist).toContain('【本篇执行硬合同】')
    expect(checklist).toContain('【输出格式】')
    expect(checklist).toContain('## 非置顶评论')
    expect(checklist).toContain('不要输出完整方案')
    expect(checklist).toContain('甲（标题×1 / 开头×1）')
    expect(checklist).toContain('字符数由 Host 计算，模型自报不作为生产事实')
    expect(checklist).toContain('- 关联话题：#甲 #乙 #丙 #丁 #戊 #己 #庚 #辛 #壬 #癸')
    expect(checklist).not.toContain('human-readable material outside the machine section')
  })

  it('compiles an explicit no-keyword machine contract without treating a missing field as empty', () => {
    const source = taskCard('热点流量型（hot_traffic）')
      .replace('> - SEO高亮词：甲', '> - SEO高亮词：无')
      .replace(/^> - (?:主词|语义词)：.+\n/gmu, '')
    const projection = projectXhsExecutionContract(source)
    expect(projection.requiredExactKeywords).toEqual([])
    expect(renderXhsExecutionChecklist(projection)).toContain('- 精确关键词：无')
    expect(() => projectXhsExecutionContract(source.replace('> - SEO高亮词：无\n', ''))).toThrow('TaskCard lacks SEO高亮词')
  })

  it('compiles deterministically, remains idempotent, and never mutates TaskCard business content', () => {
    const source = taskCard()
    const before = Buffer.from(source)
    const first = compileXhsTaskCardContract(source)
    const second = compileXhsTaskCardContract(source)
    expect(second).toEqual(first)
    expect(Buffer.from(source).equals(before)).toBe(true)
  })

  it.each([
    ['note_type', (value: string) => value.replace(/> - note_type：.+\n/u, '')],
    ['标题 range', (value: string) => value.replace(/> \*\*标题：\*\*.+\n/u, '')],
    ['正文 range', (value: string) => value.replace(/> \*\*正文：\*\*.+\n/u, '')],
    ['comment counts', (value: string) => value.replace(/> \*\*评论：\*\*.+\n/u, '')],
    ['SEO高亮词', (value: string) => value.replace(/^> - SEO高亮词：.+\n/mu, '')],
    ['正文结构', (value: string) => value.replace(/> \*\*正文结构\*\*[\s\S]*?> \*\*评论区\*\*/u, '> **评论区**')],
    ['topic count', (value: string) => value.replace(/> \*\*10个关联话题\*\*\n/u, '')],
    ['产品模块', (value: string) => value.replace(/> - 产品模块：.+\n/u, '')],
  ])('rejects a TaskCard without %s', (description, mutate) => {
    expect(() => projectXhsExecutionContract(mutate(taskCard()))).toThrow(`TaskCard lacks ${description}`)
  })

  it('rejects reversed ranges and keywords without machine locations', () => {
    expect(() => projectXhsExecutionContract(taskCard().replace('2—4全字符', '4—2全字符'))).toThrow('range is reversed')
    expect(() => projectXhsExecutionContract(taskCard().replace('甲（标题×1 / 开头×1）', '甲（自然出现）'))).toThrow("keyword '甲' lacks an exact location")
  })

  it('rejects a mismatched topic count and duplicate TaskCard topics', () => {
    expect(() => projectXhsExecutionContract(taskCard().replace('**10个关联话题**', '**9个关联话题**')))
      .toThrow('topic count does not match')
    expect(() => projectXhsExecutionContract(taskCard().replace('#甲 #乙 #丙 #丁 #戊 #己 #庚 #辛 #壬 #癸', '#甲 #乙 #丙 #丁 #戊 #己 #庚 #辛 #壬 #甲')))
      .toThrow('duplicate topics')
  })

  it('rejects a missing compiler version, unsupported legacy note type, and inconsistent keyword fields', () => {
    expect(() => projectXhsExecutionContract(taskCard().replace(/^> - compiler_version：.+\n/mu, ''))).toThrow('TaskCard lacks compiler_version')
    expect(() => projectXhsExecutionContract(taskCard().replace('> - compiler_version：XHS-PROD-1.3', '> - compiler_version：XHS-PROD-1.3\n> - compiler_version：XHS-PROD-1.3'))).toThrow('duplicate compiler_version')
    expect(() => projectXhsExecutionContract(taskCard('干货搜索型'))).toThrow("note_type '干货搜索型' is unsupported or legacy")
    expect(() => projectXhsExecutionContract(taskCard().replace('> - SEO高亮词：甲', '> - SEO高亮词：丙'))).toThrow('SEO highlight field conflicts')
  })
})

describe('XHS hard contract L1 validation', () => {
  const projection = projectXhsExecutionContract(taskCard())
  const canonicalDraft = [
    '# 甲乙',
    '',
    '标题字符数：99 + 正文字符数：999',
    '',
    '甲乙🙂',
    '',
    '## 置顶评论',
    '',
    '补充',
    '',
    '## 非置顶评论',
    '',
    '评论1：一',
    '评论2：二',
    '',
    '## 关联话题',
    '',
    '#甲 #乙 #丙 #丁 #戊 #己 #庚 #辛 #壬 #癸',
  ].join('\n')

  it('parses the canonical structure and counts Unicode, comments, topics, and declarations independently', () => {
    const result = validateXhsDraft(canonicalDraft, projection)
    expect(result.status).toBe('WARN')
    expect(result.failureClass).toBeNull()
    expect(result.format).toEqual({ contract: 'xhs-draft-markdown-v1', status: 'PASS', issues: [] })
    expect(result.hardContractStatus).toBe('WARN')
    expect(result.facts).toEqual({
      draftSha256: createHash('sha256').update(canonicalDraft).digest('hex'),
      actualTitleCharacters: 2,
      actualBodyCharacters: 3,
      modelDeclaredTitleCharacters: 99,
      modelDeclaredBodyCharacters: 999,
    })
    expect(result.checks).toEqual({
      titleRange: { status: 'PASS', actual: 2, requiredMin: 2, requiredMax: 4 },
      bodyRange: { status: 'PASS', actual: 3, requiredMin: 3, requiredMax: 5 },
      pinnedComments: { status: 'PASS', actual: 1, required: 1 },
      unpinnedComments: { status: 'PASS', actual: 2, required: 2 },
      topics: {
        status: 'PASS', actual: 10, required: 10,
        expected_topics: ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'],
        actual_topics: ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'],
        missing_topics: [], unexpected_topics: [], duplicate_topics: [], order_matches: true,
      },
    })
    expect(result.keywordEvidence).toMatchObject([
      { keyword: '甲', exactOccurrences: 3, minimumOccurrencesPass: true, titleOccurrences: 1, titleRequirementPass: true },
      { keyword: '乙', exactOccurrences: 3, minimumOccurrencesPass: true, titleOccurrences: 1, titleRequirementPass: null },
    ])
  })

  it('classifies an unambiguous content violation as a hard-contract failure', () => {
    const draft = canonicalDraft.replace('# 甲乙', '# 太长的甲标题').replace('甲乙🙂', '一二三四五六')
    const before = Buffer.from(draft)
    const result = validateXhsDraft(draft, projection)
    expect(result).toMatchObject({ status: 'FAIL', failureClass: 'HARD_CONTRACT_FAIL',
      format: { status: 'PASS' }, hardContractStatus: 'FAIL' })
    expect(Object.values(result.checks).some(check => check.status === 'FAIL')).toBe(true)
    expect(Buffer.from(draft).equals(before)).toBe(true)
  })

  it.each([
    ['少1个', '#甲 #乙 #丙 #丁 #戊 #己 #庚 #辛 #壬', ['癸'], [], []],
    ['多1个', '#甲 #乙 #丙 #丁 #戊 #己 #庚 #辛 #壬 #癸 #子', [], ['子'], []],
    ['换1个同义词', '#甲 #乙 #丙 #丁 #戊 #己 #庚 #辛 #壬 #甲同义词', ['癸'], ['甲同义词'], []],
    ['重复1个', '#甲 #乙 #丙 #丁 #戊 #己 #庚 #辛 #壬 #甲', ['癸'], [], ['甲']],
    ['数量正确但其中1个不是任务卡词', '#甲 #乙 #丙 #丁 #戊 #己 #庚 #辛 #壬 #外来词', ['癸'], ['外来词'], []],
    ['顺序改变', '#乙 #甲 #丙 #丁 #戊 #己 #庚 #辛 #壬 #癸', [], [], []],
  ] as const)('deterministically rejects topics when %s', (_case, line, missing, unexpected, duplicates) => {
    const draft = canonicalDraft.replace('#甲 #乙 #丙 #丁 #戊 #己 #庚 #辛 #壬 #癸', line)
    const result = validateXhsDraft(draft, projection)
    expect(result).toMatchObject({ status: 'FAIL', failureClass: 'HARD_CONTRACT_FAIL', hardContractStatus: 'FAIL' })
    expect(result.checks.topics).toMatchObject({
      status: 'FAIL',
      expected_topics: ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'],
      actual_topics: line.split(' ').map(topic => topic.slice(1)),
      missing_topics: [...missing],
      unexpected_topics: [...unexpected],
      duplicate_topics: [...duplicates],
    })
  })

  it.each([
    ['duplicate H1', canonicalDraft.replace('甲乙🙂', '甲乙🙂\n\n# 第二标题'), 'TITLE_HEADING_AMBIGUOUS'],
    ['missing title metadata', canonicalDraft.replace('标题字符数：99 + 正文字符数：999\n\n', ''), 'TITLE_METADATA_MISSING'],
    ['comments section variant', canonicalDraft.replace('## 置顶评论', '**置顶评论：**').replace('## 非置顶评论\n\n评论1：', '**非置顶评论1：**').replace('\n评论2：', '\n**非置顶评论2：**'), 'REQUIRED_SECTION_MISSING'],
    ['malformed section order', canonicalDraft.replace('## 置顶评论\n\n补充\n\n## 非置顶评论\n\n评论1：一\n评论2：二\n\n## 关联话题\n\n#甲 #乙 #丙 #丁 #戊 #己 #庚 #辛 #壬 #癸', '## 关联话题\n\n#甲 #乙 #丙 #丁 #戊 #己 #庚 #辛 #壬 #癸\n\n## 置顶评论\n\n补充\n\n## 非置顶评论\n\n评论1：一\n评论2：二'), 'SECTION_ORDER_INVALID'],
  ])('fails closed for %s without fabricating hard metrics', (_case, draft, issue) => {
    const result = validateXhsDraft(draft, projection)
    expect(result).toMatchObject({
      status: 'FAIL', failureClass: 'FORMAT_CONTRACT_FAIL', hardContractStatus: null,
      facts: { actualTitleCharacters: null, actualBodyCharacters: null },
      checks: {
        titleRange: { status: 'NOT_EVALUATED', actual: null },
        bodyRange: { status: 'NOT_EVALUATED', actual: null },
        pinnedComments: { status: 'NOT_EVALUATED', actual: null },
        unpinnedComments: { status: 'NOT_EVALUATED', actual: null },
        topics: { status: 'NOT_EVALUATED', actual: null },
      },
    })
    expect(result.format.issues).toContain(issue)
    expect(result.keywordEvidence).toEqual([])
    if (_case === 'duplicate H1') {
      expect(replayXhsHistoricalDraft(draft, projection)).toMatchObject({
        recoveryStatus: 'AMBIGUOUS', recoveredDeterministicEvidence: null, hardContractStatus: null,
      })
    }
  })

  it('rejects metadata after the body and topic-before-comments while recovering both read-only', () => {
    const metadataAfterBody = canonicalDraft
      .replace('标题字符数：99 + 正文字符数：999\n\n甲乙🙂', '甲乙🙂\n\n标题字符数：99 + 正文字符数：999')
    const topicBeforeComments = canonicalDraft.replace(
      '## 置顶评论\n\n补充\n\n## 非置顶评论\n\n评论1：一\n评论2：二\n\n## 关联话题\n\n#甲 #乙 #丙 #丁 #戊 #己 #庚 #辛 #壬 #癸',
      '## 关联话题\n\n#甲 #乙 #丙 #丁 #戊 #己 #庚 #辛 #壬 #癸\n\n## 置顶评论\n\n补充\n\n## 非置顶评论\n\n评论1：一\n评论2：二',
    )
    for (const draft of [metadataAfterBody, topicBeforeComments]) {
      expect(parseXhsDraftFormat(draft).status).toBe('FAIL')
      expect(replayXhsHistoricalDraft(draft, projection)).toMatchObject({
        originalFormatStatus: 'FORMAT_CONTRACT_FAIL',
        recoveryStatus: 'RECOVERED',
        recoveredDeterministicEvidence: { actualTitleCharacters: 2, actualBodyCharacters: 3,
          pinnedComments: 1, unpinnedComments: 2, topics: 10 },
      })
    }
  })

  it('recovers an outer report H1 only through explicit title and body sections', () => {
    const draft = [
      '# C099｜小红书笔记完整方案',
      '',
      '## 标题（2全字符）',
      '',
      '甲乙',
      '',
      '标题字符数：2',
      '',
      '## 正文（3全字符）',
      '',
      '甲乙🙂',
      '',
      '## 评论区',
      '',
      '**置顶评论：**',
      '补充',
      '**非置顶评论1：**',
      '一',
      '**非置顶评论2：**',
      '二',
      '## 关联话题',
      '#甲 #乙 #丙 #丁 #戊 #己 #庚 #辛 #壬 #癸',
    ].join('\n')
    expect(validateXhsDraft(draft, projection)).toMatchObject({
      failureClass: 'FORMAT_CONTRACT_FAIL', hardContractStatus: null,
      facts: { actualTitleCharacters: null, actualBodyCharacters: null },
    })
    expect(replayXhsHistoricalDraft(draft, projection)).toMatchObject({
      originalFormatStatus: 'FORMAT_CONTRACT_FAIL', recoveryStatus: 'RECOVERED', hardContractStatus: 'WARN',
      recoveredDeterministicEvidence: { actualTitleCharacters: 2, actualBodyCharacters: 3,
        pinnedComments: 1, unpinnedComments: 2, topics: 10,
        modelDeclaredTitleCharacters: 2, modelDeclaredBodyCharacters: 3 },
    })
  })

  it('keeps duplicate replay and Validation Artifact encoding deterministic', () => {
    const firstReplay = replayXhsHistoricalDraft(canonicalDraft, projection)
    const secondReplay = replayXhsHistoricalDraft(canonicalDraft, projection)
    expect(secondReplay).toEqual(firstReplay)
    const result = validateXhsDraft(canonicalDraft, projection)
    const identity = { jobId: 'job', attemptId: 'attempt', executionPackageId: 'package', outputBundleId: 'bundle' }
    const first = buildXhsHardValidationArtifact(identity, 123, result)
    const second = buildXhsHardValidationArtifact(identity, 123, result)
    expect(second).toBe(first)
    expect(xhsHardValidationArtifactSchema.parse(JSON.parse(first))).toMatchObject({
      businessSchemaVersion: 5,
      validatedAt: 123,
      result: { validator: 'xhs-hard-contract-l1-v3', format: { status: 'PASS' },
        facts: { modelDeclaredTitleCharacters: 99, modelDeclaredBodyCharacters: 999 } },
    })
  })
})
