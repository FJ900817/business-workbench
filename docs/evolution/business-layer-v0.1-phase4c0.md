# Business Layer V0.1 Phase 4C-0

English | [中文](business-layer-v0.1-phase4c0.zh.md)

- **Version:** Phase 4C-0
- **Date:** 2026-09-01
- **UI:** unchanged; no screenshots required

## Before

Phase 4B could execute `xhs-body-prepare-v0` only with safe fixture inputs and a runtime fixture Skill. Formal task cards, V3.0 rules, golden samples, and account S3 files had no deterministic Host adapter. A caller could not build a production-source package without manually supplying paths, and the durable package did not identify the formal entry or baseline.

## After

The Host now resolves one exact production slot from account/month/week/note, verifies the formal entry, baseline, confirmed task card, and source-task lineage, routes the note type to one rule and sample, and materializes one account S3 snapshot. The package persists content-free source evidence and rejects later input or Skill drift. The assembled snapshot records adapter version `xhs-production-source-v1`, contract schema `1`, exact route tables, no discovery, and no fallback.

One real read-only dry run resolved `account1 / 2026-08 / 第01周 / note002` and verified all four source roles. It used a temporary DSH home and stopped before Agent execution. No body, Artifact, output bundle, production Job fact, or Obsidian write was created.

## Still unresolved

Production Agent execution remains closed. Phase 4C-1 still needs an explicit one-Job `production` route, immediate source revalidation, the production S3-origin policy, and a manual review procedure. Validation, Human Gate UI, four-Job production, finalization, and Obsidian promotion remain deferred.

The complete design and dry-run evidence are in the [Phase 4C-0 architecture record](../architecture/business-layer-v0.1-phase4c0.md).
