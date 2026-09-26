# 简哥工作台 Business Layer V0.1 架构适配审计

[English](business-layer-v0.1-fit-audit.md) | 中文

审计日期：2026-08-27

审计源码：`ede36fe7b272f6461bb017602aa4cc8722249bfb`

审计范围：当前仓库源码、当前 Web Profile 的非敏感清单，以及现有持久化、执行、文件、skill、Workspace、Workflow、Remote 和 UI slot 实现。本报告不实现 Business Layer，不修改生产 Workspace 或 Obsidian 资产。

## 1. Executive Summary

结论是 **Revise**：Business Layer V0.1 可以在不修改 `AgentLoop`、`WorkflowEngine`、Session 核心格式和 Harness Core 主逻辑的前提下实现，但不能按设计稿中的若干名称直接映射现有能力。采纳本报告的四项调整后，Phase 1 可以进入施工。

四项必要调整如下：

1. `ctx.jobs` 不能作为业务 Job 真源。[`jobs-local`](../../packages/jobs/jobs-local/README.zh.md) 是进程内运行句柄注册表，状态只覆盖 `running`、`stopping`、`completed`、`killed`、`failed`，Runtime 重启后不恢复。业务 Batch、Job、Attempt、Review 和 Artifact 引用应由一个新的 Host 业务服务通过 [`storage-domain`](../../packages/storage/storage-domain/README.zh.md) 持久化。
2. 通用 [`WorkflowEngine`](../../packages/workflow/workflow/README.zh.md) 不能作为业务 Workflow 真源。它只执行前台、持有者所有的脚本 Run，不保存脚本、步骤或中间状态，也不支持重启续跑。V0.1 应把固定、版本化 Workflow 实现为业务插件内部的持久状态机；Prepare Run 和 Revision/Finalize Run 是两次独立执行，`waiting-review` 是两次执行之间的持久业务状态。
3. Workspace、文件沙箱和 skill registry 都不是 Project/Read/Skill 授权边界。[`fs-sandbox`](../../packages/fs/fs-sandbox/README.zh.md) 明确允许所有读取；`tools.restrict()` 只过滤全局工具且不处理 agent scope 内注册的工具；skill registry 没有按项目过滤 API。最稳妥的 V0.1 做法是由 Host 组装最小执行包、固定解析允许的 skill、隐藏通用 `skill`/`read`/shell 工具，并只向 Agent 提供执行包正文或业务专用只读工具。
4. [`ask-user`](../../packages/client/ui-user-questions/README.zh.md) 的 pending wait 在 Host 重启后不能恢复，[`message-feedback`](../../packages/feedback/message-feedback/README.zh.md) 又绑定 Session message，而不是 Job。Human Gate 和 Task Feedback 应作为业务 Job 的持久 sidecar，由业务 UI 通过业务 Remote API 操作。

完整 V0.1 推荐 **2 个业务包**：一个 Host 业务包和一个 Browser UI 包。不建议提前拆出第三个 `xhs-business` 包；首个且唯一消费者就是 xhs，xhs Workflow、Criteria 和规则适配器先作为 Host 包内部模块。Phase 1 只新增 Host 包，先闭合 Job、Persistence 和 Artifact，不启动 Agent，不写 Obsidian，不制作 UI。

## 2. 当前 Harness 能力映射

