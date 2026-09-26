/** Immutable, owner-private text Artifact storage below one Harness home. */

import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { chmod, link, mkdir, open, readFile, readdir, realpath, rm, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path'
import { canonicalizeWatchPath } from '@deepseek-ai/dsh-home-paths'
import { BusinessWorkbenchError } from './errors.ts'
import type {
  BusinessArtifact,
  BusinessArtifactContent,
  BusinessArtifactVerification,
  BusinessArtifactReconciliation,
  BusinessOrphanArtifact,
} from './types.ts'

/**
 * SHA-256 of one UTF-8 string.
 * @param content - Complete UTF-8 content.
 * @returns the lowercase hexadecimal digest.
 */
export function sha256Text(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

/** Return whether `child` is at or below `parent` after canonical resolution. */
function contains(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

/** Fsync a POSIX directory after publication; Windows journals the entry. */
async function syncDirectory(path: string): Promise<void> {
  /* v8 ignore next -- Windows cannot open directory handles. */
  if (process.platform === 'win32') return
  /* v8 ignore start -- exercised by POSIX integration tests, unavailable on Windows. */
  const handle = await open(path, constants.O_RDONLY)
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
  /* v8 ignore stop */
}

/** Error-code guard for filesystem races. */
function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

/**
 * Compute the only valid portable path for one Artifact reference.
 * @param artifact - Artifact identity and owning hierarchy.
 * @returns the relative POSIX path below the Artifact root.
 */
export function artifactRelativePath(artifact: Pick<BusinessArtifact,
  'artifactId' | 'jobId' | 'attemptId' | 'type'> & { readonly batchId: string }): string {
  return posix.join(
    'projects',
    'xhs',
    'batches',
    artifact.batchId,
    'jobs',
    artifact.jobId,
    'attempts',
    artifact.attemptId,
    artifact.type,
    `${artifact.artifactId}.md`,
  )
}

/** Local immutable Artifact store with no model-facing or Obsidian access. */
export class BusinessArtifactStore {
  private canonicalRoot?: string
  private stagingRoot?: string

  /** @param root - Absolute versioned Artifact root below the selected DSH home. */
  constructor(readonly root: string) {}

  /** Create and canonicalize the private Artifact and staging roots. */
  async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    await chmod(this.root, 0o700)
    this.canonicalRoot = await realpath(this.root)
    const staging = join(this.canonicalRoot, 'tmp')
    await mkdir(staging, { recursive: true, mode: 0o700 })
    await chmod(staging, 0o700)
    this.stagingRoot = await realpath(staging)
  }

  /**
   * Publish one complete UTF-8 Artifact with no-overwrite semantics. Equal
   * bytes at the same deterministic path are an idempotent success.
   * @param artifact - Durable reference whose path, hash, and size describe `content`.
   * @param batchId - Owning Batch used to recompute the canonical relative path.
   * @param content - Complete Artifact body.
   */
  async commit(artifact: BusinessArtifact, batchId: string, content: string): Promise<void> {
    const bytes = Buffer.byteLength(content, 'utf8')
    const hash = sha256Text(content)
    if (artifact.hash !== hash || artifact.bytes !== bytes) {
      throw new BusinessWorkbenchError(
        'ARTIFACT_CORRUPT',
        `business-workbench: Artifact '${artifact.artifactId}' metadata does not match its content`,
        { subjectId: artifact.artifactId },
      )
    }
    const target = await this.target(artifact, batchId, true)
    const directory = dirname(target)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    await chmod(directory, 0o700)
    const canonicalDirectory = await realpath(directory)
    if (!contains(this.requireRoot(), canonicalDirectory)) {
      throw new BusinessWorkbenchError(
        'ARTIFACT_WRITE_FAILED',
        `business-workbench: Artifact '${artifact.artifactId}' directory escapes the Artifact root`,
        { subjectId: artifact.artifactId },
      )
    }

    const temporary = join(this.requireStagingRoot(), randomUUID())
    let handle: Awaited<ReturnType<typeof open>> | undefined
    try {
      handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
      await handle.writeFile(content, 'utf8')
      await handle.sync()
      await handle.close()
      handle = undefined
      try {
        await link(temporary, target)
      } catch (error) {
        if (!hasCode(error, 'EEXIST')) throw error
        await this.verifyBytes(artifact, target)
      }
      await syncDirectory(directory)
      await unlink(temporary)
    } catch (error) {
      if (handle !== undefined) await handle.close().catch(() => {})
      await rm(temporary, { force: true }).catch(() => {})
      if (error instanceof BusinessWorkbenchError) throw error
      throw new BusinessWorkbenchError(
        'ARTIFACT_WRITE_FAILED',
        `business-workbench: failed to publish Artifact '${artifact.artifactId}'`,
        { subjectId: artifact.artifactId },
        { cause: error },
      )
    }
  }

  /**
   * Read one Artifact only after verifying its path, byte count, and hash.
   * @param artifact - Durable Artifact reference.
   * @param batchId - Owning Batch used to verify the canonical path.
   * @returns the verified reference and UTF-8 body.
   */
  async read(artifact: BusinessArtifact, batchId: string): Promise<BusinessArtifactContent> {
    const target = await this.target(artifact, batchId, false)
    let content: string
    try {
      content = await readFile(target, 'utf8')
    } catch (error) {
      if (hasCode(error, 'ENOENT')) {
        throw new BusinessWorkbenchError(
          'ARTIFACT_MISSING',
          `business-workbench: Artifact '${artifact.artifactId}' is missing`,
          { subjectId: artifact.artifactId },
          { cause: error },
        )
      }
      throw new BusinessWorkbenchError(
        'ARTIFACT_CORRUPT',
        `business-workbench: Artifact '${artifact.artifactId}' cannot be read`,
        { subjectId: artifact.artifactId },
        { cause: error },
      )
    }
    this.assertContent(artifact, content)
    return Object.freeze({ artifact, content })
  }

  /**
   * Verify one Artifact without returning its body.
   * @param artifact - Durable Artifact reference.
   * @param batchId - Owning Batch used to verify the canonical path.
   * @returns the verified identity, hash, and byte count.
   */
  async verify(artifact: BusinessArtifact, batchId: string): Promise<BusinessArtifactVerification> {
    const { content } = await this.read(artifact, batchId)
    return Object.freeze({
      artifactId: artifact.artifactId,
      hash: artifact.hash,
      bytes: Buffer.byteLength(content, 'utf8'),
    })
  }

  /**
   * Discover valid Artifact-looking files absent from durable references.
   * The scan never follows symbolic links and never deletes or promotes data.
   * @param referencedPaths - Portable Artifact paths named by durable Jobs.
   * @returns referenced count and verified orphan summaries.
   */
  async reconcile(referencedPaths: ReadonlySet<string>): Promise<BusinessArtifactReconciliation> {
    const projectsRoot = join(this.requireRoot(), 'projects')
    const orphans: BusinessOrphanArtifact[] = []
    const visit = async (directory: string): Promise<void> => {
      let entries: import('node:fs').Dirent<string>[]
      try {
        entries = await readdir(directory, { withFileTypes: true, encoding: 'utf8' })
      } catch (error) {
        if (hasCode(error, 'ENOENT')) return
        throw error
      }
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue
        const absolute = join(directory, entry.name)
        if (entry.isDirectory()) {
          await visit(absolute)
          continue
        }
        if (!entry.isFile() || !/^artifact_[a-f0-9]{64}\.md$/.test(entry.name)) continue
        const portable = relative(this.requireRoot(), absolute).split(sep).join(posix.sep)
        if (referencedPaths.has(portable)) continue
        const content = await readFile(absolute)
        orphans.push(Object.freeze({
          path: portable,
          hash: createHash('sha256').update(content).digest('hex'),
          bytes: content.byteLength,
        }))
      }
    }
    await visit(projectsRoot)
    orphans.sort((left, right) => left.path.localeCompare(right.path))
    return Object.freeze({ referencedCount: referencedPaths.size, orphanArtifacts: Object.freeze(orphans) })
  }

  private async target(artifact: BusinessArtifact, batchId: string, mayBeMissing: boolean): Promise<string> {
    const expected = artifactRelativePath({ ...artifact, batchId })
    if (artifact.path !== expected) {
      throw new BusinessWorkbenchError(
        'ARTIFACT_CORRUPT',
        `business-workbench: Artifact '${artifact.artifactId}' has an invalid stored path`,
        { subjectId: artifact.artifactId },
      )
    }
    const unresolved = resolve(this.requireRoot(), expected)
    if (!contains(this.requireRoot(), unresolved)) {
      throw new BusinessWorkbenchError(
        'ARTIFACT_CORRUPT',
        `business-workbench: Artifact '${artifact.artifactId}' path escapes the Artifact root`,
        { subjectId: artifact.artifactId },
      )
    }
    try {
      const canonical = mayBeMissing
        ? await canonicalizeWatchPath(unresolved)
        : await realpath(unresolved)
      if (!contains(this.requireRoot(), canonical)) {
        throw new BusinessWorkbenchError(
          'ARTIFACT_CORRUPT',
          `business-workbench: Artifact '${artifact.artifactId}' resolves outside the Artifact root`,
          { subjectId: artifact.artifactId },
        )
      }
      return canonical
    } catch (error) {
      if (!mayBeMissing && hasCode(error, 'ENOENT')) return unresolved
      throw error
    }
  }

  private async verifyBytes(artifact: BusinessArtifact, target: string): Promise<void> {
    let existing: string
    try {
      existing = await readFile(target, 'utf8')
    } catch (error) {
      throw new BusinessWorkbenchError(
        'ARTIFACT_CONFLICT',
        `business-workbench: existing Artifact '${artifact.artifactId}' cannot be verified`,
        { subjectId: artifact.artifactId },
        { cause: error },
      )
    }
    this.assertContent(artifact, existing, 'ARTIFACT_CONFLICT')
  }

  private assertContent(
    artifact: BusinessArtifact,
    content: string,
    code: 'ARTIFACT_CORRUPT' | 'ARTIFACT_CONFLICT' = 'ARTIFACT_CORRUPT',
  ): void {
    if (Buffer.byteLength(content, 'utf8') !== artifact.bytes || sha256Text(content) !== artifact.hash) {
      throw new BusinessWorkbenchError(
        code,
        `business-workbench: Artifact '${artifact.artifactId}' failed hash or size verification`,
        { subjectId: artifact.artifactId },
      )
    }
  }

  private requireRoot(): string {
    if (this.canonicalRoot === undefined) throw new Error('business-workbench: Artifact store is not initialized')
    return this.canonicalRoot
  }

  private requireStagingRoot(): string {
    if (this.stagingRoot === undefined) throw new Error('business-workbench: Artifact store is not initialized')
    return this.stagingRoot
  }
}
