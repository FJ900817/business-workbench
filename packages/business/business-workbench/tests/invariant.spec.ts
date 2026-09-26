import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import type { DomainChanged } from '@deepseek-ai/dsh-storage-domain'
import * as BusinessInvariant from '../src/invariant.ts'
import { BusinessAttemptId, BusinessBatchId, BusinessJobId } from '../src/index.ts'
import type { BusinessBatch, BusinessJob } from '../src/index.ts'

const batchId = BusinessBatchId(randomUUID())
const jobIds = [
  BusinessJobId(randomUUID()),
  BusinessJobId(randomUUID()),
  BusinessJobId(randomUUID()),
  BusinessJobId(randomUUID()),
] as const

function job(id = jobIds[0]): BusinessJob {
  return {
    id,
    batchId,
    project: 'xhs',
    type: 'xhs-body',
    status: 'draft',
    revision: 0,
    currentAttempt: null,
    input: { reference: 'card', sha256: 'a'.repeat(64) },
    attempts: [],
    artifactRefs: [],
    operations: [],
    createdAt: 1,
    updatedAt: 1,
  }
}

async function setup(jobs: readonly BusinessJob[]): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(InvariantRegistry)
  ctx.provide('businessWorkbench', {
    getJob: (id: string) => jobs.find(item => item.id === id),
  })
  await ctx.plugin(BusinessInvariant)
  return ctx
}

function put(table: string, value: unknown): DomainChanged {
  return { domain: 'business_workbench', table, key: 'key', operation: 'put', value }
}

describe('Business Workbench runtime invariant', () => {
  it('accepts related Job and ready Batch publications and ignores foreign events', async () => {
    const jobs = jobIds.map(id => job(id))
    const ctx = await setup(jobs)
    const batch: BusinessBatch = {
      id: batchId,
      project: 'xhs',
      type: 'xhs-body',
      mode: 'quad',
      status: 'ready',
      jobIds,
      participatingJobIds: jobIds,
      inputs: [jobs[0]!.input, jobs[1]!.input, jobs[2]!.input, jobs[3]!.input],
      revision: 1,
      createKey: 'create',
      createFingerprint: 'a'.repeat(64),
      createdAt: 1,
      updatedAt: 1,
    }
    expect(() => { ctx.emit('domain/changed', put('jobs', jobs[0])) }).not.toThrow()
    expect(() => { ctx.emit('domain/changed', put('batches', batch)) }).not.toThrow()
    expect(() => { ctx.emit('domain/changed', { ...put('jobs', {}), domain: 'other' }) }).not.toThrow()
  })

  it('rejects a running Job without its one active Attempt', async () => {
    const ctx = await setup([])
    expect(() => { ctx.emit('domain/changed', put('jobs', { ...job(), status: 'running' })) })
      .toThrow(/does not name its one running Attempt/)
  })

  it('rejects a running Attempt without an active lease', async () => {
    const ctx = await setup([])
    const attemptId = BusinessAttemptId(randomUUID())
    const value: BusinessJob = {
      ...job(),
      status: 'running',
      currentAttempt: attemptId,
      attempts: [{
        id: attemptId,
        jobId: jobIds[0],
        sequence: 1,
        status: 'running',
        lease: null,
        executionPackage: null,
        agentRuns: [],
        outputBundle: null,
        createdAt: 1,
      }],
    }
    expect(() => { ctx.emit('domain/changed', put('jobs', value)) }).toThrow(/active lease/)
  })

  it('rejects an Artifact related to an unknown Attempt', async () => {
    const ctx = await setup([])
    const value: BusinessJob = {
      ...job(),
      artifactRefs: [{
        artifactId: `artifact_${'a'.repeat(64)}` as never,
        jobId: jobIds[0],
        attemptId: BusinessAttemptId(randomUUID()),
        type: 'final',
        revision: 1,
        path: 'invalid-for-invariant-only',
        hash: 'a'.repeat(64),
        bytes: 1,
        createdAt: 1,
      }],
    }
    expect(() => { ctx.emit('domain/changed', put('jobs', value)) }).toThrow(/not related/)
  })

  it('rejects a ready Batch whose declared Job relation is missing', async () => {
    const ctx = await setup([job(jobIds[0])])
    const batch: BusinessBatch = {
      id: batchId,
      project: 'xhs',
      type: 'xhs-body',
      mode: 'quad',
      status: 'ready',
      jobIds,
      participatingJobIds: jobIds,
      inputs: [job().input, job().input, job().input, job().input],
      revision: 1,
      createKey: 'create',
      createFingerprint: 'a'.repeat(64),
      createdAt: 1,
      updatedAt: 1,
    }
    expect(() => { ctx.emit('domain/changed', put('batches', batch)) }).toThrow(/does not own declared Job/)
  })
})
