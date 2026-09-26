# Business Layer V0.1 Phase 4A Evolution

[English](business-layer-v0.1-phase4a.md) | 中文

版本：Phase 4A

日期：2026-08-31

## Before

受限 Agent 路径已有 keyless fixture 覆盖，但尚未通过已配置的真实提供方成功调用。首个 XHS 正文 action 没有机器可读的最小输入、Skill、输出、idempotency 或未来 Validation/review 约定。

## After

一个凭据门控 e2e 使用真实 `deepseek-official / deepseek-v4-flash` 路径，同时把业务状态与输入留在临时 home。它证明 forbidden executor 调用为零，只产生一个 intermediate Artifact，并在模型调用前拒绝输入漂移、Skill 漂移与 package 不匹配，且托管凭据不变。`xhs-body-prepare-v0` 现已有机器可读 package 与 output 约定，但仍无法通过 `runRestrictedAgent` 调用。

## Evidence

真实提供方冒烟测试成功运行一次，耗时约 2.8 秒。focused keyless suite 覆盖约定接受、每一种 input/read/capability/Skill 扩张，以及既有受限 Agent 失败与持久化行为。提供方失败路径会保留非敏感 Session code 与 message，同时不发布 Artifact。

## Screenshots

无。Phase 4A 没有用户界面变化。

## Remaining work

生产 Skill、可执行 XHS action policy、三输出原子 validation、Human Gate、完整 Validation 与 Obsidian promotion 仍不存在。系统未生成任何真实 XHS 正文。
