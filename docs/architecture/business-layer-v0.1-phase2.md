# Business Layer V0.1 Phase 2: execution safety boundary

English | [中文](business-layer-v0.1-phase2.zh.md)

Phase 2 extends the existing Host-only [`dsh-business-workbench`](../../packages/business/business-workbench/README.md) package. It adds execution ownership, restart recovery, minimum execution packages, Project-scoped reads, input-drift detection, and read-only orphan reconciliation. It does not add Agent execution, model requests, a formal XHS Workflow, Validation, Human Gate, UI, Browser Remote, Obsidian writes, or changes to AgentLoop, WorkflowEngine, Workspace, or the global filesystem policy.

## Physical architecture

One package remains the smallest correct unit. The existing service is the sole writer for Batch, Job, Attempt, lease, package, and Artifact-reference facts. `BusinessReadBoundary` and `BusinessArtifactStore` are package-internal collaborators, not separately mounted plugins. The Web Host supplies the explicit `leaseDurationMs`; it intentionally supplies no production `readRoot`, so Phase 2 cannot read production business sources before a later deployment decision.

The JSON backend still assumes one Runtime writer per `DSH_HOME`. Phase 2 does not add a weak lock file: reliable cross-process exclusion would require its own ownership, stale-lock, and crash-recovery protocol. Deployment must not mount the same Business domain from two Runtime processes.

## Attempt and lease lifecycle

The lifecycle is `draft -> ready -> pending Attempt -> running -> completed | failed | cancelled` with `running -> interrupted -> pending new Attempt`. A failed Job may explicitly return to `ready`. Creating an Attempt does not imply execution. `acquireExecutionLease` is the only operation that changes the pending Attempt and Job to `running`.

A lease records Attempt, caller owner, Runtime instance, acquisition and renewal times, expiry, and status. Acquire, renew, release, complete, package creation, input read, and Artifact commit verify the current Attempt and owner. Mutations also use the Job CAS revision and persisted idempotency receipts. There can be only one pending or running Attempt per Job and one active lease for that Attempt.

Runtime construction creates a new random instance id. During startup, every persisted running Attempt owned by a different instance becomes `interrupted` with reason `runtime-owner-lost`; an expired current-instance lease becomes `interrupted` with reason `lease-expired`. The old Attempt, package, Artifact references, receipts, and bytes remain. Recovery never invokes execution and never creates an Attempt. A caller must explicitly create the next sequence and acquire a new lease.

`getExecutionStatus` is derived from current time and Runtime identity, so an expired or foreign lease is never reported as owned even before the durable recovery method runs.

## Frozen execution package

One Attempt may receive one immutable package. Its manifest contains package, Project, Job, and Attempt ids; Workflow version; exact input entries; allowed read roots and files; declared capabilities and Skills; creation time; and a SHA-256 manifest digest. Each input records a nonblank role, normalized relative POSIX path, required flag, presence, source SHA-256, and byte count. Optional absence is frozen as absence, so later appearance is also drift.

Package ids derive from Job, Attempt, and idempotency key. Declaration arrays are normalized, deduplicated, and sorted. Input order remains caller-defined because roles may be ordered. The digest covers the persisted semantic fields in property order and is verified at startup and on explicit package verification.

Capability and Skill allow-lists are declarations only. No Skill registry or Agent consumes them in Phase 2. The future execution adapter must use the frozen package rather than rediscover capabilities.

## Read isolation

The Host accepts only relative POSIX paths below `xhs/` or `shared/product-truth/`. Empty segments, `.`, `..`, backslashes, POSIX absolute paths, Windows absolute paths, `gzh/`, `enterprise/`, `archive/`, and other shared roots fail before filesystem access. Each input must also match an exact allowed file or an allowed directory prefix in its package.

The resolver canonicalizes the configured root and every existing target with `realpath`, verifies containment, requires a regular file, and therefore rejects symlinks that resolve outside the root. It never enumerates the Obsidian tree or reads a directory to choose inputs. `readExecutionInput` accepts only an exact path already frozen in the package and rechecks the current lease after asynchronous I/O.

Current bytes are compared with the frozen presence, hash, and size. Mismatch returns `INPUT_DRIFT` with safe path and hash diagnostics but no content. The package is not mutated or regenerated.

## Artifact reconciliation

Atomic Artifact publication can leave a complete file when filesystem publication succeeds but Job CAS fails. `reconcileArtifacts` recursively scans only the private `projects` Artifact subtree, skips symbolic links, recognizes deterministic Artifact filenames, hashes unreferenced files, and returns summaries. It never deletes, adopts, references, or promotes a file.

## Durable format

Execution lease and package fields structurally change Job records, so `BUSINESS_WORKBENCH_SCHEMA_VERSION` is `1`. The pre-release format policy rejects Phase 1 schema v0 without changing the medium. There is no implicit migration. Before production enables Phase 2 against existing Business data, operators must retain a backup and run a separately reviewed explicit upgrader or start an empty Business domain.

## Verification

Focused tests use only temporary Harness homes and input roots. They cover one-owner acquisition, owner mismatch, CAS renewal, explicit release, expiration, restart owner loss, new Attempt creation, old package/Artifact retention, exact xhs and shared reads, unlisted paths, unrelated Projects, traversal, absolute paths, symlink escape, package digest verification, input drift, orphan discovery, four-Job isolation, Batch-create recovery, Artifact corruption, and schema v0/unknown-version rejection without medium mutation.

## Deferred work

Agent and Workflow adapters, actual Skill enforcement, Workflow-specific package templates, Validation, Human Gate, Remote/UI surfaces, Obsidian promotion, business metrics, cross-process writer exclusion, schema upgrader tooling, and orphan disposition remain outside Phase 2.
