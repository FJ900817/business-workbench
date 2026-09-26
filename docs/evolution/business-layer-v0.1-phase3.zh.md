# Business Layer V0.1 Phase 3 Evolution

[English](business-layer-v0.1-phase3.md) | 中文

版本：Phase 3

日期：2026-08-30

## Before

Execution Package 已冻结精确输入文件与声明式 capability/Skill 名称，但没有 Host adapter 消费这些声明。Business Workbench 不启动 Agent，Skill definition 没有冻结，package 也不能通过 AgentLoop 产生 Artifact。

## After

Host 会把完整批准 Skill definition 及其 winning origin 冻结进 schema 2 package。封闭的 `fixture-agent-run` action 在一次 tool-free AgentLoop 调用前检查 Job、Attempt、lease、package、input、Skill policy、origin 与 drift。成功会结算持久 Agent Run，并生成带完整执行 provenance 的 intermediate Artifact；失败不发布任何被引用的输出。

## Evidence

Keyless 测试使用 deterministic provider 装配真实 AgentLoop stack。测试证明在 code-mode 部署下可见工具为零，恶意 bash 调用无法执行，ambient prompt context 不会进入请求，注入指令只作为输入数据处理；还覆盖缺失/不允许/shadowed/drifted Skill、过期执行权、失败不重试、成功 invocation key 只执行一次，以及重启后恢复 provenance。既有 Business Workbench 与 Web bundle assembly 回归继续通过。

## Screenshots

无。Phase 3 只改变 Host 执行与持久化，没有用户界面变化。

## Remaining work

Action、Skill 与输出仍为 fixture。真实 XHS action、确定性 output schema、Validation、Human Gate、UI 与 Obsidian promotion 均未实现。在明确批准 provider/model policy 前，生产 Profile 执行继续保持禁用。
