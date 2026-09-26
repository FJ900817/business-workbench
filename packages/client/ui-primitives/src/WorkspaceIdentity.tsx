import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import css from './WorkspaceIdentity.module.css'

/** Presentation-only identities for the five Home workspace entries. */
const identities = {
  command: { id: 'command', name: 'Command', descriptor: '总控', mascotShape: 'blob' },
  projects: { id: 'projects', name: 'Projects', descriptor: '项目', mascotShape: 'capsule' },
  work: { id: 'work', name: 'Work', descriptor: '工作台', mascotShape: 'crystal' },
  studios: { id: 'studios', name: 'Studios', descriptor: '创作工作室', mascotShape: 'wedge' },
  radar: { id: 'radar', name: 'Radar', descriptor: '资讯雷达', mascotShape: 'cloud' },
} as const

/** Display order for the AI Workspace entries. */
export const WORKSPACE_IDENTITIES = Object.values(identities)

/** Identifier of a visual workspace entry; it does not select a runtime workspace. */
export type WorkspaceIdentityId = keyof typeof identities
/** Local presentation state for the mascot shown beside a workspace entry. */
export type WorkspaceMascotState = 'idle' | 'thinking' | 'working' | 'complete'

let selectedWorkspace: WorkspaceIdentityId = 'command'
let mascotStates: Readonly<Record<WorkspaceIdentityId, WorkspaceMascotState>> = {
  command: 'idle', projects: 'idle', work: 'idle', studios: 'idle', radar: 'idle',
}
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function snapshot(): WorkspaceIdentityId {
  return selectedWorkspace
}

function mascotStateSnapshot(): Readonly<Record<WorkspaceIdentityId, WorkspaceMascotState>> {
  return mascotStates
}

/**
 * Read the selected Home workspace identity across independently mounted UI shells.
 * @returns the selected presentation identity.
 */
export function useWorkspaceIdentity(): WorkspaceIdentityId {
  return useSyncExternalStore(subscribe, snapshot, () => 'command')
}

/**
 * Read every workspace mascot's local presentation state.
 * @returns the current per-identity display states.
 */
export function useWorkspaceMascotStates(): Readonly<Record<WorkspaceIdentityId, WorkspaceMascotState>> {
  return useSyncExternalStore(subscribe, mascotStateSnapshot, () => mascotStates)
}

/**
 * Read one workspace mascot's local presentation state.
 * @param workspace - identity to read.
 * @returns the current presentation state.
 */
export function useWorkspaceMascotState(workspace: WorkspaceIdentityId): WorkspaceMascotState {
  return useSyncExternalStore(subscribe, () => mascotStates[workspace], () => 'idle')
}

/**
 * Set a workspace mascot presentation state without changing a Harness session or Job.
 * @param workspace - identity to update.
 * @param state - local display state.
 */
export function setWorkspaceMascotState(workspace: WorkspaceIdentityId, state: WorkspaceMascotState): void {
  if (mascotStates[workspace] === state) return
  mascotStates = { ...mascotStates, [workspace]: state }
  for (const listener of listeners) listener()
}

/**
 * Return the localized short state label used by accessible workspace names.
 * @param state - presentation state.
 * @returns a concise status label.
 */
export function workspaceMascotStateLabel(state: WorkspaceMascotState): string {
  return ({ idle: '待机', thinking: '思考中', working: '工作中', complete: '已完成' })[state]
}

/**
 * Switch only the visible Home workspace identity; no Job, session, or runtime workspace changes.
 * @param workspace - identity to display.
 */
export function selectWorkspaceIdentity(workspace: WorkspaceIdentityId): void {
  if (selectedWorkspace === workspace) return
  selectedWorkspace = workspace
  for (const listener of listeners) listener()
}

/**
 * Return the visible label, descriptor, and Hero copy for a workspace identity.
 * @param workspace - selected presentation identity.
 * @returns its display metadata.
 */
export function workspaceIdentity(workspace: WorkspaceIdentityId): (typeof WORKSPACE_IDENTITIES)[number] {
  return identities[workspace]
}

/**
 * Render the mascot assigned to a workspace entry.
 * @param props.workspace - identity to present.
 * @param props.hero - whether to use the larger Hero variant.
 * @returns a presentation-only mascot.
 */
export function WorkspaceIdentityAvatar({ workspace, hero = false, mark }: {
  workspace: WorkspaceIdentityId
  hero?: boolean
  mark?: ReactNode
}) {
  const state = useWorkspaceMascotState(workspace)
  return <span className={clsx(css.avatar, css[workspace], hero && css.hero)} data-workspace-identity={workspace} data-mascot-shape={identities[workspace].mascotShape} data-state={state} aria-hidden="true"><span className={clsx(css.mark, mark != null && css.markOverride)}>{mark}</span><span className={css.status} /></span>
}
