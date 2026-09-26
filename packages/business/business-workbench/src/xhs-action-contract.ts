/** Frozen data contract for the fixture-enabled XHS body action. */

import { BusinessWorkbenchError } from './errors.ts'
import type {
  BusinessAttemptId,
  BusinessExecutionPackage,
  XhsBodyPrepareFailureCode,
  XhsBodyPrepareInputRole,
  XhsBodyPrepareOutputName,
} from './types.ts'

/** Stable action name reserved for the first XHS body preparation implementation. */
export const XHS_BODY_PREPARE_ACTION = 'xhs-body-prepare-v0' as const
/** Workflow version required by the first XHS body preparation action. */
export const XHS_BODY_PREPARE_WORKFLOW_VERSION = 'xhs-body-prepare-v0' as const
/** Workflow version for a review-directed additive revision. */
export const XHS_BODY_REVISION_WORKFLOW_VERSION = 'xhs-body-revise-v0' as const
/** Workflow version for one structural execution retry. */
export const XHS_BODY_RETRY_WORKFLOW_VERSION = 'xhs-body-retry-v0' as const
/** Workflow version for the sole deterministic-contract repair. */
export const XHS_BODY_CONTRACT_REPAIR_WORKFLOW_VERSION = 'xhs-body-contract-repair-v0' as const
/** Workflow version for the sole PASS-reviewed title/body length patch. */
export const XHS_BODY_LENGTH_REPAIR_WORKFLOW_VERSION = 'xhs-body-length-repair-v0' as const
/** Restricted action for a review-directed candidate. */
export const XHS_BODY_REVISION_ACTION = 'xhs-body-revise-v0' as const
/** Restricted action for the only admitted structural retry. */
export const XHS_BODY_RETRY_ACTION = 'xhs-body-retry-v0' as const
/** Restricted action for the sole deterministic-contract repair. */
export const XHS_BODY_CONTRACT_REPAIR_ACTION = 'xhs-body-contract-repair-v0' as const
/** Restricted action for the sole PASS-reviewed title/body length patch. */
export const XHS_BODY_LENGTH_REPAIR_ACTION = 'xhs-body-length-repair-v0' as const

/** Closed production Skill requirement declared by each XHS workflow. */
export type XhsExecutionSkillRequirement = 'required' | 'none'

/** Explicit production Skill requirement for every admitted XHS workflow. */
export const XHS_EXECUTION_SKILL_REQUIREMENTS = Object.freeze({
  [XHS_BODY_PREPARE_WORKFLOW_VERSION]: 'required',
  [XHS_BODY_REVISION_WORKFLOW_VERSION]: 'required',
  [XHS_BODY_RETRY_WORKFLOW_VERSION]: 'required',
  [XHS_BODY_CONTRACT_REPAIR_WORKFLOW_VERSION]: 'none',
  [XHS_BODY_LENGTH_REPAIR_WORKFLOW_VERSION]: 'none',
} satisfies Record<string, XhsExecutionSkillRequirement>)

/**
 * Resolve the production Skill requirement declared by one XHS workflow.
 * @param workflowVersion - Frozen workflow identifier from an execution package.
 * @returns The workflow's exact Skill requirement.
 */
export function resolveXhsExecutionSkillRequirement(workflowVersion: string): XhsExecutionSkillRequirement {
  if (!Object.hasOwn(XHS_EXECUTION_SKILL_REQUIREMENTS, workflowVersion)) {
    throw new BusinessWorkbenchError(
      'EXECUTION_PACKAGE_CONFLICT',
      `business-workbench: production workflow '${workflowVersion}' has no declared Skill requirement`,
    )
  }
  return XHS_EXECUTION_SKILL_REQUIREMENTS[workflowVersion as keyof typeof XHS_EXECUTION_SKILL_REQUIREMENTS]
}

/**
 * Verify that a production package exactly satisfies its declared Skill requirement.
 * @param executionPackage - Frozen production package to check.
 * @returns The verified Skill requirement.
 */
export function assertXhsExecutionSkillRequirement(
  executionPackage: BusinessExecutionPackage,
): XhsExecutionSkillRequirement {
  const requirement = resolveXhsExecutionSkillRequirement(executionPackage.workflowVersion)
  if (requirement === 'none') {
    if (executionPackage.allowedSkills.length !== 0 || executionPackage.skillSnapshots.length !== 0) {
      throw new BusinessWorkbenchError(
        'EXECUTION_PACKAGE_CONFLICT',
        'business-workbench: Skill-free production package unexpectedly contains Skill authority',
        { subjectId: executionPackage.id },
      )
    }
    return requirement
  }
  const snapshot = executionPackage.skillSnapshots[0]
  if (executionPackage.allowedSkills.length !== 1 || executionPackage.skillSnapshots.length !== 1
    || snapshot === undefined || snapshot.skillId !== executionPackage.allowedSkills[0]) {
    throw new BusinessWorkbenchError(
      'EXECUTION_PACKAGE_CONFLICT',
      'business-workbench: Skill-required production package must contain exactly one matching Skill snapshot',
      { subjectId: executionPackage.id },
    )
  }
  return requirement
}

