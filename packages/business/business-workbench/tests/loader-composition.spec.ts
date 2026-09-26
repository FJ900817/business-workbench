import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import BusinessWorkbenchService from '../src/index.ts'
import { batchRequest } from './helpers.ts'

let root: string | undefined
const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

async function writeConfig(base: string, includeReadRoots = true): Promise<string> {
  const configPath = join(base, 'cordis.yml')
  const dshHome = join(base, 'dsh-home')
  const xhsRoot = join(base, 'business-inputs', 'xhs-source')
  const sharedProductTruthRoot = join(base, 'business-inputs', 'product-truth-source')
  await mkdir(join(xhsRoot, 'rules'), { recursive: true })
  await mkdir(sharedProductTruthRoot, { recursive: true })
  await writeFile(join(xhsRoot, 'current-task.md'), 'current task')
  await writeFile(join(xhsRoot, 'rules', 'account.md'), 'account rule')
  await writeFile(join(sharedProductTruthRoot, 'product.md'), 'product truth')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-storage'",
    "- name: '@deepseek-ai/dsh-storage-json'",
    '  config:',
    `    root: ${JSON.stringify(join(dshHome, 'storages'))}`,
    "- name: '@deepseek-ai/dsh-storage-domain'",
    '  config:',
    '    backend: json',
    "- name: '@deepseek-ai/dsh-business-workbench'",
    '  config:',
    `    dshHome: ${JSON.stringify(dshHome)}`,
    ...(includeReadRoots ? [
      '    readRoots:',
      `      xhs: ${JSON.stringify(xhsRoot)}`,
      `      sharedProductTruth: ${JSON.stringify(sharedProductTruthRoot)}`,
    ] : []),
    '    leaseDurationMs: 60000',
    '',
  ].join('\n'))
  return configPath
}

async function loadComposition(configPath: string): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  ctx.baseUrl = pathToFileURL(root as string).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-storage', Storage],
    ['@deepseek-ai/dsh-storage-json', StorageJson],
    ['@deepseek-ai/dsh-storage-domain', StorageDomain],
    ['@deepseek-ai/dsh-business-workbench', BusinessWorkbenchService],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await ctx.loader.await()
  const unloaded = [...ctx.loader.entries()]
    .filter(entry => entry.fiber === undefined && !entry.disabled)
    .map(entry => entry.options.name)
  expect(unloaded).toEqual([])
  return ctx
}

