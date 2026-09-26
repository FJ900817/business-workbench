# Jian Workbench Business Layer V0.1 Architecture Fit Audit

English | [中文](business-layer-v0.1-fit-audit.zh.md)

Audit date: 2026-08-27

Audited source: `ede36fe7b272f6461bb017602aa4cc8722249bfb`

Scope: the current repository source, the non-sensitive inventory of the current Web Profile, and the existing persistence, execution, filesystem, skill, Workspace, Workflow, Remote, and UI slot implementations. This report does not implement the Business Layer or modify production Workspace or Obsidian assets.

## 1. Executive Summary

The conclusion is **Revise**: Business Layer V0.1 is feasible without changing `AgentLoop`, `WorkflowEngine`, the Session core format, or the Harness Core control path, but several names in the design do not map directly to existing capabilities. Phase 1 can proceed after adopting the four adjustments below.

The four required adjustments are:

1. `ctx.jobs` cannot be the source of truth for business Jobs. [`jobs-local`](../../packages/jobs/jobs-local/README.md) is an in-process run-handle registry whose states cover only `running`, `stopping`, `completed`, `killed`, and `failed`; it does not recover after a Runtime restart. A new Host business service should persist Batch, Job, Attempt, Review, and Artifact references through [`storage-domain`](../../packages/storage/storage-domain/README.md).
2. The generic [`WorkflowEngine`](../../packages/workflow/workflow/README.md) cannot be the source of truth for a business Workflow. It runs foreground, holder-owned script Runs and does not persist scripts, steps, or intermediate state or resume after restart. V0.1 should implement the fixed, versioned Workflow as a durable state machine inside the business plugin. The Prepare Run and the Revision/Finalize Run are independent executions, with `waiting-review` as the durable business state between them.
3. Workspace, the filesystem sandbox, and the skill registry are not Project/Read/Skill authorization boundaries. [`fs-sandbox`](../../packages/fs/fs-sandbox/README.md) explicitly permits every read; `tools.restrict()` filters global tools only and does not remove tools registered inside an agent scope; the skill registry has no project filter API. The safest V0.1 approach is for the Host to assemble the minimum execution package, resolve only fixed allowed skills, hide the generic `skill`/`read`/shell tools, and expose only execution-package content or a business-specific read-only tool to the Agent.
4. The pending wait used by [`ask-user`](../../packages/client/ui-user-questions/README.md) does not survive a Host restart, while [`message-feedback`](../../packages/feedback/message-feedback/README.md) is keyed by Session message rather than Job. Human Gate and Task Feedback should be a durable sidecar of the business Job and be operated by the business UI through a business Remote API.

The complete V0.1 should contain **2 business packages**: one Host business package and one Browser UI package. A third `xhs-business` package should not be created yet; xhs is the first and only consumer, so its Workflow, Criteria, and rule adapter should remain internal modules of the Host package. Phase 1 creates only the Host package and closes Job, Persistence, and Artifact without starting an Agent, writing Obsidian, or building UI.

## 2. Current Harness Capability Mapping

