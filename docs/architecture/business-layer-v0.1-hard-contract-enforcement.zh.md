# Business Layer V0.1：XHS 硬合同执行

[English](business-layer-v0.1-hard-contract-enforcement.md) | 中文

Phase 4C-3C 为 `xhs-body-prepare-v0` 增加确定性 TaskCard 投影与 L1 Validation。改动只位于 `dsh-business-workbench`；schema version 5、生产 source resolver、S3 adapter、text-first output policy、model policy、Harness Core 与 Obsidian 均保持不变。

## Execution Contract Projection

`projectXhsExecutionContract()` 读取执行包中已经冻结的 TaskCard。它只抽取明确的机器可读值：note type、标题与正文范围、精确关键词及要求位置、正文结构条目、产品模块、置顶与非置顶评论数量、话题数量，以及明确包含禁止要求的行。缺少必需字段或字段相互冲突时，在模型 I/O 前以 `XHS_BODY_INPUT_INVALID` 失败。

投影不解释创作意图，也不从 writing rule、golden sample、S3 Skill 或历史输出推断规则。所选 XHS route 必须与投影的 note type 一致。

## 模型可见 Checklist

`renderXhsExecutionChecklist()` 将投影渲染为 restricted user instruction 末尾的 `【本篇执行硬合同】`。Checklist 只重复 TaskCard 值，并说明 Host 计数而非模型自报计数是权威事实。它不增加创作方法、语义标准、filesystem 权限、工具、Skill 或模型选择。

## 确定性 L1 Validation

`validateXhsDraft()` 读取未修改的 Markdown 输出。`countXhsFullCharacters()` 对提取出的标题和正文按 Unicode code point 计数。模型自报标题与正文字数保留为独立可空观测，绝不参与判定。

L1 检查标题/正文范围、关键词最低精确总次数、TaskCard 明确要求时的标题关键词、置顶/非置顶评论数量与 hashtag 数量。关键词证据记录完整 Draft 中的 code-point offset。TaskCard 尚未定义机器 segment 边界，因此开头、中段与末尾位置不作机器结论；正文结构含义、产品模块含义与文本禁止项同样延期。

任一确定性检查失败时结果为 `FAIL`。没有失败但仍有 deferred check 时结果为 `WARN`。只有投影中的检查全部可机器验证并通过时才返回 `PASS`。Validation 不修改 Draft 字节、不发起第二次模型请求，也不启动 Revision。

## 持久化与恢复

每次新的 XHS Agent 成功都会构建三文件 intermediate output bundle 与一份以换行结尾的 JSON `validation` Artifact。Host 在一次 Job compare-and-swap 前写入两组不可变字节；该状态更新同时绑定 bundle、完成 Agent Run 并绑定 Validation Artifact。compare-and-swap 失败遗留的字节仍是非权威 orphan，可由 reconciliation 发现。

Validation Artifact 记录 schema version 5、Job/Attempt/package/bundle identity、验证时间、精确投影、Draft SHA-256、确定性事实、检查结果、关键词证据、deferred check 与最终状态。它使用现有 Artifact reference array 与存储路径，因此 Business Job schema 不变。幂等 Agent replay 返回既有结果，不产生第二次 Provider 请求或第二份 Validation Artifact。Runtime 启动会在恢复执行前验证已引用 Artifact 字节。

## 四样本 Replay

只读 replay 对每个 authoritative Draft 使用其冻结正式 TaskCard，并在验证前后检查 source hash。

| Sample | 标题 | 正文 | 评论 | 话题 | L1 结果 |
|---|---:|---:|---|---|---|
| 01 | 20 / 18–20 `PASS` | 598 / 700–800 `FAIL` | `PASS` | `PASS` | `FAIL` |
| 02 | 16 / 18–20 `FAIL` | 485 / 400–600 `PASS` | `PASS` | `PASS` | `FAIL` |
| 03 | 16 / 18–20 `FAIL` | 967 / 700–800 `FAIL` | `PASS` | `PASS` | `FAIL` |
| 04 | 19 / 18–20 `PASS` | 570 / 400–600 `PASS` | `PASS` | `PASS` | `WARN` |

Sample 01 还未达到主关键词最低次数，并缺少标题关键词。其余样本满足最低精确出现次数证据；非标题位置仍为 deferred。四份 Draft SHA-256 均保持不变。

下表 offset 使用从完整 Draft 开始的 Unicode 码点位置。标题要求的 `PASS` 只表示已经证明标题中的精确出现；开头、中段和末尾要求仍延后判定。

| Sample | 关键词 | 要求位置 | 精确出现次数 | 码点 offset | 确定性证据 |
|---|---|---|---:|---|---|
| 01 | 设计留白技巧 | 标题×1 / 开头×1 / 中段×1 | 2 | 109, 960 | 最低次数 `FAIL`；标题 `FAIL`；开头/中段 deferred |
| 01 | 审美判断力 | 中段×1 | 2 | 381, 909 | 最低次数 `PASS`；中段 deferred |
| 01 | 设计审美 | 中段×1 | 2 | 559, 916 | 最低次数 `PASS`；中段 deferred |
| 01 | 自检 | 末尾×1 | 6 | 16, 611, 709, 740, 901, 922 | 最低次数 `PASS`；末尾 deferred |
| 02 | 灵感网站 | 标题×1 / 开头×1 / 中段×1 | 3 | 13, 63, 737 | 最低次数 `PASS`；标题 `PASS`；开头/中段 deferred |
| 02 | 设计审美 | 开头×1 / 中段×1 | 2 | 452, 743 | 最低次数 `PASS`；开头/中段 deferred |
| 02 | 设计师审美提升 | 末尾×1 | 2 | 535, 749 | 最低次数 `PASS`；末尾 deferred |
| 03 | 设计风格形成 | 标题×1 / 开头×1 / 中段×1 | 5 | 2, 116, 344, 788, 1254 | 最低次数 `PASS`；标题 `PASS`；开头/中段 deferred |
| 03 | 设计审美 | 开头×1 / 中段×1 | 3 | 184, 543, 1262 | 最低次数 `PASS`；开头/中段 deferred |
| 03 | 设计师审美提升 | 末尾×1 | 2 | 891, 1268 | 最低次数 `PASS`；末尾 deferred |
| 04 | 观夏设计 | 开头×1 / 中段×1 | 2 | 148, 923 | 最低次数 `PASS`；开头/中段 deferred |
| 04 | 设计审美 | 中段×1 | 2 | 493, 935 | 最低次数 `PASS`；中段 deferred |
| 04 | 方法论 | 末尾×1 | 2 | 513, 941 | 最低次数 `PASS`；末尾 deferred |

## 延期范围

本阶段不定义开头/中段/末尾 segment，不实现语义 Validation、Human Gate、Revision、approved final asset 或 Obsidian promotion。本阶段不为四份历史样本追写 Validation Artifact；它们只作为只读 replay 证据。扩展到十二样本前，应先用新的 verification set 验证 checklist 与原子 Validation 持久化。
