# Agent Note: Admit one source-bound XHS production Agent route

Status: implemented

[English](2026-09-02-business-xhs-production-agent-route.md) | 中文

## Problem

Business Host 已能解析并冻结正式 XHS 真源，但 XHS Agent policy 只接受 registry 持有的 fixture Skill。若把该 route 直接复用于生产，要么会把正式字节错误标记为 fixture input，要么会削弱 Skill origin 检查。第一次真实首稿还需要可观测 latency 与 token 事实，同时不能修改已冻结的 version 4 Business storage 格式。

## Decision

在 `fixture` 之外增加显式 XHS `production` 执行模式。Production policy 要求持久化 production-source manifest，把请求中的 account 与 note type 和 manifest 对齐，并且只接受 Host mapping 所选精确 `project-agents / business-xhs-production-v1` S3 来源。Fixture package 继续只允许 runtime 持有的 fixture Skill，且不能携带 production evidence。

模型 I/O 之前立即重新读取 package 的三个精确 input，并让 production resolver 验证入口、基线、系统二真源、任务卡、规则、样稿与 S3 snapshot。Agent 只接收已经冻结的 input 正文与 S3 正文。保留空 tool schema、deny-all executor、全新 Session、部署固定模型、一次模型请求以及现有三文件 `intermediate` 输出结算。

请求 timing 与 provider token usage 作为新调用的 invocation metrics 返回。它们不加入 `BusinessAgentRun`、output bundle 或 storage domain。XHS 观测通过[输出收尾恢复](../bug-fix/2026-09-03-business-output-finalization-recovery.zh.md)单独持久化；durable replay 返回已提交结果，不返回新的执行 metrics。Production package 构建返回瞬态 source-resolution、Skill-snapshot 与 package-build duration。

确定性真源选择继续由 [production source adapter](2026-09-01-business-xhs-production-source-adapter.zh.md)持有。该 route 只消费其 manifest，不增加 discovery、fallback、filesystem authority、内容 Validation、revision、finalization 或 Obsidian promotion。

## Alternatives considered

- **把正式来源视为 fixture input。** 拒绝，因为 provenance 与 origin policy 会声明错误的来源类别，并让仅适用于 fixture 的假设进入生产。
- **把正式 S3 注册到通用 Skill Registry。** 拒绝，因为生产执行需要 resolver 选择的唯一来源，而不是可能被 Project 或 user layer shadow 的 discoverable winning definition。
- **把性能 metrics 持久化到 `BusinessAgentRun`。** 拒绝，因为第一次实验冻结 storage schema version 4，且这些 metrics 是报告证据，不是恢复状态。
- **在 Host 中增加 transport retry。** 拒绝，因为第一次实验不需要 retry policy；任何重试都必须仍是有明确记录的 caller 决策。

## Consequences

一个获批 production Attempt 可以通过 fixture coverage 使用的同一 Restricted Agent 入口生成一个权威 intermediate draft bundle。来源或 Skill 漂移、route 不匹配、origin 不匹配、tool call、非法模型文本传输或重复结算都会 fail closed。[文本输出决策](../bug-fix/2026-09-03-business-xhs-text-output.zh.md)规定传输验证。四槽 Batch 中其余三个 Job 不会自动获得任何执行。

新调用方可以记录 package、首响应、完成、结构结算与 token observation，而不修改 durable Business data。Replay 可以证明输出幂等，但不能重建瞬态 timing。Human review、Revision、finalization 与 promotion 仍属于后续独立 consumer。
