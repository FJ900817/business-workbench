/** Public data types for the durable business workbench. */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Opaque Batch identifier. */
export type BusinessBatchId = Branded<'BusinessBatchId'>
/** Opaque Business Job identifier. */
export type BusinessJobId = Branded<'BusinessJobId'>
/** Opaque execution Attempt identifier. */
export type BusinessAttemptId = Branded<'BusinessAttemptId'>
/** Opaque immutable Artifact identifier. */
export type BusinessArtifactId = Branded<'BusinessArtifactId'>
/** Opaque frozen execution-package identifier. */
export type BusinessExecutionPackageId = Branded<'BusinessExecutionPackageId'>
/** Opaque restricted Agent Run identifier. */
export type BusinessAgentRunId = Branded<'BusinessAgentRunId'>
/** Opaque authoritative output-bundle identifier. */
export type BusinessOutputBundleId = Branded<'BusinessOutputBundleId'>

/** The only Project admitted by Business Layer V0.1. */
export type BusinessProject = 'xhs'
/** The only business Job type admitted by Business Layer V0.1. */
export type BusinessJobType = 'xhs-body'
/** Batch creation lifecycle. */
export type BusinessBatchStatus = 'creating' | 'ready'
/** Closed participation modes supported by schema version 5. */
export type BusinessBatchMode = 'single' | 'quad' | 'legacy-fixed4'
/** Business Job lifecycle including recoverable interruption. */
export type BusinessJobStatus = 'draft' | 'ready' | 'running' | 'interrupted' | 'completed' | 'failed' | 'cancelled'
/** Attempt lifecycle controlled by explicit execution ownership. */
export type BusinessAttemptStatus = 'pending' | 'running' | 'interrupted' | 'completed' | 'failed' | 'cancelled'
/** Artifact categories reserved by the Business Layer design. */
export type BusinessArtifactType = 'input' | 'intermediate' | 'validation' | 'review' | 'final'
/** Durable execution-lease lifecycle. */
export type BusinessExecutionLeaseStatus = 'active' | 'released' | 'expired'
/** Closed restricted Agent actions admitted by the Business Host. */
export type BusinessAgentAction = 'fixture-agent-run' | 'xhs-body-prepare-v0' | 'xhs-body-revise-v0' | 'xhs-body-retry-v0' | 'xhs-body-contract-repair-v0' | 'xhs-body-length-repair-v0'
/** XHS body preparation action. */
export type XhsBodyPrepareAction = 'xhs-body-prepare-v0'
/** XHS business-review revision action. */
export type XhsBodyRevisionAction = 'xhs-body-revise-v0'
/** XHS structural execution-retry action. */
export type XhsBodyRetryAction = 'xhs-body-retry-v0'
/** XHS deterministic-contract-only repair action. */
export type XhsBodyContractRepairAction = 'xhs-body-contract-repair-v0'
/** XHS PASS-reviewed title/body length patch action. */
export type XhsBodyLengthRepairAction = 'xhs-body-length-repair-v0'
/** Required execution-package roles for XHS body preparation. */
export type XhsBodyPrepareInputRole = 'taskCard' | 'writingRule' | 'goldenSample'
/** Reserved logical output names for the frozen XHS body preparation action. */
export type XhsBodyPrepareOutputName = 'draft.md' | 'draft-metadata.json' | 'provenance.json'
/** Action-specific failures reserved by the frozen XHS body preparation contract. */
export type XhsBodyPrepareFailureCode = 'XHS_BODY_INPUT_INVALID' | 'XHS_BODY_OUTPUT_INVALID'
/** Account route admitted by the current formal XHS production system. */
export type XhsProductionAccount = 'account1' | 'account2' | 'account3' | 'account4'
/** Stable Host vocabulary for the three formal XHS note types. */
export type XhsProductionNoteType = 'dry-search' | 'recommendation' | 'hot-traffic'
/** Explicit source class admitted by the XHS restricted Agent route. */
export type XhsExecutionMode = 'fixture' | 'production'

