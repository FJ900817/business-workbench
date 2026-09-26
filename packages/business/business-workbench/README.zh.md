# dsh-business-workbench

[English](README.md) | 中文

Business Layer V0.1 的 Host-only 持久化权威。`ctx.businessWorkbench` 负责单 Job 与四参与 Job Batch、执行租约、中断恢复、冻结执行包、精确 Skill 快照、受限单轮 Agent 执行、不可变 Attempt 历史、文本 Artifact、权威 XHS 输出 bundle 与确定性 XHS L1 Validation。它不提供 Remote、模型可见工具、UI、Workflow、语义 Validation 或 Obsidian writer。

## 配置

```yaml
- name: '@deepseek-ai/dsh-business-workbench'
  config:
    dshHome: /optional/isolated/dsh-home
    readRoots:
      xhs: /existing/xhs-project-root
      sharedProductTruth: /optional/existing/product-truth-root
    xhsProductionSource:
      vaultRoot: /existing/formal-vault-root
    leaseDurationMs: 30000
    restrictedAgent:
      provider: deepseek-official
      model: deepseek-chat
      reasoningEffort: low
      maxTokens: 1024
      timeoutMs: 20000
```

`leaseDurationMs` 是必填部署策略。`dshHome` 可选；省略时依次使用 `DSH_HOME` 和 `~/.dsh`。`readRoots` 整体可选；一旦提供，`xhs` 必填，`sharedProductTruth` 仍可选。resolver 将 `xhs/**` 与 `shared/product-truth/**` 映射到这些物理 root，不向调用方暴露绝对路径。未挂载读取策略时，创建执行包和读取输入以 `READ_ROOT_UNAVAILABLE` 失败；请求未挂载的 logical root 则以 `READ_DENIED` 失败。

`restrictedAgent` 是可选的部署配置。省略后 Phase 1 与 Phase 2 API 仍然可用，但 Agent 执行以 `AGENT_RUNTIME_UNAVAILABLE` 失败。其 timeout 必须短于执行租约。业务状态使用 `business_workbench` storage domain；Artifact 字节位于 `<dshHome>/business-workbench/v0.1/`。

`xhsProductionSource` 是可选配置，并要求 `readRoots.xhs` 精确指向 `vaultRoot` 下的正式 XHS Project。该配置启用仅 Host 可用的 `xhs-production-source-v1` resolver。Resolver 读取指定正式入口与基线，根据账号/月/周/note 推导唯一任务卡路径，校验已确认的系统二真源链路，按 `note_type` 路由唯一的版本化 V3.0 规则与黄金样稿，并生成唯一账号 S3 snapshot。在系统二到机器投影边界，系统二当前正式推荐型标识 `干货推荐型（soft_plant）` 会被确定性映射为规范机器值 `干货推荐型（recommendation）`；TaskCard compiler 与 resolver 仍拒绝旧值或推断出的机器值。它不执行目录发现、模糊匹配、归档查询或 fallback。

## 执行与恢复

Batch 创建仍可恢复。`single` 请求只生成一个参与 Job，`quad` 请求生成恰好四个相互独立的参与 Job。迁移后的 V4 Batch 保持为 `legacy-fixed4`：四个历史 Job 全部保留，但会明确列出具有持久参与证据的一或四个 Job。`createAttempt` 创建 `pending` Attempt，Job 仍为 `ready`；只有 `acquireExecutionLease` 会把两者变为 `running`。续租、释放、普通完成、提交 Artifact 和执行受限 Agent 都要求相同 owner 与当前 Job 状态。启动和显式恢复会完成已经失去执行 owner 且拥有已验证权威输出 bundle 的 XHS 执行；其他失去 owner 的执行变为 `interrupted`。恢复不会自动重试模型工作。

执行包冻结精确输入路径、hash 与大小、Workflow 版本、读取 root/file allow-list、请求的 capability/Skill 列表，以及完整的 winning Skill 定义及其 origin 与内容 hash。每个正式 XHS Workflow 都声明封闭的 Skill requirement：First Pass、Revision 和 Retry 必须恰好包含一个账号 S3 snapshot，Contract Repair 则必须不包含 Skill。缺失声明、缺失必需 snapshot，以及 Skill-free package 意外携带 snapshot，都会在模型 I/O 前失败。正式生产输入只允许来自 `xhs/` 或 `shared/product-truth/` 下的精确冻结文件；第二轮执行包还可以精确引用 Host 挂载的 `business-artifacts/` 下不可变文件。绝对路径、路径穿越、反斜杠、无关 Project、未列出文件、非普通文件、symlink 逃逸、输入漂移、Skill 漂移和未批准 Skill origin 都会在模型 I/O 前失败。

