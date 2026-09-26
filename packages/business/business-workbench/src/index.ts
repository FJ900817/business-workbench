/** Durable Host authority for Business Layer execution, Artifacts, and output bundles. */

import { createHash, randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { Context, Service } from '@deepseek-ai/cordis'
import s from '@deepseek-ai/schemastery'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type SkillRegistry from '@deepseek-ai/dsh-skill'
import { BusinessArtifactStore, artifactRelativePath, sha256Text } from './artifact-store.ts'
import { BusinessWorkbenchError } from './errors.ts'
import { BusinessExecutionTelemetryStore, countXhsFullCharacters } from './execution-telemetry.ts'
import {
  assertXhsContractRepairAvailable,
  contractRepairPreflight,
  deriveXhsContractRepairScope,
  xhsContractRepairConsumedAllowance,
} from './xhs-contract-repair.ts'
import {
  assertXhsLengthRepairEligibility,
  buildXhsLengthRepairApprovalFromDrafts,
  settleXhsLengthRepairProposal,
} from './xhs-length-repair.ts'
import { parseXhsDraftFormat } from './xhs-draft-format.ts'
import {
  BusinessAttemptId as toBusinessAttemptId,
  BusinessBatchId as toBusinessBatchId,
  BusinessJobId as toBusinessJobId,
  deriveBusinessAgentRunId,
  deriveBusinessArtifactId,
  deriveBusinessExecutionPackageId,
} from './ids.ts'
import { resolveRestrictedAgentPolicy } from './host-policy.ts'
import type { RestrictedAgentModelConfig, RestrictedAgentPolicy } from './host-policy.ts'
import { BusinessOutputBundleStore } from './output-bundle-store.ts'
import { HarnessRestrictedAgentRuntime } from './restricted-agent.ts'
import {
  BusinessReadBoundary,
  executionPackageHash,
  normalizeBusinessNames,
  normalizeBusinessReadPath,
  normalizeBusinessReadPaths,
} from './read-boundary.ts'
import type { BusinessReadRoots } from './read-boundary.ts'
import { businessWorkbenchDomainSpec } from './spec.ts'
import { assertBusinessJobTransition } from './state-machine.ts'
import { resolveSkillSnapshots, skillManifestHash, verifySkillSnapshots } from './skill-snapshot.ts'
import { buildXhsOutputBundle, parseXhsAgentDraft, wrapXhsAgentText, xhsProvenanceSchema } from './xhs-output-bundle.ts'
import {
  buildXhsHardValidationArtifact,
  projectXhsExecutionContract,
  renderXhsExecutionChecklist,
  validateXhsDraft,
  xhsHardValidationArtifactSchema,
} from './xhs-hard-contract.ts'
import type { XhsExecutionContractProjection, XhsHardValidationResult } from './xhs-hard-contract.ts'
import {
  XHS_PROJECT_RELATIVE_PATH,
  XHS_PRODUCTION_WORKFLOW_VERSION,
  XhsProductionSourceResolver,
  xhsProductionSourceManifestHash,
} from './xhs-production-source.ts'
import type { XhsProductionResolution } from './xhs-production-source.ts'
import {
  assertXhsReviewSource,
  assertXhsRetryAvailable,
  assertXhsRetrySource,
  buildXhsReviewArtifactDocument,
  nextXhsRevisionNumber,
  parseXhsReviewArtifactDocument,
  revisionPreflight,
  xhsReviewCandidate,
  xhsStructuralRetryReason,
} from './xhs-revision-retry.ts'
import {
  assertXhsExecutionSkillRequirement,
  resolveXhsExecutionSkillRequirement,
  XHS_BODY_CONTRACT_REPAIR_WORKFLOW_VERSION,
  XHS_BODY_LENGTH_REPAIR_WORKFLOW_VERSION,
  XHS_BODY_RETRY_WORKFLOW_VERSION,
  XHS_BODY_REVISION_WORKFLOW_VERSION,
} from './xhs-action-contract.ts'
import type {
  AcquireBusinessExecutionLeaseRequest,
  BusinessArtifact,
  BusinessArtifactContent,
  BusinessArtifactId,
  BusinessArtifactReconciliation,
  BusinessArtifactVerification,
  BusinessAgentRun,
  BusinessAttempt,
  BusinessAttemptId,
  BusinessBatch,
  BusinessBatchId,
  BusinessExecutionInputContent,
  BusinessExecutionPackage,
  BusinessExecutionPackageVerification,
  BusinessExecutionStatus,
  BusinessInputReference,
  BusinessJob,
  BusinessJobId,
  BusinessOperationReceipt,
  BusinessOutputBundleContent,
  BusinessOutputBundleId,
  BusinessOutputBundleReconciliation,
  CommitBusinessArtifactRequest,
  CompleteBusinessAttemptRequest,
  CreateBusinessAttemptRequest,
  CreateBusinessBatchRequest,
  CreateBusinessExecutionPackageRequest,
  CreateXhsProductionExecutionPackageRequest,
  CreateXhsContractRepairExecutionPackageRequest,
  CreateXhsLengthRepairExecutionPackageRequest,
  CreateXhsLengthRepairApprovalRequest,
  CreateXhsRetryExecutionPackageRequest,
  CreateXhsRevisionExecutionPackageRequest,
  CreateXhsReviewArtifactRequest,
  ReadBusinessExecutionInputRequest,
  RestrictedBusinessAgentResult,
  ReleaseBusinessExecutionLeaseRequest,
  RenewBusinessExecutionLeaseRequest,
  TransitionBusinessJobRequest,
  RunRestrictedBusinessAgentRequest,
  XhsProductionExecutionPackageResult,
  XhsReviewArtifactResult,
  XhsSecondPassPreflight,
  XhsExecutionLineage,
  XhsLengthRepairApprovalResult,
} from './types.ts'

export { BusinessArtifactStore, artifactRelativePath, sha256Text } from './artifact-store.ts'
export { BusinessOutputBundleStore } from './output-bundle-store.ts'
export { countXhsFullCharacters, xhsTitleCharacterObservation } from './execution-telemetry.ts'
export {
  buildXhsCoverHandoffArtifact,
  parseXhsCoverHandoffArtifact,
  serializeXhsCoverHandoffArtifact,
  XHS_COVER_HANDOFF_VERSION,
  xhsCoverHandoffArtifactSchema,
  xhsTitlePairContractSchema,
} from './xhs-cover-handoff.ts'
export type { BuildXhsCoverHandoffRequest, XhsCoverHandoffArtifact, XhsTitlePairContract } from './xhs-cover-handoff.ts'
export {
  buildXhsSearchSolutionCoverPlan,
  countXhsSwissTitleCharacters,
  parseXhsCoverPlan,
  XHS_COVER_PLAN_VERSION,
  xhsCoverPlanSchema,
} from './xhs-cover-plan.ts'
export type { XhsCoverPlan, XhsCoverPlanPageInput } from './xhs-cover-plan.ts'
export {
  assertXhsContractRepairAvailable,
  contractRepairPreflight,
  deriveXhsContractRepairScope,
  xhsContractRepairConsumedAllowance,
} from './xhs-contract-repair.ts'
export {
  assertXhsLengthRepairEligibility,
  buildXhsLengthRepairApproval,
  buildXhsLengthRepairApprovalFromDrafts,
  settleXhsLengthRepairProposal,
  XHS_LENGTH_REPAIR_APPROVAL_VERSION,
  XHS_LENGTH_REPAIR_EVIDENCE_VERSION,
  XHS_LENGTH_REPAIR_PROPOSAL_VERSION,
  xhsLengthRepairProposalSchema,
} from './xhs-length-repair.ts'
export type {
  XhsLengthRepairApprovalDocument,
  XhsLengthRepairEligibility,
  XhsLengthRepairProposal,
  XhsLengthRepairSettlement,
  XhsLengthRepairTrial,
} from './xhs-length-repair.ts'
export {
  buildXhsHardValidationArtifact,
  projectXhsExecutionContract,
  replayXhsHistoricalDraft,
  renderXhsExecutionChecklist,
  validateXhsDraft,
  XHS_HARD_CONTRACT_VERSION,
  XHS_HARD_VALIDATION_VERSION,
  XHS_HARD_VALIDATOR,
  xhsExecutionContractProjectionSchema,
  xhsHardValidationArtifactSchema,
  xhsHardValidationResultSchema,
} from './xhs-hard-contract.ts'
export type { XhsExecutionContractProjection, XhsHardValidationResult, XhsHistoricalDraftReplayResult } from './xhs-hard-contract.ts'
export {
  parseXhsDraftFormat,
  recoverXhsHistoricalDraft,
  renderXhsDraftFormat,
  XHS_DRAFT_FORMAT,
  XHS_DRAFT_FORMAT_VERSION,
  xhsDraftFormatIssueCodeSchema,
} from './xhs-draft-format.ts'
export type {
  XhsDraftEvidence,
  XhsDraftFormatIssueCode,
  XhsDraftFormatParseResult,
  XhsHistoricalDraftRecovery,
} from './xhs-draft-format.ts'
export { BusinessWorkbenchError } from './errors.ts'
export type {
  BusinessWorkbenchErrorCode,
  BusinessWorkbenchErrorDetail,
  RestrictedAgentOutputDiagnostics,
} from './errors.ts'
export {
  BusinessArtifactId,
  BusinessAttemptId,
  BusinessBatchId,
  BusinessExecutionPackageId,
  BusinessAgentRunId,
  BusinessOutputBundleId,
  BusinessJobId,
} from './ids.ts'
export { BusinessReadBoundary, executionPackageHash, normalizeBusinessReadPath } from './read-boundary.ts'
export type { BusinessReadRoots } from './read-boundary.ts'
export {
  XHS_PROJECT_RELATIVE_PATH,
  XHS_PRODUCTION_BASELINE_RELATIVE_PATH,
  XHS_PRODUCTION_ENTRY_RELATIVE_PATH,
  XHS_PRODUCTION_SOURCE_ADAPTER_VERSION,
  XHS_PRODUCTION_SOURCE_CONTRACT_SCHEMA_VERSION,
  XHS_PRODUCTION_WORKFLOW_VERSION,
  XhsProductionSourceResolver,
  xhsProductionSourceManifestHash,
} from './xhs-production-source.ts'
export {
  BUSINESS_WORKBENCH_SCHEMA_VERSION,
  businessArtifactSchema,
  businessAgentArtifactProvenanceSchema,
  businessAgentModelSchema,
  businessAgentRunSchema,
  businessAttemptSchema,
  businessBatchSchema,
  businessExecutionInputSchema,
  businessExecutionLeaseSchema,
  businessExecutionPackageSchema,
  businessInputReferenceSchema,
  businessJobSchema,
  businessOperationReceiptSchema,
  businessOutputBundleEntrySchema,
  businessOutputBundleSchema,
  businessSkillSnapshotSchema,
  businessWorkbenchDomainSpec,
  xhsProductionSourceManifestSchema,
} from './spec.ts'
export {
  XHS_BODY_ACTION_POLICY_VERSION,
  XHS_BODY_PREPARE_ASSEMBLY,
  XHS_PRODUCTION_INPUT_BINDINGS,
  XHS_PRODUCTION_SKILL_BINDINGS,
} from './host-policy.ts'
export {
  assertXhsOutputBundle,
  buildXhsOutputBundle,
  parseXhsAgentDraft,
  XHS_DRAFT_MAX_BYTES,
  XHS_OUTPUT_VERSION,
  xhsDraftMetadataSchema,
  xhsOutputBundleManifestHash,
  xhsProvenanceSchema,
} from './xhs-output-bundle.ts'
export { assertBusinessJobTransition, isBusinessJobTransitionAllowed } from './state-machine.ts'
export { businessBatchParticipation } from './participation.ts'
export type { BusinessBatchParticipation } from './participation.ts'
export {
  assertXhsBodyPrepareExecutionPackage,
  assertXhsBodyContractRepairExecutionPackage,
  assertXhsBodyLengthRepairExecutionPackage,
  assertXhsBodyRetryExecutionPackage,
  assertXhsBodyRevisionExecutionPackage,
  assertXhsExecutionSkillRequirement,
  XHS_EXECUTION_SKILL_REQUIREMENTS,
  XHS_BODY_PREPARE_ACTION,
  XHS_BODY_CONTRACT_REPAIR_ACTION,
  XHS_BODY_CONTRACT_REPAIR_WORKFLOW_VERSION,
  XHS_BODY_LENGTH_REPAIR_ACTION,
  XHS_BODY_LENGTH_REPAIR_WORKFLOW_VERSION,
  XHS_BODY_PREPARE_CONTRACT,
  XHS_BODY_PREPARE_INPUT_ROLES,
  XHS_BODY_PREPARE_OUTPUT_NAMES,
  XHS_BODY_PREPARE_SKILLS,
  XHS_BODY_PREPARE_WORKFLOW_VERSION,
  XHS_BODY_RETRY_ACTION,
  XHS_BODY_RETRY_WORKFLOW_VERSION,
  XHS_BODY_REVISION_ACTION,
  XHS_BODY_REVISION_WORKFLOW_VERSION,
  resolveXhsExecutionSkillRequirement,
  xhsBodyPrepareIdempotencyKey,
} from './xhs-action-contract.ts'
export type { XhsExecutionSkillRequirement } from './xhs-action-contract.ts'
export {
  assertXhsReviewSource,
  buildXhsReviewArtifactDocument,
  nextXhsRevisionNumber,
  parseXhsReviewArtifactDocument,
  xhsReviewArtifactDocumentSchema,
  xhsReviewCandidate,
  xhsReviewDocumentHash,
  xhsStructuralRetryReason,
  assertXhsRetryAvailable,
  assertXhsRetrySource,
} from './xhs-revision-retry.ts'
export type { XhsReviewCandidateDescriptor } from './xhs-revision-retry.ts'
export type * from './types.ts'

/** Cordis service key. */
export const name = 'business-workbench'

/** Deployment path enabling deterministic formal XHS source resolution. */
export interface XhsProductionSourceConfig {
  /** Existing Vault root containing the formal entry, baseline, Project, and S3 files. */
  readonly vaultRoot: string
}

/** Host configuration for execution ownership and isolated storage. */
export interface Config {
  /** Explicit Harness home; omitted follows `DSH_HOME`, then `~/.dsh`. */
  readonly dshHome?: string
  /** Physical directories mounted behind fixed Business logical roots. */
  readonly readRoots?: BusinessReadRoots
  /** Optional formal Vault root enabling exact XHS production-source resolution. */
  readonly xhsProductionSource?: XhsProductionSourceConfig
  /** Lease lifetime; callers renew before this many milliseconds elapse. */
  readonly leaseDurationMs: number
  /** Fixed model route for every restricted action; omission disables execution. */
  readonly restrictedAgent?: RestrictedAgentModelConfig
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    businessWorkbench: BusinessWorkbenchService
  }
}

/** Deep-freeze a structured clone before returning durable state to callers. */
function snapshot<T>(value: T): T {
  const copied = structuredClone(value)
  const freeze = (item: unknown): void => {
    if (typeof item !== 'object' || item === null || Object.isFrozen(item)) return
    for (const child of Object.values(item)) freeze(child)
    Object.freeze(item)
  }
  freeze(copied)
  return copied
}

/** SHA-256 a deterministic JSON tuple used only for operation equality. */
function fingerprint(parts: readonly unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex')
}

/** Exclude observation timestamps while preserving every production source identity. */
function productionResolutionFingerprint(resolution: XhsProductionResolution): Readonly<Record<string, unknown>> {
  const { resolvedAt: _resolvedAt, manifestHash: _manifestHash, ...sourceIdentity } = resolution.sourceManifest
  return Object.freeze({ sourceIdentity, skillSnapshotHash: resolution.skillSnapshot.snapshotHash })
}

/** Reject empty retry keys at the Host API boundary. */
function assertOperationKey(key: string): void {
  if (key.length === 0) throw new BusinessWorkbenchError('INVALID_OPERATION', 'business-workbench: idempotencyKey must not be empty')
}

/** Reject blank caller identities and version names. */
function nonblank(value: string, field: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) throw new BusinessWorkbenchError('INVALID_OPERATION', `business-workbench: ${field} must not be blank`)
  return trimmed
}

/** Reject stale or nonsensical compare-and-swap revisions. */
function assertExpectedRevision(current: BusinessJob, expected: number): void {
  if (!Number.isSafeInteger(expected) || expected < 0) {
    throw new BusinessWorkbenchError('INVALID_OPERATION', `business-workbench: invalid expected revision ${String(expected)}`)
  }
  if (current.revision !== expected) {
    throw new BusinessWorkbenchError('REVISION_CONFLICT', `business-workbench: Job '${current.id}' is at revision ${current.revision}, not ${expected}`, {
      currentRevision: current.revision,
      subjectId: current.id,
    })
  }
}

/** Normalize optional diagnostics while rejecting blank durable values. */
function resolveReason(reason: string | undefined): string | undefined {
  if (reason === undefined) return undefined
  return nonblank(reason, 'reason')
}

/** Construct one immutable operation receipt. */
function receipt(
  key: string,
  kind: BusinessOperationReceipt['kind'],
  operationFingerprint: string,
  revision: number,
  createdAt: number,
  resultId?: string,
): BusinessOperationReceipt {
  return Object.freeze({
    key, kind, fingerprint: operationFingerprint, revision,
    ...(resultId === undefined ? {} : { resultId }),
    createdAt,
  })
}

interface PreparedRestrictedAgentRun {
  readonly kind: 'run'
  readonly run: BusinessAgentRun
  readonly executionPackage: BusinessExecutionPackage
  readonly inputContents: readonly { readonly role: string; readonly path: string; readonly content: string }[]
  readonly runtime: HarnessRestrictedAgentRuntime
  readonly timeoutMs: number
  readonly policy: RestrictedAgentPolicy
  readonly hardContract?: XhsExecutionContractProjection
}

interface ReplayedRestrictedAgentRun {
  readonly kind: 'replay'
  readonly result: RestrictedBusinessAgentResult
}

type RestrictedAgentPreparation = PreparedRestrictedAgentRun | ReplayedRestrictedAgentRun

/** Find and validate a durable idempotency receipt. */
function repeatedOperation(
  job: BusinessJob,
  key: string,
  kind: BusinessOperationReceipt['kind'],
  operationFingerprint: string,
): BusinessOperationReceipt | undefined {
  const existing = job.operations.find(operation => operation.key === key)
  if (existing === undefined) return undefined
  if (existing.kind !== kind || existing.fingerprint !== operationFingerprint) {
    throw new BusinessWorkbenchError('IDEMPOTENCY_CONFLICT', `business-workbench: idempotency key '${key}' was already used for another Job operation`, { subjectId: job.id })
  }
  return existing
}

/** Remove an optional status reason from a copied Job. */
function withoutStatusReason(job: BusinessJob): Omit<BusinessJob, 'statusReason'> {
  const { statusReason: _statusReason, ...rest } = job
  return rest
}

/** Durable Business authority with an optional Host-restricted one-turn Agent route. */
export class BusinessWorkbenchService extends Service {
  static inject = ['storageDomain']