/** Caller-owned identity for one exact formal XHS production slot. */
export interface XhsProductionTaskIdentity {
  readonly account: XhsProductionAccount
  readonly productionMonth: string
  readonly productionWeek: string
  readonly note: string
}

/** Resolved identity copied from one confirmed production task card. */
export interface XhsProductionResolvedIdentity extends XhsProductionTaskIdentity {
  readonly taskId: string
  readonly topicId: string
  readonly noteType: XhsProductionNoteType
}

/** Immutable identity for one production control or lineage file. */
export interface XhsProductionSourceIdentity {
  readonly path: string
  readonly sha256: string
  readonly bytes: number
  readonly version?: string
}

/** Deterministic role route recorded without source content. */
export interface XhsProductionInputRoute extends XhsProductionSourceIdentity {
  readonly role: XhsBodyPrepareInputRole
  readonly routeReason: string
}

/** Exact formal S3 source selected by the account route. */
export interface XhsProductionSkillSource extends XhsProductionSourceIdentity {
  readonly logicalSkillId: string
  readonly formalName: string
  readonly account: XhsProductionAccount
  readonly origin: 'vault-root'
  readonly source: 'project-agents'
  readonly provider: string
  readonly snapshotHash: string
  readonly routeReason: string
}

/** Durable production-source evidence attached to one execution package. */
export interface XhsProductionSourceManifest {
  readonly adapterVersion: string
  readonly contractSchemaVersion: 1
  readonly identity: XhsProductionResolvedIdentity
  readonly productionEntry: XhsProductionSourceIdentity
  readonly productionBaseline: XhsProductionSourceIdentity
  readonly sourceTask: XhsProductionSourceIdentity
  readonly inputs: readonly XhsProductionInputRoute[]
  readonly skillSource: XhsProductionSkillSource
  readonly resolvedAt: number
  readonly manifestHash: string
}

/** Deterministic route supplied to the closed XHS action policy. */
export interface XhsBodyPrepareRoute {
  readonly mode: XhsExecutionMode
  readonly account: XhsProductionAccount
  readonly noteType: XhsProductionNoteType
}
/** Durable restricted Agent Run lifecycle. */
export type BusinessAgentRunStatus = 'running' | 'completed' | 'failed' | 'interrupted'

/** Exact Skill definition frozen before an Agent Run may start. */
export interface BusinessSkillSnapshot {
  readonly skillId: string
  readonly source: string
  readonly provider: string
  readonly path?: string
  readonly resourceBase?: string
  readonly content: string
  readonly contentHash: string
  readonly bytes: number
  readonly resolvedAt: number
  readonly snapshotHash: string
}

/** Fixed model route selected by one Host action policy. */
export interface BusinessAgentModel {
  /** Registered LLM provider id. */
  readonly provider: string
  /** Provider-owned model id. */
  readonly model: string
  /** Optional provider-supported reasoning effort. */
  readonly reasoningEffort?: string
  /** Optional maximum output-token count. */
  readonly maxTokens?: number
}

/** Durable provenance and settlement of one restricted Agent invocation. */
export interface BusinessAgentRun {
  readonly id: BusinessAgentRunId
  readonly jobId: BusinessJobId
  readonly attemptId: BusinessAttemptId
  readonly executionPackageId: BusinessExecutionPackageId
  readonly action: BusinessAgentAction
  readonly xhs?: XhsBodyPrepareRoute
  readonly idempotencyKey: string
  readonly status: BusinessAgentRunStatus
  readonly sessionId: string
  readonly skillManifestHash: string
  readonly model: BusinessAgentModel
  readonly startedAt: number
  readonly endedAt?: number
  readonly artifactId?: BusinessArtifactId
  readonly outputBundleId?: BusinessOutputBundleId
  readonly failureCode?: string
  readonly failureReason?: string
}

/** Stable reference to one task-card input without reading its source. */
export interface BusinessInputReference {
  readonly reference: string
  readonly sha256: string
}