| 设计问题 | 当前可复用能力 | 适配结论 |
|---|---|---|
| 1. Job 持久化 | [`storage-domain`](../../packages/storage/storage-domain/README.zh.md) 提供 Zod schema、domain version、串行写入和后端先提交；[`workspace`](../../packages/workspace/workspace/README.zh.md) 与 [`message-feedback`](../../packages/feedback/message-feedback/README.zh.md) 已示范持久 sidecar、启动恢复和 compare-and-set。 | 新业务服务拥有 Batch/Job 状态。不要复用 `ctx.jobs` 作为真源；最多把它作为以后展示当前进程执行句柄的辅助层。 |
| 2. Session / Workspace | [`Session`](../../packages/core/session/README.zh.md) 是 append-only 执行日志；[`session-persistence`](../../packages/session/session-persistence/README.zh.md) 支持 JSONL 加载、检查、崩溃闭合和恢复。Workspace 持久保存 canonical 目录和 Session 归属。 | Session 记录一次 Agent Attempt 的 transcript，Job 保存对应 `sessionId`；Workspace 只用于选择或显示项目目录，不能保存业务进度，也不能单独充当 Project 授权边界。 |
| 3. Workflow 两段 Run | [`ctx.agents.create()`](../../packages/core/agent/README.zh.md) 支持在 Agent 发布前通过 `setup(agentCtx)` 安装 preset、persona、工具限制和 listener；执行完成后可 dispose 并保留持久 Session。 | 业务状态机启动 Prepare/Generate/Validate Attempt，结束后提交 `waiting-review`。人工决策持久化后再启动 Revision 或 Finalize Attempt。两段 Run 不使用通用 Workflow Run 的暂停能力。 |
| 4. Skill host-side allow-list | [`ctx.skills.get()`](../../packages/skill/skill/README.zh.md) 可由可信 Host 按名称解析 skill；[`skill-filesystem`](../../packages/skill/skill-filesystem/README.zh.md) 可从固定根加载；`tools.restrict()` 可隐藏通用 `skill` 工具。 | Project 与 Workflow 清单先求交集，Host 逐个加载、验证名称并记录内容 hash，把结果写入执行包；Agent 不看 skill catalog，也不能动态选取其他 skill。 |
| 5. Read allow-list | `ctx.fs` 提供 canonical target、`contains()`、原子写入和版本 guard；Agent 创建期可收窄工具。 | 主控制点必须是 Business Host 的 Execution Package Builder。V0.1 首选把允许内容复制进执行包并禁止通用 `read`、搜索和 shell；确需延迟读取时，新增仅接受 manifest entry id 的 agent-scoped 只读工具，并在 Host 端 realpath 后验证 containment。 |
| 6. Artifact 位置 | [`dsh-home-paths`](../../packages/util/home-paths/README.zh.md) 统一解析 `$DSH_HOME`；[`fs-local`](../../packages/fs/fs-local/README.zh.md) 已提供同目录 staging、fsync、原子发布、`createIfAbsent` 和版本 guard。 | 状态使用当前 Web 已配置的 `$DSH_HOME/storages/business_workbench.json`；大文本产物放在 `$DSH_HOME/business-workbench/v0.1/projects/xhs/...`，按 Batch/Job/Attempt/Kind 分层。Obsidian 只接收 Approved Final 的显式 Promote。 |
| 7. Batch / Job 状态归属 | Cordis `Service`、effect 生命周期和 storage domain 足够承载单进程本地业务服务。 | 一个 Host 插件同时拥有 Batch、Job、Attempt、Review、Artifact 引用和派生指标。V0.1 不拆独立 Batch service、Job service 或 scheduler。 |
| 8. Validation Engine | Harness 有 Zod/JSON Schema、subagent structured output、工具结果和 Session transcript，但没有通用业务 Validation Engine。 | Hard Check 是 Host 内的纯确定性函数；Semantic Check 是一个受限 Agent Attempt，输出经 schema 解析为 `PASS/WARN/FAIL + blocking + evidence`。Validator 只返回记录，不获得 Artifact 写工具。 |
| 9. Human Gate UI | [`ui-sidebar`](../../packages/client/ui-sidebar/README.zh.md) 声明 additive `sidebar.footer.action`；[`ui-layout`](../../packages/client/ui-layout/README.zh.md) 声明 additive `shell.overlay`；conversation 还有 session-scoped header、turn-tail 和 input slots。 | 主入口使用 sidebar footer action，工作台和 Human Gate 使用 shell overlay。不要替换 `sidebar`、`conversation` 或 `details` 的 single slot；Session 内联状态最多作为后续辅助入口。 |
| 10. Task Feedback | message-feedback 展示了 durable sidecar、逐项版本 token、冲突返回 authoritative current 和每 owner 串行写入的可靠模式。 | 复用模式，不复用数据模型。Feedback 记录必须携带 `jobId`、可选 `batchId`、`reviewId`、scope、自然语言、创建时间和目标 artifact hash，并由 `expectedRevision` 防止旧页面覆盖新状态。Revision 执行包显式包含这些记录。 |
| 11. Obsidian Promote | `ctx.fs` 能做原子文本写入和版本 guard，但模型文件工具的 cwd、观察策略和沙箱不等于业务发布授权。 | 在 Host 包内实现非模型可见的 `ObsidianPromoter` 适配器：配置唯一目标根、realpath containment、默认 `createIfAbsent`、显式覆盖时校验 expected hash、同目录原子发布，并记录 source/destination hash。Agent 和 Validator 永远不能直接调用它。 |
| 12. Reliability Metrics | [`session-stats`](../../packages/session/session-stats/README.zh.md) 只统计 Session turn/step 和耗时；[`session-telemetry`](../../packages/session/session-telemetry/README.zh.md) 是尽力而为上报，不是业务账本。 | 直接从 Job 的持久事实派生最小指标：`firstDraftApproved`、`humanFeedbackCount`、`revisionCount`、四类问题计数、工程错误计数、Attempt 时长，以及 Batch 内 4 个 Job 的通过/失败分布。V0.1 不新建 telemetry pipeline。 |

