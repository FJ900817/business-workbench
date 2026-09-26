# Business Layer V0.1 Phase 4C-1R: provider output recovery

English | [中文](business-layer-v0.1-phase4c1r-provider-output-recovery.zh.md)

## Result

Phase 4C-1R passes its recovery gate with one explicit storage-model limitation. The historical Phase 4C-1 raw response is unavailable, so the exact cause of its zero extracted text remains unknown. New empty-output failures are diagnosable, deterministic fixture coverage passes, and the sole authorized real-provider safe smoke completed through the production route with no tool call, production data, production Business-state write, or Obsidian write. Schema version `4` cannot truthfully represent an independent single-Job experiment; that limitation is proven rather than hidden with three placeholder Jobs.

## Historical failure evidence

The production Business storage file remained at SHA-256 `0e1d11936aaa181a9f04979e3d1fcf8ee8e6973be6df875b56ebde4e5e81dd65`, 19,627 bytes, and mtime `2026-09-02T19:52:48+08:00` before and after this work. The historical failed Attempt and its four-slot Batch were not mutated.

The old failure string proves that the runner found an `assistant/message`, checked zero tool calls, joined all `text` blocks into zero bytes, and committed no output. No retained Session event log or provider metadata contains the original response id, finish reason, token usage, raw content type, text-delta count, reasoning-delta count, or final-event count. The response can therefore be classified only as `unknown after normalized assistant message`; `provider-empty-response` and `adapter-output-extraction bug` are both unproven.

The DeepSeek adapter maps an explicit successful stop without any block to an empty-response provider error. A reasoning-only completion or a non-stop token-limit completion can still produce a normalized assistant message whose visible text is empty. These are plausible mechanisms, not findings about the historical request.

## Phase 4A and Phase 4C-1 comparison

| Concern | Phase 4A real smoke | Phase 4C-1 production run | Material difference |
|---|---|---|---|
| Provider / model / reasoning | `deepseek-official / deepseek-v4-flash / low` | same | none |
| Streaming path | DeepSeek adapter → AgentLoop Session events | same | none |
| Agent composition | SessionStore, SystemPrompt, ToolRuntime, AgentRegistry, AgentLoop | same | none |
| Tools | empty model tool list plus deny-all executor | same | none |
| Maximum output tokens | `256` | `4096` | production allowed a longer completion |
| Action | `fixture-agent-run` | `xhs-body-prepare-v0` production route | different policy and output settlement |
| Inputs | two short safe fixture files | three formal files plus formal S3 snapshot | production prompt was materially larger |
| Skill materialization | two runtime Registry snapshots | one resolver-selected formal S3 snapshot | production deliberately bypassed discovery |
| Package verification | generic frozen package | source manifest plus immediate production-source and S3 drift checks | production added deterministic verification |
| Prompt | short generic JSON/text request | formal XHS JSON draft request | model-visible instructions differed |
| Output extraction | latest `assistant/message`, join `text` blocks | same | none |
| Output settlement | one ordinary intermediate Artifact | parsed JSON, then three-file intermediate bundle | failure occurred before settlement |
| Retained completion metadata | transient success metrics only | no success metrics after failure | historical finish and usage facts were lost |

## Output event pipeline and diagnostic change

The execution path is provider stream → DeepSeek adapter `StreamChunk` values → AgentLoop `assistant/chunk` and `assistant/message` Session events → Business runner selection of the latest assistant message → join only `text` blocks → XHS JSON parsing → immutable output-bundle publication and Job CAS. Reasoning blocks never enter the draft parser.

Completed turns without visible text now fail as `EMPTY_AGENT_OUTPUT`. The immediate error and the durable Agent Run failure string record diagnostic version, provider, model, Agent Run id, Session id, available response id and finish reason, assistant/text/reasoning/tool/final-event counts, normalized content-field type, extracted UTF-8 bytes, available token usage, duration, and error stage. Prompt, response body, credentials, and production input bytes are never included. A missing response id remains absent because the current successful-response Session events do not carry it.

This change is confined to `@deepseek-ai/dsh-business-workbench`. It does not alter the DeepSeek adapter, AgentLoop, WorkflowEngine, Session format, tool policy, model selection, retry policy, or schema version.

## Fixture coverage

The deterministic production-route fixture runs Job → Attempt → Lease → production Execution Package → production policy → Restricted Agent → extraction and settlement. It covers ordinary text, multi-delta text, reasoning followed by text, empty completion, reasoning-only completion, and truncated non-JSON text. Ordinary, multi-delta, and reasoning-plus-text cases produce one bundle; empty and reasoning-only cases fail as `EMPTY_AGENT_OUTPUT`; truncated JSON fails as `XHS_BODY_OUTPUT_INVALID`. Every failure creates zero Artifact and zero output bundle, and no case retries.

The focused diagnostic suite passed 30 tests. The complete Business Workbench package passed 62 tests across 9 test files, including leases, restart recovery, read and Skill drift, deny-all tools, CAS, Artifact and output-bundle integrity, and deterministic production-source resolution.

## Real-provider safe smoke

The single authorized request ran at `2026-09-02T20:29:22+08:00` against `deepseek-official / deepseek-v4-flash / low` with `maxTokens = 4096`. It used a synthetic formal Vault and an isolated temporary `DSH_HOME`, then followed the same production source resolver, execution package, policy, restricted Agent, extraction, and bundle path as Phase 4C-1.

The request passed. It returned 64 UTF-8 bytes with SHA-256 `02930b5d60145fde48dd47fde80baef65a65e2ed6a55512685b15fdac6f300de`; the body is intentionally not retained in this report. First response arrived after 316 ms and the Agent completed after 1,415 ms. Usage was 785 input tokens, 63 output tokens, and 45 reasoning tokens. Tool calls and registered forbidden-tool executions were both `0`. The test made no retry and disposed its temporary source, Business state, Session, and output bundle.

The report evidence is `/private/tmp/business-layer-v0.1-phase4c1r-safe-smoke-93311d77.json`. It contains hashes and metrics but no generated text, credential, or production source. Production Business storage retained its exact pre-smoke hash and mtime.

## Single-note Batch semantics

Schema version `4` defines `BusinessBatch.jobIds` and `CreateBusinessBatchRequest.inputs` as exact four-tuples, validates four distinct Job ids, materializes four Jobs during Batch creation, and requires every Job to carry a `batchId`. It has no participant-set field, disabled-slot state, or independent Job creation API. A single-Job mode implemented only in code would violate the durable validator or misstate business facts.

Phase 4C-1R therefore makes no schema or historical-data change. The next single-note experiment must wait for either an explicit schema decision that can represent one participant or explicit acceptance that a four-slot Batch is only an experiment container. The latter still preserves three non-participating records and does not solve the semantic limitation.

## Remaining risks and rerun prerequisites

- The historical Phase 4C-1 raw cause cannot be recovered; only a future occurrence can exercise the new diagnostic metadata.
- Provider response ids remain unavailable on successful normalized Session events, limiting transport-level correlation.
- A truthful single-Job experiment remains impossible under schema version `4`.

A Phase 4C-1 retry requires a decision on single-Job persistence semantics, a new Job and Attempt identity, a fresh read-and-hash confirmation of the frozen production sources, and explicit authorization for exactly one new production request. The old Attempt must remain failed, and the retry must retain the same no-tool, no-retry, no-fallback, no-Obsidian and one-success limits.
