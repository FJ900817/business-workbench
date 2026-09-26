import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { LlmAdapter, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it } from 'vitest'
import BusinessWorkbenchService, {
  BUSINESS_WORKBENCH_SCHEMA_VERSION,
  BusinessWorkbenchError,
  XHS_PRODUCTION_BASELINE_RELATIVE_PATH,
  XHS_PRODUCTION_ENTRY_RELATIVE_PATH,
  XHS_PRODUCTION_INPUT_BINDINGS,
  XHS_PRODUCTION_SKILL_BINDINGS,
  XHS_PROJECT_RELATIVE_PATH,
  XhsProductionSourceResolver,
  type RestrictedBusinessAgentResult,
  type XhsProductionTaskIdentity,
} from '../src/index.ts'
import { resolveRestrictedAgentPolicy } from '../src/host-policy.ts'
import { batchRequest } from './helpers.ts'

type ProductionDraftScenario =
  | 'normal'
  | 'empty'
  | 'reasoning-only'
  | 'reasoning-budget-exhausted'
  | 'multi-delta'
  | 'provider-structure'
  | 'truncated'

class ProductionDraftFixtureAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  constructor(private readonly scenario: ProductionDraftScenario = 'normal') { super() }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({
      provider,
      id: model,
      name: model,
      reasoning: {
        efforts: [{ id: ReasoningEffortId('low'), name: 'Low' }],
        defaultEffort: ReasoningEffortId('low'),
      },
    })
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const text = '# Production route fixture\n\nFirst response only.'
    if (this.scenario === 'empty') {
      yield { type: 'usage', usage: { inputTokens: 7, outputTokens: 0 } }
      yield { type: 'finish', reason: { kind: 'max-tokens' } }
      return
    }
    if (this.scenario === 'reasoning-only' || this.scenario === 'reasoning-budget-exhausted') {
      yield { type: 'block-start', index: 0, blockType: 'reasoning' }
      yield { type: 'reasoning-delta', index: 0, text: 'fixture reasoning' }
      yield { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'fixture reasoning' } }
      const budgetExhausted = this.scenario === 'reasoning-budget-exhausted'
      yield {
        type: 'usage',
        usage: budgetExhausted
          ? { inputTokens: 5_033, outputTokens: 4_097, reasoningTokens: 4_097 }
          : { inputTokens: 7, outputTokens: 3, reasoningTokens: 3 },
      }
      yield { type: 'finish', reason: { kind: budgetExhausted ? 'max-tokens' : 'stop' } }
      return
    }
    if (this.scenario === 'provider-structure') {
      yield { type: 'block-start', index: 0, blockType: 'reasoning' }
      yield { type: 'reasoning-delta', index: 0, text: 'safe reasoning' }
      yield { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'safe reasoning' } }
    }
    if (this.scenario === 'truncated') {
      const partial = '{"draft":"unfinished'
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: partial }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: partial } }
      yield { type: 'usage', usage: { inputTokens: 7, outputTokens: 3 } }
      yield { type: 'finish', reason: { kind: 'max-tokens' } }
      return
    }
    const textIndex = this.scenario === 'provider-structure' ? 1 : 0
    yield { type: 'block-start', index: textIndex, blockType: 'text' }
    if (this.scenario === 'multi-delta') {
      for (const fragment of [text.slice(0, 12), text.slice(12, 31), text.slice(31)]) {
        yield { type: 'text-delta', index: textIndex, text: fragment }
      }
    } else {
      yield { type: 'text-delta', index: textIndex, text }
    }
    yield { type: 'block-end', index: textIndex, block: { type: 'text', text } }
    yield { type: 'usage', usage: { inputTokens: 7, outputTokens: 5 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

const roots: string[] = []
const identity: XhsProductionTaskIdentity = Object.freeze({
  account: 'account1', productionMonth: '2026-08', productionWeek: '第01周', note: 'note002',
})
const sourceTaskPath = `${XHS_PROJECT_RELATIVE_PATH}/02_小红书经营诊断系统/04_策略与任务/03_系统一任务/01_正式任务卡/账号1/2026-08/第01周/note002/任务卡_T-A1-20260809-002_账号1_fixture.md`
const taskCardPath = `${XHS_PROJECT_RELATIVE_PATH}/01_小红书生产创作系统/03_内容生产/小红书/产品1-视觉审美认知系统/账号1/2026-08/第01周/note002/写作任务卡.md`
const fixtureTopics = Object.freeze(['话题1', '话题2', '话题3', '话题4', '话题5', '话题6', '话题7', '话题8', '话题9', '话题10'])

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

interface ProductionFixture {
  readonly root: string
  readonly vault: string
  readonly project: string
  readonly taskCardPath: string
  readonly sourceTaskPath: string
  readonly rules: Readonly<Record<'dry_search' | 'recommendation' | 'hot_traffic', string>>
  readonly samples: Readonly<Record<'dry_search' | 'recommendation' | 'hot_traffic', string>>
  readonly skills: Readonly<Record<'account1' | 'account2' | 'account3' | 'account4', string>>
  writeBaseline(changes?: Partial<{
    readonly drySearchRulePath: string
    readonly drySearchSamplePath: string
    readonly account1SkillPath: string
    readonly duplicateAccount1: boolean
  }>): Promise<void>
  resolver(): Promise<XhsProductionSourceResolver>
}

async function fixture(): Promise<ProductionFixture> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-xhs-production-source-'))
  roots.push(root)
  const vault = join(root, 'vault')
  const project = join(vault, XHS_PROJECT_RELATIVE_PATH)
  const absolute = (path: string): string => join(vault, path)
  const write = async (path: string, content: string): Promise<void> => {
    await mkdir(dirname(absolute(path)), { recursive: true })
    await writeFile(absolute(path), content)
  }
  await write(XHS_PRODUCTION_ENTRY_RELATIVE_PATH, '---\ntitle: Fixture entry\nversion: XHS-PROD-1.3\nstatus: 正式\n---\n\n# Formal fixture entry\n')
  const sourceTask = [
    '---',
    'task_id: T-A1-20260809-002',
    'account: 账号1（fixture）',
    'topic_id: C003',
    'note_type: 干货搜索型（dry_search）',
    'status: 已确认',
    'allowed_topics:',
    ...fixtureTopics.map(topic => `  - ${topic}`),
    '---',
    '',
    '# Safe source fixture',
    '',
  ].join('\n')
  await write(sourceTaskPath, sourceTask)
  const sourceHash = sha256(sourceTask)
  await write(taskCardPath, taskCard({ sourceHash }))

  const rules = {
    dry_search: `${XHS_PROJECT_RELATIVE_PATH}/${XHS_PRODUCTION_INPUT_BINDINGS['dry-search'].writingRule}`,
    recommendation: `${XHS_PROJECT_RELATIVE_PATH}/${XHS_PRODUCTION_INPUT_BINDINGS.recommendation.writingRule}`,
    hot_traffic: `${XHS_PROJECT_RELATIVE_PATH}/${XHS_PRODUCTION_INPUT_BINDINGS['hot-traffic'].writingRule}`,
  } as const
  const samples = {
    dry_search: `${XHS_PROJECT_RELATIVE_PATH}/${XHS_PRODUCTION_INPUT_BINDINGS['dry-search'].goldenSample}`,
    recommendation: `${XHS_PROJECT_RELATIVE_PATH}/${XHS_PRODUCTION_INPUT_BINDINGS.recommendation.goldenSample}`,
    hot_traffic: `${XHS_PROJECT_RELATIVE_PATH}/${XHS_PRODUCTION_INPUT_BINDINGS['hot-traffic'].goldenSample}`,
  } as const
  const skills = {
    account1: XHS_PRODUCTION_SKILL_BINDINGS.account1.exactSource,
    account2: XHS_PRODUCTION_SKILL_BINDINGS.account2.exactSource,
    account3: XHS_PRODUCTION_SKILL_BINDINGS.account3.exactSource,
    account4: XHS_PRODUCTION_SKILL_BINDINGS.account4.exactSource,
  } as const
  for (const [key, path] of Object.entries(rules)) await write(path, `Formal V3 rule fixture: ${key}\n`)
  for (const [key, path] of Object.entries(samples)) await write(path, `Formal golden sample fixture: ${key}\n`)
  for (const [account, path] of Object.entries(skills)) await write(path, s3(account))

  const result: ProductionFixture = {
    root, vault, project,
    taskCardPath: absolute(taskCardPath),
    sourceTaskPath: absolute(sourceTaskPath),
    rules, samples, skills,
    async writeBaseline(changes = {}) {
      const rulePath = changes.drySearchRulePath ?? rules.dry_search
      const samplePath = changes.drySearchSamplePath ?? samples.dry_search
      const account1Path = changes.account1SkillPath ?? skills.account1
      const binding = async (path: string): Promise<string> => `    exact_path: "${path}"\n    sha256: "${sha256(await readFile(absolute(path)))}"`
      const account1 = await binding(account1Path)
      const duplicate = changes.duplicateAccount1 === true ? `\n  account1:\n${account1}` : ''
      await write(XHS_PRODUCTION_BASELINE_RELATIVE_PATH, [
        'version: XHS-PROD-1.0',
        's3_accounts:',
        `  account1:\n${account1}${duplicate}`,
        `  account2:\n${await binding(skills.account2)}`,
        `  account3:\n${await binding(skills.account3)}`,
        `  account4:\n${await binding(skills.account4)}`,
        'v3_rules:',
        `  dry_search:\n${await binding(rulePath)}`,
        `  recommendation:\n${await binding(rules.recommendation)}`,
        `  hot_traffic:\n${await binding(rules.hot_traffic)}`,
        'golden_samples:',
        `  dry_search:\n${await binding(samplePath)}`,
        `  recommendation:\n${await binding(samples.recommendation)}`,
        `  hot_traffic:\n${await binding(samples.hot_traffic)}`,
        'production_entry:',
        `  exact_path: "${XHS_PRODUCTION_ENTRY_RELATIVE_PATH}"`,
        'task_card_compiler_version: "1.0"',
        'frozen_at: "2026-08-16"',
        '',
      ].join('\n'))
    },
    async resolver() {
      const resolver = new XhsProductionSourceResolver(vault)
      await resolver.initialize(await realpath(project))
      return resolver
    },
  }
  await result.writeBaseline()
  return result
}

function taskCard(changes: Partial<Record<'status' | 'noteType' | 'account' | 'sourceHash', string>> & {
  readonly topics?: readonly string[]
} = {}): string {
  const topics = changes.topics ?? fixtureTopics
  return [
    '---', 'cssclasses: xhs-task-card', '---', '', '# Safe task card fixture', '',
    '> [!note]- 机器执行参数', '>',
    '> - task_id：T-A1-20260809-002',
    '> - topic_id：C003',
    `> - status：${changes.status ?? '已确认'}`,
    `> - note_type：${changes.noteType ?? '干货搜索型（dry_search）'}`,
    `> - account：${changes.account ?? '账号1'}`,
    '> - production_month：2026-08',
    '> - production_week：第01周',
    '> - note：note002',
    '> - SEO高亮词：Production',
    '> - source_task_id：T-A1-20260809-002',
    `> - source_task_path：${sourceTaskPath}`,
    `> - source_task_sha256：${changes.sourceHash ?? '0'.repeat(64)}`,
    '> - compiler_version：XHS-PROD-1.3',
    '>',
    '**标题：** 1—100全字符',
    '**正文：** 1—100全字符',
    '**评论：** 置顶0条 + 非置顶0条',
    '',
    '**正文结构**',
    '- fixture body',
    '',
    '**关键词执行**',
    '- 主词：Production（标题×1）',
    '',
    '**产品承接**',
    '- 产品模块：fixture product',
    '',
    `**${topics.length}个关联话题**`,
    topics.map(topic => `#${topic}`).join(' '),
  ].join('\n')
}

function s3(account: string): string {
  const label = account.replace('account', '账号')
  return [
    '---',
    `name: S3-笔记写作-${label}`,
    `description: Safe formal ${label} fixture`,
    '---', '',
    `# S3-笔记写作-${label}`, '',
    '## 1｜输入（四输入）', '',
    '单篇生产只允许读取以下4个输入：', '',
    '1. **当前写作任务卡**：fixture',
    '2. **本 Skill**：fixture',
    '3. **V3.0 正式规范**：fixture',
    '4. **黄金样稿**：fixture', '',
    '---', '',
  ].join('\n')
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

async function executeProductionScenario(scenario: ProductionDraftScenario): Promise<{
  readonly result?: RestrictedBusinessAgentResult
  readonly error?: unknown
  readonly requestCount: number
  readonly job: ReturnType<BusinessWorkbenchService['getJob']>
}> {
  const current = await fixture()
  const dshHome = join(current.root, `production-${scenario}-home`)
  const ctx = new Context()
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root: join(dshHome, 'storages') })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { persona: 'ambient context must remain absent' })
  await ctx.plugin(ToolRuntime, { mode: 'code' })
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  const adapter = new ProductionDraftFixtureAdapter(scenario)
  ctx.llm.registerAdapter(['production-fixture-provider'], adapter)
  await ctx.plugin(BusinessWorkbenchService, {
    dshHome,
    readRoots: { xhs: current.project },
    xhsProductionSource: { vaultRoot: current.vault },
    leaseDurationMs: 60_000,
    restrictedAgent: {
      provider: 'production-fixture-provider', model: 'production-fixture-model',
      reasoningEffort: 'low', maxTokens: 512, timeoutMs: 2_000,
    },
  })
  try {
    const service = ctx.businessWorkbench
    const batch = await service.createBatch(batchRequest(`production-${scenario}`))
    let job = service.listJobs(batch.id)[0]!
    job = await service.transitionJob({ jobId: job.id, expectedRevision: job.revision, idempotencyKey: 'ready', status: 'ready' })
    job = await service.createAttempt({ jobId: job.id, expectedRevision: job.revision, idempotencyKey: 'attempt' })
    job = await service.acquireExecutionLease({
      jobId: job.id, attemptId: job.currentAttempt!, expectedRevision: job.revision,
      idempotencyKey: 'lease', ownerId: `production-${scenario}`,
    })
    const prepared = await service.createXhsProductionExecutionPackage({
      jobId: job.id, attemptId: job.currentAttempt!, expectedRevision: job.revision,
      idempotencyKey: 'package', ownerId: `production-${scenario}`, identity,
    })
    const request = {
      jobId: job.id,
      attemptId: job.currentAttempt!,
      executionPackageId: prepared.executionPackage.id,
      ownerId: `production-${scenario}`,
      action: 'xhs-body-prepare-v0' as const,
      idempotencyKey: `xhs-body-prepare-v0:attempt:${job.currentAttempt}`,
      xhs: { mode: 'production' as const, account: 'account1' as const, noteType: 'dry-search' as const },
    }
    let result: RestrictedBusinessAgentResult | undefined
    let error: unknown
    try {
      result = await service.runRestrictedAgent(request)
    } catch (cause) {
      error = cause
    }
    return {
      ...(result === undefined ? {} : { result }),
      ...(error === undefined ? {} : { error }),
      requestCount: adapter.requests.length,
      job: service.getJob(job.id),
    }
  } finally {
    await ctx.fiber.dispose()
  }
}