/** Durable ownership record for one running Attempt. */
export interface BusinessExecutionLease {
  readonly attemptId: BusinessAttemptId
  readonly ownerId: string
  readonly runtimeInstanceId: string
  readonly acquiredAt: number
  readonly renewedAt: number
  readonly leaseExpiresAt: number
  readonly status: BusinessExecutionLeaseStatus
}

/** One file frozen into a minimum execution package. */
export interface BusinessExecutionInput {
  readonly role: string
  readonly path: string
  readonly required: boolean
  readonly present: boolean
  readonly sha256?: string
  readonly bytes?: number
}

/** Frozen manifest limiting one Attempt's inputs and declared capabilities. */
export interface BusinessExecutionPackage {
  readonly id: BusinessExecutionPackageId
  readonly project: BusinessProject
  readonly jobId: BusinessJobId
  readonly attemptId: BusinessAttemptId
  readonly workflowVersion: string
  readonly inputs: readonly BusinessExecutionInput[]
  readonly allowedReadRoots: readonly string[]
  readonly allowedReadFiles: readonly string[]
  readonly allowedCapabilities: readonly string[]
  readonly allowedSkills: readonly string[]
  readonly skillSnapshots: readonly BusinessSkillSnapshot[]
  readonly skillManifestHash: string
  /** Present only when a Host production resolver supplied the package. */
  readonly productionSource?: XhsProductionSourceManifest
  /** Additive source relation for a revision or one structural retry. */
  readonly lineage?: XhsExecutionLineage
  readonly createdAt: number
  readonly manifestHash: string
}

/** Frozen source relation for one additive XHS revision or retry Job. */
export type XhsExecutionLineage = XhsRevisionLineage | XhsRetryLineage | XhsContractRepairLineage | XhsLengthRepairLineage

/** Source and review evidence required by one bounded business revision. */
export interface XhsRevisionLineage {
  readonly kind: 'revision'
  readonly sourceJobId: BusinessJobId
  readonly sourceAttemptId: BusinessAttemptId
  readonly sourceOutputBundleId: BusinessOutputBundleId
  readonly sourceDraftPath: string
  readonly sourceDraftSha256: string
  readonly reviewArtifactId: BusinessArtifactId
  readonly reviewSha256: string
  readonly revisionNumber: 1 | 2
}

/** Source failure evidence required by the only admitted structural retry. */
export interface XhsRetryLineage {
  readonly kind: 'retry'
  readonly retryOfJobId: BusinessJobId
  readonly retryOfAttemptId: BusinessAttemptId
  readonly retryOfOutputBundleId?: BusinessOutputBundleId
  readonly retryReason: XhsRetryReason
  readonly retryNumber: 1
}

/** Evidence required by the sole deterministic-contract repair of one candidate. */
export interface XhsContractRepairLineage {
  readonly kind: 'contract-repair'
  readonly sourceJobId: BusinessJobId
  readonly sourceAttemptId: BusinessAttemptId
  readonly sourceOutputBundleId: BusinessOutputBundleId
  readonly sourceDraftPath: string
  readonly sourceDraftSha256: string
  readonly businessReviewArtifactId: BusinessArtifactId
  readonly businessReviewSha256: string
  readonly hardValidationArtifactId: BusinessArtifactId
  readonly hardValidationSha256: string
  readonly failedContractItems: readonly string[]
  readonly repairNumber: 1
  readonly repairedFields: readonly XhsContractRepairField[]
}

/** Evidence required by the only safe length patch over one PASS-reviewed Candidate. */
export interface XhsLengthRepairLineage {
  readonly kind: 'length-repair'
  readonly sourceJobId: BusinessJobId
  readonly sourceAttemptId: BusinessAttemptId
  readonly sourceOutputBundleId: BusinessOutputBundleId
  readonly sourceDraftPath: string
  readonly sourceDraftSha256: string
  readonly businessReviewArtifactId: BusinessArtifactId
  readonly businessReviewSha256: string
  readonly hardValidationArtifactId: BusinessArtifactId
  readonly hardValidationSha256: string
  readonly failedContractItems: readonly ('titleRange' | 'bodyRange')[]
  readonly repairNumber: 1
}