describe('Business Workbench through a real Loader composition', () => {
  it('loads with Agent and read routes disabled when optional deployment policy is absent', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-business-disabled-routes-'))
    const configPath = await writeConfig(root, false)
    const ctx = await loadComposition(configPath)

    expect(ctx.businessWorkbench.listBatches()).toEqual([])
  })

  it('opens empty without a Job and persists the participation schema baseline as v5', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-business-schema-v5-'))
    const configPath = await writeConfig(root)
    const storagePath = join(root, 'dsh-home', 'storages', 'business_workbench.json')

    const first = await loadComposition(configPath)
    expect(first.businessWorkbench.listBatches()).toEqual([])
    const batch = await first.businessWorkbench.createBatch(batchRequest('schema-v5-baseline'))
    const initialized = JSON.parse(await readFile(storagePath, 'utf8')) as {
      unit: { name: string; version: number }
      tables: { batches: Record<string, unknown>; jobs: Record<string, unknown> }
    }
    expect(initialized.unit).toEqual({ name: 'business_workbench', version: 5 })
    expect(Object.keys(initialized.tables.batches)).toEqual([batch.id])
    expect(Object.keys(initialized.tables.jobs)).toHaveLength(4)
    await first.fiber.dispose()
    contexts.splice(contexts.indexOf(first), 1)

    const second = await loadComposition(configPath)
    expect(second.businessWorkbench.listBatches()).toEqual([batch])
    expect(JSON.parse(await readFile(storagePath, 'utf8'))).toEqual(initialized)
  })

  it('interrupts owner-lost execution and retains its package and Artifacts across restart', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-business-loader-'))
    const sentinel = join(root, 'outside-production-sentinel')
    await writeFile(sentinel, 'unchanged')
    const configPath = await writeConfig(root)
    const first = await loadComposition(configPath)
    const service = first.businessWorkbench
    const batch = await service.createBatch(batchRequest('restart-batch'))
    const jobs = service.listJobs(batch.id)

    const job1Ready = await service.transitionJob({
      jobId: jobs[0]!.id, expectedRevision: 0, idempotencyKey: 'j1-ready', status: 'ready',
    })
    const job1Pending = await service.createAttempt({
      jobId: job1Ready.id, expectedRevision: job1Ready.revision, idempotencyKey: 'j1-attempt',
    })
    const job1Running = await service.acquireExecutionLease({
      jobId: job1Pending.id, attemptId: job1Pending.currentAttempt!, expectedRevision: job1Pending.revision,
      idempotencyKey: 'j1-lease', ownerId: 'runtime-owner-1',
    })
    const job1Package = await service.createExecutionPackage({
      jobId: job1Running.id,
      attemptId: job1Running.currentAttempt!,
      expectedRevision: job1Running.revision,
      idempotencyKey: 'j1-package',
      ownerId: 'runtime-owner-1',
      workflowVersion: 'xhs-body-v0.1',
      inputs: [{ role: 'task-card', path: 'xhs/current-task.md', required: true }],
      allowedReadRoots: [],
      allowedReadFiles: ['xhs/current-task.md'],
      allowedCapabilities: ['artifact-write'],
      allowedSkills: [],
    })
    await expect(service.readExecutionInput({
      jobId: job1Running.id, attemptId: job1Running.currentAttempt!, ownerId: 'runtime-owner-1', path: 'xhs/current-task.md',
    })).resolves.toMatchObject({ content: 'current task' })
    const job1AfterPackage = service.getJob(job1Running.id)!
    const job1Artifact = await service.commitArtifact({
      jobId: job1AfterPackage.id,
      attemptId: job1AfterPackage.currentAttempt!,
      expectedRevision: job1AfterPackage.revision,
      idempotencyKey: 'j1-artifact',
      ownerId: 'runtime-owner-1',
      type: 'intermediate',
      content: 'restart artifact 1',
    })

    const job2Ready = await service.transitionJob({
      jobId: jobs[1]!.id, expectedRevision: 0, idempotencyKey: 'j2-ready', status: 'ready',
    })
    const job2Pending = await service.createAttempt({
      jobId: job2Ready.id, expectedRevision: job2Ready.revision, idempotencyKey: 'j2-attempt',
    })
    const job2Running = await service.acquireExecutionLease({
      jobId: job2Pending.id, attemptId: job2Pending.currentAttempt!, expectedRevision: job2Pending.revision,
      idempotencyKey: 'j2-lease', ownerId: 'runtime-owner-2',
    })
    await service.completeAttempt({
      jobId: job2Running.id,
      attemptId: job2Running.currentAttempt!,
      expectedRevision: job2Running.revision,
      idempotencyKey: 'j2-failed',
      ownerId: 'runtime-owner-2',
      outcome: 'failed',
      reason: 'fixture failure',
    })

    await service.transitionJob({
      jobId: jobs[2]!.id, expectedRevision: 0, idempotencyKey: 'j3-ready', status: 'ready',
    })

    const job4Ready = await service.transitionJob({
      jobId: jobs[3]!.id, expectedRevision: 0, idempotencyKey: 'j4-ready', status: 'ready',
    })
    const job4Pending = await service.createAttempt({
      jobId: job4Ready.id, expectedRevision: job4Ready.revision, idempotencyKey: 'j4-attempt',
    })
    const job4Running = await service.acquireExecutionLease({
      jobId: job4Pending.id, attemptId: job4Pending.currentAttempt!, expectedRevision: job4Pending.revision,
      idempotencyKey: 'j4-lease', ownerId: 'runtime-owner-4',
    })
    await service.commitArtifact({
      jobId: job4Running.id,
      attemptId: job4Running.currentAttempt!,
      expectedRevision: job4Running.revision,
      idempotencyKey: 'j4-artifact',
      ownerId: 'runtime-owner-4',
      type: 'final',
      content: 'restart artifact 4',
    })
    const job4AfterArtifact = service.getJob(job4Running.id)!
    await service.completeAttempt({
      jobId: job4AfterArtifact.id,
      attemptId: job4AfterArtifact.currentAttempt!,
      expectedRevision: job4AfterArtifact.revision,
      idempotencyKey: 'j4-complete',
      ownerId: 'runtime-owner-4',
      outcome: 'completed',
    })

    const beforeBatch = service.getBatch(batch.id)
    const beforeJobs = service.listJobs(batch.id)
    const beforeVerification = await Promise.all(beforeJobs.map(job => service.verifyArtifacts(job.id)))
    await first.fiber.dispose()
    contexts.splice(contexts.indexOf(first), 1)

    const second = await loadComposition(configPath)
    expect(second.businessWorkbench.getBatch(batch.id)).toEqual(beforeBatch)
    const afterRestart = second.businessWorkbench.listJobs(batch.id)
    expect(afterRestart[0]).toMatchObject({ status: 'interrupted', currentAttempt: null, statusReason: 'runtime-owner-lost' })
    expect(afterRestart[0]!.attempts[0]).toMatchObject({
      status: 'interrupted', statusReason: 'runtime-owner-lost', executionPackage: job1Package,
    })
    expect(afterRestart.slice(1)).toEqual(beforeJobs.slice(1))
    await expect(Promise.all(afterRestart.map(job => second.businessWorkbench.verifyArtifacts(job.id))))
      .resolves.toEqual(beforeVerification)
    await expect(second.businessWorkbench.verifyExecutionPackage(afterRestart[0]!.id, afterRestart[0]!.attempts[0]!.id))
      .resolves.toMatchObject({ packageId: job1Package.id })
    await expect(second.businessWorkbench.getArtifact(job1Artifact.artifactId))
      .resolves.toMatchObject({ content: 'restart artifact 1' })
    const retryPending = await second.businessWorkbench.createAttempt({
      jobId: afterRestart[0]!.id,
      expectedRevision: afterRestart[0]!.revision,
      idempotencyKey: 'j1-recovery-attempt',
    })
    const retryRunning = await second.businessWorkbench.acquireExecutionLease({
      jobId: retryPending.id,
      attemptId: retryPending.currentAttempt!,
      expectedRevision: retryPending.revision,
      idempotencyKey: 'j1-recovery-lease',
      ownerId: 'runtime-owner-recovered',
    })
    expect(retryRunning.attempts).toMatchObject([{ sequence: 1, status: 'interrupted' }, { sequence: 2, status: 'running' }])
    expect(await readFile(sentinel, 'utf8')).toBe('unchanged')
  })

  it('repairs every partial Batch-creation prefix without duplicating Jobs', async () => {
    for (let retainedJobs = 0; retainedJobs <= 4; retainedJobs += 1) {
      const base = await mkdtemp(join(tmpdir(), `dsh-business-recover-${retainedJobs}-`))
      const previousRoot = root
      root = base
      const configPath = await writeConfig(base)
      const first = await loadComposition(configPath)
      const batch = await first.businessWorkbench.createBatch(batchRequest(`recover-${retainedJobs}`))
      await first.fiber.dispose()
      contexts.splice(contexts.indexOf(first), 1)

      const storagePath = join(base, 'dsh-home', 'storages', 'business_workbench.json')
      const document = JSON.parse(await readFile(storagePath, 'utf8')) as {
        tables: { batches: Record<string, Record<string, unknown>>; jobs: Record<string, unknown> }
      }
      const storedBatch = document.tables.batches[batch.id]!
      storedBatch['status'] = 'creating'
      storedBatch['revision'] = 0
      for (const jobId of batch.jobIds.slice(retainedJobs)) Reflect.deleteProperty(document.tables.jobs, jobId)
      await writeFile(storagePath, `${JSON.stringify(document, null, 2)}\n`)

      const second = await loadComposition(configPath)
      expect(second.businessWorkbench.getBatch(batch.id)).toMatchObject({ status: 'ready', revision: 1 })
      expect(second.businessWorkbench.listJobs(batch.id)).toHaveLength(4)
      expect(new Set(second.businessWorkbench.listJobs(batch.id).map(job => job.id)).size).toBe(4)
      await second.fiber.dispose()
      contexts.splice(contexts.indexOf(second), 1)
      await rm(base, { recursive: true, force: true })
      root = previousRoot
    }
  })

  it('fails closed on an unsupported schema version without changing the medium', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-business-version-'))
    const configPath = await writeConfig(root)
    const storagePath = join(root, 'dsh-home', 'storages', 'business_workbench.json')
    const original = `${JSON.stringify({
      unit: { name: 'business_workbench', version: 99 },
      global: null,
      tables: { batches: {}, jobs: {} },
    }, null, 2)}\n`
    await mkdir(join(root, 'dsh-home', 'storages'), { recursive: true })
    await writeFile(storagePath, original, { flag: 'wx' })

    await expect(loadComposition(configPath)).rejects.toMatchObject({
      cause: { cause: { code: 'version-mismatch' } },
    })
    expect(await readFile(storagePath, 'utf8')).toBe(original)
  })

  it('rejects the Phase 1 schema without changing its medium', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-business-version-zero-'))
    const configPath = await writeConfig(root)
    const storagePath = join(root, 'dsh-home', 'storages', 'business_workbench.json')
    const original = `${JSON.stringify({ unit: { name: 'business_workbench', version: 0 }, global: null, tables: { batches: {}, jobs: {} } }, null, 2)}\n`
    await mkdir(join(root, 'dsh-home', 'storages'), { recursive: true })
    await writeFile(storagePath, original, { flag: 'wx' })
    await expect(loadComposition(configPath)).rejects.toMatchObject({ cause: { cause: { code: 'version-mismatch' } } })
    expect(await readFile(storagePath, 'utf8')).toBe(original)
  })

  it('rejects the frozen pre-Agent schema without changing its medium', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-business-version-one-'))
    const configPath = await writeConfig(root)
    const storagePath = join(root, 'dsh-home', 'storages', 'business_workbench.json')
    const original = `${JSON.stringify({ unit: { name: 'business_workbench', version: 1 }, global: null, tables: { batches: {}, jobs: {} } }, null, 2)}\n`
    await mkdir(join(root, 'dsh-home', 'storages'), { recursive: true })
    await writeFile(storagePath, original, { flag: 'wx' })
    await expect(loadComposition(configPath)).rejects.toMatchObject({ cause: { cause: { code: 'version-mismatch' } } })
    expect(await readFile(storagePath, 'utf8')).toBe(original)
  })

  it('rejects the pre-output-bundle schema without changing its medium', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-business-version-two-'))
    const configPath = await writeConfig(root)
    const storagePath = join(root, 'dsh-home', 'storages', 'business_workbench.json')
    const original = `${JSON.stringify({ unit: { name: 'business_workbench', version: 2 }, global: null, tables: { batches: {}, jobs: {} } }, null, 2)}\n`
    await mkdir(join(root, 'dsh-home', 'storages'), { recursive: true })
    await writeFile(storagePath, original, { flag: 'wx' })
    await expect(loadComposition(configPath)).rejects.toMatchObject({ cause: { cause: { code: 'version-mismatch' } } })
    expect(await readFile(storagePath, 'utf8')).toBe(original)
  })

  it('rejects the pre-production-source schema without changing its medium', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-business-version-three-'))
    const configPath = await writeConfig(root)
    const storagePath = join(root, 'dsh-home', 'storages', 'business_workbench.json')
    const original = `${JSON.stringify({ unit: { name: 'business_workbench', version: 3 }, global: null, tables: { batches: {}, jobs: {} } }, null, 2)}\n`
    await mkdir(join(root, 'dsh-home', 'storages'), { recursive: true })
    await writeFile(storagePath, original, { flag: 'wx' })
    await expect(loadComposition(configPath)).rejects.toMatchObject({ cause: { cause: { code: 'version-mismatch' } } })
    expect(await readFile(storagePath, 'utf8')).toBe(original)
  })
})
