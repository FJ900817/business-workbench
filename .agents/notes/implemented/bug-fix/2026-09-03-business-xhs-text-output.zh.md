# Agent Note: 分离 XHS 正文生成与 Host JSON 编码

Status: implemented

[English](2026-09-03-business-xhs-text-output.md) | 中文

## Problem

最小模型响应 `{draft: string}` 仍要求对长 Markdown 正文进行 JSON 转义。提供方成功返回后，结算可能在权威正文形成前失败。Sample 03 只保留了 JSON 解析失败，没有原始 final text，因此无法重建准确语法。[实验证据](../../../../docs/experiments/business-layer-v0.1-phase4c2c-structured-output-reliability.zh.md)据此限定事故结论。

## Decision

策略 `xhs-body-prepare-policy-v2-text` 只要求 Restricted Agent（智能体）返回 Markdown 正文。Business Host 确定性编码 JSON，并保留严格的内部正文 schema、metadata、provenance、原子 bundle 发布及 V5 存储格式。这只替代 [XHS 输出 bundle 决策](../architecture/2026-08-31-business-xhs-production-gate.zh.md)中由模型生成 JSON 的部分，其真源与单一结果保证继续有效。

传输层去除一个初始 BOM，其余文本保持原样。JSON 容器与代码围栏前缀属于保留格式，直接拒绝，不猜测或提取。明确报告 token 上限结束时，即使文本非空也拒绝。诊断区分语法、schema、缺少正文、截断、不支持格式、空文本、非法字符与字节上限，并在现有失败字符串内记录 hash 和观测到的结束原因。不保存原始内容，不伪造缺失的结束证据。

## Alternatives considered

**原生 JSON mode。** 当前 LLM（大语言模型）请求类型与 DeepSeek 序列化器没有 `response_format` 路径。启用它不是只改 Business 配置即可完成的工作；文本输出不需要修改 Core。

**更小的模型 JSON。** 响应已经只有 `draft`，无法通过删除机器 metadata 字段解决转义依赖。

**容错 JSON 提取或模型修复。** 拒绝，因为猜测格式会掩盖失败，第二次模型请求会破坏首稿实验身份。不去除围栏。

## Consequences

模型内容与 Host 结构各自负责，既有输出 bundle 无需改写即可读取。解析器验证传输格式，不验证内容质量或语义完整性。即使某段 Markdown 合法，只要以保留前缀开头也会被拒绝。提供方遗漏信息或错误报告 `stop` 时，仍无法证明内容完整。

合成 fixture（测试前置数据）和基于 Loader 的 Agent 组合锁定 Unicode/长文本保真、确定性拒绝、诊断持久化、唯一权威 bundle、重复完成及无模型恢复。尚未实测真实提供方对新提示词的遵守程度；任何生产重试都需要重新授权，并记录新策略版本。
