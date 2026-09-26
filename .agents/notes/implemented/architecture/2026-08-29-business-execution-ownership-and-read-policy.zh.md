# Agent Note：持有业务执行并冻结其读取

状态：已实施

[English](2026-08-29-business-execution-ownership-and-read-policy.md) | 中文

## 问题

当 `running` 只表示 Attempt record 存在时，Business Job persistence 不能安全驱动执行。Runtime 终止后，没有证据说明旧 owner 已消失，新调用方可能把 stale state 误认为 live work。Agent 也不得通过扫描整个 Obsidian tree 自行发现输入。在允许任何模型集成前，每个 Attempt 必须拥有固定 input set 与 Host 强制 read policy。

## 决策

保持一个 Host-only `dsh-business-workbench` 插件，并把 Attempt 创建与 execution lease acquisition 分开。lease 持久化在 Attempt 内，记录 caller owner、Runtime instance、renewal、expiry 与 status。每个 execution mutation 都核验 current Attempt、owner、Runtime、expiry、Job revision 与 idempotency receipt。启动时把 foreign-Runtime running lease 转成 interrupted history；显式 recovery 转换 expired lease。两者都不自动重试。

每个 Attempt 最多持久化一个不可变 execution package。它记录精确 input file 及冻结的 presence、hash、size、Workflow version、allowed read root/file，以及声明式 capability/Skill list。包内 resolver 只接受 xhs 或 shared product-truth root 下的相对 path，要求精确 package input，规范化 source root/file，拒绝 symlink escape，并在不改写 Manifest 的情况下报告 drift。

把 business storage schema 从 0 提升到 1，并在不修改 medium 的情况下拒绝 v0。继续采用单 Runtime writer 部署规则，不增加缺少完整 stale-owner protocol 的 lock file。增加只读 orphan Artifact reconciliation，把处置留给后续 policy。

## 考虑过的替代方案

- 把持久化 running state 当作可恢复执行。拒绝，因为 process ownership 和内存执行不能通过推断跨重启存活。
- 启动时自动创建新 Attempt。拒绝，因为 recovery 不得在没有 caller 批准时重复模型工作或生成重复 Artifact。
- 把读取限制写入 prompt 或 Skill instruction。拒绝，因为它们是模型可见指导，不是 Host authorization。
- 修改全局 filesystem sandbox。拒绝，因为业务 Project policy 比通用 Harness filesystem 行为更窄，且不得影响无关 workload。
- 把 lease、package 与 read policy 拆成独立插件。拒绝，因为它们修改或授权同一 Job/Attempt aggregate，当前不存在独立演化需求。
- 增加跨进程 lock file。延后，因为可靠 stale-lock recovery 会在第二层重建同一 ownership 问题。

## 结果

没有一个由当前 Runtime owner 持有且未过期的 current lease，Job 就不是真正 running。重启会把遗留工作显式变为 recoverable，同时保留旧 Attempt、package、Artifact 与 receipt evidence。未来 Agent adapter 会收到精确冻结 input set，且无法通过本服务扫描无关 Project。

本包不再加载 schema v0；生产复用前需要显式、单独审计的 migration。JSON backend 只有在文档规定的单 Runtime writer 部署下才安全。capability 与 Skill allow-list 只是 durable declaration，直到后续 adapter 在 invocation 时实施 enforcement。
