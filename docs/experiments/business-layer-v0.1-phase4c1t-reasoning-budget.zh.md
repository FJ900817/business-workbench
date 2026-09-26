# Business Layer V0.1 Phase 4C-1T：推理预算

[English](business-layer-v0.1-phase4c1t-reasoning-budget.md) | 中文

## 结果

Phase 4C-1T 通过。选定候选继续使用 `deepseek-official / deepseek-v4-flash / maxTokens 4096`，并把 Business 持有的请求 effort 从 `low` 改为 `off`。一次生产规模 synthetic 请求返回了可见 final text：`5058` input tokens、`10` output tokens、`0` reasoning tokens、finish reason `stop`、tool call 为 `0`、forbidden execution 为 `0`。测试没有接触生产真源或生产 Business 状态。

## 生产失败证据

保留的 Phase 4C-1 Retry 事实为：`deepseek-v4-flash / low / 4096` 收到 `5033` input tokens，报告 `4097` output tokens、`4097` reasoning tokens、final text 为零 bytes，finish reason 为 `max-tokens`。报告的 output 与 reasoning token 数相等，证明该响应在 final text 开始前已经用尽全部生成 token 配额。Provider 报告的总数比请求 cap 多一个 token；现有 wire 事实无法进一步解释该计费边缘，但不影响 exhaustion 分类。两个失败生产 Attempt 均保持不变；新分类只作用于未来运行。

## Provider 与 Adapter 能力

| 问题 | 当前结论 |
|---|---|
| 完全关闭 reasoning | 支持。官方 Chat Completions 接受 `thinking.type = disabled`；Harness adapter 暴露 adapter 持有的 `off` effort，序列化该 toggle，并省略 `reasoning_effort`。 |
| 可选 reasoning effort | 官方端点区分 `low`、`high`、`max`，`medium` 映射为 `high`。Harness 暴露 `off`、`low`、`high`、`max`，没有遗漏语义独立的官方 effort。 |
| 独立 reasoning cap | 当前官方 Chat Completions request 与 Harness `GenerateOptions` 都没有该字段。 |
| 独立 final reserve | 当前官方 request、adapter、LLM call config 与 AgentLoop request config 都没有该字段。 |
| 共享 output cap | Harness `maxTokens` 序列化为 `max_tokens`。Provider usage 报告 completion token 总数以及其中的 reasoning token 子集；本次生产失败证明 reasoning 会占用同一生成 token cap。 |
| 参数丢失 | 原生 adapter 已传递 `thinking`、`reasoning_effort` 与 `max_tokens`，没有未暴露但可用的原生 reasoning cap 或 final reserve 字段。 |

本地实现证据包括 [`llm-deepseek` request serialization](../../packages/llm/llm-deepseek/src/serialize.ts)、[usage translation](../../packages/llm/llm-deepseek/src/translate.ts)、[provider configuration](../../packages/llm/llm-deepseek/src/index.ts)、[LLM call configuration](../../packages/llm/llm/src/call-config.ts)和 [restricted Agent runner](../../packages/business/business-workbench/src/restricted-agent.ts)。外部协议证据来自官方 [Thinking Mode guide](https://api-docs.deepseek.com/guides/thinking_mode/)与 [Chat Completions reference](https://api-docs.deepseek.com/api/create-chat-completion/)。

## 候选决策

Candidate A 的独立 reasoning token limit 不可用。选择 Candidate B：`provider = deepseek-official`、`model = deepseek-v4-flash`、`reasoningEffort = off`、`maxTokens = 4096`、`timeoutMs = 90000`。部署 plugin 可以继续启用 thinking，因为 Business request 显式提供的 `off` 会在单次请求上优先。本报告冻结下一次生产实验的候选配置；它没有修改当前已安装 production profile，也不授权生产请求。

关闭 reasoning 已经证明存在明确 final reserve，因此没有测试增大共享 cap。无需换模型，也无需修改 Harness Core。

## Final Output Guard

未来没有可见文本的 Restricted Agent 结果使用 diagnostic version `2`。finish reason 为 `max-tokens`、报告的 reasoning token 大于零且 final-text bytes 为零时，以 `REASONING_BUDGET_EXHAUSTED` 失败；其他空结果仍为 `EMPTY_AGENT_OUTPUT`。诊断记录 provider、model、请求的 reasoning effort、`maxTokens`、input/output/reasoning token usage、final-text bytes、finish reason、duration、Agent Run id、Session id、event counts 与失败阶段，不记录 prompt、response 正文或 credential。成功结果的瞬态 metrics 还会携带规范化 finish reason。

该分类不改写两个已保留历史失败，也不改变 Business schema version `5`。

## Size-matched safe smoke

测试使用 production resolver、`xhs-body-prepare-v0`、Restricted Agent Runner、production message assembly、精确 Skill materialization、deny-all tools、extraction 与 output-bundle settlement。Task card、writing rule、golden sample 与 S3 Skill 全部来自临时 Vault 和临时 `DSH_HOME` 中的 synthetic 文件，总计 `27,500` bytes。

| 指标 | 结果 |
|---|---:|
| Provider response 配置 | `deepseek-official / deepseek-v4-flash / off / 4096` |
| Input tokens | `5058` |
| Output/final tokens | `10` |
| Reasoning tokens | `0` |
| Final draft bytes | `28` |
| Finish reason | `stop` |
| Agent duration | `691 ms` |
| Tool calls / forbidden executions | `0 / 0` |
| Stored / participating Jobs | 临时 single Batch 中 `1 / 1` |

本轮共发起两次 safe invocation，达到授权上限。沙箱内尝试在模型返回前因 transport 失败；完全相同的宿主网络请求成功。没有自动 retry。无正文报告位于 `/private/tmp/business-layer-v0.1-phase4c1t-safe-smoke.json`（SHA-256 `ae21c8cd51e060c3db6f5a611da8e2dda52859fbb9eb2610ce9546bf97231520`）和 `/private/tmp/business-layer-v0.1-phase4c1t-safe-smoke-host.json`（SHA-256 `a5aafae98b7acdfccc60057d090236efcfdc63a0d88cc4e88b35a745ede33be2`）。

## 安全与剩余风险

发送给 Provider 的生产数据为零。测试没有解析、读取或写入生产 Vault，也没有运行 `note002`。生产 Business storage 继续保持 SHA-256 `53700b879c8c4b825becaff6d69866e0343ba51c1b0d3bafffeb57dc75e33a66`。Schema 仍为 `5`；tool、Workspace、Skill discovery、subagent、Production Resolver、S3 adapter、output-bundle 与 Job 语义均未改变。

剩余风险是关闭 reasoning 后的正文质量与完整 400–600 字输出、所选 effort 由 deployment configuration 而非 schema 强制，以及上游 API 或模型版本变化后的 Provider 行为漂移。下一次真实 First-Pass 实验仍需明确授权、新 Job 与 Attempt、显示 `off / 4096` 的 preflight、未变化的生产真源 hash，以及恰好一次生产请求。不得再次以 `low / 4096` 运行真实正文。
