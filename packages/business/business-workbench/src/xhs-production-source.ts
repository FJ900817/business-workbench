/** Deterministic Host resolver for approved XHS production sources. */

import { createHash } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, posix, relative, resolve, sep, win32 } from 'node:path'
import { performance } from 'node:perf_hooks'
import type { SkillDefinition } from '@deepseek-ai/dsh-skill'
import { parseDocument } from 'yaml'
import { BusinessWorkbenchError } from './errors.ts'
import { XHS_BODY_PREPARE_CONTRACT } from './xhs-action-contract.ts'
import { XHS_PRODUCTION_INPUT_BINDINGS, XHS_PRODUCTION_SKILL_BINDINGS } from './host-policy.ts'
import { materializeSkillSnapshot } from './skill-snapshot.ts'
import { extractXhsTaskCardAllowedTopics } from './xhs-task-card-contract.ts'
import { compareXhsTopics } from './xhs-topics.ts'
import type {
  BusinessExecutionInputRequest,
  BusinessSkillSnapshot,
  XhsProductionAccount,
  XhsProductionInputRoute,
  XhsProductionNoteType,
  XhsProductionSourceIdentity,
  XhsProductionSourceManifest,
  XhsProductionTaskIdentity,
} from './types.ts'

/** Resolver implementation pinned into durable production-source evidence. */
export const XHS_PRODUCTION_SOURCE_ADAPTER_VERSION = 'xhs-production-source-v1' as const
/** Durable source-manifest schema owned by the production adapter. */
export const XHS_PRODUCTION_SOURCE_CONTRACT_SCHEMA_VERSION = 1 as const
/** Fixed Vault-relative Project root for Business Layer V0.1. */
export const XHS_PROJECT_RELATIVE_PATH = '03 项目生态【生命体】/项目-小红书' as const
/** Exact formal production-entry identity. */
export const XHS_PRODUCTION_ENTRY_RELATIVE_PATH = `${XHS_PROJECT_RELATIVE_PATH}/00_小红书单篇正式生产入口.md` as const
/** Exact formal production-baseline identity. */
export const XHS_PRODUCTION_BASELINE_RELATIVE_PATH = `${XHS_PROJECT_RELATIVE_PATH}/01_小红书生产创作系统/00_系统总控/00_小红书正式生产运行基线.yaml` as const

const S3_PROVIDER = 'business-xhs-production-v1'
const TASK_CARD_ROOT = '01_小红书生产创作系统/03_内容生产/小红书/产品1-视觉审美认知系统'
const SOURCE_TASK_ROOT = `${XHS_PROJECT_RELATIVE_PATH}/02_小红书经营诊断系统/04_策略与任务/03_系统一任务/01_正式任务卡`
const ARCHIVE_SEGMENT = /(?:^|[-_.])(archive|archived)(?:$|[-_.])/i

const ACCOUNT_LABELS = Object.freeze({
  account1: '账号1',
  account2: '账号2',
  account3: '账号3',
  account4: '账号4',
} satisfies Record<XhsProductionAccount, string>)

const NOTE_TYPE_VALUES: Readonly<Record<string, XhsProductionNoteType>> = Object.freeze({
  '干货搜索型（dry_search）': 'dry-search',
  '干货推荐型（recommendation）': 'recommendation',
  '热点流量型（hot_traffic）': 'hot-traffic',
})

const SOURCE_NOTE_TYPE_VALUES: Readonly<Record<string, XhsProductionNoteType>> = Object.freeze({
  ...NOTE_TYPE_VALUES,
  '干货推荐型（soft_plant）': 'recommendation',
})

const BASELINE_KEYS = Object.freeze({
  'dry-search': 'dry_search',
  recommendation: 'recommendation',
  'hot-traffic': 'hot_traffic',
} satisfies Record<XhsProductionNoteType, string>)

interface FrozenFile {
  readonly relativePath: string
  readonly bytes: Buffer
  readonly text: string
  readonly sha256: string
}

interface BaselineBinding {
  readonly exactPath: string
  readonly sha256: string
}

interface ParsedBaseline {
  readonly version: string
  readonly productionEntryPath: string
  readonly s3: Readonly<Record<XhsProductionAccount, BaselineBinding>>
  readonly rules: Readonly<Record<XhsProductionNoteType, BaselineBinding>>
  readonly samples: Readonly<Record<XhsProductionNoteType, BaselineBinding>>
}

