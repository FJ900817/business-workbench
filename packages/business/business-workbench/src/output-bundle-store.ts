/** Private immutable storage for three-file XHS output bundles. */

import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { chmod, mkdir, open, readFile, readdir, realpath, rename, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path'
import { BusinessWorkbenchError } from './errors.ts'
import type {
  BusinessOrphanOutputBundle,
  BusinessOutputBundle,
  BusinessOutputBundleReconciliation,
  BusinessOutputBundleId,
} from './types.ts'
import { assertXhsOutputBundle, outputBundleContent } from './xhs-output-bundle.ts'
import type { XhsOutputBundleFiles } from './xhs-output-bundle.ts'

/** Opaque staged directory retained until publication succeeds. */
export interface BusinessOutputBundleStage {
  readonly bundleId: BusinessOutputBundleId
  readonly path: string
}

function contains(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

function hasCode(error: unknown, ...codes: string[]): boolean {
  return error instanceof Error && 'code' in error && codes.includes(String(error.code))
}

async function durableWrite(path: string, content: string): Promise<void> {
  const handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
  try {
    await handle.writeFile(content, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function syncDirectory(path: string): Promise<void> {
  /* v8 ignore next -- Windows cannot open directory handles. */
  if (process.platform === 'win32') return
  /* v8 ignore start -- exercised by POSIX integration tests. */
  const handle = await open(path, constants.O_RDONLY)
  try { await handle.sync() } finally { await handle.close() }
  /* v8 ignore stop */
}

/** Local stage-then-publish store; only durable Job state makes a bundle authoritative. */
export class BusinessOutputBundleStore {
  private canonicalRoot?: string
  private stagingRoot?: string

  /** @param root - Business Workbench root shared with ordinary Artifacts. */
  constructor(readonly root: string) {}

  /** Create owner-private output roots. */
  async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    await chmod(this.root, 0o700)
    this.canonicalRoot = await realpath(this.root)
    const staging = join(this.canonicalRoot, 'tmp', 'output-bundles')
    await mkdir(staging, { recursive: true, mode: 0o700 })
    await chmod(staging, 0o700)
    this.stagingRoot = await realpath(staging)
  }

  /**
   * Write a complete validated bundle below the non-authoritative staging root.
   * @param bundle - immutable output manifest.
   * @param files - exact three output bodies.
   * @returns staged identity for publication.
   */
  async stage(bundle: BusinessOutputBundle, files: XhsOutputBundleFiles): Promise<BusinessOutputBundleStage> {
    assertXhsOutputBundle(bundle, files)
    const directory = join(this.requireStagingRoot(), `${bundle.id}.${randomUUID()}`)
    try {
      await mkdir(directory, { mode: 0o700 })
      for (const entry of bundle.entries) await durableWrite(join(directory, entry.name), files[entry.name])
      await durableWrite(join(directory, 'output-manifest.json'), `${JSON.stringify(bundle, null, 2)}\n`)
      await syncDirectory(directory)
      return Object.freeze({ bundleId: bundle.id, path: directory })
    } catch (error) {
      await rm(directory, { recursive: true, force: true }).catch(() => {})
      if (error instanceof BusinessWorkbenchError) throw error
      throw new BusinessWorkbenchError('OUTPUT_BUNDLE_WRITE_FAILED', `business-workbench: failed to stage output bundle '${bundle.id}'`, { subjectId: bundle.id }, { cause: error })
    }
  }

  /**
   * Atomically publish one staged directory without making it authoritative.
   * @param stage - staged directory returned by {@link stage}.
   * @param bundle - matching immutable manifest.
   * @param files - exact file bodies used to verify an idempotent existing target.
   */
  async publish(stage: BusinessOutputBundleStage, bundle: BusinessOutputBundle, files: XhsOutputBundleFiles): Promise<void> {
    if (stage.bundleId !== bundle.id || !contains(this.requireStagingRoot(), resolve(stage.path))) {
      throw new BusinessWorkbenchError('OUTPUT_BUNDLE_CONFLICT', `business-workbench: invalid stage for output bundle '${bundle.id}'`, { subjectId: bundle.id })
    }
    const target = this.target(bundle)
    await mkdir(dirname(target), { recursive: true, mode: 0o700 })
    try {
      await rename(stage.path, target)
      await syncDirectory(dirname(target))
    } catch (error) {
      if (!hasCode(error, 'EEXIST', 'ENOTEMPTY')) {
        throw new BusinessWorkbenchError('OUTPUT_BUNDLE_WRITE_FAILED', `business-workbench: failed to publish output bundle '${bundle.id}'`, { subjectId: bundle.id }, { cause: error })
      }
      await this.read(bundle)
      await rm(stage.path, { recursive: true, force: true })
      assertXhsOutputBundle(bundle, files)
    }
  }

  /**
   * Read and verify all authoritative bundle bytes.
   * @param bundle - durable bundle manifest to locate and verify.
   * @returns verified manifest and its three file bodies.
   */
  async read(bundle: BusinessOutputBundle): Promise<ReturnType<typeof outputBundleContent>> {
    const target = this.target(bundle)
    try {
      const files = {
        'draft.md': await readFile(join(target, 'draft.md'), 'utf8'),
        'draft-metadata.json': await readFile(join(target, 'draft-metadata.json'), 'utf8'),
        'provenance.json': await readFile(join(target, 'provenance.json'), 'utf8'),
      } as const
      const manifest = JSON.parse(await readFile(join(target, 'output-manifest.json'), 'utf8')) as BusinessOutputBundle
      assertXhsOutputBundle(manifest, files)
      if (manifest.id !== bundle.id || manifest.manifestHash !== bundle.manifestHash) {
        throw new BusinessWorkbenchError('OUTPUT_BUNDLE_CORRUPT', `business-workbench: output bundle '${bundle.id}' manifest differs from durable state`, { subjectId: bundle.id })
      }
      assertXhsOutputBundle(bundle, files)
      return outputBundleContent(bundle, files)
    } catch (error) {
      if (error instanceof BusinessWorkbenchError) throw error
      if (hasCode(error, 'ENOENT')) throw new BusinessWorkbenchError('OUTPUT_BUNDLE_MISSING', `business-workbench: output bundle '${bundle.id}' is missing`, { subjectId: bundle.id }, { cause: error })
      throw new BusinessWorkbenchError('OUTPUT_BUNDLE_CORRUPT', `business-workbench: output bundle '${bundle.id}' cannot be verified`, { subjectId: bundle.id }, { cause: error })
    }
  }

  /**
   * Discover published and staging directories absent from durable references.
   * @param referencedPaths - relative bundle paths named by durable Jobs.
   * @returns referenced count and orphan summaries.
   */
  async reconcile(referencedPaths: ReadonlySet<string>): Promise<BusinessOutputBundleReconciliation> {
    const orphans: BusinessOrphanOutputBundle[] = []
    const visit = async (directory: string): Promise<void> => {
      let entries: import('node:fs').Dirent<string>[]
      try { entries = await readdir(directory, { withFileTypes: true, encoding: 'utf8' }) } catch (error) {
        if (hasCode(error, 'ENOENT')) return
        throw error
      }
      for (const entry of entries) {
        if (entry.isSymbolicLink() || !entry.isDirectory()) continue
        const absolute = join(directory, entry.name)
        if (/^output_bundle_[a-f0-9]{64}$/.test(entry.name)) {
          const portable = relative(this.requireRoot(), absolute).split(sep).join(posix.sep)
          if (!referencedPaths.has(portable)) orphans.push(Object.freeze({ path: portable, kind: 'published' as const }))
        } else await visit(absolute)
      }
    }
    await visit(join(this.requireRoot(), 'projects'))
    for (const entry of await readdir(this.requireStagingRoot(), { withFileTypes: true, encoding: 'utf8' })) {
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        orphans.push(Object.freeze({ path: relative(this.requireRoot(), join(this.requireStagingRoot(), entry.name)).split(sep).join(posix.sep), kind: 'staging' as const }))
      }
    }
    orphans.sort((left, right) => left.path.localeCompare(right.path))
    return Object.freeze({ referencedCount: referencedPaths.size, orphanBundles: Object.freeze(orphans) })
  }

  private target(bundle: BusinessOutputBundle): string {
    const target = resolve(this.requireRoot(), bundle.path)
    if (!contains(this.requireRoot(), target)) throw new BusinessWorkbenchError('OUTPUT_BUNDLE_CORRUPT', `business-workbench: output bundle '${bundle.id}' escapes its root`, { subjectId: bundle.id })
    return target
  }

  private requireRoot(): string {
    if (this.canonicalRoot === undefined) throw new Error('business-workbench: output-bundle store is not initialized')
    return this.canonicalRoot
  }

  private requireStagingRoot(): string {
    if (this.stagingRoot === undefined) throw new Error('business-workbench: output-bundle store is not initialized')
    return this.stagingRoot
  }
}