const INPUTS = Object.freeze([
  Object.freeze({ role: 'taskCard' as const, logicalRoot: 'xhs/' as const, mediaType: 'text/markdown' as const }),
  Object.freeze({ role: 'writingRule' as const, logicalRoot: 'xhs/' as const, mediaType: 'text/markdown' as const }),
  Object.freeze({ role: 'goldenSample' as const, logicalRoot: 'xhs/' as const, mediaType: 'text/markdown' as const }),
])

const OUTPUTS = Object.freeze([
  Object.freeze({ name: 'draft.md' as const, artifactType: 'intermediate' as const, mediaType: 'text/markdown' as const }),
  Object.freeze({ name: 'draft-metadata.json' as const, artifactType: 'intermediate' as const, mediaType: 'application/json' as const }),
  Object.freeze({ name: 'provenance.json' as const, artifactType: 'intermediate' as const, mediaType: 'application/json' as const }),
])

/** Exact account-specific formal Skills admitted by deterministic Host routing. */
export const XHS_BODY_PREPARE_SKILLS = Object.freeze([
  'xhs-s3-account1',
  'xhs-s3-account2',
  'xhs-s3-account3',
  'xhs-s3-account4',
] as const)

const FAILURE_CODES: readonly XhsBodyPrepareFailureCode[] = Object.freeze([
  'XHS_BODY_INPUT_INVALID',
  'XHS_BODY_OUTPUT_INVALID',
])

/** Machine-readable Phase 4A action contract. It does not register an executable action. */
export const XHS_BODY_PREPARE_CONTRACT = Object.freeze({
  action: XHS_BODY_PREPARE_ACTION,
  project: 'xhs' as const,
  workflowVersion: XHS_BODY_PREPARE_WORKFLOW_VERSION,
  inputs: INPUTS,
  allowedCapabilities: Object.freeze(['restricted-agent']),
  allowedSkills: XHS_BODY_PREPARE_SKILLS,
  outputs: OUTPUTS,
  idempotencyKeyPrefix: `${XHS_BODY_PREPARE_ACTION}:attempt:` as const,
  reservedArtifactSlots: Object.freeze({
    validation: Object.freeze({ artifactType: 'validation' as const, enabled: true }),
    review: Object.freeze({ artifactType: 'review' as const, enabled: false }),
  }),
  failureCodes: FAILURE_CODES,
})

/**
 * Derive the sole invocation key for one future XHS preparation Attempt.
 * @param attemptId - immutable Attempt identity; retries reuse this identity.
 * @returns stable action-prefixed idempotency key.
 */
export function xhsBodyPrepareIdempotencyKey(attemptId: BusinessAttemptId): string {
  return `${XHS_BODY_PREPARE_CONTRACT.idempotencyKeyPrefix}${attemptId}`
}

/**
 * Verify that a frozen package is the exact minimum XHS preparation input set.
 * @param executionPackage - package to validate before any future action is enabled.
 * @param expectedSkillId - account-specific Host Skill id that must be the sole snapshot.
 * @throws `XHS_BODY_INPUT_INVALID` for every contract mismatch.
 */
export function assertXhsBodyPrepareExecutionPackage(
  executionPackage: BusinessExecutionPackage,
  expectedSkillId?: string,
): void {
  const reject = (message: string): never => {
    throw new BusinessWorkbenchError('XHS_BODY_INPUT_INVALID', `business-workbench: ${message}`, {
      subjectId: executionPackage.id,
    })
  }
  if (executionPackage.workflowVersion !== XHS_BODY_PREPARE_CONTRACT.workflowVersion) reject('XHS body package has the wrong Workflow version')
  const persistedProject: unknown = executionPackage.project
  if (persistedProject !== 'xhs') reject("XHS body package must belong to Project 'xhs'")
  if (executionPackage.inputs.length !== INPUTS.length) reject('XHS body package must contain exactly three inputs')
  for (const [index, contractInput] of INPUTS.entries()) {
    const input = executionPackage.inputs[index]
      ?? reject(`XHS body package input ${index + 1} must be '${contractInput.role}'`)
    if (input.role !== contractInput.role) reject(`XHS body package input ${index + 1} must be '${contractInput.role}'`)
    if (!input.required || !input.present) reject(`XHS body package input '${contractInput.role}' must be required and present`)
    if (!input.path.startsWith(contractInput.logicalRoot) || !input.path.endsWith('.md')) {
      reject(`XHS body package input '${contractInput.role}' must be a Markdown file below '${contractInput.logicalRoot}'`)
    }
  }
  if (executionPackage.allowedReadRoots.length !== 0) reject('XHS body package must grant exact files, not directory reads')
  const inputPaths = executionPackage.inputs.map(input => input.path).toSorted()
  if (JSON.stringify(executionPackage.allowedReadFiles) !== JSON.stringify(inputPaths)) reject('XHS body package read files must equal its three inputs')
  if (JSON.stringify(executionPackage.allowedCapabilities) !== JSON.stringify(XHS_BODY_PREPARE_CONTRACT.allowedCapabilities)) {
    reject("XHS body package must request only the 'restricted-agent' capability")
  }
  if (executionPackage.allowedSkills.length !== 1
    || !XHS_BODY_PREPARE_SKILLS.includes(executionPackage.allowedSkills[0] as typeof XHS_BODY_PREPARE_SKILLS[number])
    || (expectedSkillId !== undefined && executionPackage.allowedSkills[0] !== expectedSkillId)) reject('XHS body package has the wrong account Skill')
  assertXhsExecutionSkillRequirement(executionPackage)
}

