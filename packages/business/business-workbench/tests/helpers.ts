import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import BusinessWorkbenchService from '../src/index.ts'
import type {
  BusinessInputReference,
  CreateQuadBusinessBatchRequest,
  CreateSingleBusinessBatchRequest,
} from '../src/index.ts'
import type { RestrictedAgentModelConfig } from '../src/host-policy.ts'

/** Deterministic input reference for one test-card slot. */
export function input(index: number): BusinessInputReference {
  const reference = `task-card-${index}.md`
  return Object.freeze({
    reference,
    sha256: createHash('sha256').update(reference).digest('hex'),
  })
}

/** Four-participant Batch request used by existing isolation tests. */
export function batchRequest(idempotencyKey = 'create-batch-1'): CreateQuadBusinessBatchRequest {
  return {
    idempotencyKey,
    project: 'xhs',
    type: 'xhs-body',
    mode: 'quad',
    inputs: [input(1), input(2), input(3), input(4)],
  }
}

/** Single-participant Batch request used by single-Job persistence tests. */
export function singleBatchRequest(idempotencyKey = 'create-single-batch-1'): CreateSingleBusinessBatchRequest {
  return {
    idempotencyKey,
    project: 'xhs',
    type: 'xhs-body',
    mode: 'single',
    inputs: [input(1)],
  }
}

/** Real JSON storage-domain composition rooted wholly in an OS temporary directory. */
export async function setupHarness(
  root?: string,
  leaseDurationMs = 60_000,
  restrictedAgent?: RestrictedAgentModelConfig,
): Promise<{
  readonly ctx: Context
  readonly root: string
  dispose(removeRoot?: boolean): Promise<void>
}> {
  const selectedRoot = root ?? await mkdtemp(join(tmpdir(), 'dsh-business-workbench-'))
  const xhsRoot = join(selectedRoot, 'business-inputs', 'xhs-source')
  const sharedProductTruthRoot = join(selectedRoot, 'business-inputs', 'product-truth-source')
  await mkdir(join(xhsRoot, 'rules'), { recursive: true })
  await mkdir(sharedProductTruthRoot, { recursive: true })
  await writeFile(join(xhsRoot, 'current-task.md'), 'current task')
  await writeFile(join(xhsRoot, 'rules', 'account.md'), 'account rule')
  await writeFile(join(xhsRoot, 'rules', 'writing.md'), 'writing rule')
  await writeFile(join(xhsRoot, 'rules', 'golden-sample.md'), 'golden sample')
  await writeFile(join(sharedProductTruthRoot, 'product.md'), 'product truth')
  const ctx = new Context()
  try {
    await ctx.plugin(Storage)
    await ctx.plugin(StorageJson, { root: join(selectedRoot, 'storages') })
    await ctx.plugin(StorageDomain, { backend: 'json' })
    await ctx.plugin(BusinessWorkbenchService, {
      dshHome: selectedRoot,
      readRoots: { xhs: xhsRoot, sharedProductTruth: sharedProductTruthRoot },
      leaseDurationMs,
      ...(restrictedAgent === undefined ? {} : { restrictedAgent }),
    })
  } catch (error) {
    await ctx.fiber.dispose()
    if (root === undefined) await rm(selectedRoot, { recursive: true, force: true })
    throw error
  }
  return {
    ctx,
    root: selectedRoot,
    async dispose(removeRoot = root === undefined) {
      await ctx.fiber.dispose()
      if (removeRoot) await rm(selectedRoot, { recursive: true, force: true })
    },
  }
}
