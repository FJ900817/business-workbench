# Business Layer V0.1 Phase 1 evolution

English | [中文](business-layer-v0.1-phase1.zh.md)

Version: Phase 1

Date: 2026-08-28

## Before

Harness had durable Session events and general storage services, but no persistent Business Job authority, exact four-item Batch aggregate, Job compare-and-swap API, execution Attempt history, or business Artifact commit protocol. Business progress could only be inferred from Chat Session or external files.

## After

The Web Host composition mounts one Host-only `business-workbench` plugin. It persists one `xhs` Batch as exactly four independent Jobs, preserves immutable Attempt history, rejects stale and non-idempotent mutations, atomically publishes verified Artifacts, and reconstructs the same facts after Runtime restart. It exposes no UI and performs no Agent, Workflow, Validation, or Obsidian action.

## Evidence

Focused automated tests cover normal operations, all partial Batch creation points, cold restart, four-Job failure isolation, stale writes, repeated operations, Artifact corruption, and unsupported schema data. Test state and Artifact roots are temporary and removed after each test.

## Screenshots

None. Phase 1 changes no user interface, so the Evolution rule does not require Before or After screenshots.

## Remaining work

Execution recovery, Project-scoped read enforcement, Workflow runs, validators, human review, reliability metrics, Remote APIs, Browser UI, and safe Obsidian promotion remain outside Phase 1.