Phase 3 唯一 action 是 Project `xhs` 的 `fixture-agent-run`。Host policy 允许 `restricted-agent`、`fixture-writing` 与 `fixture-truth-check`；执行包声明只能进一步收窄该固定策略。adapter 创建一个全新 Harness Agent Session，用冻结输入与 Skill 正文替换 ambient prompt context，不发布任何 tool schema，安装 deny-all tool execution guard，以部署固定模型执行一次，然后销毁 live Session。它不暴露 Skill discovery、filesystem、shell、Workspace 或 subagent operation。

`xhs-body-prepare-v0` 具有显式 `fixture` 与 `production` route。它的 package 恰好包含 `taskCard`、由任务卡选择的 V3.0 `writingRule` 与对应 `goldenSample`；账号专属 S3 指令是一个精确 Skill 快照，不是输入文件。每个账号映射到一个合法 Host adapter id 与一个正式 `.agents/skills/S3-笔记写作-账号X/SKILL.md` 来源。该 action 不允许目录读取、工具、发现操作、subagent、动态 Skill 选择或动态模型选择。

`createXhsProductionExecutionPackage` 把不含正文内容的控制文件、真源链路、路由与 S3 来源证据随 package 持久化。`production` route 要求该 manifest，匹配其中的账号与正文类型，在模型 I/O 前重新读取全部精确来源，并且只接受 resolver 持有的 `project-agents / business-xhs-production-v1` S3 快照。入口、基线、系统二真源、任务卡、规则或样稿漂移以 `INPUT_DRIFT` 失败；S3 来源或正文漂移以 `SKILL_DRIFT` 失败。使用新来源必须创建新的 Attempt 与 snapshot。

V0.1 第二轮采用追加式记录。`createXhsReviewArtifact` 在新的 single Job revision Attempt 上记录经过 hash 校验的 `PASS`、`MODIFY` 或 `FAIL` 审核，不改变来源 Job。Review version 2 会记录精确 Output Bundle、Draft 路径与 hash，并标明结构完整来源是 First Pass、Revision 还是成功 Retry；version 1 First-Pass Review 无需迁移即可继续读取。`xhs-body-revise-v0` 只接受 `MODIFY` Review、当前被审核候选稿、原冻结生产真值与 S3 snapshot，revision number 由 lineage 确定：First Pass 与 Retry 候选稿生成 Revision 1，Revision 1 生成 Revision 2，Revision 2 再次修稿则以 `MAX_REVISION_REACHED` 拒绝。模型指令只允许处理 `required_changes`，在兼容时保留 `preserve`，并把 `quality_suggestions` 作为可选建议。每个新 Output Bundle 都指向直接被审核候选稿及其 Review，使不可变链路最终可追溯到 First Pass，同时不覆盖任何候选稿。

`xhs-body-retry-v0` 与 Revision 明确分离。它只允许对空输出或确定性的 `FORMAT_CONTRACT_FAIL` 进行一次调用方批准的 Retry，不适用于普通 Hard Contract 或内容质量问题。Retry package 不包含失败稿字节，只记录来源 Job、Attempt 与封闭的失败原因，并继续使用相同冻结任务身份、生产输入、账号 S3、输出格式与 Validator。成功且结构完整的 Retry 会成为可审核候选稿，并可产生 Revision 1；Retry 与 Revision 都不能再次进入 Retry。系统不会自动 Retry。

`xhs-body-contract-repair-v0` 与业务 Revision 明确分离。只有 hash 绑定的 Review 记录 `PASS`、候选稿符合当前 Draft Format，且对应 Validation 只包含封闭 repair 词汇可表示的确定性失败时，同一候选稿才允许进行一次 Repair。V0.1 只允许标题/正文字数、精确关键词次数或标题位置、自报字符数 metadata，以及精确话题真值集合不变时的话题顺序。评论修改、话题集合变化、产品路由、业务判断、Leo 经历与一般性优化都不是调用方可选择字段，并会 fail closed。无 Skill 的 package 只暴露 TaskCard、候选稿、PASS Review 与对应 Hard Validation；package 创建、持久化解析、公开校验、Host policy 与 Agent preflight 都执行相同的 `none` requirement。Lineage 记录两份证据 Artifact、失败项、repair number 1 和修复字段。Provider 调用前的 package verification 失败不消耗唯一一次执行额度；被中断 Attempt 保持不可变，恢复后必须创建新 Attempt。Repair 结果不能进入 Repair 2，也不能再次进入业务 Revision。