| Design question | Reusable current capability | Fit conclusion |
|---|---|---|
| 1. Job persistence | [`storage-domain`](../../packages/storage/storage-domain/README.md) supplies Zod schemas, a domain version, serialized writes, and backend-first commits; [`workspace`](../../packages/workspace/workspace/README.md) and [`message-feedback`](../../packages/feedback/message-feedback/README.md) demonstrate durable sidecars, boot recovery, and compare-and-set. | A new business service owns Batch/Job state. Do not reuse `ctx.jobs` as the authority; at most, associate an optional runtime job id later to present the current process's execution handle. |
| 2. Session / Workspace | [`Session`](../../packages/core/session/README.md) is an append-only execution log; [`session-persistence`](../../packages/session/session-persistence/README.md) supports JSONL load, inspection, crash closure, and resume. Workspace durably records canonical directories and Session membership. | A Session records the transcript of one Agent Attempt, and the Job stores its `sessionId`. Workspace is only a project-directory selector and navigation aid; it stores neither business progress nor the Project authorization policy. |
| 3. Two Workflow Runs | [`ctx.agents.create()`](../../packages/core/agent/README.md) supports installing a preset, persona, tool restrictions, and listeners through `setup(agentCtx)` before the Agent is published; the completed Agent can be disposed while its Session remains durable. | The business state machine starts a Prepare/Generate/Validate Attempt and commits `waiting-review` when it ends. A human decision then starts a Revision or Finalize Attempt. The two Runs do not depend on pause support in the generic Workflow Run. |
| 4. Host-side skill allow-list | Trusted Host code can resolve a skill by name through [`ctx.skills.get()`](../../packages/skill/skill/README.md); [`skill-filesystem`](../../packages/skill/skill-filesystem/README.md) can load fixed roots; `tools.restrict()` can hide the generic `skill` tool. | Intersect the Project and Workflow lists, load each named skill on the Host, record its content hash, and place the result in the execution package. The Agent sees neither the skill catalog nor a way to choose another skill dynamically. |
| 5. Read allow-list | `ctx.fs` provides canonical targets, `contains()`, atomic writes, and version guards; agent creation can narrow tools. | The primary enforcement point must be the Business Host's Execution Package Builder. V0.1 should copy allowed content into the package and remove generic `read`, search, and shell tools. If delayed reads become necessary, add an agent-scoped read-only tool that accepts only a manifest entry id and validates containment after realpath resolution on the Host. |
| 6. Artifact location | [`dsh-home-paths`](../../packages/util/home-paths/README.md) consistently resolves `$DSH_HOME`; [`fs-local`](../../packages/fs/fs-local/README.md) already provides same-directory staging, fsync, atomic publication, `createIfAbsent`, and version guards. | Store state in `$DSH_HOME/storages/business_workbench.json`, produced naturally by the current Web storage configuration. Store large text artifacts below `$DSH_HOME/business-workbench/v0.1/projects/xhs/...`, partitioned by Batch/Job/Attempt/Kind. Obsidian receives only an explicitly promoted Approved Final. |
| 7. Batch / Job state owner | Cordis `Service`, effect lifecycle, and a storage domain are sufficient for a single-process local business service. | One Host plugin owns Batch, Job, Attempt, Review, Artifact references, and derived metrics. V0.1 should not split a Batch service, Job service, or scheduler. |
| 8. Validation Engine | Harness has Zod/JSON Schema, subagent structured output, tool results, and Session transcripts, but no generic business Validation Engine. | Hard Check is a set of pure deterministic Host functions. Semantic Check is a restricted Agent Attempt whose output parses into `PASS/WARN/FAIL + blocking + evidence`. The Validator only returns records and receives no Artifact write tool. |
| 9. Human Gate UI | [`ui-sidebar`](../../packages/client/ui-sidebar/README.md) declares the additive `sidebar.footer.action`; [`ui-layout`](../../packages/client/ui-layout/README.md) declares the additive `shell.overlay`; conversation also has session-scoped header, turn-tail, and input slots. | Use a sidebar footer action for the primary entry and a shell overlay for the workbench and Human Gate. Do not replace the `sidebar`, `conversation`, or `details` single slots; Session-inline status can be an optional later affordance. |
| 10. Task Feedback | message-feedback demonstrates a durable sidecar, per-item version tokens, conflicts carrying authoritative current state, and serialized writes per owner. | Reuse the pattern, not its data model. A Feedback record carries `jobId`, optional `batchId`, `reviewId`, scope, natural-language text, creation time, and target artifact hash; `expectedRevision` prevents a stale page from overwriting newer state. Revision packages include these records explicitly. |
| 11. Obsidian Promote | `ctx.fs` can perform atomic text writes and version guards, but the model-facing file tool's cwd, observation policy, and sandbox are not business publication authorization. | Add a non-model-visible `ObsidianPromoter` adapter inside the Host package: configure one destination root, enforce realpath containment, default to `createIfAbsent`, require an expected hash for explicit replacement, publish atomically in the destination directory, and record source/destination hashes. Agent and Validator can never call it directly. |
| 12. Reliability Metrics | [`session-stats`](../../packages/session/session-stats/README.md) covers only Session turns, steps, and durations; [`session-telemetry`](../../packages/session/session-telemetry/README.md) is best-effort reporting, not a business ledger. | Derive the minimum metrics directly from durable Job facts: `firstDraftApproved`, `humanFeedbackCount`, `revisionCount`, the four issue-class counts, engineering-error count, Attempt duration, and the pass/failure distribution of the 4 Jobs in a Batch. V0.1 does not need a new telemetry pipeline. |