  /** Loader validation for execution ownership and isolated roots. */
  static Config: s<Config> = s.object({
    dshHome: s.string(),
    readRoots: s.object({
      xhs: s.string().required(),
      sharedProductTruth: s.string(),
    }).default(undefined as unknown as { xhs: string; sharedProductTruth: string }),
    xhsProductionSource: s.object({
      vaultRoot: s.string().required(),
    }).default(undefined as unknown as { vaultRoot: string }),
    leaseDurationMs: s.number().step(1).min(1).required(),
    restrictedAgent: s.object({
      provider: s.string().required(),
      model: s.string().required(),
      reasoningEffort: s.string(),
      maxTokens: s.number().step(1).min(1),
      timeoutMs: s.number().step(1).min(1).required(),
    }).default(undefined as unknown as {
      provider: string
      model: string
      reasoningEffort: string
      maxTokens: number
      timeoutMs: number
    }),
  })

  /** Absolute versioned Artifact root. */
  readonly artifactRoot: string
  /** Per-process identity used to invalidate leases after restart. */
  readonly runtimeInstanceId: string = randomUUID()

  private batches?: KvTable<BusinessBatchId, BusinessBatch>
  private jobs?: KvTable<BusinessJobId, BusinessJob>
  private readonly artifactStore: BusinessArtifactStore
  private readonly outputBundleStore: BusinessOutputBundleStore
  private readonly executionTelemetry: BusinessExecutionTelemetryStore
  private readonly readBoundary: BusinessReadBoundary | undefined
  private readonly productionSourceResolver: XhsProductionSourceResolver | undefined
  private operationTail: Promise<void> = Promise.resolve()
  private mutationAdmissionOpen = true