`xhs-body-length-repair-v0` 是更窄的 V0.2A 路径，只接受业务审核为 `PASS`、格式完整，且确定性失败仅为 `titleRange` 或 `bodyRange` 的候选稿。无 Skill 的 package 只暴露 TaskCard、精确候选稿、绑定的 PASS Review 与对应 Hard Validation。模型最多返回三个标题候选和三组明确的局部正文 `old_text` 到 `new_text` patch；严格 JSON 解析会拒绝完整稿、额外字段、多行 patch、来源中不存在或重复的文本，以及相互重叠的 patch。Host 从不可变来源独立应用每个方案，以 `countXhsFullCharacters` 重建字符 metadata，重新执行当前格式与 Hard Contract Validator，保护评论、话题和 Review 中每个可精确核对的 `preserve` 内容，并按 Unicode 编辑距离最小确定性选择通过方案。没有方案通过时，结果为 `LENGTH_REPAIR_UNSATISFIED`，保留 proposal evidence 但不创建候选稿。一次已启动 Agent Run 即消耗唯一 Repair 额度。机器通过后仍为 `CANDIDATE_READY`，只有独立的人类 Patch Approval 可记录 `APPROVE / PROMOTION_ELIGIBLE` 或 `REJECT / STOP`；两种决定都不会启动新 Repair 或写入 Obsidian。

已完成但没有可见文本的 Agent turn，如果由 `max-tokens` 结束且报告的 reasoning token 数大于零，则以 `REASONING_BUDGET_EXHAUSTED` 失败；其他情况仍以 `EMPTY_AGENT_OUTPUT` 失败。诊断 version `2` 会记录 provider、model、请求的 reasoning effort 与 output cap、Agent Run/Session id、规范化后的 assistant/text/reasoning/tool/final-event 数量、content field 类型、final-text bytes、可用的 finish reason 与 token usage、时长和失败阶段，但不记录 prompt 或 response 正文。同一份 JSON 诊断会追加到现有持久 Agent Run `failureReason`；schema version `5` 没有增加诊断字段。如果 Session event 词汇不携带某字段，该字段就保持缺失。空输出不会触发 retry，reasoning block 也绝不会成为正文。新鲜成功结果还会在非持久 execution metrics 中报告规范化 finish reason。

成功的 fixture action 会结算一个 `intermediate` Artifact。成功的 XHS action 会验证并暂存 `draft.md`、`draft-metadata.json` 与 `provenance.json`，发布其不可变目录，再通过一次 Job CAS 使一个输出 bundle 成为权威事实。缺文件、非法 JSON、关系不一致、hash/size/origin 不一致都会在该状态更新前失败。重试会返回唯一权威结果；同一 Attempt 的第二个成功 bundle 会被拒绝。CAS 前遗留的 staging 或 published 字节可通过只读 reconciliation 发现，但绝不会自动成为业务事实。

模型请求前，Host 将冻结正式 TaskCard 严格编译为 `xhs-task-card-contract-v2`。结果记录 compiler 与生产身份、确认状态、标题/正文范围、note type、精确关键词及要求位置、正文结构标签、产品模块、评论数量、按顺序排列的精确话题值与明确禁止项。缺少 compiler 身份、旧 note type、重复字段或话题、声明数量与实际话题不一致、缺失关键词策略以及互相冲突的 SEO 关键词声明都会 fail closed。对于生产真源，系统二任务卡与系统一 TaskCard 必须都处于已确认状态，并在创建执行包前包含顺序完全一致的十个唯一话题。只有 `SEO高亮词：无` 能显式表示精确关键词要求为空；字段缺失绝不会被当成空要求。最终 user instruction 尾部会追加简短的 `【本篇执行硬合同】` checklist，其中只重复编译结果里的规则，包括全部必需 hashtag。

