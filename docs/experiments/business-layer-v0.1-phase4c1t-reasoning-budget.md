# Business Layer V0.1 Phase 4C-1T: Reasoning budget

English | [中文](business-layer-v0.1-phase4c1t-reasoning-budget.zh.md)

## Result

Phase 4C-1T passes. The selected candidate keeps `deepseek-official / deepseek-v4-flash / maxTokens 4096` and changes the Business-owned request effort from `low` to `off`. One production-sized synthetic request returned visible final text with `5058` input tokens, `10` output tokens, `0` reasoning tokens, finish reason `stop`, no tool call, and no forbidden execution. No production source or production Business state entered the test.

## Failed production evidence

The preserved Phase 4C-1 Retry facts are `5033` input tokens, `4097` output tokens, `4097` reasoning tokens, zero final-text bytes, and finish reason `max-tokens` for `deepseek-v4-flash / low / 4096`. The equality of reported output and reasoning tokens proves that this response spent its complete generated-token allowance before final text began. The provider-reported total exceeds the requested cap by one token; no retained wire fact explains that accounting edge, and it does not change the exhaustion classification. Both failed production Attempts remain unchanged; the new classification applies only to later runs.

## Provider and adapter capability

| Question | Current answer |
|---|---|
| Disable reasoning | Yes. Official Chat Completions accepts `thinking.type = disabled`; the Harness adapter exposes the adapter-owned effort `off`, serializes that toggle, and omits `reasoning_effort`. |
| Selectable reasoning efforts | The official endpoint distinguishes `low`, `high`, and `max`; `medium` maps to `high`. Harness exposes `off`, `low`, `high`, and `max`, so it does not omit a distinct official effort. |
| Independent reasoning cap | No field exists in the current official Chat Completions request or Harness `GenerateOptions`. |
| Independent final reserve | No field exists in the current official request, adapter, LLM call config, or AgentLoop request config. |
| Shared output cap | Harness `maxTokens` serializes as `max_tokens`. Provider usage reports total completion tokens and a nested reasoning-token subset; the failed production response demonstrates that reasoning counts against this generated-token cap. |
| Parameter loss | The native adapter carries `thinking`, `reasoning_effort`, and `max_tokens`. It has no unused native reasoning-cap or final-reserve field to expose. |

The local implementation evidence is [`llm-deepseek` request serialization](../../packages/llm/llm-deepseek/src/serialize.ts), [usage translation](../../packages/llm/llm-deepseek/src/translate.ts), [provider configuration](../../packages/llm/llm-deepseek/src/index.ts), [LLM call configuration](../../packages/llm/llm/src/call-config.ts), and the [restricted Agent runner](../../packages/business/business-workbench/src/restricted-agent.ts). The external protocol evidence is the official [Thinking Mode guide](https://api-docs.deepseek.com/guides/thinking_mode/) and [Chat Completions reference](https://api-docs.deepseek.com/api/create-chat-completion/).

## Candidate decision

Candidate A, an independent reasoning token limit, is unavailable. Candidate B is selected: `provider = deepseek-official`, `model = deepseek-v4-flash`, `reasoningEffort = off`, `maxTokens = 4096`, and `timeoutMs = 90000`. The deployment plugin may remain thinking-enabled because the Business request's explicit `off` wins per request. This report freezes the next production-experiment candidate; it does not modify the currently installed production profile or authorize a production request.

Increasing the shared cap was not tested because disabling reasoning already produced a clear final reserve. No model change and no Harness Core change is required.

## Final output guard

Future empty Restricted Agent results now use diagnostic version `2`. A response with finish reason `max-tokens`, positive reported reasoning tokens, and zero final-text bytes fails as `REASONING_BUDGET_EXHAUSTED`; other empty results remain `EMPTY_AGENT_OUTPUT`. The diagnostic records provider, model, requested reasoning effort, `maxTokens`, input/output/reasoning token usage, final-text bytes, finish reason, duration, Agent Run id, Session id, event counts, and failure stage. It records no prompt, response body, or credential. Successful transient metrics now carry the normalized finish reason.

This classification does not reinterpret either preserved historical failure and does not change Business schema version `5`.

## Size-matched safe smoke

The test used the production resolver, `xhs-body-prepare-v0`, Restricted Agent Runner, production message assembly, exact Skill materialization, deny-all tools, extraction, and output-bundle settlement. Its task card, writing rule, golden sample, and S3 Skill were synthetic files totaling `27,500` bytes in a temporary Vault and temporary `DSH_HOME`.

| Metric | Result |
|---|---:|
| Provider response configuration | `deepseek-official / deepseek-v4-flash / off / 4096` |
| Input tokens | `5058` |
| Output/final tokens | `10` |
| Reasoning tokens | `0` |
| Final draft bytes | `28` |
| Finish reason | `stop` |
| Agent duration | `691 ms` |
| Tool calls / forbidden executions | `0 / 0` |
| Stored / participating Jobs | `1 / 1` in a temporary single Batch |

Two safe invocations were initiated, which is the authorized maximum. The sandboxed attempt failed at transport before a model response; the unchanged host-network attempt succeeded. There was no automatic retry. The content-free reports are `/private/tmp/business-layer-v0.1-phase4c1t-safe-smoke.json` (SHA-256 `ae21c8cd51e060c3db6f5a611da8e2dda52859fbb9eb2610ce9546bf97231520`) and `/private/tmp/business-layer-v0.1-phase4c1t-safe-smoke-host.json` (SHA-256 `a5aafae98b7acdfccc60057d090236efcfdc63a0d88cc4e88b35a745ede33be2`).

## Safety and remaining risks

Production source data sent to the provider was zero. The test did not resolve, read, or write the production Vault and did not run `note002`. The production Business storage remained SHA-256 `53700b879c8c4b825becaff6d69866e0343ba51c1b0d3bafffeb57dc75e33a66`. Schema version remains `5`; tool, Workspace, Skill discovery, subagent, Production Resolver, S3 adapter, output-bundle, and Job semantics are unchanged.

The remaining risks are content quality and full 400–600-character completion without reasoning, the fact that deployment configuration rather than schema enforces the selected effort, and provider behavior drift after an upstream API or model revision. The next real First-Pass experiment requires explicit authorization, a fresh Job and Attempt, a preflight showing `off / 4096`, unchanged production-source hashes, and exactly one production request. No real draft should run under `low / 4096` again.
