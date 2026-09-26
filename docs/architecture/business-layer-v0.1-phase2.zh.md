# 简哥工作台 Business Layer V0.1 Phase 2：执行安全边界

[English](business-layer-v0.1-phase2.md) | 中文

Phase 2 增量扩展现有 Host-only [`dsh-business-workbench`](../../packages/business/business-workbench/README.zh.md) 包，新增执行所有权、重启恢复、最小执行包、Project 级读取、输入漂移检测和只读 orphan reconciliation。它不新增 Agent 执行、模型请求、正式小红书 Workflow、Validation、Human Gate、UI、Browser Remote、Obsidian 写入，也不修改 AgentLoop、WorkflowEngine、Workspace 或全局文件系统策略。

## 物理架构

一个包仍是最小正确单元。现有服务是 Batch、Job、Attempt、lease、package 与 Artifact 引用事实的唯一 writer。`BusinessReadBoundary` 和 `BusinessArtifactStore` 是包内协作者，不是单独挂载的插件。Web Host 显式提供 `leaseDurationMs`；它刻意不提供生产 `readRoot`，因此在后续部署决策之前，Phase 2 无法读取生产业务来源。

JSON backend 仍假设每个 `DSH_HOME` 只有一个 Runtime writer。Phase 2 不增加脆弱的 lock file：可靠的跨进程排他需要独立的所有权、stale lock 与崩溃恢复协议。部署时不得让两个 Runtime 进程挂载同一个 Business domain。

## Attempt 与 lease 生命周期

生命周期为 `draft -> ready -> pending Attempt -> running -> completed | failed | cancelled`，以及 `running -> interrupted -> pending new Attempt`。failed Job 可以显式回到 `ready`。创建 Attempt 不代表开始执行；只有 `acquireExecutionLease` 会把 pending Attempt 与 Job 改成 `running`。

lease 记录 Attempt、调用方 owner、Runtime instance、取得与续约时间、过期时间和状态。取得、续租、释放、完成、创建 package、读取输入和提交 Artifact 都会核验当前 Attempt 与 owner。mutation 还会使用 Job CAS revision 和持久化幂等 receipt。每个 Job 最多只有一个 pending 或 running Attempt，而该 Attempt 最多只有一个 active lease。

Runtime 构造时会创建新的随机 instance id。启动期间，属于其他 instance 的每个持久化 running Attempt 都会变成 `interrupted`，原因为 `runtime-owner-lost`；当前 instance 中已过期的 lease 会以 `lease-expired` 中断。旧 Attempt、package、Artifact 引用、receipt 和字节全部保留。恢复绝不调用执行，也不创建 Attempt。调用方必须显式创建下一个 sequence 并取得新 lease。

`getExecutionStatus` 根据当前时间和 Runtime identity 派生，因此即使持久化恢复尚未执行，也不会把过期或外来 lease 报告为 owned。

## 冻结执行包

每个 Attempt 最多拥有一个不可变 package。Manifest 包含 package、Project、Job 与 Attempt id、Workflow version、精确 input entry、允许读取的 root/file、声明式 capability 与 Skill、创建时间和 SHA-256 digest。每个 input 记录非空 role、标准化相对 POSIX path、required、presence、来源 SHA-256 与 byte count。可选输入的缺失也会被冻结，因此后来出现同样属于 drift。

package id 由 Job、Attempt 和 idempotency key 派生。声明数组会标准化、去重并排序。input 顺序保持调用方定义，因为 role 可能有顺序。digest 覆盖持久化语义字段，并在启动与显式 package verification 时核验。

capability 与 Skill allow-list 只是声明。Phase 2 没有 Skill registry 或 Agent 消费它们。未来 execution adapter 必须使用冻结 package，不得重新发现能力。

## 读取隔离

Host 只接受 `xhs/` 或 `shared/product-truth/` 下的相对 POSIX path。空 segment、`.`、`..`、反斜杠、POSIX/Windows 绝对路径、`gzh/`、`enterprise/`、`archive/` 和其他 shared root 都会在文件系统访问前失败。每个 input 还必须匹配 package 中的精确 allowed file 或 allowed directory prefix。

resolver 使用 `realpath` 规范化配置 root 和每个已存在 target，核验包含关系，并要求普通文件，因此会拒绝解析到 root 外的 symlink。它绝不枚举 Obsidian tree，也不会通过读取目录来选择输入。`readExecutionInput` 只接受 package 中已冻结的精确 path，并在异步 I/O 后再次核验当前 lease。

当前字节会与冻结的 presence、hash 和 size 比较。不同则返回 `INPUT_DRIFT`，只包含安全 path/hash 诊断，不包含正文。package 不会被修改或重新生成。

## Artifact reconciliation

原子 Artifact 发布可能在文件系统发布成功而 Job CAS 失败时留下完整文件。`reconcileArtifacts` 只递归扫描私有 `projects` Artifact 子树，跳过 symlink，识别确定性 Artifact 文件名，对无引用文件计算 hash 并返回摘要。它绝不删除、收编、建立引用或 Promote 文件。

## 持久化格式

execution lease 与 package 字段会结构性修改 Job record，因此 `BUSINESS_WORKBENCH_SCHEMA_VERSION` 为 `1`。预发布格式策略会拒绝 Phase 1 schema v0，并保持 medium 不变。不存在隐式 migration。生产启用 Phase 2 读取已有 Business data 前，必须保留备份，并运行单独审计的显式 upgrader，或从空 Business domain 开始。

## 验证

聚焦测试只使用临时 Harness home 与 input root。覆盖单 owner 取得、owner mismatch、CAS 续租、显式释放、过期、重启 owner loss、新 Attempt 创建、旧 package/Artifact 保留、精确 xhs/shared 读取、未列出 path、无关 Project、路径穿越、绝对路径、symlink 逃逸、package digest 核验、input drift、orphan 发现、四 Job 隔离、Batch 创建恢复、Artifact 损坏，以及 schema v0/未知版本在不修改 medium 情况下被拒绝。

## 延后范围

Agent/Workflow adapter、实际 Skill enforcement、Workflow-specific package template、Validation、Human Gate、Remote/UI、Obsidian Promote、业务指标、跨进程 writer 排他、schema upgrader 工具与 orphan 处置均不属于 Phase 2。
