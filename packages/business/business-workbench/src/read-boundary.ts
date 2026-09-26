/** Host-side read policy and frozen input verification for Business execution. */

import { createHash } from 'node:crypto'
import { realpath, readFile, stat } from 'node:fs/promises'
import { isAbsolute, posix, relative, resolve, sep, win32 } from 'node:path'
import { BusinessWorkbenchError } from './errors.ts'
import type {
  BusinessExecutionInput,
  BusinessExecutionInputRequest,
  BusinessExecutionPackage,
} from './types.ts'

/** Physical directories mounted behind the fixed Business logical roots. */
export interface BusinessReadRoots {
  /** Source directory exposed through `xhs/**`. */
  readonly xhs: string
  /** Optional product-truth directory exposed through `shared/product-truth/**`. */
  readonly sharedProductTruth?: string
  /** Host-owned immutable Artifact root; configured only by BusinessWorkbenchService. */
  readonly businessArtifacts?: string
}

type BusinessReadRootName = keyof BusinessReadRoots

interface LogicalReadRoot {
  readonly prefix: string
  readonly name: BusinessReadRootName
}

const LOGICAL_READ_ROOTS: readonly LogicalReadRoot[] = Object.freeze([
  { prefix: 'business-artifacts', name: 'businessArtifacts' },
  { prefix: 'shared/product-truth', name: 'sharedProductTruth' },
  { prefix: 'xhs', name: 'xhs' },
])

/**
 * SHA-256 of an execution-package manifest without its `manifestHash` field.
 * @param value - Complete semantic manifest fields in durable property order.
 * @returns the lowercase hexadecimal digest.
 */
export function executionPackageHash(
  value: Omit<BusinessExecutionPackage, 'manifestHash'>,
): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

/**
 * Normalize and reject traversal, absolute, and platform-ambiguous paths.
 * @param value - Caller-provided relative path.
 * @returns the admitted relative POSIX path.
 */
export function normalizeBusinessReadPath(value: string): string {
  if (value.length === 0 || value.includes('\\') || isAbsolute(value) || win32.isAbsolute(value)) {
    throw new BusinessWorkbenchError('PATH_INVALID', 'business-workbench: read path must be a relative POSIX path', { path: value })
  }
  const segments = value.split('/')
  if (segments.some(segment => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new BusinessWorkbenchError('PATH_INVALID', 'business-workbench: read path contains an invalid segment', { path: value })
  }
  const normalized = posix.normalize(value)
  if (normalized !== value || !isAdmittedProjectPath(normalized)) {
    throw new BusinessWorkbenchError('READ_DENIED', `business-workbench: read path '${value}' is outside the xhs Project policy`, { path: value })
  }
  return normalized
}

/**
 * Sort and deduplicate one declaration list after path validation.
 * @param values - Caller-provided path declarations.
 * @returns immutable normalized paths.
 */
export function normalizeBusinessReadPaths(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map(normalizeBusinessReadPath))].sort())
}

/**
 * Sort and deduplicate one nonblank declarative name list.
 * @param values - Caller-provided names.
 * @param field - Field name used in safe diagnostics.
 * @returns immutable normalized names.
 */
export function normalizeBusinessNames(values: readonly string[], field: string): readonly string[] {
  const normalized = values.map((value) => {
    const trimmed = value.trim()
    if (trimmed.length === 0) {
      throw new BusinessWorkbenchError('INVALID_OPERATION', `business-workbench: ${field} contains a blank value`)
    }
    return trimmed
  })
  return Object.freeze([...new Set(normalized)].sort())
}

