import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { LlmAdapter, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import {
  assertXhsContractRepairAvailable,
  assertXhsRetryAvailable,
  assertXhsRetrySource,
  assertXhsReviewSource,
  assertXhsBodyRevisionExecutionPackage,
  businessExecutionPackageSchema,
  buildXhsReviewArtifactDocument,
  BusinessWorkbenchError,
  contractRepairPreflight,
  deriveXhsContractRepairScope,
  nextXhsRevisionNumber,
  parseXhsReviewArtifactDocument,
  XHS_BODY_PREPARE_CONTRACT,
  XHS_BODY_PREPARE_SKILLS,
  type BusinessJob,
  type BusinessOutputBundle,
  type BusinessWorkbenchService,
  type XhsReviewCandidateDescriptor,
  type XhsHardValidationResult,
  xhsReviewCandidate,
  xhsContractRepairConsumedAllowance,
} from '../src/index.ts'
import { setupHarness, singleBatchRequest } from './helpers.ts'

const canonicalDraft = [
  '# 合成标题', '', '标题字符数：4 + 正文字符数：8', '', '合成正文内容。', '',
  '## 置顶评论', '', '## 非置顶评论', '', '## 关联话题', '',
].join('\n')

class DraftAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  constructor(readonly output: string) { super() }
  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: model,
      reasoning: { efforts: [{ id: ReasoningEffortId('off'), name: 'Off' }], defaultEffort: ReasoningEffortId('off') } })
  }
  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: this.output }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: this.output } }
    yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

interface Fixture {
  readonly service: BusinessWorkbenchService
  readonly root: string
  readonly adapter: DraftAdapter
  dispose(): Promise<void>
}

const fixtures: Fixture[] = []

afterEach(async () => Promise.all(fixtures.splice(0).map(item => item.dispose())))

async function fixture(output = canonicalDraft): Promise<Fixture> {
  const harness = await setupHarness(undefined, 60_000, {
    provider: 'revision-fixture', model: 'revision-fixture', reasoningEffort: 'off', maxTokens: 512, timeoutMs: 2_000,
  })
  const { ctx, root } = harness
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { persona: 'fixture' })
  await ctx.plugin(ToolRuntime, { mode: 'code' })
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(SkillRegistry)
  const adapter = new DraftAdapter(output)
  ctx.llm.registerAdapter(['revision-fixture'], adapter)
  ctx.skills.register({ name: XHS_BODY_PREPARE_SKILLS[0], description: 'fixture S3', source: 'runtime', content: 'Use only frozen inputs.' })
  const result = { service: ctx.businessWorkbench, root, adapter, async dispose() { await ctx.fiber.dispose(); await harness.dispose() } }
  fixtures.push(result)
  return result
}

async function sourceJob(current: Fixture): Promise<BusinessJob> {
  const task = [
    '> [!note]- 机器执行参数', '>', '> - task_id：REV-001', '> - topic_id：REV-TOPIC', '> - status：已确认',
    '> - note_type：干货搜索型（dry_search）', '> - account：账号1', '> - production_month：2026-08',
    '> - production_week：第02周', '> - note：note001', '> - SEO高亮词：合成', '> - compiler_version：XHS-PROD-1.3', '>',
    '> **标题：** 干货搜索型｜1—100全字符', '>', '> **正文：** 1—2000全字符', '>',
    '> **评论：** 置顶0条 + 非置顶0条', '>', '> **关键词执行**', '>', '> - 主词：合成（标题×1）', '>',
    '> **正文结构**', '>', '> - 合成正文', '>', '> **0个关联话题**', '>',
    '> **转化模式**', '>', '> - 产品模块：合成模块', '',
  ].join('\n')
  await writeFile(join(current.root, 'business-inputs/xhs-source/current-task.md'), task)
  const batch = await current.service.createBatch(singleBatchRequest(`source-${randomUUID()}`))
  let job = current.service.listJobs(batch.id)[0]!
  job = await current.service.transitionJob({ jobId: job.id, expectedRevision: job.revision, idempotencyKey: 'ready', status: 'ready' })
  job = await current.service.createAttempt({ jobId: job.id, expectedRevision: job.revision, idempotencyKey: 'attempt' })
  job = await current.service.acquireExecutionLease({ jobId: job.id, attemptId: job.currentAttempt!, expectedRevision: job.revision, idempotencyKey: 'lease', ownerId: 'source-owner' })
  const executionPackage = await current.service.createExecutionPackage({
    jobId: job.id, attemptId: job.currentAttempt!, expectedRevision: job.revision, idempotencyKey: 'package', ownerId: 'source-owner',
    workflowVersion: XHS_BODY_PREPARE_CONTRACT.workflowVersion,
    inputs: [
      { role: 'taskCard', path: 'xhs/current-task.md', required: true },
      { role: 'writingRule', path: 'xhs/rules/writing.md', required: true },
      { role: 'goldenSample', path: 'xhs/rules/golden-sample.md', required: true },
    ],
    allowedReadRoots: [], allowedReadFiles: ['xhs/current-task.md', 'xhs/rules/golden-sample.md', 'xhs/rules/writing.md'],
    allowedCapabilities: ['restricted-agent'], allowedSkills: [XHS_BODY_PREPARE_SKILLS[0]],
  })
  await current.service.runRestrictedAgent({ jobId: job.id, attemptId: job.currentAttempt!, executionPackageId: executionPackage.id,
    ownerId: 'source-owner', action: 'xhs-body-prepare-v0', idempotencyKey: `prepare:${job.currentAttempt}`,
    xhs: { mode: 'fixture', account: 'account1', noteType: 'dry-search' } })
  return current.service.finalizeXhsOutputBundle(job.id, job.currentAttempt!)
}

