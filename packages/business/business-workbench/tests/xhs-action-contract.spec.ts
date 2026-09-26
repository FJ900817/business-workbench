import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import {
  assertXhsBodyPrepareExecutionPackage,
  assertXhsExecutionSkillRequirement,
  type BusinessExecutionPackage,
  type BusinessJob,
  type BusinessWorkbenchService,
  XHS_BODY_PREPARE_ACTION,
  XHS_BODY_PREPARE_CONTRACT,
  XHS_BODY_PREPARE_INPUT_ROLES,
  XHS_BODY_PREPARE_OUTPUT_NAMES,
  XHS_BODY_PREPARE_SKILLS,
  XHS_BODY_CONTRACT_REPAIR_WORKFLOW_VERSION,
  XHS_BODY_LENGTH_REPAIR_WORKFLOW_VERSION,
  XHS_BODY_RETRY_WORKFLOW_VERSION,
  XHS_BODY_REVISION_WORKFLOW_VERSION,
  XHS_EXECUTION_SKILL_REQUIREMENTS,
  resolveXhsExecutionSkillRequirement,
  xhsBodyPrepareIdempotencyKey,
} from '../src/index.ts'
import { batchRequest, setupHarness } from './helpers.ts'

const fixtures: Awaited<ReturnType<typeof setupHarness>>[] = []
const ownerId = 'phase4a-contract-owner'

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose()))
})

async function frozenPackage(): Promise<{ readonly job: BusinessJob; readonly executionPackage: BusinessExecutionPackage }> {
  const fixture = await setupHarness()
  fixtures.push(fixture)
  await fixture.ctx.plugin(SkillRegistry)
  const skillId = XHS_BODY_PREPARE_SKILLS[0]
  fixture.ctx.skills.register({ name: skillId, description: skillId, source: 'runtime', content: `${skillId} fixture` })
  const service: BusinessWorkbenchService = fixture.ctx.businessWorkbench
  const batch = await service.createBatch(batchRequest(`phase4a-contract-${randomUUID()}`))
  let job = service.listJobs(batch.id)[0]!
  job = await service.transitionJob({ jobId: job.id, expectedRevision: job.revision, idempotencyKey: 'ready', status: 'ready' })
  job = await service.createAttempt({ jobId: job.id, expectedRevision: job.revision, idempotencyKey: 'attempt' })
  job = await service.acquireExecutionLease({
    jobId: job.id,
    attemptId: job.currentAttempt!,
    expectedRevision: job.revision,
    idempotencyKey: 'lease',
    ownerId,
  })
  const executionPackage = await service.createExecutionPackage({
    jobId: job.id,
    attemptId: job.currentAttempt!,
    expectedRevision: job.revision,
    idempotencyKey: 'package',
    ownerId,
    workflowVersion: XHS_BODY_PREPARE_CONTRACT.workflowVersion,
    inputs: [
      { role: 'taskCard', path: 'xhs/current-task.md', required: true },
      { role: 'writingRule', path: 'xhs/rules/writing.md', required: true },
      { role: 'goldenSample', path: 'xhs/rules/golden-sample.md', required: true },
    ],
    allowedReadRoots: [],
    allowedReadFiles: [
      'xhs/current-task.md',
      'xhs/rules/writing.md',
      'xhs/rules/golden-sample.md',
    ],
    allowedCapabilities: ['restricted-agent'],
    allowedSkills: [skillId],
  })
  return { job, executionPackage }
}

function withPackage(
  executionPackage: BusinessExecutionPackage,
  changes: Partial<BusinessExecutionPackage>,
): BusinessExecutionPackage {
  return { ...executionPackage, ...changes }
}