### Recommended capability relationship

```text
Browser UI plugin
  -> typed Business Remote
    -> BusinessWorkbenchService (Job is authoritative)
      -> storage-domain / JSON state
      -> ArtifactStore under $DSH_HOME/business-workbench
      -> fixed xhs state-machine executor
        -> Execution Package Builder
          -> trusted skill lookup + content hashes
          -> explicit input/read manifest
        -> scoped Agent Session / Model
        -> Hard Check + Semantic Check
      -> durable waiting-review / review feedback
      -> host-only ObsidianPromoter after Approved

Session JSONL = execution transcript and diagnostics
Workspace = directory catalog and navigation
Neither Session nor Workspace = business state authority
```

## 3. V0.1 Architecture Fit Conclusion

The business lifecycle in the design is sound, but “Workflow” must mean the Business Layer's own versioned state machine rather than a `ctx.workflowEngine` `WorkflowRun`. The recommended fixed value is `workflowVersion = xhs-body-v0.1`. Every Attempt manifest should record every result-affecting Workflow version, skill content hash, Validator Criteria version, model/provider configuration, and input rule. During an accuracy trial, new Jobs continue using the frozen version; a rules change creates a new version and never changes how an existing Attempt is interpreted.

For each execution, the Business Host creates an internal Agent Session for the Job. Creation points `cwd` at the Attempt's execution-package directory and uses `setup(agentCtx)` to mount a dedicated preset/persona and restrict visible tools. Business state does not depend on that Session. A Session creation, model, or persistence failure marks only the current Attempt as `failed` or `interrupted`. After Host restart, boot recovery changes every `preparing`, `generating`, `validating`, `revising`, or `finalizing` state to `interrupted`; a user or recovery policy later creates a new Attempt instead of pretending to resume the middle of a model stream.

The Prepare Run covers Prepare, Generate, and Validate and ends completely after it commits `waiting-review`. Human Gate changes only durable review and Job state. Approval starts a Finalize Run; a change request starts a Revision Run, regenerates and revalidates, and returns to `waiting-review`. This follows the two-Run principle and avoids the current Workflow Run's lack of durable recovery.

The 4 Jobs may execute concurrently, but a Batch should not hold one shared mutable execution object. Every Job uses a separate Agent handle, AbortController, Attempt id, artifact directory, and state revision. Batch orchestration uses `Promise.allSettled` only to collect outcomes. storage-domain serializes commits within the service, and one Job failure must not cancel or roll back another Job.

## 4. Conflicts and Recommended Adjustments

