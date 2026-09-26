// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  WORKSPACE_IDENTITIES, WorkspaceIdentityAvatar, selectWorkspaceIdentity, setWorkspaceMascotState,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkspaceMascotState } from '@deepseek-ai/dsh-client-ui-primitives'

afterEach(() => {
  cleanup()
  selectWorkspaceIdentity('command')
  for (const workspace of WORKSPACE_IDENTITIES) setWorkspaceMascotState(workspace.id, 'idle')
})

describe('Workspace identity mascots', () => {
  it('uses five distinct existing silhouettes for the workspace entries', () => {
    const { container } = render(
      <>{WORKSPACE_IDENTITIES.map(workspace => <WorkspaceIdentityAvatar key={workspace.id} workspace={workspace.id} />)}</>,
    )
    const avatars = [...container.querySelectorAll('[data-workspace-identity]')]
    expect(avatars.map(avatar => avatar.getAttribute('data-mascot-shape'))).toEqual([
      'blob', 'capsule', 'crystal', 'wedge', 'cloud',
    ])
    expect(new Set(avatars.map(avatar => avatar.getAttribute('data-mascot-shape'))).size).toBe(5)
  })

  it.each(['idle', 'thinking', 'working', 'complete'] as const)(
    'renders %s as a local visual state without changing identity',
    (state: WorkspaceMascotState) => {
      const { container } = render(<WorkspaceIdentityAvatar workspace="projects" hero />)
      act(() => { setWorkspaceMascotState('projects', state) })
      const avatar = container.querySelector('[data-workspace-identity="projects"]')
      expect(avatar?.getAttribute('data-state')).toBe(state)
      expect(avatar?.getAttribute('data-mascot-shape')).toBe('capsule')
    },
  )

  it('keeps workspace selection separate from mascot presentation state', () => {
    const { container } = render(<WorkspaceIdentityAvatar workspace="command" hero />)
    act(() => {
      selectWorkspaceIdentity('work')
      setWorkspaceMascotState('work', 'thinking')
    })
    expect(container.querySelector('[data-workspace-identity="command"]')?.getAttribute('data-state')).toBe('idle')
  })
})
