# Agent Note: Preserve content-free evidence for empty Business Agent output

Status: implemented

English | [中文](2026-09-02-business-empty-agent-output-diagnostics.zh.md)

## Problem

The Business restricted-Agent runner rejected a completed turn without text using one generic provider error string. That record proved no draft was committed but did not preserve the normalized event facts needed to distinguish a missing assistant message, reasoning-only output, an output-token limit, or a later extraction failure. The original provider response is not durable, so an operator could not recover those facts after the Session was disposed.

## Decision

Classify a completed turn without visible text as `EMPTY_AGENT_OUTPUT`. Build a content-free diagnostic from the normalized Session event log before disposal: provider and model, Agent Run and Session ids, available response and finish identities, assistant/text/reasoning/tool/final-event counts, content-field type, extracted UTF-8 bytes, available token usage, duration, and extraction stage.

Expose that diagnostic on the immediate `BusinessWorkbenchError` and append the same JSON object to the existing durable Agent Run `failureReason`. This preserves schema version `4`; readers that treat `failureReason` as an opaque string remain valid. A provider or AgentLoop error before a completed assistant message retains its existing error classification.

The runner extracts only `text` blocks. Reasoning-only output therefore records its reasoning-event count and fails; it never becomes a draft. Empty output does not retry, change the model, or publish an Artifact or output bundle.

## Alternatives considered

**Persist a new structured field on `BusinessAgentRun`.** Rejected because the production experiment freezes storage schema version `4`; adding a durable field requires a version change and an explicit compatibility decision.

**Change the provider adapter or AgentLoop to persist raw responses.** Rejected because Business Workbench can diagnose its owned extraction path from normalized events, while raw transport retention would widen the Harness Core change and could retain sensitive response content.

**Use reasoning content when text is empty.** Rejected because reasoning is not the requested Business artifact and treating it as a draft would conceal the failure.

## Consequences

Future empty-output failures retain enough non-sensitive evidence to locate the failed stage and compare provider completion behavior without replaying the model request. A response id remains absent when the current successful-response event vocabulary does not expose one. Historical runs keep their original failure string and cannot be retrospectively classified beyond the evidence already stored.

Schema version `4` still requires exactly four Jobs per Batch. This diagnostic change does not claim a single-Job execution mode or manufacture placeholder semantics; a truthful single-Job experiment remains a separate storage-model decision.
