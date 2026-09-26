# 简哥工作台 Business Layer V0.1 Phase 2 Evolution

[English](business-layer-v0.1-phase2.md) | 中文

版本：Phase 2

日期：2026-08-29

## Before

Phase 1 持久化没有执行 owner 的 running Attempt，并在 Runtime 重启后原样保留。它没有最小输入 Manifest、Project 级 reader、drift detection，也没有安全检查无引用 Artifact 文件的方法。

## After

同一个 Host-only 插件把 pending Attempt 创建与租约执行分开。重启与过期会形成持久化 `interrupted` 历史，绝不自动重试。每次执行可以冻结精确 xhs/shared 输入与声明式 capability/Skill 列表；每次读取都会重新核验 policy、lease、hash 与 size。只读 reconciliation 会报告 orphan Artifact 文件。

## Evidence

聚焦测试覆盖 lease ownership/expiry、冷重启与显式新 Attempt 恢复、package 持久化、xhs/shared allow-list 读取、跨 Project 与逃逸 path 拒绝、symlink 逃逸、input drift、orphan 发现、已有四 Job 行为、Artifact verification 与 schema 拒绝。所有测试数据都使用临时目录。

## Screenshots

无。Phase 2 不修改用户界面，因此不需要 Before 或 After 截图。

## Remaining work

尚未实现 Agent、Workflow、Skill consumer、Validation、Human Gate、UI、Obsidian Promote 或业务指标。生产 schema-v0 数据采用 schema v1 前，需要单独审计的备份与显式 migration。
