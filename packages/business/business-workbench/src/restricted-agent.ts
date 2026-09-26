/** Tool-free AgentLoop adapter for one Business-materialized request. */

import type { Context } from '@deepseek-ai/cordis'
import type AgentRegistry from '@deepseek-ai/dsh-agent'
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import type ToolRuntime from '@deepseek-ai/dsh-tools'
import { BusinessWorkbenchError } from './errors.ts'
import type { RestrictedAgentOutputDiagnostics } from './errors.ts'
import type { RestrictedAgentModelConfig } from './host-policy.ts'
import type { BusinessAgentExecutionMetrics, BusinessAgentTokenUsage } from './types.ts'

/** Fully materialized input for one restricted Harness Agent. */
export interface RestrictedAgentInvocation {
  readonly agentRunId: string
  readonly sessionId: string
  readonly systemPrompt: string
  readonly userPrompt: string
  readonly model: RestrictedAgentModelConfig
}

/** Model output plus execution facts observed at the Agent boundary. */
export interface RestrictedAgentInvocationResult {
  readonly output: string
  readonly metrics: BusinessAgentExecutionMetrics
}

type RestrictedAgentContext = Context & {
  readonly agents: AgentRegistry
  readonly systemPrompt: SystemPrompt
  readonly tools: ToolRuntime
}

/** Executes an isolated one-turn Agent with no callable tools or ambient context. */
export class HarnessRestrictedAgentRuntime {
  /** @param ctx - Host context carrying the assembled Agent, Tool, and prompt services. */
  constructor(private readonly ctx: RestrictedAgentContext) {}

  /**
   * Run exactly one fresh Agent turn and dispose its live Session afterward.
   * @param invocation - frozen prompts, fixed model route, timeout, and session identity.
   * @returns plain text output and transient request metrics after confirming no tool call entered the session log.
   */
  async run(invocation: RestrictedAgentInvocation): Promise<RestrictedAgentInvocationResult> {
    const handle = await this.ctx.agents.create({
      sessionId: SessionId(invocation.sessionId),
      agentOptions: {
        provider: invocation.model.provider,
        model: invocation.model.model,
        ...(invocation.model.maxTokens === undefined ? {} : { maxTokens: invocation.model.maxTokens }),
      },
      setup: (agentCtx) => {
        agentCtx.tools.presentAs('native')
        agentCtx.tools.restrict({ allow: [] })
        agentCtx.tools.guard(() => 'Business restricted Agent denies every tool execution')
        agentCtx.systemPrompt.suppressRuntimeContext()
        agentCtx.systemPrompt.section({
          name: 'business:restricted-agent',
          order: 0,
          text: invocation.systemPrompt,
          complete: true,
        })
        if (invocation.model.reasoningEffort !== undefined) {
          agentCtx.on('agent/request', async (_request, next) => ({
            ...await next(),
            reasoningEffort: ReasoningEffortId(invocation.model.reasoningEffort as string),
          }))
        }
      },
    })
    const timeout = Promise.withResolvers<never>()
    const timer = setTimeout(() => {
      handle.agent.cancel({ kind: 'hook', reason: 'business restricted Agent timeout' })
      timeout.reject(new BusinessWorkbenchError('MODEL_TIMEOUT', 'business-workbench: restricted Agent model request timed out'))
    }, invocation.model.timeoutMs)
    try {
      handle.agent.followup(createUserMessage({
        content: [{ type: 'text', text: invocation.userPrompt }],
        source: { kind: 'plugin', plugin: 'dsh-business-workbench' },
      }))
      await Promise.race([handle.agent.whenIdle(), timeout.promise])
      const events = handle.agent.session.events
      const toolCalls = events.filter(event => event.type === 'tool/call').length
      if (toolCalls > 0) {
        throw new BusinessWorkbenchError('TOOL_POLICY_VIOLATION', 'business-workbench: restricted Agent attempted a tool call')
      }
      const assistant = events.findLast(event => event.type === 'assistant/message')
      if (assistant?.type !== 'assistant/message') {
        const turnEnd = events.findLast(event => event.type === 'turn/end')
        if (turnEnd?.type === 'turn/end' && turnEnd.data.reason.kind === 'error') {
          const { code, message } = turnEnd.data.reason.error
          throw new BusinessWorkbenchError(
            'PROVIDER_ERROR',
            `business-workbench: restricted Agent provider failed (${code}): ${message}`,
          )
        }
        throw emptyOutputError(invocation, events, '', 'final_message_extraction')
      }
      const output = assistant.data.message.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('')
      if (output.length === 0) {
        throw emptyOutputError(invocation, events, output, 'business_output_extraction')
      }
      const requestStartedAt = events.find(event => event.type === 'step/start')?.time ?? assistant.time
      const firstResponseAt = events.find(event => event.type === 'assistant/chunk')?.time
      const finishReason = events.reduce<string | undefined>((current, event) =>
        event.type === 'assistant/chunk' && event.data.chunk.type === 'finish'
          ? event.data.chunk.reason.kind
          : current, undefined)
      const tokenUsage = assistant.data.usage === undefined ? undefined : tokenUsageSnapshot(assistant.data.usage)
      return Object.freeze({
        output,
        metrics: Object.freeze({
          requestStartedAt,
          ...(firstResponseAt === undefined ? {} : { firstResponseAt }),
          responseCompletedAt: assistant.time,
          agentDurationMs: Math.max(0, assistant.time - requestStartedAt),
          ...(finishReason === undefined ? {} : { finishReason }),
          toolCalls,
          ...(tokenUsage === undefined ? {} : { tokenUsage }),
        }),
      })
    } finally {
      clearTimeout(timer)
      await handle.dispose()
    }
  }
}

