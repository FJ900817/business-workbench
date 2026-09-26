# Agent Note：在生产执行前解析正式 XHS 真源

Status: implemented

[English](2026-09-01-business-xhs-production-source-adapter.md) | 中文

## 问题

已冻结的 XHS action 接受三个精确 input 与一个账号 Skill，但 Host 只能根据调用方提供的 fixture path 与 registry definition 构建这些 package。生产任务卡使用正式账号/月/周/note 目录模型，由另一张已确认系统二真源编译，并按 `note_type` 选择规则与样稿。四个正式 S3 位于 Vault 全局 `.agents` root，而不是 XHS Project root。让调用方或 Agent 搜索这些文件会允许歧义候选、归档 fallback、跨账号选择与静默真源变化。

## 决定

在 `dsh-business-workbench` 内增加一个 Host-owned production source resolver。通过 Vault root 配置它，并要求现有 `xhs` read root 等于该 Vault 下的固定 Project。只读取精确正式入口与基线，根据已校验的账号/月/周/note 推导任务卡路径，并校验任务卡的已确认系统二真源链路。使用维护中的 `yaml` package 解析 YAML 与 frontmatter，并拒绝重复 key。为三个 `note_type` 规则/样稿组合与四个账号 S3 保存完整的版本化 Host mapping。基线必须声明相同路径与当前 hash；不发现、不排序，也不 fallback 到其他文件。

通过现有 Business Skill snapshot 函数生成所选 S3 正文，不注册可发现 Skill。正式来源 hash/bytes 与模型可见正文 hash 分别保留。校验 S3 仍只声明四个已批准 input，使新增硬依赖在 package 创建前失败。

增加 `createXhsProductionExecutionPackage`，作为唯一 production package constructor。它固定 Workflow、三个精确 file、空 directory allow-list、`restricted-agent` capability 与一个账号 Skill。持久化一个不含正文内容的 source manifest，记录入口、基线、系统二真源链路、input route、S3 来源、adapter version 与 contract schema。Business storage schema 升至 version 4，无 migration 地拒绝旧介质。Package 验证重新读取原精确冻结来源；input/control/lineage 变化使用 `INPUT_DRIFT`，S3 变化使用 `SKILL_DRIFT`。

[source-bound production Agent route](2026-09-02-business-xhs-production-agent-route.zh.md)通过独立 policy 决策消费该 manifest。Resolver 自身不授权模型执行、Artifact 结算或 Obsidian 写入。

## 考虑过的替代方案

- 使用 filesystem Skill provider 与 registry discovery。否决，因为正式 S3 名称不是 logical id，生产 origin 必须精确，discovery 可能选择 shadowing 或无关候选。
- 把生产文件复制进 Business data root。否决，因为副本会创建第二真源并削弱 source drift 证据。
- 允许调用方传绝对路径。否决，因为调用方可以选择其他账号、归档、Project、规则类型或样稿。
- 只信任基线路径。否决，因为对调规则/样稿路径并同步 hash 会静默改变 `note_type` 语义；版本化 Host mapping 必须一致。
- 只保存三个 input hash。否决，因为正式入口、基线、系统二真源链路与 S3 完整文件身份会在重启后丢失。
- 在同一个变更中启用 production Agent route。否决，因为第一篇真实内容实验前，必须独立验证来源解析。

## 后果

一个 production Attempt 对选择其三个 input file 与 S3 Skill 的全部权威来源持有持久化证据。精确 retry identity 忽略观察时间但包含来源身份；来源变化要求另一个 Attempt 与 idempotency key。Agent 仍只接收 package 字节与 S3 snapshot，永远不获得 filesystem authority 或 Vault path lookup 机制。

根据仓库 pre-release policy，storage schema 3 数据有意与 schema 4 不兼容。部署必须使用隔离的 Phase 4C-0 data root，或显式重建非生产 Business state。Production execution 复用 version 4，并且必须在模型 I/O 前即时验证该 manifest。
