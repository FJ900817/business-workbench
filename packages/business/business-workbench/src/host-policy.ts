/** Closed Project/action policies for tool-free restricted Agent routes. */

import { BusinessWorkbenchError } from './errors.ts'
import type {
  BusinessAgentAction,
  BusinessAgentModel,
  BusinessExecutionPackage,
  BusinessSkillSnapshot,
  XhsBodyPrepareRoute,
  XhsProductionAccount,
  XhsProductionNoteType,
} from './types.ts'
import {
  assertXhsBodyPrepareExecutionPackage,
  assertXhsBodyContractRepairExecutionPackage,
  assertXhsBodyLengthRepairExecutionPackage,
  assertXhsBodyRetryExecutionPackage,
  assertXhsBodyRevisionExecutionPackage,
  assertXhsExecutionSkillRequirement,
  XHS_BODY_PREPARE_ACTION,
  XHS_BODY_CONTRACT_REPAIR_ACTION,
  XHS_BODY_LENGTH_REPAIR_ACTION,
  XHS_BODY_RETRY_ACTION,
  XHS_BODY_REVISION_ACTION,
} from './xhs-action-contract.ts'
import { XHS_DRAFT_FORMAT, XHS_DRAFT_FORMAT_VERSION } from './xhs-draft-format.ts'
import { XHS_HARD_CONTRACT_VERSION, XHS_HARD_VALIDATION_VERSION, XHS_HARD_VALIDATOR } from './xhs-hard-contract.ts'

/** Deployment-selected model facts shared by restricted Agent actions. */
export interface RestrictedAgentModelConfig extends BusinessAgentModel {
  /** Maximum wall time for the Agent turn. */
  readonly timeoutMs: number
}

/** Host decision returned only after the package request passes policy. */
export interface RestrictedAgentPolicy {
  readonly action: BusinessAgentAction
  readonly model: RestrictedAgentModelConfig
  readonly allowedSkills: readonly string[]
  readonly allowedCapabilities: readonly string[]
  readonly output: 'artifact' | 'xhs-output-bundle' | 'xhs-length-repair-proposal'
  readonly policyVersion: string
}

const FIXTURE_SKILLS = Object.freeze(['fixture-truth-check', 'fixture-writing'])
const FIXTURE_CAPABILITIES = Object.freeze(['restricted-agent'])

/** Version pinned into XHS provenance and assembled snapshots. */
export const XHS_BODY_ACTION_POLICY_VERSION = 'xhs-body-prepare-policy-v2-text' as const
/** Policy version for bounded revisions over the currently reviewed candidate. */
export const XHS_BODY_REVISION_POLICY_VERSION = 'xhs-body-revise-policy-v2' as const
/** Policy version for one structural execution retry. */
export const XHS_BODY_RETRY_POLICY_VERSION = 'xhs-body-retry-policy-v1' as const
/** Policy version for the sole deterministic-contract repair. */
export const XHS_BODY_CONTRACT_REPAIR_POLICY_VERSION = 'xhs-body-contract-repair-policy-v1' as const
/** Policy version for Host-applied title/body patches. */
export const XHS_BODY_LENGTH_REPAIR_POLICY_VERSION = 'xhs-body-length-repair-policy-v1' as const

/** Formal production Skill identity and origin for each account route. */
export const XHS_PRODUCTION_SKILL_BINDINGS = Object.freeze({
  account1: Object.freeze({
    skillId: 'xhs-s3-account1', formalName: 'S3-笔记写作-账号1',
    exactSource: '.agents/skills/S3-笔记写作-账号1/SKILL.md', source: 'project-agents', provider: 'business-xhs-production-v1',
  }),
  account2: Object.freeze({
    skillId: 'xhs-s3-account2', formalName: 'S3-笔记写作-账号2',
    exactSource: '.agents/skills/S3-笔记写作-账号2/SKILL.md', source: 'project-agents', provider: 'business-xhs-production-v1',
  }),
  account3: Object.freeze({
    skillId: 'xhs-s3-account3', formalName: 'S3-笔记写作-账号3',
    exactSource: '.agents/skills/S3-笔记写作-账号3/SKILL.md', source: 'project-agents', provider: 'business-xhs-production-v1',
  }),
  account4: Object.freeze({
    skillId: 'xhs-s3-account4', formalName: 'S3-笔记写作-账号4',
    exactSource: '.agents/skills/S3-笔记写作-账号4/SKILL.md', source: 'project-agents', provider: 'business-xhs-production-v1',
  }),
} satisfies Record<XhsProductionAccount, {
  readonly skillId: string
  readonly formalName: string
  readonly exactSource: string
  readonly source: string
  readonly provider: string
}>)

