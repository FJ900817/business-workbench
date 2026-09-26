# Business Layer V0.1 Phase 4C-1T

English | [中文](business-layer-v0.1-phase4c1t.zh.md)

- **Version:** Phase 4C-1T
- **Date:** 2026-09-02
- **UI:** unchanged; no screenshot required

## Before

The production-sized `deepseek-v4-flash / low / 4096` request could spend every generated token on reasoning and reach `max-tokens` with zero final text. Business Workbench classified every completed empty output as `EMPTY_AGENT_OUTPUT`, and successful transient metrics did not expose finish reason.

## After

The selected next-experiment configuration keeps the model and output cap but sends the adapter-owned effort `off`. A 5058-input-token synthetic production-path smoke returned 10 visible output tokens with zero reasoning, finish reason `stop`, and no tool execution.

Business Workbench classifies a future zero-final-text, positive-reasoning, `max-tokens` result as `REASONING_BUDGET_EXHAUSTED`, records the effective request budget facts in diagnostic version `2`, and reports finish reason for fresh successful results. Schema remains version `5`; production sources, stored failures, tool policy, Job semantics, and Harness Core are unchanged.

## Still unresolved

The next real draft must measure content quality with reasoning disabled and requires separate authorization. Deployment configuration must pin `off / 4096`, and provider behavior must be rechecked after an upstream model or API change.

Complete evidence is in the [Phase 4C-1T experiment record](../experiments/business-layer-v0.1-phase4c1t-reasoning-budget.md).