### 建议的能力关系

```text
Browser UI plugin
  -> typed Business Remote
    -> BusinessWorkbenchService (Job is authoritative)
      -> storage-domain / JSON state
      -> ArtifactStore under $DSH_HOME/business-workbench
      -> fixed xhs state-machine executor
        -> Execution Package Builder
          -> trusted skill lookup + content hashes
          -> explicit input/read manifest
        -> scoped Agent Session / Model
        -> Hard Check + Semantic Check
      -> durable waiting-review / review feedback
      -> host-only ObsidianPromoter after Approved

Session JSONL = execution transcript and diagnostics
Workspace = directory catalog and navigation
Neither Session nor Workspace = business state authority
```

## 3. V0.1 架构适配结论

设计中的业务生命周期合理，但“Workflow”必须解释为 Business Layer 自己的版本化状态机，而不是 `ctx.workflowEngine` 的 `WorkflowRun`。推荐固定 `workflowVersion = xhs-body-v0.1`，任何影响结果的 Workflow、skill 内容 hash、Validator Criteria、model/provider 配置和输入规则都写入 Attempt manifest。准确率验证期间，新的 Job 继续使用冻结版本；更改规则时生成新版本，不能改写既有 Attempt 的解释。

每个 Job 的一次执行由 Business Host 创建一个内部 Agent Session。创建时把 `cwd` 指向该 Attempt 的 execution-package 目录，通过 `setup(agentCtx)` 挂载专用 preset/persona，并限制可见工具。业务状态不依赖该 Session；Session 创建、模型调用或保存失败只会把当前 Attempt 标为 `failed` 或 `interrupted`。Host 重启后，启动恢复把所有 `preparing`、`generating`、`validating`、`revising`、`finalizing` 状态转为 `interrupted`，用户或恢复策略随后创建新 Attempt，绝不假装从模型流中间续跑。

Prepare Run 实际覆盖 Prepare、Generate 和 Validate，成功提交 `waiting-review` 后完全结束。Human Gate 只修改 durable review/Job 状态。批准后启动 Finalize Run；要求修改后启动 Revision Run，重新生成、重新验证，再回到 `waiting-review`。这符合“两段 Run”原则，也避开现有 Workflow Run 不可持久恢复的限制。

4 个 Job 可以并行执行，但 Batch 不应持有一个共享可变执行对象。每个 Job 使用独立 Agent handle、AbortController、Attempt id、artifact 目录和状态 revision；Batch 调度只使用 `Promise.allSettled` 收集结果。storage-domain 在同一 service 内串行提交写入，一个 Job 的错误不得触发其他 Job 的取消或状态回滚。

## 4. 冲突与建议调整