/** Internal package material returned only to the owning Host service. */
export interface XhsProductionResolution {
  readonly inputs: readonly BusinessExecutionInputRequest[]
  readonly allowedReadFiles: readonly string[]
  readonly skillSnapshot: BusinessSkillSnapshot
  readonly sourceManifest: XhsProductionSourceManifest
  readonly timing: {
    readonly sourceResolutionMs: number
    readonly skillSnapshotMs: number
  }
}

/**
 * SHA-256 of one production manifest without its own hash field.
 * @param value - Complete production source evidence except `manifestHash`.
 * @returns the lowercase hexadecimal digest.
 */
export function xhsProductionSourceManifestHash(
  value: Omit<XhsProductionSourceManifest, 'manifestHash'>,
): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

/** Host-only exact-path resolver with no discovery or fallback path. */
export class XhsProductionSourceResolver {
  private canonicalVaultRoot?: string
  private canonicalProjectRoot?: string

  /** @param vaultRoot - Physical root containing the formal entry, baseline, Project, and S3 files. */
  constructor(readonly vaultRoot: string) {}

  /**
   * Canonicalize the Vault and require the configured Business Project root to match it.
   * @param businessProjectRoot - Canonical root mounted behind `xhs/**`.
   */
  async initialize(businessProjectRoot: string): Promise<void> {
    try {
      const vault = await realpath(this.vaultRoot)
      const project = await realpath(resolve(vault, XHS_PROJECT_RELATIVE_PATH))
      if (!(await stat(vault)).isDirectory() || !(await stat(project)).isDirectory()) throw new Error('production source root is not a directory')
      if (project !== businessProjectRoot) throw new Error('production source Project root differs from the xhs read root')
      this.canonicalVaultRoot = vault
      this.canonicalProjectRoot = project
    } catch (error) {
      throw new BusinessWorkbenchError('READ_ROOT_UNAVAILABLE', 'business-workbench: XHS production source root is unavailable or mismatched', {}, { cause: error })
    }
  }

