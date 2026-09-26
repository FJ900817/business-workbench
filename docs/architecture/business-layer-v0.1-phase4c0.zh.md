# Business Layer V0.1 Phase 4C-0：生产来源适配门禁

[English](business-layer-v0.1-phase4c0.md) | 中文

Phase 4C-0 定义当前正式 XHS Vault 真源到冻结 Business execution package 的确定性 Host 桥梁。它解析一张已确认任务卡、任务卡所选 V3.0 写作规则与黄金样稿，以及账号 S3 Skill。Resolver 自身不调用 Agent、不生成 draft、不提交 Artifact、不写 Obsidian、不增加 UI，也不修改 Harness Core。

## 生产权威来源

部署配置提供唯一 `vaultRoot`；`readRoots.xhs` 必须 canonicalize 到该 Vault 下固定的 XHS Project。Adapter 首先读取精确的 `00_小红书单篇正式生产入口.md` 与 `00_小红书正式生产运行基线.yaml`。入口必须为 `正式`，入口版本必须与编译任务卡一致，基线必须指向这个精确入口。Adapter version 为 `xhs-production-source-v1`，持久化 contract schema 为 `1`。

Resolver 只接受 `account`、`productionMonth`、`productionWeek` 与 `note`，校验其封闭格式后，按正式目录模型推导唯一 `写作任务卡.md` 路径。它不列目录，也不接受候选路径。任务卡必须为 `已确认`，四个请求字段必须全部一致，并声明 `task_id`、`topic_id` 与受支持的 `note_type`；任务卡还必须指向一个精确系统二真源。系统二真源必须仍为已确认，其 hash 必须等于 `source_task_sha256`，账号、task、topic 与正文类型必须与编译任务卡一致。

## 精确路由

| 任务卡 `note_type` | Host 值 | V3.0 写作规则 | 黄金样稿 |
|---|---|---|---|
| `干货搜索型（dry_search）` | `dry-search` | `干货搜索型选题创作规范_V3.0.md` | `01_干货搜索型/02_黄金样稿.md` |
| `干货推荐型（recommendation）` | `recommendation` | `干货推荐型选题创作规范_V3.0.md` | `02_干货推荐型/02_黄金样稿.md` |
| `热点流量型（hot_traffic）` | `hot-traffic` | `热点流量型选题创作规范_V3.0.md` | `03_热点流量型/02_黄金样稿.md` |

Host mapping 保存完整 Project-relative path。基线必须包含相同 mapping，且其 hash 必须匹配当前字节。缺失类型、路径对调、字节变化、Project 逃逸、归档路径、重复 YAML binding 或不支持的语法都会 fail closed。系统不做模糊匹配、替代版本查找或 fallback。

| 账号 | Logical Skill id | 精确 Vault-relative 来源 | Provider |
|---|---|---|---|
| `account1` | `xhs-s3-account1` | `.agents/skills/S3-笔记写作-账号1/SKILL.md` | `business-xhs-production-v1` |
| `account2` | `xhs-s3-account2` | `.agents/skills/S3-笔记写作-账号2/SKILL.md` | `business-xhs-production-v1` |
| `account3` | `xhs-s3-account3` | `.agents/skills/S3-笔记写作-账号3/SKILL.md` | `business-xhs-production-v1` |
| `account4` | `xhs-s3-account4` | `.agents/skills/S3-笔记写作-账号4/SKILL.md` | `business-xhs-production-v1` |

S3 adapter 校验基线路径与完整文件 hash、正式 frontmatter name，以及声明的四个输入：当前任务卡、本 Skill、一个 V3.0 规则和一个黄金样稿。新增编号依赖会作为 contract 缺口被拒绝。Adapter 从模型可见 Skill 内容中移除 S3 frontmatter，通过 Phase 3 现有 Skill snapshot 实现冻结精确正文，并记录来源 hash、bytes、账号、正式名称、origin、provider、解析时间、snapshot hash 与路由原因。它不注册可发现 Skill，也不修改 Skill Registry。

