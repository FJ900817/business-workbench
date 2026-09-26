/** Versioned storage-domain schemas for Business Workbench state. */

import { createHash } from 'node:crypto'
import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import {
  BusinessArtifactId,
  BusinessAttemptId,
  BusinessBatchId,
  BusinessExecutionPackageId,
  BusinessAgentRunId,
  BusinessJobId,
  BusinessOutputBundleId,
} from './ids.ts'
import type {
  BusinessArtifact,
  BusinessAgentArtifactProvenance,
  BusinessAgentModel,
  BusinessAgentRun,
  BusinessAttempt,
  BusinessBatch,
  BusinessBatchId as BatchId,
  BusinessExecutionInput,
  BusinessExecutionLease,
  BusinessExecutionPackage,
  BusinessInputReference,
  BusinessJob,
  BusinessJobId as JobId,
  BusinessOperationReceipt,
  BusinessOutputBundle,
  BusinessOutputBundleEntry,
  BusinessSkillSnapshot,
  XhsProductionInputRoute,
  XhsProductionSourceIdentity,
  XhsProductionSourceManifest,
  XhsExecutionLineage,
} from './types.ts'
import { xhsOutputBundleManifestHash } from './xhs-output-bundle.ts'
import { XHS_PROJECT_RELATIVE_PATH, xhsProductionSourceManifestHash } from './xhs-production-source.ts'
import { resolveXhsExecutionSkillRequirement } from './xhs-action-contract.ts'

/** Current on-disk Business Workbench schema version. */
export const BUSINESS_WORKBENCH_SCHEMA_VERSION = 5

const timestampSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const revisionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const operationKeySchema = z.string().min(1)
const nonblankSchema = z.string().trim().min(1)
const relativePathSchema = z.string().min(1)
const batchIdSchema = z.uuid().transform(BusinessBatchId)
const jobIdSchema = z.uuid().transform(BusinessJobId)
const attemptIdSchema = z.uuid().transform(BusinessAttemptId)
const artifactIdSchema = z.string().regex(/^artifact_[a-f0-9]{64}$/).transform(BusinessArtifactId)
const packageIdSchema = z.string().regex(/^package_[a-f0-9]{64}$/).transform(BusinessExecutionPackageId)
const agentRunIdSchema = z.string().regex(/^agent_run_[a-f0-9]{64}$/).transform(BusinessAgentRunId)
const outputBundleIdSchema = z.string().regex(/^output_bundle_[a-f0-9]{64}$/).transform(BusinessOutputBundleId)
const xhsAgentActionSchema = z.enum(['xhs-body-prepare-v0', 'xhs-body-revise-v0', 'xhs-body-retry-v0', 'xhs-body-contract-repair-v0', 'xhs-body-length-repair-v0'])

/** Fixed provider/model facts attached to one restricted Agent Run. */
export const businessAgentModelSchema = z.object({
  provider: nonblankSchema,
  model: nonblankSchema,
  reasoningEffort: nonblankSchema.optional(),
  maxTokens: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
}).strict() as z.ZodType<BusinessAgentModel>

const xhsBodyPrepareRouteSchema = z.object({
  mode: z.enum(['fixture', 'production']),
  account: z.enum(['account1', 'account2', 'account3', 'account4']),
  noteType: z.enum(['dry-search', 'recommendation', 'hot-traffic']),
}).strict()

/** Exact Skill body and winning origin frozen into an execution package. */
export const businessSkillSnapshotSchema = z.object({
  skillId: nonblankSchema,
  source: nonblankSchema,
  provider: nonblankSchema,
  path: z.string().min(1).optional(),
  resourceBase: z.string().min(1).optional(),
  content: z.string(),
  contentHash: sha256Schema,
  bytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  resolvedAt: timestampSchema,
  snapshotHash: sha256Schema,
}).strict().superRefine((snapshot, ctx) => {
  const contentHash = createHash('sha256').update(snapshot.content).digest('hex')
  if (snapshot.contentHash !== contentHash) {
    ctx.addIssue({ code: 'custom', path: ['contentHash'], message: 'Skill content hash does not match content' })
  }
  if (snapshot.bytes !== Buffer.byteLength(snapshot.content, 'utf8')) {
    ctx.addIssue({ code: 'custom', path: ['bytes'], message: 'Skill byte count does not match content' })
  }
  const { resolvedAt: _resolvedAt, snapshotHash: _snapshotHash, ...identity } = snapshot
  const expectedSnapshotHash = createHash('sha256').update(JSON.stringify(identity)).digest('hex')
  if (snapshot.snapshotHash !== expectedSnapshotHash) {
    ctx.addIssue({ code: 'custom', path: ['snapshotHash'], message: 'Skill snapshot hash does not match identity' })
  }
}) as z.ZodType<BusinessSkillSnapshot>

