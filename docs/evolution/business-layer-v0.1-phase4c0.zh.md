# Business Layer V0.1 Phase 4C-0

[English](business-layer-v0.1-phase4c0.md) | 中文

- **版本：** Phase 4C-0
- **日期：** 2026-09-01
- **UI：** 未变化；无需截图

## Before

Phase 4B 的 `xhs-body-prepare-v0` 只能使用安全 fixture input 与 runtime fixture Skill。正式任务卡、V3.0 规则、黄金样稿和账号 S3 没有确定性 Host adapter。调用方无法在不手工提供路径的情况下构建 production-source package，持久化 package 也不记录正式入口与基线身份。

## After

Host 现在根据账号/月/周/note 解析一个精确生产槽位，校验正式入口、基线、已确认任务卡与系统二真源链路，按正文类型路由唯一规则和样稿，并生成唯一账号 S3 snapshot。Package 持久化不含正文内容的来源证据，并拒绝后续 input 或 Skill drift。Assembled snapshot 记录 adapter version `xhs-production-source-v1`、contract schema `1`、精确 route table、零 discovery 与零 fallback。

唯一一次真实只读 dry run 解析了 `account1 / 2026-08 / 第01周 / note002`，并校验全部四项真源。它使用临时 DSH home，在 Agent 执行前停止，没有创建正文、Artifact、output bundle、生产 Job 事实或 Obsidian 写入。

## 仍未解决

生产 Agent 执行仍关闭。Phase 4C-1 仍需显式单 Job `production` route、模型调用前即时来源复验、production S3 origin policy 与人工审核流程。Validation、Human Gate UI、四 Job 生产、finalization 和 Obsidian promote 继续延期。

完整设计与 dry-run 证据见 [Phase 4C-0 架构记录](../architecture/business-layer-v0.1-phase4c0.zh.md)。