| 冲突 | 原因 | 严重程度 | 是否调整 | 推荐替代方案 |
|---|---|---|---|---|
| “Job” 与现有 `ctx.jobs` 同名但语义不同 | 当前 jobs-local 是进程内后台调用状态，不保存业务输入、Review、Artifact 或重启状态。 | 高 | 必须 | 新建 `BusinessJob`/`ContentJob` 数据模型和 `BusinessWorkbenchService`；只在需要显示正在运行的进程操作时关联可选 runtime job id。 |
| 固定持久 Workflow 直接落在 WorkflowEngine | Workflow Run 前台执行、无 journal、无 resume、无 saved workflow；phase 只用于观察，不强制顺序。 | 高 | 必须 | 业务插件内的纯状态机和版本化 executor；通用 Workflow Engine 暂不进入 V0.1 主路径。 |
| Workflow 级 skill allow-list 可由引擎自动传给子 Agent | worker-thread workflow 的 `agent()` 只传播 schema/provider/model 等选项，没有每步 `toolFilter` 或 skill filter。 | 高 | 必须 | Business Host 直接创建受限 Agent；Host 解析固定 skill 并把正文/hash 放入执行包，不暴露通用 skill 工具。 |
| workspace-write 可以同时限制读取 | fs-sandbox 明确“Reads always pass through”；Workspace 只 canonicalize 和编组目录。 | 高 | 必须 | 执行包最小化 + 禁用通用 read/search/shell；必要时提供 manifest-id 只读工具。 |
| Project 等同于 Workspace | Workspace id 对应真实目录和 Session 账目，不表达 xhs 数据分类或允许文件集合；一个 Obsidian root 可能同时包含多个业务项目。 | 高 | 必须 | Project 是业务 schema 中的 closed id，V0.1 仅允许 `xhs`；每个输入源由 project config 的 canonical root + 相对路径规则验证。 |
| Human Gate 可以复用 ask-user pending interaction | question wait 的 resolve/reject 位于 Host 内存，Host 重启会失去等待；它也绑定一次工具调用。 | 高 | 必须 | durable `ReviewRecord` + UI command；等待不是挂起 Promise，而是 Job 状态 `waiting-review`。 |
| Task Feedback 可以复用 message-feedback 表 | message-feedback 按 Session/messageId 寻址，且内容默认不进入模型；业务反馈必须绑定 Job/Batch/Artifact 并进入 Revision 包。 | 中 | 必须 | 复用 CAS 和 sidecar 模式，定义独立 review 表或 Job 内 review 记录。 |
| UI 可以直接订阅 storage-domain change | `domain/changed` 只在 Host 进程内广播，Browser 不能把它当 reconnect baseline。 | 中 | 必须 | Business Remote 提供 `list/get/command`；连接或页面重开总是拉 authoritative snapshot，实时体验可用显式 forwarded event 或低频 polling。 |
| Artifact 可以复用 chat deliverables | ui-deliverables 从一次 Turn 的成功文件工具 location 推导显示，不保存业务类型、审批状态、hash 或 Promote 记录。 | 中 | 必须 | 独立 ArtifactStore；可选在 Session transcript 中链接 artifact，但不把 deliverables 当账本。 |
| 通过多张 domain table 完成一次跨表事务 | storage-domain 每次 `put/delete/update` 原子，但不提供跨表事务。 | 中 | 必须 | Job 状态与 Artifact 引用尽量收敛在单个 Job record；Batch 创建使用 pending marker + 启动恢复，避免依赖跨表原子性。 |
| Semantic Validator 可在原 Artifact 上修正 | 现有 Agent/工具系统不会天然阻止 Validator 写文件；通用 file/shell 工具会扩大权限。 | 高 | 必须 | Validator `allow: []` 或只给只读业务工具，输入通过 prompt/execution package，schema 输出只含判断与 Evidence。 |

## 5. 复杂度削减建议

1. V0.1 删除对通用 Workflow Engine 的强依赖。固定状态机就是 Workflow，减少 worker、动态脚本、Run 映射和无法恢复的中间层。
2. Batch、Job、Attempt、Review 和 Artifact 引用由一个 Host service 负责，不拆五个 service。Batch 状态优先从 4 个 Job 派生，只持久化 Batch 自有的输入、共同反馈和版本信息。
3. 不建设通用 Validation Engine。Hard Check 和 xhs Semantic Criteria 先放在 Host 包的 `src/xhs/`，统一输出一个小型 `ValidationResult`。
4. 不建设虚拟文件系统。Host 在执行前复制或序列化最小输入，Agent 默认没有文件读取工具；只有出现真实大文件需求时再增加 manifest-id 读取工具。
5. 不建设 metrics/telemetry 服务。业务指标从状态变化、Review 和 Validation 记录派生；导出报表以后再做。
6. 不建设 Batch scheduler。V0.1 固定 4 个 Job，使用小的并发上限和 `Promise.allSettled`；单 Job retry 是显式命令。
7. 不做完整 event sourcing。Job record 使用单调 `revision` 和不可变 Attempt/Review 条目，状态转换用 compare-and-set；Session 继续承担模型执行事件日志。
8. 不提前抽象多 Project adapter。schema 把 `projectId` 限定为 `xhs`，xhs 代码放 Host 包内部；出现第二个真实项目后再抽包。
9. Human Gate 只做一个工作台面板：Batch 总览、4 个 Job、Validation Evidence、Artifact diff/预览、Approve/Return/Revise。不要把普通 Prepare/Generate 步骤做成逐步审批 UI。

