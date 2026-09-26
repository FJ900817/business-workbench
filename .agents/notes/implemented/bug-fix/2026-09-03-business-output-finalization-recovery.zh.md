# Agent Note: Complete authoritative XHS execution without regenerating output

Status: implemented

[English](2026-09-03-business-output-finalization-recovery.md) | 中文

## Problem

Operator 进程可能在 XHS Agent Run 与输出 bundle 已提交、但所属 Job 尚未完成时退出。瞬态指标会随进程丢失。重新生成会替换首稿实验，而不是恢复已经完成的工作。

## Decision

Business Host 只有在验证权威 bundle、completed Agent Run 和冻结包 provenance 后，才完成最新的 running 或 interrupted XHS Attempt。同一个串行操作负责显式收尾和失去 owner 后的恢复。重复完成保留同一 receipt 和 revision；未被引用的 published 输出、损坏输出或已被后续 Attempt 替代的执行不能以此恢复。执行完成不代表人工批准或资产 Promote。

新 XHS 输出结算前，write-once、fsync 的观测记录在保持 V5 Job 与三文件 bundle 格式不变的前提下单独保存可获得的运行时指标。无观测数据的恢复记录 `telemetry incomplete`，不虚构 token 值。机器标题计数采用排除 Markdown 标题前缀的 Unicode code point；模型自报数字单独可见，绝不改写 Draft。

这扩展了[输出 bundle 决策](../architecture/2026-08-31-business-xhs-production-gate.zh.md)，并部分取代[生产 Agent route](../architecture/2026-09-02-business-xhs-production-agent-route.zh.md)中仅保留瞬态报告的约定。两个真源策略决策均保持有效。

## Alternatives considered

**只修正 operator 清理调用。** 拒绝，因为 bundle 提交后的任何崩溃仍会留下 running Job。

**重新生成或推断缺失用量。** 拒绝，因为两者都不能恢复已记录事实或保留首稿身份。

**修改 V5 或不可变输出 bundle。** 拒绝，因为观测记录不定义业务权威，现有已确认字节必须保持不变。

## Consequences

Fixture 覆盖显式和重复完成、无模型服务的 Loader 重启、缺失观测和损坏记录拒绝。生产恢复独立验证输出字节与历史 Job 均不变。缺失的历史指标仍不可获得；完整内容验证、正文计数解析、人工审核和资产 Promote 未实现。仍要求单 Runtime 写入。
