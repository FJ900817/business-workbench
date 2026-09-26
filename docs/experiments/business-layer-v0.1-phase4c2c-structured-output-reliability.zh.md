# Phase 4C-2C：XHS 结构化输出可靠性

[English](business-layer-v0.1-phase4c2c-structured-output-reliability.md) | 中文

## Incident evidence

Sample 03 发起了一次提供方请求，并产生了非空 final text。Business Host 随后在 `JSON.parse` 阶段抛出 `XHS_BODY_OUTPUT_INVALID`；HTTP 状态为 200，结束原因为 `stop`，输出用量为 699 tokens，工具调用数为零。原始提供方响应与 Agent final text 均未持久化。因此只能确认“非空 final text 不是有效 JSON”；无法区分 Markdown、围栏、转义、推理混入或截断。Raw output unavailable。

失败 Job `18a4b724-1298-48d3-b51c-6f49d84be261` 与 Attempt `2479880e-50c6-4fdb-9073-1339e7d87d9d` 保持 failed，没有 bundle 或替代 Attempt。Sample 04 继续等待授权。

## Prior output requirements

`xhs-body-prepare-v0` 要求模型返回一个严格 JSON 对象：唯一必填字段 `draft` 必须是字符串，没有可选或额外字段，Markdown 中的引号和换行全部进行 JSON 转义。不允许 Markdown 围栏。模型不生成 metadata、提供方事实、真源 hash、provenance 或 Artifact 关系；这些值原本就由 Host 生成。提供方请求使用普通文本输出，因为当前 Harness LLM 请求类型和 DeepSeek 序列化器不暴露 `response_format`。

DeepSeek 记录了原生 [`json_object` response format](https://api-docs.deepseek.com/guides/json_mode)，包括提示词与 token 上限约束；[chat-completion API](https://api-docs.deepseek.com/api/create-chat-completion)记录了 `response_format` 和 thinking 控制。当前仓库适配器不传递该选项。增加该能力需要修改超出获批 Business 范围的 LLM API 与序列化器；而且原生 JSON mode 既不保证应用 schema，也不保证输出不截断。

## Selected strategy

策略 `xhs-body-prepare-policy-v2-text` 采用 text-first deterministic wrapping。Restricted Agent 只返回完整 Markdown 正文，不返回 JSON、外层围栏或传输说明。Host 去除一个初始 BOM，拒绝保留的 JSON/围栏前缀及非法输出条件，再用 `JSON.stringify` 编码 `{draft}`。既有严格内部解析器生成 `draft.md`；Host 代码继续生成 `draft-metadata.json`、`provenance.json`、hash、关系和权威 intermediate bundle。

唯一容错是去除一个初始 BOM。首尾空白、引号、换行和 Unicode 全部保留。不去除围栏，不提取或修复 JSON，不把畸形结构回退为正文，也不发起第二次 AI 请求。`max-tokens` 分类为 `truncated`；结束原因为 `stop` 的非法 JSON 前缀仍分类为 `invalid-json`，因为不能推断截断。

未来的 `XHS_BODY_OUTPUT_INVALID` detail 区分 `invalid-json`、`schema-invalid`、`missing-draft`、`truncated`、`unsupported-format`、`empty-draft`、`invalid-character` 与 `too-large`。它记录阶段、UTF-8 字节数、SHA-256 与可获得的结束原因，但不记录响应正文。未变更的 V5 通过既有 Agent Run 失败字符串保存该诊断。

## Verification

合成覆盖接受普通 Markdown、引号/换行、Unicode 与 500 字中文正文，且不改变字节；拒绝严格或带围栏的模型 JSON、带围栏的 Markdown、畸形或截断 JSON、字段缺失/类型错误/额外字段、数组、空文本、NUL/BOM、超大输出及非成功结束原因。Host 内部 JSON 保持严格。真实 Loader 组合验证 Restricted Agent 提示词、空工具列表、三个输出文件、正文原字节、一次模型调用、一个权威 bundle、重复执行回放、重复完成和 reconciliation。被拒绝输出只持久化一次不含正文的分类，不产生 bundle，不自动重试，并可在重启后保持。

Business 测试套件共 11 个文件、113 项测试通过。包 TypeScript 编译与 Business 构建产物通过。未发起真实提供方请求，也未使用生产真源。

## Production-history protection

SHA-256 复核覆盖 Business V5 存储文件、Sample 01 人工评价、四样本 manifest、全部 Phase 4C-2B 记录，以及 Sample 01 与 Sample 02 的三文件 bundle。Sample 02 `draft.md` 仍为 `6fa294268ff09aa5e05ce51d54ac13b278632bfc43862f2f670707bb4de6c2ca`；存储文件仍为 `3c5b541a85ac76c73715bad437011413f575c98ae9ed9f71924d600dbb1c6066`。未写入任何生产 Job、Attempt、输出、真源或 Obsidian 资产。

## Decision

Phase 4C-2C 以 fixture 证据通过。Sample 03 Retry 不会自动进行；在文本输出策略下创建新 Attempt 需要明确授权。该 Retry 仍将是新提示词遵循情况的第一次真实提供方测量。Sample 04 必须保持未启动，直到有序实验策略允许执行。
