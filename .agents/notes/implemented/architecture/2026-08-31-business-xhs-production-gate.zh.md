# Agent Note：绑定 XHS 生产来源并结算一个输出 bundle

Status: implemented

[English](2026-08-31-business-xhs-production-gate.md) | 中文

## Problem

Phase 4A 的 XHS action 提议把账号策略与产品真值作为输入文件，并使用通用 Skill id。获批生产 S3 指令实际只要求一张已确认任务卡、一份正文类型规则、一份正文类型黄金样稿，以及账号 S3 本身。此外，S3 目录包含大写字母与中文，违反 Harness Skill-id grammar，无法按原名注册。若顺序提交三个输出 Artifact，崩溃或 compare-and-swap 失败可能留下部分权威结果。

## Decision

把 `xhs-body-prepare-v0` 修正为三个精确输入 role：`taskCard`、`writingRule` 与 `goldenSample`。把选定账号 S3 作为唯一 Skill 快照。删除 `accountRule` 与 `productTruth`，因为它们不是生产依赖，且正式 S3 指令排除了产品描述资料。

为每个账号定义一个 Host-owned 小写 adapter id，即 `xhs-s3-account1` 到 `xhs-s3-account4`，并将其映射到唯一正式 `.agents/skills/S3-笔记写作-账号X/SKILL.md` 来源。禁止重命名、复制、发现生产 Skill，也禁止在生产 Skill 间 fallback。Phase 4B 可执行 route 只接受选定 adapter id 下的安全 fixture 快照；后续 production adapter 必须解析已映射正式来源，并保留其报告的 origin、source、正文、资源与 hash。

让 `xhs-body-prepare-v0` 继续使用既有 Restricted Agent Runner：一个全新 Session、部署固定模型、空工具集合与 deny-all execution guard。要求显式 `fixture` route 与精确账号/正文类型策略。Host 创建 metadata 与 provenance，因此模型输出无法伪造执行 identity 或来源 evidence。[文本输出决策](../bug-fix/2026-09-03-business-xhs-text-output.zh.md)规定当前 Markdown 传输与确定性内部编码。

把三个文件表示为一个不可变输出 bundle。写入并 fsync owner-private staging 目录，验证全部文件与关系，原子 rename 完整目录到确定性的 Attempt-owned 位置，再通过一次 Job compare-and-swap 绑定 bundle，并结算 Agent Run、Attempt 与 receipt。只有状态更新成功后，published bytes 才是权威业务事实。Staging 或 publication orphan 保持可发现，且绝不自动收编。

把 Business storage schema 提升到 version 3。每个 Attempt 拥有可空 output-bundle 字段，每个 completed Agent Run 必须且只能引用一种输出：既有单 Artifact 或 XHS bundle。旧 schema 会被拒绝，且不迁移。

## Alternatives considered

- 直接注册中文 S3 目录名。否决原因是放宽全局 Skill-id grammar 会改变 Core 行为并扩大影响面。
- 把每个 S3 复制到 Business package。否决原因是这会产生第二个生产真源与静默漂移风险。
- 为未来灵活性保留产品真值输入。否决原因是获批 S3 明确排除该来源，精确 package 只应包含当前依赖。
- 让 Agent 返回 metadata 与 provenance。否决原因是执行 identity、hash、timing 与 policy 事实属于 Host evidence。
- 顺序提交三个普通 Artifact。否决原因是无法通过一次持久状态变更区分完整结果与部分结果。
- 重启后自动收编有效 published orphan。否决原因是没有经过所属 Job compare-and-swap 授权的字节不是业务事实。

## Consequences

Fixture route 在不读取真实任务卡或生产 Vault 路径的情况下证明生产 action policy 与输出 lifecycle。一个 Attempt 最多获得一个权威 XHS bundle；精确重试无需模型调用即可重放，不同成功结果会在模型 I/O 前被拒绝。重启会验证所有已引用 bundle，reconciliation 会报告不完整或未引用字节，但不会修改它们。

生产执行保持关闭，直到 Host resolver 冻结三个获批生产文件，且 Skill adapter 冻结一个已映射正式 S3 definition。内容 Validation、Human Gate 与 Obsidian promotion 仍是独立的未来 consumer，不能把本 intermediate bundle 视为 final。
