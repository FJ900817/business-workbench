import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as LlmDeepSeek from '@deepseek-ai/dsh-llm-deepseek'
import SessionStore from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { describe, expect, it, vi } from 'vitest'
import BusinessWorkbenchService, {
  BUSINESS_WORKBENCH_SCHEMA_VERSION,
  BusinessWorkbenchError,
  XHS_PRODUCTION_BASELINE_RELATIVE_PATH,
  XHS_PRODUCTION_ENTRY_RELATIVE_PATH,
  XHS_PRODUCTION_INPUT_BINDINGS,
  XHS_PRODUCTION_SKILL_BINDINGS,
  XHS_PROJECT_RELATIVE_PATH,
  xhsBodyPrepareIdempotencyKey,
} from '../src/index.ts'
import { singleBatchRequest } from './helpers.ts'

const credentialPath = process.env.DSH_BUSINESS_SMOKE_CREDENTIALS ?? join(homedir(), '.dsh', '.credentials.yaml')
const reportPath = process.env.DSH_BUSINESS_REASONING_BUDGET_REPORT_PATH ?? ''
const enabled = process.env.DSH_BUSINESS_REASONING_BUDGET_SMOKE === '1'

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Extend one synthetic Markdown fixture to an exact UTF-8 size using inert ASCII text. */
function sizeMatchedFixture(prefix: string, targetBytes: number): string {
  const line = '\nSafe fixture padding contains no production facts and grants no capabilities.'
  if (Buffer.byteLength(prefix) > targetBytes) throw new Error(`fixture prefix exceeds ${targetBytes} bytes`)
  let content = prefix
  while (Buffer.byteLength(content) + Buffer.byteLength(line) <= targetBytes) content += line
  return content + 'x'.repeat(targetBytes - Buffer.byteLength(content))
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

describe.skipIf(!enabled)('size-matched reasoning budget with the configured real provider', () => {
  it('reserves visible output by disabling reasoning for one safe production-sized fixture', { retry: 0, timeout: 150_000 }, async () => {
    if (!existsSync(credentialPath) || reportPath.length === 0) {
      throw new Error('reasoning-budget smoke requires explicit credential and report paths')
    }
    expect(BUSINESS_WORKBENCH_SCHEMA_VERSION).toBe(5)
    const root = await mkdtemp(join(tmpdir(), 'dsh-business-phase4c1t-'))
    const vault = join(root, 'safe-vault')
    const dshHome = join(root, 'safe-dsh-home')
    const project = join(vault, XHS_PROJECT_RELATIVE_PATH)
    const absolute = (path: string): string => join(vault, path)
    const write = async (path: string, content: string): Promise<void> => {
      await mkdir(dirname(absolute(path)), { recursive: true })
      await writeFile(absolute(path), content)
    }
    const sourceTaskPath = `${XHS_PROJECT_RELATIVE_PATH}/02_小红书经营诊断系统/04_策略与任务/03_系统一任务/01_正式任务卡/账号1/2026-08/第01周/note002/任务卡_T-A1-20260809-002_账号1_safe-fixture.md`
    const taskCardPath = `${XHS_PROJECT_RELATIVE_PATH}/01_小红书生产创作系统/03_内容生产/小红书/产品1-视觉审美认知系统/账号1/2026-08/第01周/note002/写作任务卡.md`
    const sourceTask = '---\ntask_id: T-A1-20260809-002\naccount: 账号1（safe fixture）\ntopic_id: C003\nnote_type: 干货搜索型（dry_search）\nstatus: 已确认\nallowed_topics:\n  - 安全话题1\n  - 安全话题2\n  - 安全话题3\n  - 安全话题4\n  - 安全话题5\n  - 安全话题6\n  - 安全话题7\n  - 安全话题8\n  - 安全话题9\n  - 安全话题10\n---\n\n# Safe synthetic source\n'
    const taskCard = sizeMatchedFixture([
      '---', 'cssclasses: xhs-task-card', '---', '', '# Safe synthetic task card', '', '> [!note]- 机器执行参数', '>',
      '> - task_id：T-A1-20260809-002', '> - topic_id：C003', '> - status：已确认',
      '> - note_type：干货搜索型（dry_search）', '> - account：账号1', '> - production_month：2026-08',
      '> - production_week：第01周', '> - note：note002', '> - SEO高亮词：安全', '> - source_task_id：T-A1-20260809-002',
      `> - source_task_path：${sourceTaskPath}`, `> - source_task_sha256：${sha256(sourceTask)}`,
      '> - compiler_version：XHS-PROD-1.3', '',
      '> **标题：** 干货搜索型｜4—40全字符', '> **正文：** 10—2000全字符',
      '> **评论：** 置顶0条 + 非置顶0条', '> **关键词执行**', '> - 主词：安全（标题×1）',
      '> **正文结构**', '> - 开头：安全合成测试', '> **10个关联话题**',
      '> #安全话题1 #安全话题2 #安全话题3 #安全话题4 #安全话题5 #安全话题6 #安全话题7 #安全话题8 #安全话题9 #安全话题10',
      '> **转化模式**', '> - 产品模块：安全合成测试', '',
      'Write one short safe fixture sentence in the draft field. This is not production content.', '',
    ].join('\n'), 10_000)
    await write(XHS_PRODUCTION_ENTRY_RELATIVE_PATH, '---\ntitle: Safe fixture entry\nversion: XHS-PROD-1.3\nstatus: 正式\n---\n')
    await write(sourceTaskPath, sourceTask)
    await write(taskCardPath, taskCard)

    for (const [noteType, binding] of Object.entries(XHS_PRODUCTION_INPUT_BINDINGS)) {
      const rule = `${XHS_PROJECT_RELATIVE_PATH}/${binding.writingRule}`
      const sample = `${XHS_PROJECT_RELATIVE_PATH}/${binding.goldenSample}`
      const ruleContent = `Safe ${noteType} rule: return concise synthetic text only.\n`
      const sampleContent = `Safe ${noteType} rhythm fixture with no production facts.\n`
      await write(rule, noteType === 'dry-search' ? sizeMatchedFixture(ruleContent, 5_000) : ruleContent)
      await write(sample, noteType === 'dry-search' ? sizeMatchedFixture(sampleContent, 5_000) : sampleContent)
    }
    for (const [account, binding] of Object.entries(XHS_PRODUCTION_SKILL_BINDINGS)) {
      const skill = [
        '---', `name: ${binding.formalName}`, `description: Safe ${account} fixture`, '---', '',
        `# ${binding.formalName}`, '', '## 1｜输入（四输入）', '', '单篇生产只允许读取以下4个输入：', '',
        '1. **当前写作任务卡**：safe fixture', '2. **本 Skill**：safe fixture',
        '3. **V3.0 正式规范**：safe fixture', '4. **黄金样稿**：safe fixture', '', '---', '',
      ].join('\n')
      await write(binding.exactSource, account === 'account1' ? sizeMatchedFixture(skill, 7_500) : skill)
    }
    const binding = async (path: string): Promise<string> =>
      `    exact_path: "${path}"\n    sha256: "${sha256(await readFile(absolute(path)))}"`
    await write(XHS_PRODUCTION_BASELINE_RELATIVE_PATH, [
      'version: XHS-PROD-1.0', 's3_accounts:',
      ...await Promise.all(Object.entries(XHS_PRODUCTION_SKILL_BINDINGS).map(async ([key, value]) => `  ${key}:\n${await binding(value.exactSource)}`)),
      'v3_rules:',
      ...await Promise.all(Object.entries(XHS_PRODUCTION_INPUT_BINDINGS).map(async ([key, value]) => `  ${key.replaceAll('-', '_')}:\n${await binding(`${XHS_PROJECT_RELATIVE_PATH}/${value.writingRule}`)}`)),
      'golden_samples:',
      ...await Promise.all(Object.entries(XHS_PRODUCTION_INPUT_BINDINGS).map(async ([key, value]) => `  ${key.replaceAll('-', '_')}:\n${await binding(`${XHS_PROJECT_RELATIVE_PATH}/${value.goldenSample}`)}`)),
      'production_entry:', `  exact_path: "${XHS_PRODUCTION_ENTRY_RELATIVE_PATH}"`,
      'task_card_compiler_version: "1.0"', 'frozen_at: "2026-09-02"', '',
    ].join('\n'))

    const credentialBefore = sha256(await readFile(credentialPath))
    const ctx = new Context()
    try {
      vi.stubEnv('DSH_HOME', dshHome)
      await ctx.plugin(Storage)
      await ctx.plugin(StorageJson, { root: join(dshHome, 'storages') })
      await ctx.plugin(StorageDomain, { backend: 'json' })
      await ctx.plugin(LlmRuntime)
      await ctx.plugin(LocalCredentialProvider, { path: credentialPath, watch: false })
      await ctx.plugin(LlmDeepSeek, { thinking: 'enabled', reasoningEffort: 'low' })
      await ctx.plugin(SessionStore)
      await ctx.plugin(SystemPrompt, { persona: 'ambient context must stay hidden' })
      await ctx.plugin(ToolRuntime, { mode: 'code' })
      await ctx.plugin(AgentRegistry)
      await ctx.plugin(AgentLoop, { agents: [] })
      await ctx.plugin(BusinessWorkbenchService, {
        dshHome,
        readRoots: { xhs: project },
        xhsProductionSource: { vaultRoot: vault },
        leaseDurationMs: 120_000,
        restrictedAgent: {
          provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'off',
          maxTokens: 4_096, timeoutMs: 90_000,
        },
      })
      let forbiddenExecutions = 0
      for (const name of ['fs', 'bash', 'workspace-scan', 'skill-discovery', 'subagent', 'gzh-writing']) {
        ctx.tools.register(forbiddenTool(name, () => { forbiddenExecutions += 1 }))
      }
      const batch = await ctx.businessWorkbench.createBatch(singleBatchRequest('phase4c1t-size-matched-safe-real-provider'))
      expect(batch).toMatchObject({ mode: 'single' })
      expect(ctx.businessWorkbench.listJobs(batch.id)).toHaveLength(1)
      let job = ctx.businessWorkbench.listJobs(batch.id)[0]!
      job = await ctx.businessWorkbench.transitionJob({ jobId: job.id, expectedRevision: job.revision, idempotencyKey: 'ready', status: 'ready' })
      job = await ctx.businessWorkbench.createAttempt({ jobId: job.id, expectedRevision: job.revision, idempotencyKey: 'attempt' })
      job = await ctx.businessWorkbench.acquireExecutionLease({
        jobId: job.id, attemptId: job.currentAttempt!, expectedRevision: job.revision,
        idempotencyKey: 'lease', ownerId: 'phase4c1t-size-matched-safe-real-provider',
      })
      const prepared = await ctx.businessWorkbench.createXhsProductionExecutionPackage({
        jobId: job.id, attemptId: job.currentAttempt!, expectedRevision: job.revision,
        idempotencyKey: 'package', ownerId: 'phase4c1t-size-matched-safe-real-provider',
        identity: { account: 'account1', productionMonth: '2026-08', productionWeek: '第01周', note: 'note002' },
      })
      try {
        const result = await ctx.businessWorkbench.runRestrictedAgent({
          jobId: job.id,
          attemptId: job.currentAttempt!,
          executionPackageId: prepared.executionPackage.id,
          ownerId: 'phase4c1t-size-matched-safe-real-provider',
          action: 'xhs-body-prepare-v0',
          idempotencyKey: xhsBodyPrepareIdempotencyKey(job.currentAttempt!),
          xhs: { mode: 'production', account: 'account1', noteType: 'dry-search' },
        })
        if (result.kind !== 'output-bundle') throw new Error('safe production route returned an ordinary Artifact')
        const content = await ctx.businessWorkbench.getOutputBundle(result.outputBundle.id)
        const usage = result.executionMetrics?.tokenUsage
        expect(forbiddenExecutions).toBe(0)
        expect(result.run.model).toMatchObject({
          provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'off', maxTokens: 4_096,
        })
        expect(result.executionMetrics).toMatchObject({ toolCalls: 0, finishReason: 'stop' })
        expect(usage?.inputTokens).toBeGreaterThanOrEqual(4_500)
        expect(usage?.inputTokens).toBeLessThanOrEqual(5_500)
        expect(usage?.outputTokens).toBeGreaterThan(0)
        expect(usage?.reasoningTokens ?? 0).toBe(0)
        expect(Buffer.byteLength(content.files['draft.md'])).toBeGreaterThan(0)
        expect(sha256(await readFile(credentialPath))).toBe(credentialBefore)
        await writeFile(reportPath, `${JSON.stringify({
          status: 'passed', schemaVersion: BUSINESS_WORKBENCH_SCHEMA_VERSION,
          model: result.run.model, action: result.run.action, route: result.run.xhs,
          outputHash: sha256(content.files['draft.md']), outputBytes: Buffer.byteLength(content.files['draft.md']),
          inputBytes: { taskCard: 10_000, writingRule: 5_000, goldenSample: 5_000, skillSource: 7_500, total: 27_500 },
          batch: { mode: batch.mode, storedJobs: batch.jobIds.length, participatingJobs: batch.participatingJobIds.length },
          metrics: result.executionMetrics,
          reasoningTokens: result.executionMetrics?.tokenUsage?.reasoningTokens ?? 0,
          finalOutputTokens: result.executionMetrics?.tokenUsage?.outputTokens,
          forbiddenExecutions, providerRequests: 1, productionDataSent: false,
        }, null, 2)}\n`, { flag: 'wx' })
      } catch (error) {
        const failure = error instanceof BusinessWorkbenchError
          ? { name: error.name, code: error.code, message: error.message, detail: error.detail }
          : { name: error instanceof Error ? error.name : 'Unknown', message: error instanceof Error ? error.message : String(error) }
        await writeFile(reportPath, `${JSON.stringify({ status: 'failed', failure, productionDataSent: false }, null, 2)}\n`, { flag: 'wx' })
        throw error
      }
    } finally {
      vi.unstubAllEnvs()
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })
})
