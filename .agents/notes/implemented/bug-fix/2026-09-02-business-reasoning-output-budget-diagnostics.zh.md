# Agent Note: Business reasoning-output budget diagnostics

Status: implemented

[English](2026-09-02-business-reasoning-output-budget-diagnostics.md) | 中文

## Problem

受限 Business Agent 可能收到成功的 Provider stream，但生成 token 配额在 reasoning 阶段耗尽。把该结果当作普通空输出，会混淆 extraction failure 与 final text 已无剩余预算的请求。只增加一个共享 cap 也不能保留 final output。

## Decision

仅当规范化 finish reason 为 `max-tokens`、报告的 reasoning token 大于零且提取的 final text 为零 bytes 时，Business Workbench 才把空响应分类为 `REASONING_BUDGET_EXHAUSTED`。其他空响应仍为 `EMPTY_AGENT_OUTPUT`。

Diagnostic version `2` 会记录请求的 reasoning effort 和 `maxTokens`，以及 provider/model identity、token usage、final-text bytes、finish reason、duration、Agent Run/Session id、event counts 与失败阶段。它排除 prompt、response 正文和 credential。现有持久 Agent Run failure string 承载该 JSON；Business schema version `5` 不变。成功结果的瞬态 metrics 会包含 finish reason。

DeepSeek 生产候选使用现有按请求 effort `off`，由原生 adapter 序列化为关闭 thinking。Package 不硬编码 provider 或 cap；精确 route 与 budget 仍由 deployment configuration 持有。

## Alternatives considered

**增加独立 reasoning 与 final-output budget。** 当前官方 Chat Completions request、Harness `GenerateOptions`、adapter 与 AgentLoop 都没有这些字段。在 Business 中增加无效字段会虚假宣称可执行；扩展 Core request 词汇也没有 Provider 字段可承载。

**增大 `maxTokens`。** 更大的共享 cap 仍允许 reasoning 消耗全部配额，只会在没有 final reserve 的情况下增加 token 成本。只有关闭 thinking 无法通过生产质量评估时，才把它作为后续选项。

**把 reasoning text 当作 draft。** Reasoning 不是用户可见 final content，也可能违反 XHS output contract。Extraction 继续只接受 text block。

**在代码中禁止一个确切 provider/model/effort 组合。** 硬编码 deployment-specific 组合会违反 package 的 deployment-owned model policy，并在 Provider 变化后失效。下一次生产实验改为要求 configuration preflight 和明确授权。

## Consequences

Operator 无需读取内容即可区分 reasoning exhaustion 与普通空输出；一次生产规模 safe fixture 证明当前 DeepSeek V4 Flash route 使用 `off / 4096` 时能保留可见输出空间。该决策不宣称关闭 reasoning 后内容质量等价。Provider API 漂移与 deployment misconfiguration 仍是运行风险，因此每次真实实验都要记录有效 route 与 budget。