/** Closed fields that V0.1 Contract Repair may change. */
export type XhsContractRepairField =
  | 'title-length'
  | 'body-length'
  | 'keyword-occurrences'
  | 'keyword-title-position'
  | 'declared-title-characters'
  | 'declared-body-characters'
  | 'allowed-topics-formatting'

/** Closed structural failures eligible for an execution retry. */
export type XhsRetryReason = 'EMPTY_DRAFT' | 'FORMAT_CONTRACT_FAIL' | 'REQUIRED_BODY_MISSING'

/** Review outcomes recorded without changing production truth. */
export type XhsReviewResult = 'PASS' | 'MODIFY' | 'FAIL'
/** Review authority classes admitted by V0.1. */
export type XhsReviewerType = 'human' | 'external_business_ai'

/** Candidate classes admitted by the bounded XHS review flow. */
export type XhsReviewCandidateType = 'first_pass' | 'revision' | 'retry' | 'contract_repair' | 'length_repair'

/** Historical immutable review over one authoritative First-Pass draft. */
export interface XhsReviewArtifactDocumentV1 {
  readonly review_version: 1
  readonly project: 'xhs'
  readonly source_job_id: BusinessJobId
  readonly source_attempt_id: BusinessAttemptId
  readonly source_draft_artifact: string
  readonly source_draft_sha256: string
  readonly review_result: XhsReviewResult
  readonly required_changes: readonly string[]
  readonly quality_suggestions: readonly string[]
  readonly preserve: readonly string[]
  readonly reviewer_type: XhsReviewerType
  readonly reviewed_at: number
  readonly provenance: Readonly<{
    source_output_bundle_id: BusinessOutputBundleId
    source: 'authoritative-intermediate-output-bundle'
  }>
  readonly review_sha256: string
}

/** Immutable review over one authoritative, structurally complete candidate. */
export interface XhsReviewArtifactDocumentV2 {
  readonly review_version: 2
  readonly project: 'xhs'
  readonly source_job_id: BusinessJobId
  readonly source_attempt_id: BusinessAttemptId
  readonly source_artifact_id: BusinessOutputBundleId
  readonly source_artifact_path: string
  readonly source_draft_sha256: string
  readonly source_candidate_type: XhsReviewCandidateType
  readonly source_revision_number?: 1 | 2
  readonly source_retry_number?: 1
  readonly review_result: XhsReviewResult
  readonly required_changes: readonly string[]
  readonly quality_suggestions: readonly string[]
  readonly preserve: readonly string[]
  readonly reviewer_type: XhsReviewerType
  readonly reviewed_at: number
  readonly provenance: Readonly<{
    source_output_bundle_id: BusinessOutputBundleId
    source: 'authoritative-intermediate-output-bundle'
  }>
  readonly review_sha256: string
}

/** Every review document version readable without rewriting its Artifact. */
export type XhsReviewArtifactDocument = XhsReviewArtifactDocumentV1 | XhsReviewArtifactDocumentV2

/** One immutable execution Attempt in a Job's history. */
export interface BusinessAttempt {
  readonly id: BusinessAttemptId
  readonly jobId: BusinessJobId
  readonly sequence: number
  readonly status: BusinessAttemptStatus
  readonly lease: BusinessExecutionLease | null
  readonly executionPackage: BusinessExecutionPackage | null
  readonly agentRuns: readonly BusinessAgentRun[]
  readonly outputBundle: BusinessOutputBundle | null
  readonly createdAt: number
  readonly completedAt?: number
  readonly statusReason?: string
}

/** Durable reference to one atomically published Artifact. */
export interface BusinessArtifact {
  readonly artifactId: BusinessArtifactId
  readonly jobId: BusinessJobId
  readonly attemptId: BusinessAttemptId
  readonly type: BusinessArtifactType
  readonly revision: number
  readonly path: string
  readonly hash: string
  readonly bytes: number
  readonly createdAt: number
  readonly provenance?: BusinessAgentArtifactProvenance
}

