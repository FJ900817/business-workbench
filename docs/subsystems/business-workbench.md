# Business Workbench

English | [中文](business-workbench.zh.md)

[`@deepseek-ai/dsh-business-workbench`](../../packages/business/business-workbench) is the Host-only durable authority for Business Batches, Jobs, execution ownership, frozen input and Skill manifests, restricted Agent Runs, Attempts, Artifact references, and XHS output bundles. It uses an independent storage domain, a Project-scoped read resolver, fixed Host action policies, and a private Artifact root. It exposes no Remote or model-facing tool.

Source: [`packages/business/business-workbench/src/types.ts`](../../packages/business/business-workbench/src/types.ts)

## Data model

`BusinessBatch` owns one ordered Job in `single` mode or four in `quad` mode. A migrated `legacy-fixed4` Batch retains its four historical Jobs and separately identifies the one or four participants. Each Job owns its revision, pending or running Attempt, lease, frozen execution package, Agent Run and Attempt history, Artifact references, optional authoritative output bundle, and receipts. Execution packages enumerate exact files and Skill definitions with their hashes; production packages also preserve content-free entry, baseline, lineage, route, and S3 source evidence. Reads never scan the configured source root. The restricted execution lifecycle is in the [Phase 3 architecture record](../architecture/business-layer-v0.1-phase3.md).

`xhs-body-prepare-v0` has explicit fixture and production routes. Both admit three exact input files and one account-specific S3 Skill snapshot; the production route additionally requires resolver-owned source evidence, exact formal S3 origin, and immediate drift verification. The model returns only draft text; the Host authors metadata and provenance, validates all three files, publishes one immutable `intermediate` bundle, and makes it authoritative through one Job CAS. The [Phase 4C-0 architecture record](../architecture/business-layer-v0.1-phase4c0.md) defines the deterministic source mapping.

A completed restricted-Agent turn without visible text fails as `EMPTY_AGENT_OUTPUT`. Its error detail contains content-free normalized event counts, available provider completion facts, Agent Run and Session identity, duration, and extraction stage. The same diagnostic is stored as JSON in the existing Agent Run failure string; schema version `5` adds no diagnostic field, and reasoning content is never accepted as draft text.

Business reviews bind one completed, structurally parseable First Pass, Revision, or Retry candidate by Job, Attempt, output bundle, draft path, and hash. A `MODIFY` Review creates a new additive Revision Job whose immediate source is that reviewed candidate. Lineage assigns Revision 1 after First Pass or Retry and Revision 2 after Revision 1; another revision fails with `MAX_REVISION_REACHED`. Structural failures remain Retry-only, one Retry is the maximum, and no operation starts another execution automatically.

`xhs-body-length-repair-v0` handles only a format-complete, business-`PASS` Candidate whose matching Hard Validation fails exclusively on title or body range. Its Skill-free package contains the TaskCard, source Candidate, bound PASS Review, and matching validation evidence. The model returns no Draft: it proposes at most three titles and three groups of exact local body replacements. The Host requires every `old_text` to occur once, applies each option independently to the immutable source, regenerates count metadata with the Validator's counter, reruns all deterministic checks, and selects the valid trial with the smallest edit distance. Failure creates evidence but no Candidate; success requires a separate terminal Patch Approval and never promotes automatically.

## Boundaries and limitations

- The current JSON backend permits one Runtime writer for one DSH home.
- Schema version `5` rejects all other versions during ordinary open. Its sole explicit migration converts validated V4 JSON after source-hash approval and never runs during startup.
- New Batches admit only `single` and `quad`; migrated `legacy-fixed4` data retains historical placeholders but excludes them from participating-Job projections.
- Startup completes abandoned XHS executions with verified authoritative output; other abandoned Attempts become interrupted. Recovery never retries model work. Independent observation receipts retain available metrics or explicitly record missing telemetry without changing V5.
- All restricted Agent actions enforce a fixed capability/Skill subset, origin and drift policy, empty tool set, and deny-all executor guard. The XHS production route can create and complete immutable intermediate draft bundles and bounded additive revisions but invokes no Workflow, semantic Validation, UI, approved-asset finalization, or Obsidian behavior.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxbusinessworkbench--businessworkbenchservice"></a>

