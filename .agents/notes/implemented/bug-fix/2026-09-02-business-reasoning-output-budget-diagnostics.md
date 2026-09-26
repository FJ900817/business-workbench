# Agent Note: Business reasoning-output budget diagnostics

Status: implemented

English | [中文](2026-09-02-business-reasoning-output-budget-diagnostics.zh.md)

## Problem

A restricted Business Agent can receive a successful provider stream whose generated-token allowance ends during reasoning. Treating that result as a generic empty output loses the distinction between extraction failure and a request that had no remaining budget for final text. Increasing one shared cap does not reserve any final output.

## Decision

Business Workbench classifies an empty response as `REASONING_BUDGET_EXHAUSTED` only when the normalized finish reason is `max-tokens`, reported reasoning tokens are positive, and extracted final text is zero bytes. Every other empty response remains `EMPTY_AGENT_OUTPUT`.

Diagnostic version `2` records the requested reasoning effort and `maxTokens` together with provider/model identity, token usage, final-text bytes, finish reason, duration, Agent Run and Session ids, event counts, and failure stage. It excludes prompts, response bodies, and credentials. The existing durable Agent Run failure string carries the JSON; Business schema version `5` does not change. Successful transient metrics include finish reason.

The DeepSeek production candidate uses the existing per-request effort `off`, which the native adapter serializes as disabled thinking. The package does not hard-code a provider or cap: deployment configuration owns the exact route and budget.

## Alternatives considered

**Add independent reasoning and final-output budgets.** The current official Chat Completions request, Harness `GenerateOptions`, adapter, and AgentLoop expose no such fields. Adding inert Business fields would falsely advertise enforcement; adding a new Core request vocabulary has no provider field to carry.

**Increase `maxTokens`.** A larger shared cap still permits reasoning to consume the complete allowance and spends more tokens without a final reserve. It remains a later option only if disabled thinking fails a production-quality evaluation.

**Convert reasoning text into the draft.** Reasoning is not user-visible final content and may violate the XHS output contract. Extraction continues to accept only text blocks.

**Block one exact provider/model/effort tuple in code.** A hard-coded deployment-specific tuple would violate the package's deployment-owned model policy and become stale as providers change. The next production experiment instead requires a configuration preflight and explicit authorization.

## Consequences

Operators can distinguish reasoning exhaustion from ordinary empty output without reading content, and one successful production-sized safe fixture proves that `off / 4096` leaves visible output capacity on the current DeepSeek V4 Flash route. The decision does not claim content-quality equivalence with reasoning enabled. Provider API drift and deployment misconfiguration remain operational risks, so every real experiment records its effective route and budget.