/** Restricted Agent facts copied onto its authoritative output Artifact. */
export interface BusinessAgentArtifactProvenance {
  readonly kind: 'restricted-agent'
  readonly agentRunId: BusinessAgentRunId
  readonly executionPackageId: BusinessExecutionPackageId
  readonly executionPackageManifestHash: string
  readonly skillManifestHash: string
  readonly model: BusinessAgentModel
}

/** Durable receipt that makes one Job mutation idempotent across restarts. */
export interface BusinessOperationReceipt {
  readonly key: string
  readonly kind: 'transition' | 'create-attempt' | 'acquire-lease' | 'renew-lease' | 'release-lease' | 'create-package' | 'complete-attempt' | 'commit-artifact' | 'run-agent'
  readonly fingerprint: string
  readonly revision: number
  readonly resultId?: string
  readonly createdAt: number
}

/** One exact file inside an authoritative XHS output bundle. */
export interface BusinessOutputBundleEntry {
  readonly name: XhsBodyPrepareOutputName
  readonly mediaType: 'text/markdown' | 'application/json'
  readonly path: string
  readonly hash: string
  readonly bytes: number
}

/** Atomically referenced three-file result of one XHS preparation Attempt. */
export interface BusinessOutputBundle {
  readonly id: BusinessOutputBundleId
  readonly jobId: BusinessJobId
  readonly attemptId: BusinessAttemptId
  readonly agentRunId: BusinessAgentRunId
  readonly executionPackageId: BusinessExecutionPackageId
  readonly action:
  | XhsBodyPrepareAction
  | XhsBodyRevisionAction
  | XhsBodyRetryAction
  | XhsBodyContractRepairAction
  | XhsBodyLengthRepairAction
  readonly actionPolicyVersion: string
  readonly project: 'xhs'
  readonly type: 'intermediate'
  readonly outputVersion: 1
  readonly idempotencyKey: string
  readonly path: string
  readonly entries: readonly [BusinessOutputBundleEntry, BusinessOutputBundleEntry, BusinessOutputBundleEntry]
  readonly manifestHash: string
  readonly createdAt: number
}

/** Valid output-bundle directory absent from durable Attempt state. */
export interface BusinessOrphanOutputBundle {
  readonly path: string
  readonly kind: 'published' | 'staging'
}

/** Read-only output-bundle reconciliation result. */
export interface BusinessOutputBundleReconciliation {
  readonly referencedCount: number
  readonly orphanBundles: readonly BusinessOrphanOutputBundle[]
}

/** Verified XHS bundle bytes keyed by their frozen logical names. */
export interface BusinessOutputBundleContent {
  readonly bundle: BusinessOutputBundle
  readonly files: Readonly<Record<XhsBodyPrepareOutputName, string>>
}

/** One or four Business Job identifiers admitted by the closed Batch modes. */
export type BusinessBatchJobIds = readonly [BusinessJobId] | readonly [BusinessJobId, BusinessJobId, BusinessJobId, BusinessJobId]
/** One or four input references admitted by the closed Batch modes. */
export type BusinessBatchInputs = readonly [BusinessInputReference] | readonly [
  BusinessInputReference,
  BusinessInputReference,
  BusinessInputReference,
  BusinessInputReference,
]

/** Persisted Batch aggregate with explicit participating-Job semantics. */
export interface BusinessBatch {
  readonly id: BusinessBatchId
  readonly project: BusinessProject
  readonly type: BusinessJobType
  readonly mode: BusinessBatchMode
  readonly status: BusinessBatchStatus
  readonly jobIds: BusinessBatchJobIds
  readonly participatingJobIds: BusinessBatchJobIds
  readonly inputs: BusinessBatchInputs
  readonly revision: number
  readonly createKey: string
  readonly createFingerprint: string
  readonly createdAt: number
  readonly updatedAt: number
}

/** The durable source of truth for one Business Job. */
export interface BusinessJob {
  readonly id: BusinessJobId
  readonly batchId: BusinessBatchId
  readonly project: BusinessProject
  readonly type: BusinessJobType
  readonly status: BusinessJobStatus
  readonly revision: number
  readonly currentAttempt: BusinessAttemptId | null
  readonly input: BusinessInputReference
  readonly attempts: readonly BusinessAttempt[]
  readonly artifactRefs: readonly BusinessArtifact[]
  readonly operations: readonly BusinessOperationReceipt[]
  readonly statusReason?: string
  readonly createdAt: number
  readonly updatedAt: number
}

