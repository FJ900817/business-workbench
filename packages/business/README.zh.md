# Business 包

[English](README.md) | 中文

由 Host 持有的持久化业务状态，独立于 Chat Session 历史和模型执行。

| 包 | `ctx` key | 职责 |
|---|---|---|
| [`business-workbench`](business-workbench/README.zh.md) | `businessWorkbench` | Batch 创建、Business Job 状态与 CAS、不可变 Attempt 历史、Artifact 发布和重启恢复 |
