# Business Layer V0.1 Phase 4C-1R：Provider output 恢复

[English](business-layer-v0.1-phase4c1r-provider-output-recovery.md) | 中文

## 结果

Phase 4C-1R 通过恢复门禁，但保留一项明确存储模型限制。历史 Phase 4C-1 的 raw response 不可用，因此无法确定其提取文本为 0 的精确原因。新的空输出失败已可诊断，确定性 fixture coverage 通过，唯一一次获授权的真实 provider 安全 smoke 也通过 production route 完成，且没有工具调用、生产数据、生产 Business 状态写入或 Obsidian 写入。Schema version `4` 无法如实表示独立单 Job 实验；本轮证明并报告该限制，没有用三个占位 Job 掩盖它。

## 历史失败证据

本轮前后，生产 Business storage 文件始终为 SHA-256 `0e1d11936aaa181a9f04979e3d1fcf8ee8e6973be6df875b56ebde4e5e81dd65`、19,627 bytes、mtime `2026-09-02T19:52:48+08:00`。历史失败 Attempt 与其四槽 Batch 均未修改。

旧 failure string 证明 runner 找到了 `assistant/message`、检查到 tool call 为 0、把全部 `text` block 拼接为 0 bytes，且没有提交 output。已保留的 Session event log 或 provider metadata 中没有原 response id、finish reason、token usage、raw content 类型、text-delta 数、reasoning-delta 数或 final-event 数。因此只能将该响应分类为 `unknown after normalized assistant message`；`provider-empty-response` 和 `adapter-output-extraction bug` 均未获得证实。

DeepSeek 适配器会把没有任何 block 的显式成功 stop 映射为空响应 provider error。仅 reasoning completion 或非 stop 的 token-limit completion 仍可能生成可见文本为空的规范化 assistant message。这些只是可能机制，不是对历史请求的判定。

## Phase 4A 与 Phase 4C-1 对比

| 对比项 | Phase 4A 真实 smoke | Phase 4C-1 production run | 实质差异 |
|---|---|---|---|
| Provider / model / reasoning | `deepseek-official / deepseek-v4-flash / low` | 相同 | 无 |
| Streaming path | DeepSeek adapter → AgentLoop Session event | 相同 | 无 |
| Agent composition | SessionStore、SystemPrompt、ToolRuntime、AgentRegistry、AgentLoop | 相同 | 无 |
| Tools | 空 model tool list 加 deny-all executor | 相同 | 无 |
| 最大输出 token | `256` | `4096` | production 允许更长 completion |
| Action | `fixture-agent-run` | `xhs-body-prepare-v0` production route | policy 与 output settlement 不同 |
| Inputs | 两个短安全 fixture 文件 | 三个正式文件加正式 S3 snapshot | production prompt 明显更大 |
| Skill materialization | 两个 runtime Registry snapshot | 一个 resolver 选择的正式 S3 snapshot | production 按设计绕过 discovery |
| Package verification | 通用冻结 package | source manifest 加即时 production source/S3 drift 检查 | production 增加确定性验证 |
| Prompt | 简短通用 JSON/text 请求 | 正式 XHS JSON draft 请求 | 模型可见指令不同 |
| Output extraction | 最新 `assistant/message`，拼接 `text` block | 相同 | 无 |
| Output settlement | 一个普通 intermediate Artifact | 解析 JSON 后生成三文件 intermediate bundle | 失败发生在 settlement 前 |
| 保留的 completion metadata | 仅瞬态成功 metrics | 失败后没有成功 metrics | 历史 finish/usage 事实丢失 |

## Output event pipeline 与诊断修改

执行路径为 provider stream → DeepSeek adapter `StreamChunk` → AgentLoop `assistant/chunk` 与 `assistant/message` Session event → Business runner 选择最新 assistant message → 仅拼接 `text` block → XHS JSON parsing → 不可变 output bundle 发布与 Job CAS。Reasoning block 绝不会进入 draft parser。

