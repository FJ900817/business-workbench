# Phase 4C-2C: XHS structured-output reliability

English | [中文](business-layer-v0.1-phase4c2c-structured-output-reliability.zh.md)

## Incident evidence

Sample 03 made one provider request and produced nonempty final text. The Business Host then raised `XHS_BODY_OUTPUT_INVALID` at `JSON.parse`; HTTP status was 200, finish reason was `stop`, output usage was 699 tokens, and tool-call count was zero. Neither the raw provider response nor the Agent final text was persisted. Therefore the only supported classification is “nonempty final text was invalid JSON”; Markdown, fence, escaping, reasoning mixture, and truncation cannot be distinguished. Raw output is unavailable.

The failed Job `18a4b724-1298-48d3-b51c-6f49d84be261` and Attempt `2479880e-50c6-4fdb-9073-1339e7d87d9d` remain failed without a bundle or replacement Attempt. Sample 04 remains awaiting authorization.

## Prior output requirements

`xhs-body-prepare-v0` instructed the model to return one strict JSON object with required string field `draft`, no optional or additional fields, and JSON escaping for all Markdown quotes and newlines. Markdown fences were invalid. The model did not generate metadata, provider facts, source hashes, provenance, or Artifact relations; the Host already generated those values. The provider request used ordinary text output because the current Harness LLM request type and DeepSeek serializer do not expose `response_format`.

DeepSeek documents a native [`json_object` response format](https://api-docs.deepseek.com/guides/json_mode), including prompt and token-limit constraints, and the [chat-completion API](https://api-docs.deepseek.com/api/create-chat-completion) documents both `response_format` and thinking controls. This repository's adapter does not pass that option. Adding it would require an LLM API and serializer change outside the approved Business scope, while native JSON mode guarantees neither the application schema nor non-truncation.

## Selected strategy

Policy `xhs-body-prepare-policy-v2-text` uses text-first deterministic wrapping. The Restricted Agent returns only the complete Markdown draft, with no JSON, outer fence, or transport commentary. The Host removes one initial BOM, rejects reserved JSON/fence prefixes and invalid output conditions, then encodes `{draft}` with `JSON.stringify`. The existing strict internal parser builds `draft.md`; Host-owned code continues to create `draft-metadata.json`, `provenance.json`, hashes, relations, and the authoritative intermediate bundle.

The only tolerance is removal of one initial BOM. Leading/trailing whitespace, quotes, newlines, and Unicode are preserved. Fences are not stripped, JSON is not extracted or repaired, malformed structures do not fall back to text, and no second AI request occurs. `max-tokens` is classified as `truncated`; an invalid JSON prefix with `stop` remains `invalid-json` because truncation cannot be inferred.

Future `XHS_BODY_OUTPUT_INVALID` details distinguish `invalid-json`, `schema-invalid`, `missing-draft`, `truncated`, `unsupported-format`, `empty-draft`, `invalid-character`, and `too-large`. They retain stage, UTF-8 byte count, SHA-256, and an available finish reason without response text. The unchanged V5 record stores the diagnostic in the existing Agent Run failure string.

## Verification

Synthetic coverage accepts plain Markdown, quotes/newlines, Unicode, and a 500-character Chinese body without changing bytes. It rejects strict or fenced model JSON, fenced Markdown, malformed or truncated JSON, missing/wrong/extra fields, arrays, empty text, NUL/BOM, oversized output, and non-success finish reasons. Internal Host JSON remains strict. A real Loader composition verifies the Restricted Agent prompt, empty tool list, three output files, byte-identical draft, one model call, one authoritative bundle, duplicate run replay, duplicate finalization, and reconciliation. Rejected output persists one content-free classification, produces no bundle, makes no automatic retry, and survives restart.

The Business suite passes 113 tests across 11 files. Package TypeScript compilation and the built Business artifact pass. No real-provider request or production source was used.

## Production-history protection

SHA-256 verification covers the Business V5 storage file, Sample 01 review, the four-sample manifest, all Phase 4C-2B records, and the Sample 01 and Sample 02 three-file bundles. Sample 02 `draft.md` remains `6fa294268ff09aa5e05ce51d54ac13b278632bfc43862f2f670707bb4de6c2ca`; the storage file remains `3c5b541a85ac76c73715bad437011413f575c98ae9ed9f71924d600dbb1c6066`. No production Job, Attempt, output, source, or Obsidian asset was written.

## Decision

Phase 4C-2C passes with fixture evidence. A Sample 03 retry is not automatic: it needs explicit authorization for a new Attempt under the text-output policy. That retry remains the first real-provider measurement of compliance with the new prompt. Sample 04 must remain unstarted until the ordered experiment policy permits it.
