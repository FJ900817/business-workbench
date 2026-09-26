/** Business Workbench ownership in the production Web bundle layer. */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Web Business Workbench assembly', () => {
  it('mounts the Host authority while leaving machine roots to the Profile layer', () => {
    const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    expect(patch).toContain("id: business-workbench\n      name: '@deepseek-ai/dsh-business-workbench'")
    expect(patch).toContain('leaseDurationMs: 30000')
    expect(patch).not.toContain('readRoots:')
    expect(patch).not.toContain('/Users/')
  })
})