| Conflict | Cause | Severity | Adjust design? | Recommended replacement |
|---|---|---|---|---|
| “Job” shares a name with `ctx.jobs` but not its semantics | Current jobs-local is an in-process background-call state registry and stores no business input, Review, Artifact, or restart state. | High | Required | Define `BusinessJob`/`ContentJob` and `BusinessWorkbenchService`; associate an optional runtime job id only when a running-process view is useful. |
| A fixed durable Workflow maps directly to WorkflowEngine | A Workflow Run is foreground, has no journal, resume, or saved workflow, and uses phase for observation rather than ordering. | High | Required | Use a pure state machine and versioned executor in the business plugin; keep the generic Workflow Engine out of the V0.1 primary path. |
| The engine automatically propagates a Workflow skill allow-list to each Agent | The worker-thread workflow `agent()` propagates schema/provider/model options but no per-step `toolFilter` or skill filter. | High | Required | Have the Business Host create a restricted Agent directly; resolve fixed skills on the Host and put their content/hash in the execution package without the generic skill tool. |
| workspace-write also restricts reads | fs-sandbox explicitly says that reads always pass; Workspace only canonicalizes and groups directories. | High | Required | Minimize the execution package and remove generic read/search/shell; add a manifest-id read tool only if required. |
| Project is equivalent to Workspace | A Workspace id represents a real directory and Session account, not an xhs classification or permitted-file set; one Obsidian root can contain several business projects. | High | Required | Define Project as a closed business-schema id, allowing only `xhs` in V0.1; validate each input against the project config's canonical root and relative-path rules. |
| Human Gate can reuse an ask-user pending interaction | A question wait's resolve/reject is Host memory and disappears after Host restart; it is also tied to one tool call. | High | Required | Use a durable `ReviewRecord` and UI commands. Waiting is the Job state `waiting-review`, not a suspended Promise. |
| Task Feedback can reuse the message-feedback table | message-feedback is addressed by Session/messageId and does not enter model context by default; business feedback must address Job/Batch/Artifact and enter a Revision package. | Medium | Required | Reuse the CAS and sidecar pattern, with a separate review table or Review entries in the Job. |
| UI can subscribe directly to storage-domain changes | `domain/changed` is Host-process-only and cannot be the Browser reconnect baseline. | Medium | Required | Business Remote exposes `list/get/command`; every reconnect or page open fetches the authoritative snapshot, while an explicit forwarded event or low-frequency polling is only an update hint. |
| Artifact can reuse chat deliverables | ui-deliverables derives one Turn's file display from successful tool locations and stores no business kind, approval state, hash, or Promote record. | Medium | Required | Use a separate ArtifactStore. A Session transcript may link an artifact, but deliverables is never the ledger. |
| One operation can atomically update several domain tables | Each storage-domain `put/delete/update` is atomic, but there is no cross-table transaction. | Medium | Required | Keep Job state and Artifact references in one Job record where possible; use a pending marker and boot recovery for Batch creation instead of assuming cross-table atomicity. |
| Semantic Validator may correct the source Artifact | Existing Agent/tool composition does not inherently prevent Validator file writes; generic file and shell tools broaden authority. | High | Required | Give the Validator `allow: []` or only a read-only business tool, supply input through the prompt/execution package, and restrict schema output to verdict and Evidence. |

## 5. Complexity Reduction Recommendations

1. Remove the generic Workflow Engine dependency from V0.1. The fixed state machine is the Workflow and eliminates a worker, dynamic script, Run mapping, and unrecoverable intermediate layer.
2. Let one Host service own Batch, Job, Attempt, Review, and Artifact references instead of five services. Derive Batch status from its 4 Jobs and persist only Batch-owned input, shared feedback, and version facts.
3. Do not build a generic Validation Engine. Keep Hard Check and xhs Semantic Criteria under `src/xhs/` in the Host package and produce one small `ValidationResult` type.
4. Do not build a virtual filesystem. The Host copies or serializes the minimum inputs before execution, and the Agent has no file-read tool by default. Add a manifest-id read tool only after a real large-file need appears.
5. Do not build a metrics or telemetry service. Derive business metrics from transitions, Review, and Validation records; defer report export.
6. Do not build a Batch scheduler. V0.1 always has 4 Jobs, uses a small concurrency limit and `Promise.allSettled`, and retries a Job only through an explicit command.
7. Do not implement full event sourcing. Use a monotonic Job `revision`, immutable Attempt/Review entries, and compare-and-set transitions; Session remains the model-execution event log.
8. Do not abstract multiple Project adapters in advance. Restrict `projectId` to `xhs` and keep xhs code internal to the Host package; extract a package only after a second real project exists.
9. Human Gate should be one workbench panel: Batch summary, 4 Jobs, Validation Evidence, Artifact diff/preview, and Approve/Return/Revise. Ordinary Prepare/Generate steps should not become per-step approval UI.

## 6. Stability Risk Table

