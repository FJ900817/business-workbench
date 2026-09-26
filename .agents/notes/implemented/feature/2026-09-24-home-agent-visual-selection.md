# Agent Note: Home Agent visual selection

Status: implemented

English | [中文](2026-09-24-home-agent-visual-selection.zh.md)

The sidebar placement and row-label decision below is superseded by the [Home Agent sidebar hierarchy note](2026-09-25-home-agent-sidebar-v2.md); this note retains the presentation-only identity-selection decision.

## Problem

The [initial Workbench identity placement](2026-09-24-workbench-home-identity.md) left five plain names beneath the Workspace browser and a small Main Operator mark above the Hero headline. Users could not distinguish the roles at a glance or see which member was selected. Presenting those identities as another full-width sidebar list also obscures the distinction between Harness navigation and the Home team. Runtime Agent selection does not exist in this UI, so a visual test must not imply that a task has switched executors.

## Decision

Five Home identities are presentation controls shown only while the current Session is blank or absent. A row is a button with `aria-pressed`; its selection updates the empty-session Hero identity through a client-only `useSyncExternalStore` module in `ui-primitives`. The selected identity defaults to Main Operator. This state does not create sessions, send prompts, select an Agent preset, or persist into Job data. The current sidebar placement, short labels, and collapsed-rail behavior are owned by the [Home Agent sidebar hierarchy note](2026-09-25-home-agent-sidebar-v2.md).

The Hero wraps its existing brand-mark slot in a 72px identity surface above the unchanged headline. Slot occupants remain deployment-owned; the fish mark is the local fallback. The selected row changes only the Hero's visible label and mark surround. The mark has a low-frequency idle scale motion, disabled by `prefers-reduced-motion`.

## Alternatives considered

**Copy the researched Grok Bot SVG or engine into the client package.** The isolated study asset has no confirmed product reuse rights; this change does not add it to the MIT-distributed package.

**Add a runtime Agent-selection service now.** No task execution behavior is required for this visual identity test, and a service would blur display state with Agent presets.

**Replace the Harness home layout.** The existing sidebar, headline, Workspace picker, and resident composer already provide the correct navigation and input ownership; changing their geometry would expand this task beyond identity.

**Keep the team rows styled as a second navigation list.** A full-width active row gives a member the same apparent hierarchy as a Harness destination, even though it only changes the Home display identity.

## Consequences

The Home presents five keyboard-selectable visual identities while preserving Harness input and runtime Agent selection. Their role-specific mascot assets remain uncleared for redistribution, and the selected identity is ephemeral and returns to Main Operator on a fresh page load.
