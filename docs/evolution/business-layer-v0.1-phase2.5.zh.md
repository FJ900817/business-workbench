# Business Layer V0.1 Phase 2.5 Evolution

[English](business-layer-v0.1-phase2.5.md) | 中文

版本：Phase 2.5

日期：2026-08-30

## Before

Phase 2 后源码已经使用 schema 1，但尚未将其声明为首个正式生产基线。Web Host 挂载 Business Workbench 时没有生产输入，单 root resolver 则假设一个物理 root 下存在人工拼装的 `xhs/` 与 `shared/product-truth/` 目录。

## After

生产环境没有既有 Business 数据，因此直接冻结 schema 1，不开发 migration 工具。Resolver 现在把固定 logical prefix 映射到分别 canonicalize 的物理 root。生产 Profile 只挂载正式 XHS Project 与其中的产品库；每个文件仍必须出现在 Execution Package allow-list 中。

## Evidence

Phase 1 与 Phase 2 回归均在 schema 1 下运行。新增检查覆盖首次持久化、重启、不支持版本、独立 logical roots、未挂载 root、获准的生产类输入、被拒绝的 Project 与未列出文件、traversal、absolute path、symlink escape、生产 Profile composition 和 loopback Runtime health。正式 Obsidian 输入只读，且不创建生产 Job。

## Screenshots

无。Phase 2.5 只改变 Host 配置与读取授权，没有用户界面变化。

## Remaining work

Phase 3 必须在 Host 边界执行 capability 与 Skill 声明。Agent 执行、小红书正文生产、Validation、UI 与 Obsidian Promote 仍不存在。
