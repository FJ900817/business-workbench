import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { LlmAdapter, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import {
  assertXhsOutputBundle,
  BUSINESS_WORKBENCH_SCHEMA_VERSION,
  countXhsFullCharacters,
  xhsTitleCharacterObservation,
  BusinessOutputBundleStore,
  type BusinessOutputBundle,
  type BusinessOutputBundleContent,
  type BusinessJob,
  type BusinessWorkbenchService,
  type RunRestrictedBusinessAgentRequest,
  XHS_BODY_PREPARE_ASSEMBLY,
  XHS_BODY_PREPARE_CONTRACT,
  XHS_BODY_PREPARE_SKILLS,
  XHS_DRAFT_MAX_BYTES,
  parseXhsAgentDraft,
  xhsOutputBundleManifestHash,
} from '../src/index.ts'
import { resolveRestrictedAgentPolicy } from '../src/host-policy.ts'
import { batchRequest, setupHarness, singleBatchRequest } from './helpers.ts'
import BusinessService from '../src/index.ts'
import type { BusinessExecutionTelemetryStore } from '../src/execution-telemetry.ts'

type Telemetry = Awaited<ReturnType<BusinessExecutionTelemetryStore['ensure']>>

class XhsFixtureAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  reasoningTokens: number | undefined = 0
  output = [
    '# 合成标题验证正式结构保持原样完整输出',
    '',
    '标题字符数：18 + 正文字符数：23',
    '',
    'Synthetic content only.',
    '',
    '## 置顶评论',
    '',
    '## 非置顶评论',
    '',
    '## 关联话题',
  ].join('\n')
  finishReason: 'stop' | 'max-tokens' = 'stop'

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: model,
      reasoning: { efforts: [{ id: ReasoningEffortId('off'), name: 'Off' }], defaultEffort: ReasoningEffortId('off') },
    })
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const text = this.output
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'usage', usage: { inputTokens: 2, outputTokens: 2, ...(this.reasoningTokens === undefined ? {} : { reasoningTokens: this.reasoningTokens }) } }
    yield { type: 'finish', reason: { kind: this.finishReason } }
  }
}

interface Fixture {
  readonly root: string
  readonly service: BusinessWorkbenchService
  readonly adapter: XhsFixtureAdapter
  readonly dispose: (removeRoot?: boolean) => Promise<void>
}

const fixtures: Fixture[] = []
const ownerId = 'phase4b-owner'

async function restartThroughLoader(root: string, execution = false): Promise<Context> {
  const path = join(root, 'recovery.cordis.yml')
  await writeFile(path, [
    "- name: '@deepseek-ai/dsh-storage'",
    "- name: '@deepseek-ai/dsh-storage-json'", '  config:', `    root: ${JSON.stringify(join(root, 'storages'))}`,
    "- name: '@deepseek-ai/dsh-storage-domain'", '  config:', '    backend: json',
    "- name: '@deepseek-ai/dsh-business-workbench'", '  config:', `    dshHome: ${JSON.stringify(root)}`, '    leaseDurationMs: 60000', '',
    ...(execution ? [
      '    readRoots:', `      xhs: ${JSON.stringify(join(root, 'business-inputs/xhs-source'))}`,
      `      sharedProductTruth: ${JSON.stringify(join(root, 'business-inputs/product-truth-source'))}`,
      '    restrictedAgent:', '      provider: fixture-provider', '      model: fixture-model',
      '      maxTokens: 4096', '      timeoutMs: 2000', '      reasoningEffort: off',
      "- name: '@deepseek-ai/dsh-llm'", "- name: '@deepseek-ai/dsh-session'",
      "- name: '@deepseek-ai/dsh-system-prompt'", '  config:', '    persona: ambient context must remain absent',
      "- name: '@deepseek-ai/dsh-tools'", '  config:', '    mode: code',
      "- name: '@deepseek-ai/dsh-agent'", "- name: '@deepseek-ai/dsh-agent-loop'", '  config:', '    agents: []',
      "- name: '@deepseek-ai/dsh-skill'", '',
    ] : []),
  ].join('\n'))
  const ctx = new Context()
  try {
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-storage', Storage], ['@deepseek-ai/dsh-storage-json', StorageJson],
      ['@deepseek-ai/dsh-storage-domain', StorageDomain], ['@deepseek-ai/dsh-business-workbench', BusinessService],
      ['@deepseek-ai/dsh-llm', LlmRuntime], ['@deepseek-ai/dsh-session', SessionStore],
      ['@deepseek-ai/dsh-system-prompt', SystemPrompt], ['@deepseek-ai/dsh-tools', ToolRuntime],
      ['@deepseek-ai/dsh-agent', AgentRegistry], ['@deepseek-ai/dsh-agent-loop', AgentLoop], ['@deepseek-ai/dsh-skill', SkillRegistry],
    ])
    ctx.loader.internal = { version: 'v2', async import(name: string) {
      if (!modules.has(name)) throw new Error(`unapproved recovery plugin: ${name}`)
      return modules.get(name)
    } } as unknown as NonNullable<typeof ctx.loader.internal>
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(path).href } })
    await ctx.loader.await()
    return ctx
  } catch (error) { await ctx.fiber.dispose(); throw error }
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose()))
})