## 6. 稳定性风险表

| 风险项 | 等级 | 源码依据与失效方式 | V0.1 控制措施 |
|---|---|---|---|
| 1. Runtime 升级破坏 Business Layer | 高 | 当前仓库为 pre-release，storage domain、Session format、Typert Remote 和 Client slot 都没有外部兼容承诺；Client Remote 还是显式 build-time assembly。 | 固定 Harness commit、业务包版本和 Profile lockfile；所有升级只经 Test Candidate；业务包增加 loader composition、built smoke 和持久数据 reopen 测试。 |
| 2. 第三方 Profile Plugin 影响业务层 | 高 | 当前 Web Profile 在官方 bundle 后加载 `@linxin666/dsh-web-ui-all@0.2.9`、`@liustack/modlens@3.16.6`、固定 Git commit 的 GenUI 和 Attachments；插件可注册 Host 服务、agent scope 工具和 UI slot。 | 固定当前 lockfile/commit；Business Agent 使用专用 preset，不继承第三方 agent 工具；业务 UI 只占 additive slot；Test Candidate 必须加载同一 Profile 做回归。 |
| 3. Job 持久化兼容 | 高 | storage domain 遇到 domain version 不一致会拒绝打开；当前无通用 migration，JSON backend 也没有跨进程锁。 | V0.1 冻结 `BUSINESS_DATA_VERSION = 0`；单 Host writer；每次 schema 变更先导出/备份并实现显式升级器，禁止静默默认旧字段。 |
| 4. 并行 4 Job 隔离 | 中 | Agent/LLM provider、Host 进程和 storage service 共享，但 operation-local 状态可独立；domain 写入在进程内串行。 | 独立 Attempt/Agent/AbortController/artifact root；无 batch-wide cancel；`Promise.allSettled`；测试一个 Job 失败、超时、取消时其余 3 个状态与文件不变。 |
| 5. Runtime 中断或模型超时恢复 | 高 | Session 能修补未闭合 turn，但不能恢复模型流；Workflow Run 无 journal/resume。 | 启动时把 transient Job 标为 `interrupted`；保存最后一个 durable checkpoint 和 Attempt sessionId；恢复总是新建 Attempt，不复用半次输出。 |
| 6. Artifact 重复写入与幂等 | 高 | 无 guard 的 `ctx.fs.writeText` 会原子覆盖；重复网络命令或重试可能提交两次。 | artifact id 和 command id 唯一；`createIfAbsent`；内容 hash 相同则返回既有引用，不同则冲突；状态引用只在文件 durable 后提交。 |
| 7. Revision 重复执行 | 高 | UI 重试、断线后的重复点击或 Host 超时可能重复启动模型执行。 | `expectedRevision` + `idempotencyKey` + 单 Job activeAttempt 唯一约束；重复请求返回已存在 Attempt，不再启动 Agent。 |
| 8. Obsidian 误覆盖 | 高 | 通用写工具可覆盖观察过的文件；业务路径和人工意图不在其约定内。 | Promote 是独立、Host-only、Approved-only 操作；canonical root、目标清单、默认 no-overwrite、expected destination hash、写前备份/写后 hash 和记账。 |
| 9. Skill / Read Boundary 失效 | 高 | skill registry 无项目 filter；tools restriction 不过滤 scope-local 工具；fs-sandbox 不限制读取；absolute path 可离开 cwd。 | 专用 preset；Host 固定解析 skill；不暴露 generic skill/read/search/shell；自定义 read 工具只接受 manifest id，并在执行点做 canonical containment。 |
| 10. UI 与业务状态不同步 | 中 | storage-domain change feed 是 Host 内部；message-feedback 也明确没有 cross-tab push。 | UI 从不缓存为真源；重连/full refresh 调 `list/get`；每个命令携带 expected revision；冲突响应返回 authoritative current；实时 push 只是提示重新拉取。 |

## 7. 推荐最小物理架构

完整 V0.1 推荐两个业务包：