/** Formal source types selected by the task-card note type. */
export const XHS_PRODUCTION_INPUT_BINDINGS = Object.freeze({
  'dry-search': Object.freeze({
    writingRule: '01_小红书生产创作系统/02_方法论与创作规范/产品1-视觉审美认知系统/选题创作规范/干货搜索型选题创作规范_V3.0.md',
    goldenSample: '01_小红书生产创作系统/05_模板与母版/笔记文案母版/01_干货搜索型/02_黄金样稿.md',
  }),
  recommendation: Object.freeze({
    writingRule: '01_小红书生产创作系统/02_方法论与创作规范/产品1-视觉审美认知系统/选题创作规范/干货推荐型选题创作规范_V3.0.md',
    goldenSample: '01_小红书生产创作系统/05_模板与母版/笔记文案母版/02_干货推荐型/02_黄金样稿.md',
  }),
  'hot-traffic': Object.freeze({
    writingRule: '01_小红书生产创作系统/02_方法论与创作规范/产品1-视觉审美认知系统/选题创作规范/热点流量型选题创作规范_V3.0.md',
    goldenSample: '01_小红书生产创作系统/05_模板与母版/笔记文案母版/03_热点流量型/02_黄金样稿.md',
  }),
} satisfies Record<XhsProductionNoteType, { readonly writingRule: string; readonly goldenSample: string }>)

/** Machine-readable closed XHS action assembly without credentials or user content. */
export const XHS_BODY_PREPARE_ASSEMBLY = Object.freeze({
  project: 'xhs' as const,
  action: XHS_BODY_PREPARE_ACTION,
  policyVersion: XHS_BODY_ACTION_POLICY_VERSION,
  runner: 'restricted-agent' as const,
  modelOutputFormat: 'markdown-text-v1' as const,
  executionModes: Object.freeze(['fixture', 'production'] as const),
  sourceAdapter: Object.freeze({
    version: 'xhs-production-source-v1' as const,
    contractSchemaVersion: 1 as const,
    productionEntry: '03 项目生态【生命体】/项目-小红书/00_小红书单篇正式生产入口.md',
    productionBaseline: '03 项目生态【生命体】/项目-小红书/01_小红书生产创作系统/00_系统总控/00_小红书正式生产运行基线.yaml',
    taskCardIdentity: Object.freeze(['account', 'productionMonth', 'productionWeek', 'note'] as const),
    discovery: false,
    fallback: false,
  }),
  modelPolicy: 'deployment-fixed' as const,
  toolPolicy: Object.freeze({ allowed: Object.freeze([]), discovery: false, subagent: false }),
  skillBindings: XHS_PRODUCTION_SKILL_BINDINGS,
  inputBindings: XHS_PRODUCTION_INPUT_BINDINGS,
  inputRoles: Object.freeze(['taskCard', 'writingRule', 'goldenSample'] as const),
  outputNames: Object.freeze(['draft.md', 'draft-metadata.json', 'provenance.json'] as const),
  outputType: 'intermediate' as const,
  outputVersion: 1 as const,
  draftFormat: Object.freeze({ id: XHS_DRAFT_FORMAT, version: XHS_DRAFT_FORMAT_VERSION }),
  hardContract: Object.freeze({
    projectionVersion: XHS_HARD_CONTRACT_VERSION,
    validationVersion: XHS_HARD_VALIDATION_VERSION,
    validator: XHS_HARD_VALIDATOR,
  }),
})

/**
 * Resolve the closed Phase 3 action policy and validate package requests.
 * @param executionPackage - immutable package whose declarations remain requests.
 * @param action - caller-selected Host action.
 * @param model - deployment model configuration owned by the Host.
 * @param xhs - explicit source class, account, and note type for the XHS action.
 * @returns fixed action policy after every requested capability is admitted.
 */
