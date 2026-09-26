# Agent Note：XHS 正文标题与 P1 标题交接约定 V0.1

Status: implemented

[English](2026-09-11-xhs-title-pair-contract-v0.1.md) | 中文

## Problem

Business Workbench 的 XHS 正文终稿没有持久化 S15 所需的 `title_pair_contract`。任务卡、Hard Contract 投影和三文件正文输出 bundle 均不拥有全部五个字段，S15 也不得从正文或历史封面结果反向推断缺失值。账号 2 同时包含 `20分钟` 和 `4步`，但正式接口只有单数 `verified_number`。

S15 的 `source_note.schema.json` 还把 `title_pair_contract` 写在根对象 `properties` 之外，因此该对象不是有效的 JSON Schema 字段，也没有正式入口在执行前复算正文 SHA-256 或核对终稿标题。

## Decision

V0.1 保留 S15 已发布的五个字段名。人工确认正文终稿后，Workbench 创建独立的 `xhs-cover-handoff-v0.1` 不可变 Artifact，绑定正文路径和 SHA-256、终稿状态、`note_type`、五字段对象、逐字段来源、人工决策来源、创建时间以及 TaskCard lineage。交接不写回 Obsidian 正文，也不扩展正文三文件输出 bundle。

`verified_number` 是唯一允许优先进入 P1 的主数字。正文含多个数字时，上游选择最能增强点击理由和行动意愿的数字；步骤数、条目数和结构数量默认不进入该字段。两个数字同等级时必须先由上游人工确认，S15 不得临时选择。账号 2 经业务负责人确认使用 `20分钟`，`4步` 只用于内容结构和后续页面。

Workbench 在 Cover Plan 前验证正文 hash、`content_status=final`、`finalized_at`、唯一标题、完整五字段、标题逐字一致和数字证据。缺字段返回 `XHS_TITLE_PAIR_CONTRACT_MISSING`；hash、标题或数字冲突返回 `XHS_BODY_TITLE_P1_PAIR_FAILED`。

干货搜索型 Cover Plan 由 Host 固定为 `search_solution → Swiss → V2_1_Swiss_Purple_QingYa`，并固定 P1-P8 模板序列、共享 Swiss 标题容量、`SENSE / JUDGE / ACT` 节点以及仅 P5 一张图片的槽位。S15 的 schema 将五字段放回有效 `properties` 并列入根级 `required`，正式只读入口复算正文 hash 并核对标题和数字。

详细字段生命周期和账号 2 样板见[架构文档](../../../../docs/architecture/xhs-title-pair-contract-v0.1.zh.md)。

## Alternatives considered

**由 S15 从终稿推断。** 相同终稿会因模型或提示变化产生不同问题、答案和方向，也会让缺失的上游事实绕过阻断。

**把交接对象写回终稿或初次正文 bundle。** 标题配对值在人工终稿确认后才冻结；写回会修改内容真源，写入初次输出则会让 Revision 覆盖历史事实。

**把 `20分钟` 和 `4步` 拼成一个字符串。** 这会隐藏唯一主数字尚未裁决的问题，并让 P1 选择权泄漏到 S15。

## Consequences

S15 获得唯一、可追溯且可重放的正文交接输入；历史终稿默认不会自动补齐，必须逐篇人工裁决。正文或交接值变化会产生新的 Artifact，不能覆盖旧 Artifact。V0.1 只负责交接和 Cover Plan，不授权生图、渲染、合成或发布。
