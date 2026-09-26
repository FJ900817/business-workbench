# Agent Note: 让 Business Job 成为持久化业务权威来源

Status: implemented

[English](2026-08-28-business-workbench-job-authority.md) | 中文

## 问题

Business Layer V0.1 需要四个可独立恢复的小红书正文 Job，其状态必须跨 Session、Runtime、App 与电脑重启保留。Session 历史记录模型可见的执行事实，但不能作为业务审核与交付状态的唯一权威来源。第一阶段还必须在不增加 Agent 或 UI 行为的情况下，从固定四 Job Batch 构造中断和 Artifact 字节发布中断中恢复。

## 决策

新增一个仅运行于 Host 的 `dsh-business-workbench` 插件，作为 Batch、Job、Attempt 与 Artifact 事实的唯一权威来源。它持有 schema version 为 `0` 的 `business_workbench` storage domain，其中包含独立的 `batches` 与 `jobs` 表。它只提供进程内 Host service，不注册 Remote API 或模型可见工具。

Batch 创建标记会在创建 Job 记录之前保存全部四个预分配 Job id 与输入。启动时只创建缺失且匹配的记录，然后把 Batch 标记为 ready。公共 API 不提供独立 Job 创建。

每次 Job 修改使用 compare-and-swap revision 与持久化的带指纹幂等回执。Attempt 是仅追加的历史。Artifact 字节先执行 fsync 并以禁止覆盖的方式发布，然后才把引用追加到 Job。服务接受工作前会在启动时验证 ready Batch 的关系以及所有已引用 Artifact 的 hash。

## 曾考虑的替代方案

- 使用 Session 事件作为 Business Job 状态。未采用，因为业务进度必须独立于 Chat Session 生命周期与执行 transcript 关注点而恢复。
- 复用 `ctx.jobs`。未采用，因为它持有短生命周期的排队回调，而不是持久化业务聚合。
- 把四篇正文都保存在一个可变 Batch 记录中。未采用，因为单篇的 revision 或失败会与其余三篇竞争，并可能改变它们。
- 先提交 Artifact 引用再写入字节。未采用，因为崩溃可能产生指向缺失或部分内容的持久化状态。
- 在同一个包中同时增加事务、schema 迁移、执行恢复、Remote API 与 UI。延后，因为 Phase 1 没有第二个写入者或执行器，而且这些能力需要独立验收证据。

## 结果

服务可以恢复 Batch 创建的每一个中断前缀，并在重启后保留独立 Job 事实。调用方会收到明确的 revision 冲突，也可以安全重试已经确认的操作。Artifact 读取会在文件缺失、路径越界、大小不符或 hash 不符时关闭失败。

当前 JSON 后端仍然只允许单 Host 写入，也不提供跨状态文件与文件系统的事务。Artifact 发布后状态提交失败时，可能留下无法通过服务访问的完整孤立文件。Phase 2 使用[显式执行所有权与读取策略](2026-08-29-business-execution-ownership-and-read-policy.zh.md)取代临时 running-Attempt 行为，并在没有隐式迁移的情况下把 schema 提升到 v1。