export function resolveRestrictedAgentPolicy(
  executionPackage: BusinessExecutionPackage,
  action: BusinessAgentAction,
  model: RestrictedAgentModelConfig | undefined,
  xhs?: XhsBodyPrepareRoute,
): RestrictedAgentPolicy {
  if (model === undefined) {
    throw new BusinessWorkbenchError('AGENT_RUNTIME_UNAVAILABLE', 'business-workbench: restricted Agent model policy is not configured')
  }
  const actionValue: unknown = action
  if (actionValue === XHS_BODY_PREPARE_ACTION || actionValue === XHS_BODY_REVISION_ACTION
    || actionValue === XHS_BODY_RETRY_ACTION || actionValue === XHS_BODY_CONTRACT_REPAIR_ACTION
    || actionValue === XHS_BODY_LENGTH_REPAIR_ACTION) {
    return resolveXhsPolicy(executionPackage, model, actionValue, xhs)
  }
  if (actionValue !== 'fixture-agent-run' || xhs !== undefined) {
    throw new BusinessWorkbenchError('AGENT_ACTION_NOT_ALLOWED', `business-workbench: action '${String(actionValue)}' is not allowed`)
  }
  const disallowedSkill = executionPackage.allowedSkills.find(skill => !FIXTURE_SKILLS.includes(skill))
  if (disallowedSkill !== undefined) {
    throw new BusinessWorkbenchError('SKILL_NOT_ALLOWED', `business-workbench: Skill '${disallowedSkill}' is not allowed for action '${action}'`, { subjectId: disallowedSkill })
  }
  const disallowedCapability = executionPackage.allowedCapabilities.find(capability => !FIXTURE_CAPABILITIES.includes(capability))
  if (disallowedCapability !== undefined) {
    throw new BusinessWorkbenchError('AGENT_ACTION_NOT_ALLOWED', `business-workbench: capability '${disallowedCapability}' is not allowed for action '${action}'`, { subjectId: disallowedCapability })
  }
  assertSkillOrigins(executionPackage.skillSnapshots)
  return Object.freeze({
    action: 'fixture-agent-run',
    model,
    allowedSkills: FIXTURE_SKILLS,
    allowedCapabilities: FIXTURE_CAPABILITIES,
    output: 'artifact',
    policyVersion: 'fixture-agent-policy-v1',
  })
}

/** Resolve the XHS policy from an exact source class, account, and note type. */
function resolveXhsPolicy(
  executionPackage: BusinessExecutionPackage,
  model: RestrictedAgentModelConfig,
  action: typeof XHS_BODY_PREPARE_ACTION | typeof XHS_BODY_REVISION_ACTION
    | typeof XHS_BODY_RETRY_ACTION | typeof XHS_BODY_CONTRACT_REPAIR_ACTION
    | typeof XHS_BODY_LENGTH_REPAIR_ACTION,
  route: XhsBodyPrepareRoute | undefined,
): RestrictedAgentPolicy {
  if (route === undefined) {
    throw new BusinessWorkbenchError('AGENT_ACTION_NOT_ALLOWED', 'business-workbench: XHS action requires an exact source, account, and note-type route')
  }
  const routeFields = route as unknown as Record<string, unknown>
  if ((routeFields.mode !== 'fixture' && routeFields.mode !== 'production')
    || typeof routeFields.account !== 'string' || !Object.hasOwn(XHS_PRODUCTION_SKILL_BINDINGS, routeFields.account)
    || typeof routeFields.noteType !== 'string' || !Object.hasOwn(XHS_PRODUCTION_INPUT_BINDINGS, routeFields.noteType)) {
    throw new BusinessWorkbenchError('AGENT_ACTION_NOT_ALLOWED', 'business-workbench: XHS action requires an exact source, account, and note-type route')
  }
  const account = routeFields.account as XhsProductionAccount
  const noteType = routeFields.noteType as XhsProductionNoteType
  const binding = XHS_PRODUCTION_SKILL_BINDINGS[account]
  if (action === XHS_BODY_PREPARE_ACTION) assertXhsBodyPrepareExecutionPackage(executionPackage, binding.skillId)
  else if (action === XHS_BODY_REVISION_ACTION) assertXhsBodyRevisionExecutionPackage(executionPackage, binding.skillId)
  else if (action === XHS_BODY_RETRY_ACTION) assertXhsBodyRetryExecutionPackage(executionPackage, binding.skillId)
  else if (action === XHS_BODY_CONTRACT_REPAIR_ACTION) assertXhsBodyContractRepairExecutionPackage(executionPackage)
  else assertXhsBodyLengthRepairExecutionPackage(executionPackage)
  if (routeFields.mode === 'production') {
    assertProductionPackage(executionPackage, account, noteType)
  } else {
    if (executionPackage.productionSource !== undefined) {
      throw new BusinessWorkbenchError('AGENT_ACTION_NOT_ALLOWED', 'business-workbench: a production package cannot run through the fixture route', { subjectId: executionPackage.id })
    }
    assertFixtureSkillOrigins(executionPackage.skillSnapshots)
  }
  return Object.freeze({
    action,
    model,
    allowedSkills: action === XHS_BODY_CONTRACT_REPAIR_ACTION || action === XHS_BODY_LENGTH_REPAIR_ACTION
      ? Object.freeze([]) : Object.freeze([binding.skillId]),
    allowedCapabilities: FIXTURE_CAPABILITIES,
    output: action === XHS_BODY_LENGTH_REPAIR_ACTION ? 'xhs-length-repair-proposal' : 'xhs-output-bundle',
    policyVersion: action === XHS_BODY_PREPARE_ACTION ? XHS_BODY_ACTION_POLICY_VERSION
      : action === XHS_BODY_REVISION_ACTION ? XHS_BODY_REVISION_POLICY_VERSION
        : action === XHS_BODY_RETRY_ACTION ? XHS_BODY_RETRY_POLICY_VERSION
          : action === XHS_BODY_CONTRACT_REPAIR_ACTION ? XHS_BODY_CONTRACT_REPAIR_POLICY_VERSION
            : XHS_BODY_LENGTH_REPAIR_POLICY_VERSION,
  })
}

