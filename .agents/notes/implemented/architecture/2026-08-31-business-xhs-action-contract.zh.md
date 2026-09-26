# Agent Note: 在启用前冻结 XHS 正文 action

Status: implemented

[English](2026-08-31-business-xhs-action-contract.md) | 中文

## Problem

受限 Business Agent 已证明 Host 可以约束一次模型 turn，但其 fixture action 没有定义 XHS 正文准备的最小生产输入与输出义务。若直接复用该 action 生产真实内容，会把安全证据与生产授权混合，并可能在 Validation 与 review 存在前，让不完整输出或更宽读取请求成为持久行为。本 Note 记录启用前决策；生产来源审计与当前可执行 fixture policy 由 [Phase 4B Note](2026-08-31-business-xhs-production-gate.zh.md)维护。

## Decision

保持 `fixture-agent-run` 为唯一可执行 `BusinessAgentAction`，并使用它对安全临时 fixture 进行一次凭据门控的真实提供方冒烟测试。该测试挂载已配置的 DeepSeek adapter 与模型，保留空工具集合和 deny-all executor guard，并在注册任何生产 action 前证明 package、input 与 Skill 检查。

将 `xhs-body-prepare-v0` 预留为不可变导出 metadata 与纯 package assertion。固定要求四个按顺序排列的 Markdown 输入：`taskCard`、`accountRule`、`writingRule` 与 `productTruth`。只允许精确文件读取、`restricted-agent` capability，以及 `xhs-body-writing-v0` 与 `xhs-product-truth-v0` Skill id。预留三个名为 `draft.md`、`draft-metadata.json` 与 `provenance.json` 的 intermediate output，并保留禁用的 Validation 与 review Artifact slot。

未来的一次调用固定使用 `xhs-body-prepare-v0:attempt:<attemptId>`。预留 `XHS_BODY_INPUT_INVALID` 表示 package 不匹配，预留 `XHS_BODY_OUTPUT_INVALID` 给未来 output bundle validator。在存在可执行 consumer 与原子 output settlement 前，不把 action 加入持久 Agent Run union，也不修改存储 schema。

当 Agent turn 以结构化 Session error 结束且没有 assistant message 时，在 Business `PROVIDER_ERROR` 诊断中保留其非敏感 provider code 与 message。保持 Business error code 稳定，且不发布 Artifact。

## Alternatives considered

- 立即启用 `xhs-body-prepare-v0`，依赖文档阻止使用。否决原因是 runtime 会在 output validation 与获批生产 Skill 存在前接受付费生产工作。
- 在冒烟测试后把 fixture action 重命名为生产 action。否决原因是 fixture Skill、fixture output 与生产义务属于不同约定，不应共享持久 identity。
- 为便利而冻结目录读取 root。否决原因是执行前已经知道四个必需文件，精确文件准入更窄且可审计。
- 只在 Markdown 中冻结 action 约定。否决原因是 package 构造需要可执行 assertion，在模型 I/O 前拒绝额外 input、read、capability 与 Skill。
- 现在把 Validation 与 review 状态加入 Job schema。否决原因是 Phase 4A 中两者都没有当前 consumer；禁用的 Artifact slot 可以保留命名，而无需创建未使用持久状态。

## Consequences

真实提供方已经执行了与未来工作相同的 Agent Registry 与 AgentLoop 路径，但没有获得 filesystem、shell、Workspace scan、Skill discovery 或 cross-Project 权限。该冒烟测试可被显式重复，不会触碰生产 Business 存储或 Obsidian。

Phase 4B 获得一个精确输入与输出目标，且无法通过 Phase 4A Host API 意外执行它。启用该 action 仍要求获批 Skill definition、独立封闭 action policy、三个 output 的原子 validation 与 settlement，以及 assembled replay 覆盖。两个预留 XHS failure code 会先于完整 output-producing consumer 成为公开类型，但本阶段只有 input code 会实际发出。