/** Verify the exact five-input revision package and its immutable lineage.
 * @param executionPackage - Candidate execution package.
 * @param expectedSkillId - Optional account Skill identifier.
 * @returns Nothing when the package satisfies the revision contract.
 */
export function assertXhsBodyRevisionExecutionPackage(
  executionPackage: BusinessExecutionPackage,
  expectedSkillId?: string,
): void {
  const reject = (message: string): never => {
    throw new BusinessWorkbenchError('XHS_BODY_INPUT_INVALID', `business-workbench: ${message}`, { subjectId: executionPackage.id })
  }
  if (executionPackage.workflowVersion !== XHS_BODY_REVISION_WORKFLOW_VERSION) reject('XHS revision package has the wrong Workflow version')
  if (executionPackage.lineage?.kind !== 'revision') reject('XHS revision package lacks revision lineage')
  const roles = executionPackage.inputs.map(input => input.role)
  const currentRoles = ['taskCard', 'writingRule', 'goldenSample', 'sourceCandidateDraft', 'review']
  const legacyRoles = ['taskCard', 'writingRule', 'goldenSample', 'firstPassDraft', 'review']
  if (JSON.stringify(roles) !== JSON.stringify(currentRoles) && JSON.stringify(roles) !== JSON.stringify(legacyRoles)) {
    reject('XHS revision package requires five ordered inputs')
  }
  assertSharedXhsPackage(executionPackage, expectedSkillId)
}

/** Verify the source-only retry package and its immutable lineage.
 * @param executionPackage - Candidate execution package.
 * @param expectedSkillId - Optional account Skill identifier.
 * @returns Nothing when the package satisfies the retry contract.
 */
export function assertXhsBodyRetryExecutionPackage(
  executionPackage: BusinessExecutionPackage,
  expectedSkillId?: string,
): void {
  const reject = (message: string): never => {
    throw new BusinessWorkbenchError('XHS_BODY_INPUT_INVALID', `business-workbench: ${message}`, { subjectId: executionPackage.id })
  }
  if (executionPackage.workflowVersion !== XHS_BODY_RETRY_WORKFLOW_VERSION) reject('XHS retry package has the wrong Workflow version')
  if (executionPackage.lineage?.kind !== 'retry') reject('XHS retry package lacks retry lineage')
  const roles = executionPackage.inputs.map(input => input.role)
  if (JSON.stringify(roles) !== JSON.stringify(['taskCard', 'writingRule', 'goldenSample'])) reject('XHS retry package must not include the failed draft')
  assertSharedXhsPackage(executionPackage, expectedSkillId)
}

/** Verify the four-input, Skill-free Contract Repair package and lineage.
 * @param executionPackage - Candidate execution package.
 * @returns Nothing when the package is restricted to deterministic repair evidence.
 */