/** Durable lifecycle record for one restricted Agent invocation. */
export const businessAgentRunSchema = z.object({
  id: agentRunIdSchema,
  jobId: jobIdSchema,
  attemptId: attemptIdSchema,
  executionPackageId: packageIdSchema,
  action: z.union([z.literal('fixture-agent-run'), xhsAgentActionSchema]),
  xhs: xhsBodyPrepareRouteSchema.optional(),
  idempotencyKey: operationKeySchema,
  status: z.enum(['running', 'completed', 'failed', 'interrupted']),
  sessionId: nonblankSchema,
  skillManifestHash: sha256Schema,
  model: businessAgentModelSchema,
  startedAt: timestampSchema,
  endedAt: timestampSchema.optional(),
  artifactId: artifactIdSchema.optional(),
  outputBundleId: outputBundleIdSchema.optional(),
  failureCode: nonblankSchema.optional(),
  failureReason: nonblankSchema.optional(),
}).strict().superRefine((run, ctx) => {
  if (run.status === 'running' && run.endedAt !== undefined) ctx.addIssue({ code: 'custom', path: ['endedAt'], message: 'running Agent Run cannot have endedAt' })
  if (run.status !== 'running' && run.endedAt === undefined) ctx.addIssue({ code: 'custom', path: ['endedAt'], message: 'settled Agent Run requires endedAt' })
  const outputCount = Number(run.artifactId !== undefined) + Number(run.outputBundleId !== undefined)
  if (run.status === 'completed' && outputCount !== 1) ctx.addIssue({ code: 'custom', path: ['artifactId'], message: 'completed Agent Run requires exactly one authoritative output' })
  if (run.status !== 'completed' && outputCount !== 0) ctx.addIssue({ code: 'custom', path: ['artifactId'], message: 'non-completed Agent Run cannot reference an output' })
  if ((run.status === 'failed' || run.status === 'interrupted') && (run.failureCode === undefined || run.failureReason === undefined)) {
    ctx.addIssue({ code: 'custom', path: ['failureCode'], message: 'failed or interrupted Agent Run requires failure facts' })
  }
  if ((run.action !== 'fixture-agent-run') !== (run.xhs !== undefined)) ctx.addIssue({ code: 'custom', path: ['xhs'], message: 'XHS route must appear only on an XHS action' })
}) as z.ZodType<BusinessAgentRun>

/** Durable input-reference schema. */
export const businessInputReferenceSchema = z.object({
  reference: z.string().min(1),
  sha256: sha256Schema,
}).strict() as z.ZodType<BusinessInputReference>

/** Durable execution-lease schema. */
export const businessExecutionLeaseSchema = z.object({
  attemptId: attemptIdSchema,
  ownerId: nonblankSchema,
  runtimeInstanceId: z.uuid(),
  acquiredAt: timestampSchema,
  renewedAt: timestampSchema,
  leaseExpiresAt: timestampSchema,
  status: z.enum(['active', 'released', 'expired']),
}).strict().superRefine((lease, ctx) => {
  if (lease.renewedAt < lease.acquiredAt) {
    ctx.addIssue({ code: 'custom', path: ['renewedAt'], message: 'lease renewedAt precedes acquiredAt' })
  }
  if (lease.leaseExpiresAt <= lease.renewedAt) {
    ctx.addIssue({ code: 'custom', path: ['leaseExpiresAt'], message: 'lease expiry must follow renewedAt' })
  }
}) as z.ZodType<BusinessExecutionLease>

/** Durable frozen execution-input schema. */
export const businessExecutionInputSchema = z.object({
  role: nonblankSchema,
  path: relativePathSchema,
  required: z.boolean(),
  present: z.boolean(),
  sha256: sha256Schema.optional(),
  bytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
}).strict().superRefine((input, ctx) => {
  if (input.present !== (input.sha256 !== undefined && input.bytes !== undefined)) {
    ctx.addIssue({ code: 'custom', path: ['present'], message: 'present input requires hash and byte count' })
  }
}) as z.ZodType<BusinessExecutionInput>

const xhsProductionSourceIdentitySchema = z.object({
  path: relativePathSchema,
  sha256: sha256Schema,
  bytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  version: nonblankSchema.optional(),
}).strict() as z.ZodType<XhsProductionSourceIdentity>