已完成但没有可见文本的 turn 现在以 `EMPTY_AGENT_OUTPUT` 失败。即时 error 与持久 Agent Run failure string 会记录 diagnostics version、provider、model、Agent Run id、Session id、可用 response id/finish reason、assistant/text/reasoning/tool/final-event 数量、规范化 content field 类型、提取的 UTF-8 bytes、可用 token usage、时长与 error stage。Prompt、response 正文、credential 与生产输入 bytes 永不写入。由于当前成功响应 Session event 不携带 response id，缺失时该字段保持 absent。

本次变更仅位于 `@deepseek-ai/dsh-business-workbench`。DeepSeek adapter、AgentLoop、WorkflowEngine、Session format、tool policy、model selection、retry policy 与 schema version 均未修改。

## Fixture coverage

确定性 production-route fixture 完整经过 Job → Attempt → Lease → production Execution Package → production policy → Restricted Agent → extraction/settlement。覆盖普通文本、多 delta 文本、reasoning 后接文本、空 completion、仅 reasoning completion 与截断的非 JSON 文本。普通、多 delta 与 reasoning+text 用例各生成一个 bundle；空输出与 reasoning-only 以 `EMPTY_AGENT_OUTPUT` 失败；截断 JSON 以 `XHS_BODY_OUTPUT_INVALID` 失败。所有失败都产生 0 Artifact 和 0 output bundle，且没有 retry。

定向诊断 suite 通过 30 个测试。完整 Business Workbench package 在 9 个 test file 中通过 62 个测试，覆盖 lease、restart recovery、read/Skill drift、deny-all tool、CAS、Artifact/output-bundle integrity 与确定性 production-source resolution。

## 真实 Provider 安全 smoke

唯一一次获授权请求于 `2026-09-02T20:29:22+08:00` 使用 `deepseek-official / deepseek-v4-flash / low` 与 `maxTokens = 4096`。它使用合成正式 Vault 和隔离的临时 `DSH_HOME`，随后经过与 Phase 4C-1 相同的 production source resolver、execution package、policy、restricted Agent、extraction 与 bundle path。

请求通过。它返回 64 UTF-8 bytes，SHA-256 为 `02930b5d60145fde48dd47fde80baef65a65e2ed6a55512685b15fdac6f300de`；本报告刻意不保留正文。首响应耗时 316 ms，Agent 在 1,415 ms 完成。Token usage 为 785 input、63 output 与 45 reasoning。Tool call 与已注册 forbidden-tool execution 均为 `0`。测试没有 retry，并 dispose 了临时 source、Business 状态、Session 与 output bundle。

报告证据位于 `/private/tmp/business-layer-v0.1-phase4c1r-safe-smoke-93311d77.json`。其中只有 hash 与 metrics，不含生成文本、credential 或生产 source。生产 Business storage 保持 smoke 前完全相同的 hash 与 mtime。

## 单篇 Batch 语义

Schema version `4` 把 `BusinessBatch.jobIds` 与 `CreateBusinessBatchRequest.inputs` 定义为精确四元组，校验四个不同 Job id，在创建 Batch 时物化四个 Job，并要求每个 Job 携带 `batchId`。当前没有 participant-set 字段、disabled-slot 状态或独立 Job 创建 API。只在代码中加入 single-Job mode 会违反持久 validator 或错误表达业务事实。

因此 Phase 4C-1R 不修改 schema 或历史数据。下一次单篇实验必须等待：明确决定能表示单 participant 的 schema，或明确接受四槽 Batch 仅是实验容器。后者仍会保留三个非参与记录，并没有解决语义限制。

## 剩余风险与 retry 前提

- 历史 Phase 4C-1 raw 原因无法恢复；只有后续再次发生时才能触发新诊断 metadata。
- 成功规范化 Session event 不提供 provider response id，限制了 transport 级关联。
- Schema version `4` 仍无法如实表达单 Job 实验。

Phase 4C-1 retry 需要先决定单 Job persistence 语义，使用新的 Job/Attempt identity，重新只读确认冻结 production source 的 hash，并对恰好一次新 production 请求取得明确授权。旧 Attempt 必须保持 failed，retry 必须继续遵守无 tool、无自动 retry、无 fallback、无 Obsidian 与只允许一次成功的限制。
