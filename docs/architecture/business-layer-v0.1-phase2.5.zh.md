# Business Layer V0.1 Phase 2.5：生产就绪门禁

[English](business-layer-v0.1-phase2.5.md) | 中文

Phase 2.5 冻结首个正式生产 storage 基线，并通过机器本地 logical root 挂载小红书正式真源。本阶段不新增 Agent、模型请求、Workflow、Validation、UI、Skill enforcement 或 Obsidian writer。

## 生产审计

2026-08-30 部署前，生产 Harness home 中既不存在 `storages/business_workbench.json`，也不存在 `business-workbench/`。因此没有需要迁移的正式 Business Batch、Job、Attempt 或 Artifact。修改 Profile patch 之前，当前 Profile manifest、lockfile 与 patch 的 hash 均和 Stable V0 恢复清单一致，所以该恢复点仍然充足且保持不变。

正式 Obsidian Vault 是 `<PRIVATE_XHS_VAULT_ROOT>`。小红书任务卡、生产规则与产品真值全部位于 `<PRIVATE_XHS_VAULT_ROOT>/03 项目生态【生命体】/项目-小红书` 下。带 `_副本` 后缀的目录不是生产真源。

## Schema V1 基线

`BUSINESS_WORKBENCH_SCHEMA_VERSION` 保持为 `1`。Phase 2 已经引入 lease 与 execution-package 字段；在没有新结构变化时再次改版本只会制造第二套格式。Version 1 现正式冻结为 Business Layer V0.1 的首个生产 schema 基线。

空 domain 启动不会创建 Job。JSON backend 在第一次 Business mutation 时才惰性写入 domain 文档，该文档记录 `business_workbench` version 1。Schema 0 与所有未知版本都会 fail closed，且不修改原 storage 文件。本阶段没有 migration framework。

## 生产 Logical Roots

Host 配置现在使用固定 `readRoots` 槽位，不再要求一个人工拼装的目录：

| Logical prefix | 正式生产物理 root |
| --- | --- |
| `xhs/**` | `<PRIVATE_XHS_VAULT_ROOT>/03 项目生态【生命体】/项目-小红书` |
| `shared/product-truth/**` | `<PRIVATE_XHS_VAULT_ROOT>/03 项目生态【生命体】/项目-小红书/00_项目公共底座/01_产品库` |

XHS root 是同时容纳正式任务卡系统与生产规则系统的最小公共目录。产品库即使物理上位于 XHS Project 内，仍获得独立 logical name。Vault root、Desktop 与其他 Project 均未挂载。

`BusinessReadBoundary` 分别 canonicalize 每个已配置物理 root。请求必须先使用两个获准 logical prefix 之一，再在对应 canonical root 内解析、指向普通文件，并通过 symlink containment 检查。未配置的 logical root 以 `READ_DENIED` 失败。

## 最终读取门禁

属于 logical root 只是必要条件，并不足以获得读取权。`createExecutionPackage` 必须逐项声明输入，并通过精确文件或目录条目授权。Package 会冻结文件是否存在、byte count 与 SHA-256。`readExecutionInput` 只接受已经冻结的精确输入，验证当前执行 owner，并拒绝 drift。生产绝对路径不会进入持久化 package 或未来 Agent 输入。

有效路径为：

`Production source -> logical-root resolver -> Execution Package allow-list -> exact frozen input`

## Production Assembly

Web bundle 在 `storage-domain` 之后挂载 `@deepseek-ai/dsh-business-workbench`，并设置 30 秒 lease 策略。机器相关 root 位于 `<PRIVATE_DSH_HOME>/profiles/web/cordis.patch.yml`，该层会完整替换 Business row config。Package 仍为 Host-only，不会启动任何业务工作。Runtime 启动可以初始化私有 Artifact 目录并打开空 storage domain，但不会创建 Batch 或 Job，也不会扫描 Obsidian。

## 验证

临时目录测试覆盖 schema-v1 首次持久化与重启、schema-0 与未知版本拒绝、独立 logical-root 解析、获准任务卡/规则/产品真值读取、未挂载 logical root、未列出文件、无关 Project、traversal、POSIX 与 Windows absolute path、symlink escape、input drift、lease、重启恢复、Batch 隔离与 Artifact 完整性。现有 Phase 1 与 Phase 2 套件均在 schema v1 下运行。

生产验证通过同一 resolver 打开精确的正式任务卡、账号规则与产品真值路径，不输出正文内容，并对比前后 metadata 与 hash。built Host 载入生产 Profile 后，在 loopback 3080 检查 Runtime health。任何测试都不会创建正式 Business Job。

## 剩余风险与 Phase 3 前置条件

- JSON backend 对一个 `DSH_HOME` 仍只允许一个 Runtime writer。
- `allowedCapabilities` 与 `allowedSkills` 在 Phase 3 加入 Host-side enforcement 前仍只是声明。
- 生产 root 属于部署配置；Vault 改名或移动后，Runtime 会 fail loud，直到 Profile patch 更新。

只有 schema v1、两个生产 root、Execution Package 读取门禁、Runtime health 与 Obsidian 零写入规则继续成立时，才可以进入 Phase 3。
