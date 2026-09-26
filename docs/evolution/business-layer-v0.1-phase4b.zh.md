# Business Layer V0.1 Phase 4B Evolution

[English](business-layer-v0.1-phase4b.md) | 中文

版本：Phase 4B

日期：2026-08-31

## Before

`xhs-body-prepare-v0` 不可执行，提议使用四个输入文件与两个通用 Skill id。系统没有到获批账号 S3 指令的已审计映射，没有封闭 action route，没有三文件 bundle validation，也没有把一个 XHS 草稿结果原子绑定到业务状态的机制。

## After

生产来源审计把 action 修正为三个精确输入文件与一个账号 S3 Skill 快照。四个合法 Host adapter id 现在确定性映射到四个正式 S3 来源文件。一个显式、仅 fixture 的 XHS route 使用 Restricted Agent Runner、一个固定配置模型、零工具、零 discovery 与零替代 Skill。Host 只接受模型返回的 draft 字符串，自行生成 metadata 与 provenance，验证完整 bundle，原子发布，并通过一次 Job CAS 使其成为权威结果。

## Evidence

Assembled keyless snapshot 冻结 action、model/tool policy、生产 Skill 映射、input/output 名称、schema version 与安全 fixture hash。完整 fixture lifecycle 经过 Batch、Job、Attempt、lease、package、Restricted Agent、输出 bundle、重启、读取验证与幂等重放。负向测试覆盖来源、策略、漂移、输出、关系、持久化、重复成功与中断发布错误。一次凭据门控真实提供方 smoke 生成有效的安全 fixture bundle，forbidden executor 调用为零，且没有挂载生产 Vault。

## Screenshots

无。Phase 4B 没有 UI 变化。

## Remaining work

Runtime 仍缺少生产输入 resolver、正式 S3 provider adapter、内容 Validation、Human Gate 与 Obsidian promotion。真实任务卡保持禁用，且没有生成真实 XHS 正文。
