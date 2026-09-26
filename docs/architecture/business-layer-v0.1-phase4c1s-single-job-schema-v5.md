# Business Layer V0.1 Phase 4C-1S: single-Job persistence and schema version 5

English | [中文](business-layer-v0.1-phase4c1s-single-job-schema-v5.zh.md)

Phase 4C-1S corrects one measured data-model defect before the first real-draft retry. Schema version 4 always allocated four Jobs even when an experiment authorized only one. The three unused Jobs were durable historical facts, but treating them as participants would corrupt future first-pass, failure, revision, duration, intervention, and throughput measurements. Version 5 adds only exact Batch participation; it does not add scheduling, Validation, review, promotion, or arbitrary N-Job execution.

## Version 5 Batch semantics

New callers must choose one closed creation mode:

| Mode | Stored Jobs | Participating Jobs | Creation use |
|---|---:|---:|---|
| `single` | 1 | 1 | one explicitly authorized article or later independent revision |
| `quad` | 4 | 4 | one formal four-article round with isolated Jobs |

`legacy-fixed4` is migration-only. It always retains the four Jobs that version 4 actually created and records the one or four Jobs with durable participation evidence. It cannot be supplied to `createBatch`. `businessBatchParticipation` returns the exact participant ids and closed expected/actual count for future metrics, so a migrated placeholder remains inspectable history without becoming a content-production denominator.

Creation remains crash-recoverable. A `single` Batch persists one input and one Job id before materialization; a `quad` Batch persists four. The existing per-Job revision, Attempt, lease, package, Agent Run, Artifact, output-bundle, and operation-receipt behavior is unchanged. Supporting `single` does not weaken four-Job isolation.

## Explicit V4-to-V5 migration

Runtime startup never migrates data. An unmigrated V4 file fails the normal version-5 open without mutation. The only operator path is `packages/business/business-workbench/scripts/migrate-v4-to-v5.ts`, which requires an exact storage path and approved source SHA-256.

The migration validates the complete V4 document and every Batch-to-Job and input relationship. Participation evidence is limited to durable facts: non-draft status, nonzero revision, current or historical Attempt, Artifact reference, operation receipt, or status reason. Exactly one or four evidenced Jobs is accepted. Zero, two, or three is ambiguous and fails without publication; orphan Jobs, mismatched ids, mismatched inputs, unknown versions, non-files, and symlinks also fail closed.

After validation, the migrator renders version 5 to a random exclusive sibling and atomically renames it over the approved file. It rechecks the source hash immediately before publication and verifies the target hash afterward. Re-running against valid V5 is read-only and reports `already-current`. This is one explicit migration, not a general migration framework.

## Production recovery point and migration

Before stopping the production Runtime, the V4 storage and Business artifact directory were copied into `<PRIVATE_RECOVERY_DIR>`. The directory is mode `0700`; its files are mode `0600`. It contains the original storage, artifact archive, recovery manifest, migration result, and content-free provider-smoke report.

| Evidence | Value |
|---|---|
| V4 storage SHA-256 | `0e1d11936aaa181a9f04979e3d1fcf8ee8e6973be6df875b56ebde4e5e81dd65` |
| V4 storage size | 19,627 bytes |
| Artifact archive SHA-256 | `2239fb6570d0a1c0aff4540254c15fac4ff50bc1682e116dea60b1a150487abd` |
| V5 storage SHA-256 | `f507f44206a6cf088594327e6934856f5e33b647a88233cdc9d795b0d3f5c707` |
| Pre/post counts | 1 Batch, 4 stored Jobs, 1 Attempt, 0 Artifacts |
| V5 participation | `legacy-fixed4`, 1 participant |

The App and its remaining Runtime child were stopped with normal termination before publication. The single production Batch and all four original Job ids remain present. A structural deep comparison proves all Job values unchanged, including status, revision, Attempt, Agent Run, source manifest, hashes, provenance, timestamps, operation receipts, and failure facts. The original Batch fields are also unchanged; version 5 adds only `mode` and `participatingJobIds`.

The executed Job remains `failed` at revision 6 with one failed Attempt and zero Artifacts. Its historical code is `PROVIDER_ERROR`, because that run predates the new `EMPTY_AGENT_OUTPUT` classification; its preserved reason remains `business-workbench: restricted Agent produced no text output`. The three original placeholders remain `draft`, revision 0, with zero Attempts and zero Artifacts. Version 5 does not rewrite that history to claim the earlier Batch contained one stored Job.

The rebuilt Mac App opened the V5 storage, retained its target hash, and served HTTP 200 on its local Runtime. No production Obsidian source was read or written during backup, migration, or restart verification.

## Regression and recovery coverage

Keyless package coverage verifies normal legacy migration, Job-id retention, Attempt and Artifact-reference retention, revision and failure retention, ambiguous-input rejection, failed atomic publication preserving exact V4 bytes, idempotent V5 re-entry, and an unmigrated V4 file rejecting at V5 open. A synthetic `single` chain covers Batch → one Job → Attempt → lease → execution package → Restricted Agent fixture → output bundle → CAS → Runtime restart → verified recovery, with no extra Jobs. Existing `quad` coverage continues to prove four distinct participating Jobs and per-Job isolation.

The Business Workbench suite passed 67 tests across 10 files. The Host TypeScript build, Host bundle build, focused lint, generated Cordis surface, and whitespace checks passed. Phase 1 through Phase 4C-1R behaviors remain covered by the same package suites: persistence, CAS, lease and recovery, read and Skill policy, input and Skill drift, deny-all tools, output settlement, source resolution, and empty-output diagnostics.

## Size-matched real-provider smoke

After migration and keyless checks, exactly one real request ran through the production Restricted Agent route with `deepseek-official / deepseek-v4-flash`, reasoning effort `low`, and 4,096 maximum output tokens. Its temporary `single` Batch had one stored and one participating Job. The four synthetic inputs matched the measured production sizes: task card 6,561 bytes, writing rule 3,058, golden sample 3,230, and S3 source 4,795, for 17,644 bytes and 3,452 provider input tokens.

The request passed on its first and only invocation, returned a 57-byte safe fixture draft, made zero tool calls, and executed zero forbidden tools. The test used an isolated temporary DSH home and Vault, removed them afterward, and wrote only a content-free report. It sent no production source, created no production Job, and left the production V5 storage hash and mtime unchanged. The report SHA-256 is `e887ad02feb29b55b47fedb524e112d2f90521ac826cedb4c3cde30a7d5f2b60`.

## Schema freeze and Phase 4C-1 retry prerequisites

Schema version 5 is frozen through the planned 1 → 4 → 12 → 20 first-pass quality sequence. Ordinary features must not advance it. A later change requires separate approval and evidence of data corruption or a truly blocking model defect.

Phase 4C-1 may be re-authorized only as a new explicit experiment. It must use `single`, create exactly one new Job and one approved Attempt, keep the same production source and Restricted Agent policies, permit no automatic retry or revision, and stop after one successful intermediate draft or the first failure. This phase did not generate or retry the real `note002` body.

Harness Core, AgentLoop, WorkflowEngine, Session format, Skill Registry, Workspace, model configuration, production sources, and Obsidian assets were not modified.
