# Business Layer V0.1 Phase 2 evolution

English | [中文](business-layer-v0.1-phase2.zh.md)

Version: Phase 2

Date: 2026-08-29

## Before

Phase 1 persisted a running Attempt without an execution owner and preserved it unchanged after Runtime restart. It had no minimum input manifest, Project-scoped reader, drift detection, or safe way to inspect unreferenced Artifact files.

## After

The same Host-only plugin separates pending Attempt creation from leased execution. Restart and expiry produce durable `interrupted` history without automatic retry. Each execution may freeze exact xhs/shared inputs and declarative capability/Skill lists; every read revalidates policy, lease, hash, and size. Read-only reconciliation reports orphan Artifact files.

## Evidence

Focused tests cover lease ownership and expiry, cold restart and explicit new Attempt recovery, package persistence, xhs/shared allow-list reads, denied cross-Project and escape paths, symlink escape, input drift, orphan discovery, existing four-Job behavior, Artifact verification, and schema rejection. All test data uses temporary directories.

## Screenshots

None. Phase 2 changes no user interface, so no Before or After screenshot is required.

## Remaining work

No Agent, Workflow, Skill consumer, Validation, Human Gate, UI, Obsidian promotion, or business metrics are implemented. Production schema-v0 data requires a separately reviewed backup and explicit migration before schema v1 adoption.
