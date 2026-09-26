// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type {
  SidebarFooterActionOwnerProps, SidebarRootComponentProps, SidebarSectionOwnerProps,
  SidebarSettingsOwnerProps,
} from '../src/client/contract/slots.ts'
import { SidebarRoot } from '../src/client/SidebarRoot.tsx'
import { selectWorkspaceIdentity } from '@deepseek-ai/dsh-client-ui-primitives'
import { en } from '../src/client/locales.ts'

// English-dictionary translate stub: the shell renders the same copy the
// assertions below query by accessible name.
const t: SidebarRootComponentProps['t'] = key => (en as Record<string, string>)[key] ?? key

afterEach(() => {
  cleanup()
  selectWorkspaceIdentity('command')
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

// The shell reads Session state only to keep the AI Workspace entries on Home.
const neverHook = (() => { throw new Error('shell must not read global hooks') }) as never
function sessionHook(active: boolean): SidebarRootComponentProps['useSessions'] {
  type HomeState = {
    current: string | undefined
    byId: Record<string, { blank: boolean }>
  }
  const state: HomeState = active
    ? { current: 's1', byId: { s1: { blank: false } } }
    : { current: undefined, byId: {} }
  return ((selector: (state: HomeState) => unknown) => selector(state)) as never
}

function mountShell({ collapsed = false, width = 300, activeSession = false }: {
  collapsed?: boolean
  width?: number
  activeSession?: boolean
} = {}) {
  const startSession = vi.fn()
  const toggleSidebar = vi.fn()
  let regionOwner: SidebarSectionOwnerProps | undefined
  let settingsOwner: SidebarSettingsOwnerProps | undefined
  let footerActionOwner: SidebarFooterActionOwnerProps | undefined
  const brandMark = <span data-testid="custom-brand-mark">M</span>
  const brandName = <span data-testid="custom-brand-name">Custom Brand</span>
  let current = { collapsed, width }
  const root = () => (
    <SidebarRoot
      collapsed={current.collapsed} width={current.width}
      useSessions={sessionHook(activeSession)} useWorkspaces={neverHook}
      startSession={startSession} toggleSidebar={toggleSidebar} t={t}
      renderSlot={((
        key: string,
        owner: SidebarFooterActionOwnerProps | SidebarSectionOwnerProps | SidebarSettingsOwnerProps,
      ) => {
        if (key === 'sidebar.brand.mark') return brandMark
        if (key === 'sidebar.brand.name') return brandName
        if (key === 'sidebar.settings') {
          settingsOwner = owner
          return <div data-testid="settings-seat" data-wide={owner.wide} />
        }
        if (key === 'sidebar.footer.action') {
          footerActionOwner = owner
          return <div data-testid="footer-action-seat" data-wide={owner.wide} />
        }
        regionOwner = owner as SidebarSectionOwnerProps
        return <div data-testid="region" data-wide={owner.wide} />
      }) as SidebarRootComponentProps['renderSlot']}
    />
  )
  const view = render(root())
  return {
    startSession,
    toggleSidebar,
    regionOwner: () => {
      if (regionOwner === undefined) throw new Error('region owner not rendered')
      return regionOwner
    },
    settingsOwner: () => {
      if (settingsOwner === undefined) throw new Error('settings owner not rendered')
      return settingsOwner
    },
    footerActionOwner: () => {
      if (footerActionOwner === undefined) throw new Error('footer action owner not rendered')
      return footerActionOwner
    },
    rerender(next: Partial<typeof current>) {
      current = { ...current, ...next }
      view.rerender(root())
    },
  }
}

describe('SidebarRoot shell', () => {
  it('selects an AI Workspace entry without starting a session or changing the native Workspace browser', () => {
    const b = mountShell()
    expect(screen.queryByRole('button', { name: 'Home' })).toBeNull()
    const navigation = screen.getByRole('navigation', { name: 'AI Workspace navigation' })
    expect(screen.getByRole('heading', { name: 'AI Workspace' })).toBeTruthy()
    const moreTools = screen.getByRole('button', { name: 'More tools' })
    expect(moreTools.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Task board')).toBeNull()
    fireEvent.click(moreTools)
    expect(moreTools.getAttribute('aria-expanded')).toBe('true')
    for (const tool of ['Workspaces', 'Task board', 'SSH', 'Skills center']) expect(screen.getByText(tool)).toBeTruthy()
    expect(screen.queryByText('Choose who appears on Home')).toBeNull()
    const projects = screen.getByRole('button', { name: 'Projects · Portfolio' })
    const command = screen.getByRole('button', { name: 'Command · Overview' })
    expect(command.getAttribute('aria-pressed')).toBe('true')
    expect(projects.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getAllByRole('button', { name: /^(Command|Projects|Work|Studios|Radar) · / })).toHaveLength(5)
    expect(screen.queryByText('总控')).toBeNull()
    expect(screen.queryByText('项目')).toBeNull()
    expect(screen.queryByText('工作台')).toBeNull()
    expect(screen.queryByText('创作工作室')).toBeNull()
    expect(screen.queryByText('资讯雷达')).toBeNull()
    for (const name of ['Command', 'Projects', 'Work', 'Studios', 'Radar']) {
      expect(screen.queryByText(name)).toBeNull()
    }
    fireEvent.click(projects)
    expect(projects.getAttribute('aria-pressed')).toBe('true')
    expect(command.getAttribute('aria-pressed')).toBe('false')
    expect(b.startSession).not.toHaveBeenCalled()
    expect(b.toggleSidebar).not.toHaveBeenCalled()
    expect(navigation.compareDocumentPosition(screen.getByTestId('region')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps the Home AI Workspace navigation out of a nonblank Session', () => {
    mountShell({ activeSession: true })
    expect(screen.queryByRole('button', { name: 'Home' })).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'AI Workspace navigation' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'More tools' })).toBeNull()
    expect(screen.queryByText('Task board')).toBeNull()
    expect(screen.getAllByRole('button', { name: 'New session' })).toHaveLength(2)
    expect(screen.getByTestId('region')).toBeTruthy()
  })

  it('routes New Session (capsule + wordmark) and the column toggle', () => {
    const b = mountShell()
    expect(screen.getByTestId('custom-brand-mark')).toBeTruthy()
    expect(screen.getByTestId('custom-brand-name')).toBeTruthy()
    // Expanded, both the wordmark and the capsule start a session.
    const starters = screen.getAllByRole('button', { name: 'New session' })
    expect(starters).toHaveLength(2)
    for (const button of starters) fireEvent.click(button)
    expect(b.startSession).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(b.toggleSidebar).toHaveBeenCalledOnce()
  })

  it('renders generic brand fallbacks when no package fills the slots', () => {
    vi.stubEnv('DSH_CLIENT_COMMIT_HASH', '0123456')
    const { container } = render(<SidebarRoot
      collapsed={false} width={300}
      useSessions={sessionHook(false)} useWorkspaces={neverHook}
      startSession={vi.fn()} toggleSidebar={vi.fn()} t={t}
      renderSlot={((_key: string, _owner: unknown, options?: { fallback?: ReactNode }) =>
        options?.fallback ?? null) as SidebarRootComponentProps['renderSlot']}
    />)

    expect(screen.getByText('DSH Local Build')).toBeTruthy()
    expect(screen.getByText('0123456')).toBeTruthy()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('hands the region its wide flag and clamps expandSidebar to the collapsed state', () => {
    const b = mountShell()
    expect(b.regionOwner().wide).toBe(true)
    // The settings seat rides the same wide flag (ui-settings renders the row).
    expect(b.settingsOwner().wide).toBe(true)
    expect(b.footerActionOwner().wide).toBe(true)
    // Expanded: the request is a no-op (no accidental collapse).
    b.regionOwner().expandSidebar()
    expect(b.toggleSidebar).not.toHaveBeenCalled()
  })

  it('keeps the region mounted through collapse and expands on its request', () => {
    vi.useFakeTimers()
    const b = mountShell()
    b.rerender({ collapsed: true })
    // Wide content survives the crossfade window, then settles into the rail.
    expect(b.regionOwner().wide).toBe(true)
    vi.advanceTimersByTime(200)
    b.rerender({})
    expect(b.regionOwner().wide).toBe(false)
    expect(b.footerActionOwner().wide).toBe(false)
    expect(screen.getByTestId('region')).toBeTruthy()
    b.regionOwner().expandSidebar()
    expect(b.toggleSidebar).toHaveBeenCalledOnce()
  })

  it('renders statically collapsed on a cold start (no crossfade classes)', () => {
    const b = mountShell({ collapsed: true })
    expect(b.regionOwner().wide).toBe(false)
    expect(screen.getByRole('button', { name: 'Open sidebar' })).toBeTruthy()
  })
})