模型返回后，`xhs-hard-contract-l1-v3` 首先要求 `xhs-draft-markdown-v1`：一个位于开头的 H1 标题、紧随其后的合并模型自报字符数行，以及按顺序排列的 `置顶评论`、`非置顶评论`、`关联话题` H2 section。格式失败时记录 `FORMAT_CONTRACT_FAIL`，实际计数为 null，各项检查为 `NOT_EVALUATED`，不会猜测内容区间。解析成功后，Validator 独立于模型自报数字计算标题与正文的 Unicode code point 数量，记录关键词精确 offset，检查标题关键词、关键词最低总次数、评论数量，并将最终 hashtag 按顺序逐词与 TaskCard 对比。缺失、新增、重复、换序或第十一个话题都会返回 `HARD_CONTRACT_FAIL`，并记录 `expected_topics`、`actual_topics`、`missing_topics` 与 `unexpected_topics`；不接受别名、文本归一化或语义相似。由于尚无机器边界，开头/中段/末尾关键词位置、正文结构含义、产品模块含义与文本禁止项只保留为 deferred evidence。Validation result version 4 在不改变 version-5 Business Artifact 的情况下记录这些区别。Validator 不修改 Draft，也不调用模型。输出 bundle 与一个不可变 `validation` Artifact 在同一次 Job CAS 中成为权威事实，因此重启与幂等重放会共同保留原始 First-Pass Draft 及其确定性结果。

`replayXhsHistoricalDraft` 是格式契约上线前 Draft 的只读证据路径。它保留原稿的格式失败，仅在一种已知历史布局能够无歧义确定标题、正文、评论和话题时输出硬规则证据；它不会让旧布局成为未来生产 Run 的合法格式。

人工确认正文终稿后，`buildXhsCoverHandoffArtifact` 产生独立的 `xhs-cover-handoff-v0.1` 不可变 Artifact，不写回 Obsidian 正文。它绑定正文路径、SHA-256、终稿状态、`note_type`、完整 `title_pair_contract`、逐字段来源、人工决策来源、创建时间和任务 lineage；缺失五字段、正文 hash 漂移、终稿标题冲突或主数字不在正文中都会在 S15 前失败。`buildXhsSearchSolutionCoverPlan` 将干货搜索型固定路由到 `V2_1_Swiss_Purple_QingYa`，固定 P1-P8 模板顺序、共享 Swiss 标题容量、`SENSE / JUDGE / ACT` 节点及仅 P5 一张图片的槽位，不调用模型或图片服务。

XHS 策略 `xhs-body-prepare-policy-v2-text` 接受 Markdown final text，不接受模型生成的 JSON 包装。Host 最多去除一个初始 BOM，保留其余全部正文字节，再通过 `JSON.stringify` 编码严格的内部 `{draft: string}` 包装。以 JSON 容器或代码围栏开头、空文本、内嵌 BOM/NUL、超大正文以及明确报告 `max-tokens` 结束都会被拒绝。不进行提取、JSON 修复、围栏去除或第二次模型调用。`XHS_BODY_OUTPUT_INVALID` 携带不含正文的 `xhsOutputDiagnostics`，记录分类、阶段、UTF-8 字节数、hash 与观测到的结束原因；现有持久 `failureReason` 保存该 JSON，不改变 V5。缺失的结束证据不会被推断。

storage domain schema version 为 `5`。每个 Batch 记录 `single`、`quad` 或迁移专用的 `legacy-fixed4` 参与语义，以及明确的参与 Job id。每个 Attempt 可持有 production-source manifest 与一个可空的权威输出 bundle，completed Agent Run 必须且只能引用 Artifact 或输出 bundle 之一。Version 0 到 4 与任何未知版本都会在普通打开时被拒绝且不修改原文件。包内只提供一条显式、hash-gated、由 operator 执行的 V4→V5 JSON migration；Runtime 启动绝不会调用它。

## Host API

`finalizeXhsOutputBundle(jobId, attemptId)` 验证最新 Attempt、completed XHS Agent Run、权威 bundle 字节、冻结包 provenance 与确定性 Validation 后释放租约。能够解析的候选稿即使普通 Hard Contract 失败，也以 `review-ready` 原因完成；结构格式失败则以 `failed` 与可重试原因结束。重复收尾不增加 receipt、revision 或 Artifact。这只是执行结算，不是内容批准，也不是资产 Finalize/Promote。

