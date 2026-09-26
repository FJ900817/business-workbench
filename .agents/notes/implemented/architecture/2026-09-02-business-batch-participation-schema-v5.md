# Agent Note: Record exact Business Batch participation in schema version 5

Status: implemented

English | [中文](2026-09-02-business-batch-participation-schema-v5.zh.md)

## Problem

Business schema version 4 allocated four Jobs for every Batch. A caller could execute only the first Job, but the durable Batch did not distinguish that participant from the three unused placeholders. Preserving the original Jobs is required for auditability, while counting all four as production participants would corrupt future quality and throughput metrics. New single-article experiments also need to persist one Job without weakening the four-Job isolation path.

## Decision

Advance the Business storage domain to version 5 and add closed Batch modes `single`, `quad`, and migration-only `legacy-fixed4`. New `single` Batches own one input, one stored Job, and one participant. New `quad` Batches own four inputs, four stored Jobs, and four participants. `legacy-fixed4` owns the four Jobs created by V4 and separately records one or four participant ids. The public participation projection exposes only those ids and their closed count to future metrics consumers.

Provide one explicit V4-to-V5 JSON migration script rather than startup migration or a migration framework. It validates the entire V4 graph, admits only one or four Jobs with durable participation evidence, requires an approved source hash, publishes through an atomic sibling rename, and verifies the target hash. Ambiguous evidence fails before publication. Normal V5 startup rejects V4 unchanged.

Preserve every V4 Batch and Job field. The migration may add only `mode` and `participatingJobIds` to each Batch and advance the unit version. Historical placeholders remain stored Jobs and remain visible through `listJobs`; they are excluded only from the participation projection.

Freeze schema version 5 through the first 1 → 4 → 12 → 20 quality experiment sequence. A subsequent storage change requires separate approval for corruption or a blocking data-model defect.

## Alternatives considered

- **Delete V4 placeholder Jobs.** Rejected because it would rewrite the recorded experiment and invalidate ids, counts, and audit evidence.
- **Infer participants whenever metrics run.** Rejected because future code could apply different heuristics to the same durable history.
- **Allow arbitrary N-Job Batches.** Rejected because the current business requirements are exactly one or four, and general scheduling adds no value to the experiment.
- **Migrate automatically at Runtime startup.** Rejected because production migration requires a verified recovery point, explicit source hash, exclusive writer shutdown, and operator approval.

## Consequences

Single-article execution no longer creates empty Jobs, while four-article isolation remains unchanged. Migrated history is explicit and metrics-safe without pretending the original storage contained one Job. V4 requires the one operator migration before a V5 Runtime can open it. The migration intentionally cannot resolve a legacy Batch with zero, two, or three evidenced participants.

The change touches only `dsh-business-workbench`, generated API documentation, and Business records. It adds no Workflow, Validation, Human Gate, UI, Obsidian writer, automatic retry, or Harness Core behavior.