const xhsProductionInputRouteSchema = z.object({
  role: z.enum(['taskCard', 'writingRule', 'goldenSample']),
  path: relativePathSchema,
  sha256: sha256Schema,
  bytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  version: nonblankSchema.optional(),
  routeReason: nonblankSchema,
}).strict() as z.ZodType<XhsProductionInputRoute>

const xhsExecutionLineageSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('revision'),
    sourceJobId: jobIdSchema,
    sourceAttemptId: attemptIdSchema,
    sourceOutputBundleId: outputBundleIdSchema,
    sourceDraftPath: relativePathSchema,
    sourceDraftSha256: sha256Schema,
    reviewArtifactId: artifactIdSchema,
    reviewSha256: sha256Schema,
    revisionNumber: z.union([z.literal(1), z.literal(2)]),
  }).strict(),
  z.object({
    kind: z.literal('retry'),
    retryOfJobId: jobIdSchema,
    retryOfAttemptId: attemptIdSchema,
    retryOfOutputBundleId: outputBundleIdSchema.optional(),
    retryReason: z.enum(['EMPTY_DRAFT', 'FORMAT_CONTRACT_FAIL', 'REQUIRED_BODY_MISSING']),
    retryNumber: z.literal(1),
  }).strict(),
  z.object({
    kind: z.literal('contract-repair'),
    sourceJobId: jobIdSchema,
    sourceAttemptId: attemptIdSchema,
    sourceOutputBundleId: outputBundleIdSchema,
    sourceDraftPath: relativePathSchema,
    sourceDraftSha256: sha256Schema,
    businessReviewArtifactId: artifactIdSchema,
    businessReviewSha256: sha256Schema,
    hardValidationArtifactId: artifactIdSchema,
    hardValidationSha256: sha256Schema,
    failedContractItems: z.array(nonblankSchema).min(1),
    repairNumber: z.literal(1),
    repairedFields: z.array(z.enum([
      'title-length', 'body-length', 'keyword-occurrences', 'keyword-title-position',
      'declared-title-characters', 'declared-body-characters', 'allowed-topics-formatting',
    ])).min(1),
  }).strict(),
  z.object({
    kind: z.literal('length-repair'),
    sourceJobId: jobIdSchema,
    sourceAttemptId: attemptIdSchema,
    sourceOutputBundleId: outputBundleIdSchema,
    sourceDraftPath: relativePathSchema,
    sourceDraftSha256: sha256Schema,
    businessReviewArtifactId: artifactIdSchema,
    businessReviewSha256: sha256Schema,
    hardValidationArtifactId: artifactIdSchema,
    hardValidationSha256: sha256Schema,
    failedContractItems: z.array(z.enum(['titleRange', 'bodyRange'])).min(1).max(2),
    repairNumber: z.literal(1),
  }).strict(),
]) as z.ZodType<XhsExecutionLineage>

/** Exact control, lineage, input-route, and Skill-source evidence for production packages. */
export const xhsProductionSourceManifestSchema = z.object({
  adapterVersion: z.literal('xhs-production-source-v1'),
  contractSchemaVersion: z.literal(1),
  identity: z.object({
    account: z.enum(['account1', 'account2', 'account3', 'account4']),
    productionMonth: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/),
    productionWeek: z.string().regex(/^第\d{2}周$/),
    note: z.string().regex(/^note00[1-7]$/),
    taskId: nonblankSchema,
    topicId: nonblankSchema,
    noteType: z.enum(['dry-search', 'recommendation', 'hot-traffic']),
  }).strict(),
  productionEntry: xhsProductionSourceIdentitySchema,
  productionBaseline: xhsProductionSourceIdentitySchema,
  sourceTask: xhsProductionSourceIdentitySchema,
  inputs: z.tuple([xhsProductionInputRouteSchema, xhsProductionInputRouteSchema, xhsProductionInputRouteSchema]),
  skillSource: z.object({
    path: relativePathSchema,
    sha256: sha256Schema,
    bytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    version: nonblankSchema.optional(),
    logicalSkillId: nonblankSchema,
    formalName: nonblankSchema,
    account: z.enum(['account1', 'account2', 'account3', 'account4']),
    origin: z.literal('vault-root'),
    source: z.literal('project-agents'),
    provider: z.literal('business-xhs-production-v1'),
    snapshotHash: sha256Schema,
    routeReason: nonblankSchema,
  }).strict(),
  resolvedAt: timestampSchema,
  manifestHash: sha256Schema,
}).strict().superRefine((manifest, ctx) => {
  const { manifestHash, ...base } = manifest
  if (xhsProductionSourceManifestHash(base as unknown as Omit<XhsProductionSourceManifest, 'manifestHash'>) !== manifestHash) ctx.addIssue({ code: 'custom', path: ['manifestHash'], message: 'production source manifest hash does not match fields' })
  if (JSON.stringify(manifest.inputs.map(input => input.role)) !== JSON.stringify(['taskCard', 'writingRule', 'goldenSample'])) {
    ctx.addIssue({ code: 'custom', path: ['inputs'], message: 'production input routes are not in contract order' })
  }
  if (manifest.skillSource.account !== manifest.identity.account) ctx.addIssue({ code: 'custom', path: ['skillSource', 'account'], message: 'production Skill account does not match task identity' })
}) as z.ZodType<XhsProductionSourceManifest>

