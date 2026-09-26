# Agent Note: Mount production business inputs through logical roots

Status: implemented

English | [中文](2026-08-30-business-production-read-roots.zh.md)

## Problem

The Phase 2 resolver required a synthetic physical directory containing `xhs/` and `shared/product-truth/`. The formal Obsidian vault uses established Chinese directories and must not be moved or mirrored. Mounting the vault or Desktop as one broad root would weaken Project isolation, while exposing absolute production paths in execution packages would couple durable Jobs to one machine.

Schema 1 also needed an explicit production adoption decision before any real Business data existed.

## Decision

Replace the single `readRoot` configuration with fixed `readRoots.xhs` and optional `readRoots.sharedProductTruth` slots. Keep durable and caller-visible paths under the logical `xhs/**` and `shared/product-truth/**` prefixes. Canonicalize each physical root independently and perform containment, regular-file, and symlink checks after logical-root selection.

Configure the production Profile with the formal XHS Project as `xhs` and its product library as `sharedProductTruth`. Keep the Execution Package exact file/root declarations as the final authorization gate. Do not mount the full vault, enumerate source directories, create a production Job, or add an Obsidian writer.

Freeze storage schema 1 as the first Business Layer V0.1 production baseline. Production had no existing Business domain or Artifact data, and the JSON backend remains fail-closed for schema 0 and unknown versions, so no migration framework is justified.

## Alternatives considered

- Move or mirror Obsidian content into synthetic `xhs/` and `shared/` directories. Rejected because Business deployment must not restructure or duplicate the production source of truth.
- Mount the entire Vault as one root. Rejected because XHS is the Project isolation unit and no current input requires another Project.
- Persist absolute production paths in execution packages. Rejected because packages must be portable logical manifests and must not grant raw filesystem access.
- Add a generic migration framework. Rejected because no formal Business data exists and version 1 is the first production baseline.

## Consequences

The production source remains unchanged while the Host can resolve formal task cards, rules, and product truth. A missing or moved configured root fails startup, and an unmounted logical root fails reads. Every admitted file still requires an exact frozen Execution Package entry, so logical-root configuration alone grants no Agent access.

Machine-local Profile configuration now owns physical paths. Stable V0 can restore the pre-deployment Profile. The restricted Agent route consumes the package and enforces capability, Skill, origin, and drift policy before model I/O.