```text
packages/business/
  README.md
  business-workbench/                 # Host plugin, source of truth
    src/
      index.ts                        # Service lifecycle and public Host API
      types.ts                        # branded ids and data-only public types
      spec.ts                         # storage-domain schemas, version 0
      state-machine.ts                # closed transitions and CAS rules
      artifact-store.ts               # immutable local artifacts and hashes
      execution-package.ts            # project/read/skill boundary
      executor.ts                     # two-run Agent orchestration
      validation.ts                   # common PASS/WARN/FAIL vocabulary
      promote.ts                      # host-only Obsidian adapter
      metrics.ts                      # derived reliability figures
      xhs/
        workflow.ts                   # fixed xhs-body-v0.1 lifecycle
        criteria.ts                   # hard and semantic criteria
    tests/

packages/client/
  ui-business-workbench/              # Browser plugin only
    src/client/
      index.ts                        # sidebar.footer.action + shell.overlay
      controller.ts                   # Remote snapshot/CAS controller
      WorkbenchPanel.tsx              # Batch/Job/Review UI
    tests/
```

`business-workbench` 是唯一业务真源和唯一写入者；`ui-business-workbench` 只做 typed Remote consumer。xhs 暂时不成为第三个包，因为当前没有第二个项目、第二种 Workflow 或独立发布需求。将来只有在第二个 Vertical Slice 证明 xhs 规则与通用 Job service 需要独立演化时，才把 `src/xhs/` 提取为独立插件。

组合层优先使用现有 Web Profile 的明确插入项或一个既有本地 bundle patch，不新增第三个“业务逻辑”插件。Host 条目必须位于 `storage-domain` 之后；UI 条目通过 Client roster 加载；业务 Remote 需要像 message-feedback 一样加入 [`api-remotes`](../../packages/api/remotes/README.zh.md) 的显式 Client assembly。Profile 和插件精确版本继续由受控升级通道冻结。

## 8. Phase 1 施工范围

Phase 1 只建立 Business Core / Job / Persistence / Artifact 最小闭环，不创建 Agent、不加载业务 skill、不运行 Validation、不实现 Human Gate、不写 Obsidian、不新增 UI。

### 8.1 应新增的文件

- `packages/business/README.md`、`README.zh.md`、`README.i18n.yaml`：新 package group 的职责和映射。
- `packages/business/business-workbench/package.json`、`tsconfig.json`、`README.md`、`README.zh.md`、`README.i18n.yaml`。
- `src/index.ts`：`BusinessWorkbenchService`，打开/关闭 domain，串行 mutation，启动恢复。
- `src/types.ts`：`ProjectId`、`BatchId`、`JobId`、`AttemptId`、`ArtifactId` 等 branded ids 和只含数据的 API 类型。
- `src/spec.ts`：Zod schema、`business_workbench` domain version `0`、`batches` 与 `jobs` table、全局 pending mutation。
- `src/state-machine.ts`：状态、合法 transition、terminal/transient 分类和 compare-and-set。
- `src/artifact-store.ts`：目录推导、path traversal 拒绝、原子 create、SHA-256、幂等读取和存在性验证。
- `src/invariant.ts`：注册 package invariant；至少验证 active Attempt 与 Job transient 状态、Artifact kind 与状态之间的所属关系。
- `tests/domain.spec.ts`、`state-machine.spec.ts`、`service.spec.ts`、`artifact-store.spec.ts`、`restart.spec.ts`、`loader-composition.spec.ts`。
- 一份同 PR 的 Agent Note，记录 Job 真源、两段执行和 Artifact 提交顺序；Phase 1 实施属于非平凡产品行为，不能以本审计报告替代实现决策记录。

### 8.2 应修改的现有文件

- `packages/README.md` 及其中文配对和 i18n 记录：登记 `business/` group。
- `tsconfig.host.json`：加入 Host package project reference。
- `packages/bundle/web-app/package.json` 与 `cordis.patch.yml`：加入并在 `storage-domain` 后挂载 Host 插件；若施工选择仅通过本地 Profile 启用，则这两项改为 Profile 受控 patch，并在实现 PR 中只保留一种组合真源。
- `pnpm-lock.yaml`：只记录新 workspace importer/dependency 图，不升级既有版本。
- `docs/module-graph.md` 及其生成记录：由既有生成门禁更新。
- 受新增包约束要求影响的 package catalog、README 限制清单或 invariant 清单，仅在对应门禁明确要求时更新。

Phase 1 不修改 `api-remotes` 和 Client roster，因为没有 Browser consumer；这些留到 Human Gate/UI 阶段。

### 8.3 只复用、不修改的模块