  /**
   * Resolve one approved production slot into exact inputs, one S3 snapshot, and durable evidence.
   * @param requested - Account, production month, production week, and note identity.
   * @param resolvedAt - Shared observation time for source and Skill snapshots.
   * @returns exact package material without exposing filesystem authority.
   */
  async resolve(requested: XhsProductionTaskIdentity, resolvedAt: number): Promise<XhsProductionResolution> {
    const resolutionStartedAt = performance.now()
    this.assertRequest(requested)
    const productionEntry = await this.readExact(XHS_PRODUCTION_ENTRY_RELATIVE_PATH, 'input')
    const entryMetadata = parseFrontmatter(productionEntry.text, 'production entry')
    if (entryMetadata.status !== '正式' || typeof entryMetadata.version !== 'string' || entryMetadata.version.length === 0) {
      throw invalid('the formal production entry is not active')
    }

    const baselineFile = await this.readExact(XHS_PRODUCTION_BASELINE_RELATIVE_PATH, 'input')
    const baseline = parseBaseline(baselineFile.text)
    if (baseline.productionEntryPath !== XHS_PRODUCTION_ENTRY_RELATIVE_PATH) {
      throw invalid('the production baseline does not name the exact formal entry')
    }

    const accountLabel = ACCOUNT_LABELS[requested.account]
    const taskCardRelative = `${TASK_CARD_ROOT}/${accountLabel}/${requested.productionMonth}/${requested.productionWeek}/${requested.note}/写作任务卡.md`
    const taskCard = await this.readExact(`${XHS_PROJECT_RELATIVE_PATH}/${taskCardRelative}`, 'input')
    const fields = parseTaskCardMachineFields(taskCard.text)
    const noteType = NOTE_TYPE_VALUES[requiredField(fields, 'note_type')]
    if (noteType === undefined) throw invalid('task card note_type has no formal production route')
    if (requiredField(fields, 'status') !== '已确认') throw invalid('task card is not confirmed')
    if (requiredField(fields, 'account') !== accountLabel
      || requiredField(fields, 'production_month') !== requested.productionMonth
      || requiredField(fields, 'production_week') !== requested.productionWeek
      || requiredField(fields, 'note') !== requested.note) {
      throw invalid('task card identity does not match the requested production slot')
    }
    if (requiredField(fields, 'compiler_version') !== entryMetadata.version) {
      throw invalid('task card compiler version does not match the formal production entry')
    }
    const taskId = requiredField(fields, 'task_id')
    const topicId = requiredField(fields, 'topic_id')
    if (requiredField(fields, 'source_task_id') !== taskId) throw invalid('task card source task id does not match task id')

    const sourceTaskPath = assertSafeRelativePath(requiredField(fields, 'source_task_path'))
    const expectedSourcePrefix = `${SOURCE_TASK_ROOT}/${accountLabel}/${requested.productionMonth}/${requested.productionWeek}/${requested.note}/任务卡_${taskId}_${accountLabel}_`
    if (!sourceTaskPath.startsWith(expectedSourcePrefix) || !sourceTaskPath.endsWith('.md')) {
      throw invalid('task card source path does not match the requested production slot')
    }
    const sourceTask = await this.readExact(sourceTaskPath, 'input')
    const declaredSourceHash = requiredField(fields, 'source_task_sha256')
    if (sourceTask.sha256 !== declaredSourceHash) throw drift(sourceTaskPath, declaredSourceHash, sourceTask.sha256)
    const sourceMetadata = parseFrontmatter(sourceTask.text, 'source task')
    if (sourceMetadata.status !== '已确认'
      || sourceMetadata.task_id !== taskId
      || sourceMetadata.topic_id !== topicId
      || sourceNoteType(sourceMetadata.note_type) !== noteType
      || typeof sourceMetadata.account !== 'string'
      || !sourceMetadata.account.startsWith(accountLabel)) {
      throw invalid('source task fields do not match the confirmed task-card snapshot')
    }
    const sourceTopics = sourceAllowedTopics(sourceMetadata)
    const taskCardTopics = extractXhsTaskCardAllowedTopics(taskCard.text)
    const topicComparison = compareXhsTopics(sourceTopics, taskCardTopics)
    if (sourceTopics.length !== 10 || taskCardTopics.length !== 10 || topicComparison.status !== 'PASS') {
      throw invalid('source task allowed_topics and task card topics must contain the same 10 unique values in the same order')
    }

    const rule = await this.resolveBaselineInput(baseline.rules[noteType], 'writingRule', XHS_PRODUCTION_INPUT_BINDINGS[noteType].writingRule)
    const sample = await this.resolveBaselineInput(baseline.samples[noteType], 'goldenSample', XHS_PRODUCTION_INPUT_BINDINGS[noteType].goldenSample)
    const skillSnapshotStartedAt = performance.now()
    const s3 = await this.resolveS3(requested.account, baseline.s3[requested.account], resolvedAt)
    const skillSnapshotMs = performance.now() - skillSnapshotStartedAt
    const routes: readonly XhsProductionInputRoute[] = Object.freeze([
      inputRoute('taskCard', taskCard, `requested ${requested.account}/${requested.productionMonth}/${requested.productionWeek}/${requested.note}; status=已确认`),
      inputRoute('writingRule', rule, `taskCard.note_type=${noteType}; exact V3.0 route`),
      inputRoute('goldenSample', sample, `taskCard.note_type=${noteType}; exact formal sample route`),
    ])
    const manifestBase: Omit<XhsProductionSourceManifest, 'manifestHash'> = Object.freeze({
      adapterVersion: XHS_PRODUCTION_SOURCE_ADAPTER_VERSION,
      contractSchemaVersion: XHS_PRODUCTION_SOURCE_CONTRACT_SCHEMA_VERSION,
      identity: Object.freeze({ ...requested, taskId, topicId, noteType }),
      productionEntry: sourceIdentity(productionEntry, entryMetadata.version),
      productionBaseline: sourceIdentity(baselineFile, baseline.version),
      sourceTask: sourceIdentity(sourceTask),
      inputs: routes,
      skillSource: Object.freeze({
        ...sourceIdentity(s3.file, s3.version),
        logicalSkillId: s3.snapshot.skillId,
        formalName: s3.formalName,
        account: requested.account,
        origin: 'vault-root',
        source: 'project-agents',
        provider: S3_PROVIDER,
        snapshotHash: s3.snapshot.snapshotHash,
        routeReason: `account=${requested.account}; exact formal S3 route`,
      }),
      resolvedAt,
    })
    const sourceManifest = Object.freeze({ ...manifestBase, manifestHash: xhsProductionSourceManifestHash(manifestBase) })
    const inputs = Object.freeze(routes.map(route => Object.freeze({
      role: route.role,
      path: toXhsLogicalPath(route.path),
      required: true,
    })))
    return Object.freeze({
      inputs,
      allowedReadFiles: Object.freeze(inputs.map(input => input.path).sort()),
      skillSnapshot: s3.snapshot,
      sourceManifest,
      timing: Object.freeze({
        sourceResolutionMs: performance.now() - resolutionStartedAt,
        skillSnapshotMs,
      }),
    })
  }

