import { describe, expect, it } from 'vitest'
import { assertBusinessJobTransition, isBusinessJobTransitionAllowed } from '../src/index.ts'

describe('Business Job state machine', () => {
  it('admits the execution lifecycle, interruption recovery, and explicit failed retry', () => {
    expect(isBusinessJobTransitionAllowed('draft', 'ready')).toBe(true)
    expect(isBusinessJobTransitionAllowed('ready', 'running')).toBe(true)
    expect(isBusinessJobTransitionAllowed('running', 'completed')).toBe(true)
    expect(isBusinessJobTransitionAllowed('running', 'failed')).toBe(true)
    expect(isBusinessJobTransitionAllowed('running', 'interrupted')).toBe(true)
    expect(isBusinessJobTransitionAllowed('interrupted', 'ready')).toBe(true)
    expect(isBusinessJobTransitionAllowed('failed', 'ready')).toBe(true)
    expect(isBusinessJobTransitionAllowed('running', 'cancelled')).toBe(true)
  })

  it('rejects skips, reversals, repeats, and post-terminal mutations', () => {
    expect(() => { assertBusinessJobTransition('draft', 'completed') })
      .toThrow(/cannot transition Job from 'draft' to 'completed'/)
    expect(() => { assertBusinessJobTransition('ready', 'draft') })
      .toThrow(/cannot transition/)
    expect(() => { assertBusinessJobTransition('completed', 'ready') })
      .toThrow(/cannot transition/)
    expect(() => { assertBusinessJobTransition('cancelled', 'cancelled') })
      .toThrow(/cannot transition/)
  })
})