async function revisionTarget(
  service: BusinessWorkbenchService,
  input?: { readonly reference: string; readonly sha256: string },
): Promise<BusinessJob> {
  const request = singleBatchRequest(`revision-${randomUUID()}`)
  const batch = await service.createBatch(input === undefined ? request : { ...request, inputs: [input] })
  let job = service.listJobs(batch.id)[0]!
  job = await service.transitionJob({ jobId: job.id, expectedRevision: job.revision, idempotencyKey: 'ready', status: 'ready' })
  return service.createAttempt({ jobId: job.id, expectedRevision: job.revision, idempotencyKey: 'attempt' })
}

function reviewDocument(
  bundle: BusinessOutputBundle,
  candidate: XhsReviewCandidateDescriptor,
  reviewResult: 'PASS' | 'MODIFY' | 'FAIL' = 'MODIFY',
) {
  const draft = bundle.entries.find(entry => entry.name === 'draft.md')!
  return buildXhsReviewArtifactDocument({
    review_version: 2,
    project: 'xhs',
    source_job_id: bundle.jobId,
    source_attempt_id: bundle.attemptId,
    source_artifact_id: bundle.id,
    source_artifact_path: draft.path,
    source_draft_sha256: draft.hash,
    source_candidate_type: candidate.candidateType,
    ...(candidate.revisionNumber === undefined ? {} : { source_revision_number: candidate.revisionNumber }),
    ...(candidate.retryNumber === undefined ? {} : { source_retry_number: candidate.retryNumber }),
    review_result: reviewResult,
    required_changes: reviewResult === 'MODIFY' ? ['change'] : [],
    quality_suggestions: [],
    preserve: [],
    reviewer_type: 'human',
    reviewed_at: 1,
    provenance: { source_output_bundle_id: bundle.id, source: 'authoritative-intermediate-output-bundle' },
  })
}

function revisionLineage(bundle: BusinessOutputBundle, revisionNumber: 1 | 2) {
  const draft = bundle.entries[0]
  return {
    kind: 'revision' as const,
    sourceJobId: bundle.jobId,
    sourceAttemptId: bundle.attemptId,
    sourceOutputBundleId: bundle.id,
    sourceDraftPath: draft.path,
    sourceDraftSha256: draft.hash,
    reviewArtifactId: `artifact_${'a'.repeat(64)}` as never,
    reviewSha256: 'b'.repeat(64),
    revisionNumber,
  }
}

function retryLineage(bundle: BusinessOutputBundle) {
  return {
    kind: 'retry' as const,
    retryOfJobId: bundle.jobId,
    retryOfAttemptId: bundle.attemptId,
    retryOfOutputBundleId: bundle.id,
    retryReason: 'FORMAT_CONTRACT_FAIL' as const,
    retryNumber: 1 as const,
  }
}

