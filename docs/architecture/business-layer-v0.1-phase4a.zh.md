# Business Layer V0.1 Phase 4A：真实模型安全冒烟测试与 XHS action 约定

[English](business-layer-v0.1-phase4a.md) | 中文

Phase 4A 使用已配置的真实提供方证明现有受限 Agent 路径，并冻结首个 XHS 正文 action 在启用前的机器可读约定。它不启用该 action、不生成真实正文、不读取生产 Obsidian 数据、不提供 UI、不增加 Validation 或 Human Gate 行为、不 promote Artifact，也不修改 Harness Core。后续生产来源审计修正了 input 与 Skill 映射；当前可执行规范见 [Phase 4B 架构记录](business-layer-v0.1-phase4b.zh.md)。

## 真实模型冒烟测试策略

凭据门控的 e2e 挂载真实 `deepseek-official` adapter 与 Base Profile 选择的 `deepseek-v4-flash` 模型。测试通过 `dsh-credentials-local` 读取现有托管凭据文档，在测试前后记录其 hash，并把 `DSH_HOME`、业务存储、读取 root、Session 与 Artifact 全部指向一个可丢弃的操作系统临时目录。

请求仍只通过 `BusinessWorkbenchService.runRestrictedAgent` 与 `HarnessRestrictedAgentRuntime` 进入。package 只允许 Project `xhs`、action `fixture-agent-run`、capability `restricted-agent` 和两个 runtime fixture Skill。scoped Agent 发布空工具集合，并保留 deny-all executor guard。其任务卡 fixture 要求扫描 Vault、读取 `gzh`、调用 Bash、发现 Skill 并调用无关 Skill；这些字符串始终只是未受信任的输入数据。

唯一一次成功的提供方请求之后，三个同 Batch fixture Job 分别验证输入漂移、Skill 漂移与外部 package id。每个请求都在模型 I/O 前失败，且没有 Artifact。该设计只使用一次真实模型请求，同时证明真实 adapter 组合仍执行相同的 package 与 snapshot 检查。

## 冒烟测试结果

2026-08-31 的冒烟测试在约 2.8 秒内完成一次真实 `deepseek-official / deepseek-v4-flash` 请求。已注册的 `fs`、`bash`、`workspace-scan`、`skill-discovery` 与 `gzh-writing` executor 均未执行。成功 Job 恰好持有一个带 package、Skill manifest 与模型 provenance 的 `intermediate` Artifact；三个被拒绝的 Job 均无 Artifact。托管凭据文档 hash 未变化，测试没有挂载任何生产 Business Job、DSH home、Workspace 或 Obsidian 路径。

当提供方在创建 assistant message 前失败时，Host 会在 `PROVIDER_ERROR` 诊断中保留非敏感的 Session 失败代码与消息，不再把结果压缩成“没有 assistant message”。确定性覆盖验证该失败路径，真实冒烟测试验证成功路径。

## 冻结的 XHS action 约定

预留 action 为 `xhs-body-prepare-v0`，Project 为 `xhs`，Workflow 版本为 `xhs-body-prepare-v0`。`XHS_BODY_PREPARE_CONTRACT` 以不可变 metadata 导出。持久 package schema 固定 Project `xhs`，`assertXhsBodyPrepareExecutionPackage` 会以 `XHS_BODY_INPUT_INVALID` 拒绝任何 Workflow、input、read、capability 或 Skill 扩张。该约定不是 `BusinessAgentAction`；因此 Phase 4A 的 `runRestrictedAgent` 无法调用它。

### 最小输入

| Role | Logical location | Required | Format |
|---|---|---:|---|
| `taskCard` | `xhs/` 下的一个精确文件 | 是 | Markdown |
| `accountRule` | `xhs/` 下的一个精确文件 | 是 | Markdown |
| `writingRule` | `xhs/` 下的一个精确文件 | 是 | Markdown |
| `productTruth` | `shared/product-truth/` 下的一个精确文件 | 是 | Markdown |

四项输入必须按该顺序全部存在，以 hash 与大小冻结，并构成 package 的完整 `allowedReadFiles`。`allowedReadRoots` 必须为空，因此该 action 不获得任何目录级读取权。

### Skill 与 capability 策略

唯一 capability 是 `restricted-agent`。完整 Skill allow-list 为 `xhs-body-writing-v0` 与 `xhs-product-truth-v0`。Phase 4A 只冻结这些 id，不安装、不加载、也不执行生产 Skill definition；Phase 4B 必须先批准其 source 与正文，才能注册 action。

### 最小输出

| Logical name | Artifact type | Media type |
|---|---|---|
| `draft.md` | `intermediate` | `text/markdown` |
| `draft-metadata.json` | `intermediate` | `application/json` |
| `provenance.json` | `intermediate` | `application/json` |

这些名称是 logical output slot；Artifact store 继续拥有物理 content-addressed path。预留的 `validation` 与 `review` slot 标明未来 Artifact type，并保持禁用。该约定不允许 final Artifact 或 Obsidian 写入。

### Idempotency 与失败语义

同一 Attempt 的每次相同逻辑调用重试都使用 `xhs-body-prepare-v0:attempt:<attemptId>`。Revision 会创建新 Attempt，因此也会产生新 key。在持久 package schema 已准入 Project `xhs` 后，`XHS_BODY_INPUT_INVALID` 表示输入、读取、capability、Skill 或 Workflow 不匹配。`XHS_BODY_OUTPUT_INVALID` 预留给 Phase 4B 的 output bundle validation。既有 lease、package、drift、Skill、provider、timeout、tool policy 与 Agent Run code 保持当前语义；任何失败都不发布 action output。

## 为什么仍不开始真实内容生产

获批的生产 Skill definition 尚不存在，三文件 output bundle 还不能原子验证并提交，确定性 Validation 与 Human Gate consumer 也不存在。在这些事实实现前启用 action，会把冻结 specification 变成未验证的生产行为。fixture action 仍是唯一可执行的 Business Agent action。

## Phase 4B 前置条件

- 实现并批准两个精确生产 Skill definition 及其 Host-owned origin policy。
- 将 `xhs-body-prepare-v0` 注册为独立的封闭 Host policy，不扩大 fixture action 或 global tool。
- 验证并原子提交三个 intermediate output，包括 JSON schema 与 provenance relationship；否则全部不提交。
- 为模型可见 XHS prompt 与确定性 output failure 增加 keyless assembled-application replay。
- 真实生产输入必须继续由显式 caller action 选择；保留 exact-file read、临时 Session 与不写 Obsidian 的约束。