async function xhsFixture(root?: string, throughLoader = false): Promise<Fixture> {
  const harness = await setupHarness(root, 60_000, {
    provider: 'fixture-provider', model: 'fixture-model', maxTokens: 512, timeoutMs: 2_000,
  })
  let ctx = harness.ctx
  if (throughLoader) {
    await harness.dispose(false)
    ctx = await restartThroughLoader(harness.root, true)
  } else {
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SystemPrompt, { persona: 'ambient context must remain absent' })
    await ctx.plugin(ToolRuntime, { mode: 'code' })
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(SkillRegistry)
  }
  const adapter = new XhsFixtureAdapter()
  ctx.llm.registerAdapter(['fixture-provider'], adapter)
  ctx.skills.register({
    name: XHS_BODY_PREPARE_SKILLS[0],
    description: 'Safe snapshot of the formal account-one S3 Skill',
    source: 'runtime',
    content: 'Use only the frozen task card, V3 writing rule, and golden sample. Never request tools.',
  })
  const fixture = {
    root: harness.root,
    service: ctx.businessWorkbench,
    adapter,
    async dispose(removeRoot = root === undefined) { await ctx.fiber.dispose(); await harness.dispose(removeRoot) },
  }
  fixtures.push(fixture)
  return fixture
}

async function runningXhsAction(fixture: Fixture, mode: 'single' | 'quad' = 'quad'): Promise<{
  readonly job: BusinessJob
  readonly request: RunRestrictedBusinessAgentRequest
}> {
  const service = fixture.service
  const xhsRoot = join(fixture.root, 'business-inputs', 'xhs-source')
  await writeFile(join(xhsRoot, 'current-task.md'), [
    '> [!note]- 机器执行参数',
    '>',
    '> - task_id：TEST-XHS-001',
    '> - topic_id：TEST-TOPIC-001',
    '> - status：已确认',
    '> - note_type：干货搜索型（dry_search）',
    '> - account：账号1',
    '> - production_month：2026-08',
    '> - production_week：第01周',
    '> - note：note001',
    '> - SEO高亮词：合成',
    '> - compiler_version：XHS-PROD-1.3',
    '>',
    '> **标题：** 干货搜索型｜18—20全字符',
    '>',
    '> **正文：** 10—2000全字符',
    '>',
    '> **评论：** 置顶0条 + 非置顶0条',
    '>',
    '> **关键词执行**',
    '>',
    '> - 主词：合成（标题×1）',
    '>',
    '> **正文结构**',
    '>',
    '> - 开头：合成测试',
    '>',
    '> **0个关联话题**',
    '>',
    '> **转化模式**',
    '>',
    '> - 产品模块：合成模块',
    '',
  ].join('\n'))
  await writeFile(join(xhsRoot, 'rules', 'writing.md'), 'Synthetic V3 fixture rule.')
  await writeFile(join(xhsRoot, 'rules', 'golden-sample.md'), 'Synthetic rhythm sample without production content.')
  const createKey = `phase4b-${randomUUID()}`
  const batch = await service.createBatch(mode === 'single' ? singleBatchRequest(createKey) : batchRequest(createKey))
  let job = service.listJobs(batch.id)[0]!
  job = await service.transitionJob({ jobId: job.id, expectedRevision: job.revision, idempotencyKey: 'ready', status: 'ready' })
  job = await service.createAttempt({ jobId: job.id, expectedRevision: job.revision, idempotencyKey: 'attempt' })
  job = await service.acquireExecutionLease({
    jobId: job.id, attemptId: job.currentAttempt!, expectedRevision: job.revision,
    idempotencyKey: 'lease', ownerId,
  })
  const executionPackage = await service.createExecutionPackage({
    jobId: job.id,
    attemptId: job.currentAttempt!,
    expectedRevision: job.revision,
    idempotencyKey: 'package',
    ownerId,
    workflowVersion: XHS_BODY_PREPARE_CONTRACT.workflowVersion,
    inputs: [
      { role: 'taskCard', path: 'xhs/current-task.md', required: true },
      { role: 'writingRule', path: 'xhs/rules/writing.md', required: true },
      { role: 'goldenSample', path: 'xhs/rules/golden-sample.md', required: true },
    ],
    allowedReadRoots: [],
    allowedReadFiles: ['xhs/current-task.md', 'xhs/rules/golden-sample.md', 'xhs/rules/writing.md'],
    allowedCapabilities: ['restricted-agent'],
    allowedSkills: [XHS_BODY_PREPARE_SKILLS[0]],
  })
  job = service.getJob(job.id)!
  return {
    job,
    request: {
      jobId: job.id,
      attemptId: job.currentAttempt!,
      executionPackageId: executionPackage.id,
      ownerId,
      action: 'xhs-body-prepare-v0',
      idempotencyKey: `xhs-body-prepare-v0:attempt:${job.currentAttempt}`,
      xhs: { mode: 'fixture', account: 'account1', noteType: 'dry-search' },
    },
  }
}