export function assertXhsBodyContractRepairExecutionPackage(executionPackage: BusinessExecutionPackage): void {
  const reject = (message: string): never => {
    throw new BusinessWorkbenchError('XHS_BODY_INPUT_INVALID', `business-workbench: ${message}`, { subjectId: executionPackage.id })
  }
  if (executionPackage.workflowVersion !== XHS_BODY_CONTRACT_REPAIR_WORKFLOW_VERSION) reject('XHS Contract Repair package has the wrong Workflow version')
  if (executionPackage.lineage?.kind !== 'contract-repair') reject('XHS Contract Repair package lacks repair lineage')
  if (JSON.stringify(executionPackage.inputs.map(input => input.role))
    !== JSON.stringify(['taskCard', 'sourceCandidateDraft', 'businessPassReview', 'hardContractFailure'])) {
    reject('XHS Contract Repair package requires four ordered inputs')
  }
  if (executionPackage.inputs.some(input => !input.required || !input.present)) reject('XHS Contract Repair inputs must be required and present')
  if (executionPackage.allowedReadRoots.length !== 0) reject('XHS Contract Repair must grant exact files, not directory reads')
  if (JSON.stringify(executionPackage.allowedReadFiles) !== JSON.stringify(executionPackage.inputs.map(input => input.path).toSorted())) {
    reject('XHS Contract Repair read files must equal its inputs')
  }
  if (JSON.stringify(executionPackage.allowedCapabilities) !== JSON.stringify(['restricted-agent'])) reject('XHS Contract Repair must request only restricted-agent')
  if (executionPackage.allowedSkills.length !== 0 || executionPackage.skillSnapshots.length !== 0) reject('XHS Contract Repair must not expose Skills')
  assertXhsExecutionSkillRequirement(executionPackage)
}

/** Verify the four-input, Skill-free length-repair package and lineage.
 * @param executionPackage - Candidate execution package.
 * @returns Nothing when the package contains only frozen repair evidence.
 */
export function assertXhsBodyLengthRepairExecutionPackage(executionPackage: BusinessExecutionPackage): void {
  const reject = (message: string): never => {
    throw new BusinessWorkbenchError('XHS_BODY_INPUT_INVALID', `business-workbench: ${message}`, { subjectId: executionPackage.id })
  }
  if (executionPackage.workflowVersion !== XHS_BODY_LENGTH_REPAIR_WORKFLOW_VERSION) reject('XHS length-repair package has the wrong Workflow version')
  if (executionPackage.lineage?.kind !== 'length-repair') reject('XHS length-repair package lacks repair lineage')
  if (JSON.stringify(executionPackage.inputs.map(input => input.role))
    !== JSON.stringify(['taskCard', 'sourceCandidateDraft', 'businessPassReview', 'hardContractFailure'])) {
    reject('XHS length-repair package requires four ordered inputs')
  }
  if (executionPackage.inputs.some(input => !input.required || !input.present)) reject('XHS length-repair inputs must be required and present')
  if (executionPackage.allowedReadRoots.length !== 0) reject('XHS length repair must grant exact files, not directory reads')
  if (JSON.stringify(executionPackage.allowedReadFiles) !== JSON.stringify(executionPackage.inputs.map(input => input.path).toSorted())) {
    reject('XHS length-repair read files must equal its inputs')
  }
  if (JSON.stringify(executionPackage.allowedCapabilities) !== JSON.stringify(['restricted-agent'])) reject('XHS length repair must request only restricted-agent')
  if (executionPackage.allowedSkills.length !== 0 || executionPackage.skillSnapshots.length !== 0) reject('XHS length repair must not expose Skills')
  assertXhsExecutionSkillRequirement(executionPackage)
}

/** Shared exact-file, capability, and account-Skill checks. */
function assertSharedXhsPackage(executionPackage: BusinessExecutionPackage, expectedSkillId?: string): void {
  const reject = (message: string): never => {
    throw new BusinessWorkbenchError('XHS_BODY_INPUT_INVALID', `business-workbench: ${message}`, { subjectId: executionPackage.id })
  }
  if (executionPackage.inputs.some(input => !input.required || !input.present)) reject('XHS package inputs must be required and present')
  if (executionPackage.allowedReadRoots.length !== 0) reject('XHS package must grant exact files, not directory reads')
  const inputPaths = executionPackage.inputs.map(input => input.path).toSorted()
  if (JSON.stringify(executionPackage.allowedReadFiles) !== JSON.stringify(inputPaths)) reject('XHS package read files must equal its inputs')
  if (JSON.stringify(executionPackage.allowedCapabilities) !== JSON.stringify(['restricted-agent'])) reject("XHS package must request only the 'restricted-agent' capability")
  if (executionPackage.allowedSkills.length !== 1
    || !XHS_BODY_PREPARE_SKILLS.includes(executionPackage.allowedSkills[0] as typeof XHS_BODY_PREPARE_SKILLS[number])
    || (expectedSkillId !== undefined && executionPackage.allowedSkills[0] !== expectedSkillId)) reject('XHS package has the wrong account Skill')
  assertXhsExecutionSkillRequirement(executionPackage)
}

/** Input roles in the exact order required by the action package. */
export const XHS_BODY_PREPARE_INPUT_ROLES: readonly XhsBodyPrepareInputRole[] = Object.freeze(INPUTS.map(input => input.role))
/** Logical output names reserved by the action contract. */
export const XHS_BODY_PREPARE_OUTPUT_NAMES: readonly XhsBodyPrepareOutputName[] = Object.freeze(OUTPUTS.map(output => output.name))
