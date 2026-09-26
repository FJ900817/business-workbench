# Business Layer V0.1 Phase 1

[English](business-layer-v0.1-phase1.md) | 中文

Phase 1 新增一个仅运行于 Host 的包 [`dsh-business-workbench`](../../packages/business/business-workbench/README.zh.md)。它是小红书 Batch、Business Job、Attempt 与 Artifact 事实的持久化权威来源。本阶段不新增 Agent、模型请求、Skill、Workflow、Validation、Browser 插件、Remote API、UI 或 Obsidian 写入器。前置适配结论见[架构审计](business-layer-v0.1-fit-audit.zh.md)，实现决策见 [Agent Note](../../.agents/notes/implemented/architecture/2026-08-28-business-workbench-job-authority.zh.md)。

## 物理架构

Web Host profile 在 `storage-domain` 之后挂载该包。业务记录通过 profile 配置的后端使用 `business_workbench` storage domain；在当前 JSON 后端中，记录位于 `$DSH_HOME/storages/` 下。Artifact 字节位于 `$DSH_HOME/business-workbench/v0.1/` 下。测试显式传入临时根目录并在每个用例后删除，因此不会使用生产 `~/.dsh`。

Phase 1 只有一个所有者，也没有需要独立演进的 Browser 或执行角色，因此一个包已经足够。拆分持久化、状态与 Artifact 发布只会增加协调成本，不会增加隔离能力。

## 持久化数据

Schema version `0` 持有 `batches` 与 `jobs` 两张表。Batch 保存封闭的 `xhs` Project、`xhs-body` 类型、四个有序输入引用、四个预分配 Job id 与创建标记。Job 保存生命周期状态、单调 revision、当前 Attempt、不可变 Attempt 历史、不可变 Artifact 引用与幂等回执。不受支持的 schema version 会在 domain 打开阶段失败；Phase 1 不执行隐式迁移。

Batch 创建会先持久化包含四个 id 与输入的 `creating` 记录，再只补齐缺失且匹配的 Job，最后把 Batch 改为 `ready`。服务发布前会在启动阶段完成该协议。Job 所属关系或输入发生冲突时启动失败。公共 API 不提供独立 Job 创建，因此 ready Batch 始终解析为恰好四个 Job。

## 状态与并发

Phase 1 Job 生命周期为 `draft -> ready -> running -> completed | failed | cancelled`，并允许 `failed -> ready` 进行显式重试。只有 `createAttempt` 可以进入 `running`，只有 `completeAttempt` 可以进入 `completed` 或 `failed`。取消运行中的 Job 也会关闭当前 Attempt。Completed 与 cancelled Job 均为终态。

每次 Job 修改都要求 `expectedRevision` 与调用方稳定的 `idempotencyKey`。服务串行处理本地修改、比较持久化 revision，并以 `REVISION_CONFLICT` 拒绝过期写入。Job 记录会保存带指纹的操作回执；完全相同的重试直接返回已有事实，不增加 revision；同一个 key 对应不同输入时以 `IDEMPOTENCY_CONFLICT` 失败。每个 Job 拥有独立状态与 revision，因此单篇失败不会修改其余三篇。

Attempt 是仅追加的历史记录。新 Attempt 使用下一个从一开始的序号。终止操作在同一次 Job 记录更新中修改对应运行中 Attempt 与 Job。后续重试不会替换历史。

## Artifact 提交协议

Artifact id 与路径由 Job、Attempt、类型和操作 key 确定生成。存储先把 UTF-8 字节写入私有 staging 文件并执行 fsync，再通过禁止覆盖的硬链接发布，随后同步目标目录，最后通过 Job CAS 提交 Artifact 引用。目标路径已有相同字节时视为幂等成功，字节不同则失败。启动与读取都会验证路径没有越界、字节数和 SHA-256。若状态更新失败，该协议可能留下未引用的完整文件，但不会暴露指向部分或缺失字节的 Job 引用。

## 重启行为

服务启动时先恢复中断的 Batch 创建，验证所有 ready Batch 与 Job 的关系，并检查所有已引用 Artifact，然后才接受修改。干净重启后，包含 `running` 在内的持久 Job 状态保持不变。Phase 1 不启动执行器，因此不会推断保留的 running Attempt 是否仍在执行；Phase 2 在启用 Agent 执行前必须增加明确的执行中断策略。

## 验证

聚焦测试覆盖封闭状态机、恰好四个 Job 的 Batch 创建、四 Job 隔离、过期 revision 拒绝、幂等重试与冲突 key 拒绝、不可变 Attempt 历史、Artifact 原子与幂等发布、损坏检测、真实 Loader 组合、冷重启、五种 Batch 创建中断点、拒绝不支持的 schema 且不改写文件，以及包不变量。

## 已知风险与 Phase 2 依赖

- JSON 后端只支持单 Runtime 写入；两个进程不得针对同一个 `DSH_HOME` 挂载同一业务 domain。
- 在格式或执行语义变化前，必须补充 schema 迁移、备份编排，以及遗留 running Attempt 的显式恢复规则。
- Artifact 发布后、状态提交前崩溃可能留下确定路径的孤立文件。服务不会暴露它，重试可安全复用，但清理仍延后处理。
- Phase 2 只有在定义执行租约、Project 读取策略与授权后，才可新增执行 Adapter 与窄化的 Host/Browser API；它必须复用本服务，不得在 Session 历史中复制 Job 状态。