| Risk | Level | Source basis and failure mode | V0.1 control |
|---|---|---|---|
| 1. Runtime upgrade breaks Business Layer | High | The repository is pre-release, and storage domain, Session format, Typert Remote, and Client slots carry no external compatibility promise; Client Remote is also an explicit build-time assembly. | Pin the Harness commit, business package version, and Profile lockfile; upgrade only through Test Candidate; add loader-composition, built-smoke, and persisted-data reopen tests. |
| 2. Third-party Profile Plugin affects the business layer | High | The current Web Profile loads `@linxin666/dsh-web-ui-all@0.2.9`, `@liustack/modlens@3.16.6`, and Git-commit-pinned GenUI and Attachments after official bundles; plugins can register Host services, agent-scoped tools, and UI slots. | Pin the current lockfile/commits; use a dedicated Business Agent preset that does not inherit third-party agent tools; occupy additive UI slots only; load the same Profile in Test Candidate regression. |
| 3. Job persistence compatibility | High | storage domain refuses a mismatched domain version; no generic migration exists, and the JSON backend has no cross-process lock. | Freeze `BUSINESS_DATA_VERSION = 0`; permit one Host writer; before every schema change, export/back up data and implement an explicit upgrader, never silent legacy defaults. |
| 4. Isolation of 4 parallel Jobs | Medium | Agent/LLM provider, Host process, and storage service are shared, while operation-local state can be separate and domain writes are serialized in-process. | Separate Attempt/Agent/AbortController/artifact roots; no batch-wide cancellation; `Promise.allSettled`; test that failure, timeout, or cancellation of one Job leaves the other 3 states and files unchanged. |
| 5. Runtime interruption or model-timeout recovery | High | Session can close an interrupted turn but cannot resume a model stream; Workflow Run has no journal/resume. | Mark transient Jobs `interrupted` at boot; store the latest durable checkpoint and Attempt sessionId; recovery always creates a new Attempt and never reuses partial output. |
| 6. Artifact duplicate writes and idempotency | High | `ctx.fs.writeText` without a guard atomically overwrites; a repeated network command or retry can commit twice. | Use unique artifact and command ids, `createIfAbsent`, return an existing reference for the same content hash, conflict on a different hash, and update Job references only after the file is durable. |
| 7. Duplicate Revision execution | High | UI retries, repeated clicks after disconnect, or Host timeout can start the model execution twice. | Require `expectedRevision`, `idempotencyKey`, and one activeAttempt per Job; a duplicate request returns the existing Attempt without starting an Agent. |
| 8. Accidental Obsidian overwrite | High | A generic write tool can replace an observed file, but its contract does not know business paths or human intent. | Make Promote a separate Host-only Approved-only operation with canonical root, target manifest, default no-overwrite, expected destination hash, pre-write backup/post-write hash, and ledger entry. |
| 9. Skill / Read Boundary failure | High | skill registry has no project filter, tool restrictions do not filter scope-local tools, fs-sandbox does not restrict reads, and absolute paths escape cwd. | Use a dedicated preset, fixed Host skill resolution, no generic skill/read/search/shell, and a custom read tool that accepts only manifest ids and enforces canonical containment at execution. |
| 10. UI and business state diverge | Medium | The storage-domain change feed is Host-internal; message-feedback also explicitly has no cross-tab push. | UI is never authoritative; reconnect/full refresh calls `list/get`; every command carries expected revision; a conflict returns authoritative current; live push only signals a refetch. |

## 7. Recommended Minimum Physical Architecture

The complete V0.1 should contain two business packages:

```text
packages/business/
  README.md
  business-workbench/                 # Host plugin, source of truth
    src/
      index.ts                        # Service lifecycle and public Host API
      types.ts                        # branded ids and data-only public types
      spec.ts                         # storage-domain schemas, version 0
      state-machine.ts                # closed transitions and CAS rules
      artifact-store.ts               # immutable local artifacts and hashes
      execution-package.ts            # project/read/skill boundary
      executor.ts                     # two-run Agent orchestration
      validation.ts                   # common PASS/WARN/FAIL vocabulary
      promote.ts                      # host-only Obsidian adapter
      metrics.ts                      # derived reliability figures
      xhs/
        workflow.ts                   # fixed xhs-body-v0.1 lifecycle
        criteria.ts                   # hard and semantic criteria
    tests/

packages/client/
  ui-business-workbench/              # Browser plugin only
    src/client/
      index.ts                        # sidebar.footer.action + shell.overlay
      controller.ts                   # Remote snapshot/CAS controller
      WorkbenchPanel.tsx              # Batch/Job/Review UI
    tests/
```