function hardFailure(overrides: Record<string, unknown> = {}): XhsHardValidationResult {
  return {
    version: 4, validator: 'xhs-hard-contract-l1-v3', status: 'FAIL', failureClass: 'HARD_CONTRACT_FAIL',
    format: { contract: 'xhs-draft-markdown-v1', status: 'PASS', issues: [] }, hardContractStatus: 'FAIL',
    projection: {},
    facts: { draftSha256: 'a'.repeat(64), actualTitleCharacters: 17, actualBodyCharacters: 848,
      modelDeclaredTitleCharacters: 17, modelDeclaredBodyCharacters: 848 },
    checks: {
      titleRange: { status: 'FAIL', actual: 17, requiredMin: 18, requiredMax: 20 },
      bodyRange: { status: 'FAIL', actual: 848, requiredMin: 700, requiredMax: 800 },
      pinnedComments: { status: 'PASS', actual: 1, required: 1 },
      unpinnedComments: { status: 'PASS', actual: 2, required: 2 },
      topics: { status: 'PASS', actual: 10, required: 10, expected_topics: [], actual_topics: [],
        missing_topics: [], unexpected_topics: [], duplicate_topics: [], order_matches: true },
    },
    keywordEvidence: [], deferredChecks: [], ...overrides,
  } as unknown as XhsHardValidationResult
}

