# Agent Note：在 Host 强制执行受限 Business Agent

状态：implemented

[English](2026-08-30-business-restricted-agent-runtime.md) | 中文

## Problem

不可变 execution package 可以限制 Business input read，但 package 内的 capability 与 Skill 名称仍然只是调用方声明。若把它们直接传给通用 Agent，调用方控制的 prompt 内容、ambient Session state、Skill discovery 或 global tool 可能扩张执行权限。Business 输出还需要独立于临时 Agent Session 的持久 provenance 与 retry 行为。

## Decision

执行继续留在 `dsh-business-workbench` 内，并为 Phase 3 fixture 增加一个封闭 Host action。Package capability 与 Skill list 只作为请求，必须是 Host action policy 的 subset。Provider、model、reasoning effort、token 上限与 timeout 留在部署配置。省略配置只会禁用 Agent 执行，不影响持久化 API。

创建 package 时解析精确 Skill id，并持久化完整 winning definition、origin 与 hash。模型 I/O 前在相同 Project root 再次解析，拒绝缺失、变化或被 shadow 的 definition。Fixture action 只允许 Host-runtime origin。Agent 永远看不到 Skill list 或 load operation。

通过既有 Agent Registry 与 AgentLoop 创建一个全新 Session。在其 scoped context 内选择 native tool presentation，发布空 tool set，安装 deny-all execution guard，抑制 runtime context，并安装只由固定指令、冻结 Skill 正文与冻结输入字节组成的 complete prompt。单轮结束后销毁 Session。模型 I/O 前持久化 Business Agent Run，成功后通过同一状态 mutation 结算 Run、一个 intermediate Artifact 与持久幂等 receipt。

Execution package、Attempt、Artifact 与 operation receipt 都新增结构字段，因此将 Business storage schema 从 1 提升到 2。所有旧版本与未知格式继续在无 migration 的情况下被拒绝。

## Alternatives considered

- 只用 prompt 禁止文件、工具与 Skill discovery。拒绝，因为模型指令不是授权。
- 直接调用 LLM adapter。拒绝，因为这会绕开生产执行实际使用的 AgentLoop request 与 Session projection。
- 复用普通 preset 或既有 Session。拒绝，因为 ambient tool、history 与 prompt section 会让实际执行包大于持久 Business package。
- 修改 AgentLoop 或 global tool policy。拒绝，因为 scoped Agent 与 Tool extension point 已能强制所需策略，而 Core 变化会增加升级风险。
- 允许 package 调用方选择任意 provider/model 或 Skill。拒绝，因为持久 package 不能授予 Host 未批准的权限。
- 自动重试失败或中断调用。拒绝，因为没有新的 Attempt 决策就重试，可能重复付费模型工作或发布有歧义的输出。

## Consequences

Agent 只看到冻结输入与批准 Skill 正文，tool presentation 与 tool execution 都 fail closed。Prompt injection 可能影响模型输出质量，但不能增加 Host capability。Skill origin 或正文变化会在模型 I/O 前成为明确 drift。

成功输出会绑定一个 Job、Attempt、package manifest、Skill manifest、model route 与 Agent Run。Runtime 重启后复用其 idempotency key 会返回相同已验证 Artifact，不再请求模型。失败与中断保留持久证据，并要求显式创建新 Attempt。

生产 Profile 在没有 Business 数据且未配置 `restrictedAgent` route 时，可以加载 schema 2 而不启用执行。真实 XHS action 仍是独立工作；必须先冻结生产 Skill source、output validation 与业务 acceptance rule，才能启用生产模型 I/O。
