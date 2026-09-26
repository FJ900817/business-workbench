# Agent Note: Keep XHS text generation separate from Host JSON encoding

Status: implemented

English | [中文](2026-09-03-business-xhs-text-output.zh.md)

## Problem

The minimal model response `{draft: string}` still requires JSON escaping around long Markdown. A successful provider response can fail settlement before any authoritative draft exists. Sample 03 retained a JSON-parse failure but no raw final text, so its precise syntax cannot be reconstructed. The [experiment evidence](../../../../docs/experiments/business-layer-v0.1-phase4c2c-structured-output-reliability.md) limits the incident conclusion accordingly.

## Decision

Policy `xhs-body-prepare-policy-v2-text` asks the Restricted Agent for final Markdown only. The Business Host performs deterministic JSON encoding and retains the strict internal draft schema, metadata, provenance, atomic bundle publication, and V5 storage format. This supersedes only model-authored JSON in the [XHS output-bundle decision](../architecture/2026-08-31-business-xhs-production-gate.md); its source and single-result guarantees remain active.

The transport removes one initial BOM and otherwise preserves text. JSON-container and code-fence prefixes are reserved and rejected rather than guessed or extracted. A reported token-limit stop rejects even nonempty text. Diagnostics distinguish syntax, schema, missing draft, truncation, unsupported format, empty text, invalid characters, and byte limits, recording hashes and observed finish reasons in the existing failure string. They do not retain raw content or fabricate missing finish evidence.

## Alternatives considered

**Native JSON mode.** The current LLM request types and DeepSeek serializer expose no `response_format` path. Enabling it is not a Business-only configuration change; no Core modification is needed for text output.

**Smaller model JSON.** The response already contains only `draft`, so removing machine metadata fields cannot solve this escaping dependency.

**Tolerant JSON extraction or model repair.** Rejected because format guessing obscures failures and a second model request violates first-pass identity. Fences are not stripped.

## Consequences

Model content and Host structure have separate responsibilities, while all existing output bundles remain readable without rewriting them. The parser validates transport, not content quality or semantic completeness. A draft beginning with a reserved prefix is rejected even if it could be valid Markdown. Provider omissions or a misleading `stop` still cannot prove complete content.

Synthetic parser cases and a Loader-based Agent composition pin Unicode/long-text preservation, deterministic rejection, persisted diagnostics, one authoritative bundle, repeated completion, and model-free recovery. Real-provider compliance with the new prompt remains unmeasured; any production retry requires new authorization and records the new policy version.