describe('XHS body preparation action contract', () => {
  it('freezes the action, minimum inputs, exact Skills, outputs, and future slots without enabling execution', async () => {
    const { job, executionPackage } = await frozenPackage()

    expect(XHS_BODY_PREPARE_ACTION).toBe('xhs-body-prepare-v0')
    expect(XHS_BODY_PREPARE_INPUT_ROLES).toEqual(['taskCard', 'writingRule', 'goldenSample'])
    expect(XHS_BODY_PREPARE_SKILLS).toEqual(['xhs-s3-account1', 'xhs-s3-account2', 'xhs-s3-account3', 'xhs-s3-account4'])
    expect(XHS_BODY_PREPARE_OUTPUT_NAMES).toEqual(['draft.md', 'draft-metadata.json', 'provenance.json'])
    expect(XHS_BODY_PREPARE_CONTRACT.reservedArtifactSlots).toEqual({
      validation: { artifactType: 'validation', enabled: true },
      review: { artifactType: 'review', enabled: false },
    })
    expect(xhsBodyPrepareIdempotencyKey(job.currentAttempt!))
      .toBe(`xhs-body-prepare-v0:attempt:${job.currentAttempt}`)
    expect(() => { assertXhsBodyPrepareExecutionPackage(executionPackage) }).not.toThrow()
  })

  it('rejects every expansion of the exact input, read, capability, or Skill set', async () => {
    const { executionPackage } = await frozenPackage()
    const sparseInputs = [...executionPackage.inputs]
    Reflect.deleteProperty(sparseInputs, 0)
    const cases: BusinessExecutionPackage[] = [
      withPackage(executionPackage, { workflowVersion: 'dynamic-workflow' }),
      withPackage(executionPackage, { project: 'gzh' as never }),
      withPackage(executionPackage, { inputs: executionPackage.inputs.slice(0, 2) }),
      withPackage(executionPackage, { inputs: sparseInputs }),
      withPackage(executionPackage, {
        inputs: executionPackage.inputs.map((input, index) => index === 0 ? { ...input, role: 'wrongRole' } : input),
      }),
      withPackage(executionPackage, {
        inputs: executionPackage.inputs.map((input, index) => index === 0 ? { ...input, required: false } : input),
      }),
      withPackage(executionPackage, {
        inputs: executionPackage.inputs.map((input, index) => index === 0 ? { ...input, present: false } : input),
      }),
      withPackage(executionPackage, {
        inputs: executionPackage.inputs.map((input, index) => index === 0 ? { ...input, path: 'gzh/task.md' } : input),
      }),
      withPackage(executionPackage, {
        inputs: executionPackage.inputs.map((input, index) => index === 0 ? { ...input, path: 'xhs/task.txt' } : input),
      }),
      withPackage(executionPackage, { allowedReadRoots: ['xhs'] }),
      withPackage(executionPackage, { allowedReadFiles: [...executionPackage.allowedReadFiles, 'xhs/extra.md'] }),
      withPackage(executionPackage, { allowedCapabilities: ['restricted-agent', 'workspace-scan'] }),
      withPackage(executionPackage, { allowedSkills: [...executionPackage.allowedSkills, 'gzh-writing'] }),
    ]

    for (const candidate of cases) {
      expect(() => { assertXhsBodyPrepareExecutionPackage(candidate) })
        .toThrow(expect.objectContaining({ code: 'XHS_BODY_INPUT_INVALID' }))
    }
  })

  it('declares every admitted production workflow as Skill-required or Skill-free', () => {
    expect(XHS_EXECUTION_SKILL_REQUIREMENTS).toEqual({
      'xhs-body-prepare-v0': 'required',
      'xhs-body-revise-v0': 'required',
      'xhs-body-retry-v0': 'required',
      'xhs-body-contract-repair-v0': 'none',
      'xhs-body-length-repair-v0': 'none',
    })
    expect(resolveXhsExecutionSkillRequirement(XHS_BODY_REVISION_WORKFLOW_VERSION)).toBe('required')
    expect(resolveXhsExecutionSkillRequirement(XHS_BODY_RETRY_WORKFLOW_VERSION)).toBe('required')
    expect(resolveXhsExecutionSkillRequirement(XHS_BODY_CONTRACT_REPAIR_WORKFLOW_VERSION)).toBe('none')
    expect(resolveXhsExecutionSkillRequirement(XHS_BODY_LENGTH_REPAIR_WORKFLOW_VERSION)).toBe('none')
  })

  it('fails closed when a production workflow has no Skill requirement declaration', () => {
    expect(() => resolveXhsExecutionSkillRequirement('xhs-unregistered-v0'))
      .toThrow(expect.objectContaining({ code: 'EXECUTION_PACKAGE_CONFLICT' }))
  })

  it('accepts exactly one matching snapshot for a Skill-required workflow', async () => {
    const { executionPackage } = await frozenPackage()
    expect(assertXhsExecutionSkillRequirement(executionPackage)).toBe('required')
  })

  it('rejects a missing snapshot for First Pass, Revision, and Retry', async () => {
    const { executionPackage } = await frozenPackage()
    for (const workflowVersion of [
      XHS_BODY_PREPARE_CONTRACT.workflowVersion,
      XHS_BODY_REVISION_WORKFLOW_VERSION,
      XHS_BODY_RETRY_WORKFLOW_VERSION,
    ]) {
      expect(() => assertXhsExecutionSkillRequirement(withPackage(executionPackage, {
        workflowVersion,
        skillSnapshots: [],
      }))).toThrow(expect.objectContaining({ code: 'EXECUTION_PACKAGE_CONFLICT' }))
    }
  })

  it.each([XHS_BODY_CONTRACT_REPAIR_WORKFLOW_VERSION, XHS_BODY_LENGTH_REPAIR_WORKFLOW_VERSION])(
    'accepts no Skill authority for %s', async (workflowVersion) => {
      const { executionPackage } = await frozenPackage()
      const repairPackage = withPackage(executionPackage, {
        workflowVersion,
        allowedSkills: [],
        skillSnapshots: [],
      })
      expect(assertXhsExecutionSkillRequirement(repairPackage)).toBe('none')
    },
  )

  it('rejects an injected Skill in Contract Repair', async () => {
    const { executionPackage } = await frozenPackage()
    expect(() => assertXhsExecutionSkillRequirement(withPackage(executionPackage, {
      workflowVersion: XHS_BODY_CONTRACT_REPAIR_WORKFLOW_VERSION,
    }))).toThrow(expect.objectContaining({ code: 'EXECUTION_PACKAGE_CONFLICT' }))
  })
})
