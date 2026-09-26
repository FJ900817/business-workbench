# Business Layer V0.1 Phase 1

English | [中文](business-layer-v0.1-phase1.zh.md)

Phase 1 adds one Host-only package, [`dsh-business-workbench`](../../packages/business/business-workbench/README.md). It is the durable authority for XHS Batch, Business Job, Attempt, and Artifact facts. It adds no Agent, model request, Skill, Workflow, Validation, Browser plugin, Remote API, UI, or Obsidian writer. The preceding fit decision is recorded in the [architecture audit](business-layer-v0.1-fit-audit.md); the implementation decision is recorded in the [Agent Note](../../.agents/notes/implemented/architecture/2026-08-28-business-workbench-job-authority.md).

## Physical architecture

The Web Host profile mounts the package after `storage-domain`. Business records use the `business_workbench` storage domain through the profile's configured backend. With the current JSON backend this resolves below `$DSH_HOME/storages/`; Artifact bytes resolve below `$DSH_HOME/business-workbench/v0.1/`. Tests provide temporary roots and remove them after each case, so they never use production `~/.dsh`.

One package is sufficient because Phase 1 has one owner and no independently evolving Browser or execution role. Splitting persistence, state, and Artifact publication would add coordination without adding isolation.

## Durable data

Schema version `0` owns two tables: `batches` and `jobs`. A Batch stores the closed `xhs` Project, `xhs-body` type, four ordered input references, four preallocated Job ids, and a creation marker. A Job stores its lifecycle state, monotonic revision, current Attempt, immutable Attempt history, immutable Artifact references, and idempotency receipts. Unsupported schema versions fail during domain open; Phase 1 performs no implicit migration.

Batch creation first persists a `creating` record containing all four ids and inputs. It then creates only missing matching Jobs and finally changes the Batch to `ready`. Startup completes this protocol before the service publishes. Conflicting Job ownership or input data fails startup. The public API does not expose independent Job creation, so a ready Batch always resolves to exactly four Jobs.

## State and concurrency

The Phase 1 Job lifecycle is `draft -> ready -> running -> completed | failed | cancelled`, plus `failed -> ready` for explicit retry. `createAttempt` alone enters `running`; `completeAttempt` alone enters `completed` or `failed`. Cancelling a running Job also closes its current Attempt. Completed and cancelled Jobs are terminal.

Every Job mutation requires `expectedRevision` and a caller-stable `idempotencyKey`. The service serializes local mutations, compares the persisted revision, and rejects stale writers with `REVISION_CONFLICT`. It retains a fingerprinted operation receipt in the Job record. An exact retry returns the existing fact without another revision; reuse of the key for different input fails with `IDEMPOTENCY_CONFLICT`. Each Job has independent state and revisions, so one Job failure does not change the other three.

Attempts are append-only history entries. A new Attempt receives the next one-based sequence. Terminal completion changes the matching running Attempt and the Job in one record update. History is never replaced by a new retry.

## Artifact commit protocol

Artifact ids and paths are deterministic for the Job, Attempt, type, and operation key. The store writes UTF-8 bytes to a private staging file, fsyncs it, publishes with a no-overwrite hard link, syncs the destination directory, and only then commits the Artifact reference through Job CAS. Existing identical bytes are an idempotent success; different bytes at the same path fail. Startup and reads verify path containment, byte count, and SHA-256. The protocol can leave an unreferenced complete file if the state update fails, but it cannot expose a Job reference to partial or missing bytes.

## Restart behavior

Startup recovers interrupted Batch creation, validates every ready Batch-to-Job relation, and verifies all referenced Artifacts before accepting mutations. Durable Job states, including `running`, remain unchanged across a clean Runtime restart. Phase 1 starts no executor, so it does not infer whether a retained running Attempt is alive; Phase 2 must add an explicit interrupted-execution policy before Agent execution is enabled.

## Verification

Focused tests cover the closed state machine, exact four-Job Batch creation, four-Job isolation, stale revision rejection, idempotent retry and conflicting-key rejection, immutable Attempt history, atomic and idempotent Artifact publication, corruption detection, real Loader composition, cold restart, all five interrupted Batch creation points, unsupported schema rejection without file mutation, and package invariants.

## Known risks and Phase 2 dependencies

- The JSON backend is a single-Runtime writer. Two processes must not mount the same Business domain for one `DSH_HOME`.
- Schema migration, backup orchestration, and explicit recovery of abandoned running Attempts are required before the format or execution semantics change.
- A crash after Artifact publication but before state commit can leave a deterministic orphan. It is inaccessible through the service and safe to reuse, but cleanup remains deferred.
- Phase 2 may add an execution adapter and a narrow Host/Browser API only after defining execution leases, Project read policy, and authorization. It must reuse this service rather than duplicate Job state in Session history.