  /**
   * Re-read every formal source in one frozen package and reject drift.
   * @param manifest - Durable source identities captured at package creation.
   * @param skillSnapshot - Exact S3 body frozen in the same package.
   */
  async verify(manifest: XhsProductionSourceManifest, skillSnapshot: BusinessSkillSnapshot): Promise<void> {
    await this.verifyInputs(manifest)
    const current = await this.readExactForDrift(manifest.skillSource.path, 'skill')
    if (current.sha256 !== manifest.skillSource.sha256 || current.bytes.byteLength !== manifest.skillSource.bytes) {
      throw skillDrift(manifest.skillSource.logicalSkillId, manifest.skillSource.sha256, current.sha256)
    }
    const currentS3 = this.materializeS3(manifest.skillSource.account, current, manifest.resolvedAt)
    if (currentS3.snapshot.snapshotHash !== skillSnapshot.snapshotHash
      || manifest.skillSource.snapshotHash !== skillSnapshot.snapshotHash) {
      throw skillDrift(manifest.skillSource.logicalSkillId, skillSnapshot.snapshotHash, currentS3.snapshot.snapshotHash)
    }
  }

  /**
   * Re-read the formal non-Skill source identities without materializing S3.
   * @param manifest - Durable source identities captured at package creation.
   * @returns Nothing after every input identity matches.
   */
  async verifyInputs(manifest: XhsProductionSourceManifest): Promise<void> {
    const { manifestHash, ...base } = manifest
    if (xhsProductionSourceManifestHash(base) !== manifestHash) throw invalid('production source manifest hash does not match its fields')
    await this.verifyInputSource(manifest.productionEntry)
    await this.verifyInputSource(manifest.productionBaseline)
    await this.verifyInputSource(manifest.sourceTask)
    for (const input of manifest.inputs) await this.verifyInputSource(input)
  }

  private async resolveBaselineInput(
    binding: BaselineBinding,
    role: 'writingRule' | 'goldenSample',
    expectedProjectPath: string,
  ): Promise<FrozenFile> {
    if (binding.exactPath !== `${XHS_PROJECT_RELATIVE_PATH}/${expectedProjectPath}`) {
      throw invalid(`${role} baseline route does not match the versioned Host mapping`)
    }
    const file = await this.readExact(binding.exactPath, 'input')
    if (file.sha256 !== binding.sha256) throw drift(binding.exactPath, binding.sha256, file.sha256)
    if (!file.relativePath.startsWith(`${XHS_PROJECT_RELATIVE_PATH}/`)) throw invalid(`${role} route is outside the xhs Project`)
    return file
  }

  private async resolveS3(account: XhsProductionAccount, binding: BaselineBinding, resolvedAt: number): Promise<{
    readonly file: FrozenFile
    readonly formalName: string
    readonly version?: string
    readonly snapshot: BusinessSkillSnapshot
  }> {
    const expected = XHS_PRODUCTION_SKILL_BINDINGS[account]
    if (binding.exactPath !== expected.exactSource) throw invalid(`formal S3 mapping for ${account} does not match the Host route`)
    const file = await this.readExact(binding.exactPath, 'skill')
    if (file.sha256 !== binding.sha256) throw skillDrift(expected.skillId, binding.sha256, file.sha256)
    return this.materializeS3(account, file, resolvedAt)
  }