`business-workbench` is the sole business authority and writer; `ui-business-workbench` is only a typed Remote consumer. xhs does not become a third package because there is no second project, second Workflow kind, or independent release requirement. Extract `src/xhs/` into a separate plugin only when a second Vertical Slice proves that xhs rules and the generic Job service need to evolve independently.

Composition should use explicit entries in the existing Web Profile or an existing local bundle patch and should not add a third “business logic” plugin. The Host entry must follow `storage-domain`; the UI entry loads through the Client roster; the business Remote must join the explicit Client assembly in [`api-remotes`](../../packages/api/remotes/README.md), following the message-feedback pattern. The controlled-upgrade channel continues to pin the Profile and exact plugin versions.

## 8. Phase 1 Construction Scope

Phase 1 builds only the minimum Business Core / Job / Persistence / Artifact loop. It does not create an Agent, load a business skill, run Validation, implement Human Gate, write Obsidian, or add UI.

### 8.1 Files to add

- `packages/business/README.md`, `README.zh.md`, and `README.i18n.yaml`: new package-group responsibilities and mapping.
- `packages/business/business-workbench/package.json`, `tsconfig.json`, `README.md`, `README.zh.md`, and `README.i18n.yaml`.
- `src/index.ts`: `BusinessWorkbenchService`, domain open/close, serialized mutation, and boot recovery.
- `src/types.ts`: branded `ProjectId`, `BatchId`, `JobId`, `AttemptId`, and `ArtifactId` plus data-only API types.
- `src/spec.ts`: Zod schemas, `business_workbench` domain version `0`, `batches` and `jobs` tables, and a global pending mutation.
- `src/state-machine.ts`: states, legal transitions, terminal/transient classification, and compare-and-set.
- `src/artifact-store.ts`: directory derivation, path-traversal rejection, atomic create, SHA-256, idempotent reads, and existence verification.
- `src/invariant.ts`: package invariant registration; at minimum, validate the relationship between an active Attempt and a transient Job state and between Artifact kind and owning state.
- `tests/domain.spec.ts`, `state-machine.spec.ts`, `service.spec.ts`, `artifact-store.spec.ts`, `restart.spec.ts`, and `loader-composition.spec.ts`.
- An Agent Note in the same PR recording the Job authority, two-run execution, and Artifact commit order. Phase 1 implementation is non-trivial product behavior, so this audit report cannot replace its implementation decision record.

### 8.2 Existing files to modify

- `packages/README.md`, its Chinese pair, and i18n record: register the `business/` group.
- `tsconfig.host.json`: add the Host package project reference.
- `packages/bundle/web-app/package.json` and `cordis.patch.yml`: add and mount the Host plugin after `storage-domain`. If implementation chooses a controlled local Profile opt-in instead, replace these edits with the Profile patch and retain only one composition authority in the implementation PR.
- `pnpm-lock.yaml`: record only the new workspace importer/dependency graph, without upgrading existing versions.
- `docs/module-graph.md` and its generated records: update through the existing generator gate.
- Package catalog, README-limit, or invariant allowlists affected by the new package only when their owning gates explicitly require an update.

Phase 1 does not modify `api-remotes` or the Client roster because no Browser consumer exists yet; those changes belong to the Human Gate/UI phase.

### 8.3 Modules reused without modification

- `@deepseek-ai/dsh-storage`, `dsh-storage-domain`, and the current `dsh-storage-json` backend.
- `dsh-session`, Session JSONL persistence, and checkpoint policy.
- `dsh-workspace`.
- `dsh-agent`, `dsh-agent-loop`, subagent, Workflow Engine, and skill registry.
- Existing `dsh-fs` and `dsh-fs-local` implementations. Phase 1 ArtifactStore may compose their atomic semantics or the repository atomic-write utility without changing the FS seam.
- Every existing UI slot and third-party Profile plugin.