/** Return whether `child` is at or below `parent`. */
function contains(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

/** Admit only Project-local sources and the one shared truth root. */
function isAdmittedProjectPath(path: string): boolean {
  return path.startsWith('xhs/') || path.startsWith('business-artifacts/')
    || path === 'shared/product-truth' || path.startsWith('shared/product-truth/')
}

/** Detect filesystem absence without swallowing other failures. */
function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

/** Host resolver that never scans outside explicitly named input files. */
export class BusinessReadBoundary {
  private canonicalRoots?: ReadonlyMap<BusinessReadRootName, string>

  /** @param roots - Existing source directories mounted behind fixed logical names. */
  constructor(readonly roots: BusinessReadRoots) {}

  /** Canonicalize every configured read root without modifying it. */
  async initialize(): Promise<void> {
    const canonicalRoots = new Map<BusinessReadRootName, string>()
    for (const { name } of LOGICAL_READ_ROOTS) {
      const root = this.roots[name]
      if (root === undefined) continue
      try {
        const metadata = await stat(root)
        if (!metadata.isDirectory()) throw new Error('configured read root is not a directory')
        canonicalRoots.set(name, await realpath(root))
      } catch (error) {
        throw new BusinessWorkbenchError(
          'READ_ROOT_UNAVAILABLE',
          `business-workbench: configured '${name}' read root is unavailable`,
          {},
          { cause: error },
        )
      }
    }
    this.canonicalRoots = canonicalRoots
  }

  /**
   * Return the canonical root used for Project-scoped Skill resolution.
   * @returns the canonical XHS Project root.
   */
  projectRoot(): string {
    if (this.canonicalRoots === undefined) throw new Error('business-workbench: read boundary is not initialized')
    const root = this.canonicalRoots.get('xhs')
    if (root === undefined) throw new BusinessWorkbenchError('READ_ROOT_UNAVAILABLE', "business-workbench: configured 'xhs' read root is unavailable")
    return root
  }

  /**
   * Freeze exact input metadata after validating the package declarations.
   * @param requests - Exact files and their business roles.
   * @param allowedRoots - Declared directory prefixes.
   * @param allowedFiles - Declared exact files.
   * @returns normalized frozen input entries in request order.
   */
  async freezeInputs(
    requests: readonly BusinessExecutionInputRequest[],
    allowedRoots: readonly string[],
    allowedFiles: readonly string[],
  ): Promise<readonly BusinessExecutionInput[]> {
    if (requests.length === 0) {
      throw new BusinessWorkbenchError('INVALID_OPERATION', 'business-workbench: execution package requires at least one input')
    }
    const seen = new Set<string>()
    const inputs: BusinessExecutionInput[] = []
    for (const request of requests) {
      const role = request.role.trim()
      if (role.length === 0) throw new BusinessWorkbenchError('INVALID_OPERATION', 'business-workbench: input role must not be blank')
      const path = normalizeBusinessReadPath(request.path)
      if (seen.has(path)) throw new BusinessWorkbenchError('INVALID_OPERATION', `business-workbench: duplicate input '${path}'`, { path })
      seen.add(path)
      this.assertDeclared(path, allowedRoots, allowedFiles)
      const bytes = await this.readPath(path, request.required)
      inputs.push(Object.freeze(bytes === undefined
        ? { role, path, required: request.required, present: false }
        : {
          role,
          path,
          required: request.required,
          present: true,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          bytes: bytes.byteLength,
        }))
    }
    return Object.freeze(inputs)
  }

  /**
   * Read and verify one frozen input, failing when bytes drifted.
   * @param input - Frozen input metadata.
   * @returns the verified UTF-8 content.
   */
  async readFrozenInput(input: BusinessExecutionInput): Promise<string> {
    const bytes = await this.readPath(input.path, input.required)
    if (bytes === undefined) {
      if (input.present) throw this.drift(input, undefined)
      return ''
    }
    const hash = createHash('sha256').update(bytes).digest('hex')
    if (!input.present || input.sha256 !== hash || input.bytes !== bytes.byteLength) throw this.drift(input, hash)
    return bytes.toString('utf8')
  }

  private assertDeclared(path: string, roots: readonly string[], files: readonly string[]): void {
    const fileAllowed = files.includes(path)
    const rootAllowed = roots.some(root => path === root || path.startsWith(`${root}/`))
    if (!fileAllowed && !rootAllowed) {
      throw new BusinessWorkbenchError('READ_DENIED', `business-workbench: input '${path}' is not in the execution package allow-list`, { path })
    }
  }

  private async readPath(path: string, required: boolean): Promise<Buffer | undefined> {
    const { root, relativePath } = this.resolveLogicalPath(path)
    const unresolved = resolve(root, relativePath)
    if (!contains(root, unresolved)) throw new BusinessWorkbenchError('READ_DENIED', `business-workbench: input '${path}' escapes the read root`, { path })
    try {
      const canonical = await realpath(unresolved)
      if (!contains(root, canonical)) throw new BusinessWorkbenchError('READ_DENIED', `business-workbench: input '${path}' resolves outside the read root`, { path })
      const metadata = await stat(canonical)
      if (!metadata.isFile()) throw new BusinessWorkbenchError('READ_DENIED', `business-workbench: input '${path}' is not a regular file`, { path })
      return await readFile(canonical)
    } catch (error) {
      if (isMissing(error)) {
        if (!required) return undefined
        throw new BusinessWorkbenchError('INPUT_MISSING', `business-workbench: required input '${path}' is missing`, { path }, { cause: error })
      }
      if (error instanceof BusinessWorkbenchError) throw error
      throw new BusinessWorkbenchError('READ_DENIED', `business-workbench: input '${path}' cannot be read`, { path }, { cause: error })
    }
  }

  private drift(input: BusinessExecutionInput, actualHash: string | undefined): BusinessWorkbenchError {
    return new BusinessWorkbenchError('INPUT_DRIFT', `business-workbench: frozen input '${input.path}' changed`, {
      path: input.path,
      ...(input.sha256 === undefined ? {} : { expectedHash: input.sha256 }),
      ...(actualHash === undefined ? {} : { actualHash }),
    })
  }

  private resolveLogicalPath(path: string): { readonly root: string; readonly relativePath: string } {
    if (this.canonicalRoots === undefined) throw new Error('business-workbench: read boundary is not initialized')
    const logicalRoot = LOGICAL_READ_ROOTS.find(candidate => path === candidate.prefix || path.startsWith(`${candidate.prefix}/`))
    if (logicalRoot === undefined) throw new Error(`business-workbench: normalized path '${path}' has no logical root`)
    const root = this.canonicalRoots.get(logicalRoot.name)
    if (root === undefined) {
      throw new BusinessWorkbenchError(
        'READ_DENIED',
        `business-workbench: logical read root '${logicalRoot.prefix}' is not configured`,
        { path },
      )
    }
    return { root, relativePath: path === logicalRoot.prefix ? '' : path.slice(logicalRoot.prefix.length + 1) }
  }
}
