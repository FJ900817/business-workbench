# Agent Note：通过 Logical Roots 挂载生产业务输入

状态：implemented

[English](2026-08-30-business-production-read-roots.md) | 中文

## Problem

Phase 2 resolver 要求一个包含 `xhs/` 与 `shared/product-truth/` 的人工物理目录。正式 Obsidian Vault 已有稳定的中文目录结构，不能移动或复制。把整个 Vault 或 Desktop 作为宽泛 root 会削弱 Project 隔离；在 execution package 中暴露生产绝对路径则会让持久化 Job 绑定单台机器。

在任何真实 Business 数据产生前，还必须明确 schema 1 的正式生产采用决定。

## Decision

用固定 `readRoots.xhs` 与可选 `readRoots.sharedProductTruth` 槽位替换单一 `readRoot` 配置。持久化路径与调用方可见路径继续使用 logical `xhs/**` 和 `shared/product-truth/**` prefix。分别 canonicalize 每个物理 root，并在选定 logical root 后执行 containment、普通文件与 symlink 检查。

生产 Profile 将正式 XHS Project 配置为 `xhs`，将其中的产品库配置为 `sharedProductTruth`。Execution Package 的精确 file/root 声明继续作为最终授权门。不挂载完整 Vault，不枚举真源目录，不创建生产 Job，也不新增 Obsidian writer。

将 storage schema 1 冻结为 Business Layer V0.1 的首个生产基线。生产环境没有既有 Business domain 或 Artifact 数据，JSON backend 对 schema 0 与未知版本继续 fail closed，因此没有理由开发 migration framework。

## Alternatives considered

- 将 Obsidian 内容移动或复制到人工 `xhs/` 与 `shared/` 目录。拒绝，因为 Business 部署不得重构或复制生产真源。
- 把整个 Vault 挂载为单 root。拒绝，因为 XHS 是 Project 隔离单元，当前输入不需要其他 Project。
- 在 execution package 中持久化生产绝对路径。拒绝，因为 package 必须是可移植的 logical manifest，且不得授予 raw filesystem access。
- 新增通用 migration framework。拒绝，因为不存在正式 Business 数据，version 1 就是首个生产基线。

## Consequences

生产真源保持不变，Host 可以解析正式任务卡、规则与产品真值。已配置 root 缺失或移动会使启动失败，未挂载 logical root 会使读取失败。每个获准文件仍需要精确冻结的 Execution Package 条目，因此仅配置 logical root 不会授予 Agent 访问权。

机器本地 Profile 配置现在持有物理路径。Stable V0 可以恢复部署前 Profile。受限 Agent route 会消费 package，并在模型 I/O 前强制执行 capability、Skill、origin 与 drift policy。