function textHash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function rebuildBundle(
  bundle: BusinessOutputBundle,
  files: BusinessOutputBundleContent['files'],
  changes: Partial<Omit<BusinessOutputBundle, 'entries' | 'manifestHash'>> = {},
): BusinessOutputBundle {
  const entries = bundle.entries.map(entry => ({
    ...entry,
    hash: textHash(files[entry.name]),
    bytes: Buffer.byteLength(files[entry.name], 'utf8'),
  })) as unknown as BusinessOutputBundle['entries']
  const { manifestHash: _manifestHash, ...base } = { ...bundle, ...changes, entries }
  return { ...base, manifestHash: xhsOutputBundleManifestHash(base) }
}

describe('XHS production execution gate', () => {
  it('runs text-first Chinese content through a Loader composition and settles only one immutable bundle', async () => {
    const fixture = await xhsFixture(undefined, true)
    const draft = [
      '# 合成标题验证正式结构保持原样完整输出',
      '',
      '标题字符数：18 + 正文字符数：999',
      '',
      '这是完全合成测试正文'.repeat(50),
      '',
      '“引号”、"quotes" 与 🙂 保持原样。',
      '',
      '## 置顶评论',
      '',
      '## 非置顶评论',
      '',
      '## 关联话题',
      '',
    ].join('\n')
    fixture.adapter.output = draft
    const prepared = await runningXhsAction(fixture, 'single')
    const result = await fixture.service.runRestrictedAgent(prepared.request)
    if (result.kind !== 'output-bundle') throw new Error('expected bundle')
    const replay = await fixture.service.runRestrictedAgent(prepared.request)
    expect(replay).toMatchObject({ outputBundle: result.outputBundle })
    const content = await fixture.service.getOutputBundle(result.outputBundle.id)
    expect(content.files['draft.md']).toBe(draft)
    const validationRef = fixture.service.getJob(prepared.job.id)!.artifactRefs.find(artifact => artifact.type === 'validation')!
    const validation = await fixture.service.getArtifact(validationRef.artifactId)
    expect(JSON.parse(validation.content)).toMatchObject({ result: { format: { status: 'PASS' }, failureClass: null } })
    const done = await fixture.service.finalizeXhsOutputBundle(prepared.job.id, prepared.request.attemptId)
    await expect(fixture.service.finalizeXhsOutputBundle(done.id, prepared.request.attemptId)).resolves.toEqual(done)
    expect(done.operations.filter(op => op.kind === 'complete-attempt')).toHaveLength(1)
    expect(fixture.adapter.requests).toHaveLength(1)
    const actual = fixture.adapter.requests[0]!
    const requestText = actual.messages.at(-1)?.content.find(block => block.type === 'text')?.text ?? ''
    const checklist = requestText.slice(requestText.indexOf('【本篇执行硬合同】'))
    expect({
      system: actual.system,
      checklist,
      tools: actual.tools ?? [],
      outputs: result.outputBundle.entries.map(entry => entry.name),
      draftUnchanged: content.files['draft.md'] === draft,
      job: done.status,
      attempt: done.attempts[0]!.status,
      lease: done.attempts[0]!.lease!.status,
    }).toMatchSnapshot()
    expect(await fixture.service.reconcileOutputBundles()).toMatchObject({ referencedCount: 1, orphanBundles: [] })
  })

  it.each([
    ['{"draft":"正文"}', 'stop', 'unsupported-format'],
    ['```json\n{"draft":"正文"}\n```', 'stop', 'unsupported-format'],
    ['{"draft":"bad "quote""}', 'stop', 'invalid-json'],
    ['{"draft":"partial', 'max-tokens', 'truncated'],
    ['{"other":"正文"}', 'stop', 'missing-draft'],
    ['{"draft":22}', 'stop', 'schema-invalid'],
  ] as const)('persists rejection %s without a bundle or automatic retry', async (output, finishReason, kind) => {
    const fixture = await xhsFixture()
    fixture.adapter.output = output
    fixture.adapter.finishReason = finishReason
    const prepared = await runningXhsAction(fixture, 'single')
    const failure: unknown = await fixture.service.runRestrictedAgent(prepared.request).then(
      () => { throw new Error('expected rejected XHS output') },
      (error: unknown) => error,
    )
    expect(failure).toMatchObject({
      code: 'XHS_BODY_OUTPUT_INVALID',
      detail: { xhsOutputDiagnostics: { kind, stage: 'agent-text', finishReason } },
    })
    const failed = fixture.service.getJob(prepared.job.id)!
    const run = failed.attempts[0]!.agentRuns[0]!
    expect(run.status).toBe('failed')
    expect(run.failureReason).toContain(`"kind":"${kind}"`)
    expect(run.failureReason).toContain(`"outputHash":"${textHash(output)}"`)
    expect(run.failureReason).not.toContain(output)
    expect(failed.attempts[0]!.outputBundle).toBeNull()
    await expect(fixture.service.runRestrictedAgent(prepared.request)).rejects.toMatchObject({ code: 'AGENT_RUN_FAILED' })
    expect(fixture.adapter.requests).toHaveLength(1)
    expect(fixture.service.getJob(prepared.job.id)).toEqual(failed)
    expect(await fixture.service.reconcileOutputBundles()).toMatchObject({ referencedCount: 0, orphanBundles: [] })
    await fixture.dispose(false)
    const restarted = await restartThroughLoader(fixture.root)
    try {
      expect(restarted.businessWorkbench.getJob(prepared.job.id)!.attempts[0]!.agentRuns[0]).toEqual(run)
      expect(restarted.businessWorkbench.getJob(prepared.job.id)!.attempts[0]!.outputBundle).toBeNull()
    } finally { await restarted.fiber.dispose() }
  })

  it('counts every title character deterministically and never adopts the model self-count', () => {
    const title = '设计留白总觉得空？用三个维度自检是否有效'
    expect(countXhsFullCharacters(title)).toBe(20)
    expect(countXhsFullCharacters('A1，中 文🙂')).toBe(7)
    expect(countXhsFullCharacters('')).toBe(0)
    const draft = `# ${title}\n\n标题字符数：22 + 正文字符数：756\n\nUnchanged fixture.`
    expect(xhsTitleCharacterObservation(draft)).toEqual({ titleCharacters: 20, modelDeclaredTitleCharacters: 22, titleCountMatches: false })
    expect(xhsTitleCharacterObservation('# ABC\n标题字符数：3')).toEqual({ titleCharacters: 3, modelDeclaredTitleCharacters: 3, titleCountMatches: true })
    expect(xhsTitleCharacterObservation('# 标题（19全字符）\n\n灵感网站别按网站收藏，按任务收藏\n\n标题字符数：19'))
      .toEqual({ titleCharacters: 16, modelDeclaredTitleCharacters: 19, titleCountMatches: false })
    expect(xhsTitleCharacterObservation('body only')).toEqual({ titleCharacters: null, modelDeclaredTitleCharacters: null, titleCountMatches: null })
    expect(draft).toContain('标题字符数：22')
  })

  it('finalizes an authoritative intermediate exactly once, releases its lease, and survives restart', async () => {
    const fixture = await xhsFixture()
    const prepared = await runningXhsAction(fixture, 'single')
    const result = await fixture.service.runRestrictedAgent(prepared.request)
    if (result.kind !== 'output-bundle') throw new Error('expected bundle')
    const before = await fixture.service.getOutputBundle(result.outputBundle.id)
    const [first, second] = await Promise.all([
      fixture.service.finalizeXhsOutputBundle(prepared.job.id, prepared.request.attemptId),
      fixture.service.finalizeXhsOutputBundle(prepared.job.id, prepared.request.attemptId),
    ])
    expect(second).toEqual(first)
    expect(first).toMatchObject({ status: 'completed', currentAttempt: null, attempts: [{ status: 'completed', lease: { status: 'released' }, agentRuns: [{ status: 'completed' }] }] })
    expect(first.operations.filter(op => op.kind === 'complete-attempt')).toHaveLength(1)
    expect(fixture.adapter.requests).toHaveLength(1)
    const observations = join(fixture.root, 'business-workbench/v0.1/execution-observations')
    const names = await readdir(observations)
    expect(names).toHaveLength(1)
    const telemetry = JSON.parse(await readFile(join(observations, names[0]!), 'utf8')) as Telemetry
    expect(telemetry).toMatchObject({ telemetryStatus: 'complete', metrics: { finishReason: 'stop', tokenUsage: { inputTokens: 2, outputTokens: 2, reasoningTokens: 0 } } })
    await fixture.dispose(false)
    const recoveryContext = await restartThroughLoader(fixture.root)
    const restarted = { ctx: recoveryContext, dispose: (_remove: boolean) => recoveryContext.fiber.dispose() }
    try {
      expect(restarted.ctx.businessWorkbench.getJob(first.id)).toEqual(first)
      expect({ job: first.status, attempt: first.attempts[0]!.status, agent: first.attempts[0]!.agentRuns[0]!.status,
        lease: first.attempts[0]!.lease!.status, output: first.attempts[0]!.outputBundle!.type, approval: false,
        modelAvailableDuringRecovery: recoveryContext.get('llm') !== undefined,
      }).toMatchInlineSnapshot(`
        {
          "agent": "completed",
          "approval": false,
          "attempt": "completed",
          "job": "completed",
          "lease": "released",
          "modelAvailableDuringRecovery": false,
          "output": "intermediate",
        }
      `)
      await expect(restarted.ctx.businessWorkbench.finalizeXhsOutputBundle(first.id, prepared.request.attemptId)).resolves.toEqual(first)
      await expect(restarted.ctx.businessWorkbench.getOutputBundle(result.outputBundle.id)).resolves.toEqual(before)
      expect(await restarted.ctx.businessWorkbench.reconcileOutputBundles()).toMatchObject({ referencedCount: 1, orphanBundles: [] })
    } finally { await restarted.dispose(false) }
  })

  it('recovers the post-bundle crash window without an Agent or provider and preserves missing telemetry', async () => {
    const fixture = await xhsFixture()
    fixture.adapter.reasoningTokens = undefined
    const prepared = await runningXhsAction(fixture, 'single')
    const result = await fixture.service.runRestrictedAgent(prepared.request)
    if (result.kind !== 'output-bundle') throw new Error('expected bundle')
    const before = await fixture.service.getOutputBundle(result.outputBundle.id)
    const persisted = fixture.service.getJob(prepared.job.id)!
    expect(persisted.status).toBe('running')
    expect(persisted.attempts[0]!.agentRuns[0]!.status).toBe('completed')
    await fixture.dispose(false)
    const recoveryContext = await restartThroughLoader(fixture.root)
    const restarted = { ctx: recoveryContext, dispose: (_remove: boolean) => recoveryContext.fiber.dispose() }
    try {
      const recovered = restarted.ctx.businessWorkbench.getJob(prepared.job.id)!
      expect(recovered.status).toBe('completed')
      expect(recovered.statusReason).toContain('telemetry-incomplete')
      expect(recovered.attempts[0]!.lease!.status).toBe('released')
      expect(recovered.attempts[0]!.agentRuns).toEqual(persisted.attempts[0]!.agentRuns)
      await expect(restarted.ctx.businessWorkbench.recoverInterruptedExecutions()).resolves.toBe(0)
      await expect(restarted.ctx.businessWorkbench.getOutputBundle(result.outputBundle.id)).resolves.toEqual(before)
      const dir = join(fixture.root, 'business-workbench/v0.1/execution-observations')
      const telemetry = JSON.parse(await readFile(join(dir, (await readdir(dir))[0]!), 'utf8')) as Telemetry
      expect(telemetry).toMatchObject({ telemetryStatus: 'incomplete', missingFields: ['reasoningTokens'], metrics: { finishReason: 'stop' } })
      expect(telemetry.metrics?.tokenUsage?.reasoningTokens).toBeUndefined()
    } finally { await restarted.dispose(false) }
    expect(fixture.adapter.requests).toHaveLength(1)
  })

  it('recovers legacy authoritative output with no observations and never invents token usage', async () => {
    const fixture = await xhsFixture()
    const prepared = await runningXhsAction(fixture, 'single')
    await fixture.service.runRestrictedAgent(prepared.request)
    const observationDir = join(fixture.root, 'business-workbench/v0.1/execution-observations')
    await rm(observationDir, { recursive: true })
    await fixture.dispose(false)
    const restarted = await setupHarness(fixture.root)
    try {
      expect(restarted.ctx.businessWorkbench.getJob(prepared.job.id)!.status).toBe('completed')
      const telemetry = JSON.parse(await readFile(join(observationDir, (await readdir(observationDir))[0]!), 'utf8')) as Telemetry
      expect(telemetry).toMatchObject({ telemetryStatus: 'incomplete', missingFields: ['metrics'], metrics: null })
    } finally { await restarted.dispose(false) }
  })

  it('refuses output-less, superseded, and corrupted finalization without a new business fact', async () => {
    const fixture = await xhsFixture()
    const prepared = await runningXhsAction(fixture, 'single')
    const pending = fixture.service.getJob(prepared.job.id)
    await expect(fixture.service.finalizeXhsOutputBundle(prepared.job.id, prepared.request.attemptId)).rejects.toMatchObject({ code: 'OUTPUT_BUNDLE_CONFLICT' })
    expect(fixture.service.getJob(prepared.job.id)).toEqual(pending)
    const result = await fixture.service.runRestrictedAgent(prepared.request)
    if (result.kind !== 'output-bundle') throw new Error('expected bundle')
    await expect(fixture.service.finalizeXhsOutputBundle(prepared.job.id, randomUUID() as never)).rejects.toMatchObject({ code: 'OUTPUT_BUNDLE_CONFLICT' })
    const before = fixture.service.getJob(prepared.job.id)
    await writeFile(join(fixture.root, 'business-workbench/v0.1', result.outputBundle.path, 'draft.md'), 'corrupted fixture')
    await expect(fixture.service.finalizeXhsOutputBundle(prepared.job.id, prepared.request.attemptId)).rejects.toBeInstanceOf(Error)
    expect(fixture.service.getJob(prepared.job.id)).toEqual(before)
    expect(fixture.adapter.requests).toHaveLength(1)
  })

  it('rejects corrupt telemetry and does not replace it or complete the Job', async () => {
    const fixture = await xhsFixture()
    const prepared = await runningXhsAction(fixture, 'single')
    await fixture.service.runRestrictedAgent(prepared.request)
    const directory = join(fixture.root, 'business-workbench/v0.1/execution-observations')
    const path = join(directory, (await readdir(directory))[0]!)
    const original = JSON.parse(await readFile(path, 'utf8')) as Telemetry
    const before = fixture.service.getJob(prepared.job.id)
    for (const changed of [{}, { ...original, jobId: randomUUID() }, { ...original, telemetryStatus: 'incomplete' }]) {
      const bytes = JSON.stringify(changed)
      await writeFile(path, bytes)
      await expect(fixture.service.finalizeXhsOutputBundle(prepared.job.id, prepared.request.attemptId)).rejects.toMatchObject({ code: 'TELEMETRY_CORRUPT' })
      expect(await readFile(path, 'utf8')).toBe(bytes)
      expect(fixture.service.getJob(prepared.job.id)).toEqual(before)
    }
  })

  it('freezes the keyless assembled action, policy, Skill origin, inputs, outputs, and schema', async () => {
    const fixture = await xhsFixture()
    const prepared = await runningXhsAction(fixture)
    const executionPackage = fixture.service.getJob(prepared.job.id)!.attempts[0]!.executionPackage!
    const policy = resolveRestrictedAgentPolicy(executionPackage, prepared.request.action, {
      provider: 'fixture-provider', model: 'fixture-model', maxTokens: 512, timeoutMs: 2_000,
    }, prepared.request.xhs)

    expect({
      assembly: XHS_BODY_PREPARE_ASSEMBLY,
      schemaVersion: BUSINESS_WORKBENCH_SCHEMA_VERSION,
      package: {
        workflowVersion: executionPackage.workflowVersion,
        inputRoles: executionPackage.inputs.map(input => input.role),
        allowedReadRoots: executionPackage.allowedReadRoots,
        allowedCapabilities: executionPackage.allowedCapabilities,
        allowedSkills: executionPackage.allowedSkills,
        skillSnapshots: executionPackage.skillSnapshots.map(skill => ({
          skillId: skill.skillId,
          source: skill.source,
          provider: skill.provider,
          contentHash: skill.contentHash,
        })),
      },
      policy: {
        action: policy.action,
        output: policy.output,
        policyVersion: policy.policyVersion,
        model: policy.model,
      },
    }).toMatchSnapshot()
  })

  it('runs one single Job through the complete fixture chain and recovers it after restart', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-business-phase4b-restart-'))
    const fixture = await xhsFixture(root)
    const prepared = await runningXhsAction(fixture, 'single')
    const singleBatch = fixture.service.getBatch(prepared.job.batchId)!
    expect(singleBatch).toMatchObject({ mode: 'single' })
    expect(singleBatch.jobIds).toEqual([prepared.job.id])
    expect(fixture.service.listJobs(singleBatch.id)).toHaveLength(1)
    const first = await fixture.service.runRestrictedAgent(prepared.request)
    const second = await fixture.service.runRestrictedAgent(prepared.request)
    expect(first.kind).toBe('output-bundle')
    if (first.kind !== 'output-bundle' || second.kind !== 'output-bundle') throw new Error('XHS action returned an ordinary Artifact')
    expect(second).toEqual({ kind: first.kind, run: first.run, outputBundle: first.outputBundle })
    expect(fixture.adapter.requests).toHaveLength(1)
    expect(fixture.adapter.requests[0]!.tools ?? []).toEqual([])
    const content = await fixture.service.getOutputBundle(first.outputBundle.id)
    expect(content.files['draft.md']).toContain('Synthetic content only.')
    expect(JSON.parse(content.files['draft-metadata.json'])).toMatchObject({
      jobId: prepared.job.id,
      attemptId: prepared.request.attemptId,
      action: 'xhs-body-prepare-v0',
      artifactType: 'intermediate',
      outputVersion: 1,
    })
    expect(JSON.parse(content.files['provenance.json'])).toMatchObject({
      status: 'completed',
      actionPolicyVersion: 'xhs-body-prepare-policy-v2-text',
      agentRun: { id: first.run.id },
    })
    const validationRef = fixture.service.getJob(prepared.job.id)!.artifactRefs.find(artifact => artifact.type === 'validation')!
    const validation = await fixture.service.getArtifact(validationRef.artifactId)
    expect(JSON.parse(validation.content)).toMatchObject({
      businessSchemaVersion: 5,
      outputBundleId: first.outputBundle.id,
      result: { validator: 'xhs-hard-contract-l1-v3', facts: { draftSha256: first.outputBundle.entries[0]?.hash } },
    })
    await expect(fixture.service.runRestrictedAgent({ ...prepared.request, idempotencyKey: 'second-success' }))
      .rejects.toMatchObject({ code: 'OUTPUT_BUNDLE_CONFLICT' })
    expect(fixture.adapter.requests).toHaveLength(1)
    const beforeCompletion = fixture.service.getJob(prepared.job.id)!
    await fixture.service.completeAttempt({
      jobId: beforeCompletion.id,
      attemptId: prepared.request.attemptId,
      expectedRevision: beforeCompletion.revision,
      idempotencyKey: 'complete',
      ownerId,
      outcome: 'completed',
    })
    await fixture.dispose(false)
    fixtures.splice(fixtures.indexOf(fixture), 1)

    const restarted = await setupHarness(root)
    try {
      const recovered = restarted.ctx.businessWorkbench.getJob(prepared.job.id)!
      expect(recovered.status).toBe('completed')
      expect(recovered.attempts[0]!.outputBundle).toEqual(first.outputBundle)
      await expect(restarted.ctx.businessWorkbench.getOutputBundle(first.outputBundle.id))
        .resolves.toEqual(content)
      const restartedValidation = restarted.ctx.businessWorkbench.getJob(prepared.job.id)!.artifactRefs
        .find(artifact => artifact.type === 'validation')!
      await expect(restarted.ctx.businessWorkbench.getArtifact(restartedValidation.artifactId)).resolves.toEqual(validation)
    } finally {
      await restarted.dispose(false)
      await rm(root, { recursive: true, force: true })
    }
  })

  it('fails closed on route, output, relation, hash, and staging-orphan errors', async () => {
    for (const output of [
      '',
      '{}',
      '{',
      JSON.stringify({ draft: '' }),
      JSON.stringify({ draft: 'ok', extra: true }),
      JSON.stringify({ draft: 'x'.repeat(XHS_DRAFT_MAX_BYTES + 1) }),
    ]) expect(() => parseXhsAgentDraft(output)).toThrow(expect.objectContaining({ code: 'XHS_BODY_OUTPUT_INVALID' }))
    const rejectedFixture = await xhsFixture()
    const rejected = await runningXhsAction(rejectedFixture)
    const executionPackage = rejectedFixture.service.getJob(rejected.job.id)!.attempts[0]!.executionPackage!
    const model = { provider: 'fixture-provider', model: 'fixture-model', timeoutMs: 2_000 }
    expect(() => resolveRestrictedAgentPolicy(executionPackage, 'xhs-body-prepare-v0', {
      provider: 'fixture-provider', model: 'fixture-model', timeoutMs: 2_000,
    }, { mode: 'fixture', account: 'account2', noteType: 'dry-search' })).toThrow(expect.objectContaining({ code: 'XHS_BODY_INPUT_INVALID' }))
    expect(() => resolveRestrictedAgentPolicy(executionPackage, 'xhs-body-prepare-v0', model))
      .toThrow(expect.objectContaining({ code: 'AGENT_ACTION_NOT_ALLOWED' }))
    expect(() => resolveRestrictedAgentPolicy(executionPackage, 'xhs-body-prepare-v0', model, {
      mode: 'fixture', account: 'unknown' as never, noteType: 'unknown' as never,
    })).toThrow(expect.objectContaining({ code: 'AGENT_ACTION_NOT_ALLOWED' }))
    expect(() => resolveRestrictedAgentPolicy(executionPackage, 'unknown-action' as never, model))
      .toThrow(expect.objectContaining({ code: 'AGENT_ACTION_NOT_ALLOWED' }))
    expect(() => resolveRestrictedAgentPolicy({
      ...executionPackage,
      skillSnapshots: executionPackage.skillSnapshots.map(skill => ({ ...skill, source: 'project-agents' })),
    }, 'xhs-body-prepare-v0', model, rejected.request.xhs))
      .toThrow(expect.objectContaining({ code: 'SKILL_ORIGIN_NOT_ALLOWED' }))
    await expect(rejectedFixture.service.runRestrictedAgent({
      ...rejected.request,
      idempotencyKey: 'wrong-package',
      executionPackageId: `package_${'0'.repeat(64)}` as never,
    }))
      .rejects.toMatchObject({ code: 'EXECUTION_PACKAGE_CONFLICT' })
    expect(rejectedFixture.adapter.requests).toHaveLength(0)

    const fixture = await xhsFixture()
    const prepared = await runningXhsAction(fixture)
    const successful = await fixture.service.runRestrictedAgent(prepared.request)
    if (successful.kind !== 'output-bundle') throw new Error('XHS action returned an ordinary Artifact')
    const content = await fixture.service.getOutputBundle(successful.outputBundle.id)
    const files = content.files as { 'draft.md': string; 'draft-metadata.json': string; 'provenance.json': string }
    expect(() => { assertXhsOutputBundle(successful.outputBundle, { ...files, 'draft-metadata.json': '{}' }) })
      .toThrow(expect.objectContaining({ code: 'XHS_BODY_OUTPUT_INVALID' }))
    expect(() => { assertXhsOutputBundle(successful.outputBundle, { ...files, 'provenance.json': '{}' }) })
      .toThrow(expect.objectContaining({ code: 'XHS_BODY_OUTPUT_INVALID' }))
    expect(() => { assertXhsOutputBundle(successful.outputBundle, { ...files, 'draft.md': `${files['draft.md']} changed` }) })
      .toThrow(expect.objectContaining({ code: 'XHS_BODY_OUTPUT_INVALID' }))
    expect(() => {
      assertXhsOutputBundle({
        ...successful.outputBundle,
        entries: successful.outputBundle.entries.slice(0, 2),
      } as never, files)
    }).toThrow(expect.objectContaining({ code: 'XHS_BODY_OUTPUT_INVALID' }))

    const wrongMetadata = { ...JSON.parse(files['draft-metadata.json']) as Record<string, unknown>, jobId: randomUUID() }
    const wrongMetadataBody = `${JSON.stringify(wrongMetadata, null, 2)}\n`
    const relationProvenance = {
      ...JSON.parse(files['provenance.json']) as Record<string, unknown>,
      metadataHash: textHash(wrongMetadataBody),
    }
    const relationFiles = {
      ...files,
      'draft-metadata.json': wrongMetadataBody,
      'provenance.json': `${JSON.stringify(relationProvenance, null, 2)}\n`,
    }
    expect(() => { assertXhsOutputBundle(rebuildBundle(successful.outputBundle, relationFiles), relationFiles) })
      .toThrow(expect.objectContaining({ code: 'XHS_BODY_OUTPUT_INVALID' }))

    const wrongHashProvenance = {
      ...JSON.parse(files['provenance.json']) as Record<string, unknown>,
      draftHash: '0'.repeat(64),
    }
    const wrongHashFiles = { ...files, 'provenance.json': `${JSON.stringify(wrongHashProvenance, null, 2)}\n` }
    expect(() => { assertXhsOutputBundle(rebuildBundle(successful.outputBundle, wrongHashFiles), wrongHashFiles) })
      .toThrow(expect.objectContaining({ code: 'XHS_BODY_OUTPUT_INVALID' }))
    expect(() => { assertXhsOutputBundle({ ...successful.outputBundle, manifestHash: '0'.repeat(64) }, files) })
      .toThrow(expect.objectContaining({ code: 'XHS_BODY_OUTPUT_INVALID' }))

    const orphanStore = new BusinessOutputBundleStore(join(fixture.root, 'orphan-bundles'))
    await orphanStore.initialize()
    await expect(orphanStore.read(successful.outputBundle)).rejects.toMatchObject({ code: 'OUTPUT_BUNDLE_MISSING' })
    const invalidStage = { bundleId: successful.outputBundle.id, path: join(fixture.root, 'outside-stage') }
    await expect(orphanStore.publish(invalidStage, successful.outputBundle, files))
      .rejects.toMatchObject({ code: 'OUTPUT_BUNDLE_CONFLICT' })
    const firstStage = await orphanStore.stage(successful.outputBundle, files)
    await orphanStore.publish(firstStage, successful.outputBundle, files)
    const secondStage = await orphanStore.stage(successful.outputBundle, files)
    await orphanStore.publish(secondStage, successful.outputBundle, files)
    await expect(orphanStore.reconcile(new Set())).resolves.toMatchObject({
      referencedCount: 0,
      orphanBundles: [{ kind: 'published' }],
    })
    await expect(orphanStore.reconcile(new Set([successful.outputBundle.path]))).resolves.toEqual({
      referencedCount: 1,
      orphanBundles: [],
    })
    const changedBundle = rebuildBundle(successful.outputBundle, files, { actionPolicyVersion: 'different-policy' })
    await expect(orphanStore.read(changedBundle)).rejects.toMatchObject({ code: 'OUTPUT_BUNDLE_CORRUPT' })
    await orphanStore.stage(successful.outputBundle, files)
    await expect(orphanStore.reconcile(new Set())).resolves.toMatchObject({
      referencedCount: 0,
      orphanBundles: [{ kind: 'published' }, { kind: 'staging' }],
    })
  })
})
