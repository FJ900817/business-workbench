# Agent Note: 为 Business Agent 空输出保留不含正文的证据

Status: implemented

[English](2026-09-02-business-empty-agent-output-diagnostics.md) | 中文

## 问题

Business 受限 Agent runner 过去只用一条通用 provider error 字符串拒绝无文本的已完成 turn。该记录能够证明没有提交正文，却没有保留区分 assistant message 缺失、仅 reasoning 输出、输出 token 上限或后续提取失败所需的规范化 event 事实。原始 provider response 不持久化，因此 Session dispose 后无法恢复这些事实。

## 决策

把没有可见文本的已完成 turn 分类为 `EMPTY_AGENT_OUTPUT`。在 dispose 前从规范化 Session event log 构建不含正文的诊断：provider/model、Agent Run/Session id、可用的 response/finish 标识、assistant/text/reasoning/tool/final-event 数量、content field 类型、提取的 UTF-8 字节数、可用 token usage、时长与提取阶段。

即时 `BusinessWorkbenchError` 会暴露该诊断，同一 JSON 对象也会追加到现有持久 Agent Run `failureReason`。该方式保持 schema version `4`；把 `failureReason` 当作 opaque string 的 reader 仍然有效。在已完成 assistant message 之前发生的 provider 或 AgentLoop error 继续保留原有分类。

Runner 只提取 `text` block。仅 reasoning 的输出因此会记录 reasoning event 数并失败，绝不会成为正文。空输出不会触发 retry、切换模型，也不会发布 Artifact 或 output bundle。

## 考虑过的替代方案

**在 `BusinessAgentRun` 持久化新的结构化字段。** 拒绝，因为生产实验冻结 storage schema version `4`；增加持久字段需要版本变更与明确兼容性决策。

**修改 provider 适配器或 AgentLoop 以持久化 raw response。** 拒绝，因为 Business Workbench 可以利用规范化 event 诊断自己持有的提取路径，而保留 raw transport 会扩大 Harness Core 修改面，并可能保存敏感 response 正文。

**文本为空时使用 reasoning 内容。** 拒绝，因为 reasoning 不是请求的 Business artifact；把它当作正文会掩盖失败。

## 影响

后续空输出失败会保留足够的非敏感证据，用于定位失败阶段并比较 provider completion 行为，无需重放模型请求。如果当前成功响应 event 词汇不暴露 response id，该字段仍然缺失。历史 run 保留原失败字符串，不能超出既有存储证据进行追溯分类。

Schema version `4` 仍要求每个 Batch 恰好包含四个 Job。本次诊断修改不会宣称存在单 Job execution mode，也不会制造占位语义；如实表达单 Job 实验仍是独立的存储模型决策。