/** Production execution consumes only the resolver-owned source manifest and S3 origin. */
function assertProductionPackage(
  executionPackage: BusinessExecutionPackage,
  account: XhsProductionAccount,
  noteType: XhsProductionNoteType,
): void {
  const manifest = executionPackage.productionSource
  const snapshot = executionPackage.skillSnapshots[0]
  const binding = XHS_PRODUCTION_SKILL_BINDINGS[account]
  if (manifest === undefined || manifest.identity.account !== account || manifest.identity.noteType !== noteType) {
    throw new BusinessWorkbenchError('XHS_BODY_INPUT_INVALID', 'business-workbench: production route does not match the frozen source identity', { subjectId: executionPackage.id })
  }
  const skillRequirement = assertXhsExecutionSkillRequirement(executionPackage)
  if (skillRequirement === 'none') {
    return
  }
  if (snapshot === undefined || executionPackage.skillSnapshots.length !== 1
    || snapshot.skillId !== binding.skillId
    || snapshot.source !== binding.source
    || snapshot.provider !== binding.provider
    || snapshot.path !== binding.exactSource
    || snapshot.snapshotHash !== manifest.skillSource.snapshotHash
    || manifest.skillSource.path !== binding.exactSource
    || manifest.skillSource.provider !== binding.provider) {
    throw new BusinessWorkbenchError('SKILL_ORIGIN_NOT_ALLOWED', `business-workbench: production Skill '${binding.skillId}' does not match its exact formal source`, { subjectId: binding.skillId })
  }
}

/** Fixture Skills are Host-embedded; a Project/user/global shadow is rejected. */
function assertSkillOrigins(snapshots: readonly BusinessSkillSnapshot[]): void {
  for (const snapshot of snapshots) {
    if (snapshot.source !== 'runtime' || snapshot.provider !== 'runtime') {
      throw new BusinessWorkbenchError(
        'SKILL_ORIGIN_NOT_ALLOWED',
        `business-workbench: Skill '${snapshot.skillId}' resolved from unapproved origin '${snapshot.source}/${snapshot.provider}'`,
        { subjectId: snapshot.skillId },
      )
    }
  }
}

/** Safe fixture snapshots use the registry-owned runtime origin only. */
function assertFixtureSkillOrigins(snapshots: readonly BusinessSkillSnapshot[]): void {
  for (const snapshot of snapshots) {
    if (snapshot.source !== 'runtime' || snapshot.provider !== 'runtime') {
      throw new BusinessWorkbenchError(
        'SKILL_ORIGIN_NOT_ALLOWED',
        `business-workbench: fixture Skill '${snapshot.skillId}' resolved from unapproved origin '${snapshot.source}/${snapshot.provider}'`,
        { subjectId: snapshot.skillId },
      )
    }
  }
}