/** Fields shared by the two new-Batch participation modes. */
interface CreateBusinessBatchRequestBase {
  readonly idempotencyKey: string
  readonly project: BusinessProject
  readonly type: BusinessJobType
}

/** Request to create one truthful single-Job Batch. */
export interface CreateSingleBusinessBatchRequest extends CreateBusinessBatchRequestBase {
  readonly mode: 'single'
  readonly inputs: readonly [BusinessInputReference]
}

/** Request to create one four-participant Batch. */
export interface CreateQuadBusinessBatchRequest extends CreateBusinessBatchRequestBase {
  readonly mode: 'quad'
  readonly inputs: readonly [BusinessInputReference, BusinessInputReference, BusinessInputReference, BusinessInputReference]
}

/** Closed creation request; legacy mode exists only through V4 migration. */
export type CreateBusinessBatchRequest = CreateSingleBusinessBatchRequest | CreateQuadBusinessBatchRequest

/** Compare-and-swap request for a non-execution Job transition. */
export interface TransitionBusinessJobRequest {
  readonly jobId: BusinessJobId
  readonly expectedRevision: number
  readonly idempotencyKey: string
  readonly status: BusinessJobStatus
  readonly reason?: string
}

/** Compare-and-swap request to create a pending Attempt. */
export interface CreateBusinessAttemptRequest {
  readonly jobId: BusinessJobId
  readonly expectedRevision: number
  readonly idempotencyKey: string
}

/** Compare-and-swap request to acquire execution ownership. */
export interface AcquireBusinessExecutionLeaseRequest {
  readonly jobId: BusinessJobId
  readonly attemptId: BusinessAttemptId
  readonly expectedRevision: number
  readonly idempotencyKey: string
  readonly ownerId: string
}

/** Compare-and-swap request to extend the current execution lease. */
export interface RenewBusinessExecutionLeaseRequest extends AcquireBusinessExecutionLeaseRequest {}

/** Compare-and-swap request to relinquish execution and make the Job recoverable. */
export interface ReleaseBusinessExecutionLeaseRequest extends AcquireBusinessExecutionLeaseRequest {
  readonly reason?: string
}

/** Caller description of one file to freeze into an execution package. */
export interface BusinessExecutionInputRequest {
  readonly role: string
  readonly path: string
  readonly required: boolean
}

/** Compare-and-swap request that freezes one Attempt's minimum input set. */
export interface CreateBusinessExecutionPackageRequest {
  readonly jobId: BusinessJobId
  readonly attemptId: BusinessAttemptId
  readonly expectedRevision: number
  readonly idempotencyKey: string
  readonly ownerId: string
  readonly workflowVersion: string
  readonly inputs: readonly BusinessExecutionInputRequest[]
  readonly allowedReadRoots: readonly string[]
  readonly allowedReadFiles: readonly string[]
  readonly allowedCapabilities: readonly string[]
  readonly allowedSkills: readonly string[]
}

/** Compare-and-swap request for one deterministic production-source package. */
export interface CreateXhsProductionExecutionPackageRequest {
  readonly jobId: BusinessJobId
  readonly attemptId: BusinessAttemptId
  readonly expectedRevision: number
  readonly idempotencyKey: string
  readonly ownerId: string
  readonly identity: XhsProductionTaskIdentity
}

/** Host request to persist a business review on a new additive Revision Job. */
export interface CreateXhsReviewArtifactRequest {
  readonly jobId: BusinessJobId
  readonly attemptId: BusinessAttemptId
  readonly expectedRevision: number
  readonly idempotencyKey: string
  readonly sourceJobId: BusinessJobId
  readonly sourceAttemptId: BusinessAttemptId
  readonly sourceDraftSha256: string
  readonly reviewResult: XhsReviewResult
  readonly requiredChanges: readonly string[]
  readonly qualitySuggestions: readonly string[]
  readonly preserve: readonly string[]
  readonly reviewerType: XhsReviewerType
  readonly reviewedAt: number
}