- `@deepseek-ai/dsh-storage`、`dsh-storage-domain`、当前 `dsh-storage-json` backend。
- `dsh-session`、Session JSONL persistence 和 checkpoint policy。
- `dsh-workspace`。
- `dsh-agent`、`dsh-agent-loop`、subagent、Workflow Engine 和 skill registry。
- `dsh-fs` 与 `dsh-fs-local` 的已有实现；Phase 1 ArtifactStore 可通过现有原子语义或同仓库的 atomic-write utility 组合，不改变 FS seam。
- 所有现有 UI slot 和第三方 Profile plugin。

### 8.4 数据存储位置

- 业务状态：`$DSH_HOME/storages/business_workbench.json`。这是当前 Web Profile 的 storage-json root 和 domain name 自然产生的位置。
- Artifact：`$DSH_HOME/business-workbench/v0.1/projects/xhs/batches/<batchId>/jobs/<jobId>/attempts/<attemptId>/<kind>/<artifactId>.md`。
- Artifact kind：`input`、`intermediate`、`validation`、`review`、`final`。Phase 1 允许保存所有 kind，但不实现 Promote。
- 每个 Artifact 引用至少保存 `artifactId`、`kind`、`attemptId`、相对路径、`sha256`、byte size、createdAt 和可选 source hash。绝对路径不进入可迁移 manifest。

### 8.5 状态机

Job 状态固定为：

```text
created
  -> preparing
  -> generating
  -> validating
  -> waiting-review
  -> revising -> validating -> waiting-review
  -> approved
  -> finalizing
  -> completed

preparing | generating | validating | revising | finalizing
  -> failed | interrupted
```

每个 Job record 包含单调 `revision`、固定 `projectId = xhs`、`workflowVersion`、`batchId`、`activeAttemptId`、不可变 Attempt 摘要、Review 摘要和 Artifact refs。所有命令携带 `expectedRevision`；状态相同不自动代表幂等，重复命令还必须携带 `idempotencyKey`。`failed`/`interrupted` 的 retry 创建新 Attempt，不复用旧 Attempt id。Batch record 保存 4 个 Job id、共同输入 hash、可选 batch-level feedback 和创建协议状态；显示状态从 4 个 Job 派生。

### 8.6 最小 Host API

- `createBatch(request)`：只接受 `projectId: 'xhs'` 和恰好 4 个已解析 task card 引用/快照；同一个 idempotency key 返回同一 Batch。
- `listBatches()`、`getBatch(batchId)`、`getJob(jobId)`：返回不可变快照。
- `transitionJob({ jobId, expectedRevision, idempotencyKey, transition, reason? })`：执行 closed transition，冲突返回 authoritative current。
- `commitArtifact({ jobId, expectedRevision, idempotencyKey, attemptId, kind, content })`：先原子保存并 hash，再提交 Job 引用；相同 key/相同 hash 返回既有 Artifact，不同 hash 报冲突。
- `verifyArtifacts(jobId)`：只读检查引用、文件存在、size 和 hash，用于启动恢复和验收。

Phase 1 API 是 Host service 方法，不开 Browser Remote，也不注册 model-facing tool。

### 8.7 自动测试与故障恢复测试

- schema：未知状态、未知 Project、重复 id、非法时间、非法 Artifact ref、不同 domain version 均明确拒绝。
- state machine：每条合法 transition 成功，每条越级、回退、terminal 后修改和 stale revision 失败。
- Batch 创建：模拟 pending marker 写入后在第 0、1、2、3、4 个 Job 位置中断；重启后完成同一 Batch 或明确报告损坏，不能生成两个 Batch。
- Job 隔离：4 个 Job 中一个 transition/Artifact 写失败，另外 3 个 record 和目录 hash 不变。
- Artifact：路径穿越、symlink 逃逸、重复 id/不同内容、并发 create、写后 hash 不符均失败；同 key/同内容幂等成功。
- 提交顺序：模拟文件已发布但 Job ref 未提交，重启后权威状态不引用半提交内容；模拟 Job ref 指向缺失文件，启动进入明确 degraded diagnostic，不伪装为完整。
- Runtime 重启：在每个 transient 状态重开 service，Job 进入 `interrupted`，非 transient 状态保持原值。
- Loader composition：从真实 cordis config 启动临时 `DSH_HOME`，创建 Batch/Artifact，dispose，再启动并读回；不访问 ambient `~/.dsh`。
- 无外部写入：测试根外的 sentinel 文件保持不变，Phase 1 没有任何 Obsidian adapter 或 model-facing tool。

## 9. Phase 1 验收标准

