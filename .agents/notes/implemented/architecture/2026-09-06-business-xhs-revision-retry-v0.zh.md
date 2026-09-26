# Agent Note：XHS 修稿、结构重试与合同修复采用相互独立的追加式执行

Status: implemented

[English](2026-09-06-business-xhs-revision-retry-v0.md) | 中文

后续的 [字数 Patch Repair Note](2026-09-08-business-xhs-length-patch-repair.zh.md) 只在未来标题/正文字数修复执行方面取代本 Note；Revision、Retry 与历史 Contract Repair 证据仍以本 Note 为准。

## 问题

首批生产样本暴露了两种无关的第二轮需求。完整候选稿可能需要按人工或外部业务审核执行有限修改，而空响应或结构残缺响应可能需要一次执行重试。新的普通首稿 Job 无法表达这两种来源关系；修改已完成 Job 或覆盖其 bundle 则会破坏 First-Pass 证据。

## 决策

Business Workbench 保持 Schema version 5，并把两种操作都表示为新的 single Job。Revision Job 持有不可变 `review` Artifact，其正文记录来源 Job、Attempt、Output Bundle、Draft 路径与 hash、候选类型与序号、审核权威、必改项、可选质量建议、保留内容以及自校验 review hash。目标 Job 必须与来源 Job 使用相同任务卡输入身份。只有针对已完成且结构可解析的 First Pass、Revision 或成功 Retry 的 `MODIFY` Review 能通过 Revision preflight。Version 1 First-Pass Review 无需改写 Artifact 即可继续读取；新 Review 使用 version 2 来源 metadata。

`xhs-body-revise-v0` 冻结原有三项生产输入、当前被审核的不可变候选稿、Review Artifact 与相同账号 S3 snapshot。Lineage 在 First Pass 或 Retry 后分配 revision number 1，在 Revision 1 后分配 revision number 2。Revision 2 再次修稿会以 `MAX_REVISION_REACHED` 拒绝。每个 Revision 都直接指向当前被审核候选稿与 Review，因此不可变链路会追溯到原始 First Pass，或通过 Retry 追溯到失败执行，而不会压平历史。模型指令只允许处理 `required_changes`，把 `quality_suggestions` 视为可选项，并保护 TaskCard 真值与明确要求保留的内容。新 bundle 继续使用普通 XHS Validator，不存在 Revision 专用宽松 Validator。

`xhs-body-retry-v0` 只在失败 Agent Run 记录空输出，或来源 Validation 记录 `FORMAT_CONTRACT_FAIL` 时允许执行。它不把失败稿作为模型输入，只记录来源 Job、Attempt、可选 Output Bundle、封闭重试原因和 retry number 1，且不接受第二次 Retry。完成且结构可解析的 Retry 结果可以进入 Review 并产生 Revision 1。Revision 结果不能进入 Retry。普通 Hard Contract 与内容质量失败不可 Retry。两个 action 都会重新解析正式生产位置，并要求 TaskCard、规则、样稿与 S3 hash 在模型 I/O 前与 First-Pass package 完全一致。

`xhs-body-contract-repair-v0` 是第三种追加式执行，只处理更窄的状态：业务 Review 已通过，但仍有确定性 Hard Contract 检查失败。Preflight 会把 PASS Review 和对应 Validation 与精确候选稿 hash 互相核验，由 Host 推导封闭 repair 范围，并限制每个候选稿最多修复一次。每个正式 Workflow 都具有显式的 `required` 或 `none` Skill requirement。First Pass、Revision 与 Retry 必须包含一个账号 S3 snapshot；Contract Repair 必须不包含 Skill。Package 创建、持久化解析、公开校验、Host policy 与 Agent preflight 都会拒绝未声明 requirement、缺失必需 snapshot 或意外 Skill authority。Repair package 只包含 TaskCard、来源候选稿、PASS Review 与 Hard Validation，不包含 Skill、写作规范或黄金样稿。V0.1 只会推导标题/正文字数、精确关键词、自报字符数 metadata 和话题顺序字段；话题真值变化与评论失败会被拒绝。Repair provenance 会记录两份证据 Artifact 和推导字段。Repair 结果不能进入第二次 repair 或业务 Revision。

执行结算现在会区分可解析候选稿与结构完整性失败。可解析候选稿即使确定性内容检查失败，也会带 `review-ready` 原因完成。结构无效 bundle 会保留原始字节与 Validation，但 Job 和 Attempt 以 `failed` 及可重试原因结束。既有历史 Job 不会被改写；其 Retry eligibility 从已经保留的 Validation 证据推导。

## 考虑过的替代方案

- **在 completed 来源 Job 中增加新 Attempt**——这会重新打开终态历史，并使来源与结果所有权产生歧义。
- **使用一个通用 regenerate action**——它会允许业务修稿绕过明确 Review 证据，也可能在结构重试时暴露失败稿。
- **把来源关系写进 Job 字段**——修改持久 Job record 需要 Schema migration；执行包与 Review Artifact 已能提供不可变来源证据。
- **允许 Retry 任意 Hard Contract 失败**——结构重放无法证明业务质量已经通过；确定性修复必须具备独立 PASS Review 证据。
- **允许调用方指定 repair 字段**——调用方提供的 scope 可能把评论、产品路由、经历或话题真值变化伪装成合同修复，因此 Host 必须从 Validation 推导封闭字段。
- **允许当前生产真源漂移**——第二轮将无法与已确认 First Pass 比较，并可能静默改变业务真值。

## 影响

调用方必须创建新的 single Job 与 pending Attempt，在每次 Revision 或 Contract Repair 前持久化新的 Review，再获取租约并创建专用执行包。一个任务最多允许两次 Revision execution；Retry 调用方只能从原始结构失败创建一个专用 package；每个精确候选稿最多允许一次 Contract Repair Agent execution。Agent session 启动前的 package verification 失败不会消耗该额度：Runtime recovery 会中断遗留 Attempt、保留其证据，并要求创建新 Attempt 与 package。任何操作都不会自动调用模型。所有候选 bundle 保持不可变，Output provenance 保存直接来源 lineage，Runtime recovery 继续复用现有 Output Bundle finalizer，且不会重新打开来源 Job。
