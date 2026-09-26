# Phase 4C-1F：首稿执行收尾恢复

[English](business-layer-v0.1-phase4c1f-finalization-recovery.md) | 中文

## 事故与根因

临时 operator 脚本 `/private/tmp/dsh-first-pass-off-mWvBNbkj/experiment.spec.ts:237` 调用了 `ctx.dispose()`。Cordis 提供的是 `ctx.fiber.dispose()`；仓库内正式生产实验和 Business fixture 已使用正确 API。错误清理先于报告写入执行，遮蔽了此前已经捕获的异常。此前异常未落盘，无法确定其具体原因。缺失 reasoning 用量不等于观测到零；fixture 验证该区别，但不声称能证明原始异常。

Business Host 还有独立恢复缺口：`runRestrictedAgent` 提交权威 intermediate bundle 并完成 Agent Run，Job/Attempt 完成仍依赖调用方。成功指标只从内存返回。只修正清理方法不能恢复两个操作之间的进程崩溃。

## 修复

[Business 包](../../packages/business/business-workbench/README.zh.md)提供基于输出的幂等执行完成，并用于失去 owner 的 XHS 执行恢复。它无需模型、凭证、Skill 或真源访问，即可验证现有输出与冻结 provenance。缺失 telemetry 通过仅所有者可访问的观测记录保留；V5 字段和不可变 bundle 字节不变。新 XHS 观测在输出结算前 fsync。该操作不是内容批准、资产 Finalize 或 Obsidian Promote。

标题 `设计留白总觉得空？用三个维度自检是否有效` 共 20 个全字符。Markdown 的 `# ` 前缀是语法，不属于标题内容。现有模型自报的 22 保持不变；机器观测记录 20 和不匹配事实。不声称已经实现正文计数解析或完整内容 Validator。

## 生产恢复证据

恢复 Job `0fefdb1c-fc24-4f78-a8ba-feec2b010b56`、Attempt `7ba0cb03-e522-4e8f-a19e-2d6316ae547d` 前，已生成计划并保存受保护的状态副本。证据位于 `~/.dsh/business-workbench/v0.1/experiments/phase4c1f-finalization-recovery-6kB856dD/`。在 `2026-09-03T13:51:31Z`，Job 与 Attempt 变为 completed，租约变为 released，原 completed Agent Run 不变。重复收尾两次并再次挂载 Business Runtime 后状态保持一致。其他 Job 与 Batch 完全不变。

Draft SHA256 仍为 `ff9224d5039a8b3ef5342e84357a65dd0f20a34328072bb82f2bddf1cb7cd29f`；三文件 bundle 字节完全一致。Storage SHA256 从 `6b95583aa9b0fbd96199623fb5b8b4f0f8ffb6b0216b13e2e119d84d7b7ad305` 变为 `6137d7eb63cca57b1e6e59bcb39d59ca0d5b13016801fdf9aa441161e1262c26`。Schema 保持 V5。历史缺失的 token、结束原因和瞬态耗时仍不可获得。Provider 调用、Obsidian 写入、Draft 修改和 Harness Core 修改均为零。

## 验证范围

Synthetic 测试覆盖受限 Agent 到权威输出的路径、唯一完成 receipt、租约释放、无模型服务的真实 Loader 组合重启、历史缺失 telemetry、不可获得的 reasoning 用量，以及损坏输出或观测的拒绝。现有执行安全与 schema 测试仍在验证范围内。本轮没有真实模型测试、正文生成、UI 修改或生产真源修改。

Business 测试共 10 个文件、76 项通过；最终聚焦重跑的 9 项 XHS 测试全部通过。类型检查、Business 构建产物和仓库 lint 子命令通过。`doc-sync` 为 25 项通过、3 项失败：全局 Cordis API 目录、配置目录和配置目录翻译配对仍陈旧。Business 子系统 API 文档已重新生成，未修改无关全局生成文件。崩溃 fixture 从输出已提交的窗口重启，并非操作系统 kill 测试。
