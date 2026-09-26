# Business Workbench

[English](business-workbench.md) | 中文

[`@deepseek-ai/dsh-business-workbench`](../../packages/business/business-workbench) 是 Business Batch、Job、执行所有权、冻结输入与 Skill Manifest、受限 Agent Run、Attempt、Artifact 引用与 XHS 输出 bundle 的仅 Host 持久化权威来源。它使用独立 storage domain、Project 级 read resolver、固定 Host action policy 与私有 Artifact root。它不提供 Remote 或模型可见工具。

来源：[`packages/business/business-workbench/src/types.ts`](../../packages/business/business-workbench/src/types.ts)

## 数据模型

`BusinessBatch` 在 `single` 模式持有一个有序 Job，在 `quad` 模式持有四个。迁移后的 `legacy-fixed4` Batch 保留四个历史 Job，并单独标识一或四个参与者。每个 Job 独立持有 revision、pending/running Attempt、租约、冻结执行包、Agent Run/Attempt 历史、Artifact 引用、可选的权威输出 bundle 与回执。执行包枚举精确文件和 Skill definition 并记录 hash；production package 还保存不含正文内容的入口、基线、真源链路、路由与 S3 来源证据。读取绝不扫描配置的来源 root。受限执行 lifecycle 见 [Phase 3 架构记录](../architecture/business-layer-v0.1-phase3.zh.md)。

`xhs-body-prepare-v0` 具有显式 fixture 与 production route。两者都只准入三个精确输入文件和一个账号专属 S3 Skill 快照；production route 还要求 resolver 持有的来源证据、精确正式 S3 origin 和即时漂移验证。模型只返回正文，Host 生成 metadata 与 provenance、验证全部三个文件、发布一个不可变 `intermediate` bundle，再通过一次 Job CAS 使其成为权威结果。[Phase 4C-0 架构记录](../architecture/business-layer-v0.1-phase4c0.zh.md)定义确定性来源 mapping。

已完成但没有可见文本的受限 Agent turn 会以 `EMPTY_AGENT_OUTPUT` 失败。错误 detail 包含不含正文内容的规范化 event 计数、可用 provider completion 事实、Agent Run/Session 身份、时长与提取阶段。同一诊断以 JSON 形式写入现有 Agent Run failure string；schema version `5` 没有增加诊断字段，reasoning 内容绝不会被当作正文。

业务 Review 通过 Job、Attempt、Output Bundle、Draft 路径与 hash 绑定一个已完成且结构可解析的 First Pass、Revision 或 Retry 候选稿。`MODIFY` Review 会创建新的追加式 Revision Job，其直接来源就是当前被审核候选稿。Lineage 在 First Pass 或 Retry 后确定性分配 Revision 1，在 Revision 1 后分配 Revision 2；再次修稿以 `MAX_REVISION_REACHED` 失败。结构失败仍然只能进入 Retry，Retry 上限为一次，任何操作都不会自动开始下一次执行。

`xhs-body-length-repair-v0` 只处理格式完整、业务审核为 `PASS`，且对应 Hard Validation 仅因标题或正文范围失败的候选稿。无 Skill 的 package 只包含 TaskCard、来源候选稿、绑定的 PASS Review 与对应 validation evidence。模型不返回 Draft，只能提出最多三个标题和三组精确的局部正文替换。Host 要求每个 `old_text` 在来源中恰好出现一次，从不可变来源独立应用每个方案，以 Validator 的同一计数器重建字符 metadata，重跑全部确定性检查，并选择编辑距离最小的合格 trial。失败只产生 evidence 而不产生候选稿；成功后仍须独立的终态 Patch Approval，且不会自动晋升。

## 边界与限制

- 当前 JSON 后端只允许一个 Runtime 针对一个 DSH home 写入。
- Schema version `5` 在普通打开时拒绝所有其他版本。唯一显式 migration 会在源 hash 获批后迁移校验通过的 V4 JSON，且绝不会在启动阶段运行。
- 新 Batch 只允许 `single` 与 `quad`；迁移后的 `legacy-fixed4` 数据保留历史占位 Job，但参与 Job 投影不会把它们计入。
- 启动时完成拥有已验证权威输出且失去 owner 的 XHS 执行；其他失去 owner 的 Attempt 变为 interrupted。恢复绝不重试模型工作。独立观测记录保存可获得的指标或明确记录缺失 telemetry，不修改 V5。
- 所有受限 Agent action 都会强制固定 capability/Skill subset、origin/drift policy、空 tool set 与 deny-all executor guard。XHS production route 可以创建不可变 intermediate draft bundle 与受控追加式 Revision 并完成其执行，但不调用 Workflow、语义 Validation、UI、获批资产 finalization 或 Obsidian 行为。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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