/** Persisted Review reference and parsed immutable document. */
export interface XhsReviewArtifactResult {
  readonly artifact: BusinessArtifact
  readonly review: XhsReviewArtifactDocument
}

/** Human APPROVE/REJECT request over one machine-valid length-repair Candidate. */
export interface CreateXhsLengthRepairApprovalRequest {
  readonly jobId: BusinessJobId
  readonly attemptId: BusinessAttemptId
  readonly expectedRevision: number
  readonly idempotencyKey: string
  readonly sourceJobId: BusinessJobId
  readonly sourceAttemptId: BusinessAttemptId
  readonly repairedDraftSha256: string
  readonly decision: 'APPROVE' | 'REJECT'
  readonly decidedAt: number
}

/** Persisted terminal patch decision. */
export interface XhsLengthRepairApprovalResult {
  readonly artifact: BusinessArtifact
  readonly approval: import('./xhs-length-repair.ts').XhsLengthRepairApprovalDocument
}

/** Production package request for one first business revision. */
export interface CreateXhsRevisionExecutionPackageRequest extends CreateXhsProductionExecutionPackageRequest {
  readonly reviewArtifactId: BusinessArtifactId
}

/** Production package request for the only structural retry of a source execution. */
export interface CreateXhsRetryExecutionPackageRequest extends CreateXhsProductionExecutionPackageRequest {
  readonly retryOfJobId: BusinessJobId
  readonly retryOfAttemptId: BusinessAttemptId
  readonly retryReason: XhsRetryReason
}

/** Production package request for one deterministic-contract-only repair. */
export interface CreateXhsContractRepairExecutionPackageRequest extends CreateXhsProductionExecutionPackageRequest {
  readonly reviewArtifactId: BusinessArtifactId
}

/** Production package request for one bounded PASS-reviewed length patch. */
export interface CreateXhsLengthRepairExecutionPackageRequest extends CreateXhsProductionExecutionPackageRequest {
  readonly reviewArtifactId: BusinessArtifactId
}

/** Zero-model readiness result for a revision or retry. */
export interface XhsSecondPassPreflight {
  readonly status: 'REVISION_READY' | 'RETRY_READY' | 'CONTRACT_REPAIR_READY' | 'LENGTH_REPAIR_READY'
  readonly sourceJobId: BusinessJobId
  readonly sourceAttemptId: BusinessAttemptId
  readonly sourceDraftSha256?: string
  readonly reviewArtifactId?: BusinessArtifactId
  readonly revisionNumber?: 1 | 2
  readonly retryReason?: XhsRetryReason
  readonly hardValidationArtifactId?: BusinessArtifactId
  readonly failedContractItems?: readonly string[]
  readonly repairedFields?: readonly XhsContractRepairField[]
}

/** Production resolution result returned without exposing source bodies. */
export interface XhsProductionExecutionPackageResult {
  readonly executionPackage: BusinessExecutionPackage
  readonly sourceManifest: XhsProductionSourceManifest
  readonly timing: XhsProductionPackageTiming
}

/** Non-durable timings observed while resolving one production package. */
export interface XhsProductionPackageTiming {
  readonly sourceResolutionMs: number
  readonly skillSnapshotMs: number
  readonly executionPackageBuildMs: number
}

/** Request to read one exact frozen input through the Host policy. */
export interface ReadBusinessExecutionInputRequest {
  readonly jobId: BusinessJobId
  readonly attemptId: BusinessAttemptId
  readonly ownerId: string
  readonly path: string
}

/** Verified input body returned by the Host read resolver. */
export interface BusinessExecutionInputContent {
  readonly input: BusinessExecutionInput
  readonly content: string
}

/** Result of revalidating a frozen package against current source bytes. */
export interface BusinessExecutionPackageVerification {
  readonly packageId: BusinessExecutionPackageId
  readonly manifestHash: string
  readonly inputCount: number
}

