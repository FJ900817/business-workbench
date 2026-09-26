# Business Layer V0.1 Phase 4C-1R

[English](business-layer-v0.1-phase4c1r.md) | 中文

- **Version:** Phase 4C-1R
- **Date:** 2026-09-02
- **UI:** 未改变；无需截图

## Before

已完成但没有可见文本的 Business Agent turn 过去只产生一条通用 provider error string。因此历史 Phase 4C-1 记录只能证明提取文本与 tool call 均为 0，没有保留 finish reason、event count、token usage 或 extraction-stage 证据。Schema version `4` 下的单篇实验还必须使用四 Job Batch。

## After

Business Workbench 会把已完成的空输出分类为 `EMPTY_AGENT_OUTPUT`，并在即时 error 与现有持久 failure string 中记录不含正文的 event count、可用 completion 事实、Agent Run/Session identity、时长与 extraction stage。Reasoning-only 输出仍是错误，不存在 retry 或 fallback，schema version `4` 保持不变。

确定性 production-path fixture 覆盖 normal、empty、reasoning-only、multi-delta、provider-style reasoning+text 与 truncated response。一次真实 provider 安全 fixture 通过同一 production restricted runner 完成，tool call 为 0，且没有发送生产数据或写入生产状态。

## Still unresolved

历史 raw provider response 没有保留，因此其空输出精确原因仍然 unknown。当前成功 Session event 不暴露 provider response id。Schema version `4` 仍无法在没有 storage-model decision 的前提下如实表示独立单 Job 实验。

完整证据见 [Phase 4C-1R 实验记录](../experiments/business-layer-v0.1-phase4c1r-provider-output-recovery.zh.md)。
