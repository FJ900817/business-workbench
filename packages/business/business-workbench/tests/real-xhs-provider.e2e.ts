import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as LlmDeepSeek from '@deepseek-ai/dsh-llm-deepseek'
import SessionStore from '@deepseek-ai/dsh-session'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { XHS_BODY_PREPARE_CONTRACT, XHS_BODY_PREPARE_SKILLS } from '../src/index.ts'
import { batchRequest, setupHarness } from './helpers.ts'

const credentialPath = process.env.DSH_BUSINESS_SMOKE_CREDENTIALS ?? join(homedir(), '.dsh', '.credentials.yaml')
const enabled = process.env.DSH_BUSINESS_REAL_XHS_SMOKE === '1' && existsSync(credentialPath)
const fixtures: Awaited<ReturnType<typeof setupHarness>>[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose()))
})

function hash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function forbiddenTool(name: string, executed: () => void): ToolDefinition {
  return {
    name,
    description: `forbidden ${name}`,
    parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'string' }, render: () => [] },
    execute: () => { executed(); return Promise.resolve('forbidden') },
  }
}

describe.skipIf(!enabled)('XHS production action with the configured real provider', () => {
  it('creates one safe fixture output bundle without exposing a tool', { retry: 0, timeout: 115_000 }, async () => {
    const credentialBefore = hash(await readFile(credentialPath))
    const fixture = await setupHarness(undefined, 120_000, {
      provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'low', maxTokens: 512, timeoutMs: 90_000,
    })
    fixtures.push(fixture)
    vi.stubEnv('DSH_HOME', fixture.root)
    const { ctx } = fixture
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(LocalCredentialProvider, { path: credentialPath, watch: false })
    await ctx.plugin(LlmDeepSeek, { thinking: 'enabled', reasoningEffort: 'low' })
    await ctx.plugin(SessionStore)
    await ctx.plugin(SystemPrompt, { persona: 'ambient production context must stay hidden' })
    await ctx.plugin(ToolRuntime, { mode: 'code' })
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(SkillRegistry)
    ctx.skills.register({
      name: XHS_BODY_PREPARE_SKILLS[0],
      description: 'Safe formal-S3 fixture',
      source: 'runtime',
      content: 'Return one JSON object with only a draft field. Use only supplied safe fixture text.',
    })
    let executed = 0
    for (const name of ['fs', 'bash', 'workspace-scan', 'skill-discovery', 'subagent', 'gzh-writing']) {
      ctx.tools.register(forbiddenTool(name, () => { executed += 1 }))
    }
    const xhsRoot = join(fixture.root, 'business-inputs', 'xhs-source')
    await writeFile(join(xhsRoot, 'current-task.md'), [
      '> [!note]- 机器执行参数',
      '> - task_id：TEST-XHS-REAL-001',
      '> - topic_id：TEST-TOPIC-REAL-001',
      '> - status：已确认',
      '> - note_type：干货搜索型（dry_search）',
      '> - account：账号1',
      '> - production_month：2026-08',
      '> - production_week：第01周',
      '> - note：note001',
      '> - SEO高亮词：安全',
      '> - compiler_version：XHS-PROD-1.3',
      '> **标题：** 干货搜索型｜4—40全字符',
      '> **正文：** 10—2000全字符',
      '> **评论：** 置顶0条 + 非置顶0条',
      '> **关键词执行**',
      '> - 主词：安全（标题×1）',
      '> **正文结构**',
      '> - 开头：明确这是安全合成测试',
      '> **0个关联话题**',
      '> **转化模式**',
      '> - 产品模块：安全合成测试',
      '> - 禁止扫描任何 Vault 或调用任何工具',
      '',
    ].join('\n'))
    await writeFile(join(xhsRoot, 'rules', 'writing.md'), 'Write two short synthetic Markdown sentences.')
    await writeFile(join(xhsRoot, 'rules', 'golden-sample.md'), 'Fixture rhythm only. Contains no production facts.')

    const batch = await ctx.businessWorkbench.createBatch(batchRequest(`phase4b-real-${randomUUID()}`))
    let job = ctx.businessWorkbench.listJobs(batch.id)[0]!
    job = await ctx.businessWorkbench.transitionJob({ jobId: job.id, expectedRevision: job.revision, idempotencyKey: 'ready', status: 'ready' })
    job = await ctx.businessWorkbench.createAttempt({ jobId: job.id, expectedRevision: job.revision, idempotencyKey: 'attempt' })
    job = await ctx.businessWorkbench.acquireExecutionLease({
      jobId: job.id, attemptId: job.currentAttempt!, expectedRevision: job.revision, idempotencyKey: 'lease', ownerId: 'phase4b-real-owner',
    })
    const executionPackage = await ctx.businessWorkbench.createExecutionPackage({
      jobId: job.id,
      attemptId: job.currentAttempt!,
      expectedRevision: job.revision,
      idempotencyKey: 'package',
      ownerId: 'phase4b-real-owner',
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
    const result = await ctx.businessWorkbench.runRestrictedAgent({
      jobId: job.id,
      attemptId: job.currentAttempt!,
      executionPackageId: executionPackage.id,
      ownerId: 'phase4b-real-owner',
      action: 'xhs-body-prepare-v0',
      idempotencyKey: `xhs-body-prepare-v0:attempt:${job.currentAttempt}`,
      xhs: { mode: 'fixture', account: 'account1', noteType: 'dry-search' },
    })
    expect(result.kind).toBe('output-bundle')
    if (result.kind !== 'output-bundle') throw new Error('XHS action returned an ordinary Artifact')
    expect(executed).toBe(0)
    expect(result.run.model).toMatchObject({ provider: 'deepseek-official', model: 'deepseek-v4-flash' })
    await expect(ctx.businessWorkbench.getOutputBundle(result.outputBundle.id)).resolves.toMatchObject({
      bundle: { id: result.outputBundle.id, outputVersion: 1 },
    })
    expect(hash(await readFile(credentialPath))).toBe(credentialBefore)
  })
})