## Package 证据与漂移

`createXhsProductionExecutionPackage` 独占 package 声明权。调用方不能提供来源路径、read root、capability 或 Skill。Package 恰好包含三个 allowed file、零 allowed directory root、`restricted-agent` 与一个映射 S3 id。它还持久化不含正文内容的 production-source manifest，记录正式入口、基线、系统二真源链路、解析后的任务身份、三个 input route 与 S3 来源身份。Storage schema version `4` 无 migration 地拒绝 version 0 到 3。

Package 创建通过现有 read boundary 冻结每个 input，并将其 hash 与大小和刚解析的 route 对比，从而关闭 resolution 到 package 之间的竞态。验证只重新读取原精确路径，不解析替代来源。入口、基线、系统二真源、任务卡、规则或样稿变化产生 `INPUT_DRIFT`；S3 删除、来源变化或 snapshot 变化产生 `SKILL_DRIFT`。使用新来源必须新建 Attempt 与 package。

Package 虽持有来源字节，Restricted Agent 仍不能读取 Vault。独立 `production` route 只消费这些冻结字节与来源证据，不发布 filesystem 或 discovery tool，并保留 deny-all executor。

## 真实生产来源 dry run

唯一一次只读运行使用 `account1 / 2026-08 / 第01周 / note002`，task 为 `T-A1-20260809-002`，topic 为 `C003`，类型为 `dry-search`。运行使用临时 DSH home，并在 resolve、snapshot、package build、Skill snapshot 与 manifest verification 后停止。

| Role | 结果 | SHA-256 | Bytes | 路由原因 |
|---|---|---|---:|---|
| `taskCard` | 已解析 | `68bdac0f442e6d9601263a26376c1595adae4bc2063cadcb9dc66d531f323432` | 6561 | 精确请求槽位；已确认 |
| `writingRule` | 已解析 | `e6ec8d256365c9dd4ce5b693c75aeef416a3b6b36abd8194677ee8ad0b5c894a` | 3058 | `dry-search` 精确 V3.0 route |
| `goldenSample` | 已解析 | `506e3b78b25610ea37b03a0aba96e95734f40c2983a4349e4c0232da82f3b57e` | 3230 | `dry-search` 精确正式样稿 route |
| 账号 S3 | 已解析 | `e718198d57caf4f6fe25b8ba617fad5fe4c4b804b59c49d04dca02535cbd50a7` | 4795 | `account1` 精确正式 S3 route |

正式入口、基线与系统二真源链路也完成了 hash 校验。该运行没有加载 Agent、LLM、tool 或 Session，也没有调用 Artifact writer；没有产生正文、Agent Run、output bundle 或 Artifact，且没有写生产 Vault。

## 失败覆盖

Keyless 测试拒绝错账号、不存在 note、未确认任务卡、错误任务卡账号或 `note_type`、缺失或对调规则、缺失或对调黄金样稿、错误/缺失/归档 S3、重复基线 binding、任务卡移动、S3 修改与 Project 逃逸。Package integration 校验 schema persistence、精确 manifest、空 Agent Run history 与零 Artifact reference。现有 Phase 1 到 Phase 4B 测试继续覆盖 lease、recovery、read policy、Skill snapshot、restricted tools、output settlement 与 fixture action 行为。

## Phase 4C-1 交接条件

`production` route 消费持久化 source manifest，在模型 I/O 前再次校验全部来源，只接受本 adapter 的正式 S3 origin，保留空工具集合，并且只提交 `intermediate` bundle。Phase 4C-1 实验可以执行一个经明确批准的 Job，随后停止并等待人工审核，不得 finalization 或 Obsidian promote。四 Job 生产、自动 Validation、Human Gate UI 与 promote 仍不在范围内。

Harness Core、AgentLoop、WorkflowEngine、Skill Registry、Workspace、Session、LLM Core、生产 Obsidian 文件与 Restricted Agent tool boundary 均未修改。