XHS bundle 结算前，Host 在 Business root 下 fsync 仅所有者可访问的 write-once `execution-observations/<sha256(agentRunId)>.json` 记录。它在保持 V5 Job schema 不变的前提下保存可获得的 token 用量、结束原因、运行时耗时、模型选择以及精确 Draft 字节数和 hash。缺失观测保持 absent 或 null，并标为 `incomplete`；恢复不能从 `off` 推断 reasoning token 为零。观测记录不能让未被 Job 引用的输出成为权威结果。`countXhsFullCharacters` 按 Unicode code point 计数，不加权、不 trim。标题观测排除 Markdown 的 `# ` 前缀，单独记录模型自报数量，绝不改写 Draft 字节。这些计数不是完整内容 Validation。

- `createBatch`、`getBatch`、`listBatches`、`getJob` 与 `listJobs`
- `businessBatchParticipation`，用于生成不会计入 legacy 占位 Job 的 metrics 投影
- `transitionJob`、`createAttempt`、`acquireExecutionLease`、`renewExecutionLease`、`releaseExecutionLease` 与 `completeAttempt`
- `createExecutionPackage`、`createXhsProductionExecutionPackage`、`createXhsRevisionExecutionPackage`、`createXhsRetryExecutionPackage`、`createXhsContractRepairExecutionPackage`、`createXhsLengthRepairExecutionPackage`、`readExecutionInput`、`verifyExecutionPackage`、`getExecutionStatus` 与 `recoverInterruptedExecutions`
- `createXhsReviewArtifact`、`createXhsLengthRepairApproval`、`preflightXhsRevision`、`preflightXhsRetry`、`preflightXhsContractRepair`、`preflightXhsLengthRepair` 与 `preflightXhsLengthRepairSource`
- `runRestrictedAgent`、`finalizeXhsOutputBundle`、`getOutputBundle` 与 `reconcileOutputBundles`
- `assertXhsBodyPrepareExecutionPackage`、`assertXhsOutputBundle` 与 `xhsBodyPrepareIdempotencyKey`
- `commitArtifact`、`getArtifact`、`verifyArtifacts` 与 `reconcileArtifacts`

## Model Experience

### 受限 fixture Agent 请求

#### What the model sees

每个受限 action 都提供一个 complete system prompt，其中只有 Host 固定 action 指令与获准 Skill 快照；随后的一条 user message 包含 action metadata 与冻结输入字节。生成 Draft 的 XHS action 会在尾部追加 TaskCard 投影得到的 execution checklist 和固定 `xhs-draft-markdown-v1` 结构。Revision 还会获得当前被审核的不可变候选稿及其 Review；Retry 永远不会获得失败稿字节。Contract Repair 会获得候选稿、PASS Review 与对应 Hard Validation，但不会获得 Skill、写作规范或黄金样稿。Length Repair 获得相同的四项冻结证据输入，但只返回受限 JSON patch proposal，既不返回完整 Draft，也不填写字符 metadata。其他 Draft action 只返回由一个 H1 标题、合并自报字符数行、正文、按顺序排列的评论 section 与话题 section 组成的纯 Markdown，不得带 JSON、代码围栏或外层报告。Host 生成 metadata、provenance 与 L1 Validation，不请求提供方原生 JSON mode。Session 不接收 preset、历史消息、runtime context、discovery result 或 callable tool。其他 API 不产生模型请求。

#### Token effect

一次请求包含完整 selected Skill 正文、输入文件与固定 metadata，因此成本随冻结 package 字节增长；临时 Session 不产生后续 turn。

#### KV Cache effect

每次调用使用全新 Session，并从不可变 package 内容组装 complete prompt。具有相同 package 与部署策略的请求可能共享 provider-side prefix，但本包不维护应用缓存，也不承诺 cache 行为。

## Known Limitations and Deferred Work

- **单 Runtime writer**——同一个 `DSH_HOME` 只能由一个 Runtime 挂载该 domain；本阶段不新增跨进程 lock。
- **只支持一条显式 migration**——operator-run V4→V5 JSON migration 是唯一支持的迁移；schema 0 到 3 与未知版本仍不兼容。
- **封闭 Batch 数量**——新 Batch 只能是 `single` 或 `quad`；不支持任意 N Job 调度，`legacy-fixed4` 只由迁移产生。
- **无 Human Gate UI**——Review Artifact 与最多两次受控 Revision execution 已存在，但审核录入尚无 UI，获批资产 finalization 与 promotion 仍不存在。
- **无自动重试**——一次结构性 Retry 只能通过显式 Host API 准备；中断和其他 provider failure 仍由调用方控制。
- **无 orphan 清理**——reconciliation 只读。