describe('XHS production source resolver', () => {
  it('resolves the exact three inputs and account S3 without discovery or content disclosure', async () => {
    const current = await fixture()
    const resolution = await (await current.resolver()).resolve(identity, 123)
    expect(resolution.inputs.map(input => input.role)).toEqual(['taskCard', 'writingRule', 'goldenSample'])
    expect(resolution.allowedReadFiles).toEqual([...resolution.inputs.map(input => input.path)].sort())
    expect(resolution.skillSnapshot).toMatchObject({ skillId: 'xhs-s3-account1', source: 'project-agents', provider: 'business-xhs-production-v1', resolvedAt: 123 })
    expect(resolution.sourceManifest).toMatchObject({
      adapterVersion: 'xhs-production-source-v1', contractSchemaVersion: 1,
      identity: { ...identity, taskId: 'T-A1-20260809-002', topicId: 'C003', noteType: 'dry-search' },
      skillSource: { account: 'account1', logicalSkillId: 'xhs-s3-account1', origin: 'vault-root' },
    })
    expect(JSON.stringify(resolution.sourceManifest)).not.toContain('Safe task card fixture')
  })

  it('maps the formal System2 recommendation source value into the canonical machine note type', async () => {
    const current = await fixture()
    const source = (await readFile(current.sourceTaskPath, 'utf8'))
      .replace('note_type: 干货搜索型（dry_search）', 'note_type: 干货推荐型（soft_plant）')
    await writeFile(current.sourceTaskPath, source)
    await writeFile(current.taskCardPath, taskCard({
      noteType: '干货推荐型（recommendation）',
      sourceHash: sha256(source),
    }))

    const resolution = await (await current.resolver()).resolve(identity, 123)
    expect(resolution.sourceManifest.identity.noteType).toBe('recommendation')
    expect(resolution.inputs.map(input => input.role)).toEqual(['taskCard', 'writingRule', 'goldenSample'])
    expect(resolution.inputs[1]?.path).toBe(`xhs/${XHS_PRODUCTION_INPUT_BINDINGS.recommendation.writingRule}`)
    expect(resolution.inputs[2]?.path).toBe(`xhs/${XHS_PRODUCTION_INPUT_BINDINGS.recommendation.goldenSample}`)
  })

  it('does not infer a missing machine note_type from human-readable task-card prose', async () => {
    const current = await fixture()
    const sourceHash = sha256(await readFile(current.sourceTaskPath))
    const humanOnlyType = taskCard({ sourceHash })
      .replace('# Safe task card fixture', '# Safe task card fixture\n\n**类型：** 干货搜索型（dry_search）')
      .replace(/^> - note_type：.+\n/mu, '')
    await writeFile(current.taskCardPath, humanOnlyType)

    await expect((await current.resolver()).resolve(identity, 123))
      .rejects.toThrow(/missing machine field 'note_type'/u)
  })

  it.each([
    ['wrong account', { ...identity, account: 'account2' as const }],
    ['nonexistent note', { ...identity, note: 'note007' }],
  ])('fails closed for %s', async (_name, requested) => {
    const current = await fixture()
    await expect((await current.resolver()).resolve(requested, 123)).rejects.toMatchObject({ code: 'INPUT_MISSING' })
  })

  it.each([
    ['unconfirmed task card', { status: '待简哥确认' }],
    ['wrong note_type', { noteType: '未知类型（unknown）' }],
    ['wrong account field', { account: '账号2' }],
  ])('rejects %s', async (_name, changes) => {
    const current = await fixture()
    const sourceHash = sha256(await readFile(current.sourceTaskPath))
    await writeFile(current.taskCardPath, taskCard({ ...changes, sourceHash }))
    await expect((await current.resolver()).resolve(identity, 123)).rejects.toMatchObject({ code: 'XHS_BODY_INPUT_INVALID' })
  })

  it('blocks before package creation when System2 and System1 allowed_topics differ', async () => {
    const current = await fixture()
    const sourceHash = sha256(await readFile(current.sourceTaskPath))
    const changedTopics = [...fixtureTopics.slice(0, 9), '话题10同义词']
    await writeFile(current.taskCardPath, taskCard({ sourceHash, topics: changedTopics }))
    await expect((await current.resolver()).resolve(identity, 123)).rejects.toMatchObject({ code: 'XHS_BODY_INPUT_INVALID' })
  })

  it('blocks before package creation for duplicate System2 topics or an unconfirmed System2 task', async () => {
    const duplicate = await fixture()
    const duplicateSource = (await readFile(duplicate.sourceTaskPath, 'utf8')).replace('  - 话题10', '  - 话题1')
    await writeFile(duplicate.sourceTaskPath, duplicateSource)
    await writeFile(duplicate.taskCardPath, taskCard({ sourceHash: sha256(duplicateSource) }))
    await expect((await duplicate.resolver()).resolve(identity, 123)).rejects.toMatchObject({ code: 'XHS_BODY_INPUT_INVALID' })

    const unconfirmed = await fixture()
    const unconfirmedSource = (await readFile(unconfirmed.sourceTaskPath, 'utf8')).replace('status: 已确认', 'status: 待简哥确认')
    await writeFile(unconfirmed.sourceTaskPath, unconfirmedSource)
    await writeFile(unconfirmed.taskCardPath, taskCard({ sourceHash: sha256(unconfirmedSource) }))
    await expect((await unconfirmed.resolver()).resolve(identity, 123)).rejects.toMatchObject({ code: 'XHS_BODY_INPUT_INVALID' })
  })

  it('rejects missing and wrong writing-rule routes', async () => {
    const missing = await fixture()
    await rm(join(missing.vault, missing.rules.dry_search))
    await expect((await missing.resolver()).resolve(identity, 123)).rejects.toMatchObject({ code: 'INPUT_MISSING' })

    const wrong = await fixture()
    await wrong.writeBaseline({ drySearchRulePath: wrong.rules.recommendation })
    await expect((await wrong.resolver()).resolve(identity, 123)).rejects.toMatchObject({ code: 'XHS_BODY_INPUT_INVALID' })
  })

  it('rejects missing and wrong golden-sample routes', async () => {
    const missing = await fixture()
    await rm(join(missing.vault, missing.samples.dry_search))
    await expect((await missing.resolver()).resolve(identity, 123)).rejects.toMatchObject({ code: 'INPUT_MISSING' })

    const wrong = await fixture()
    await wrong.writeBaseline({ drySearchSamplePath: wrong.samples.recommendation })
    await expect((await wrong.resolver()).resolve(identity, 123)).rejects.toMatchObject({ code: 'XHS_BODY_INPUT_INVALID' })
  })

  it('rejects wrong, missing, archived, and duplicate S3 sources', async () => {
    const wrong = await fixture()
    await wrong.writeBaseline({ account1SkillPath: wrong.skills.account2 })
    await expect((await wrong.resolver()).resolve(identity, 123)).rejects.toMatchObject({ code: 'XHS_BODY_INPUT_INVALID' })

    const missing = await fixture()
    await rm(join(missing.vault, missing.skills.account1))
    await expect((await missing.resolver()).resolve(identity, 123)).rejects.toMatchObject({ code: 'SKILL_NOT_FOUND' })

    const archived = await fixture()
    const archivedPath = 'archive/S3-笔记写作-账号1/SKILL.md'
    await mkdir(dirname(join(archived.vault, archivedPath)), { recursive: true })
    await writeFile(join(archived.vault, archivedPath), s3('account1'))
    await archived.writeBaseline({ account1SkillPath: archivedPath })
    await expect((await archived.resolver()).resolve(identity, 123)).rejects.toMatchObject({ code: 'READ_DENIED' })

    const duplicate = await fixture()
    await duplicate.writeBaseline({ duplicateAccount1: true })
    await expect((await duplicate.resolver()).resolve(identity, 123)).rejects.toMatchObject({ code: 'XHS_BODY_INPUT_INVALID' })
  })

  it('rejects Project escape and moved or modified frozen sources', async () => {
    const escaped = await fixture()
    await writeFile(join(escaped.root, 'outside.md'), 'outside Project fixture\n')
    await escaped.writeBaseline({ drySearchRulePath: '../outside.md' })
    await expect((await escaped.resolver()).resolve(identity, 123)).rejects.toMatchObject({ code: 'READ_DENIED' })

    const moved = await fixture()
    const movedResolver = await moved.resolver()
    const movedResolution = await movedResolver.resolve(identity, 123)
    await rename(moved.taskCardPath, `${moved.taskCardPath}.moved`)
    await expect(movedResolver.verify(movedResolution.sourceManifest, movedResolution.skillSnapshot)).rejects.toMatchObject({ code: 'INPUT_DRIFT' })

    const modified = await fixture()
    const modifiedResolver = await modified.resolver()
    const modifiedResolution = await modifiedResolver.resolve(identity, 123)
    await writeFile(join(modified.vault, modified.skills.account1), `${s3('account1')}\nchanged\n`)
    await expect(modifiedResolver.verify(modifiedResolution.sourceManifest, modifiedResolution.skillSnapshot)).rejects.toMatchObject({ code: 'SKILL_DRIFT' })
  })

  it('verifies frozen production inputs without loading a Skill for a Skill-free action', async () => {
    const current = await fixture()
    const resolver = await current.resolver()
    const resolution = await resolver.resolve(identity, 123)
    await writeFile(join(current.vault, current.skills.account1), `${s3('account1')}\nchanged after package creation\n`)
    await expect(resolver.verifyInputs(resolution.sourceManifest)).resolves.toBeUndefined()
    await expect(resolver.verify(resolution.sourceManifest, resolution.skillSnapshot))
      .rejects.toMatchObject({ code: 'SKILL_DRIFT' })
  })
})