describe('XHS Revision and Retry V0.1', () => {
  it('persists and reads a MODIFY Review without changing First Pass bytes', async () => {
    const current = await fixture()
    const source = await sourceJob(current)
    const sourceAttempt = source.attempts[0]!
    const sourceHash = sourceAttempt.outputBundle!.entries[0].hash
    const before = await current.service.getOutputBundle(sourceAttempt.outputBundle!.id)
    const target = await revisionTarget(current.service)
    const review = await current.service.createXhsReviewArtifact({
      jobId: target.id, attemptId: target.currentAttempt!, expectedRevision: target.revision, idempotencyKey: 'review',
      sourceJobId: source.id, sourceAttemptId: sourceAttempt.id, sourceDraftSha256: sourceHash,
      reviewResult: 'MODIFY', requiredChanges: ['只修改明确问题'], qualitySuggestions: ['自然化过渡'],
      preserve: ['保留核心判断'], reviewerType: 'human', reviewedAt: Date.now(),
    })
    expect(review.review).toMatchObject({
      review_version: 2,
      source_artifact_id: sourceAttempt.outputBundle!.id,
      source_candidate_type: 'first_pass',
    })
    expect(parseXhsReviewArtifactDocument((await current.service.getArtifact(review.artifact.artifactId)).content)).toEqual(review.review)
    await expect(
      current.service.preflightXhsRevision(target.id, target.currentAttempt!, review.artifact.artifactId),
    ).resolves.toMatchObject({ status: 'REVISION_READY', sourceJobId: source.id, sourceDraftSha256: sourceHash })
    const after = await current.service.getOutputBundle(sourceAttempt.outputBundle!.id)
    expect(after.files['draft.md']).toBe(before.files['draft.md'])
    expect(after.bundle.entries[0].hash).toBe(sourceHash)
  })

  it('blocks a changed source hash, a wrong Job relationship, and a missing Review', async () => {
    const current = await fixture()
    const source = await sourceJob(current)
    const sourceAttempt = source.attempts[0]!
    const target = await revisionTarget(current.service)
    await expect(current.service.createXhsReviewArtifact({
      jobId: target.id, attemptId: target.currentAttempt!, expectedRevision: target.revision, idempotencyKey: 'bad-hash',
      sourceJobId: source.id, sourceAttemptId: sourceAttempt.id, sourceDraftSha256: '0'.repeat(64), reviewResult: 'MODIFY',
      requiredChanges: ['change'], qualitySuggestions: [], preserve: [], reviewerType: 'human', reviewedAt: Date.now(),
    })).rejects.toMatchObject({ code: 'XHS_REVIEW_INVALID' })
    await expect(current.service.preflightXhsRevision(target.id, target.currentAttempt!, 'artifact_'.concat('0'.repeat(64)) as never))
      .rejects.toMatchObject({ code: 'XHS_REVIEW_INVALID' })
    const wrongBatch = await current.service.createBatch({ ...singleBatchRequest(`wrong-${randomUUID()}`), inputs: [{ reference: 'other.md', sha256: 'f'.repeat(64) }] })
    let wrong = current.service.listJobs(wrongBatch.id)[0]!
    wrong = await current.service.transitionJob({ jobId: wrong.id, expectedRevision: wrong.revision, idempotencyKey: 'ready', status: 'ready' })
    wrong = await current.service.createAttempt({ jobId: wrong.id, expectedRevision: wrong.revision, idempotencyKey: 'attempt' })
    await expect(current.service.createXhsReviewArtifact({
      jobId: wrong.id, attemptId: wrong.currentAttempt!, expectedRevision: wrong.revision, idempotencyKey: 'wrong-job',
      sourceJobId: source.id, sourceAttemptId: sourceAttempt.id, sourceDraftSha256: sourceAttempt.outputBundle!.entries[0].hash,
      reviewResult: 'MODIFY', requiredChanges: ['change'], qualitySuggestions: [], preserve: [], reviewerType: 'human', reviewedAt: Date.now(),
    })).rejects.toMatchObject({ code: 'XHS_REVIEW_INVALID' })
  })

  it('blocks a structurally incomplete candidate before persisting a Review', async () => {
    const current = await fixture('# only title')
    const source = await sourceJob(current)
    const sourceAttempt = source.attempts[0]!
    const target = await revisionTarget(current.service)
    await expect(current.service.createXhsReviewArtifact({
      jobId: target.id, attemptId: target.currentAttempt!, expectedRevision: target.revision, idempotencyKey: 'structural-review',
      sourceJobId: source.id, sourceAttemptId: sourceAttempt.id, sourceDraftSha256: sourceAttempt.outputBundle!.entries[0].hash,
      reviewResult: 'MODIFY', requiredChanges: ['change'], qualitySuggestions: [], preserve: [], reviewerType: 'human', reviewedAt: 1,
    })).rejects.toMatchObject({ code: 'XHS_REVIEW_INVALID' })
    expect(current.service.getJob(target.id)!.artifactRefs).toEqual([])
  })

  it.each(['PASS', 'FAIL'] as const)('requires MODIFY rather than %s before a Revision', async (reviewResult) => {
    const current = await fixture()
    const source = await sourceJob(current)
    const sourceAttempt = source.attempts[0]!
    const target = await revisionTarget(current.service)
    const review = await current.service.createXhsReviewArtifact({
      jobId: target.id, attemptId: target.currentAttempt!, expectedRevision: target.revision, idempotencyKey: `review-${reviewResult}`,
      sourceJobId: source.id, sourceAttemptId: sourceAttempt.id, sourceDraftSha256: sourceAttempt.outputBundle!.entries[0].hash,
      reviewResult, requiredChanges: [], qualitySuggestions: [], preserve: [], reviewerType: 'human', reviewedAt: 1,
    })
    await expect(current.service.preflightXhsRevision(target.id, target.currentAttempt!, review.artifact.artifactId))
      .rejects.toMatchObject({ code: 'XHS_REVIEW_INVALID' })
  })

  it.each([
    ['Revision 1', { candidateType: 'revision', revisionNumber: 1 }],
    ['Retry 1', { candidateType: 'retry', retryNumber: 1 }],
  ] as const)('accepts a version-2 Review source for a complete %s candidate', async (_label, candidate) => {
    const current = await fixture()
    const source = await sourceJob(current)
    const bundle = source.attempts[0]!.outputBundle!
    const built = reviewDocument(bundle, candidate)
    expect(() => { assertXhsReviewSource(built.document, bundle, bundle.entries[0].hash, candidate) }).not.toThrow()
  })

  it('rejects Review metadata that claims another candidate class', async () => {
    const current = await fixture()
    const source = await sourceJob(current)
    const bundle = source.attempts[0]!.outputBundle!
    const built = reviewDocument(bundle, { candidateType: 'revision', revisionNumber: 1 })
    expect(() => {
      assertXhsReviewSource(built.document, bundle, bundle.entries[0].hash, { candidateType: 'retry', retryNumber: 1 })
    }).toThrow(BusinessWorkbenchError)
  })

  it.each([
    ['First Pass', { candidateType: 'first_pass' }, 1],
    ['Retry 1', { candidateType: 'retry', retryNumber: 1 }, 1],
    ['Revision 1', { candidateType: 'revision', revisionNumber: 1 }, 2],
  ] as const)('derives %s review as Revision %s', (_label, candidate, expected) => {
    expect(nextXhsRevisionNumber(candidate)).toBe(expected)
  })

  it('blocks another revision after Revision 2', () => {
    expect(() => nextXhsRevisionNumber({ candidateType: 'revision', revisionNumber: 2 }))
      .toThrow(expect.objectContaining({ code: 'MAX_REVISION_REACHED' }))
  })

  it('derives candidate metadata only from the immediate execution lineage', async () => {
    const current = await fixture()
    const source = await sourceJob(current)
    const bundle = source.attempts[0]!.outputBundle!
    expect(xhsReviewCandidate(undefined)).toEqual({ candidateType: 'first_pass' })
    expect(xhsReviewCandidate(revisionLineage(bundle, 1))).toEqual({ candidateType: 'revision', revisionNumber: 1 })
    expect(xhsReviewCandidate(revisionLineage(bundle, 2))).toEqual({ candidateType: 'revision', revisionNumber: 2 })
    expect(xhsReviewCandidate(retryLineage(bundle))).toEqual({ candidateType: 'retry', retryNumber: 1 })
  })

  it('keeps Revision 2 directly linked to Revision 1 and its Review', async () => {
    const current = await fixture()
    const firstPass = await sourceJob(current)
    const firstBundle = firstPass.attempts[0]!.outputBundle!
    const revision1 = revisionLineage(firstBundle, 1)
    const revision1Bundle = { ...firstBundle, jobId: randomUUID() as never, attemptId: randomUUID() as never }
    const revision2 = {
      ...revisionLineage(revision1Bundle, 2),
      reviewArtifactId: `artifact_${'c'.repeat(64)}` as never,
    }
    expect(revision2).toMatchObject({
      revisionNumber: 2,
      sourceJobId: revision1Bundle.jobId,
      sourceAttemptId: revision1Bundle.attemptId,
    })
    expect(revision1).toMatchObject({
      revisionNumber: 1,
      sourceJobId: firstBundle.jobId,
      sourceAttemptId: firstBundle.attemptId,
    })
  })

  it('keeps a Retry-based Revision linked to Retry 1 and the original failed Attempt', async () => {
    const current = await fixture('# only title')
    const failed = await sourceJob(current)
    const failedBundle = failed.attempts[0]!.outputBundle!
    const retry = retryLineage(failedBundle)
    const retryBundle = { ...failedBundle, jobId: randomUUID() as never, attemptId: randomUUID() as never }
    const revision = revisionLineage(retryBundle, 1)
    expect(revision).toMatchObject({ sourceJobId: retryBundle.jobId, sourceAttemptId: retryBundle.attemptId })
    expect(retry).toMatchObject({ retryOfJobId: failed.id, retryOfAttemptId: failed.attempts[0]!.id, retryNumber: 1 })
  })

  it.each([
    ['cross-account', { reference: 'task-card-1.md', sha256: 'f'.repeat(64) }],
    ['cross-task', { reference: 'another-task-card.md', sha256: 'e'.repeat(64) }],
  ] as const)('blocks a %s Review target', async (_label, input) => {
    const current = await fixture()
    const source = await sourceJob(current)
    const sourceAttempt = source.attempts[0]!
    const target = await revisionTarget(current.service, input)
    await expect(current.service.createXhsReviewArtifact({
      jobId: target.id, attemptId: target.currentAttempt!, expectedRevision: target.revision, idempotencyKey: `wrong-${_label}`,
      sourceJobId: source.id, sourceAttemptId: sourceAttempt.id, sourceDraftSha256: sourceAttempt.outputBundle!.entries[0].hash,
      reviewResult: 'MODIFY', requiredChanges: ['change'], qualitySuggestions: [], preserve: [], reviewerType: 'human', reviewedAt: 1,
    })).rejects.toMatchObject({ code: 'XHS_REVIEW_INVALID' })
  })

  it('classifies structural failure as retryable but rejects ordinary hard-contract failure', async () => {
    const malformed = await fixture('# only title')
    const failed = await sourceJob(malformed)
    expect(failed.status).toBe('failed')
    await expect(malformed.service.preflightXhsRetry(failed.id, failed.attempts[0]!.id)).resolves.toMatchObject({
      status: 'RETRY_READY', retryReason: 'REQUIRED_BODY_MISSING',
    })
    const ordinary = await fixture(canonicalDraft)
    const completed = await sourceJob(ordinary)
    expect(completed.status).toBe('completed')
    await expect(ordinary.service.preflightXhsRetry(completed.id, completed.attempts[0]!.id)).rejects.toMatchObject({ code: 'XHS_RETRY_NOT_ALLOWED' })
  })

  it('enforces one Retry and hashes Review provenance deterministically', () => {
    expect(() => { assertXhsRetryAvailable(0) }).not.toThrow()
    expect(() => { assertXhsRetryAvailable(1) }).toThrow(BusinessWorkbenchError)
    const source = {
      review_version: 1 as const, project: 'xhs' as const, source_job_id: randomUUID() as never,
      source_attempt_id: randomUUID() as never, source_draft_artifact: 'draft.md', source_draft_sha256: 'a'.repeat(64),
      review_result: 'MODIFY' as const, required_changes: ['change'], quality_suggestions: ['suggestion'], preserve: ['preserve'],
      reviewer_type: 'external_business_ai' as const, reviewed_at: 1,
      provenance: { source_output_bundle_id: `output_bundle_${'b'.repeat(64)}` as never, source: 'authoritative-intermediate-output-bundle' as const },
    }
    const first = buildXhsReviewArtifactDocument(source)
    const second = buildXhsReviewArtifactDocument(source)
    expect(first.document.review_sha256).toBe(second.document.review_sha256)
    expect(first.content).toBe(second.content)
  })

  it('reads a version-1 Review without migration and confines it to First Pass', async () => {
    const current = await fixture()
    const source = await sourceJob(current)
    const bundle = source.attempts[0]!.outputBundle!
    const draft = bundle.entries[0]
    const built = buildXhsReviewArtifactDocument({
      review_version: 1, project: 'xhs', source_job_id: bundle.jobId, source_attempt_id: bundle.attemptId,
      source_draft_artifact: draft.path, source_draft_sha256: draft.hash, review_result: 'MODIFY',
      required_changes: ['change'], quality_suggestions: [], preserve: [], reviewer_type: 'human', reviewed_at: 1,
      provenance: { source_output_bundle_id: bundle.id, source: 'authoritative-intermediate-output-bundle' },
    })
    expect(parseXhsReviewArtifactDocument(built.content)).toEqual(built.document)
    expect(() => { assertXhsReviewSource(built.document, bundle, draft.hash, { candidateType: 'first_pass' }) }).not.toThrow()
    expect(() => {
      assertXhsReviewSource(built.document, bundle, draft.hash, { candidateType: 'revision', revisionNumber: 1 })
    }).toThrow(BusinessWorkbenchError)
  })

  it('reads a historical Revision-1 package without rewriting its input role', async () => {
    const current = await fixture()
    const source = await sourceJob(current)
    const attempt = source.attempts[0]!
    const sourcePackage = attempt.executionPackage!
    const draft = attempt.outputBundle!.entries[0]
    const legacy = {
      ...sourcePackage,
      workflowVersion: 'xhs-body-revise-v0',
      inputs: [
        ...sourcePackage.inputs,
        { role: 'firstPassDraft', path: `business-artifacts/${draft.path}`, required: true, present: true, sha256: draft.hash, bytes: draft.bytes },
        { role: 'review', path: 'business-artifacts/review.json', required: true, present: true, sha256: 'c'.repeat(64), bytes: 1 },
      ],
      allowedReadFiles: [
        ...sourcePackage.allowedReadFiles,
        `business-artifacts/${draft.path}`,
        'business-artifacts/review.json',
      ].toSorted(),
      lineage: revisionLineage(attempt.outputBundle!, 1),
    }
    const parsed = businessExecutionPackageSchema.parse(legacy)
    expect(parsed.lineage).toMatchObject({ kind: 'revision', revisionNumber: 1 })
    expect(parsed.inputs.some(input => input.role === 'firstPassDraft')).toBe(true)
    expect(() => { assertXhsBodyRevisionExecutionPackage(parsed) }).not.toThrow()
    const currentPackage = {
      ...legacy,
      inputs: legacy.inputs.map(input => input.role === 'firstPassDraft'
        ? { ...input, role: 'sourceCandidateDraft' }
        : input),
    }
    expect(() => { assertXhsBodyRevisionExecutionPackage(businessExecutionPackageSchema.parse(currentPackage)) }).not.toThrow()
  })

  it.each([
    ['Revision cannot become Retry', 'revision'],
    ['Retry cannot become Retry 2', 'retry'],
  ] as const)('%s because retry preflight admits only an original execution', async (_label, lineageKind) => {
    const current = await fixture()
    const source = await sourceJob(current)
    const bundle = source.attempts[0]!.outputBundle!
    const lineage = lineageKind === 'revision' ? revisionLineage(bundle, 1) : retryLineage(bundle)
    expect(() => { assertXhsRetrySource(lineage) }).toThrow(expect.objectContaining({ code: 'XHS_RETRY_NOT_ALLOWED' }))
  })

  describe('XHS Contract Repair V0.1', () => {
    it('admits a PASS-reviewed, hard-only failed Candidate without changing source bytes', async () => {
      const longTitleDraft = canonicalDraft.replace('# 合成标题', `# ${'合成'.repeat(51)}`)
      const current = await fixture(longTitleDraft)
      const source = await sourceJob(current)
      const sourceAttempt = source.attempts[0]!
      const sourceBefore = await current.service.getOutputBundle(sourceAttempt.outputBundle!.id)
      const target = await revisionTarget(current.service)
      const review = await current.service.createXhsReviewArtifact({
        jobId: target.id, attemptId: target.currentAttempt!, expectedRevision: target.revision, idempotencyKey: 'pass-review',
        sourceJobId: source.id, sourceAttemptId: sourceAttempt.id, sourceDraftSha256: sourceAttempt.outputBundle!.entries[0].hash,
        reviewResult: 'PASS', requiredChanges: [], qualitySuggestions: [], preserve: ['全部业务内容'],
        reviewerType: 'external_business_ai', reviewedAt: 1,
      })
      const preflight = await current.service.preflightXhsContractRepair(
        target.id, target.currentAttempt!, review.artifact.artifactId,
      )
      expect(preflight.status).toBe('CONTRACT_REPAIR_READY')
      expect(preflight.sourceJobId).toBe(source.id)
      expect(preflight.failedContractItems).toContain('titleRange')
      expect(preflight.repairedFields).toContain('title-length')
      const sourceAfter = await current.service.getOutputBundle(sourceAttempt.outputBundle!.id)
      expect(sourceAfter.files['draft.md']).toBe(sourceBefore.files['draft.md'])
      expect(sourceAfter.bundle.entries[0].hash).toBe(sourceBefore.bundle.entries[0].hash)
    })

    it('blocks Contract Repair without a formal Review Artifact', async () => {
      const current = await fixture()
      const target = await revisionTarget(current.service)
      await expect(current.service.preflightXhsContractRepair(
        target.id, target.currentAttempt!, `artifact_${'0'.repeat(64)}` as never,
      )).rejects.toMatchObject({ code: 'XHS_CONTRACT_REPAIR_NOT_ALLOWED' })
    })

    it('admits title and body length failures without caller-selected fields', () => {
      expect(deriveXhsContractRepairScope(hardFailure())).toEqual({
        failedContractItems: ['titleRange', 'bodyRange'], repairedFields: ['title-length', 'body-length'],
      })
    })

    it('admits deterministic keyword occurrence and title-position failures', () => {
      const result = hardFailure({
        checks: { ...hardFailure().checks, titleRange: { status: 'PASS', actual: 18, requiredMin: 18, requiredMax: 20 },
          bodyRange: { status: 'PASS', actual: 750, requiredMin: 700, requiredMax: 800 } },
        keywordEvidence: [{ keyword: '正式词', requiredLocations: [{ location: '标题', count: 1 }],
          exactOccurrences: 0, positions: [], minimumOccurrencesPass: false, titleOccurrences: 0,
          titleRequirementPass: false, unresolvedRequiredLocations: [] }],
      })
      expect(deriveXhsContractRepairScope(result)).toEqual({
        failedContractItems: ['keyword:正式词:occurrences', 'keyword:正式词:title'],
        repairedFields: ['keyword-occurrences', 'keyword-title-position'],
      })
    })

    it('admits declared metadata corrections only as deterministic evidence', () => {
      const result = hardFailure({ facts: { ...hardFailure().facts, modelDeclaredTitleCharacters: 18, modelDeclaredBodyCharacters: 800 } })
      expect(deriveXhsContractRepairScope(result).repairedFields).toEqual([
        'title-length', 'body-length', 'declared-title-characters', 'declared-body-characters',
      ])
    })

    it('admits topic ordering only when the exact truth set is unchanged', () => {
      const result = hardFailure({ checks: { ...hardFailure().checks,
        titleRange: { status: 'PASS', actual: 18, requiredMin: 18, requiredMax: 20 },
        bodyRange: { status: 'PASS', actual: 750, requiredMin: 700, requiredMax: 800 },
        topics: { status: 'FAIL', actual: 2, required: 2, expected_topics: ['甲', '乙'], actual_topics: ['乙', '甲'],
          missing_topics: [], unexpected_topics: [], duplicate_topics: [], order_matches: false } } })
      expect(deriveXhsContractRepairScope(result)).toEqual({
        failedContractItems: ['topics.order'], repairedFields: ['allowed-topics-formatting'],
      })
    })

    it.each([
      ['missing topic', { missing_topics: ['甲'], unexpected_topics: [] }],
      ['unexpected topic', { missing_topics: [], unexpected_topics: ['丙'] }],
      ['duplicate topic', { missing_topics: [], unexpected_topics: [], duplicate_topics: ['甲'] }],
    ] as const)('blocks allowed_topics truth changes: %s', (_label, topicOverride) => {
      const result = hardFailure({ checks: { ...hardFailure().checks,
        topics: { status: 'FAIL', actual: 2, required: 2, expected_topics: ['甲', '乙'], actual_topics: ['甲', '丙'],
          duplicate_topics: [], order_matches: false, ...topicOverride } } })
      expect(() => deriveXhsContractRepairScope(result)).toThrow(expect.objectContaining({ code: 'XHS_CONTRACT_REPAIR_NOT_ALLOWED' }))
    })

    it.each(['pinnedComments', 'unpinnedComments'] as const)('blocks business comment changes through %s', (field) => {
      const checks = hardFailure().checks
      const result = hardFailure({ checks: { ...checks, [field]: { ...checks[field], status: 'FAIL' } } })
      expect(() => deriveXhsContractRepairScope(result)).toThrow(expect.objectContaining({ code: 'XHS_CONTRACT_REPAIR_NOT_ALLOWED' }))
    })

    it('blocks structural format failures', () => {
      expect(() => deriveXhsContractRepairScope(hardFailure({
        failureClass: 'FORMAT_CONTRACT_FAIL', hardContractStatus: null,
        format: { contract: 'xhs-draft-markdown-v1', status: 'FAIL', issues: ['REQUIRED_SECTION_MISSING'] },
      }))).toThrow(expect.objectContaining({ code: 'XHS_CONTRACT_REPAIR_NOT_ALLOWED' }))
    })

    it.each(['MODIFY', 'FAIL'] as const)('requires PASS rather than %s business Review', (reviewResult) => {
      const bundle = { jobId: randomUUID(), attemptId: randomUUID(), entries: [{ name: 'draft.md', path: 'draft.md', hash: 'a'.repeat(64) }],
        id: `output_bundle_${'b'.repeat(64)}` } as unknown as BusinessOutputBundle
      const review = reviewDocument(bundle, { candidateType: 'revision', revisionNumber: 2 }, reviewResult).document
      expect(() => contractRepairPreflight({ artifactId: `artifact_${'c'.repeat(64)}` } as never, review,
        { artifactId: `artifact_${'d'.repeat(64)}` } as never, deriveXhsContractRepairScope(hardFailure())))
        .toThrow(expect.objectContaining({ code: 'XHS_CONTRACT_REPAIR_NOT_ALLOWED' }))
    })

    it('enforces one repair and rejects Repair 2', () => {
      expect(() => { assertXhsContractRepairAvailable(0) }).not.toThrow()
      expect(() => { assertXhsContractRepairAvailable(1) })
        .toThrow(expect.objectContaining({ code: 'XHS_CONTRACT_REPAIR_LIMIT_REACHED' }))
      expect(() => nextXhsRevisionNumber({ candidateType: 'contract_repair' }))
        .toThrow(expect.objectContaining({ code: 'MAX_REVISION_REACHED' }))
    })

    it('does not consume the repair allowance before an Agent session starts', () => {
      expect(xhsContractRepairConsumedAllowance({ agentRuns: [] })).toBe(false)
      expect(xhsContractRepairConsumedAllowance({ agentRuns: [{
        action: 'xhs-body-contract-repair-v0', sessionId: 'not-started',
      } as never] })).toBe(false)
      expect(xhsContractRepairConsumedAllowance({ agentRuns: [{
        action: 'xhs-body-contract-repair-v0', sessionId: randomUUID(),
      } as never] })).toBe(true)
    })

    it.each(['product-module', 'comments', 'leo-experience', 'allowed-topics-truth'])(
      'rejects forged repair scope %s at the durable schema', (field) => {
        const invalid = {
          kind: 'contract-repair', sourceJobId: randomUUID(), sourceAttemptId: randomUUID(),
          sourceOutputBundleId: `output_bundle_${'a'.repeat(64)}`, sourceDraftPath: 'draft.md', sourceDraftSha256: 'b'.repeat(64),
          businessReviewArtifactId: `artifact_${'c'.repeat(64)}`, businessReviewSha256: 'd'.repeat(64),
          hardValidationArtifactId: `artifact_${'e'.repeat(64)}`, hardValidationSha256: 'f'.repeat(64),
          failedContractItems: ['titleRange'], repairNumber: 1, repairedFields: [field],
        }
        const sourcePackage = { id: `package_${'a'.repeat(64)}`, project: 'xhs', jobId: randomUUID(), attemptId: randomUUID(),
          workflowVersion: 'xhs-body-contract-repair-v0', inputs: [], allowedReadRoots: [], allowedReadFiles: [],
          allowedCapabilities: ['restricted-agent'], allowedSkills: [], skillSnapshots: [], skillManifestHash: 'a'.repeat(64),
          lineage: invalid, createdAt: 1, manifestHash: 'b'.repeat(64) }
        expect(() => businessExecutionPackageSchema.parse(sourcePackage)).toThrow()
      },
    )
  })
})