/** Build one content-free diagnostic from the normalized Session event log. */
function emptyOutputError(
  invocation: RestrictedAgentInvocation,
  events: readonly SessionEvent[],
  output: string,
  errorStage: RestrictedAgentOutputDiagnostics['errorStage'],
): BusinessWorkbenchError {
  const assistants = events.filter(event => event.type === 'assistant/message')
  const assistant = assistants.at(-1)
  const chunks = events.filter(event => event.type === 'assistant/chunk')
  const finishReason = chunks.reduce<string | undefined>((current, event) =>
    event.data.chunk.type === 'finish' ? event.data.chunk.reason.kind : current, undefined)
  const startedAt = events.find(event => event.type === 'step/start')?.time
  const completedAt = assistant?.time ?? events.findLast(event => event.type === 'turn/end')?.time ?? Date.now()
  const tokenUsage = assistant?.data.usage === undefined ? undefined : tokenUsageSnapshot(assistant.data.usage)
  const finalTextBytes = Buffer.byteLength(output, 'utf8')
  const diagnostics: RestrictedAgentOutputDiagnostics = Object.freeze({
    diagnosticsVersion: 2,
    provider: invocation.model.provider,
    model: invocation.model.model,
    ...(invocation.model.reasoningEffort === undefined ? {} : { reasoningEffort: invocation.model.reasoningEffort }),
    ...(invocation.model.maxTokens === undefined ? {} : { maxTokens: invocation.model.maxTokens }),
    agentRunId: invocation.agentRunId,
    sessionId: invocation.sessionId,
    ...(finishReason === undefined ? {} : { finishReason }),
    assistantMessageCount: assistants.length,
    textDeltaCount: chunks.filter(event => event.data.chunk.type === 'text-delta').length,
    reasoningDeltaCount: chunks.filter(event => event.data.chunk.type === 'reasoning-delta').length,
    toolCallCount: events.filter(event => event.type === 'tool/call').length,
    finalEventCount: chunks.filter(event => event.data.chunk.type === 'finish').length,
    contentFieldType: assistant === undefined ? 'absent' : 'array',
    finalTextBytes,
    ...(tokenUsage === undefined ? {} : { tokenUsage }),
    durationMs: Math.max(0, completedAt - (startedAt ?? completedAt)),
    errorStage,
  })
  const reasoningBudgetExhausted = finishReason === 'max-tokens'
    && (tokenUsage?.reasoningTokens ?? 0) > 0
    && finalTextBytes === 0
  return new BusinessWorkbenchError(
    reasoningBudgetExhausted ? 'REASONING_BUDGET_EXHAUSTED' : 'EMPTY_AGENT_OUTPUT',
    reasoningBudgetExhausted
      ? 'business-workbench: restricted Agent spent the output budget on reasoning before producing final text'
      : 'business-workbench: restricted Agent produced no visible text output',
    { outputDiagnostics: diagnostics },
  )
}

/** Copy provider usage into the Business-owned transient metric vocabulary. */
function tokenUsageSnapshot(usage: BusinessAgentTokenUsage): BusinessAgentTokenUsage {
  return Object.freeze({
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    ...(usage.cacheReadTokens === undefined ? {} : { cacheReadTokens: usage.cacheReadTokens }),
    ...(usage.cacheWriteTokens === undefined ? {} : { cacheWriteTokens: usage.cacheWriteTokens }),
    ...(usage.reasoningTokens === undefined ? {} : { reasoningTokens: usage.reasoningTokens }),
  })
}
