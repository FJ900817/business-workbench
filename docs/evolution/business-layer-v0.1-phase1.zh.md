# Business Layer V0.1 Phase 1 演进记录

[English](business-layer-v0.1-phase1.md) | 中文

版本：Phase 1

日期：2026-08-28

## 修改前

Harness 已具备持久化 Session 事件与通用存储服务，但没有持久化 Business Job 权威来源、固定四篇的 Batch 聚合、Job compare-and-swap API、执行 Attempt 历史或业务 Artifact 提交协议。业务进度只能从 Chat Session 或外部文件推断。

## 修改后

Web Host 组合挂载一个仅运行于 Host 的 `business-workbench` 插件。它把一个 `xhs` Batch 持久化为恰好四个独立 Job，保留不可变 Attempt 历史，拒绝过期与非幂等修改，原子发布经过验证的 Artifact，并在 Runtime 重启后重建相同事实。它不提供 UI，也不执行 Agent、Workflow、Validation 或 Obsidian 操作。

## 验证证据

聚焦自动测试覆盖正常操作、所有 Batch 局部创建中断点、冷重启、四 Job 失败隔离、过期写入、重复操作、Artifact 损坏与不受支持的 schema 数据。测试状态与 Artifact 根目录均为临时目录，并在每个测试后删除。

## 截图

无。Phase 1 不修改用户界面，因此 Evolution 规则不要求 Before 或 After 截图。

## 后续工作

执行恢复、Project 范围读取限制、Workflow Run、Validator、人工审核、可靠性指标、Remote API、Browser UI 与安全 Obsidian Promote 均不属于 Phase 1。
