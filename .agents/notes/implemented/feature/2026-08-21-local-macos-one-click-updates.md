# Agent Note: Local macOS One-Click Updates

Status: implemented

English | [中文](2026-08-21-local-macos-one-click-updates.zh.md)

## Problem

The local macOS wrapper launches a built checkout, so closing the browser-like window or keeping the application in the Dock does not update the checkout. A user who does not routinely inspect GitHub can continue running an old build without any visible signal, and a direct pull can overwrite or conflict with local customization.

## Decision

The native wrapper checks the official `master` after launch and every six hours while the application is open. It shows a lower-left **Update** button only when the remote head is not an ancestor of the local `HEAD`; a local customization commit therefore does not create a false update signal.

The wrapper gives its local-only Web view an empty proxy configuration on macOS 14 and newer. The page still reaches the owned loopback server when a configured system proxy is unavailable instead of failing with an empty window.

The owned Web server starts with `--no-open` because the native Web view owns presentation. This suppresses the CLI's ordinary default-browser handoff and keeps one application window per launch.

The button stops the owned server before mutation and waits for it to exit. The bundled updater then validates the official origin, the `master` branch, and a clean tracked worktree; fetches `origin/master`; rebases local customization commits; installs the lockfile; and builds the full application. The wrapper restarts the server and reloads the Web view only after the updater exits. It escalates SIGTERM to SIGKILL after eight seconds so update and application teardown wait for server quiescence.

The update is fail-closed. A rebase conflict aborts before dependency or build changes. An install or build failure resets the clean tracked tree to its exact prior commit and rebuilds that version. Untracked Harness state remains in place throughout. Diagnostics are captured in a random 0700 temporary directory with a 0600 log file, and only the bounded tail reaches the failure dialog.

## Consequences

The installed application advertises official updates without a terminal and applies ordinary updates with one click. Checks run only while the application is open; the wrapper does not install a background launch agent or send system notifications while closed.

Local source customization must be represented by commits for automatic rebasing. Uncommitted tracked edits deliberately block the update and remain untouched. A genuine rebase conflict still needs manual resolution because selecting either side automatically could discard official changes or local behavior.

The update operation requires the existing local Git, Node.js, Corepack, and network access. It updates and builds the local checkout rather than replacing it with a separately signed upstream application artifact.

## Alternatives considered

- **Polling and updating in the Web client**: the browser presentation layer cannot safely own host Git processes, dependency installation, server shutdown, or application restart. Keeping the operation in the native wrapper preserves the Web client's process boundary.
- **Updating immediately without a button**: automatic mutation could interrupt an active session and makes local conflicts surprising. A visible user gesture chooses when the server may stop.
- **Discarding local changes and resetting to the official branch**: this gives a simpler updater but destroys customization. Rebasing committed customization preserves it and stops safely when Git cannot combine the histories.
- **A persistent background helper**: it could notify while the application is closed, but adds a launch agent, another lifecycle owner, and continuous background network activity. Startup and six-hour in-app checks cover the local client's use without that footprint.
