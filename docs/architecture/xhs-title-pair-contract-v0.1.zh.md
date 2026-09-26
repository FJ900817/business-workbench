# XHS 正文标题与 P1 标题交接约定 V0.1

[English](xhs-title-pair-contract-v0.1.md) | 中文

本文定义 Business Workbench 从 S3 正文终稿向 S15 封面系统交付 `title_pair_contract` 的正式接口。V0.1 已实现独立、不可变且绑定正文 SHA-256 的终稿交接 Artifact；原始 Obsidian 正文继续作为内容真源，不因交接而被覆盖。对应决策记录在 [implemented Agent Note](../../.agents/notes/implemented/architecture/2026-09-11-xhs-title-pair-contract-v0.1.zh.md) 中。

## 问题背景

账号 2 正式终稿具有 `content_status: final` 和 `finalized_at`，但 YAML 没有 `title_pair_contract`。S15 不能从正文、任务卡或历史封面方案补写语义字段，因此旧回放以 `TITLE_PAIR_CONTRACT_MISSING` 和 `XHS_BODY_TITLE_P1_PAIR_GATE_BLOCKED` 停止。

V0.1 不修改该终稿，也不扩展正文三文件 bundle。Workbench 通过一份由人确认的独立交接 Artifact 冻结五字段、正文路径及 hash、状态、定稿时间、字段来源、决策来源、创建时间和 lineage；S15 只读消费并快速失败。

## 正式 Schema

V0.1 保留 S15 已发布的字段名和类型。`verified_number` 继续为单数字段，允许 integer、string 或 null，不改名为 `verified_numbers`。

```yaml
title_pair_contract:
  body_title: string
  core_problem_or_object: string
  core_answer_or_judgment: string
  verified_number: integer | string | null
  p1_title_direction: string
```

五个键必须全部存在；除 `verified_number` 可为 null 外，其他值均为非空字符串。`body_title` 必须与终稿标题逐字一致且不超过 20 个 Unicode code point。非 null 的 `verified_number` 必须能在终稿中逐字找到。S15 不得补字段、改字段或从正文推断字段。

## 字段来源

| 字段 | 业务含义 | 唯一来源 | 首次生成阶段 | 最终冻结阶段 | 缺失行为 |
|---|---|---|---|---|---|
| `body_title` | 最终正文发布标题 | 人工确认的 S3 终稿标题 | S3 正文生成 | 终稿交接 Artifact | `BLOCK` |
| `core_problem_or_object` | 本篇解决的问题或对象 | 系统二独立任务真值；存量迁移须逐篇人工裁决 | 系统二任务真值 | 正式任务卡确认；存量样本为迁移裁决 | `BLOCK` |
| `core_answer_or_judgment` | 本篇最终答案或核心判断 | 系统二独立任务真值；存量迁移须逐篇人工裁决 | 系统二任务真值 | 正式任务卡确认；存量样本为迁移裁决 | `BLOCK` |
| `verified_number` | 唯一允许优先进入 P1 的主数字 | 已确认任务真值与终稿共同证明的人工裁决 | 任务真值提供数字证据 | 终稿交接 Artifact | `BLOCK` |
| `p1_title_direction` | S15 生成 P1 标题的一条语义方向 | S3 终稿阶段形成并经人确认；存量迁移须逐篇人工裁决 | S3 终稿阶段 | 终稿交接 Artifact | `BLOCK` |

S3 负责复制标题、核对来源并形成交接；S15 负责只读消费。消费阶段不允许 AI 推断任一字段。当前账号 2 是经业务负责人明确裁决的存量迁移样本，不构成旧终稿自动回填规则。

## `verified_number` 正式规则

`verified_number` 是唯一允许优先进入 P1 封面标题的主数字。正文存在多个数字时，选择最能增强用户点击理由和行动意愿的主数字；步骤数、条目数和结构数量默认属于内容结构数字，不进入该字段。两个数字若具有同等主数字等级，必须在上游正式确认后才可进入封面生产，S15 不得临时选择。

账号 2 的 `20分钟` 是低门槛行动抓手，因此为 `verified_number`；`4步` 是内容结构数字，可在正文和后续页面使用，但不是 P1 主数字。

## 字段生命周期与 Gate

系统二业务真值依次投影到正式任务卡和写作任务卡；S3 正文生产与人工定稿完成后，交接 Artifact 绑定正文精确 SHA-256。任一正文、标题配对值或 lineage 变化都必须生成新的 Artifact，不得覆盖旧 Artifact。

Workbench 先验证正文 hash、`content_status=final`、`finalized_at`、唯一标题和五字段完整性，再验证标题逐字一致及数字证据。缺字段返回 `XHS_TITLE_PAIR_CONTRACT_MISSING`；hash、标题或数字冲突返回 `XHS_BODY_TITLE_P1_PAIR_FAILED`。通过后 Cover Plan 才能执行固定路由和 P1-P8 校验。

S15 的 `source_note.schema.json` 把 `title_pair_contract` 置于根对象 `properties` 并列入根级 `required`。正式 `validate-source-note` 入口会读取源文件，复算 SHA-256，核对终稿标题和数字证据；缺失或冲突时不生成 P1。

## 账号 2 正式样板

```yaml
title_pair_contract:
  body_title: "设计师审美提升难？每天20分钟分4步练"
  core_problem_or_object: "想提升设计审美，但不知道每天练什么、怎么练、练多久。"
  core_answer_or_judgment: "审美提升不是漫无目的地看素材，而是按“看、拆、存、仿”建立每天可执行的训练步骤，重点训练判断能力。"
  verified_number: "20分钟"
  p1_title_direction: "突出“想提升审美但不知道怎么练”的核心痛点，以“每天20分钟”作为低门槛行动抓手，强调这是可执行的审美训练方法；“4步”作为方法结构，不作为P1主数字。"
```

该对象的决策来源是 2026-09-11 的人工业务裁决；`body_title` 来源是 SHA-256 为 `17bd8f59aaba0c88e8ec333e2bfb67e15f6c2eaff0977359bcf28f80fb04f5e3` 的正式终稿。它不写回原正文。

## 上游改造影响

| 层级 | V0.1 状态与后续最小改造 |
|---|---|
| 系统二 | 新任务应保存独立问题、答案和主数字裁决；账号 2 通过存量人工裁决过渡 |
| 正式任务卡 | 新任务应携带独立机器值及来源；本轮不修改账号 2 任务卡 |
| 系统一写作任务卡 | 新任务应逐字投影新增值；本轮不重编译账号 2 |
| S3 | 新终稿应在人工确认时形成交接值；本轮不修改正文或正文生成输出 |
| Workbench | 已实现五字段 schema、hash 绑定、不可变交接 Artifact、固定 Swiss 路由和 P1-P8 Gate |
| S15 | 五字段接口和视觉规则不变；只修复有效 schema 位置并增加严格只读校验入口 |

## 实施状态

`title_pair_contract` V0.1 为 `READY`。该状态表示字段接口、主数字规则、严格 Gate 和账号 2 的显式迁移值均已落地；它不表示所有历史终稿已迁移，也不授权生图、渲染、合成或发布。
