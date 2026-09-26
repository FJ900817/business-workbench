# Phase 4C-1F: First-pass finalization recovery

English | [中文](business-layer-v0.1-phase4c1f-finalization-recovery.zh.md)

## Incident and cause

The temporary operator script `/private/tmp/dsh-first-pass-off-mWvBNbkj/experiment.spec.ts:237` called `ctx.dispose()`. Cordis exposes `ctx.fiber.dispose()`; the checked-in production experiment and Business fixtures already use that API. The erroneous cleanup ran before the report write and masked an earlier caught exception. That earlier exception was not persisted and cannot be identified with certainty. Missing reasoning usage is distinct from observed zero; a fixture verifies that distinction without claiming it proves the original exception.

The Business Host had a separate recovery gap: `runRestrictedAgent` committed an authoritative intermediate bundle and completed its Agent Run, while Job/Attempt completion remained a caller action. Successful metrics were returned only in memory. Fixing cleanup alone would not recover a process crash between those operations.

## Repair

The [Business package](../../packages/business/business-workbench/README.md) supplies idempotent output-based execution completion and uses it for abandoned XHS executions. It verifies existing output and frozen provenance without model, credential, Skill, or source access. Missing telemetry is preserved in an owner-private observation receipt; no V5 fields or immutable bundle bytes change. Fresh XHS observations are fsynced before output settlement. This operation is not content approval, asset Finalize, or Obsidian Promote.

The title `设计留白总觉得空？用三个维度自检是否有效` contains 20 full characters. The Markdown `# ` prefix is syntax, not title content. The existing model-authored label says 22 and remains unchanged; the machine observation records 20 and a mismatch. No body-count parser or full content validator is claimed.

## Production recovery evidence

The generated plan and protected before-state copy precede recovery of Job `0fefdb1c-fc24-4f78-a8ba-feec2b010b56`, Attempt `7ba0cb03-e522-4e8f-a19e-2d6316ae547d`. Evidence lives under `~/.dsh/business-workbench/v0.1/experiments/phase4c1f-finalization-recovery-6kB856dD/`. At `2026-09-03T13:51:31Z`, the Job and Attempt became completed, the lease became released, and the original completed Agent Run stayed unchanged. Two repeated finalizations and another Business Runtime mount preserved the same state. Other Jobs and Batches stayed identical.

Draft SHA256 remains `ff9224d5039a8b3ef5342e84357a65dd0f20a34328072bb82f2bddf1cb7cd29f`; all three bundle files remain byte-identical. Storage SHA256 changed from `6b95583aa9b0fbd96199623fb5b8b4f0f8ffb6b0216b13e2e119d84d7b7ad305` to `6137d7eb63cca57b1e6e59bcb39d59ca0d5b13016801fdf9aa441161e1262c26`. Schema stays V5. Historical missing tokens, finish reason, and transient timing remain unavailable. Provider calls, Obsidian writes, Draft edits, and Harness Core edits are zero.

## Verification scope

Synthetic tests cover the restricted Agent to authoritative output path, one completion receipt, released leases, restart through a real Loader composition with no model service, legacy missing telemetry, unavailable reasoning usage, and corrupt output/observation refusal. Existing execution safety and schema tests remain in scope. No real model test, content generation, UI change, or production-source modification is performed.

The Business suite passes 76 tests across 10 files; the final focused rerun passes all 9 XHS tests. Type checking, the Business artifact build, and the repository lint leaf pass. `doc-sync` reports 25 passed and 3 failed: the global Cordis API catalog, configuration catalog, and configuration-catalog translation pairing remain stale. The Business subsystem API documentation is regenerated; unrelated global generated files are not changed. The crash fixture restarts from the committed-output window, not an operating-system kill test.
