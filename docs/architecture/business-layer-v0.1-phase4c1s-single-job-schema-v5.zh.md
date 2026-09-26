# Business Layer V0.1 Phase 4C-1S：单 Job 持久化与 Schema V5

[English](business-layer-v0.1-phase4c1s-single-job-schema-v5.md) | 中文

Phase 4C-1S 在第一篇真实正文 Retry 前修正一个已经被实验测出的数据模型缺陷。Schema V4 无论实验只授权一篇还是四篇，都会分配四个 Job。三个未执行 Job 是必须保留的历史事实，但如果把它们当成真实参与者，未来的首稿通过率、失败率、Revision、耗时、人工介入和 Throughput 都会失真。V5 只增加精确 Batch 参与语义，不增加调度、Validation、审核、Promote 或任意 N Job 执行。

## V5 Batch 语义

新调用方必须选择一个封闭创建模式：

| Mode | 存储 Job | 参与 Job | 创建用途 |
|---|---:|---:|---|
| `single` | 1 | 1 | 一篇明确授权正文或后续单篇独立 Revision |
| `quad` | 4 | 4 | 一轮正式四篇，Job 相互隔离 |

`legacy-fixed4` 只由 migration 产生。它永远保留 V4 实际创建的四个 Job，并记录具有持久参与证据的一或四个 Job。调用方不能把它传给 `createBatch`。`businessBatchParticipation` 返回精确参与 Job id 与封闭的 expected/actual 数量，使迁移后的占位 Job 继续作为可审计历史存在，但不进入未来正文生产 metrics 的分母。

创建过程仍可从中断恢复。`single` Batch 先持久化一个 input 与一个 Job id，再完成 materialization；`quad` Batch 持久化四个。现有每 Job revision、Attempt、lease、package、Agent Run、Artifact、output bundle 与 operation receipt 行为均未改变。支持 `single` 没有削弱四 Job 隔离。

## 显式 V4→V5 migration

Runtime 启动绝不会自动迁移。未迁移的 V4 文件会在普通 V5 open 时失败，且原文件不变。唯一 operator 入口为 `packages/business/business-workbench/scripts/migrate-v4-to-v5.ts`，必须提供精确 storage path 与已批准源 SHA-256。

Migration 会校验完整 V4 document，以及每条 Batch→Job 与 input 关系。参与证据只允许来自持久事实：非 `draft` 状态、非零 revision、当前或历史 Attempt、Artifact 引用、operation receipt 或 status reason。只有恰好一或四个有证据 Job 才允许迁移。零、二或三个都属于歧义并在发布前失败；orphan Job、id 不一致、input 不一致、未知版本、非普通文件和 symlink 同样 fail closed。

校验通过后，migrator 把 V5 写入随机且独占的 sibling，再以原子 rename 覆盖已批准文件。发布前会再次检查源 hash，发布后校验目标 hash。对有效 V5 重复执行只读返回 `already-current`。这是一条明确 migration，不是通用 migration framework。

## 生产恢复点与实际迁移

停止生产 Runtime 前，V4 storage 与 Business artifact 目录已复制到 `<PRIVATE_RECOVERY_DIR>`。目录权限为 `0700`，文件权限为 `0600`。其中包含原始 storage、artifact archive、recovery manifest、migration result 与不含正文的 provider smoke report。

| 证据 | 值 |
|---|---|
| V4 storage SHA-256 | `0e1d11936aaa181a9f04979e3d1fcf8ee8e6973be6df875b56ebde4e5e81dd65` |
| V4 storage 大小 | 19,627 bytes |
| Artifact archive SHA-256 | `2239fb6570d0a1c0aff4540254c15fac4ff50bc1682e116dea60b1a150487abd` |
| V5 storage SHA-256 | `f507f44206a6cf088594327e6934856f5e33b647a88233cdc9d795b0d3f5c707` |
| 迁移前后计数 | 1 Batch、4 stored Jobs、1 Attempt、0 Artifacts |
| V5 参与语义 | `legacy-fixed4`、1 participant |