/** Durable frozen execution-package schema. */
export const businessExecutionPackageSchema = z.object({
  id: packageIdSchema,
  project: z.literal('xhs'),
  jobId: jobIdSchema,
  attemptId: attemptIdSchema,
  workflowVersion: nonblankSchema,
  inputs: z.array(businessExecutionInputSchema).min(1),
  allowedReadRoots: z.array(relativePathSchema),
  allowedReadFiles: z.array(relativePathSchema),
  allowedCapabilities: z.array(nonblankSchema),
  allowedSkills: z.array(nonblankSchema),
  skillSnapshots: z.array(businessSkillSnapshotSchema),
  skillManifestHash: sha256Schema,
  productionSource: xhsProductionSourceManifestSchema.optional(),
  lineage: xhsExecutionLineageSchema.optional(),
  createdAt: timestampSchema,
  manifestHash: sha256Schema,
}).strict().superRefine((executionPackage, ctx) => {
  const paths = executionPackage.inputs.map(input => input.path)
  if (new Set(paths).size !== paths.length) {
    ctx.addIssue({ code: 'custom', path: ['inputs'], message: 'execution package has duplicate input paths' })
  }
  const snapshotIds = executionPackage.skillSnapshots.map(snapshot => snapshot.skillId)
  if (JSON.stringify(snapshotIds) !== JSON.stringify(executionPackage.allowedSkills)) {
    ctx.addIssue({ code: 'custom', path: ['skillSnapshots'], message: 'Skill snapshots do not match the allowed Skill ids' })
  }
  if (executionPackage.productionSource !== undefined) {
    const source = executionPackage.productionSource
    let skillRequirement: ReturnType<typeof resolveXhsExecutionSkillRequirement> | undefined
    try {
      skillRequirement = resolveXhsExecutionSkillRequirement(executionPackage.workflowVersion)
    } catch {
      ctx.addIssue({ code: 'custom', path: ['workflowVersion'], message: 'production workflow has no declared Skill requirement' })
    }
    const sourceInputs = skillRequirement === 'none' ? source.inputs.filter(route => route.role === 'taskCard') : source.inputs
    const routedInputs = sourceInputs.map(route => ({
      role: route.role,
      path: `xhs/${route.path.slice(`${XHS_PROJECT_RELATIVE_PATH}/`.length)}`,
      sha256: route.sha256,
      bytes: route.bytes,
    }))
    const actualInputs = executionPackage.inputs.slice(0, sourceInputs.length).map(input => ({
      role: input.role, path: input.path, sha256: input.sha256, bytes: input.bytes,
    }))
    if (JSON.stringify(routedInputs) !== JSON.stringify(actualInputs)) ctx.addIssue({ code: 'custom', path: ['productionSource', 'inputs'], message: 'production routes do not match frozen package inputs' })
    const skillSnapshot = executionPackage.skillSnapshots[0]
    if (skillRequirement === 'none') {
      if (executionPackage.skillSnapshots.length !== 0 || executionPackage.allowedSkills.length !== 0) {
        ctx.addIssue({ code: 'custom', path: ['skillSnapshots'], message: 'Skill-free production package contains unexpected Skill authority' })
      }
    } else if (skillRequirement === 'required' && (executionPackage.skillSnapshots.length !== 1 || skillSnapshot === undefined
      || skillSnapshot.snapshotHash !== source.skillSource.snapshotHash
      || skillSnapshot.skillId !== source.skillSource.logicalSkillId)) {
      ctx.addIssue({ code: 'custom', path: ['productionSource', 'skillSource'], message: 'Skill-required production package does not match the frozen snapshot' })
    }
  }
  if (executionPackage.lineage?.kind === 'revision') {
    const roles = executionPackage.inputs.map(input => input.role)
    const currentRoles = ['taskCard', 'writingRule', 'goldenSample', 'sourceCandidateDraft', 'review']
    const legacyRoles = ['taskCard', 'writingRule', 'goldenSample', 'firstPassDraft', 'review']
    if (JSON.stringify(roles) !== JSON.stringify(currentRoles) && JSON.stringify(roles) !== JSON.stringify(legacyRoles)) {
      ctx.addIssue({ code: 'custom', path: ['inputs'], message: 'revision package requires its five ordered inputs' })
    }
  }
  if (executionPackage.lineage?.kind === 'retry' && executionPackage.inputs.length !== 3) {
    ctx.addIssue({ code: 'custom', path: ['inputs'], message: 'retry package must not include the failed draft' })
  }
  if (executionPackage.lineage?.kind === 'contract-repair') {
    const roles = executionPackage.inputs.map(input => input.role)
    if (JSON.stringify(roles) !== JSON.stringify(['taskCard', 'sourceCandidateDraft', 'businessPassReview', 'hardContractFailure'])) {
      ctx.addIssue({ code: 'custom', path: ['inputs'], message: 'contract repair package requires its four ordered inputs' })
    }
  }
  if (executionPackage.lineage?.kind === 'length-repair') {
    const roles = executionPackage.inputs.map(input => input.role)
    if (JSON.stringify(roles) !== JSON.stringify(['taskCard', 'sourceCandidateDraft', 'businessPassReview', 'hardContractFailure'])) {
      ctx.addIssue({ code: 'custom', path: ['inputs'], message: 'length repair package requires its four ordered inputs' })
    }
  }
}) as z.ZodType<BusinessExecutionPackage>

