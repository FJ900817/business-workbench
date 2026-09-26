# Business Layer V0.1 Phase 4C-1R

English | [中文](business-layer-v0.1-phase4c1r.zh.md)

- **Version:** Phase 4C-1R
- **Date:** 2026-09-02
- **UI:** unchanged; no screenshots required

## Before

A completed Business Agent turn without visible text produced only a generic provider error string. The historical Phase 4C-1 record therefore proved zero extracted text and zero tool calls but retained no finish reason, event counts, token usage, or extraction-stage evidence. A single-note experiment also required a four-Job Batch under schema version `4`.

## After

Business Workbench classifies completed empty output as `EMPTY_AGENT_OUTPUT` and records content-free event counts, available completion facts, Agent Run and Session identity, duration, and extraction stage in both the immediate error and the existing durable failure string. Reasoning-only output remains an error, no retry or fallback exists, and schema version `4` is unchanged.

Deterministic production-path fixtures cover normal, empty, reasoning-only, multi-delta, provider-style reasoning-plus-text, and truncated responses. One real-provider safe fixture passed through the same production restricted runner with zero tool calls and no production data or state write.

## Still unresolved

The historical raw provider response was not retained, so its exact empty-output cause remains unknown. Current successful Session events do not expose a provider response id. Schema version `4` still cannot represent a truthful independent single-Job experiment without a storage-model decision.

The complete evidence is in the [Phase 4C-1R experiment record](../experiments/business-layer-v0.1-phase4c1r-provider-output-recovery.md).
