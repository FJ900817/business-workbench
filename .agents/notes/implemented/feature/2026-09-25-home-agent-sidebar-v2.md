# Agent Note: Home Agent sidebar hierarchy

Status: implemented

English | [中文](2026-09-25-home-agent-sidebar-v2.zh.md)

## Problem

On the blank-session Home, the five Agent identity controls were below the Workspace browser and styled as an inset helper panel, and they disappeared when the sidebar collapsed. Their long names and responsibility labels made the group read as secondary copy rather than a discoverable work entry.

## Decision

On the blank-session Home, the sidebar order is New Session, AI Team navigation, Workspace and Session browsing, then bottom-pinned Settings. The expanded AI Team navigation has five vertical buttons with 42px role marks, short localized names, presentation-state labels, and a restrained selected state. In the collapsed 56px rail, the five entries remain as 34px role marks with localized name and status tooltips. The group is a navigation landmark, while every button keeps an accessible full Agent name and responsibility. Selecting an entry still changes only the Home Hero's presentation identity; the group remains absent in a nonblank Session and does not select a runtime Agent, start a task, or alter session state. This supersedes the placement and visible-label decision in the [Home Agent visual selection note](2026-09-24-home-agent-visual-selection.md); its presentation-only state contract remains current.

## Alternatives considered

**Keep the inset panel below Workspace browsing.** Its low position and card styling concealed the five work identities and gave them the visual weight of helper content.

**Show the Agent entries in every Session.** The available selection changes only the blank Home Hero, so showing it in a nonblank Session would imply an execution control that does not exist.

**Keep full English names and responsibility descriptions in each row.** Those labels crowded the vertical list; short localized names and visible state preserve quick scanning, while assistive labels retain full identity and responsibility.

**Hide all Agent entries in the collapsed rail.** That made the primary Home entry group unavailable at the narrow sidebar width; compact role marks and tooltips retain discoverability without expanding the rail.

## Consequences

The Agent group is discoverable before Workspace browsing and remains selectable in both sidebar widths. It consumes more vertical space than the former inset panel, leaving the Workspace and Session browser to use the remaining flexible region. The group is still a Home-only presentation control, not runtime Agent scheduling. Existing mascot assets remain subject to the package's reuse-license limitation.

## Testing

Sidebar behavior tests pin control order, localized labels, selection without session creation, absence in nonblank Sessions, and five accessible controls in the collapsed rail; the assembled sidebar snapshots pin both expanded and collapsed renderings.