  private materializeS3(account: XhsProductionAccount, file: FrozenFile, resolvedAt: number): {
    readonly file: FrozenFile
    readonly formalName: string
    readonly version?: string
    readonly snapshot: BusinessSkillSnapshot
  } {
    const expected = XHS_PRODUCTION_SKILL_BINDINGS[account]
    const metadata = parseFrontmatter(file.text, `${account} S3`)
    if (metadata.name !== expected.formalName || typeof metadata.description !== 'string' || metadata.description.length === 0) {
      throw invalid(`formal S3 metadata for ${account} does not match the Host route`)
    }
    assertS3Dependencies(file.text, account)
    const definition: SkillDefinition = {
      name: expected.skillId,
      description: metadata.description,
      invocation: Object.freeze({ modelInvocable: false, userInvocable: false }),
      source: 'project-agents',
      provider: S3_PROVIDER,
      path: file.relativePath,
      content: frontmatterBody(file.text),
      metadata,
    }
    const snapshot = materializeSkillSnapshot(definition, resolvedAt)
    return Object.freeze({
      file,
      formalName: expected.formalName,
      ...(typeof metadata.version === 'string' ? { version: metadata.version } : {}),
      snapshot,
    })
  }

  private async verifyInputSource(expected: XhsProductionSourceIdentity): Promise<void> {
    const actual = await this.readExactForDrift(expected.path, 'input')
    if (actual.sha256 !== expected.sha256 || actual.bytes.byteLength !== expected.bytes) {
      throw drift(expected.path, expected.sha256, actual.sha256)
    }
  }

  private async readExactForDrift(path: string, kind: 'input' | 'skill'): Promise<FrozenFile> {
    try {
      return await this.readExact(path, kind)
    } catch (error) {
      if (error instanceof BusinessWorkbenchError && (error.code === 'INPUT_MISSING' || error.code === 'SKILL_NOT_FOUND')) {
        if (kind === 'skill') throw skillDrift(path, undefined, undefined, error)
        throw drift(path, undefined, undefined, error)
      }
      throw error
    }
  }

  private async readExact(relativePath: string, kind: 'input' | 'skill'): Promise<FrozenFile> {
    const safePath = assertSafeRelativePath(relativePath)
    const vault = this.requireVaultRoot()
    const unresolved = resolve(vault, safePath)
    if (!contains(vault, unresolved)) throw denied(safePath)
    try {
      const canonical = await realpath(unresolved)
      if (!contains(vault, canonical)) throw denied(safePath)
      const metadata = await stat(canonical)
      if (!metadata.isFile()) throw denied(safePath)
      const bytes = await readFile(canonical)
      return Object.freeze({ relativePath: safePath, bytes, text: bytes.toString('utf8'), sha256: createHash('sha256').update(bytes).digest('hex') })
    } catch (error) {
      if (error instanceof BusinessWorkbenchError) throw error
      if (hasCode(error, 'ENOENT')) {
        const code = kind === 'skill' ? 'SKILL_NOT_FOUND' : 'INPUT_MISSING'
        throw new BusinessWorkbenchError(code, `business-workbench: required production ${kind} '${safePath}' is missing`, { path: safePath }, { cause: error })
      }
      throw new BusinessWorkbenchError('READ_DENIED', `business-workbench: production source '${safePath}' cannot be read`, { path: safePath }, { cause: error })
    }
  }

  private assertRequest(request: XhsProductionTaskIdentity): void {
    const candidate = request as unknown as Record<string, unknown>
    if (typeof candidate.account !== 'string' || !Object.hasOwn(ACCOUNT_LABELS, candidate.account)
      || typeof candidate.productionMonth !== 'string' || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(candidate.productionMonth)
      || typeof candidate.productionWeek !== 'string' || !/^第\d{2}周$/.test(candidate.productionWeek)
      || typeof candidate.note !== 'string' || !/^note00[1-7]$/.test(candidate.note)) {
      throw invalid('production identity must contain one admitted account, month, week, and note')
    }
  }

  private requireVaultRoot(): string {
    if (this.canonicalVaultRoot === undefined || this.canonicalProjectRoot === undefined) throw new Error('business-workbench: production source resolver is not initialized')
    return this.canonicalVaultRoot
  }
}

