# Agent Note: Local macOS client branding

Status: implemented

English | [中文](2026-08-21-local-macos-client-branding.zh.md)

## Problem

The local macOS application embeds the ordinary Web build, whose fallback sidebar identity includes `DSH Local Build` plus a commit hash and whose empty-session hero carries the product preview badge. That served identity is useful in an external development browser but does not match the requested identity of the installed application.

## Decision

The native wrapper installs one main-frame `WKUserScript` at document end. It changes the exact sidebar fallback text to `DeepSeek Harness`, hides its sibling seven-character hexadecimal revision, changes either localized empty-session headline to `简哥 · 探索未知之境`, and hides either localized preview badge. A `MutationObserver` processes only added or changed text nodes so the branding returns when React remounts the sidebar or empty-session hero.

The substitution exists only inside the wrapper's `WKWebView`. The loopback server, its built artifacts, and the same page opened in an external browser retain the upstream identity.

## Alternatives considered

**Change the shared Web client strings.** Rejected because it would replace the upstream development and preview identity for every browser deployment, although the request applies only to the installed macOS application.

**Target generated CSS module class names.** Rejected because bundle rebuilds rename those selectors. Exact visible strings and structural sibling checks survive style-only rebuilds and fail without changing unrelated content when upstream wording moves.

## Consequences

The installed application displays the requested sidebar and empty-session names without exposing its build revision or preview badge. External browsers still identify the development build and preview lifecycle. An upstream change to one of the matched source strings requires updating the wrapper's match list; an unmatched string remains unchanged rather than modifying an unrelated element.