/** One immutable file reference inside an XHS output bundle. */
export const businessOutputBundleEntrySchema = z.object({
  name: z.enum(['draft.md', 'draft-metadata.json', 'provenance.json']),
  mediaType: z.enum(['text/markdown', 'application/json']),
  path: relativePathSchema,
  hash: sha256Schema,
  bytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict() as z.ZodType<BusinessOutputBundleEntry>

/** Authoritative three-file XHS output-bundle manifest. */
export const businessOutputBundleSchema = z.object({
  id: outputBundleIdSchema,
  jobId: jobIdSchema,
  attemptId: attemptIdSchema,
  agentRunId: agentRunIdSchema,
  executionPackageId: packageIdSchema,
  action: xhsAgentActionSchema,
  actionPolicyVersion: nonblankSchema,
  project: z.literal('xhs'),
  type: z.literal('intermediate'),
  outputVersion: z.literal(1),
  idempotencyKey: operationKeySchema,
  path: relativePathSchema,
  entries: z.tuple([businessOutputBundleEntrySchema, businessOutputBundleEntrySchema, businessOutputBundleEntrySchema]),
  manifestHash: sha256Schema,
  createdAt: timestampSchema,
}).strict().superRefine((bundle, ctx) => {
  const { manifestHash, ...base } = bundle
  if (xhsOutputBundleManifestHash(base) !== manifestHash) ctx.addIssue({ code: 'custom', path: ['manifestHash'], message: 'output bundle manifest hash does not match fields' })
  const names = bundle.entries.map(entry => entry.name)
  if (JSON.stringify(names) !== JSON.stringify(['draft.md', 'draft-metadata.json', 'provenance.json'])) ctx.addIssue({ code: 'custom', path: ['entries'], message: 'output bundle entries are not in contract order' })
}) as z.ZodType<BusinessOutputBundle>

/** Durable immutable Attempt schema. */
export const businessAttemptSchema = z.object({
  id: attemptIdSchema,
  jobId: jobIdSchema,
  sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  status: z.enum(['pending', 'running', 'interrupted', 'completed', 'failed', 'cancelled']),
  lease: businessExecutionLeaseSchema.nullable(),
  executionPackage: businessExecutionPackageSchema.nullable(),
  agentRuns: z.array(businessAgentRunSchema),
  outputBundle: businessOutputBundleSchema.nullable(),
  createdAt: timestampSchema,
  completedAt: timestampSchema.optional(),
  statusReason: z.string().min(1).optional(),
}).strict().superRefine((attempt, ctx) => {
  const live = attempt.status === 'pending' || attempt.status === 'running'
  if (live && attempt.completedAt !== undefined) {
    ctx.addIssue({ code: 'custom', path: ['completedAt'], message: 'live Attempt cannot have completedAt' })
  }
  if (!live && attempt.completedAt === undefined) {
    ctx.addIssue({ code: 'custom', path: ['completedAt'], message: 'ended Attempt requires completedAt' })
  }
  if (attempt.completedAt !== undefined && attempt.completedAt < attempt.createdAt) {
    ctx.addIssue({ code: 'custom', path: ['completedAt'], message: 'Attempt completedAt precedes createdAt' })
  }
  if (attempt.status === 'pending' && attempt.lease !== null) {
    ctx.addIssue({ code: 'custom', path: ['lease'], message: 'pending Attempt cannot have a lease' })
  }
  if (attempt.status === 'running' && attempt.lease?.status !== 'active') {
    ctx.addIssue({ code: 'custom', path: ['lease'], message: 'running Attempt requires an active lease' })
  }
  if (!live && attempt.lease?.status === 'active') {
    ctx.addIssue({ code: 'custom', path: ['lease'], message: 'ended Attempt cannot retain an active lease' })
  }
  if (attempt.lease !== null && attempt.lease.attemptId !== attempt.id) {
    ctx.addIssue({ code: 'custom', path: ['lease', 'attemptId'], message: 'lease belongs to another Attempt' })
  }
  if (attempt.executionPackage !== null && attempt.executionPackage.attemptId !== attempt.id) {
    ctx.addIssue({ code: 'custom', path: ['executionPackage', 'attemptId'], message: 'package belongs to another Attempt' })
  }
  if (attempt.status !== 'running' && attempt.agentRuns.some(run => run.status === 'running')) {
    ctx.addIssue({ code: 'custom', path: ['agentRuns'], message: 'inactive Attempt cannot retain a running Agent Run' })
  }
  attempt.agentRuns.forEach((run, index) => {
    if (run.jobId !== attempt.jobId || run.attemptId !== attempt.id) {
      ctx.addIssue({ code: 'custom', path: ['agentRuns', index], message: 'Agent Run belongs to another Job or Attempt' })
    }
    if (attempt.executionPackage !== null && run.executionPackageId !== attempt.executionPackage.id) {
      ctx.addIssue({ code: 'custom', path: ['agentRuns', index, 'executionPackageId'], message: 'Agent Run names another execution package' })
    }
  })
  if (attempt.outputBundle !== null) {
    if (attempt.outputBundle.jobId !== attempt.jobId || attempt.outputBundle.attemptId !== attempt.id) ctx.addIssue({ code: 'custom', path: ['outputBundle'], message: 'output bundle belongs to another Job or Attempt' })
    const run = attempt.agentRuns.find(item => item.id === attempt.outputBundle?.agentRunId)
    if (run?.outputBundleId !== attempt.outputBundle.id || run.status !== 'completed') ctx.addIssue({ code: 'custom', path: ['outputBundle'], message: 'output bundle has no matching completed Agent Run' })
    if (attempt.executionPackage?.id !== attempt.outputBundle.executionPackageId) ctx.addIssue({ code: 'custom', path: ['outputBundle', 'executionPackageId'], message: 'output bundle names another execution package' })
  }
}) as z.ZodType<BusinessAttempt>

/** Restricted Agent provenance attached to its output Artifact. */
export const businessAgentArtifactProvenanceSchema = z.object({
  kind: z.literal('restricted-agent'),
  agentRunId: agentRunIdSchema,
  executionPackageId: packageIdSchema,
  executionPackageManifestHash: sha256Schema,
  skillManifestHash: sha256Schema,
  model: businessAgentModelSchema,
}).strict() as z.ZodType<BusinessAgentArtifactProvenance>

/** Durable immutable Artifact-reference schema. */
export const businessArtifactSchema = z.object({
  artifactId: artifactIdSchema,
  jobId: jobIdSchema,
  attemptId: attemptIdSchema,
  type: z.enum(['input', 'intermediate', 'validation', 'review', 'final']),
  revision: revisionSchema,
  path: z.string().min(1),
  hash: sha256Schema,
  bytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  createdAt: timestampSchema,
  provenance: businessAgentArtifactProvenanceSchema.optional(),
}).strict() as z.ZodType<BusinessArtifact>

/** Durable Job-operation idempotency receipt schema. */
export const businessOperationReceiptSchema = z.object({
  key: operationKeySchema,
  kind: z.enum(['transition', 'create-attempt', 'acquire-lease', 'renew-lease', 'release-lease', 'create-package', 'complete-attempt', 'commit-artifact', 'run-agent']),
  fingerprint: sha256Schema,
  revision: revisionSchema,
  resultId: z.string().min(1).optional(),
  createdAt: timestampSchema,
}).strict() as z.ZodType<BusinessOperationReceipt>

const singleJobIdsSchema = z.tuple([jobIdSchema])
const quadJobIdsSchema = z.tuple([jobIdSchema, jobIdSchema, jobIdSchema, jobIdSchema])
const batchJobIdsSchema = z.union([singleJobIdsSchema, quadJobIdsSchema])
const singleInputsSchema = z.tuple([businessInputReferenceSchema])
const quadInputsSchema = z.tuple([
  businessInputReferenceSchema,
  businessInputReferenceSchema,
  businessInputReferenceSchema,
  businessInputReferenceSchema,
])
const batchInputsSchema = z.union([singleInputsSchema, quadInputsSchema])

/** Whether two ordered opaque-id lists contain the same values. */
function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

/** Durable Batch schema, including exact participation and interrupted-creation inputs. */
export const businessBatchSchema = z.object({
  id: batchIdSchema,
  project: z.literal('xhs'),
  type: z.literal('xhs-body'),
  mode: z.enum(['single', 'quad', 'legacy-fixed4']),
  status: z.enum(['creating', 'ready']),
  jobIds: batchJobIdsSchema,
  participatingJobIds: batchJobIdsSchema,
  inputs: batchInputsSchema,
  revision: revisionSchema,
  createKey: operationKeySchema,
  createFingerprint: sha256Schema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).strict().superRefine((batch, ctx) => {
  if (new Set(batch.jobIds).size !== batch.jobIds.length) ctx.addIssue({ code: 'custom', path: ['jobIds'], message: 'Batch requires distinct Job ids' })
  if (new Set(batch.participatingJobIds).size !== batch.participatingJobIds.length) {
    ctx.addIssue({ code: 'custom', path: ['participatingJobIds'], message: 'Batch requires distinct participating Job ids' })
  }
  if (batch.inputs.length !== batch.jobIds.length) ctx.addIssue({ code: 'custom', path: ['inputs'], message: 'Batch requires one input per Job id' })
  if (!batch.participatingJobIds.every(jobId => batch.jobIds.includes(jobId))) {
    ctx.addIssue({ code: 'custom', path: ['participatingJobIds'], message: 'participating Job ids must belong to the Batch' })
  }
  if (batch.mode === 'single' && (batch.jobIds.length !== 1 || !sameIds(batch.participatingJobIds, batch.jobIds))) {
    ctx.addIssue({ code: 'custom', path: ['mode'], message: 'single Batch requires exactly one participating Job' })
  }
  if (batch.mode === 'quad' && (batch.jobIds.length !== 4 || !sameIds(batch.participatingJobIds, batch.jobIds))) {
    ctx.addIssue({ code: 'custom', path: ['mode'], message: 'quad Batch requires exactly four participating Jobs' })
  }
  if (batch.mode === 'legacy-fixed4' && (batch.jobIds.length !== 4 || ![1, 4].includes(batch.participatingJobIds.length))) {
    ctx.addIssue({ code: 'custom', path: ['mode'], message: 'legacy-fixed4 Batch requires four stored Jobs and one or four known participants' })
  }
  if (batch.updatedAt < batch.createdAt) ctx.addIssue({ code: 'custom', path: ['updatedAt'], message: 'Batch updatedAt precedes createdAt' })
  if (batch.status === 'creating' && batch.revision !== 0) ctx.addIssue({ code: 'custom', path: ['revision'], message: 'creating Batch must remain at revision 0' })
  if (batch.status === 'ready' && batch.revision < 1) ctx.addIssue({ code: 'custom', path: ['revision'], message: 'ready Batch requires a committed revision' })
}) as z.ZodType<BusinessBatch>

/** Durable Job schema and its internal relationship checks. */
export const businessJobSchema = z.object({
  id: jobIdSchema,
  batchId: batchIdSchema,
  project: z.literal('xhs'),
  type: z.literal('xhs-body'),
  status: z.enum(['draft', 'ready', 'running', 'interrupted', 'completed', 'failed', 'cancelled']),
  revision: revisionSchema,
  currentAttempt: attemptIdSchema.nullable(),
  input: businessInputReferenceSchema,
  attempts: z.array(businessAttemptSchema),
  artifactRefs: z.array(businessArtifactSchema),
  operations: z.array(businessOperationReceiptSchema),
  statusReason: z.string().min(1).optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).strict().superRefine((job, ctx) => {
  if (job.updatedAt < job.createdAt) ctx.addIssue({ code: 'custom', path: ['updatedAt'], message: 'Job updatedAt precedes createdAt' })
  const attemptIds = new Set<string>()
  const sequences = new Set<number>()
  let active: BusinessAttempt | undefined
  job.attempts.forEach((attempt, index) => {
    if (attempt.jobId !== job.id) ctx.addIssue({ code: 'custom', path: ['attempts', index, 'jobId'], message: 'Attempt belongs to another Job' })
    if (attemptIds.has(attempt.id)) ctx.addIssue({ code: 'custom', path: ['attempts', index, 'id'], message: 'duplicate Attempt id' })
    if (sequences.has(attempt.sequence)) ctx.addIssue({ code: 'custom', path: ['attempts', index, 'sequence'], message: 'duplicate Attempt sequence' })
    attemptIds.add(attempt.id)
    sequences.add(attempt.sequence)
    if (attempt.status === 'pending' || attempt.status === 'running') {
      if (active !== undefined) ctx.addIssue({ code: 'custom', path: ['attempts', index, 'status'], message: 'multiple active Attempts' })
      active = attempt
    }
    if (attempt.executionPackage !== null && attempt.executionPackage.jobId !== job.id) {
      ctx.addIssue({ code: 'custom', path: ['attempts', index, 'executionPackage'], message: 'package belongs to another Job or Project' })
    }
    const runIds = new Set<string>()
    const runKeys = new Set<string>()
    attempt.agentRuns.forEach((run, runIndex) => {
      if (runIds.has(run.id)) ctx.addIssue({ code: 'custom', path: ['attempts', index, 'agentRuns', runIndex, 'id'], message: 'duplicate Agent Run id' })
      if (runKeys.has(run.idempotencyKey)) ctx.addIssue({ code: 'custom', path: ['attempts', index, 'agentRuns', runIndex, 'idempotencyKey'], message: 'duplicate Agent Run idempotency key' })
      runIds.add(run.id)
      runKeys.add(run.idempotencyKey)
    })
  })
  if (job.currentAttempt === null) {
    if (active !== undefined) ctx.addIssue({ code: 'custom', path: ['currentAttempt'], message: 'Job omits its active Attempt' })
  } else if (active?.id !== job.currentAttempt) {
    ctx.addIssue({ code: 'custom', path: ['currentAttempt'], message: 'Job currentAttempt is not active' })
  }
  if (job.status === 'running' && active?.status !== 'running') ctx.addIssue({ code: 'custom', path: ['status'], message: 'running Job requires a running Attempt' })
  if (job.status === 'ready' && active !== undefined && active.status !== 'pending') ctx.addIssue({ code: 'custom', path: ['status'], message: 'ready Job may retain only a pending Attempt' })
  if (job.status !== 'ready' && job.status !== 'running' && active !== undefined) ctx.addIssue({ code: 'custom', path: ['currentAttempt'], message: 'inactive Job cannot retain an active Attempt' })

  const artifactIds = new Set<string>()
  const artifactPaths = new Set<string>()
  job.artifactRefs.forEach((artifact, index) => {
    if (artifact.jobId !== job.id) ctx.addIssue({ code: 'custom', path: ['artifactRefs', index, 'jobId'], message: 'Artifact belongs to another Job' })
    if (!attemptIds.has(artifact.attemptId)) ctx.addIssue({ code: 'custom', path: ['artifactRefs', index, 'attemptId'], message: 'Artifact names an unknown Attempt' })
    if (artifactIds.has(artifact.artifactId)) ctx.addIssue({ code: 'custom', path: ['artifactRefs', index, 'artifactId'], message: 'duplicate Artifact id' })
    if (artifactPaths.has(artifact.path)) ctx.addIssue({ code: 'custom', path: ['artifactRefs', index, 'path'], message: 'duplicate Artifact path' })
    artifactIds.add(artifact.artifactId)
    artifactPaths.add(artifact.path)
    if (artifact.provenance !== undefined) {
      const attempt = job.attempts.find(item => item.id === artifact.attemptId)
      const run = attempt?.agentRuns.find(item => item.id === artifact.provenance?.agentRunId)
      if (run?.artifactId !== artifact.artifactId) ctx.addIssue({ code: 'custom', path: ['artifactRefs', index, 'provenance'], message: 'Artifact provenance has no matching completed Agent Run' })
    }
  })
  const operationKeys = new Set<string>()
  job.operations.forEach((operation, index) => {
    if (operationKeys.has(operation.key)) ctx.addIssue({ code: 'custom', path: ['operations', index, 'key'], message: 'duplicate operation key' })
    operationKeys.add(operation.key)
  })
}) as z.ZodType<BusinessJob>

/** Independent versioned namespace for Business Layer V0.1. */
export const businessWorkbenchDomainSpec = defineDomain({
  name: 'business_workbench',
  version: BUSINESS_WORKBENCH_SCHEMA_VERSION,
  tables: {
    batches: domainTable<BatchId, BusinessBatch>(businessBatchSchema),
    jobs: domainTable<JobId, BusinessJob>(businessJobSchema),
  },
})
