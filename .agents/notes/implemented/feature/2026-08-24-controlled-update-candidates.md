# Agent Note: isolated controlled-update candidates

Status: implemented

English | [中文](2026-08-24-controlled-update-candidates.zh.md)

## Problem

The local macOS update control stopped the production Runtime and rebased, installed, and built inside the production checkout. A conflict, dependency failure, incomplete artifact replacement, or incompatible Profile therefore occurred in the only runnable environment. The Stable V0 recovery release existed, but update detection and execution did not use it as an immutable candidate source or require an isolated data home.

## Decision

The macOS shell treats an upstream commit as a candidate, never as permission to update production. Official detection fetches into `<PRIVATE_UPDATE_TEST_ROOT>/upstream-full.git`; neither detection nor candidate execution reads or writes the production repository. Candidate state is a versioned JSON document under the Test root with `detected`, `testing`, `passed`, `failed`, `approved`, and reserved `promoted` states.

Each test run creates a new physical directory and extracts the verified Stable V0 standalone source snapshot into it. It fetches the already detected SHA from the Test mirror and rebases the Stable manifest's ten customization commits from its recorded upstream base. The candidate uses a directory under `<PRIVATE_DSH_TEST_ROOT>/candidates` as `DSH_HOME`, restores the verified Stable Profile archive there, and sets the candidate Runtime's `HOME` to a private child directory. Production `~/.dsh`, port 3080, source, Runtime artifacts, and Profile are never write targets.

The candidate runner requires frozen install and a complete Runtime/Web build, records lockfile and build hashes, runs focused Workspace/Session/Skill/Workflow tests and the candidate macOS shell typecheck, then starts the candidate Runtime on port 3180. It waits independently for the page and RPC route, opens the host WebSocket, creates a Test Workspace and Session, queries the Skill Registry, and verifies that the pinned Profile composition booted. It stops the Test Runtime before finalizing a JSON and Markdown report.

Only `passed` exposes approval. The native UI confirms again and records `approved`; V0.1 has no promotion implementation and performs no production write. The legacy `update-harness.sh` always exits with a refusal.

## Testing

`desktop/macos/test-update-harness.sh` proves the legacy refusal, Test-root state writes, physical candidate replay, isolated DSH home, loopback Runtime/API/WebSocket checks, preserved Stable checkout, and approval transition against temporary repositories. A labelled Evolution candidate one empty commit above the Stable upstream base ran the complete non-fixture-speed path and passed 15 checks, including the full build and pinned production Profile snapshot. Official `master` had no newer commit during implementation, so no official candidate was available.

## Alternatives considered

- **Keep the rollback-based in-place updater** — rejected because reset and rebuild still mutate the only production checkout and cannot make source, Profile, data, Runtime, and App compatibility atomic.
- **Use a Git worktree inside the production repository** — rejected because it shares repository metadata and object maintenance with production and does not satisfy the independent physical source requirement.
- **Copy production `~/.dsh` into every candidate** — rejected because a live copy can be inconsistent, carries credentials and business sessions into tests, and lets an incompatible candidate mutate data intended for production recovery.
- **Implement promotion in the same change** — rejected because candidate isolation can be validated independently, while a safe promotion needs a new pre-upgrade recovery release, App replacement ordering, and a separately reviewed rollback procedure.

## Consequences

An upstream failure consumes disk and build time only under Test roots and leaves production running. Every failed or passed run remains independently inspectable; V0.1 does not delete old candidates. The full physical separation duplicates dependencies and compiler caches, so a complete candidate costs several gigabytes and minutes to build. Approval is now explicit and durable, but it is intentionally not an upgrade: production stays on Stable until a later promotion mechanism is implemented and approved.