### 8.4 Data locations

- Business state: `$DSH_HOME/storages/business_workbench.json`. This is the natural result of the current Web Profile's storage-json root and the domain name.
- Artifact: `$DSH_HOME/business-workbench/v0.1/projects/xhs/batches/<batchId>/jobs/<jobId>/attempts/<attemptId>/<kind>/<artifactId>.md`.
- Artifact kinds: `input`, `intermediate`, `validation`, `review`, and `final`. Phase 1 may save every kind but does not implement Promote.
- Every Artifact reference stores at least `artifactId`, `kind`, `attemptId`, relative path, `sha256`, byte size, createdAt, and optional source hash. Absolute paths do not enter the portable manifest.

### 8.5 State machine

The fixed Job states are:

```text
created
  -> preparing
  -> generating
  -> validating
  -> waiting-review
  -> revising -> validating -> waiting-review
  -> approved
  -> finalizing
  -> completed

preparing | generating | validating | revising | finalizing
  -> failed | interrupted
```

Every Job record contains a monotonic `revision`, fixed `projectId = xhs`, `workflowVersion`, `batchId`, `activeAttemptId`, immutable Attempt summaries, Review summaries, and Artifact references. Every command carries `expectedRevision`. Equal state alone is not idempotency; repeated commands also carry an `idempotencyKey`. A retry from `failed`/`interrupted` creates a new Attempt and never reuses an old Attempt id. The Batch record stores 4 Job ids, shared input hash, optional batch-level feedback, and creation-protocol state; its display status is derived from the 4 Jobs.

### 8.6 Minimum Host API

- `createBatch(request)`: accepts only `projectId: 'xhs'` and exactly 4 resolved task-card references/snapshots; the same idempotency key returns the same Batch.
- `listBatches()`, `getBatch(batchId)`, and `getJob(jobId)`: return immutable snapshots.
- `transitionJob({ jobId, expectedRevision, idempotencyKey, transition, reason? })`: applies a closed transition and returns authoritative current state on conflict.
- `commitArtifact({ jobId, expectedRevision, idempotencyKey, attemptId, kind, content })`: atomically save and hash first, then commit the Job reference; the same key and hash returns the existing Artifact, while a different hash conflicts.
- `verifyArtifacts(jobId)`: read-only verification of references, file presence, size, and hash for boot recovery and acceptance.

The Phase 1 API consists of Host service methods. It exposes no Browser Remote and registers no model-facing tool.

### 8.7 Automated and failure-recovery tests

- Schema: unknown state, unknown Project, duplicate id, invalid time, invalid Artifact reference, and different domain version all fail explicitly.
- State machine: every legal transition succeeds, while skips, reversals, post-terminal mutations, and stale revisions fail.
- Batch creation: simulate interruption after writing the pending marker and after Job positions 0, 1, 2, 3, and 4; restart completes the same Batch or reports corruption explicitly and never creates a second Batch.
- Job isolation: a transition or Artifact failure in one of 4 Jobs leaves the other 3 records and directory hashes unchanged.
- Artifact: path traversal, symlink escape, duplicate id with different content, concurrent create, and write/hash mismatch fail; same-key same-content retry succeeds idempotently.
- Commit order: simulate a published file whose Job reference was not committed; after restart the authoritative state does not reference half-committed content. Simulate a Job reference to a missing file; boot enters an explicit degraded diagnostic and does not claim completeness.
- Runtime restart: reopen the service in every transient state, making the Job `interrupted` while preserving every non-transient state.
- Loader composition: boot a real cordis config against a temporary `DSH_HOME`, create Batch/Artifact, dispose, restart, and read them back without touching ambient `~/.dsh`.
- No external writes: a sentinel outside the test root stays unchanged, and Phase 1 contains neither an Obsidian adapter nor a model-facing tool.

## 9. Phase 1 Acceptance Criteria