发布前，Mac App 与残留 Runtime 子进程均通过正常终止信号退出。唯一生产 Batch 与全部四个原 Job id 仍然存在。结构化深度比较证明所有 Job 字段和值都未改变，包括 status、revision、Attempt、Agent Run、source manifest、hash、provenance、timestamp、operation receipt 与 failure 事实。原 Batch 字段也全部不变；V5 只新增 `mode` 与 `participatingJobIds`。

已执行 Job 仍为 `failed`、revision 6、一个失败 Attempt、零 Artifact。它的历史 code 是 `PROVIDER_ERROR`，因为该次执行早于新 `EMPTY_AGENT_OUTPUT` 分类；保留的 reason 仍是 `business-workbench: restricted Agent produced no text output`。三个原占位 Job 仍为 `draft`、revision 0、零 Attempt、零 Artifact。V5 不会改写历史并伪称当时只存储了一个 Job。

重新构建后的 Mac App 已成功打开 V5 storage，目标 hash 未变化，本地 Runtime 返回 HTTP 200。备份、迁移和重启验证期间均未读取或写入生产 Obsidian 真源。

## Regression 与恢复覆盖

Keyless package 测试覆盖正常 legacy migration、Job id 保留、Attempt 与 Artifact ref 保留、revision 与 failed 状态保留、歧义数据拒绝、原子发布失败时精确保留 V4 bytes、重复迁移幂等，以及未迁移 V4 被 V5 open 拒绝。Synthetic `single` 全链覆盖 Batch → 一个 Job → Attempt → lease → execution package → Restricted Agent fixture → output bundle → CAS → Runtime restart → 校验恢复，并确认没有多余 Job。现有 `quad` 覆盖继续证明四个不同参与 Job 与每 Job 隔离。

Business Workbench suite 共 10 个文件、67 项测试全部通过。Host TypeScript build、Host bundle build、focused lint、生成 Cordis surface 与 whitespace 检查通过。Phase 1 到 Phase 4C-1R 行为继续由同一 package suite 覆盖：persistence、CAS、lease/recovery、read/Skill policy、input/Skill drift、deny-all tools、output settlement、source resolution 与 empty-output diagnostics。

## Size-matched 真实 Provider 安全 smoke

Migration 与 keyless 检查完成后，只执行了一次真实请求，路径仍是 production Restricted Agent，模型为 `deepseek-official / deepseek-v4-flash`，reasoning effort 为 `low`，最大输出 4,096 tokens。临时 `single` Batch 只有一个 stored Job 与一个参与 Job。四个 synthetic input 按生产实测量级固定为：task card 6,561 bytes、writing rule 3,058、golden sample 3,230、S3 source 4,795，合计 17,644 bytes 与 3,452 provider input tokens。

请求第一次且唯一一次调用即通过，返回 57-byte 安全 fixture draft，tool call 为 0，forbidden tool execution 为 0。测试使用隔离的临时 DSH home 与 Vault，结束后删除，只保存不含正文的报告。没有发送生产真源，没有创建生产 Job，生产 V5 storage 的 hash 与 mtime 均未改变。报告 SHA-256 为 `e887ad02feb29b55b47fedb524e112d2f90521ac826cedb4c3cde30a7d5f2b60`。

## Schema 冻结与 Phase 4C-1 Retry 前提

Schema V5 在计划的 1 → 4 → 12 → 20 首稿质量实验期间冻结。普通功能不得推动下一次 schema 升级。只有数据损坏或真正阻断模型实验的缺陷，才允许单独审批变更。

Phase 4C-1 只能通过新的明确授权重新开始。它必须使用 `single`，只创建一个新 Job 与一个获批 Attempt，继续采用同一 production source 与 Restricted Agent policy，不允许自动 retry 或 Revision，并在一个成功 intermediate draft 或第一次失败后立即停止。本阶段没有生成或重试真实 `note002` 正文。

Harness Core、AgentLoop、WorkflowEngine、Session format、Skill Registry、Workspace、模型配置、生产真源与 Obsidian 资产均未修改。