function parseBaseline(text: string): ParsedBaseline {
  const root = parseYamlRecord(text, 'production baseline')
  const version = requiredString(root, 'version', 'production baseline')
  const productionEntryPath = requiredString(requiredRecord(root, 'production_entry', 'production baseline'), 'exact_path', 'production entry')
  const s3Source = requiredRecord(root, 's3_accounts', 'production baseline')
  const rulesSource = requiredRecord(root, 'v3_rules', 'production baseline')
  const samplesSource = requiredRecord(root, 'golden_samples', 'production baseline')
  const s3 = Object.fromEntries(Object.keys(ACCOUNT_LABELS).map(account => [account, baselineBinding(requiredRecord(s3Source, account, 's3_accounts'), `s3_accounts.${account}`)])) as unknown as Readonly<Record<XhsProductionAccount, BaselineBinding>>
  const rules = Object.fromEntries(Object.entries(BASELINE_KEYS).map(([noteType, key]) => [noteType, baselineBinding(requiredRecord(rulesSource, key, 'v3_rules'), `v3_rules.${key}`)])) as unknown as Readonly<Record<XhsProductionNoteType, BaselineBinding>>
  const samples = Object.fromEntries(Object.entries(BASELINE_KEYS).map(([noteType, key]) => [noteType, baselineBinding(requiredRecord(samplesSource, key, 'golden_samples'), `golden_samples.${key}`)])) as unknown as Readonly<Record<XhsProductionNoteType, BaselineBinding>>
  return Object.freeze({ version, productionEntryPath: assertSafeRelativePath(productionEntryPath), s3, rules, samples })
}

function baselineBinding(value: Readonly<Record<string, unknown>>, name: string): BaselineBinding {
  const exactPath = assertSafeRelativePath(requiredString(value, 'exact_path', name))
  const sha256 = requiredString(value, 'sha256', name)
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw invalid(`${name}.sha256 is not a SHA-256 digest`)
  return Object.freeze({ exactPath, sha256 })
}

function parseFrontmatter(text: string, name: string): Readonly<Record<string, unknown>> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (match === null) throw invalid(`${name} has no YAML frontmatter`)
  const body = match[1]
  if (body === undefined) throw invalid(`${name} has invalid YAML frontmatter`)
  return parseYamlRecord(body, name)
}

function frontmatterBody(text: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(text)
  if (match === null) throw invalid('formal S3 has no YAML frontmatter')
  return text.slice(match[0].length)
}

function parseYamlRecord(text: string, name: string): Readonly<Record<string, unknown>> {
  const document = parseDocument(text, { uniqueKeys: true })
  if (document.errors.length > 0) throw invalid(`${name} contains invalid or duplicate YAML fields`)
  const value: unknown = document.toJS()
  if (!isRecord(value)) throw invalid(`${name} must be a YAML mapping`)
  return value
}

function parseTaskCardMachineFields(text: string): ReadonlyMap<string, string> {
  const fields = new Map<string, string>()
  for (const match of text.matchAll(/^> - ([a-z][a-z0-9_]*?)：(.+)$/gm)) {
    const key = match[1]
    const value = match[2]
    if (key === undefined || value === undefined) throw invalid('task card contains an invalid machine field')
    if (fields.has(key)) throw invalid(`task card contains duplicate machine field '${key}'`)
    fields.set(key, value.trim())
  }
  return fields
}

function assertS3Dependencies(text: string, account: XhsProductionAccount): void {
  const section = /## 1｜输入（四输入）\r?\n([\s\S]*?)(?=\r?\n---|\r?\n## )/.exec(text)?.[1]
  if (section === undefined || !/单篇(?:正式)?生产只允许读取以下4个输入/.test(section)) {
    throw invalid(`formal S3 for ${account} does not declare the frozen four-input contract`)
  }
  const labels = [...section.matchAll(/^\d+\. \*\*(.+?)\*\*/gm)].map(match => match[1])
  const expected = ['当前写作任务卡', '本 Skill', 'V3.0 正式规范', '黄金样稿']
  if (JSON.stringify(labels) !== JSON.stringify(expected)) {
    throw invalid(`formal S3 for ${account} declares an unsupported hard dependency`)
  }
}