  /**
   * @param ctx - Host context carrying `storageDomain`.
   * @param config - Required lease policy and optional isolated roots.
   */
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'businessWorkbench')
    if (config.restrictedAgent !== undefined && config.restrictedAgent.timeoutMs >= config.leaseDurationMs) {
      throw new Error('business-workbench: restrictedAgent.timeoutMs must be shorter than leaseDurationMs')
    }
    this.artifactRoot = resolve(join(resolveDshHome(config.dshHome), 'business-workbench', 'v0.1'))
    this.artifactStore = new BusinessArtifactStore(this.artifactRoot)
    this.outputBundleStore = new BusinessOutputBundleStore(this.artifactRoot)
    this.executionTelemetry = new BusinessExecutionTelemetryStore(this.artifactRoot)
    this.readBoundary = config.readRoots === undefined
      ? undefined
      : new BusinessReadBoundary({
        xhs: resolve(config.readRoots.xhs),
        businessArtifacts: this.artifactRoot,
        ...(config.readRoots.sharedProductTruth === undefined
          ? {}
          : { sharedProductTruth: resolve(config.readRoots.sharedProductTruth) }),
      })
    if (config.xhsProductionSource !== undefined && this.readBoundary === undefined) {
      throw new Error('business-workbench: xhsProductionSource requires readRoots.xhs')
    }
    this.productionSourceResolver = config.xhsProductionSource === undefined
      ? undefined
      : new XhsProductionSourceResolver(resolve(config.xhsProductionSource.vaultRoot))
  }

  /** Open version-5 state, recover abandoned execution, and verify referenced durable bytes. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(businessWorkbenchDomainSpec)
    this.ctx.effect(() => async () => {
      this.mutationAdmissionOpen = false
      await this.operationTail
      await domain.close()
    }, 'business-workbench.domainClose')
    this.batches = domain.table('batches')
    this.jobs = domain.table('jobs')
    await this.artifactStore.initialize()
    await this.outputBundleStore.initialize()
    await this.readBoundary?.initialize()
    if (this.productionSourceResolver !== undefined) {
      await this.productionSourceResolver.initialize(this.requireReadBoundary().projectRoot())
    }
    await this.recoverCreatingBatches()
    this.validateReadyBatches()
    this.validateExecutionPackages()
    await this.verifyAllArtifacts()
    await this.verifyAllOutputBundles()
    await this.recoverInterruptedExecutions()
  }

  /**
   * Create or recover one single- or four-participant Batch.
   * @param request - Closed mode, Project/type, matching inputs, and stable retry key.
   * @returns the ready durable Batch.
   */
  createBatch(request: CreateBusinessBatchRequest): Promise<BusinessBatch> {
    return this.enqueueMutation(async () => {
      this.validateCreateBatchRequest(request)
      const createFingerprint = fingerprint([
        request.mode,
        request.project,
        request.type,
        request.inputs.map(input => [input.reference, input.sha256]),
      ])
      const existing = [...this.requireBatches().entries()]
        .map(([, batch]) => batch)
        .find(batch => batch.createKey === request.idempotencyKey)
      if (existing !== undefined) {
        if (existing.createFingerprint !== createFingerprint) throw new BusinessWorkbenchError('IDEMPOTENCY_CONFLICT', `business-workbench: Batch idempotency key '${request.idempotencyKey}' was already used`, { subjectId: existing.id })
        return snapshot(await this.materializeBatch(existing))
      }
      const createdAt = Date.now()
      const jobCount = request.mode === 'single' ? 1 : 4
      const jobIds = Object.freeze(Array.from({ length: jobCount }, () => toBusinessJobId(randomUUID()))) as BusinessBatch['jobIds']
      const batch: BusinessBatch = Object.freeze({
        id: toBusinessBatchId(randomUUID()), project: request.project, type: request.type, mode: request.mode, status: 'creating', jobIds,
        participatingJobIds: jobIds,
        inputs: Object.freeze(request.inputs.map(input => Object.freeze({ ...input }))) as BusinessBatch['inputs'],
        revision: 0, createKey: request.idempotencyKey, createFingerprint, createdAt, updatedAt: createdAt,
      })
      await this.requireBatches().put(batch.id, batch)
      return snapshot(await this.materializeBatch(batch))
    })
  }

  /**
   * Return one immutable Batch snapshot.
   * @param batchId - Batch to read.
   * @returns the snapshot, or `undefined` when unknown.
   */
  getBatch(batchId: BusinessBatchId): BusinessBatch | undefined {
    const batch = this.requireBatches().get(batchId)
    return batch === undefined ? undefined : snapshot(batch)
  }

  /**
   * Return ready Batches in stable creation order.
   * @returns immutable Batch snapshots.
   */
  listBatches(): readonly BusinessBatch[] {
    return Object.freeze([...this.requireBatches().entries()].map(([, batch]) => batch).filter(batch => batch.status === 'ready')
      .sort((left, right) => left.createdAt - right.createdAt || String(left.id).localeCompare(String(right.id))).map(snapshot))
  }

  /**
   * Return one immutable Job snapshot.
   * @param jobId - Job to read.
   * @returns the snapshot, or `undefined` when unknown.
   */
  getJob(jobId: BusinessJobId): BusinessJob | undefined {
    const job = this.requireJobs().get(jobId)
    return job === undefined ? undefined : snapshot(job)
  }

  /**
   * Return the owning Batch's one or four stored Jobs in Batch order.
   * @param batchId - Batch whose Jobs should be read.
   * @returns immutable Job snapshots, including legacy placeholders when present.
   */
  listJobs(batchId: BusinessBatchId): readonly BusinessJob[] {
    const batch = this.requireBatches().get(batchId)
    if (batch === undefined) throw new BusinessWorkbenchError('NOT_FOUND', `business-workbench: Batch '${batchId}' was not found`, { subjectId: batchId })
    return Object.freeze(batch.jobIds.map((jobId) => {
      const job = this.requireJobs().get(jobId)
      if (job === undefined || job.batchId !== batch.id) throw new BusinessWorkbenchError('BATCH_CORRUPT', `business-workbench: Batch '${batch.id}' does not have its declared Job '${jobId}'`, { subjectId: batch.id })
      return snapshot(job)
    }))
  }

  /**
   * Apply a non-execution Job transition with compare-and-swap.
   * @param request - Observed Job revision, target state, and retry key.
   * @returns the committed Job snapshot.
   */
  transitionJob(request: TransitionBusinessJobRequest): Promise<BusinessJob> {
    return this.enqueueMutation(async () => {
      assertOperationKey(request.idempotencyKey)
      const reason = resolveReason(request.reason)
      const operationFingerprint = fingerprint([request.status, reason ?? null])
      const current = this.requireJob(request.jobId)
      if (repeatedOperation(current, request.idempotencyKey, 'transition', operationFingerprint) !== undefined) return snapshot(current)
      assertExpectedRevision(current, request.expectedRevision)
      if (request.status === 'running' || request.status === 'interrupted' || request.status === 'completed' || request.status === 'failed') {
        throw new BusinessWorkbenchError('INVALID_OPERATION', 'business-workbench: execution state changes require their dedicated methods')
      }
      if (current.status === 'running') throw new BusinessWorkbenchError('INVALID_OPERATION', 'business-workbench: a running Job requires its execution owner')
      assertBusinessJobTransition(current.status, request.status)
      const updatedAt = Date.now()
      const revision = current.revision + 1
      const attempts = current.currentAttempt === null
        ? current.attempts
        : current.attempts.map(attempt => attempt.id === current.currentAttempt
          ? Object.freeze({
            ...attempt,
            status: 'cancelled' as const,
            completedAt: updatedAt,
            ...(reason === undefined ? {} : { statusReason: reason }),
          })
          : attempt)
      const next = await this.requireJobs().update(request.jobId, (latest) => {
        assertExpectedRevision(latest, request.expectedRevision)
        return Object.freeze({ ...withoutStatusReason(latest), status: request.status, revision, currentAttempt: null,
          attempts: Object.freeze(attempts), operations: Object.freeze([...latest.operations, receipt(request.idempotencyKey, 'transition', operationFingerprint, revision, updatedAt)]),
          ...(reason === undefined ? {} : { statusReason: reason }), updatedAt })
      })
      return snapshot(next)
    })
  }

  /**
   * Create a pending Attempt without claiming execution ownership.
   * @param request - Observed Job revision and retry key.
   * @returns the Job containing the new pending Attempt.
   */
  createAttempt(request: CreateBusinessAttemptRequest): Promise<BusinessJob> {
    return this.enqueueMutation(async () => {
      assertOperationKey(request.idempotencyKey)
      const operationFingerprint = fingerprint(['create-attempt'])
      const current = this.requireJob(request.jobId)
      if (repeatedOperation(current, request.idempotencyKey, 'create-attempt', operationFingerprint) !== undefined) return snapshot(current)
      assertExpectedRevision(current, request.expectedRevision)
      if (current.status !== 'ready' && current.status !== 'interrupted') throw new BusinessWorkbenchError('INVALID_TRANSITION', `business-workbench: cannot create Attempt from '${current.status}'`)
      if (current.currentAttempt !== null) throw new BusinessWorkbenchError('INVALID_OPERATION', 'business-workbench: Job already has a pending Attempt')
      const createdAt = Date.now()
      const attempt: BusinessAttempt = Object.freeze({
        id: toBusinessAttemptId(randomUUID()),
        jobId: current.id,
        sequence: current.attempts.length + 1,
        status: 'pending',
        lease: null,
        executionPackage: null,
        agentRuns: Object.freeze([]),
        outputBundle: null,
        createdAt,
      })
      const revision = current.revision + 1
      const next = await this.requireJobs().update(request.jobId, (latest) => {
        assertExpectedRevision(latest, request.expectedRevision)
        return Object.freeze({ ...withoutStatusReason(latest), status: 'ready', revision, currentAttempt: attempt.id,
          attempts: Object.freeze([...latest.attempts, attempt]), operations: Object.freeze([...latest.operations,
            receipt(request.idempotencyKey, 'create-attempt', operationFingerprint, revision, createdAt, attempt.id)]), updatedAt: createdAt })
      })
      return snapshot(next)
    })
  }

  /**
   * Acquire the sole valid execution lease for a pending Attempt.
   * @param request - Attempt, owner, observed revision, and retry key.
   * @returns the running Job snapshot.
   */
  acquireExecutionLease(request: AcquireBusinessExecutionLeaseRequest): Promise<BusinessJob> {
    return this.enqueueMutation(async () => {
      assertOperationKey(request.idempotencyKey)
      const ownerId = nonblank(request.ownerId, 'ownerId')
      const operationFingerprint = fingerprint([request.attemptId, ownerId])
      const current = this.requireJob(request.jobId)
      if (repeatedOperation(current, request.idempotencyKey, 'acquire-lease', operationFingerprint) !== undefined) return snapshot(current)
      assertExpectedRevision(current, request.expectedRevision)
      const attempt = this.requireCurrentAttempt(current, request.attemptId, 'pending')
      const now = Date.now()
      const lease = Object.freeze({
        attemptId: attempt.id,
        ownerId,
        runtimeInstanceId: this.runtimeInstanceId,
        acquiredAt: now,
        renewedAt: now,
        leaseExpiresAt: now + this.config.leaseDurationMs,
        status: 'active' as const,
      })
      const revision = current.revision + 1
      const next = await this.requireJobs().update(request.jobId, (latest) => {
        assertExpectedRevision(latest, request.expectedRevision)
        return Object.freeze({ ...withoutStatusReason(latest), status: 'running', revision,
          attempts: Object.freeze(latest.attempts.map(item => item.id === attempt.id ? Object.freeze({ ...item, status: 'running' as const, lease }) : item)),
          operations: Object.freeze([...latest.operations, receipt(request.idempotencyKey, 'acquire-lease', operationFingerprint, revision, now, attempt.id)]), updatedAt: now })
      })
      return snapshot(next)
    })
  }

  /**
   * Renew the current owner's non-expired lease through Job CAS.
   * @param request - Current owner and observed Job revision.
   * @returns the Job containing the renewed lease.
   */
  renewExecutionLease(request: RenewBusinessExecutionLeaseRequest): Promise<BusinessJob> {
    return this.enqueueMutation(async () => {
      assertOperationKey(request.idempotencyKey)
      const ownerId = nonblank(request.ownerId, 'ownerId')
      const operationFingerprint = fingerprint([request.attemptId, ownerId])
      const current = this.requireJob(request.jobId)
      if (repeatedOperation(current, request.idempotencyKey, 'renew-lease', operationFingerprint) !== undefined) return snapshot(current)
      assertExpectedRevision(current, request.expectedRevision)
      const attempt = this.requireCurrentAttempt(current, request.attemptId, 'running')
      const currentLease = this.assertLiveLease(attempt, ownerId)
      const now = Date.now()
      const lease = Object.freeze({ ...currentLease, renewedAt: now, leaseExpiresAt: now + this.config.leaseDurationMs })
      const revision = current.revision + 1
      const next = await this.requireJobs().update(request.jobId, (latest) => {
        assertExpectedRevision(latest, request.expectedRevision)
        return Object.freeze({ ...latest, revision,
          attempts: Object.freeze(latest.attempts.map(item => item.id === attempt.id ? Object.freeze({ ...item, lease }) : item)),
          operations: Object.freeze([...latest.operations, receipt(request.idempotencyKey, 'renew-lease', operationFingerprint, revision, now, attempt.id)]), updatedAt: now })
      })
      return snapshot(next)
    })
  }

  /**
   * Release execution ownership and retain the Attempt as interrupted history.
   * @param request - Current owner, observed revision, and optional reason.
   * @returns the interrupted Job snapshot.
   */
  releaseExecutionLease(request: ReleaseBusinessExecutionLeaseRequest): Promise<BusinessJob> {
    return this.enqueueMutation(async () => this.endAsInterrupted(request, resolveReason(request.reason) ?? 'execution-owner-released'))
  }

  /**
   * Freeze one current Attempt's exact inputs and declarative capability lists.
   * @param request - Input files, allow-lists, owner, and observed revision.
   * @returns the immutable execution package.
   */
  createExecutionPackage(request: CreateBusinessExecutionPackageRequest): Promise<BusinessExecutionPackage> {
    return this.enqueueMutation(async () => this.createExecutionPackageNow(request))
  }

  /**
   * Resolve one formal XHS production slot and freeze it into the current Attempt.
   * @param request - Exact slot identity plus current lease and compare-and-swap facts.
   * @returns the durable package and content-free source evidence.
   */
  async createXhsProductionExecutionPackage(
    request: CreateXhsProductionExecutionPackageRequest,
  ): Promise<XhsProductionExecutionPackageResult> {
    const ownerId = nonblank(request.ownerId, 'ownerId')
    const current = this.requireJob(request.jobId)
    const attempt = this.requireCurrentAttempt(current, request.attemptId, 'running')
    this.assertLiveLease(attempt, ownerId)
    const resolver = this.requireProductionSourceResolver()
    const resolution = await resolver.resolve(request.identity, Date.now())
    const packageBuildStartedAt = performance.now()
    const packageRequest: CreateBusinessExecutionPackageRequest = {
      jobId: request.jobId,
      attemptId: request.attemptId,
      expectedRevision: request.expectedRevision,
      idempotencyKey: request.idempotencyKey,
      ownerId: request.ownerId,
      workflowVersion: XHS_PRODUCTION_WORKFLOW_VERSION,
      inputs: resolution.inputs,
      allowedReadRoots: [],
      allowedReadFiles: resolution.allowedReadFiles,
      allowedCapabilities: ['restricted-agent'],
      allowedSkills: [resolution.skillSnapshot.skillId],
    }
    const executionPackage = await this.enqueueMutation(async () => this.createExecutionPackageNow(packageRequest, resolution))
    const executionPackageBuildMs = performance.now() - packageBuildStartedAt
    const sourceManifest = executionPackage.productionSource
    if (sourceManifest === undefined) throw new Error('business-workbench: production package lost its source manifest')
    return Object.freeze({
      executionPackage,
      sourceManifest: snapshot(sourceManifest),
      timing: Object.freeze({ ...resolution.timing, executionPackageBuildMs }),
    })
  }

  /**
   * Persist one immutable business review on a new additive Revision Job.
   * @param request - Target Revision Job, reviewed candidate identity, review text, and compare-and-swap facts.
   * @returns the committed Review Artifact and its verified document.
   */
  createXhsReviewArtifact(request: CreateXhsReviewArtifactRequest): Promise<XhsReviewArtifactResult> {
    return this.enqueueMutation(async () => {
      assertOperationKey(request.idempotencyKey)
      const current = this.requireJob(request.jobId)
      const repeatedFingerprint = fingerprint([
        request.attemptId, request.sourceJobId, request.sourceAttemptId, request.sourceDraftSha256,
        request.reviewResult, request.requiredChanges, request.qualitySuggestions, request.preserve,
        request.reviewerType, request.reviewedAt,
      ])
      const repeated = repeatedOperation(current, request.idempotencyKey, 'commit-artifact', repeatedFingerprint)
      if (repeated !== undefined) {
        const artifact = current.artifactRefs.find(item => item.artifactId === repeated.resultId)
        if (artifact === undefined) throw new BusinessWorkbenchError('ARTIFACT_CORRUPT', 'business-workbench: Review receipt has no Artifact')
        const stored = await this.artifactStore.read(artifact, current.batchId)
        return Object.freeze({ artifact: snapshot(artifact), review: parseXhsReviewArtifactDocument(stored.content) })
      }
      assertExpectedRevision(current, request.expectedRevision)
      const targetAttempt = this.requireCurrentAttempt(current, request.attemptId, 'pending')
      if (targetAttempt.executionPackage !== null || current.artifactRefs.some(item => item.type === 'review')) {
        throw new BusinessWorkbenchError('XHS_REVIEW_INVALID', 'business-workbench: Revision Job already has review or execution state')
      }
      const source = await this.requireSourceOutput(request.sourceJobId, request.sourceAttemptId)
      if (current.input.sha256 !== source.job.input.sha256 || current.input.reference !== source.job.input.reference) {
        throw new BusinessWorkbenchError('XHS_REVIEW_INVALID', 'business-workbench: Revision Job input differs from its source Job')
      }
      await this.verifyExecutionPackage(source.job.id, source.attempt.id)
      await this.assertReviewableXhsSource(source.job, source.attempt, source.bundle.id)
      const draftEntry = source.bundle.entries.find(entry => entry.name === 'draft.md')
      if (draftEntry === undefined || draftEntry.hash !== request.sourceDraftSha256) {
        throw new BusinessWorkbenchError('XHS_REVIEW_INVALID', 'business-workbench: requested source draft hash does not match the authoritative bundle')
      }
      const candidate = xhsReviewCandidate(source.attempt.executionPackage?.lineage)
      if (candidate.candidateType === 'length_repair') {
        throw new BusinessWorkbenchError('XHS_REVIEW_INVALID', 'business-workbench: length-repair Candidate requires Patch Approval, not another business Review')
      }
      const built = buildXhsReviewArtifactDocument({
        review_version: 2,
        project: 'xhs',
        source_job_id: source.job.id,
        source_attempt_id: source.attempt.id,
        source_artifact_id: source.bundle.id,
        source_artifact_path: draftEntry.path,
        source_draft_sha256: draftEntry.hash,
        source_candidate_type: candidate.candidateType,
        ...(candidate.revisionNumber === undefined ? {} : { source_revision_number: candidate.revisionNumber }),
        ...(candidate.retryNumber === undefined ? {} : { source_retry_number: candidate.retryNumber }),
        review_result: request.reviewResult,
        required_changes: Object.freeze([...request.requiredChanges]),
        quality_suggestions: Object.freeze([...request.qualitySuggestions]),
        preserve: Object.freeze([...request.preserve]),
        reviewer_type: request.reviewerType,
        reviewed_at: request.reviewedAt,
        provenance: Object.freeze({
          source_output_bundle_id: source.bundle.id,
          source: 'authoritative-intermediate-output-bundle',
        }),
      })
      const revision = current.revision + 1
      const committedAt = Date.now()
      const artifactId = deriveBusinessArtifactId(current.id, targetAttempt.id, 'review', request.idempotencyKey)
      const artifact: BusinessArtifact = Object.freeze({
        artifactId,
        jobId: current.id,
        attemptId: targetAttempt.id,
        type: 'review',
        revision,
        path: artifactRelativePath({ artifactId, jobId: current.id, attemptId: targetAttempt.id, type: 'review', batchId: current.batchId }),
        hash: sha256Text(built.content),
        bytes: Buffer.byteLength(built.content, 'utf8'),
        createdAt: committedAt,
      })
      await this.artifactStore.commit(artifact, current.batchId, built.content)
      await this.requireJobs().update(current.id, (latest) => {
        assertExpectedRevision(latest, request.expectedRevision)
        return Object.freeze({ ...latest, revision,
          artifactRefs: Object.freeze([...latest.artifactRefs, artifact]),
          operations: Object.freeze([...latest.operations, receipt(request.idempotencyKey, 'commit-artifact', repeatedFingerprint, revision, committedAt, artifact.artifactId)]),
          updatedAt: committedAt })
      })
      return Object.freeze({ artifact: snapshot(artifact), review: built.document })
    })
  }

  /** Persist the only human APPROVE/REJECT decision over a machine-valid length patch.
   * @param request - Target decision Job, repaired Candidate identity, and terminal decision.
   * @returns Immutable Patch Approval Artifact without promotion or another repair.
   */
  createXhsLengthRepairApproval(
    request: CreateXhsLengthRepairApprovalRequest,
  ): Promise<XhsLengthRepairApprovalResult> {
    return this.enqueueMutation(async () => {
      assertOperationKey(request.idempotencyKey)
      const current = this.requireJob(request.jobId)
      assertExpectedRevision(current, request.expectedRevision)
      const targetAttempt = this.requireCurrentAttempt(current, request.attemptId, 'pending')
      if (targetAttempt.executionPackage !== null || current.artifactRefs.some(item => item.type === 'review')) {
        throw new BusinessWorkbenchError('XHS_LENGTH_REPAIR_NOT_ALLOWED', 'business-workbench: Patch Approval Job already has decision or execution state')
      }
      const repaired = await this.requireSourceOutput(request.sourceJobId, request.sourceAttemptId)
      const lineage = repaired.attempt.executionPackage?.lineage
      if (lineage?.kind !== 'length-repair') {
        throw new BusinessWorkbenchError('XHS_LENGTH_REPAIR_NOT_ALLOWED', 'business-workbench: Patch Approval requires a length-repair Candidate')
      }
      const repairedDraft = repaired.files['draft.md']
      if (sha256Text(repairedDraft) !== request.repairedDraftSha256) {
        throw new BusinessWorkbenchError('XHS_LENGTH_REPAIR_NOT_ALLOWED', 'business-workbench: Patch Approval names another repaired Candidate')
      }
      const validation = await this.sourceValidation(repaired.job, repaired.attempt.id, repaired.bundle.id)
      if (validation.result.format.status !== 'PASS' || validation.result.hardContractStatus === 'FAIL') {
        throw new BusinessWorkbenchError('XHS_LENGTH_REPAIR_NOT_ALLOWED', 'business-workbench: Patch Approval requires a machine-valid repaired Candidate')
      }
      const source = await this.requireSourceOutput(lineage.sourceJobId, lineage.sourceAttemptId)
      if (current.input.reference !== source.job.input.reference || current.input.sha256 !== source.job.input.sha256) {
        throw new BusinessWorkbenchError('XHS_LENGTH_REPAIR_NOT_ALLOWED', 'business-workbench: Patch Approval Job does not preserve TaskCard identity')
      }
      const parsedSource = parseXhsDraftFormat(source.files['draft.md'])
      if (parsedSource.status !== 'PASS' || sha256Text(source.files['draft.md']) !== lineage.sourceDraftSha256) {
        throw new BusinessWorkbenchError('XHS_LENGTH_REPAIR_NOT_ALLOWED', 'business-workbench: Patch Approval source Candidate is no longer verifiable')
      }
      const approval = buildXhsLengthRepairApprovalFromDrafts(repairedDraft, parsedSource.evidence.title,
        countXhsFullCharacters(parsedSource.evidence.title), countXhsFullCharacters(parsedSource.evidence.body),
        lineage.sourceDraftSha256, request.decision, request.decidedAt)
      const content = `${JSON.stringify(approval, null, 2)}\n`
      const operationFingerprint = fingerprint([request.sourceJobId, request.sourceAttemptId,
        request.repairedDraftSha256, request.decision, request.decidedAt])
      const artifactId = deriveBusinessArtifactId(current.id, targetAttempt.id, 'review', request.idempotencyKey)
      const committedAt = Date.now()
      const artifact: BusinessArtifact = Object.freeze({ artifactId, jobId: current.id, attemptId: targetAttempt.id,
        type: 'review', revision: current.revision + 1,
        path: artifactRelativePath({ artifactId, jobId: current.id, attemptId: targetAttempt.id, type: 'review', batchId: current.batchId }),
        hash: sha256Text(content), bytes: Buffer.byteLength(content, 'utf8'), createdAt: committedAt })
      await this.artifactStore.commit(artifact, current.batchId, content)
      await this.requireJobs().update(current.id, latest => Object.freeze({ ...latest, revision: latest.revision + 1,
        artifactRefs: Object.freeze([...latest.artifactRefs, artifact]),
        operations: Object.freeze([...latest.operations, receipt(request.idempotencyKey, 'commit-artifact', operationFingerprint,
          latest.revision + 1, committedAt, artifact.artifactId)]), updatedAt: committedAt }))
      return Object.freeze({ artifact: snapshot(artifact), approval })
    })
  }

  /**
   * Verify that one persisted MODIFY review can start an additive Revision execution.
   * @param jobId - Target Revision Job that owns the Review Artifact.
   * @param attemptId - Active target Attempt that will receive the revision package.
   * @param reviewArtifactId - Persisted Review Artifact bound to the reviewed candidate.
   * @returns the ready state and deterministic next revision number.
   */
  async preflightXhsRevision(
    jobId: BusinessJobId,
    attemptId: BusinessAttemptId,
    reviewArtifactId: BusinessArtifactId,
  ): Promise<XhsSecondPassPreflight> {
    const job = this.requireJob(jobId)
    const attempt = job.attempts.find(item => item.id === attemptId)
    if (attempt === undefined || !['pending', 'running'].includes(attempt.status)) {
      throw new BusinessWorkbenchError('XHS_REVIEW_INVALID', 'business-workbench: Revision target Attempt is not active')
    }
    const artifact = job.artifactRefs.find(item => item.artifactId === reviewArtifactId && item.attemptId === attemptId && item.type === 'review')
    if (artifact === undefined) throw new BusinessWorkbenchError('XHS_REVIEW_INVALID', 'business-workbench: Revision Job lacks its Review Artifact')
    const stored = await this.artifactStore.read(artifact, job.batchId)
    const review = parseXhsReviewArtifactDocument(stored.content)
    const source = await this.requireSourceOutput(review.source_job_id, review.source_attempt_id)
    await this.verifyExecutionPackage(source.job.id, source.attempt.id)
    const candidate = xhsReviewCandidate(source.attempt.executionPackage?.lineage)
    assertXhsReviewSource(review, source.bundle, sha256Text(source.files['draft.md']), candidate)
    if (job.input.reference !== source.job.input.reference || job.input.sha256 !== source.job.input.sha256) {
      throw new BusinessWorkbenchError('XHS_REVIEW_INVALID', 'business-workbench: Revision Job does not preserve the source TaskCard identity')
    }
    await this.assertReviewableXhsSource(source.job, source.attempt, source.bundle.id)
    return revisionPreflight(artifact, review, nextXhsRevisionNumber(candidate))
  }

  /**
   * Verify structural retry eligibility without creating or running a Retry Job.
   * @param sourceJobId - Failed source Job whose structural evidence is authoritative.
   * @param sourceAttemptId - Failed source Attempt to inspect.
   * @returns the ready state and evidence-derived retry reason.
   */
  async preflightXhsRetry(sourceJobId: BusinessJobId, sourceAttemptId: BusinessAttemptId): Promise<XhsSecondPassPreflight> {
    const source = this.requireSourceAttempt(sourceJobId, sourceAttemptId)
    await this.verifyExecutionPackage(source.job.id, source.attempt.id)
    assertXhsRetrySource(source.attempt.executionPackage?.lineage)
    let retryReason: NonNullable<XhsSecondPassPreflight['retryReason']> | null = null
    let sourceDraftSha256: string | undefined
    if (source.attempt.outputBundle !== null) {
      const validationArtifact = await this.sourceValidationContent(source.job, source.attempt.id, source.attempt.outputBundle.id)
      retryReason = xhsStructuralRetryReason(validationArtifact.content)
      sourceDraftSha256 = source.attempt.outputBundle.entries[0].hash
    } else if (source.attempt.agentRuns.some(run => run.failureCode === 'EMPTY_AGENT_OUTPUT')) {
      retryReason = 'EMPTY_DRAFT'
    }
    if (retryReason === null) throw new BusinessWorkbenchError('XHS_RETRY_NOT_ALLOWED', 'business-workbench: ordinary hard-contract or quality failures require Revision')
    const retries = [...this.requireJobs().entries()].flatMap(([, job]) => job.attempts)
      .filter(attempt => attempt.executionPackage?.lineage?.kind === 'retry'
        && attempt.executionPackage.lineage.retryOfJobId === sourceJobId
        && attempt.executionPackage.lineage.retryOfAttemptId === sourceAttemptId)
    assertXhsRetryAvailable(retries.length)
    return Object.freeze({ status: 'RETRY_READY', sourceJobId, sourceAttemptId,
      ...(sourceDraftSha256 === undefined ? {} : { sourceDraftSha256 }), retryReason })
  }

  /**
   * Verify that a PASS-reviewed Candidate has only admitted deterministic failures.
   * @param jobId - Target Contract Repair Job that owns the PASS Review.
   * @param attemptId - Active target Attempt that would receive the repair package.
   * @param reviewArtifactId - PASS Review bound to the exact source Candidate.
   * @returns the ready state, matching validation evidence, and closed repair scope.
   */
  async preflightXhsContractRepair(
    jobId: BusinessJobId,
    attemptId: BusinessAttemptId,
    reviewArtifactId: BusinessArtifactId,
  ): Promise<XhsSecondPassPreflight> {
    const job = this.requireJob(jobId)
    const attempt = job.attempts.find(item => item.id === attemptId)
    if (attempt === undefined || !['pending', 'running'].includes(attempt.status)) {
      throw new BusinessWorkbenchError('XHS_CONTRACT_REPAIR_NOT_ALLOWED', 'business-workbench: Contract Repair target Attempt is not active')
    }
    const reviewArtifact = job.artifactRefs.find(item => item.artifactId === reviewArtifactId
      && item.attemptId === attemptId && item.type === 'review')
    if (reviewArtifact === undefined) {
      throw new BusinessWorkbenchError('XHS_CONTRACT_REPAIR_NOT_ALLOWED', 'business-workbench: Contract Repair Job lacks its PASS Review Artifact')
    }
    const storedReview = await this.artifactStore.read(reviewArtifact, job.batchId)
    const review = parseXhsReviewArtifactDocument(storedReview.content)
    if (review.review_result !== 'PASS') {
      throw new BusinessWorkbenchError('XHS_CONTRACT_REPAIR_NOT_ALLOWED', 'business-workbench: Contract Repair requires a PASS business Review')
    }
    const source = await this.requireSourceOutput(review.source_job_id, review.source_attempt_id)
    await this.verifyExecutionPackage(source.job.id, source.attempt.id)
    const candidate = xhsReviewCandidate(source.attempt.executionPackage?.lineage)
    if (candidate.candidateType === 'contract_repair') {
      throw new BusinessWorkbenchError('XHS_CONTRACT_REPAIR_LIMIT_REACHED', 'business-workbench: Contract Repair output cannot enter Repair 2')
    }
    assertXhsReviewSource(review, source.bundle, sha256Text(source.files['draft.md']), candidate)
    if (job.input.reference !== source.job.input.reference || job.input.sha256 !== source.job.input.sha256) {
      throw new BusinessWorkbenchError('XHS_CONTRACT_REPAIR_NOT_ALLOWED', 'business-workbench: Contract Repair Job does not preserve the source TaskCard identity')
    }
    await this.assertReviewableXhsSource(source.job, source.attempt, source.bundle.id)
    const validationContent = await this.sourceValidationContent(source.job, source.attempt.id, source.bundle.id)
    const validation = xhsHardValidationArtifactSchema.parse(JSON.parse(validationContent.content))
    if (validation.result.facts.draftSha256 !== review.source_draft_sha256) {
      throw new BusinessWorkbenchError('XHS_CONTRACT_REPAIR_NOT_ALLOWED', 'business-workbench: hard-validation evidence names another draft')
    }
    const existingRepairs = [...this.requireJobs().entries()].flatMap(([, candidateJob]) => candidateJob.attempts)
      .filter(item => item.executionPackage?.lineage?.kind === 'contract-repair'
        && item.executionPackage.lineage.sourceJobId === source.job.id
        && item.executionPackage.lineage.sourceAttemptId === source.attempt.id
        && xhsContractRepairConsumedAllowance(item))
    assertXhsContractRepairAvailable(existingRepairs.length)
    const scope = deriveXhsContractRepairScope(validation.result)
    return contractRepairPreflight(reviewArtifact, review, validationContent.artifact, scope)
  }

  /** Verify that a PASS-reviewed Candidate has only title/body range failures.
   * @param jobId - Target length-repair Job owning the PASS Review.
   * @param attemptId - Active target Attempt.
   * @param reviewArtifactId - PASS Review bound to the exact source Candidate.
   * @returns Zero-model length-repair readiness and exact evidence identities.
   */
  async preflightXhsLengthRepair(
    jobId: BusinessJobId,
    attemptId: BusinessAttemptId,
    reviewArtifactId: BusinessArtifactId,
  ): Promise<XhsSecondPassPreflight> {
    const job = this.requireJob(jobId)
    const attempt = job.attempts.find(item => item.id === attemptId)
    if (attempt === undefined || !['pending', 'running'].includes(attempt.status)) {
      throw new BusinessWorkbenchError('XHS_LENGTH_REPAIR_NOT_ALLOWED', 'business-workbench: length-repair target Attempt is not active')
    }
    const reviewArtifact = job.artifactRefs.find(item => item.artifactId === reviewArtifactId
      && item.attemptId === attemptId && item.type === 'review')
    if (reviewArtifact === undefined) {
      throw new BusinessWorkbenchError('XHS_LENGTH_REPAIR_NOT_ALLOWED', 'business-workbench: length-repair Job lacks its PASS Review Artifact')
    }
    const storedReview = await this.artifactStore.read(reviewArtifact, job.batchId)
    const review = parseXhsReviewArtifactDocument(storedReview.content)
    const ready = await this.preflightXhsLengthRepairSource(review.source_job_id, review.source_attempt_id, reviewArtifactId)
    const source = await this.requireSourceOutput(ready.sourceJobId, ready.sourceAttemptId)
    if (job.input.reference !== source.job.input.reference || job.input.sha256 !== source.job.input.sha256) {
      throw new BusinessWorkbenchError('XHS_LENGTH_REPAIR_NOT_ALLOWED', 'business-workbench: length-repair Job does not preserve the source TaskCard identity')
    }
    return ready
  }

  /** Verify length-repair eligibility without creating a Batch, Job, Attempt, or Artifact.
   * @param sourceJobId - Exact PASS-reviewed source Candidate Job.
   * @param sourceAttemptId - Exact source Attempt.
   * @param reviewArtifactId - Existing PASS Review Artifact bound to that Candidate.
   * @returns Read-only readiness and exact durable evidence identities.
   */
  async preflightXhsLengthRepairSource(
    sourceJobId: BusinessJobId,
    sourceAttemptId: BusinessAttemptId,
    reviewArtifactId: BusinessArtifactId,
  ): Promise<XhsSecondPassPreflight> {
    const locatedReview = this.locateArtifact(reviewArtifactId)
    if (locatedReview.artifact.type !== 'review') {
      throw new BusinessWorkbenchError('XHS_LENGTH_REPAIR_NOT_ALLOWED', 'business-workbench: length repair requires an existing PASS Review Artifact')
    }
    const storedReview = await this.artifactStore.read(locatedReview.artifact, locatedReview.batchId)
    const review = parseXhsReviewArtifactDocument(storedReview.content)
    if (review.source_job_id !== sourceJobId || review.source_attempt_id !== sourceAttemptId) {
      throw new BusinessWorkbenchError('XHS_LENGTH_REPAIR_NOT_ALLOWED', 'business-workbench: PASS Review names another source Candidate')
    }
    const source = await this.requireSourceOutput(sourceJobId, sourceAttemptId)
    await this.verifyExecutionPackage(source.job.id, source.attempt.id)
    const candidate = xhsReviewCandidate(source.attempt.executionPackage?.lineage)
    if (candidate.candidateType === 'length_repair') {
      throw new BusinessWorkbenchError('XHS_LENGTH_REPAIR_LIMIT_REACHED', 'business-workbench: length-repair output cannot enter Repair 2')
    }
    assertXhsReviewSource(review, source.bundle, sha256Text(source.files['draft.md']), candidate)
    await this.assertReviewableXhsSource(source.job, source.attempt, source.bundle.id)
    const validationContent = await this.sourceValidationContent(source.job, source.attempt.id, source.bundle.id)
    const validation = xhsHardValidationArtifactSchema.parse(JSON.parse(validationContent.content))
    const eligibility = assertXhsLengthRepairEligibility(review, validation.result)
    const existingRepairs = [...this.requireJobs().entries()].flatMap(([, candidateJob]) => candidateJob.attempts)
      .filter(item => item.executionPackage?.lineage?.kind === 'length-repair'
        && item.executionPackage.lineage.sourceJobId === source.job.id
        && item.executionPackage.lineage.sourceAttemptId === source.attempt.id
        && item.agentRuns.some(run => run.action === 'xhs-body-length-repair-v0' && run.sessionId !== 'not-started'))
    if (existingRepairs.length > 0) {
      throw new BusinessWorkbenchError('XHS_LENGTH_REPAIR_LIMIT_REACHED', 'business-workbench: source Candidate already consumed its one length repair')
    }
    return Object.freeze({ status: 'LENGTH_REPAIR_READY', sourceJobId: source.job.id,
      sourceAttemptId: source.attempt.id, sourceDraftSha256: review.source_draft_sha256,
      reviewArtifactId: locatedReview.artifact.artifactId, hardValidationArtifactId: validationContent.artifact.artifactId,
      failedContractItems: eligibility.failedContractItems })
  }

  /**
   * Freeze production truth, the reviewed candidate, and its Review into a revision package.
   * @param request - Active target Attempt, production identity, Review Artifact, lease, and compare-and-swap facts.
   * @returns the immutable revision execution package and source evidence.
   */
  async createXhsRevisionExecutionPackage(request: CreateXhsRevisionExecutionPackageRequest): Promise<XhsProductionExecutionPackageResult> {
    const preflight = await this.preflightXhsRevision(request.jobId, request.attemptId, request.reviewArtifactId)
    const source = await this.requireSourceOutput(preflight.sourceJobId, preflight.sourceAttemptId)
    const review = this.locateArtifact(request.reviewArtifactId)
    const reviewContent = await this.artifactStore.read(review.artifact, review.batchId)
    const parsedReview = parseXhsReviewArtifactDocument(reviewContent.content)
    const revisionNumber = preflight.revisionNumber
    if (revisionNumber === undefined) throw new Error('business-workbench: revision preflight omitted its deterministic revision number')
    const resolution = await this.requireProductionSourceResolver().resolve(request.identity, Date.now())
    this.assertSecondPassIdentity(source.attempt.executionPackage, resolution)
    const lineage: XhsExecutionLineage = Object.freeze({
      kind: 'revision', sourceJobId: source.job.id, sourceAttemptId: source.attempt.id,
      sourceOutputBundleId: source.bundle.id, sourceDraftPath: source.bundle.entries[0].path,
      sourceDraftSha256: parsedReview.source_draft_sha256, reviewArtifactId: review.artifact.artifactId,
      reviewSha256: parsedReview.review_sha256, revisionNumber,
    })
    return this.createSecondPassPackage(request, resolution, lineage, XHS_BODY_REVISION_WORKFLOW_VERSION, [
      { role: 'sourceCandidateDraft', path: `business-artifacts/${source.bundle.entries[0].path}`, required: true },
      { role: 'review', path: `business-artifacts/${review.artifact.path}`, required: true },
    ])
  }

  /**
   * Freeze production truth for one source-only structural retry package.
   * @param request - Active target Attempt, failed source identity, retry reason, lease, and compare-and-swap facts.
   * @returns the immutable retry execution package and source evidence.
   */
  async createXhsRetryExecutionPackage(request: CreateXhsRetryExecutionPackageRequest): Promise<XhsProductionExecutionPackageResult> {
    const preflight = await this.preflightXhsRetry(request.retryOfJobId, request.retryOfAttemptId)
    if (preflight.retryReason !== request.retryReason) throw new BusinessWorkbenchError('XHS_RETRY_NOT_ALLOWED', 'business-workbench: requested retry reason differs from source evidence')
    const source = this.requireSourceAttempt(request.retryOfJobId, request.retryOfAttemptId)
    const resolution = await this.requireProductionSourceResolver().resolve(request.identity, Date.now())
    this.assertSecondPassIdentity(source.attempt.executionPackage, resolution)
    const lineage: XhsExecutionLineage = Object.freeze({ kind: 'retry', retryOfJobId: source.job.id,
      retryOfAttemptId: source.attempt.id,
      ...(source.attempt.outputBundle === null ? {} : { retryOfOutputBundleId: source.attempt.outputBundle.id }),
      retryReason: request.retryReason, retryNumber: 1 })
    return this.createSecondPassPackage(request, resolution, lineage, XHS_BODY_RETRY_WORKFLOW_VERSION, [])
  }

  /**
   * Freeze only TaskCard, source Candidate, PASS Review, and hard-failure evidence for Contract Repair.
   * @param request - Active target Attempt, production identity, PASS Review, lease, and compare-and-swap facts.
   * @returns the immutable Skill-free Contract Repair package and source evidence.
   */
  async createXhsContractRepairExecutionPackage(
    request: CreateXhsContractRepairExecutionPackageRequest,
  ): Promise<XhsProductionExecutionPackageResult> {
    const preflight = await this.preflightXhsContractRepair(request.jobId, request.attemptId, request.reviewArtifactId)
    const source = await this.requireSourceOutput(preflight.sourceJobId, preflight.sourceAttemptId)
    const review = this.locateArtifact(request.reviewArtifactId)
    const reviewContent = await this.artifactStore.read(review.artifact, review.batchId)
    const parsedReview = parseXhsReviewArtifactDocument(reviewContent.content)
    const validationArtifactId = preflight.hardValidationArtifactId
    if (validationArtifactId === undefined || preflight.failedContractItems === undefined || preflight.repairedFields === undefined) {
      throw new Error('business-workbench: Contract Repair preflight omitted required evidence')
    }
    const validation = this.locateArtifact(validationArtifactId)
    const resolution = await this.requireProductionSourceResolver().resolve(request.identity, Date.now())
    this.assertSecondPassIdentity(source.attempt.executionPackage, resolution)
    const lineage: XhsExecutionLineage = Object.freeze({
      kind: 'contract-repair', sourceJobId: source.job.id, sourceAttemptId: source.attempt.id,
      sourceOutputBundleId: source.bundle.id, sourceDraftPath: source.bundle.entries[0].path,
      sourceDraftSha256: parsedReview.source_draft_sha256,
      businessReviewArtifactId: review.artifact.artifactId, businessReviewSha256: parsedReview.review_sha256,
      hardValidationArtifactId: validation.artifact.artifactId, hardValidationSha256: validation.artifact.hash,
      failedContractItems: preflight.failedContractItems, repairNumber: 1, repairedFields: preflight.repairedFields,
    })
    const current = this.requireJob(request.jobId)
    if (current.input.reference !== source.job.input.reference || current.input.sha256 !== source.job.input.sha256) {
      throw new BusinessWorkbenchError('XHS_CONTRACT_REPAIR_NOT_ALLOWED', 'business-workbench: Contract Repair Job does not preserve the source TaskCard identity')
    }
    const taskCard = resolution.inputs.find(input => input.role === 'taskCard')
    if (taskCard === undefined) throw new Error('business-workbench: production resolution omitted TaskCard')
    const extraInputs = [
      { role: 'sourceCandidateDraft', path: `business-artifacts/${source.bundle.entries[0].path}`, required: true as const },
      { role: 'businessPassReview', path: `business-artifacts/${review.artifact.path}`, required: true as const },
      { role: 'hardContractFailure', path: `business-artifacts/${validation.artifact.path}`, required: true as const },
    ]
    const inputs = [taskCard, ...extraInputs]
    const packageRequest: CreateBusinessExecutionPackageRequest = {
      jobId: request.jobId, attemptId: request.attemptId, expectedRevision: request.expectedRevision,
      idempotencyKey: request.idempotencyKey, ownerId: request.ownerId,
      workflowVersion: XHS_BODY_CONTRACT_REPAIR_WORKFLOW_VERSION,
      inputs, allowedReadRoots: [], allowedReadFiles: inputs.map(input => input.path),
      allowedCapabilities: ['restricted-agent'], allowedSkills: [],
    }
    const packageBuildStartedAt = performance.now()
    const executionPackage = await this.enqueueMutation(async () => this.createExecutionPackageNow(packageRequest, resolution, lineage))
    const sourceManifest = executionPackage.productionSource
    if (sourceManifest === undefined) throw new Error('business-workbench: Contract Repair package lost production source evidence')
    return Object.freeze({ executionPackage, sourceManifest: snapshot(sourceManifest), timing: Object.freeze({
      ...resolution.timing, executionPackageBuildMs: performance.now() - packageBuildStartedAt,
    }) })
  }

  /** Freeze only the TaskCard and exact PASS/length-failure evidence for one safe patch.
   * @param request - Active target Attempt, production identity, PASS Review, and lease facts.
   * @returns Immutable Skill-free length-repair package.
   */
  async createXhsLengthRepairExecutionPackage(
    request: CreateXhsLengthRepairExecutionPackageRequest,
  ): Promise<XhsProductionExecutionPackageResult> {
    const preflight = await this.preflightXhsLengthRepair(request.jobId, request.attemptId, request.reviewArtifactId)
    const source = await this.requireSourceOutput(preflight.sourceJobId, preflight.sourceAttemptId)
    const review = this.locateArtifact(request.reviewArtifactId)
    const reviewContent = await this.artifactStore.read(review.artifact, review.batchId)
    const parsedReview = parseXhsReviewArtifactDocument(reviewContent.content)
    const validationArtifactId = preflight.hardValidationArtifactId
    if (validationArtifactId === undefined || preflight.failedContractItems === undefined) {
      throw new Error('business-workbench: length-repair preflight omitted required evidence')
    }
    const validation = this.locateArtifact(validationArtifactId)
    const resolution = await this.requireProductionSourceResolver().resolve(request.identity, Date.now())
    this.assertSecondPassIdentity(source.attempt.executionPackage, resolution)
    const lineage: XhsExecutionLineage = Object.freeze({
      kind: 'length-repair', sourceJobId: source.job.id, sourceAttemptId: source.attempt.id,
      sourceOutputBundleId: source.bundle.id, sourceDraftPath: source.bundle.entries[0].path,
      sourceDraftSha256: parsedReview.source_draft_sha256,
      businessReviewArtifactId: review.artifact.artifactId, businessReviewSha256: parsedReview.review_sha256,
      hardValidationArtifactId: validation.artifact.artifactId, hardValidationSha256: validation.artifact.hash,
      failedContractItems: preflight.failedContractItems as readonly ('titleRange' | 'bodyRange')[], repairNumber: 1,
    })
    const taskCard = resolution.inputs.find(input => input.role === 'taskCard')
    if (taskCard === undefined) throw new Error('business-workbench: production resolution omitted TaskCard')
    const inputs = [taskCard,
      { role: 'sourceCandidateDraft', path: `business-artifacts/${source.bundle.entries[0].path}`, required: true as const },
      { role: 'businessPassReview', path: `business-artifacts/${review.artifact.path}`, required: true as const },
      { role: 'hardContractFailure', path: `business-artifacts/${validation.artifact.path}`, required: true as const }]
    const packageRequest: CreateBusinessExecutionPackageRequest = {
      jobId: request.jobId, attemptId: request.attemptId, expectedRevision: request.expectedRevision,
      idempotencyKey: request.idempotencyKey, ownerId: request.ownerId,
      workflowVersion: XHS_BODY_LENGTH_REPAIR_WORKFLOW_VERSION, inputs, allowedReadRoots: [],
      allowedReadFiles: inputs.map(input => input.path), allowedCapabilities: ['restricted-agent'], allowedSkills: [],
    }
    const packageBuildStartedAt = performance.now()
    const executionPackage = await this.enqueueMutation(async () => this.createExecutionPackageNow(packageRequest, resolution, lineage))
    const sourceManifest = executionPackage.productionSource
    if (sourceManifest === undefined) throw new Error('business-workbench: length-repair package lost production source evidence')
    return Object.freeze({ executionPackage, sourceManifest: snapshot(sourceManifest), timing: Object.freeze({
      ...resolution.timing, executionPackageBuildMs: performance.now() - packageBuildStartedAt,
    }) })
  }

  private async createSecondPassPackage(
    request: CreateXhsProductionExecutionPackageRequest,
    resolution: XhsProductionResolution,
    lineage: XhsExecutionLineage,
    workflowVersion: string,
    extraInputs: readonly { readonly role: string; readonly path: string; readonly required: true }[],
  ): Promise<XhsProductionExecutionPackageResult> {
    const current = this.requireJob(request.jobId)
    const sourceJobId = lineage.kind === 'retry' ? lineage.retryOfJobId : lineage.sourceJobId
    const source = this.requireJob(sourceJobId)
    if (current.input.reference !== source.input.reference || current.input.sha256 !== source.input.sha256) {
      throw new BusinessWorkbenchError('XHS_BODY_INPUT_INVALID', 'business-workbench: second-pass Job does not preserve the source TaskCard identity')
    }
    const packageBuildStartedAt = performance.now()
    const inputs = [...resolution.inputs, ...extraInputs]
    const allowedReadFiles = [...resolution.allowedReadFiles, ...extraInputs.map(input => input.path)]
    const packageRequest: CreateBusinessExecutionPackageRequest = {
      jobId: request.jobId, attemptId: request.attemptId, expectedRevision: request.expectedRevision,
      idempotencyKey: request.idempotencyKey, ownerId: request.ownerId, workflowVersion,
      inputs, allowedReadRoots: [], allowedReadFiles,
      allowedCapabilities: ['restricted-agent'], allowedSkills: [resolution.skillSnapshot.skillId],
    }
    const executionPackage = await this.enqueueMutation(async () => this.createExecutionPackageNow(packageRequest, resolution, lineage))
    const sourceManifest = executionPackage.productionSource
    if (sourceManifest === undefined) throw new Error('business-workbench: second-pass package lost its production source manifest')
    return Object.freeze({ executionPackage, sourceManifest: snapshot(sourceManifest), timing: Object.freeze({
      ...resolution.timing, executionPackageBuildMs: performance.now() - packageBuildStartedAt,
    }) })
  }

  private assertSecondPassIdentity(sourcePackage: BusinessExecutionPackage | null, resolution: XhsProductionResolution): void {
    const sourceManifest = sourcePackage?.productionSource
    if (sourceManifest === undefined
      || JSON.stringify(sourceManifest.identity) !== JSON.stringify(resolution.sourceManifest.identity)
      || JSON.stringify(sourceManifest.inputs) !== JSON.stringify(resolution.sourceManifest.inputs)
      || sourceManifest.skillSource.snapshotHash !== resolution.sourceManifest.skillSource.snapshotHash) {
      throw new BusinessWorkbenchError('XHS_BODY_INPUT_INVALID', 'business-workbench: second-pass frozen truth or Skill differs from the First Pass')
    }
  }

  private async createExecutionPackageNow(
    request: CreateBusinessExecutionPackageRequest,
    productionResolution?: XhsProductionResolution,
    lineage?: XhsExecutionLineage,
  ): Promise<BusinessExecutionPackage> {
    assertOperationKey(request.idempotencyKey)
    const ownerId = nonblank(request.ownerId, 'ownerId')
    const workflowVersion = nonblank(request.workflowVersion, 'workflowVersion')
    const allowedReadRoots = normalizeBusinessReadPaths(request.allowedReadRoots)
    const allowedReadFiles = normalizeBusinessReadPaths(request.allowedReadFiles)
    const allowedCapabilities = normalizeBusinessNames(request.allowedCapabilities, 'allowedCapabilities')
    const allowedSkills = normalizeBusinessNames(request.allowedSkills, 'allowedSkills')
    const normalizedInputs = request.inputs.map(input => ({
      ...input,
      role: input.role.trim(),
      path: normalizeBusinessReadPath(input.path),
    }))
    const productionIdentity = productionResolution === undefined
      ? undefined
      : productionResolutionFingerprint(productionResolution)
    const operationFingerprint = fingerprint([
      request.attemptId, ownerId, workflowVersion, normalizedInputs,
      allowedReadRoots, allowedReadFiles, allowedCapabilities, allowedSkills, productionIdentity, lineage ?? null,
    ])
    const current = this.requireJob(request.jobId)
    const repeated = repeatedOperation(current, request.idempotencyKey, 'create-package', operationFingerprint)
    if (repeated !== undefined) {
      const attempt = current.attempts.find(item => item.id === request.attemptId)
      if (attempt?.executionPackage === null || attempt?.executionPackage === undefined) throw new BusinessWorkbenchError('EXECUTION_PACKAGE_MISSING', 'business-workbench: package receipt has no package', { subjectId: request.attemptId })
      return snapshot(attempt.executionPackage)
    }
    if (lineage?.kind === 'retry') {
      const existingRetries = [...this.requireJobs().entries()].flatMap(([, job]) => job.attempts)
        .filter(item => item.executionPackage?.lineage?.kind === 'retry'
          && item.executionPackage.lineage.retryOfJobId === lineage.retryOfJobId
          && item.executionPackage.lineage.retryOfAttemptId === lineage.retryOfAttemptId)
      assertXhsRetryAvailable(existingRetries.length)
    }
    assertExpectedRevision(current, request.expectedRevision)
    const attempt = this.requireCurrentAttempt(current, request.attemptId, 'running')
    this.assertLiveLease(attempt, ownerId)
    if (attempt.outputBundle !== null) throw new BusinessWorkbenchError('OUTPUT_BUNDLE_CONFLICT', `business-workbench: Attempt '${attempt.id}' already has an authoritative output bundle`, { subjectId: attempt.outputBundle.id })
    if (attempt.executionPackage !== null) throw new BusinessWorkbenchError('EXECUTION_PACKAGE_CONFLICT', `business-workbench: Attempt '${attempt.id}' already has an execution package`, { subjectId: attempt.id })
    const boundary = this.requireReadBoundary()
    const inputs = await boundary.freezeInputs(normalizedInputs, allowedReadRoots, allowedReadFiles)
    const resolvedAt = Date.now()
    const productionSkillRequirement = productionResolution === undefined
      ? undefined
      : resolveXhsExecutionSkillRequirement(workflowVersion)
    const skillSnapshots = productionResolution === undefined
      ? (allowedSkills.length === 0
        ? Object.freeze([])
        : await resolveSkillSnapshots(this.requireSkillRegistry(), allowedSkills, boundary.projectRoot(), resolvedAt))
      : productionSkillRequirement === 'none'
        ? Object.freeze([])
        : Object.freeze([productionResolution.skillSnapshot])
    if (productionResolution !== undefined) this.assertProductionResolution(productionResolution, inputs, workflowVersion, allowedSkills)
    const resolvedSkillManifestHash = skillManifestHash(skillSnapshots)
    this.assertLiveLease(attempt, ownerId)
    const createdAt = Date.now()
    const base: Omit<BusinessExecutionPackage, 'manifestHash'> = Object.freeze({
      id: deriveBusinessExecutionPackageId(current.id, attempt.id, request.idempotencyKey),
      project: current.project,
      jobId: current.id,
      attemptId: attempt.id,
      workflowVersion,
      inputs,
      allowedReadRoots,
      allowedReadFiles,
      allowedCapabilities,
      allowedSkills,
      skillSnapshots,
      skillManifestHash: resolvedSkillManifestHash,
      ...(productionResolution === undefined ? {} : { productionSource: productionResolution.sourceManifest }),
      ...(lineage === undefined ? {} : { lineage }),
      createdAt,
    })
    const executionPackage: BusinessExecutionPackage = Object.freeze({ ...base, manifestHash: executionPackageHash(base) })
    const revision = current.revision + 1
    await this.requireJobs().update(request.jobId, (latest) => {
      assertExpectedRevision(latest, request.expectedRevision)
      return Object.freeze({ ...latest, revision,
        attempts: Object.freeze(latest.attempts.map(item => item.id === attempt.id
          ? Object.freeze({ ...item, executionPackage })
          : item)),
        operations: Object.freeze([...latest.operations, receipt(request.idempotencyKey, 'create-package', operationFingerprint, revision, createdAt, executionPackage.id)]), updatedAt: createdAt })
    })
    return snapshot(executionPackage)
  }

  private assertProductionResolution(
    resolution: XhsProductionResolution,
    inputs: BusinessExecutionPackage['inputs'],
    workflowVersion: string,
    allowedSkills: readonly string[],
  ): void {
    const { manifestHash, ...sourceBase } = resolution.sourceManifest
    if (manifestHash !== xhsProductionSourceManifestHash(sourceBase)) {
      throw new BusinessWorkbenchError('EXECUTION_PACKAGE_CONFLICT', 'business-workbench: production source manifest changed before package creation')
    }
    const skillRequirement = resolveXhsExecutionSkillRequirement(workflowVersion)
    if (skillRequirement === 'none' ? allowedSkills.length !== 0 : (allowedSkills.length !== 1 || allowedSkills[0] !== resolution.skillSnapshot.skillId
      || resolution.sourceManifest.skillSource.snapshotHash !== resolution.skillSnapshot.snapshotHash)) {
      throw new BusinessWorkbenchError('EXECUTION_PACKAGE_CONFLICT', 'business-workbench: production Skill resolution does not match the package')
    }
    for (const route of resolution.sourceManifest.inputs.filter(route => skillRequirement === 'required' || route.role === 'taskCard')) {
      const expectedPath = `xhs/${route.path.slice(`${XHS_PROJECT_RELATIVE_PATH}/`.length)}`
      const input = inputs.find(candidate => candidate.role === route.role)
      if (input?.path !== expectedPath || input.sha256 !== route.sha256 || input.bytes !== route.bytes) {
        throw new BusinessWorkbenchError('INPUT_DRIFT', `business-workbench: production input '${route.role}' changed during package creation`, {
          path: expectedPath,
          expectedHash: route.sha256,
          ...(input?.sha256 === undefined ? {} : { actualHash: input.sha256 }),
        })
      }
    }
  }

  /**
   * Read one exact frozen input after lease, policy, and drift verification.
   * @param request - Current owner and exact package input path.
   * @returns verified input metadata and UTF-8 content.
   */
  async readExecutionInput(request: ReadBusinessExecutionInputRequest): Promise<BusinessExecutionInputContent> {
    const ownerId = nonblank(request.ownerId, 'ownerId')
    const path = normalizeBusinessReadPath(request.path)
    const current = this.requireJob(request.jobId)
    const attempt = this.requireCurrentAttempt(current, request.attemptId, 'running')
    this.assertLiveLease(attempt, ownerId)
    const executionPackage = attempt.executionPackage
    if (executionPackage === null) throw new BusinessWorkbenchError('EXECUTION_PACKAGE_MISSING', `business-workbench: Attempt '${attempt.id}' has no execution package`, { subjectId: attempt.id })
    const input = executionPackage.inputs.find(item => item.path === path)
    if (input === undefined) throw new BusinessWorkbenchError('READ_DENIED', `business-workbench: '${path}' is not a frozen package input`, { path })
    const content = await this.requireReadBoundary().readFrozenInput(input)
    const latest = this.requireJob(request.jobId)
    this.assertLiveLease(this.requireCurrentAttempt(latest, request.attemptId, 'running'), ownerId)
    return Object.freeze({ input: snapshot(input), content })
  }

  /**
   * Recompute all source hashes in one frozen execution package.
   * @param jobId - Owning Job.
   * @param attemptId - Attempt containing the package.
   * @returns package identity and verification counts.
   */
  async verifyExecutionPackage(jobId: BusinessJobId, attemptId: BusinessAttemptId): Promise<BusinessExecutionPackageVerification> {
    const job = this.requireJob(jobId)
    const attempt = job.attempts.find(item => item.id === attemptId)
    if (attempt === undefined) throw new BusinessWorkbenchError('NOT_FOUND', `business-workbench: Attempt '${attemptId}' was not found`, { subjectId: attemptId })
    const executionPackage = attempt.executionPackage
    if (executionPackage === null) throw new BusinessWorkbenchError('EXECUTION_PACKAGE_MISSING', `business-workbench: Attempt '${attemptId}' has no execution package`, { subjectId: attemptId })
    this.assertPackageHash(executionPackage)
    for (const input of executionPackage.inputs) await this.requireReadBoundary().readFrozenInput(input)
    if (executionPackage.productionSource !== undefined) {
      const skillRequirement = assertXhsExecutionSkillRequirement(executionPackage)
      if (skillRequirement === 'none') await this.requireProductionSourceResolver().verifyInputs(executionPackage.productionSource)
      else {
        const skillSnapshot = executionPackage.skillSnapshots[0]
        if (skillSnapshot === undefined) throw new Error('business-workbench: verified Skill-required package lost its snapshot')
        await this.requireProductionSourceResolver().verify(executionPackage.productionSource, skillSnapshot)
      }
    }
    return Object.freeze({
      packageId: executionPackage.id,
      manifestHash: executionPackage.manifestHash,
      inputCount: executionPackage.inputs.length,
    })
  }

  /**
   * Execute one frozen package through a fresh tool-free Agent and commit its output.
   * @param request - exact Job, Attempt, package, owner, action, and retry identity.
   * @returns the durable Agent Run and its authoritative Artifact or output bundle.
   */
  async runRestrictedAgent(request: RunRestrictedBusinessAgentRequest): Promise<RestrictedBusinessAgentResult> {
    let prepared: RestrictedAgentPreparation
    try {
      prepared = await this.prepareRestrictedAgentRun(request)
    } catch (error) {
      await this.recordRejectedAgentRun(request, error)
      throw error
    }
    if (prepared.kind === 'replay') return prepared.result
    const hardContract = prepared.hardContract
    if (prepared.policy.output !== 'artifact' && hardContract === undefined) {
      const error = new BusinessWorkbenchError(
        'XHS_BODY_INPUT_INVALID',
        'business-workbench: XHS output policy requires a projected hard contract',
      )
      await this.recordAgentRunFailure(prepared.run, request.ownerId, error)
      throw error
    }
    const systemPrompt = this.renderRestrictedSystemPrompt(prepared.executionPackage, prepared.run.action)
    const userPrompt = this.renderRestrictedUserPrompt(prepared.run, prepared.inputContents, hardContract)
    try {
      const result = await prepared.runtime.run({
        agentRunId: prepared.run.id,
        sessionId: prepared.run.sessionId,
        systemPrompt,
        userPrompt,
        model: { ...prepared.run.model, timeoutMs: prepared.timeoutMs },
      })
      const settledOutput = prepared.policy.output === 'xhs-output-bundle'
        ? wrapXhsAgentText(result.output, result.metrics.finishReason) : result.output
      if (prepared.policy.output === 'xhs-output-bundle') {
        await this.executionTelemetry.ensure(prepared.run, parseXhsAgentDraft(settledOutput), result.metrics)
      }
      let committed: RestrictedBusinessAgentResult
      if (prepared.policy.output === 'xhs-output-bundle') {
        if (hardContract === undefined) throw new Error('XHS hard-contract preflight invariant failed')
        committed = await this.commitXhsOutputBundle(
          prepared.run,
          prepared.executionPackage,
          prepared.policy,
          request.ownerId,
          settledOutput,
          validateXhsDraft(parseXhsAgentDraft(settledOutput), hardContract),
        )
      } else if (prepared.policy.output === 'xhs-length-repair-proposal') {
        if (hardContract === undefined) throw new Error('XHS length-repair hard-contract preflight invariant failed')
        const sourceDraft = prepared.inputContents.find(input => input.role === 'sourceCandidateDraft')?.content
        const reviewContent = prepared.inputContents.find(input => input.role === 'businessPassReview')?.content
        const validationContent = prepared.inputContents.find(input => input.role === 'hardContractFailure')?.content
        if (sourceDraft === undefined || reviewContent === undefined || validationContent === undefined) {
          throw new BusinessWorkbenchError('XHS_LENGTH_REPAIR_NOT_ALLOWED', 'business-workbench: length-repair package lacks source evidence')
        }
        const review = parseXhsReviewArtifactDocument(reviewContent)
        const validation = xhsHardValidationArtifactSchema.parse(JSON.parse(validationContent))
        const settlement = settleXhsLengthRepairProposal(result.output, sourceDraft, review, validation.result, hardContract)
        if (settlement.status !== 'CANDIDATE_READY') {
          committed = await this.commitRestrictedAgentOutput(
            prepared.run, prepared.executionPackage, request.ownerId,
            `${JSON.stringify({ evidenceVersion: 1, ...settlement }, null, 2)}\n`,
          )
        } else {
          const { draft, ...evidence } = settlement
          const job = this.requireJob(prepared.run.jobId)
          await this.commitArtifact({
            jobId: prepared.run.jobId, attemptId: prepared.run.attemptId, expectedRevision: job.revision,
            idempotencyKey: `xhs-length-repair-evidence:${prepared.run.id}`,
            ownerId: request.ownerId, type: 'validation',
            content: `${JSON.stringify({ evidenceVersion: 1, ...evidence }, null, 2)}\n`,
          })
          const encodedDraft = JSON.stringify({ draft })
          await this.executionTelemetry.ensure(prepared.run, draft, result.metrics)
          committed = await this.commitXhsOutputBundle(
            prepared.run, prepared.executionPackage, prepared.policy, request.ownerId,
            encodedDraft, validateXhsDraft(draft, hardContract),
          )
        }
      } else {
        committed = await this.commitRestrictedAgentOutput(prepared.run, prepared.executionPackage, request.ownerId, result.output)
      }
      return Object.freeze({ ...committed, executionMetrics: result.metrics })
    } catch (error) {
      const failure = this.normalizeAgentFailure(error)
      await this.recordAgentRunFailure(prepared.run, request.ownerId, failure)
      throw failure
    }
  }

  /**
   * Return derived ownership without treating expired or foreign leases as live.
   * @param jobId - Job whose execution should be inspected.
   * @returns current derived execution status.
   */
  getExecutionStatus(jobId: BusinessJobId): BusinessExecutionStatus {
    const job = this.requireJob(jobId)
    if (job.status === 'interrupted') return Object.freeze({ jobId, attemptId: null, state: 'interrupted' })
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') return Object.freeze({ jobId, attemptId: null, state: 'terminal' })
    if (job.currentAttempt === null) return Object.freeze({ jobId, attemptId: null, state: 'idle' })
    const attempt = job.attempts.find(item => item.id === job.currentAttempt)
    if (attempt?.status === 'pending') return Object.freeze({ jobId, attemptId: attempt.id, state: 'pending' })
    if (attempt === undefined) return Object.freeze({ jobId, attemptId: null, state: 'interrupted' })
    const lease = attempt.lease
    if (lease === null || lease.status !== 'active') {
      return Object.freeze({ jobId, attemptId: attempt.id, state: 'interrupted' })
    }
    const owned = { jobId, attemptId: attempt.id, ownerId: lease.ownerId, leaseExpiresAt: lease.leaseExpiresAt }
    if (lease.runtimeInstanceId !== this.runtimeInstanceId) return Object.freeze({ ...owned, state: 'owner-lost' })
    if (lease.leaseExpiresAt <= Date.now()) return Object.freeze({ ...owned, state: 'expired' })
    return Object.freeze({ ...owned, state: 'owned' })
  }

  /**
   * Complete verified authoritative XHS outputs without model I/O; interrupt other abandoned executions.
   * @returns the number of recovered Jobs.
   */
  recoverInterruptedExecutions(): Promise<number> {
    return this.enqueueMutation(async () => {
      let recovered = 0
      for (const [jobId, job] of this.requireJobs().entries()) {
        const latestAttempt = job.attempts.at(-1)
        if (job.status === 'interrupted' && latestAttempt !== undefined && latestAttempt.outputBundle !== null) {
          await this.finalizeXhsOutputBundleNow(jobId, latestAttempt.id)
          recovered += 1
          continue
        }
        if (job.status !== 'running' || job.currentAttempt === null) continue
        const attempt = job.attempts.find(item => item.id === job.currentAttempt)
        if (attempt?.status !== 'running' || attempt.lease === null) throw new BusinessWorkbenchError('BATCH_CORRUPT', `business-workbench: running Job '${job.id}' has no leased Attempt`, { subjectId: job.id })
        const reason = attempt.lease.runtimeInstanceId !== this.runtimeInstanceId ? 'runtime-owner-lost'
          : attempt.lease.leaseExpiresAt <= Date.now() ? 'lease-expired' : undefined
        if (reason === undefined) continue
        if (attempt.outputBundle !== null) {
          await this.finalizeXhsOutputBundleNow(jobId, attempt.id)
          recovered += 1
          continue
        }
        await this.persistInterrupted(jobId, job, attempt, reason, reason === 'lease-expired' ? 'expired' : 'released')
        recovered += 1
      }
      return recovered
    })
  }

  /** Complete only execution of the latest verified XHS intermediate bundle, never content approval or promotion.
   * Missing telemetry is durably marked incomplete. Repeated calls preserve the same receipt and Job revision.
   * @param jobId - Owning Job; failed, cancelled, superseded, or output-less Attempts are rejected.
   * @param attemptId - Latest Attempt with an authoritative bundle and its completed Agent Run.
   * @returns completed Job without model calls, source reads, or changes to output bytes.
   */
  finalizeXhsOutputBundle(jobId: BusinessJobId, attemptId: BusinessAttemptId): Promise<BusinessJob> {
    return this.enqueueMutation(() => this.finalizeXhsOutputBundleNow(jobId, attemptId))
  }

  private async finalizeXhsOutputBundleNow(jobId: BusinessJobId, attemptId: BusinessAttemptId): Promise<BusinessJob> {
    const current = this.requireJob(jobId)
    const attempt = current.attempts.at(-1)
    const bundle = attempt?.outputBundle
    if (attempt?.id !== attemptId || bundle === null || bundle === undefined
      || !['running', 'interrupted', 'completed', 'failed'].includes(current.status) || current.status !== attempt.status
      || (current.status === 'running' ? current.currentAttempt !== attemptId : current.currentAttempt !== null)
      || attempt.lease === null || attempt.agentRuns.some(run => run.status === 'running')) {
      throw new BusinessWorkbenchError('OUTPUT_BUNDLE_CONFLICT', 'business-workbench: only the latest settled XHS output can complete execution')
    }
    const executionPackage = attempt.executionPackage
    const lease = attempt.lease
    const run = attempt.agentRuns.find(item => item.id === bundle.agentRunId)
    if (executionPackage === null || run?.status !== 'completed' || run.action === 'fixture-agent-run' || run.outputBundleId !== bundle.id
      || bundle.jobId !== jobId || bundle.attemptId !== attemptId || run.jobId !== jobId || run.attemptId !== attemptId
      || bundle.executionPackageId !== executionPackage.id || run.executionPackageId !== bundle.executionPackageId) {
      throw new BusinessWorkbenchError('OUTPUT_BUNDLE_CONFLICT', 'business-workbench: output lacks a matching completed XHS Agent Run')
    }
    const content = await this.outputBundleStore.read(bundle)
    const provenance = xhsProvenanceSchema.parse(JSON.parse(content.files['provenance.json']))
    if (provenance.executionPackage.manifestHash !== executionPackage.manifestHash
      || provenance.provider !== run.model.provider || provenance.model !== run.model.model
      || provenance.agentRun.sessionId !== run.sessionId
      || JSON.stringify(provenance.lineage ?? null) !== JSON.stringify(executionPackage.lineage ?? null)
      || provenance.skills.some(skill => !executionPackage.skillSnapshots.some(snapshot => snapshot.snapshotHash === skill.snapshotHash))
      || provenance.inputs.some(input => !executionPackage.inputs.some(source =>
        source.path === input.path && source.sha256 === input.hash))) {
      throw new BusinessWorkbenchError('OUTPUT_BUNDLE_CONFLICT', 'business-workbench: provenance differs from the completed Run or its frozen package')
    }
    const telemetry = await this.executionTelemetry.ensure(run, content.files['draft.md'])
    if (current.status === 'completed' || current.status === 'failed') return snapshot(current)
    const validation = await this.sourceValidation(current, attempt.id, bundle.id)
    const structurallyInvalid = validation.result.failureClass === 'FORMAT_CONTRACT_FAIL'
    const now = Date.now()
    const revision = current.revision + 1
    const reason = structurallyInvalid
      ? `retryable-structural-output;telemetry-${telemetry.telemetryStatus};not-content-approved`
      : `intermediate-execution-completed;review-ready;telemetry-${telemetry.telemetryStatus};not-content-approved`
    const terminalStatus = structurallyInvalid ? 'failed' as const : 'completed' as const
    const next = await this.requireJobs().update(jobId, (latest) => {
      assertExpectedRevision(latest, current.revision)
      return Object.freeze({ ...latest, status: terminalStatus, revision, currentAttempt: null, statusReason: reason, updatedAt: now,
        attempts: Object.freeze(latest.attempts.map(item => item.id === attemptId ? Object.freeze({ ...item,
          status: terminalStatus, completedAt: now, statusReason: reason,
          lease: Object.freeze({ ...lease, status: 'released' as const }),
        }) : item)),
        operations: Object.freeze([...latest.operations, receipt(`finalize-xhs:${bundle.id}`, 'complete-attempt',
          fingerprint([attemptId, bundle.id, bundle.manifestHash]), revision, now, attemptId)]),
      })
    })
    return snapshot(next)
  }

  /**
   * Finish the active owned Attempt and release its lease.
   * @param request - Current owner, terminal outcome, and observed revision.
   * @returns the terminal Job snapshot.
   */
  completeAttempt(request: CompleteBusinessAttemptRequest): Promise<BusinessJob> {
    return this.enqueueMutation(async () => {
      assertOperationKey(request.idempotencyKey)
      const ownerId = nonblank(request.ownerId, 'ownerId')
      const reason = resolveReason(request.reason)
      const operationFingerprint = fingerprint([request.attemptId, ownerId, request.outcome, reason ?? null])
      const current = this.requireJob(request.jobId)
      if (repeatedOperation(current, request.idempotencyKey, 'complete-attempt', operationFingerprint) !== undefined) return snapshot(current)
      const addressed = current.attempts.find(attempt => attempt.id === request.attemptId)
      if (addressed?.status === request.outcome
        && addressed.statusReason === reason
        && addressed.lease?.ownerId === ownerId) return snapshot(current)
      assertExpectedRevision(current, request.expectedRevision)
      const attempt = this.requireCurrentAttempt(current, request.attemptId, 'running')
      const activeLease = this.assertLiveLease(attempt, ownerId)
      const completedAt = Date.now()
      const revision = current.revision + 1
      const next = await this.requireJobs().update(request.jobId, (latest) => {
        assertExpectedRevision(latest, request.expectedRevision)
        return Object.freeze({ ...withoutStatusReason(latest), status: request.outcome, revision, currentAttempt: null,
          attempts: Object.freeze(latest.attempts.map(item => item.id === attempt.id
            ? Object.freeze({
              ...item,
              status: request.outcome,
              lease: Object.freeze({ ...activeLease, status: 'released' as const }),
              agentRuns: Object.freeze(item.agentRuns.map(run => run.status === 'running'
                ? Object.freeze({ ...run, status: 'interrupted' as const, endedAt: completedAt, failureCode: 'ATTEMPT_ENDED', failureReason: 'Attempt ended before Agent Run settlement' })
                : run)),
              completedAt,
              ...(reason === undefined ? {} : { statusReason: reason }),
            })
            : item)),
          operations: Object.freeze([...latest.operations, receipt(request.idempotencyKey, 'complete-attempt', operationFingerprint, revision, completedAt, attempt.id)]),
          ...(reason === undefined ? {} : { statusReason: reason }), updatedAt: completedAt })
      })
      return snapshot(next)
    })
  }

  /**
   * Atomically publish a text Artifact for the active execution owner.
   * @param request - Current owner, Artifact metadata, bytes, and observed revision.
   * @returns the committed immutable Artifact reference.
   */
  commitArtifact(request: CommitBusinessArtifactRequest): Promise<BusinessArtifact> {
    return this.enqueueMutation(async () => {
      assertOperationKey(request.idempotencyKey)
      const ownerId = nonblank(request.ownerId, 'ownerId')
      const contentHash = sha256Text(request.content)
      const contentBytes = Buffer.byteLength(request.content, 'utf8')
      const operationFingerprint = fingerprint([
        request.attemptId, ownerId, request.type, contentHash, contentBytes, request.provenance ?? null,
      ])
      const current = this.requireJob(request.jobId)
      const repeated = repeatedOperation(current, request.idempotencyKey, 'commit-artifact', operationFingerprint)
      if (repeated !== undefined) {
        const artifact = current.artifactRefs.find(item => item.artifactId === repeated.resultId)
        if (artifact === undefined) throw new BusinessWorkbenchError('ARTIFACT_CORRUPT', `business-workbench: Artifact receipt '${request.idempotencyKey}' has no reference`, { subjectId: current.id })
        await this.artifactStore.verify(artifact, current.batchId)
        return snapshot(artifact)
      }
      const attempt = this.requireCurrentAttempt(current, request.attemptId, 'running')
      this.assertLiveLease(attempt, ownerId)
      const sameContent = current.artifactRefs.find(artifact => artifact.attemptId === request.attemptId
        && artifact.type === request.type
        && artifact.hash === contentHash
        && artifact.bytes === contentBytes)
      if (sameContent !== undefined) { await this.artifactStore.verify(sameContent, current.batchId); return snapshot(sameContent) }
      assertExpectedRevision(current, request.expectedRevision)
      const artifactId = deriveBusinessArtifactId(current.id, request.attemptId, request.type, request.idempotencyKey)
      if (current.artifactRefs.some(artifact => artifact.artifactId === artifactId)) throw new BusinessWorkbenchError('ARTIFACT_CONFLICT', `business-workbench: Artifact id '${artifactId}' is already committed with other content`, { subjectId: artifactId })
      const createdAt = Date.now()
      const revision = current.revision + 1
      const artifact: BusinessArtifact = Object.freeze({
        artifactId,
        jobId: current.id,
        attemptId: request.attemptId,
        type: request.type,
        revision,
        path: artifactRelativePath({
          artifactId,
          jobId: current.id,
          attemptId: request.attemptId,
          type: request.type,
          batchId: current.batchId,
        }),
        hash: contentHash,
        bytes: contentBytes,
        createdAt,
        ...(request.provenance === undefined ? {} : { provenance: snapshot(request.provenance) }),
      })
      await this.artifactStore.commit(artifact, current.batchId, request.content)
      this.assertLiveLease(attempt, ownerId)
      const next = await this.requireJobs().update(request.jobId, (latest) => {
        assertExpectedRevision(latest, request.expectedRevision)
        return Object.freeze({ ...latest, revision, artifactRefs: Object.freeze([...latest.artifactRefs, artifact]),
          operations: Object.freeze([...latest.operations, receipt(request.idempotencyKey, 'commit-artifact', operationFingerprint, revision, createdAt, artifact.artifactId)]), updatedAt: createdAt })
      })
      const committed = next.artifactRefs.find(item => item.artifactId === artifact.artifactId)
      if (committed === undefined) throw new Error('business-workbench: committed Artifact reference disappeared')
      return snapshot(committed)
    })
  }

  /**
   * Read and verify one Artifact by opaque id.
   * @param artifactId - Artifact to locate and verify.
   * @returns verified reference and UTF-8 body.
   */
  async getArtifact(artifactId: BusinessArtifactId): Promise<BusinessArtifactContent> {
    const located = this.locateArtifact(artifactId)
    const content = await this.artifactStore.read(located.artifact, located.batchId)
    return Object.freeze({ artifact: snapshot(content.artifact), content: content.content })
  }

  /**
   * Verify every Artifact referenced by one Job.
   * @param jobId - Job whose references should be verified.
   * @returns verification facts in reference order.
   */
  async verifyArtifacts(jobId: BusinessJobId): Promise<readonly BusinessArtifactVerification[]> {
    const job = this.requireJob(jobId)
    return Object.freeze(await Promise.all(job.artifactRefs.map(artifact => this.artifactStore.verify(artifact, job.batchId))))
  }

  /**
   * Discover verified orphan Artifact files without changing them.
   * @returns referenced count and orphan summaries.
   */
  reconcileArtifacts(): Promise<BusinessArtifactReconciliation> {
    const referenced = new Set<string>()
    for (const [, job] of this.requireJobs().entries()) for (const artifact of job.artifactRefs) referenced.add(artifact.path)
    return this.artifactStore.reconcile(referenced)
  }

  /**
   * Read and structurally verify one authoritative XHS output bundle.
   * @param bundleId - opaque bundle identity.
   * @returns immutable manifest and its three verified files.
   */
  getOutputBundle(bundleId: BusinessOutputBundleId): Promise<BusinessOutputBundleContent> {
    return this.outputBundleStore.read(this.locateOutputBundle(bundleId))
  }

  /**
   * Discover output-bundle staging or publication orphans without changing them.
   * @returns referenced count and orphan summaries.
   */
  reconcileOutputBundles(): Promise<BusinessOutputBundleReconciliation> {
    const referenced = new Set<string>()
    for (const [, job] of this.requireJobs().entries()) {
      for (const attempt of job.attempts) if (attempt.outputBundle !== null) referenced.add(attempt.outputBundle.path)
    }
    return this.outputBundleStore.reconcile(referenced)
  }

  private prepareRestrictedAgentRun(request: RunRestrictedBusinessAgentRequest): Promise<RestrictedAgentPreparation> {
    return this.enqueueMutation(async () => {
      assertOperationKey(request.idempotencyKey)
      const ownerId = nonblank(request.ownerId, 'ownerId')
      const current = this.requireJob(request.jobId)
      const addressedAttempt = current.attempts.find(item => item.id === request.attemptId)
      if (addressedAttempt === undefined) throw new BusinessWorkbenchError('NOT_FOUND', `business-workbench: Attempt '${request.attemptId}' was not found`, { subjectId: request.attemptId })
      const repeated = addressedAttempt.agentRuns.find(run => run.idempotencyKey === request.idempotencyKey)
      if (repeated !== undefined) {
        if (repeated.executionPackageId !== request.executionPackageId || repeated.action !== request.action
          || JSON.stringify(repeated.xhs ?? null) !== JSON.stringify(request.xhs ?? null)) {
          throw new BusinessWorkbenchError('IDEMPOTENCY_CONFLICT', `business-workbench: Agent Run idempotency key '${request.idempotencyKey}' was already used`, { subjectId: repeated.id })
        }
        if (repeated.status === 'running') throw new BusinessWorkbenchError('AGENT_RUN_IN_PROGRESS', `business-workbench: Agent Run '${repeated.id}' is still running`, { subjectId: repeated.id })
        if (repeated.status !== 'completed') {
          throw new BusinessWorkbenchError('AGENT_RUN_FAILED', repeated.failureReason ?? `business-workbench: Agent Run '${repeated.id}' did not complete`, { subjectId: repeated.id })
        }
        if (repeated.outputBundleId !== undefined) {
          const bundle = this.locateOutputBundle(repeated.outputBundleId)
          await this.outputBundleStore.read(bundle)
          return { kind: 'replay', result: Object.freeze({ kind: 'output-bundle', run: snapshot(repeated), outputBundle: snapshot(bundle) }) }
        }
        if (repeated.artifactId === undefined) throw new BusinessWorkbenchError('AGENT_RUN_FAILED', `business-workbench: Agent Run '${repeated.id}' has no output`, { subjectId: repeated.id })
        const artifact = this.locateArtifact(repeated.artifactId).artifact
        await this.artifactStore.verify(artifact, current.batchId)
        return { kind: 'replay', result: Object.freeze({ kind: 'artifact', run: snapshot(repeated), artifact: snapshot(artifact) }) }
      }
      const attempt = this.requireCurrentAttempt(current, request.attemptId, 'running')
      this.assertLiveLease(attempt, ownerId)
      if (attempt.outputBundle !== null) throw new BusinessWorkbenchError('OUTPUT_BUNDLE_CONFLICT', `business-workbench: Attempt '${attempt.id}' already has an authoritative output bundle`, { subjectId: attempt.outputBundle.id })
      const executionPackage = attempt.executionPackage
      if (executionPackage === null) throw new BusinessWorkbenchError('EXECUTION_PACKAGE_MISSING', `business-workbench: Attempt '${attempt.id}' has no execution package`, { subjectId: attempt.id })
      if (executionPackage.id !== request.executionPackageId) {
        throw new BusinessWorkbenchError('EXECUTION_PACKAGE_CONFLICT', `business-workbench: package '${request.executionPackageId}' does not belong to Attempt '${attempt.id}'`, { subjectId: request.executionPackageId })
      }
      this.assertPackageHash(executionPackage)
      const policy = resolveRestrictedAgentPolicy(executionPackage, request.action, this.config.restrictedAgent, request.xhs)
      const boundary = this.requireReadBoundary()
      const inputContents = await Promise.all(executionPackage.inputs.map(async input => Object.freeze({
        role: input.role,
        path: input.path,
        content: await boundary.readFrozenInput(input),
      })))
      await this.assertSecondPassPackageSources(current, executionPackage, inputContents)
      const hardContract = request.action !== 'fixture-agent-run'
        ? projectXhsExecutionContract(inputContents.find(input => input.role === 'taskCard')?.content
          ?? (() => { throw new BusinessWorkbenchError('XHS_BODY_INPUT_INVALID', 'business-workbench: XHS package lacks its frozen TaskCard') })())
        : undefined
      if (hardContract !== undefined && (request.xhs?.noteType !== hardContract.noteType || request.xhs.account !== hardContract.account)) {
        throw new BusinessWorkbenchError('XHS_BODY_INPUT_INVALID', 'business-workbench: TaskCard account or note_type differs from the requested XHS route')
      }
      const sourceIdentity = executionPackage.productionSource?.identity
      if (hardContract !== undefined && sourceIdentity !== undefined
        && (hardContract.taskId !== sourceIdentity.taskId
          || hardContract.topicId !== sourceIdentity.topicId
          || hardContract.production.month !== sourceIdentity.productionMonth
          || hardContract.production.week !== sourceIdentity.productionWeek
          || hardContract.production.note !== sourceIdentity.note)) {
        throw new BusinessWorkbenchError('XHS_BODY_INPUT_INVALID', 'business-workbench: compiled TaskCard identity differs from the frozen production source')
      }
      if (executionPackage.productionSource === undefined) {
        await verifySkillSnapshots(this.requireSkillRegistry(), executionPackage.skillSnapshots, boundary.projectRoot())
      } else {
        const skillRequirement = assertXhsExecutionSkillRequirement(executionPackage)
        if (skillRequirement === 'none') await this.requireProductionSourceResolver().verifyInputs(executionPackage.productionSource)
        else {
          const skillSnapshot = executionPackage.skillSnapshots[0]
          if (skillSnapshot === undefined) throw new Error('business-workbench: verified Skill-required package lost its snapshot')
          await this.requireProductionSourceResolver().verify(executionPackage.productionSource, skillSnapshot)
        }
      }
      const latest = this.requireJob(request.jobId)
      const latestAttempt = this.requireCurrentAttempt(latest, request.attemptId, 'running')
      this.assertLiveLease(latestAttempt, ownerId)
      if (latestAttempt.executionPackage?.manifestHash !== executionPackage.manifestHash) {
        throw new BusinessWorkbenchError('EXECUTION_PACKAGE_CONFLICT', 'business-workbench: execution package changed during Agent preflight', { subjectId: executionPackage.id })
      }
      const runtime = this.requireRestrictedAgentRuntime()
      const startedAt = Date.now()
      const { timeoutMs, ...model } = policy.model
      const run: BusinessAgentRun = Object.freeze({
        id: deriveBusinessAgentRunId(latest.id, latestAttempt.id, request.action, request.idempotencyKey),
        jobId: latest.id,
        attemptId: latestAttempt.id,
        executionPackageId: executionPackage.id,
        action: request.action,
        ...(request.xhs === undefined ? {} : { xhs: snapshot(request.xhs) }),
        idempotencyKey: request.idempotencyKey,
        status: 'running',
        sessionId: randomUUID(),
        skillManifestHash: executionPackage.skillManifestHash,
        model: Object.freeze(model),
        startedAt,
      })
      await this.requireJobs().update(latest.id, job => Object.freeze({
        ...job,
        revision: job.revision + 1,
        attempts: Object.freeze(job.attempts.map(item => item.id === latestAttempt.id
          ? Object.freeze({ ...item, agentRuns: Object.freeze([...item.agentRuns, run]) })
          : item)),
        updatedAt: startedAt,
      }))
      return Object.freeze({ kind: 'run', run, executionPackage: snapshot(executionPackage), inputContents: Object.freeze(inputContents), runtime, timeoutMs, policy,
        ...(hardContract === undefined ? {} : { hardContract }) })
    })
  }

  private commitRestrictedAgentOutput(
    run: BusinessAgentRun,
    executionPackage: BusinessExecutionPackage,
    ownerId: string,
    content: string,
  ): Promise<RestrictedBusinessAgentResult> {
    return this.enqueueMutation(async () => {
      const current = this.requireJob(run.jobId)
      const attempt = this.requireCurrentAttempt(current, run.attemptId, 'running')
      this.assertLiveLease(attempt, ownerId)
      const currentRun = attempt.agentRuns.find(item => item.id === run.id)
      if (currentRun?.status !== 'running') throw new BusinessWorkbenchError('AGENT_RUN_FAILED', `business-workbench: Agent Run '${run.id}' is not active`, { subjectId: run.id })
      if (attempt.executionPackage?.manifestHash !== executionPackage.manifestHash) {
        throw new BusinessWorkbenchError('EXECUTION_PACKAGE_CONFLICT', 'business-workbench: execution package changed before Agent output commit', { subjectId: executionPackage.id })
      }
      const contentHash = sha256Text(content)
      const contentBytes = Buffer.byteLength(content, 'utf8')
      const artifactIdempotencyKey = `agent-output:${run.idempotencyKey}`
      const artifactId = deriveBusinessArtifactId(current.id, attempt.id, 'intermediate', artifactIdempotencyKey)
      const completedAt = Date.now()
      const revision = current.revision + 1
      const provenance = Object.freeze({
        kind: 'restricted-agent' as const,
        agentRunId: run.id,
        executionPackageId: executionPackage.id,
        executionPackageManifestHash: executionPackage.manifestHash,
        skillManifestHash: executionPackage.skillManifestHash,
        model: snapshot(run.model),
      })
      const artifact: BusinessArtifact = Object.freeze({
        artifactId,
        jobId: current.id,
        attemptId: attempt.id,
        type: 'intermediate',
        revision,
        path: artifactRelativePath({ artifactId, jobId: current.id, attemptId: attempt.id, type: 'intermediate', batchId: current.batchId }),
        hash: contentHash,
        bytes: contentBytes,
        createdAt: completedAt,
        provenance,
      })
      await this.artifactStore.commit(artifact, current.batchId, content)
      this.assertLiveLease(attempt, ownerId)
      const operationFingerprint = fingerprint([run.id, artifact.hash, artifact.bytes, provenance])
      const next = await this.requireJobs().update(current.id, latest => Object.freeze({
        ...latest,
        revision,
        attempts: Object.freeze(latest.attempts.map(item => item.id === attempt.id
          ? Object.freeze({
            ...item,
            agentRuns: Object.freeze(item.agentRuns.map(agentRun => agentRun.id === run.id
              ? Object.freeze({ ...agentRun, status: 'completed' as const, endedAt: completedAt, artifactId })
              : agentRun)),
          })
          : item)),
        artifactRefs: Object.freeze([...latest.artifactRefs, artifact]),
        operations: Object.freeze([...latest.operations, receipt(run.idempotencyKey, 'run-agent', operationFingerprint, revision, completedAt, artifactId)]),
        updatedAt: completedAt,
      }))
      const committedAttempt = next.attempts.find(item => item.id === attempt.id)
      const committedRun = committedAttempt?.agentRuns.find(item => item.id === run.id)
      if (committedRun === undefined) throw new Error('business-workbench: committed Agent Run disappeared')
      return Object.freeze({ kind: 'artifact', run: snapshot(committedRun), artifact: snapshot(artifact) })
    })
  }

  private commitXhsOutputBundle(
    run: BusinessAgentRun,
    executionPackage: BusinessExecutionPackage,
    policy: RestrictedAgentPolicy,
    ownerId: string,
    modelOutput: string,
    hardValidation: XhsHardValidationResult,
  ): Promise<RestrictedBusinessAgentResult> {
    return this.enqueueMutation(async () => {
      const current = this.requireJob(run.jobId)
      const attempt = this.requireCurrentAttempt(current, run.attemptId, 'running')
      this.assertLiveLease(attempt, ownerId)
      if (attempt.outputBundle !== null) throw new BusinessWorkbenchError('OUTPUT_BUNDLE_CONFLICT', `business-workbench: Attempt '${attempt.id}' already has an authoritative output bundle`, { subjectId: attempt.outputBundle.id })
      const currentRun = attempt.agentRuns.find(item => item.id === run.id)
      if (currentRun?.status !== 'running') throw new BusinessWorkbenchError('AGENT_RUN_FAILED', `business-workbench: Agent Run '${run.id}' is not active`, { subjectId: run.id })
      if (attempt.executionPackage?.manifestHash !== executionPackage.manifestHash) {
        throw new BusinessWorkbenchError('EXECUTION_PACKAGE_CONFLICT', 'business-workbench: execution package changed before XHS output commit', { subjectId: executionPackage.id })
      }
      const completedAt = Date.now()
      const built = buildXhsOutputBundle({
        batchId: current.batchId,
        run,
        executionPackage,
        actionPolicyVersion: policy.policyVersion,
        modelOutput,
        completedAt,
      })
      const validationIdempotencyKey = `xhs-hard-validation:${built.bundle.id}`
      const validationContent = buildXhsHardValidationArtifact({
        jobId: current.id,
        attemptId: attempt.id,
        executionPackageId: executionPackage.id,
        outputBundleId: built.bundle.id,
      }, completedAt, hardValidation)
      const validationArtifactId = deriveBusinessArtifactId(current.id, attempt.id, 'validation', validationIdempotencyKey)
      const validationArtifact: BusinessArtifact = Object.freeze({
        artifactId: validationArtifactId,
        jobId: current.id,
        attemptId: attempt.id,
        type: 'validation',
        revision: current.revision + 1,
        path: artifactRelativePath({ artifactId: validationArtifactId, jobId: current.id, attemptId: attempt.id,
          type: 'validation', batchId: current.batchId }),
        hash: sha256Text(validationContent),
        bytes: Buffer.byteLength(validationContent, 'utf8'),
        createdAt: completedAt,
      })
      await this.artifactStore.commit(validationArtifact, current.batchId, validationContent)
      const stage = await this.outputBundleStore.stage(built.bundle, built.files)
      await this.outputBundleStore.publish(stage, built.bundle, built.files)
      this.assertLiveLease(attempt, ownerId)
      const revision = current.revision + 1
      const operationFingerprint = fingerprint([run.id, built.bundle.manifestHash, validationArtifact.hash])
      const next = await this.requireJobs().update(current.id, (latest) => {
        if (latest.revision !== current.revision) throw new BusinessWorkbenchError('REVISION_CONFLICT', `business-workbench: Job '${latest.id}' changed before output bundle settlement`, { currentRevision: latest.revision, subjectId: latest.id })
        return Object.freeze({
          ...latest,
          revision,
          attempts: Object.freeze(latest.attempts.map(item => item.id === attempt.id
            ? Object.freeze({
              ...item,
              outputBundle: built.bundle,
              agentRuns: Object.freeze(item.agentRuns.map(agentRun => agentRun.id === run.id
                ? Object.freeze({ ...agentRun, status: 'completed' as const, endedAt: completedAt, outputBundleId: built.bundle.id })
                : agentRun)),
            })
            : item)),
          operations: Object.freeze([...latest.operations, receipt(run.idempotencyKey, 'run-agent', operationFingerprint, revision, completedAt, built.bundle.id)]),
          artifactRefs: Object.freeze([...latest.artifactRefs, validationArtifact]),
          updatedAt: completedAt,
        })
      })
      const committedAttempt = next.attempts.find(item => item.id === attempt.id)
      if (committedAttempt === undefined || committedAttempt.outputBundle === null) throw new Error('business-workbench: committed XHS output disappeared')
      const committedRun = committedAttempt.agentRuns.find(item => item.id === run.id)
      if (committedRun === undefined) throw new Error('business-workbench: committed XHS Agent Run disappeared')
      return Object.freeze({ kind: 'output-bundle', run: snapshot(committedRun), outputBundle: snapshot(committedAttempt.outputBundle) })
    })
  }

  private recordAgentRunFailure(
    run: BusinessAgentRun,
    ownerId: string,
    failure: BusinessWorkbenchError,
  ): Promise<void> {
    return this.enqueueMutation(async () => {
      const current = this.requireJobs().get(run.jobId)
      if (current?.currentAttempt !== run.attemptId) return
      const attempt = current.attempts.find(item => item.id === run.attemptId)
      if (attempt?.status !== 'running') return
      const existing = attempt.agentRuns.find(item => item.id === run.id)
      if (existing?.status !== 'running') return
      const lease = attempt.lease
      if (lease === null || lease.ownerId !== ownerId || lease.runtimeInstanceId !== this.runtimeInstanceId) return
      const endedAt = Date.now()
      const leaseStatus = lease.leaseExpiresAt <= endedAt ? 'expired' as const : 'released' as const
      await this.requireJobs().update(current.id, latest => Object.freeze({
        ...withoutStatusReason(latest),
        status: leaseStatus === 'expired' ? 'interrupted' as const : 'failed' as const,
        revision: latest.revision + 1,
        currentAttempt: null,
        attempts: Object.freeze(latest.attempts.map(item => item.id === attempt.id
          ? Object.freeze({
            ...item,
            status: leaseStatus === 'expired' ? 'interrupted' as const : 'failed' as const,
            lease: Object.freeze({ ...lease, status: leaseStatus }),
            agentRuns: Object.freeze(item.agentRuns.map(agentRun => agentRun.id === run.id
              ? Object.freeze({
                ...agentRun,
                status: leaseStatus === 'expired' ? 'interrupted' as const : 'failed' as const,
                endedAt,
                failureCode: failure.code,
                failureReason: durableFailureReason(failure),
              })
              : agentRun)),
            completedAt: endedAt,
            statusReason: failure.message,
          })
          : item)),
        statusReason: failure.message,
        updatedAt: endedAt,
      }))
    })
  }

  private async recordRejectedAgentRun(request: RunRestrictedBusinessAgentRequest, error: unknown): Promise<void> {
    const failure = this.normalizeAgentFailure(error)
    await this.enqueueMutation(async () => {
      const current = this.requireJobs().get(request.jobId)
      if (current?.currentAttempt !== request.attemptId) return
      const attempt = current.attempts.find(item => item.id === request.attemptId)
      if (attempt?.status !== 'running' || attempt.lease === null) return
      if (attempt.outputBundle !== null) return
      const lease = attempt.lease
      if (lease.ownerId !== request.ownerId || lease.runtimeInstanceId !== this.runtimeInstanceId) return
      if (attempt.agentRuns.some(run => run.idempotencyKey === request.idempotencyKey)) return
      const endedAt = Date.now()
      const packageId = attempt.executionPackage?.id ?? request.executionPackageId
      const { timeoutMs: _timeoutMs, ...configuredModel } = this.config.restrictedAgent ?? { provider: 'unconfigured', model: 'unconfigured', timeoutMs: 1 }
      const rejectedRun: BusinessAgentRun = Object.freeze({
        id: deriveBusinessAgentRunId(current.id, attempt.id, request.action, request.idempotencyKey),
        jobId: current.id,
        attemptId: attempt.id,
        executionPackageId: packageId,
        action: request.action,
        ...(request.xhs === undefined ? {} : { xhs: snapshot(request.xhs) }),
        idempotencyKey: request.idempotencyKey,
        status: 'failed',
        sessionId: 'not-started',
        skillManifestHash: attempt.executionPackage?.skillManifestHash ?? skillManifestHash([]),
        model: Object.freeze(configuredModel),
        startedAt: endedAt,
        endedAt,
        failureCode: failure.code,
        failureReason: failure.message,
      })
      await this.requireJobs().update(current.id, latest => Object.freeze({
        ...withoutStatusReason(latest),
        status: 'failed' as const,
        revision: latest.revision + 1,
        currentAttempt: null,
        attempts: Object.freeze(latest.attempts.map(item => item.id === attempt.id
          ? Object.freeze({
            ...item,
            status: 'failed' as const,
            lease: Object.freeze({ ...lease, status: 'released' as const }),
            agentRuns: Object.freeze([...item.agentRuns, rejectedRun]),
            completedAt: endedAt,
            statusReason: failure.message,
          })
          : item)),
        statusReason: failure.message,
        updatedAt: endedAt,
      }))
    })
  }

  private requireRestrictedAgentRuntime(): HarnessRestrictedAgentRuntime {
    if (this.ctx.get('agents') === undefined || this.ctx.get('tools') === undefined || this.ctx.get('systemPrompt') === undefined) {
      throw new BusinessWorkbenchError('AGENT_RUNTIME_UNAVAILABLE', 'business-workbench: Agent, Tool, or system-prompt runtime is unavailable')
    }
    return new HarnessRestrictedAgentRuntime(this.ctx)
  }

  private normalizeAgentFailure(error: unknown): BusinessWorkbenchError {
    if (error instanceof BusinessWorkbenchError) return error
    return new BusinessWorkbenchError('PROVIDER_ERROR', 'business-workbench: restricted Agent provider failed', {}, { cause: error })
  }

  private renderRestrictedSystemPrompt(executionPackage: BusinessExecutionPackage, action: BusinessAgentRun['action']): string {
    const skills = executionPackage.skillSnapshots.map(snapshot => [
      `<approved_skill id=${JSON.stringify(snapshot.skillId)} snapshot=${JSON.stringify(snapshot.snapshotHash)}>` ,
      snapshot.content,
      '</approved_skill>',
    ].join('\n')).join('\n\n')
    const production = executionPackage.productionSource !== undefined
    const instructions = action === 'xhs-body-length-repair-v0'
      ? [
        'Return exactly one JSON object and no Markdown or code fence.',
        'Use this exact response object: {"proposal_version":1,"title_candidates":["..."],"body_options":[{"patches":[{"old_text":"...","new_text":"..."}]}]}.',
        'Provide at most three title candidates and at most three independent body options. Every body patch must be a local, one-line, exact old_text to new_text replacement. old_text must be copied exactly from the source body.',
        'Do not return a complete draft, metadata, comments, topics, product copy, keywords, SEO copy, general rewriting advice, or tool requests. Change only title/body length while preserving the PASS-reviewed business meaning and Review preserve list.',
      ].join(' ')
      : action === 'xhs-body-contract-repair-v0'
        ? 'Return only the complete repaired draft as plain Markdown text. Business quality already passed. Change only the exact failed_contract_items named by the Host evidence and only within repaired_fields. Preserve all other bytes and business meaning wherever the named length or keyword correction permits. Do not change the topic, core answer, note_type, product module, conversion_mode, keyword truth, allowed_topics truth, comments, product connection, business judgments, or Leo experiences. Do not optimize generally or request tools, files, Skills, or other context.'
        : action === 'xhs-body-revise-v0'
          ? 'Return only the complete revised draft as plain Markdown text. Change only the Review Artifact required_changes. Preserve the listed content wherever compatible; quality_suggestions are optional. Do not reselect the topic, rewrite TaskCard truth, add experiences, change keyword truth, allowed_topics, product module, or conversion_mode. Do not request tools, files, Skills, or other context.'
          : action === 'xhs-body-retry-v0'
            ? 'Return only a complete new draft as plain Markdown text. Generate from the frozen TaskCard, current account Skill, V3 rule, and golden sample; the failed draft is not available and must not be continued. Do not request tools, files, Skills, or other context.'
            : action === 'xhs-body-prepare-v0'
              ? `Return only the complete draft as plain Markdown text, not JSON or an outer code fence. Do not add transport commentary. Use only the frozen ${production ? 'production' : 'fixture'} inputs and approved account Skill; do not request tools, files, Skills, or other context.`
              : 'Return one concise JSON object with summary and evidence fields. Do not request tools or other files.'
    return [
      `You are the Business Workbench restricted ${production ? 'production draft' : 'fixture'} Agent.`,
      'Use only the frozen inputs in the user message and the approved Skill snapshots below.',
      instructions,
      skills,
    ].filter(part => part.length > 0).join('\n\n')
  }

  private renderRestrictedUserPrompt(
    run: BusinessAgentRun,
    inputs: readonly { readonly role: string; readonly path: string; readonly content: string }[],
    hardContract?: XhsExecutionContractProjection,
  ): string {
    const input = JSON.stringify({
      action: run.action,
      jobId: run.jobId,
      attemptId: run.attemptId,
      executionPackageId: run.executionPackageId,
      inputs,
    })
    if (hardContract === undefined) return input
    if (run.action === 'xhs-body-length-repair-v0') {
      return `${input}\n\n【Host试算目标】\n- 标题：${hardContract.titleRange.min}—${hardContract.titleRange.max}全字符\n- 正文：${hardContract.bodyRange.min}—${hardContract.bodyRange.max}全字符\n字符数和最终候选稿均由Host生成；不要输出完整正文。`
    }
    return `${input}\n\n${renderXhsExecutionChecklist(hardContract)}`
  }

  private async endAsInterrupted(request: ReleaseBusinessExecutionLeaseRequest, reason: string): Promise<BusinessJob> {
    assertOperationKey(request.idempotencyKey)
    const ownerId = nonblank(request.ownerId, 'ownerId')
    const operationFingerprint = fingerprint([request.attemptId, ownerId, reason])
    const current = this.requireJob(request.jobId)
    if (repeatedOperation(current, request.idempotencyKey, 'release-lease', operationFingerprint) !== undefined) return snapshot(current)
    assertExpectedRevision(current, request.expectedRevision)
    const attempt = this.requireCurrentAttempt(current, request.attemptId, 'running')
    const activeLease = this.assertLiveLease(attempt, ownerId)
    const endedAt = Date.now()
    const revision = current.revision + 1
    const next = await this.requireJobs().update(request.jobId, (latest) => {
      assertExpectedRevision(latest, request.expectedRevision)
      return Object.freeze({ ...withoutStatusReason(latest), status: 'interrupted', revision, currentAttempt: null,
        attempts: Object.freeze(latest.attempts.map(item => item.id === attempt.id
          ? Object.freeze({
            ...item,
            status: 'interrupted' as const,
            lease: Object.freeze({ ...activeLease, status: 'released' as const }),
            completedAt: endedAt,
            statusReason: reason,
          })
          : item)),
        operations: Object.freeze([...latest.operations, receipt(request.idempotencyKey, 'release-lease', operationFingerprint, revision, endedAt, attempt.id)]), statusReason: reason, updatedAt: endedAt })
    })
    return snapshot(next)
  }

  private async persistInterrupted(
    jobId: BusinessJobId,
    job: BusinessJob,
    attempt: BusinessAttempt,
    reason: string,
    leaseStatus: 'released' | 'expired',
  ): Promise<void> {
    if (attempt.lease === null) throw new Error('business-workbench: recovery Attempt has no lease')
    const activeLease = attempt.lease
    const endedAt = Date.now()
    await this.requireJobs().update(jobId, (latest) => {
      if (latest.revision !== job.revision || latest.status !== 'running' || latest.currentAttempt !== attempt.id) return latest
      return Object.freeze({ ...withoutStatusReason(latest), status: 'interrupted', revision: latest.revision + 1, currentAttempt: null,
        attempts: Object.freeze(latest.attempts.map(item => item.id === attempt.id
          ? Object.freeze({
            ...item,
            status: 'interrupted' as const,
            lease: Object.freeze({ ...activeLease, status: leaseStatus }),
            agentRuns: Object.freeze(item.agentRuns.map(run => run.status === 'running'
              ? Object.freeze({ ...run, status: 'interrupted' as const, endedAt, failureCode: 'RUNTIME_INTERRUPTED', failureReason: reason })
              : run)),
            completedAt: endedAt,
            statusReason: reason,
          })
          : item)),
        statusReason: reason,
        updatedAt: endedAt,
      })
    })
  }

  private assertLiveLease(attempt: BusinessAttempt, ownerId: string): NonNullable<BusinessAttempt['lease']> {
    const lease = attempt.lease
    if (lease === null || lease.status !== 'active') throw new BusinessWorkbenchError('LEASE_EXPIRED', `business-workbench: Attempt '${attempt.id}' has no active lease`, { subjectId: attempt.id })
    if (lease.ownerId !== ownerId || lease.runtimeInstanceId !== this.runtimeInstanceId) throw new BusinessWorkbenchError('LEASE_OWNER_MISMATCH', `business-workbench: caller does not own Attempt '${attempt.id}'`, { subjectId: attempt.id })
    if (lease.leaseExpiresAt <= Date.now()) throw new BusinessWorkbenchError('LEASE_EXPIRED', `business-workbench: lease for Attempt '${attempt.id}' expired`, { subjectId: attempt.id })
    return lease
  }

  private requireCurrentAttempt(job: BusinessJob, attemptId: BusinessAttemptId, status: 'pending' | 'running'): BusinessAttempt {
    const attempt = job.attempts.find(item => item.id === attemptId)
    if (job.currentAttempt !== attemptId || attempt?.status !== status) throw new BusinessWorkbenchError('LEASE_CONFLICT', `business-workbench: Attempt '${attemptId}' is not the current ${status} Attempt`, { subjectId: attemptId })
    return attempt
  }

  private requireReadBoundary(): BusinessReadBoundary {
    if (this.readBoundary === undefined) throw new BusinessWorkbenchError('READ_ROOT_UNAVAILABLE', 'business-workbench: no business read root is configured')
    return this.readBoundary
  }

  private requireProductionSourceResolver(): XhsProductionSourceResolver {
    if (this.productionSourceResolver === undefined) {
      throw new BusinessWorkbenchError('READ_ROOT_UNAVAILABLE', 'business-workbench: no XHS production source resolver is configured')
    }
    return this.productionSourceResolver
  }

  private requireSkillRegistry(): SkillRegistry {
    const skills = this.ctx.get('skills')
    if (skills === undefined) throw new BusinessWorkbenchError('AGENT_RUNTIME_UNAVAILABLE', 'business-workbench: Skill Registry is unavailable')
    return skills
  }

  private validateCreateBatchRequest(request: CreateBusinessBatchRequest): void {
    assertOperationKey(request.idempotencyKey)
    const mode: unknown = (request as { readonly mode?: unknown }).mode
    if (mode !== 'single' && mode !== 'quad') {
      throw new BusinessWorkbenchError('INVALID_OPERATION', `business-workbench: unsupported Batch mode '${String(mode)}'`)
    }
    const expectedJobs = mode === 'single' ? 1 : 4
    if (request.inputs.length !== expectedJobs) {
      throw new BusinessWorkbenchError('INVALID_OPERATION', `business-workbench: ${request.mode} Batch requires exactly ${expectedJobs} input(s)`)
    }
    for (const input of request.inputs) this.validateInput(input)
  }

  private validateInput(input: BusinessInputReference): void {
    if (input.reference.length === 0 || !/^[a-f0-9]{64}$/.test(input.sha256)) throw new BusinessWorkbenchError('INVALID_OPERATION', 'business-workbench: every input needs a reference and SHA-256')
  }

  private async recoverCreatingBatches(): Promise<void> {
    const seenCreateKeys = new Set<string>()
    for (const [, batch] of this.requireBatches().entries()) {
      if (seenCreateKeys.has(batch.createKey)) throw new BusinessWorkbenchError('BATCH_CORRUPT', `business-workbench: duplicate Batch create key '${batch.createKey}'`, { subjectId: batch.id })
      seenCreateKeys.add(batch.createKey)
      if (batch.status === 'creating') await this.materializeBatch(batch)
    }
  }

  private async materializeBatch(batch: BusinessBatch): Promise<BusinessBatch> {
    if (batch.status === 'ready') return batch
    for (let index = 0; index < batch.jobIds.length; index += 1) {
      const jobId = batch.jobIds[index] as BusinessJobId
      const input = batch.inputs[index] as BusinessInputReference
      const existing = this.requireJobs().get(jobId)
      if (existing === undefined) {
        const job: BusinessJob = Object.freeze({
          id: jobId,
          batchId: batch.id,
          project: batch.project,
          type: batch.type,
          status: 'draft',
          revision: 0,
          currentAttempt: null,
          input: Object.freeze({ ...input }),
          attempts: Object.freeze([]),
          artifactRefs: Object.freeze([]),
          operations: Object.freeze([]),
          createdAt: batch.createdAt,
          updatedAt: batch.createdAt,
        })
        await this.requireJobs().put(job.id, job)
      } else if (existing.batchId !== batch.id
        || existing.input.reference !== input.reference
        || existing.input.sha256 !== input.sha256) {
        throw new BusinessWorkbenchError('BATCH_CORRUPT', `business-workbench: pending Batch '${batch.id}' conflicts with Job '${jobId}'`, { subjectId: batch.id })
      }
    }
    return this.requireBatches().update(batch.id, (current) => {
      if (current.status === 'ready') return current
      if (current.revision !== batch.revision || current.revision !== 0) {
        throw new BusinessWorkbenchError(
          'REVISION_CONFLICT',
          `business-workbench: Batch '${batch.id}' creation revision changed`,
          { currentRevision: current.revision, subjectId: batch.id },
        )
      }
      return Object.freeze({ ...current, status: 'ready', revision: current.revision + 1, updatedAt: Date.now() })
    })
  }

  private validateReadyBatches(): void {
    for (const [, batch] of this.requireBatches().entries()) {
      if (batch.status !== 'ready') {
        throw new BusinessWorkbenchError(
          'BATCH_CORRUPT',
          `business-workbench: Batch '${batch.id}' did not finish recovery`,
          { subjectId: batch.id },
        )
      }
      for (const jobId of batch.jobIds) {
        const job = this.requireJobs().get(jobId)
        if (job === undefined || job.batchId !== batch.id) {
          throw new BusinessWorkbenchError(
            'BATCH_CORRUPT',
            `business-workbench: Batch '${batch.id}' is missing Job '${jobId}'`,
            { subjectId: batch.id },
          )
        }
      }
    }
    for (const [, job] of this.requireJobs().entries()) {
      const batch = this.requireBatches().get(job.batchId)
      if (batch === undefined || !batch.jobIds.includes(job.id)) {
        throw new BusinessWorkbenchError(
          'BATCH_CORRUPT',
          `business-workbench: Job '${job.id}' has no owning Batch relationship`,
          { subjectId: job.id },
        )
      }
    }
  }

  private validateExecutionPackages(): void {
    for (const [, job] of this.requireJobs().entries()) {
      for (const attempt of job.attempts) {
        if (attempt.executionPackage !== null) this.assertPackageHash(attempt.executionPackage)
      }
    }
  }

  private assertPackageHash(executionPackage: BusinessExecutionPackage): void {
    const { manifestHash, ...base } = executionPackage
    if (executionPackageHash(base) !== manifestHash) {
      throw new BusinessWorkbenchError(
        'EXECUTION_PACKAGE_CONFLICT',
        `business-workbench: execution package '${executionPackage.id}' failed manifest verification`,
        { subjectId: executionPackage.id },
      )
    }
    if (skillManifestHash(executionPackage.skillSnapshots) !== executionPackage.skillManifestHash) {
      throw new BusinessWorkbenchError(
        'EXECUTION_PACKAGE_CONFLICT',
        `business-workbench: execution package '${executionPackage.id}' failed Skill manifest verification`,
        { subjectId: executionPackage.id },
      )
    }
  }

  private async verifyAllArtifacts(): Promise<void> {
    for (const [, job] of this.requireJobs().entries()) {
      for (const artifact of job.artifactRefs) await this.artifactStore.verify(artifact, job.batchId)
    }
  }

  private async verifyAllOutputBundles(): Promise<void> {
    for (const [, job] of this.requireJobs().entries()) {
      for (const attempt of job.attempts) {
        if (attempt.outputBundle !== null) await this.outputBundleStore.read(attempt.outputBundle)
      }
    }
  }

  private locateOutputBundle(bundleId: BusinessOutputBundleId): NonNullable<BusinessAttempt['outputBundle']> {
    let found: NonNullable<BusinessAttempt['outputBundle']> | undefined
    for (const [, job] of this.requireJobs().entries()) {
      for (const attempt of job.attempts) {
        if (attempt.outputBundle?.id !== bundleId) continue
        if (found !== undefined) throw new BusinessWorkbenchError('OUTPUT_BUNDLE_CORRUPT', `business-workbench: output bundle '${bundleId}' is referenced more than once`, { subjectId: bundleId })
        found = attempt.outputBundle
      }
    }
    if (found === undefined) throw new BusinessWorkbenchError('NOT_FOUND', `business-workbench: output bundle '${bundleId}' was not found`, { subjectId: bundleId })
    return found
  }

  private async requireSourceOutput(sourceJobId: BusinessJobId, sourceAttemptId: BusinessAttemptId) {
    const { job, attempt } = this.requireSourceAttempt(sourceJobId, sourceAttemptId)
    if (attempt.outputBundle === null) {
      throw new BusinessWorkbenchError('OUTPUT_BUNDLE_MISSING', 'business-workbench: source Attempt has no authoritative output bundle', { subjectId: sourceAttemptId })
    }
    const content = await this.outputBundleStore.read(attempt.outputBundle)
    return Object.freeze({ job, attempt, bundle: content.bundle, files: content.files })
  }

  private requireSourceAttempt(sourceJobId: BusinessJobId, sourceAttemptId: BusinessAttemptId) {
    const job = this.requireJob(sourceJobId)
    const attempt = job.attempts.find(item => item.id === sourceAttemptId)
    if (attempt === undefined) throw new BusinessWorkbenchError('NOT_FOUND', 'business-workbench: source Attempt was not found', { subjectId: sourceAttemptId })
    return Object.freeze({ job, attempt })
  }

  private async sourceValidationContent(job: BusinessJob, attemptId: BusinessAttemptId, outputBundleId: BusinessOutputBundleId) {
    for (const artifact of job.artifactRefs.filter(item => item.attemptId === attemptId && item.type === 'validation')) {
      const content = await this.artifactStore.read(artifact, job.batchId)
      try {
        const parsed = xhsHardValidationArtifactSchema.parse(JSON.parse(content.content))
        if (parsed.outputBundleId === outputBundleId) return content
      } catch {
        // Another validation format is not evidence for XHS retry or revision eligibility.
      }
    }
    throw new BusinessWorkbenchError('XHS_RETRY_NOT_ALLOWED', 'business-workbench: source Attempt lacks matching structural validation evidence')
  }

  private async sourceValidation(job: BusinessJob, attemptId: BusinessAttemptId, outputBundleId: BusinessOutputBundleId) {
    const content = await this.sourceValidationContent(job, attemptId, outputBundleId)
    return xhsHardValidationArtifactSchema.parse(JSON.parse(content.content))
  }

  private async assertReviewableXhsSource(
    job: BusinessJob,
    attempt: BusinessAttempt,
    outputBundleId: BusinessOutputBundleId,
  ): Promise<void> {
    if (job.status !== 'completed' || attempt.status !== 'completed') {
      throw new BusinessWorkbenchError('XHS_REVIEW_INVALID', 'business-workbench: only a completed candidate may enter business Review')
    }
    let failureClass: XhsHardValidationResult['failureClass']
    try {
      const validation = await this.sourceValidation(job, attempt.id, outputBundleId)
      failureClass = validation.result.failureClass
    } catch (error) {
      throw new BusinessWorkbenchError('XHS_REVIEW_INVALID', 'business-workbench: candidate lacks matching deterministic validation evidence', {}, { cause: error })
    }
    if (failureClass === 'FORMAT_CONTRACT_FAIL') {
      throw new BusinessWorkbenchError('XHS_REVIEW_INVALID', 'business-workbench: structurally incomplete output requires Retry, not Revision')
    }
  }

  private async assertSecondPassPackageSources(
    targetJob: BusinessJob,
    executionPackage: BusinessExecutionPackage,
    inputs: readonly { readonly role: string; readonly path: string; readonly content: string }[],
  ): Promise<void> {
    const lineage = executionPackage.lineage
    if (lineage === undefined) return
    if (lineage.kind === 'length-repair') {
      const source = await this.requireSourceOutput(lineage.sourceJobId, lineage.sourceAttemptId)
      const sourceDraft = inputs.find(input => input.role === 'sourceCandidateDraft')
      const reviewInput = inputs.find(input => input.role === 'businessPassReview')
      const validationInput = inputs.find(input => input.role === 'hardContractFailure')
      const locatedReview = this.locateArtifact(lineage.businessReviewArtifactId)
      const locatedValidation = this.locateArtifact(lineage.hardValidationArtifactId)
      if (locatedReview.artifact.jobId !== targetJob.id || locatedReview.artifact.attemptId !== executionPackage.attemptId
        || source.bundle.id !== lineage.sourceOutputBundleId
        || sourceDraft?.path !== `business-artifacts/${lineage.sourceDraftPath}`
        || sha256Text(sourceDraft.content) !== lineage.sourceDraftSha256
        || reviewInput?.path !== `business-artifacts/${locatedReview.artifact.path}`
        || sha256Text(reviewInput.content) !== locatedReview.artifact.hash
        || validationInput?.path !== `business-artifacts/${locatedValidation.artifact.path}`
        || sha256Text(validationInput.content) !== lineage.hardValidationSha256) {
        throw new BusinessWorkbenchError('XHS_LENGTH_REPAIR_NOT_ALLOWED', 'business-workbench: length-repair package inputs differ from immutable source relations')
      }
      const review = parseXhsReviewArtifactDocument(reviewInput.content)
      assertXhsReviewSource(review, source.bundle, lineage.sourceDraftSha256, xhsReviewCandidate(source.attempt.executionPackage?.lineage))
      const validation = xhsHardValidationArtifactSchema.parse(JSON.parse(validationInput.content))
      const eligibility = assertXhsLengthRepairEligibility(review, validation.result)
      if (review.review_sha256 !== lineage.businessReviewSha256
        || validation.outputBundleId !== source.bundle.id
        || JSON.stringify(eligibility.failedContractItems) !== JSON.stringify(lineage.failedContractItems)) {
        throw new BusinessWorkbenchError('XHS_LENGTH_REPAIR_NOT_ALLOWED', 'business-workbench: length-repair evidence no longer matches its admitted scope')
      }
      return
    }
    if (lineage.kind === 'contract-repair') {
      const source = await this.requireSourceOutput(lineage.sourceJobId, lineage.sourceAttemptId)
      const sourceDraft = inputs.find(input => input.role === 'sourceCandidateDraft')
      const reviewInput = inputs.find(input => input.role === 'businessPassReview')
      const validationInput = inputs.find(input => input.role === 'hardContractFailure')
      const locatedReview = this.locateArtifact(lineage.businessReviewArtifactId)
      const locatedValidation = this.locateArtifact(lineage.hardValidationArtifactId)
      if (locatedReview.artifact.jobId !== targetJob.id || locatedReview.artifact.attemptId !== executionPackage.attemptId
        || source.bundle.id !== lineage.sourceOutputBundleId
        || sourceDraft?.path !== `business-artifacts/${lineage.sourceDraftPath}`
        || sha256Text(sourceDraft.content) !== lineage.sourceDraftSha256
        || reviewInput?.path !== `business-artifacts/${locatedReview.artifact.path}`
        || sha256Text(reviewInput.content) !== locatedReview.artifact.hash
        || validationInput?.path !== `business-artifacts/${locatedValidation.artifact.path}`
        || sha256Text(validationInput.content) !== lineage.hardValidationSha256) {
        throw new BusinessWorkbenchError('XHS_CONTRACT_REPAIR_NOT_ALLOWED', 'business-workbench: Contract Repair package inputs differ from immutable source relations')
      }
      const review = parseXhsReviewArtifactDocument(reviewInput.content)
      assertXhsReviewSource(review, source.bundle, lineage.sourceDraftSha256, xhsReviewCandidate(source.attempt.executionPackage?.lineage))
      const validation = xhsHardValidationArtifactSchema.parse(JSON.parse(validationInput.content))
      const scope = deriveXhsContractRepairScope(validation.result)
      if (review.review_sha256 !== lineage.businessReviewSha256 || review.review_result !== 'PASS'
        || validation.outputBundleId !== source.bundle.id
        || validation.result.facts.draftSha256 !== lineage.sourceDraftSha256
        || JSON.stringify(scope.failedContractItems) !== JSON.stringify(lineage.failedContractItems)
        || JSON.stringify(scope.repairedFields) !== JSON.stringify(lineage.repairedFields)) {
        throw new BusinessWorkbenchError('XHS_CONTRACT_REPAIR_NOT_ALLOWED', 'business-workbench: Contract Repair evidence no longer matches its admitted scope')
      }
      return
    }
    if (lineage.kind === 'revision') {
      const source = await this.requireSourceOutput(lineage.sourceJobId, lineage.sourceAttemptId)
      const sourceDraft = inputs.find(input => input.role === 'sourceCandidateDraft')
        ?? inputs.find(input => input.role === 'firstPassDraft')
      const reviewInput = inputs.find(input => input.role === 'review')
      const locatedReview = this.locateArtifact(lineage.reviewArtifactId)
      if (locatedReview.artifact.jobId !== targetJob.id || locatedReview.artifact.attemptId !== executionPackage.attemptId
        || source.bundle.id !== lineage.sourceOutputBundleId
        || sourceDraft?.path !== `business-artifacts/${lineage.sourceDraftPath}`
        || sha256Text(sourceDraft.content) !== lineage.sourceDraftSha256
        || reviewInput?.path !== `business-artifacts/${locatedReview.artifact.path}`
        || sha256Text(reviewInput.content) !== locatedReview.artifact.hash) {
        throw new BusinessWorkbenchError('XHS_REVIEW_INVALID', 'business-workbench: revision package inputs differ from immutable source relations')
      }
      const review = parseXhsReviewArtifactDocument(reviewInput.content)
      assertXhsReviewSource(
        review,
        source.bundle,
        lineage.sourceDraftSha256,
        xhsReviewCandidate(source.attempt.executionPackage?.lineage),
      )
      if (review.review_sha256 !== lineage.reviewSha256 || review.review_result !== 'MODIFY') {
        throw new BusinessWorkbenchError('XHS_REVIEW_INVALID', 'business-workbench: revision package review is not the admitted MODIFY review')
      }
      return
    }
    const source = this.requireSourceAttempt(lineage.retryOfJobId, lineage.retryOfAttemptId)
    if (lineage.retryOfOutputBundleId !== source.attempt.outputBundle?.id) {
      throw new BusinessWorkbenchError('XHS_RETRY_NOT_ALLOWED', 'business-workbench: retry lineage differs from its source execution')
    }
    const productionIdentity = source.attempt.executionPackage?.productionSource?.identity
    if (productionIdentity === undefined || executionPackage.productionSource === undefined
      || JSON.stringify(productionIdentity) !== JSON.stringify(executionPackage.productionSource.identity)) {
      throw new BusinessWorkbenchError('XHS_RETRY_NOT_ALLOWED', 'business-workbench: retry package changed the production identity')
    }
  }

  private locateArtifact(artifactId: BusinessArtifactId): { artifact: BusinessArtifact; batchId: BusinessBatchId } {
    let found: { artifact: BusinessArtifact; batchId: BusinessBatchId } | undefined
    for (const [, job] of this.requireJobs().entries()) {
      const artifact = job.artifactRefs.find(item => item.artifactId === artifactId)
      if (artifact === undefined) continue
      if (found !== undefined) throw new BusinessWorkbenchError('ARTIFACT_CORRUPT', `business-workbench: Artifact id '${artifactId}' is referenced by multiple Jobs`, { subjectId: artifactId })
      found = { artifact, batchId: job.batchId }
    }
    if (found === undefined) throw new BusinessWorkbenchError('NOT_FOUND', `business-workbench: Artifact '${artifactId}' was not found`, { subjectId: artifactId })
    return found
  }

  private requireJob(jobId: BusinessJobId): BusinessJob {
    const job = this.requireJobs().get(jobId)
    if (job === undefined) throw new BusinessWorkbenchError('NOT_FOUND', `business-workbench: Job '${jobId}' was not found`, { subjectId: jobId })
    return job
  }

  private requireBatches(): KvTable<BusinessBatchId, BusinessBatch> {
    if (this.batches === undefined) throw new Error('business-workbench: service is not initialized')
    return this.batches
  }

  private requireJobs(): KvTable<BusinessJobId, BusinessJob> {
    if (this.jobs === undefined) throw new Error('business-workbench: service is not initialized')
    return this.jobs
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.mutationAdmissionOpen) return Promise.reject(new BusinessWorkbenchError('INVALID_OPERATION', 'business-workbench: service is stopping'))
    const run = this.operationTail.then(operation, operation)
    this.operationTail = run.then(() => undefined, () => undefined)
    return run
  }
}

/** Preserve structured empty-output evidence inside the existing V4 failure string. */
function durableFailureReason(failure: BusinessWorkbenchError): string {
  if (failure.detail.xhsOutputDiagnostics !== undefined) {
    return `${failure.message}\n${JSON.stringify({ xhsOutputDiagnostics: failure.detail.xhsOutputDiagnostics })}`
  }
  const diagnostics = failure.detail.outputDiagnostics
  return diagnostics === undefined
    ? failure.message
    : `${failure.message}\n${JSON.stringify({ outputDiagnostics: diagnostics })}`
}

export default BusinessWorkbenchService
