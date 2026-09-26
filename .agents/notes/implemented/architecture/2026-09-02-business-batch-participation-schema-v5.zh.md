# Agent Note：在 Schema V5 记录精确 Business Batch 参与语义

Status: implemented

[English](2026-09-02-business-batch-participation-schema-v5.md) | 中文

## 问题

Business Schema V4 为每个 Batch 分配四个 Job。调用方可以只执行第一个 Job，但持久 Batch 无法区分这个参与者与三个未使用占位 Job。审计要求保留原始 Job；把四个都计为生产参与者又会污染未来质量和 Throughput metrics。新的单篇实验还必须在不削弱四 Job 隔离路径的前提下，只持久化一个 Job。

## 决策

把 Business storage domain 升级到 V5，并增加封闭 Batch mode：`single`、`quad` 与 migration-only `legacy-fixed4`。新 `single` Batch 拥有一个 input、一个 stored Job 与一个 participant。新 `quad` Batch 拥有四个 input、四个 stored Job 与四个 participant。`legacy-fixed4` 持有 V4 实际创建的四个 Job，并单独记录一或四个 participant id。公开 participation projection 只向未来 metrics consumer 暴露这些 id 与封闭数量。

只提供一条显式 V4→V5 JSON migration script，不在启动阶段迁移，也不建设 migration framework。它校验完整 V4 graph，只接受具有持久参与证据的一或四个 Job，要求已批准源 hash，通过 atomic sibling rename 发布并校验目标 hash。歧义证据会在发布前失败。普通 V5 启动仍原样拒绝 V4。

保留每个 V4 Batch 与 Job 字段。Migration 只能向 Batch 增加 `mode` 与 `participatingJobIds`，并推进 unit version。历史占位 Job 仍是 stored Job，继续通过 `listJobs` 可见；只有 participation projection 会排除它们。

Schema V5 在第一轮 1 → 4 → 12 → 20 质量实验期间冻结。后续 storage 变更必须针对数据损坏或阻断性数据模型缺陷单独审批。

## 考虑过的替代方案

- **删除 V4 占位 Job。** 拒绝，因为这会改写已记录实验，并使 id、计数和审计证据失效。
- **每次计算 metrics 时推断参与者。** 拒绝，因为未来代码可能对同一持久历史应用不同 heuristic。
- **允许任意 N Job Batch。** 拒绝，因为当前业务需求只有一或四，通用调度不会为实验增加价值。
- **Runtime 启动时自动 migration。** 拒绝，因为生产迁移要求已验证恢复点、精确源 hash、独占 writer 停机与 operator 批准。

## 结果

单篇执行不再创建空 Job，四篇隔离行为不变。迁移后的历史语义明确并可安全用于 metrics，同时不会伪称原 storage 只有一个 Job。V5 Runtime 打开 V4 前必须完成唯一 operator migration。Migration 有意拒绝含零、二或三个证据参与者的 legacy Batch。

本次变更只涉及 `dsh-business-workbench`、生成 API 文档与 Business records。它不增加 Workflow、Validation、Human Gate、UI、Obsidian writer、自动 retry 或 Harness Core 行为。
