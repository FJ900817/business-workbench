# Business Layer V0.1 Phase 4C-1S

English | [中文](business-layer-v0.1-phase4c1s.zh.md)

- **Version:** Phase 4C-1S
- **Date:** 2026-09-02
- **UI:** unchanged; no screenshots required

## Before

Schema version 4 always created four stored Jobs. The first single-article experiment therefore left three zero-Attempt, zero-Artifact placeholders that would distort later quality metrics if counted as participants. Production storage contained one failed historical Batch that could not be deleted or rewritten.

## After

Schema version 5 has closed `single` and `quad` creation modes plus migration-only `legacy-fixed4`. A new `single` Batch creates exactly one Job; `quad` preserves four-Job isolation. The explicit participation projection excludes legacy placeholders from future metrics while retaining every historical Job and failure fact.

Production V4 was backed up, migrated through the explicit hash-gated operator path, reopened by the Mac App, and verified at HTTP 200. One 17,644-byte synthetic real-provider smoke passed through a temporary single Batch with zero tool calls and no production data. No production body or Obsidian asset was read or written.

## Still unresolved

The real `note002` draft has not been retried. Validation, Human Gate, revision, finalization, promotion, arbitrary Batch sizes, multi-Runtime writing, and automated migration remain outside scope. Schema V5 is frozen through the 1 → 4 → 12 → 20 quality sequence.

See the [Phase 4C-1S architecture record](../architecture/business-layer-v0.1-phase4c1s-single-job-schema-v5.md) for the migration and recovery evidence.
