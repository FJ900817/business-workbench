# Business Layer V0.1 Phase 2.5 evolution

English | [中文](business-layer-v0.1-phase2.5.zh.md)

Version: Phase 2.5

Date: 2026-08-30

## Before

Schema 1 existed in source after Phase 2 but had not been declared the first production baseline. The Web Host mounted Business Workbench without production inputs, and the single-root resolver assumed synthetic `xhs/` and `shared/product-truth/` directories beneath one physical root.

## After

Production had no existing Business data, so schema 1 is frozen without migration tooling. The resolver now maps fixed logical prefixes to independently canonicalized physical roots. The production Profile mounts only the formal XHS Project and its product library; every file still requires an Execution Package allow-list entry.

## Evidence

Phase 1 and Phase 2 regressions run under schema 1. Added checks cover first persistence, restart, unsupported versions, separate logical roots, unmounted roots, authorized production-class inputs, denied Projects and unlisted files, traversal, absolute paths, symlink escape, production Profile composition, and loopback Runtime health. Formal Obsidian inputs are read-only and no production Job is created.

## Screenshots

None. Phase 2.5 changes Host configuration and read authorization only; it has no user-interface change.

## Remaining work

Phase 3 must enforce capability and Skill declarations at the Host boundary. Agent execution, XHS body production, Validation, UI, and Obsidian promotion remain absent.