/** Derived lease state that never treats expired or foreign ownership as live. */
export interface BusinessExecutionStatus {
  readonly jobId: BusinessJobId
  readonly attemptId: BusinessAttemptId | null
  readonly state: 'idle' | 'pending' | 'owned' | 'expired' | 'owner-lost' | 'interrupted' | 'terminal'
  readonly ownerId?: string
  readonly leaseExpiresAt?: number
}

/** Compare-and-swap request to end one owned Attempt. */
export interface CompleteBusinessAttemptRequest {
  readonly jobId: BusinessJobId
  readonly attemptId: BusinessAttemptId
  readonly expectedRevision: number
  readonly idempotencyKey: string
  readonly ownerId: string
  readonly outcome: 'completed' | 'failed' | 'cancelled'
  readonly reason?: string
}

/** Compare-and-swap request to publish one owned Attempt's Artifact. */
export interface CommitBusinessArtifactRequest {
  readonly jobId: BusinessJobId
  readonly attemptId: BusinessAttemptId
  readonly expectedRevision: number
  readonly idempotencyKey: string
  readonly ownerId: string
  readonly type: BusinessArtifactType
  readonly content: string
  readonly provenance?: BusinessAgentArtifactProvenance
}

/** Host-only request to execute one immutable package through the restricted Agent route. */
export interface RunRestrictedBusinessAgentRequest {
  readonly jobId: BusinessJobId
  readonly attemptId: BusinessAttemptId
  readonly executionPackageId: BusinessExecutionPackageId
  readonly ownerId: string
  readonly action: BusinessAgentAction
  readonly idempotencyKey: string
  readonly xhs?: XhsBodyPrepareRoute
}

/** Provider token counts observed from one fresh Agent invocation. */
export interface BusinessAgentTokenUsage {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens?: number
  readonly cacheWriteTokens?: number
  readonly reasoningTokens?: number
}

/** Fresh invocation observations; XHS persists a separate receipt without changing the V5 Job fields. */
export interface BusinessAgentExecutionMetrics {
  readonly requestStartedAt: number
  readonly firstResponseAt?: number
  readonly responseCompletedAt: number
  readonly agentDurationMs: number
  readonly finishReason?: string
  readonly toolCalls: number
  readonly tokenUsage?: BusinessAgentTokenUsage
}

/** Authoritative text Artifact returned by the fixture action. */
export interface RestrictedBusinessAgentArtifactResult {
  readonly kind: 'artifact'
  readonly run: BusinessAgentRun
  readonly artifact: BusinessArtifact
  /** Absent only when an already committed result is replayed. */
  readonly executionMetrics?: BusinessAgentExecutionMetrics
}

/** Authoritative output bundle returned by the XHS action. */
export interface RestrictedBusinessAgentBundleResult {
  readonly kind: 'output-bundle'
  readonly run: BusinessAgentRun
  readonly outputBundle: BusinessOutputBundle
  /** Absent only when an already committed result is replayed. */
  readonly executionMetrics?: BusinessAgentExecutionMetrics
}

/** Authoritative output returned after a restricted Agent Run commits. */
export type RestrictedBusinessAgentResult = RestrictedBusinessAgentArtifactResult | RestrictedBusinessAgentBundleResult

/** Verified Artifact reference and UTF-8 body. */
export interface BusinessArtifactContent {
  readonly artifact: BusinessArtifact
  readonly content: string
}

/** Result of verifying one durable Artifact reference. */
export interface BusinessArtifactVerification {
  readonly artifactId: BusinessArtifactId
  readonly hash: string
  readonly bytes: number
}

/** Valid Artifact file not referenced by durable Job state. */
export interface BusinessOrphanArtifact {
  readonly path: string
  readonly hash: string
  readonly bytes: number
}

/** Read-only reconciliation result; it never deletes or promotes files. */
export interface BusinessArtifactReconciliation {
  readonly referencedCount: number
  readonly orphanArtifacts: readonly BusinessOrphanArtifact[]
}