1. 新建一轮 Batch 后恰好有 4 个独立 Job，重启 Runtime 后 id、状态、revision 和输入 hash 完全一致。
2. Job 是唯一业务真源；删除所有对应 Chat Session 或不创建 Session 都不影响 Batch/Job 查询。
3. 任一 Job 的非法状态、异常或 Artifact 失败不会修改同 Batch 其他 Job。
4. 每个持久状态变化有 compare-and-set；重复命令不会创建第二个 Attempt 或第二份不同内容的同 id Artifact。
5. Artifact 位于专用 `$DSH_HOME/business-workbench` 根，引用可通过 SHA-256 验证；生产 Obsidian 目录没有写入。
6. Runtime 在任一 transient 状态退出后重启，Job 只会进入可解释的 `interrupted`，不会显示仍在运行或自动重复执行。
7. JSON state 缺失、损坏、version 不符或 Artifact 不完整均 fail loud，并给出不含输入正文或 credentials 的诊断。
8. focused tests、真实 Loader composition test、typecheck、lint、build 和相关 doc-sync 门禁通过；不要求在本阶段运行模型 e2e。
9. Git diff 只包含 Phase 1 明确文件、必要生成物和 Agent Note，不修改 Core、Workflow、Skill、UI 或生产 Profile 数据。

## 10. 明确不修改区域

Phase 1 以及后续 V0.1 默认不得修改：

- `packages/core/agent-loop/` 和 AgentLoop 行为。
- `packages/workflow/workflow/`、`workflow-worker-thread/` 和 `tool-workflow/`。
- `SESSION_FORMAT_VERSION`、Session event 基础格式和 Session persistence 格式。
- `packages/skill/skill/` registry 和 `tool-skill` 的全局行为。
- `packages/workspace/workspace/` 的语义。
- 文件沙箱、shell sandbox 和通用工具授权模型。
- 现有第三方 Profile plugin 的源码、版本和配置。
- 生产 `~/.dsh` 中既有 Session、credentials、skill、plugin 数据；实施测试必须使用临时 `DSH_HOME`。
- Obsidian 正式资产和任务卡；直到独立 Promote 阶段，只读源输入并写 Business ArtifactStore。
- 小红书配图、自动选题、自动发布、动态 skill routing、动态 Workflow、拖拽编辑器、多用户、云端和多租户能力。

## 11. 当前仍无法确认的问题

以下事项不能从 Harness 源码得出，进入对应施工阶段前需要业务输入或受控样本：

1. xhs 正式任务卡、账号规则、产品真值、正文规范和黄金样稿的 canonical 路径、文件格式、字段 schema 与允许字符编码。
2. Obsidian 正式资产根、目标命名规则、已有文件冲突策略，以及人工批准覆盖时应采用的 expected hash 来源。
3. Generation 与 Semantic Validator 的固定 provider/model/reasoning/maxTokens、超时、重试次数和成本上限。
4. Batch-level feedback 如何确定性地下发到 4 个 Job，以及整批退回时已批准单篇是否撤销批准。
5. 内部 Agent Session 是否默认 archive、在 Job UI 中是否提供 transcript 链接，以及 retention 周期。
6. Business state 是否永远只有一个 Host process 写入。若将来允许两个 Runtime 指向同一 `DSH_HOME`，当前 JSON backend 不足，必须切换到带明确并发约定的 backend。
7. Reliability 指标的统计分母、WARN 是否算首稿通过、人工一次批量反馈如何计数，以及“严重工程错误”的闭集定义。

## 12. Go / Revise / No-Go 结论

**结论：Revise，调整后 Phase 1 Go。**

不建议按原设计直接开工，因为现有 `ctx.jobs`、Workflow Run、Workspace、fs-sandbox、skill registry 和 ask-user 都不能提供设计稿假设的持久或授权语义。推荐先接受以下施工基线：一个 Host 业务真源、业务层固定状态机、两次独立 Agent Attempt、Host 生成最小执行包、默认无通用读写/skill 工具、独立 ArtifactStore、业务专用 durable Human Gate。

Phase 1 的第一刀是：只创建 `business-workbench` Host package，在临时 `DSH_HOME` 中完成 4 Job Batch、状态 revision、Artifact 原子提交和重启恢复测试。不要同时接 Agent、Workflow、Validation、UI 或 Obsidian Promote。该闭环通过后，再进入 Execution Package 与受限 Agent 执行阶段。