### `ctx.businessWorkbench` — `BusinessWorkbenchService`

Durable Business authority with an optional Host-restricted one-turn Agent route.

```ts cordis-catalog
/**
 * Create or recover one single- or four-participant Batch.
 * @param request - Closed mode, Project/type, matching inputs, and stable retry key.
 * @returns the ready durable Batch.
 */
createBatch(request: CreateBusinessBatchRequest): Promise<BusinessBatch>

/**
 * Return one immutable Batch snapshot.
 * @param batchId - Batch to read.
 * @returns the snapshot, or `undefined` when unknown.
 */
getBatch(batchId: BusinessBatchId): BusinessBatch | undefined

/**
 * Return ready Batches in stable creation order.
 * @returns immutable Batch snapshots.
 */
listBatches(): readonly BusinessBatch[]

/**
 * Return one immutable Job snapshot.
 * @param jobId - Job to read.
 * @returns the snapshot, or `undefined` when unknown.
 */
getJob(jobId: BusinessJobId): BusinessJob | undefined

/**
 * Return the owning Batch's one or four stored Jobs in Batch order.
 * @param batchId - Batch whose Jobs should be read.
 * @returns immutable Job snapshots, including legacy placeholders when present.
 */
listJobs(batchId: BusinessBatchId): readonly BusinessJob[]

/**
 * Apply a non-execution Job transition with compare-and-swap.
 * @param request - Observed Job revision, target state, and retry key.
 * @returns the committed Job snapshot.
 */
transitionJob(request: TransitionBusinessJobRequest): Promise<BusinessJob>

/**
 * Create a pending Attempt without claiming execution ownership.
 * @param request - Observed Job revision and retry key.
 * @returns the Job containing the new pending Attempt.
 */
createAttempt(request: CreateBusinessAttemptRequest): Promise<BusinessJob>

/**
 * Acquire the sole valid execution lease for a pending Attempt.
 * @param request - Attempt, owner, observed revision, and retry key.
 * @returns the running Job snapshot.
 */
acquireExecutionLease(request: AcquireBusinessExecutionLeaseRequest): Promise<BusinessJob>

/**
 * Renew the current owner's non-expired lease through Job CAS.
 * @param request - Current owner and observed Job revision.
 * @returns the Job containing the renewed lease.
 */
renewExecutionLease(request: RenewBusinessExecutionLeaseRequest): Promise<BusinessJob>

/**
 * Release execution ownership and retain the Attempt as interrupted history.
 * @param request - Current owner, observed revision, and optional reason.
 * @returns the interrupted Job snapshot.
 */
releaseExecutionLease(request: ReleaseBusinessExecutionLeaseRequest): Promise<BusinessJob>

/**
 * Freeze one current Attempt's exact inputs and declarative capability lists.
 * @param request - Input files, allow-lists, owner, and observed revision.
 * @returns the immutable execution package.
 */
createExecutionPackage(request: CreateBusinessExecutionPackageRequest): Promise<BusinessExecutionPackage>

/**
 * Resolve one formal XHS production slot and freeze it into the current Attempt.
 * @param request - Exact slot identity plus current lease and compare-and-swap facts.
 * @returns the durable package and content-free source evidence.
 */
async createXhsProductionExecutionPackage( request: CreateXhsProductionExecutionPackageRequest, ): Promise<XhsProductionExecutionPackageResult>

/**
 * Persist one immutable business review on a new additive Revision Job.
 * @param request - Target Revision Job, reviewed candidate identity, review text, and compare-and-swap facts.
 * @returns the committed Review Artifact and its verified document.
 */
createXhsReviewArtifact(request: CreateXhsReviewArtifactRequest): Promise<XhsReviewArtifactResult>

/** Persist the only human APPROVE/REJECT decision over a machine-valid length patch.
 * @param request - Target decision Job, repaired Candidate identity, and terminal decision.
 * @returns Immutable Patch Approval Artifact without promotion or another repair.
 */
createXhsLengthRepairApproval( request: CreateXhsLengthRepairApprovalRequest, ): Promise<XhsLengthRepairApprovalResult>

/**
 * Verify that one persisted MODIFY review can start an additive Revision execution.
 * @param jobId - Target Revision Job that owns the Review Artifact.
 * @param attemptId - Active target Attempt that will receive the revision package.
 * @param reviewArtifactId - Persisted Review Artifact bound to the reviewed candidate.
 * @returns the ready state and deterministic next revision number.
 */
async preflightXhsRevision( jobId: BusinessJobId, attemptId: BusinessAttemptId, reviewArtifactId: BusinessArtifactId, ): Promise<XhsSecondPassPreflight>

/**
 * Verify structural retry eligibility without creating or running a Retry Job.
 * @param sourceJobId - Failed source Job whose structural evidence is authoritative.
 * @param sourceAttemptId - Failed source Attempt to inspect.
 * @returns the ready state and evidence-derived retry reason.
 */
async preflightXhsRetry(sourceJobId: BusinessJobId, sourceAttemptId: BusinessAttemptId): Promise<XhsSecondPassPreflight>

/**
 * Verify that a PASS-reviewed Candidate has only admitted deterministic failures.
 * @param jobId - Target Contract Repair Job that owns the PASS Review.
 * @param attemptId - Active target Attempt that would receive the repair package.
 * @param reviewArtifactId - PASS Review bound to the exact source Candidate.
 * @returns the ready state, matching validation evidence, and closed repair scope.
 */
async preflightXhsContractRepair( jobId: BusinessJobId, attemptId: BusinessAttemptId, reviewArtifactId: BusinessArtifactId, ): Promise<XhsSecondPassPreflight>

/** Verify that a PASS-reviewed Candidate has only title/body range failures.
 * @param jobId - Target length-repair Job owning the PASS Review.
 * @param attemptId - Active target Attempt.
 * @param reviewArtifactId - PASS Review bound to the exact source Candidate.
 * @returns Zero-model length-repair readiness and exact evidence identities.
 */
async preflightXhsLengthRepair( jobId: BusinessJobId, attemptId: BusinessAttemptId, reviewArtifactId: BusinessArtifactId, ): Promise<XhsSecondPassPreflight>

/** Verify length-repair eligibility without creating a Batch, Job, Attempt, or Artifact.
 * @param sourceJobId - Exact PASS-reviewed source Candidate Job.
 * @param sourceAttemptId - Exact source Attempt.
 * @param reviewArtifactId - Existing PASS Review Artifact bound to that Candidate.
 * @returns Read-only readiness and exact durable evidence identities.
 */
async preflightXhsLengthRepairSource( sourceJobId: BusinessJobId, sourceAttemptId: BusinessAttemptId, reviewArtifactId: BusinessArtifactId, ): Promise<XhsSecondPassPreflight>

/**
 * Freeze production truth, the reviewed candidate, and its Review into a revision package.
 * @param request - Active target Attempt, production identity, Review Artifact, lease, and compare-and-swap facts.
 * @returns the immutable revision execution package and source evidence.
 */
async createXhsRevisionExecutionPackage(request: CreateXhsRevisionExecutionPackageRequest): Promise<XhsProductionExecutionPackageResult>

/**
 * Freeze production truth for one source-only structural retry package.
 * @param request - Active target Attempt, failed source identity, retry reason, lease, and compare-and-swap facts.
 * @returns the immutable retry execution package and source evidence.
 */
async createXhsRetryExecutionPackage(request: CreateXhsRetryExecutionPackageRequest): Promise<XhsProductionExecutionPackageResult>

/**
 * Freeze only TaskCard, source Candidate, PASS Review, and hard-failure evidence for Contract Repair.
 * @param request - Active target Attempt, production identity, PASS Review, lease, and compare-and-swap facts.
 * @returns the immutable Skill-free Contract Repair package and source evidence.
 */
async createXhsContractRepairExecutionPackage( request: CreateXhsContractRepairExecutionPackageRequest, ): Promise<XhsProductionExecutionPackageResult>

/** Freeze only the TaskCard and exact PASS/length-failure evidence for one safe patch.
 * @param request - Active target Attempt, production identity, PASS Review, and lease facts.
 * @returns Immutable Skill-free length-repair package.
 */
async createXhsLengthRepairExecutionPackage( request: CreateXhsLengthRepairExecutionPackageRequest, ): Promise<XhsProductionExecutionPackageResult>

/**
 * Read one exact frozen input after lease, policy, and drift verification.
 * @param request - Current owner and exact package input path.
 * @returns verified input metadata and UTF-8 content.
 */
async readExecutionInput(request: ReadBusinessExecutionInputRequest): Promise<BusinessExecutionInputContent>

/**
 * Recompute all source hashes in one frozen execution package.
 * @param jobId - Owning Job.
 * @param attemptId - Attempt containing the package.
 * @returns package identity and verification counts.
 */
async verifyExecutionPackage(jobId: BusinessJobId, attemptId: BusinessAttemptId): Promise<BusinessExecutionPackageVerification>

/**
 * Execute one frozen package through a fresh tool-free Agent and commit its output.
 * @param request - exact Job, Attempt, package, owner, action, and retry identity.
 * @returns the durable Agent Run and its authoritative Artifact or output bundle.
 */
async runRestrictedAgent(request: RunRestrictedBusinessAgentRequest): Promise<RestrictedBusinessAgentResult>

/**
 * Return derived ownership without treating expired or foreign leases as live.
 * @param jobId - Job whose execution should be inspected.
 * @returns current derived execution status.
 */
getExecutionStatus(jobId: BusinessJobId): BusinessExecutionStatus

/**
 * Complete verified authoritative XHS outputs without model I/O; interrupt other abandoned executions.
 * @returns the number of recovered Jobs.
 */
recoverInterruptedExecutions(): Promise<number>

/** Complete only execution of the latest verified XHS intermediate bundle, never content approval or promotion.
 * Missing telemetry is durably marked incomplete. Repeated calls preserve the same receipt and Job revision.
 * @param jobId - Owning Job; failed, cancelled, superseded, or output-less Attempts are rejected.
 * @param attemptId - Latest Attempt with an authoritative bundle and its completed Agent Run.
 * @returns completed Job without model calls, source reads, or changes to output bytes.
 */
finalizeXhsOutputBundle(jobId: BusinessJobId, attemptId: BusinessAttemptId): Promise<BusinessJob>

/**
 * Finish the active owned Attempt and release its lease.
 * @param request - Current owner, terminal outcome, and observed revision.
 * @returns the terminal Job snapshot.
 */
completeAttempt(request: CompleteBusinessAttemptRequest): Promise<BusinessJob>

/**
 * Atomically publish a text Artifact for the active execution owner.
 * @param request - Current owner, Artifact metadata, bytes, and observed revision.
 * @returns the committed immutable Artifact reference.
 */
commitArtifact(request: CommitBusinessArtifactRequest): Promise<BusinessArtifact>

/**
 * Read and verify one Artifact by opaque id.
 * @param artifactId - Artifact to locate and verify.
 * @returns verified reference and UTF-8 body.
 */
async getArtifact(artifactId: BusinessArtifactId): Promise<BusinessArtifactContent>

/**
 * Verify every Artifact referenced by one Job.
 * @param jobId - Job whose references should be verified.
 * @returns verification facts in reference order.
 */
async verifyArtifacts(jobId: BusinessJobId): Promise<readonly BusinessArtifactVerification[]>

/**
 * Discover verified orphan Artifact files without changing them.
 * @returns referenced count and orphan summaries.
 */
reconcileArtifacts(): Promise<BusinessArtifactReconciliation>

/**
 * Read and structurally verify one authoritative XHS output bundle.
 * @param bundleId - opaque bundle identity.
 * @returns immutable manifest and its three verified files.
 */
getOutputBundle(bundleId: BusinessOutputBundleId): Promise<BusinessOutputBundleContent>

/**
 * Discover output-bundle staging or publication orphans without changing them.
 * @returns referenced count and orphan summaries.
 */
reconcileOutputBundles(): Promise<BusinessOutputBundleReconciliation>
```

Source: [`packages/business/business-workbench/src/index.ts`](../../packages/business/business-workbench/src/index.ts)
<!-- END GENERATED cordis-surface -->
