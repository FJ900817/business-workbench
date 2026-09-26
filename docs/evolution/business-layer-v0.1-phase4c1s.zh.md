# Business Layer V0.1 Phase 4C-1S

[English](business-layer-v0.1-phase4c1s.md) | 中文

- **版本：** Phase 4C-1S
- **日期：** 2026-09-02
- **UI：** 未改变；无需截图

## Before

Schema V4 永远创建四个 stored Job。第一次单篇实验因此留下三个零 Attempt、零 Artifact 占位 Job；如果把它们当成参与者，后续质量 metrics 会失真。生产 storage 中已经存在一个失败历史 Batch，不能删除或改写。

## After

Schema V5 提供封闭的 `single`、`quad` 创建模式和 migration-only `legacy-fixed4`。新 `single` Batch 只创建一个 Job；`quad` 保留四 Job 隔离。显式参与投影把 legacy 占位 Job 排除在未来 metrics 之外，同时保留全部历史 Job 与失败事实。

生产 V4 已先备份，再通过 hash-gated operator path 显式迁移，由 Mac App 重新打开并返回 HTTP 200。一次 17,644-byte synthetic 真实 provider smoke 通过临时 single Batch 完成，tool call 为 0，未发送生产数据。没有读取或写入生产正文与 Obsidian 资产。

## 仍未解决

真实 `note002` 正文尚未 Retry。Validation、Human Gate、Revision、Finalize、Promote、任意 Batch 数量、多 Runtime 写入与自动 migration 均不在范围内。Schema V5 在 1 → 4 → 12 → 20 质量实验期间冻结。

完整 migration 与 recovery 证据见 [Phase 4C-1S 架构记录](../architecture/business-layer-v0.1-phase4c1s-single-job-schema-v5.zh.md)。
