# Business Layer V0.1 Phase 4C-1：第一篇真实正文首稿实验

[English](business-layer-v0.1-phase4c1-first-real-draft.md) | 中文

## 实验结论

本次工程实验无效，未进入 First-Pass Quality 人工评价。唯一真实模型请求在规范化 assistant message 没有产生可提取文本后以 `PROVIDER_ERROR` 结束。Raw provider response 没有保留，因此本记录无法判断 response 本身是否为空。系统没有重试，没有生成 draft，没有提交 output bundle 或 Artifact，也没有写入 Obsidian。失败状态、Execution Package 与 Agent Run 已持久化，保留为本次实验记录。

## 实验身份

| 字段 | 值 |
|---|---|
| 时间 | 2026-09-02 19:52:22–19:52:48 +08:00 |
| account / month / week / note | `account1 / 2026-08 / 第01周 / note002` |
| task / topic / note type | `T-A1-20260809-002 / C003 / dry-search` |
| software HEAD | `605ce8412600d7a614154f57fb87aafe42c2e15a` |
| Business schema | `4`，本轮未变更 |
| action | `xhs-body-prepare-v0` |
| resolver | `xhs-production-source-v1`，contract schema `1` |
| provider / model / reasoning | `deepseek-official / deepseek-v4-flash / low` |
| max tokens | `4096` |
| comparison mode | `architecture + model mixed` |

## 冻结来源

模型请求前重新完成正式来源解析、hash、Execution Package 冻结与 drift verification。运行后只读复核仍得到相同来源 hash；没有 `INPUT_DRIFT` 或 `SKILL_DRIFT`。

| Role | SHA-256 | Bytes |
|---|---|---:|
| `taskCard` | `68bdac0f442e6d9601263a26376c1595adae4bc2063cadcb9dc66d531f323432` | 6561 |
| `writingRule` | `e6ec8d256365c9dd4ce5b693c75aeef416a3b6b36abd8194677ee8ad0b5c894a` | 3058 |
| `goldenSample` | `506e3b78b25610ea37b03a0aba96e95734f40c2983a4349e4c0232da82f3b57e` | 3230 |
| account1 S3 source | `e718198d57caf4f6fe25b8ba617fad5fe4c4b804b59c49d04dca02535cbd50a7` | 4795 |

持久化的 S3 model-visible snapshot hash 为 `b2d26ffefa0fd5cdcd919f63acda49aeed057ae5488d01a689ff3c3f4ded3261`，Execution Package id 为 `package_214d8cadc3f0b02abf8cd123626f709de0643c64a239901663165d75dcb07b43`。Restricted Agent 只获得这四项冻结输入，不获得 filesystem、bash、Workspace scan、Skill discovery 或 subagent tool。

## 持久状态

Business Batch `a4367ad7-bf81-4db6-aea9-130d6fe3b4d5` 包含 V4 服务要求的四个槽位。真实 Job `c18e86fb-90eb-40ff-bbe1-85cb8015951f` 的唯一 Attempt `0d5b9c35-fafd-48f8-a592-33620c10cdfe` 已终止为 `failed`；另外三个禁用占位 Job 保持 `draft`，没有 Attempt 或 Artifact。没有发生四篇正文生产，但单篇实验仍需要四槽 Batch 容器，这是当前 V4 限制。

Agent Run `agent_run_b2aa6b31c011d7dc5e77a98e38ecd6c41044bb8c5287a873b6f1e55dafa03bd6` 的失败码为 `PROVIDER_ERROR`，失败原因是 `business-workbench: restricted Agent produced no text output`。运行先完成 session tool-call 检查才检查文本输出；因此该失败语义同时证明 tool call 数为 `0`。Attempt 的 `outputBundle` 为 `null`，Job 的 `artifactRefs` 为空，未产生重复结果或孤立 Artifact。

## 性能与工程结果

| 指标 | 结果 |
|---|---:|
| 成功内容生成 | 0 |
| 真实模型请求 | 1 |
| transport retry | 0 |
| Agent Run duration | 26,196 ms |
| total Job duration | 26,305 ms |
| first response | unavailable |
| token usage | unavailable |
| structural bundle time | not applicable |
| 越权 | 0 |
| 生产 Obsidian 写入 | 0 |
| 工程错误 | 1：规范化 assistant output 的可提取文本为 0；raw 原因未知 |

Execution Package build time 与 Skill snapshot time 原计划作为成功报告的瞬态指标写出；请求在报告提交前失败，因此本次没有可靠持久值，不从时间戳反推。旧系统 baseline 存在于 `account1/2026-08/第01周/note002/小红书笔记完整方案.md`，正文未读取，运行后的文件 mtime 仍为 `2026-08-19T22:24:36+08:00`。该 baseline 未进入 Package 或 Prompt。

## Draft Artifact

不存在。没有 `draft.md`、`draft-metadata.json` 或 `provenance.json`，因此没有可评价正文，也不能宣称 output provenance 完整。Execution Package 中的来源 provenance 已完整保存。

## Human review placeholder

`First-Pass Review` 不启用。本次是工程失败，不应填写“直接通过、轻微修改、明显重写或完全不合格”，也不应启动 Revision。

## 下一步

本轮在失败点停止，不修改 S3、Workflow、Resolver、Prompt、Golden Sample、Model、Schema 或 Action，不重试正文生成。[Provider output 恢复实验](business-layer-v0.1-phase4c1r-provider-output-recovery.zh.md)记录了证据限制与为后续运行新增的诊断路径。生产 retry 仍需重新获得授权。本记录不能计入 First-Pass Quality 样本。