1. Creating one Batch yields exactly 4 independent Jobs; after Runtime restart, their ids, states, revisions, and input hashes are identical.
2. Job is the sole business authority; deleting every related Chat Session, or never creating a Session, does not affect Batch/Job queries.
3. An invalid state, exception, or Artifact failure in one Job does not modify any sibling Job in the same Batch.
4. Every durable state change uses compare-and-set; a repeated command creates neither a second Attempt nor a different-content Artifact under the same id.
5. Artifacts live under the dedicated `$DSH_HOME/business-workbench` root and verify by SHA-256; production Obsidian receives no write.
6. After Runtime exits in any transient state and restarts, the Job becomes explainable `interrupted` and never remains apparently running or repeats execution automatically.
7. Missing, corrupt, or version-mismatched JSON state and incomplete Artifacts fail loud with diagnostics that contain no input body or credentials.
8. Focused tests, the real Loader composition test, typecheck, lint, build, and relevant doc-sync gates pass; model e2e is not required in this phase.
9. Git diff contains only the explicitly scoped Phase 1 files, necessary generated outputs, and Agent Note, with no Core, Workflow, Skill, UI, or production Profile-data change.

## 10. Explicitly Unmodified Areas

Phase 1 and later V0.1 work should not modify by default:

- `packages/core/agent-loop/` or AgentLoop behavior.
- `packages/workflow/workflow/`, `workflow-worker-thread/`, or `tool-workflow/`.
- `SESSION_FORMAT_VERSION`, the base Session event format, or Session persistence format.
- The `packages/skill/skill/` registry or global `tool-skill` behavior.
- `packages/workspace/workspace/` semantics.
- The filesystem sandbox, shell sandbox, or generic tool authorization model.
- Source, versions, or configuration of existing third-party Profile plugins.
- Existing Session, credentials, skill, and plugin data in production `~/.dsh`; implementation tests must use a temporary `DSH_HOME`.
- Production Obsidian assets and task cards. Until the separate Promote phase, source inputs are read-only and writes go only to Business ArtifactStore.
- XHS images, automated topic selection, automated publishing, dynamic skill routing, dynamic Workflow, drag-and-drop editor, multi-user, cloud, or multi-tenant capabilities.

## 11. Questions That Remain Unconfirmed

The following cannot be determined from Harness source and require business input or a controlled sample before their implementation phase:

1. Canonical paths, file formats, field schemas, and permitted encodings for the official xhs task card, account rules, product truth, body specification, and golden samples.
2. The official Obsidian asset root, destination naming rules, existing-file conflict policy, and the source of the expected hash when a human approves replacement.
3. Fixed provider/model/reasoning/maxTokens, timeouts, retry counts, and cost ceilings for Generation and Semantic Validator.
4. How batch-level feedback deterministically propagates to 4 Jobs and whether rejecting the whole Batch revokes approval of an individually approved item.
5. Whether internal Agent Sessions are archived by default, whether the Job UI links their transcripts, and their retention period.
6. Whether Business state always has exactly one Host-process writer. If two Runtimes ever share one `DSH_HOME`, the current JSON backend is insufficient and must be replaced by a backend with an explicit concurrency contract.
7. Metric denominators, whether WARN counts as first-draft approval, how one batch feedback operation is counted, and the closed definition of a “severe engineering error.”

## 12. Go / Revise / No-Go Conclusion

**Conclusion: Revise, then Phase 1 Go.**

The design should not be implemented verbatim because existing `ctx.jobs`, Workflow Run, Workspace, fs-sandbox, skill registry, and ask-user do not provide the assumed persistence or authorization semantics. The recommended baseline is one Host business authority, a fixed business-layer state machine, two independent Agent Attempts, a Host-generated minimum execution package, no generic read/write/skill tools by default, a separate ArtifactStore, and a business-specific durable Human Gate.

The first Phase 1 cut is to create only the `business-workbench` Host package and prove a 4-Job Batch, state revisions, atomic Artifact commits, and restart recovery under a temporary `DSH_HOME`. Do not connect Agent, Workflow, Validation, UI, or Obsidian Promote in the same cut. Proceed to the Execution Package and restricted-Agent phase only after that loop passes.