function requiredField(fields: ReadonlyMap<string, string>, key: string): string {
  const value = fields.get(key)
  if (value === undefined || value.length === 0) throw invalid(`task card is missing machine field '${key}'`)
  return value
}

function requiredRecord(source: Readonly<Record<string, unknown>>, key: string, name: string): Readonly<Record<string, unknown>> {
  const value = source[key]
  if (!isRecord(value)) throw invalid(`${name}.${key} must be a mapping`)
  return value
}

function requiredString(source: Readonly<Record<string, unknown>>, key: string, name: string): string {
  const value = source[key]
  if (typeof value !== 'string' || value.length === 0) throw invalid(`${name}.${key} must be a non-empty string`)
  return value
}

function sourceAllowedTopics(source: Readonly<Record<string, unknown>>): readonly string[] {
  const value = source.allowed_topics
  if (!Array.isArray(value) || value.some(topic => typeof topic !== 'string' || topic.length === 0)) {
    throw invalid('source task allowed_topics must be a non-empty string list')
  }
  const topics = value as string[]
  if (new Set(topics).size !== topics.length) throw invalid('source task allowed_topics contains duplicates')
  return Object.freeze([...topics])
}

function sourceNoteType(value: unknown): XhsProductionNoteType | undefined {
  return typeof value === 'string' ? SOURCE_NOTE_TYPE_VALUES[value] : undefined
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sourceIdentity(file: FrozenFile, version?: string): XhsProductionSourceIdentity {
  return Object.freeze({
    path: file.relativePath,
    sha256: file.sha256,
    bytes: file.bytes.byteLength,
    ...(version === undefined ? {} : { version }),
  })
}

function inputRoute(role: XhsProductionInputRoute['role'], file: FrozenFile, routeReason: string): XhsProductionInputRoute {
  return Object.freeze({ role, ...sourceIdentity(file), routeReason })
}

function toXhsLogicalPath(vaultRelativePath: string): string {
  const prefix = `${XHS_PROJECT_RELATIVE_PATH}/`
  if (!vaultRelativePath.startsWith(prefix)) throw invalid('production input is outside the xhs Project')
  return `xhs/${vaultRelativePath.slice(prefix.length)}`
}

function assertSafeRelativePath(value: string): string {
  if (value.length === 0 || value.includes('\\') || isAbsolute(value) || win32.isAbsolute(value) || posix.normalize(value) !== value) throw denied(value)
  const segments = value.split('/')
  if (segments.some(segment => segment.length === 0 || segment === '.' || segment === '..' || segment.includes('归档') || segment.includes('历史') || ARCHIVE_SEGMENT.test(segment))) throw denied(value)
  return value
}

function contains(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

function invalid(message: string, cause?: unknown): BusinessWorkbenchError {
  return new BusinessWorkbenchError('XHS_BODY_INPUT_INVALID', `business-workbench: ${message}`, {}, cause === undefined ? undefined : { cause })
}

function denied(path: string): BusinessWorkbenchError {
  return new BusinessWorkbenchError('READ_DENIED', `business-workbench: production source '${path}' is outside the exact source policy`, { path })
}

function drift(path: string, expectedHash?: string, actualHash?: string, cause?: unknown): BusinessWorkbenchError {
  return new BusinessWorkbenchError('INPUT_DRIFT', `business-workbench: frozen production source '${path}' changed`, {
    path,
    ...(expectedHash === undefined ? {} : { expectedHash }),
    ...(actualHash === undefined ? {} : { actualHash }),
  }, cause === undefined ? undefined : { cause })
}

function skillDrift(subjectId: string, expectedHash?: string, actualHash?: string, cause?: unknown): BusinessWorkbenchError {
  return new BusinessWorkbenchError('SKILL_DRIFT', `business-workbench: frozen production Skill '${subjectId}' changed`, {
    subjectId,
    ...(expectedHash === undefined ? {} : { expectedHash }),
    ...(actualHash === undefined ? {} : { actualHash }),
  }, cause === undefined ? undefined : { cause })
}

/** Exact workflow identifier reused by production package construction. */
export const XHS_PRODUCTION_WORKFLOW_VERSION = XHS_BODY_PREPARE_CONTRACT.workflowVersion