describe('XHS production package assembly', () => {
  it('persists and revalidates exact source evidence without invoking an Agent', async () => {
    const current = await fixture()
    const dshHome = join(current.root, 'dsh-home')
    const ctx = new Context()
    await ctx.plugin(Storage)
    await ctx.plugin(StorageJson, { root: join(dshHome, 'storages') })
    await ctx.plugin(StorageDomain, { backend: 'json' })
    await ctx.plugin(BusinessWorkbenchService, {
      dshHome,
      readRoots: { xhs: current.project },
      xhsProductionSource: { vaultRoot: current.vault },
      leaseDurationMs: 60_000,
    })
    try {
      const service = ctx.businessWorkbench
      const batch = await service.createBatch(batchRequest('production-source-package'))
      let job = service.listJobs(batch.id)[0]!
      job = await service.transitionJob({ jobId: job.id, expectedRevision: job.revision, idempotencyKey: 'ready', status: 'ready' })
      job = await service.createAttempt({ jobId: job.id, expectedRevision: job.revision, idempotencyKey: 'attempt' })
      job = await service.acquireExecutionLease({ jobId: job.id, attemptId: job.currentAttempt!, expectedRevision: job.revision, idempotencyKey: 'lease', ownerId: 'production-source-test' })
      const request = {
        jobId: job.id,
        attemptId: job.currentAttempt!,
        expectedRevision: job.revision,
        idempotencyKey: 'production-package',
        ownerId: 'production-source-test',
        identity,
      } as const
      const result = await service.createXhsProductionExecutionPackage(request)
      const replayed = await service.createXhsProductionExecutionPackage(request)
      expect(replayed.executionPackage).toEqual(result.executionPackage)
      expect(replayed.sourceManifest).toEqual(result.sourceManifest)
      expect(BUSINESS_WORKBENCH_SCHEMA_VERSION).toBe(5)
      expect(result.executionPackage).toMatchObject({
        workflowVersion: 'xhs-body-prepare-v0',
        allowedReadRoots: [],
        allowedCapabilities: ['restricted-agent'],
        allowedSkills: ['xhs-s3-account1'],
        productionSource: { manifestHash: result.sourceManifest.manifestHash },
      })
      await expect(service.verifyExecutionPackage(job.id, job.currentAttempt!)).resolves.toMatchObject({ inputCount: 3 })
      expect(service.getJob(job.id)?.artifactRefs).toEqual([])
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('executes one exact production package without exposing tools or the Vault', async () => {
    const current = await fixture()
    const dshHome = join(current.root, 'production-execution-home')
    const ctx = new Context()
    await ctx.plugin(Storage)
    await ctx.plugin(StorageJson, { root: join(dshHome, 'storages') })
    await ctx.plugin(StorageDomain, { backend: 'json' })
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SystemPrompt, { persona: 'ambient context must remain absent' })
    await ctx.plugin(ToolRuntime, { mode: 'code' })
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(AgentLoop, { agents: [] })
    const adapter = new ProductionDraftFixtureAdapter()
    ctx.llm.registerAdapter(['production-fixture-provider'], adapter)
    await ctx.plugin(BusinessWorkbenchService, {
      dshHome,
      readRoots: { xhs: current.project },
      xhsProductionSource: { vaultRoot: current.vault },
      leaseDurationMs: 60_000,
      restrictedAgent: {
        provider: 'production-fixture-provider', model: 'production-fixture-model',
        maxTokens: 512, timeoutMs: 2_000,
      },
    })
    try {
      const service = ctx.businessWorkbench
      const batch = await service.createBatch(batchRequest('production-agent-package'))
      let job = service.listJobs(batch.id)[0]!
      job = await service.transitionJob({ jobId: job.id, expectedRevision: job.revision, idempotencyKey: 'ready', status: 'ready' })
      job = await service.createAttempt({ jobId: job.id, expectedRevision: job.revision, idempotencyKey: 'attempt' })
      job = await service.acquireExecutionLease({ jobId: job.id, attemptId: job.currentAttempt!, expectedRevision: job.revision, idempotencyKey: 'lease', ownerId: 'production-agent-test' })
      const prepared = await service.createXhsProductionExecutionPackage({
        jobId: job.id, attemptId: job.currentAttempt!, expectedRevision: job.revision,
        idempotencyKey: 'production-package', ownerId: 'production-agent-test', identity,
      })
      for (const duration of Object.values(prepared.timing)) expect(typeof duration).toBe('number')
      const request = {
        jobId: job.id,
        attemptId: job.currentAttempt!,
        executionPackageId: prepared.executionPackage.id,
        ownerId: 'production-agent-test',
        action: 'xhs-body-prepare-v0' as const,
        idempotencyKey: `xhs-body-prepare-v0:attempt:${job.currentAttempt}`,
        xhs: { mode: 'production' as const, account: 'account1' as const, noteType: 'dry-search' as const },
      }
      const model = {
        provider: 'production-fixture-provider', model: 'production-fixture-model',
        maxTokens: 512, timeoutMs: 2_000,
      }
      expect(() => resolveRestrictedAgentPolicy(prepared.executionPackage, request.action, model, {
        ...request.xhs, account: 'account2',
      })).toThrow(expect.objectContaining({ code: 'XHS_BODY_INPUT_INVALID' }))
      expect(() => resolveRestrictedAgentPolicy(prepared.executionPackage, request.action, model, {
        ...request.xhs, mode: 'fixture',
      })).toThrow(expect.objectContaining({ code: 'AGENT_ACTION_NOT_ALLOWED' }))

      const result = await service.runRestrictedAgent(request)
      if (result.kind !== 'output-bundle') throw new Error('production route returned an ordinary Artifact')
      expect(adapter.requests).toHaveLength(1)
      expect(adapter.requests[0]?.tools ?? []).toEqual([])
      expect(typeof result.executionMetrics?.agentDurationMs).toBe('number')
      expect(result.executionMetrics).toMatchObject({ toolCalls: 0, tokenUsage: { inputTokens: 7, outputTokens: 5 } })
      await expect(service.getOutputBundle(result.outputBundle.id)).resolves.toMatchObject({
        bundle: { id: result.outputBundle.id, type: 'intermediate' },
      })
      expect(service.getJob(job.id)?.artifactRefs).toEqual([
        expect.objectContaining({ type: 'validation' }),
      ])
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it.each(['multi-delta', 'provider-structure'] as const)(
    'extracts %s text through the complete production path', async (scenario) => {
      const observation = await executeProductionScenario(scenario)
      expect(observation.error).toBeUndefined()
      expect(observation.result?.kind).toBe('output-bundle')
      expect(observation.requestCount).toBe(1)
      expect(observation.result?.executionMetrics).toMatchObject({ toolCalls: 0 })
      if (scenario === 'provider-structure') {
        expect(observation.result?.executionMetrics?.tokenUsage).toMatchObject({ inputTokens: 7, outputTokens: 5 })
      }
    },
  )

  it.each([
    ['empty', 'max-tokens', 0, 'EMPTY_AGENT_OUTPUT'],
    ['reasoning-only', 'stop', 1, 'EMPTY_AGENT_OUTPUT'],
    ['reasoning-budget-exhausted', 'max-tokens', 1, 'REASONING_BUDGET_EXHAUSTED'],
  ] as const)('fails loud with durable diagnostics for %s output', async (scenario, finishReason, reasoningDeltaCount, failureCode) => {
    const observation = await executeProductionScenario(scenario)
    expect(observation.result).toBeUndefined()
    expect(observation.error).toMatchObject({
      code: failureCode,
      detail: {
        outputDiagnostics: {
          diagnosticsVersion: 2,
          provider: 'production-fixture-provider',
          model: 'production-fixture-model',
          reasoningEffort: 'low',
          maxTokens: 512,
          finishReason,
          assistantMessageCount: 1,
          textDeltaCount: 0,
          reasoningDeltaCount,
          toolCallCount: 0,
          finalEventCount: 1,
          contentFieldType: 'array',
          finalTextBytes: 0,
          errorStage: 'business_output_extraction',
        },
      },
    })
    expect(observation.requestCount).toBe(1)
    expect(observation.job?.artifactRefs).toEqual([])
    expect(observation.job?.attempts[0]?.outputBundle).toBeNull()
    expect(observation.job?.attempts[0]?.agentRuns[0]).toMatchObject({
      status: 'failed', failureCode,
    })
    const failureReason = observation.job?.attempts[0]?.agentRuns[0]?.failureReason
    expect(failureReason).toContain('"outputDiagnostics"')
    const durableDiagnostics = JSON.parse(failureReason!.split('\n').at(-1)!) as Record<string, unknown>
    expect(durableDiagnostics).toMatchObject({
      outputDiagnostics: {
        diagnosticsVersion: 2,
        provider: 'production-fixture-provider',
        model: 'production-fixture-model',
        finishReason,
        finalTextBytes: 0,
      },
    })
    if (scenario === 'reasoning-budget-exhausted') {
      expect(observation.error).toMatchObject({
        detail: {
          outputDiagnostics: {
            tokenUsage: { inputTokens: 5_033, outputTokens: 4_097, reasoningTokens: 4_097 },
          },
        },
      })
    }
    if (scenario === 'empty') {
      if (!(observation.error instanceof BusinessWorkbenchError)) throw new Error('expected BusinessWorkbenchError')
      const diagnostics = observation.error.detail.outputDiagnostics!
      expect({
        code: observation.error.code,
        diagnosticsVersion: diagnostics.diagnosticsVersion,
        provider: diagnostics.provider,
        model: diagnostics.model,
        finishReason: diagnostics.finishReason,
        assistantMessageCount: diagnostics.assistantMessageCount,
        textDeltaCount: diagnostics.textDeltaCount,
        reasoningDeltaCount: diagnostics.reasoningDeltaCount,
        toolCallCount: diagnostics.toolCallCount,
        finalEventCount: diagnostics.finalEventCount,
        contentFieldType: diagnostics.contentFieldType,
        finalTextBytes: diagnostics.finalTextBytes,
        errorStage: diagnostics.errorStage,
      }).toMatchInlineSnapshot(`
        {
          "assistantMessageCount": 1,
          "code": "EMPTY_AGENT_OUTPUT",
          "contentFieldType": "array",
          "diagnosticsVersion": 2,
          "errorStage": "business_output_extraction",
          "finalEventCount": 1,
          "finalTextBytes": 0,
          "finishReason": "max-tokens",
          "model": "production-fixture-model",
          "provider": "production-fixture-provider",
          "reasoningDeltaCount": 0,
          "textDeltaCount": 0,
          "toolCallCount": 0,
        }
      `)
    }
  })

  it('rejects truncated non-JSON text without publishing a bundle', async () => {
    const observation = await executeProductionScenario('truncated')
    expect(observation.result).toBeUndefined()
    expect(observation.error).toMatchObject({ code: 'XHS_BODY_OUTPUT_INVALID' })
    expect(observation.requestCount).toBe(1)
    expect(observation.job?.attempts[0]?.outputBundle).toBeNull()
    expect(observation.job?.artifactRefs).toEqual([])
  })
})
