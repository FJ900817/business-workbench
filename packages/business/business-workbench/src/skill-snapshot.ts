/** Exact Skill materialization and drift verification for restricted Agent Runs. */

import { createHash } from 'node:crypto'
import type { SkillDefinition, SkillRegistry, SkillResourceBase } from '@deepseek-ai/dsh-skill'
import { BusinessWorkbenchError } from './errors.ts'
import type { BusinessSkillSnapshot } from './types.ts'

/** Stable JSON projection for an optional provider-owned resource base. */
function resourceBaseValue(value: SkillResourceBase | undefined): string | undefined {
  return value === undefined ? undefined : JSON.stringify(value)
}

/** Hash the semantic Skill identity used for drift comparison. */
function snapshotHash(value: Omit<BusinessSkillSnapshot, 'resolvedAt' | 'snapshotHash'>): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

/**
 * Materialize one loaded definition as immutable Business-owned bytes.
 * @param definition - Exact winning Skill definition returned by the registry.
 * @param resolvedAt - Host timestamp shared by one package's snapshots.
 * @returns the frozen Skill body and resolved origin.
 */
export function materializeSkillSnapshot(definition: SkillDefinition, resolvedAt: number): BusinessSkillSnapshot {
  const contentHash = createHash('sha256').update(definition.content).digest('hex')
  const resourceBase = resourceBaseValue(definition.resourceBase)
  const base: Omit<BusinessSkillSnapshot, 'resolvedAt' | 'snapshotHash'> = {
    skillId: definition.name,
    source: definition.source,
    provider: definition.provider,
    ...(definition.path === undefined ? {} : { path: definition.path }),
    ...(resourceBase === undefined ? {} : { resourceBase }),
    content: definition.content,
    contentHash,
    bytes: Buffer.byteLength(definition.content, 'utf8'),
  }
  return Object.freeze({ ...base, resolvedAt, snapshotHash: snapshotHash(base) })
}

/**
 * Hash an ordered Skill snapshot list without its observation timestamps.
 * @param snapshots - exact snapshots in normalized Skill-id order.
 * @returns lowercase SHA-256 manifest digest.
 */
export function skillManifestHash(snapshots: readonly BusinessSkillSnapshot[]): string {
  return createHash('sha256').update(JSON.stringify(snapshots.map(snapshot => snapshot.snapshotHash))).digest('hex')
}

/**
 * Resolve exact Skill ids through the current winning registry view.
 * @param skills - Harness Skill Registry.
 * @param skillIds - normalized exact ids; no discovery result is exposed to the Agent.
 * @param cwd - Project root selecting the registry's Project layer.
 * @param resolvedAt - durable observation timestamp.
 * @returns frozen definitions in request order.
 */
export async function resolveSkillSnapshots(
  skills: SkillRegistry,
  skillIds: readonly string[],
  cwd: string,
  resolvedAt: number,
): Promise<readonly BusinessSkillSnapshot[]> {
  const snapshots: BusinessSkillSnapshot[] = []
  for (const skillId of skillIds) {
    const definition = await skills.get(skillId, { cwd })
    if (definition === undefined) {
      throw new BusinessWorkbenchError('SKILL_NOT_FOUND', `business-workbench: Skill '${skillId}' was not found`, { subjectId: skillId })
    }
    snapshots.push(materializeSkillSnapshot(definition, resolvedAt))
  }
  return Object.freeze(snapshots)
}

/**
 * Re-resolve every frozen Skill and reject content or origin changes.
 * @param skills - Harness Skill Registry.
 * @param snapshots - immutable package snapshots.
 * @param cwd - same Project root used at package creation.
 */
export async function verifySkillSnapshots(
  skills: SkillRegistry,
  snapshots: readonly BusinessSkillSnapshot[],
  cwd: string,
): Promise<void> {
  for (const expected of snapshots) {
    const current = await skills.get(expected.skillId, { cwd })
    if (current === undefined) {
      throw new BusinessWorkbenchError('SKILL_DRIFT', `business-workbench: frozen Skill '${expected.skillId}' is no longer available`, { subjectId: expected.skillId })
    }
    const actual = materializeSkillSnapshot(current, expected.resolvedAt)
    if (actual.snapshotHash !== expected.snapshotHash) {
      throw new BusinessWorkbenchError('SKILL_DRIFT', `business-workbench: frozen Skill '${expected.skillId}' changed content or origin`, {
        subjectId: expected.skillId,
        expectedHash: expected.snapshotHash,
        actualHash: actual.snapshotHash,
      })
    }
  }
}
