# Agent Note: Workbench identity on the Harness home

Status: implemented

English | [中文](2026-09-24-workbench-home-identity.zh.md)

## Problem

The empty-session Harness home already owns the Workspace picker and resident composer. A separate Workbench home would duplicate those controls and make the two entry paths diverge. The proposed Grok Bot replica also has no confirmed rights for inclusion in the product.

## Decision

The sidebar shell renders an AI Team identity section below its Workspace browser and above its existing footer. The later [visual-selection decision](2026-09-24-home-agent-visual-selection.md) adds a presentation-only click state; V1.0 uses five static Grok-derived silhouettes and four local display states without turning these rows into Agent preset controls. V1.1 refines their optical scale and role perimeter, gives the selected row a soft fill and narrow marker, and adds low-frequency idle motion to the Hero and selected team mark. The wide-only section leaves the collapsed rail and existing navigation controls intact.

The empty-session Hero places the selected Agent mascot and label above the unchanged headline, with Main Operator as the default identity. `conversation.hero.brand.mark` remains available for explicit deployment overrides; the official brand package no longer replaces this role mascot with the Harness fish mark. The identity row is positioned outside the headline's layout height, so the Workspace row and resident composer retain their original positions. InputBar, its capability slots, and the macOS voice mount are unchanged.

## Alternatives considered

**Import the complete Grok Bot engine into the UI package.** No reuse license is present, and bundling it would also ship its animation engine and dependencies. V1.0 instead uses five static derived SVGs in the working tree for local prototype use only; they are not cleared for package release or commercial redistribution.

**Make the five names runtime Agent selectors.** There is no owned Agent selection operation in this patch; click targets must not claim that the Harness changes execution preset. The later visual-selection decision confines clicking to presentation.

**Build a Workbench home beside the Harness home.** This would duplicate the resident composer and its Workspace, attachment, model, permission, and voice interactions.

## Consequences

The home retains Harness navigation and input behavior. The five silhouettes (blob, capsule, crystal, wedge, cloud) have role colors; idle, thinking, working, and complete are demo presentation states disconnected from runtime, with every member defaulting to idle. V1.1 breathing and status pulses are CSS-only, low-frequency, and disabled by `prefers-reduced-motion`; they do not report runtime activity. The images derive from an unlicensed Grok Bot replica and must not be shipped or commercially redistributed without rights clearance. Replace them with owned or licensed assets before release.
