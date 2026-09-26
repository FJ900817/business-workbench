# Agent Note: AI Workspace sidebar navigation

Status: implemented

English | [中文](2026-09-25-ai-workspace-sidebar-navigation.zh.md)

## Problem

Mascot identities labeled as Main Operator, Workflow Agent, Review Agent, Visual Agent, and Archive Agent made the Home group read as an employee roster even though selecting an entry only changed local Hero presentation.

## Decision

The blank-session Home is the default view and has no separate Home navigation button. New Session is followed by five AI Workspace entries and a collapsed More Tools disclosure. Expanding it reveals Workspace, task board, SSH, and Skills; only the Workspace and Session browser is a sidebar control, and the other labels describe existing in-session or settings entry points rather than adding routes. A nonblank Session hides the Home entries and disclosure but keeps the native browser available for session navigation. Settings remains bottom-pinned.

Selecting an AI Workspace entry changes only its local selected state and the empty-session Hero mascot. Command is the default. The Hero uses a personal greeting without an identity name or preview label. The selection does not open or switch a runtime Workspace, create a session, send a prompt, or change Job data. Expanded entries render 64px mascot marks without a tile or persistent name; hover reveals a name tooltip, and selection adds a pale identity wash and a leading color bar. The collapsed rail scales marks to 44px. Mascot SVG fills directly use Command blue, Projects emerald, Work orange, Studios violet, and Radar teal; CSS filters do not recolor them. Their reuse rights remain uncleared. This decision supersedes the earlier [Home Agent sidebar hierarchy](2026-09-25-home-agent-sidebar-v2.md).

## Alternatives considered

**Keep AI Team labels and member semantics.** That framing suggests five employees and conflicts with the actual behavior, which only selects a Home presentation identity.

**Remove the mascot identities.** The requested first-level Workspace entries need a visual identity; retaining the existing marks preserves recognition without changing their asset contents or rendering values.

**Keep Home groups visible in every active Session.** Their entries do not navigate to routes, while the native Workspace and Session browser already supplies the real session-navigation controls; showing the Home groups in a conversation would mix those distinct roles.

**Replace the native Workspace and Session browser.** That component owns real Harness browsing behavior and remains separate from these local presentation selectors.

**Keep a colored tile behind every mascot.** The marks already carry identity color; removing the redundant tile keeps the icon legible without turning every Home entry into a colored button.

**Leave all Harness Tools exposed.** The Workspace browser remains visible for session navigation, while task board, SSH, and Skills are secondary capability references that can stay behind one disclosure.

**Build a parallel Workbench Home.** The Harness Home already owns the composer, Workspace picker, attachments, model selection, permissions, and voice interactions; a second Home would duplicate those controls.

**Add a separate Home navigation button.** The blank-session state already renders the Home groups by default; a button would add a redundant stop before the command composer.

**Import the studied mascot engine.** Its source has no confirmed product reuse rights, and static local marks are sufficient for workspace identity.

## Consequences

The sidebar and Hero share one client-local Workspace identity selector. Its five entries are Command, Projects, Work, Studios, and Radar; no runtime Workspace or Agent is selected. Home-only More Tools is a collapsed capability index, not a new route; task-board, SSH, and Skills controls remain owned by their current session or settings surfaces. The native Workspace and Session browser, Settings, composer, and conversation surface keep their existing ownership and behavior.

## Testing

Sidebar tests pin the Home hierarchy, five AI Workspace entries, collapsed More Tools disclosure and its expanded labels, selection behavior, native Workspace browser availability, and hiding Home controls in nonblank Sessions. Hero tests pin the default Command greeting and mascot selection behavior. Primitive tests pin the five mascot silhouettes and local presentation-state behavior.
