# Business Layer V0.1 Phase 4C-3C Evolution

English | [中文](business-layer-v0.1-phase4c3c.zh.md)

Version: Phase 4C-3C

Date: 2026-09-04

## Before

XHS generation preserved the raw three-file output bundle, but model-declared title and body counts were the only count labels inside the Draft. Hard TaskCard values were not projected into a final prompt checklist, and no deterministic content evidence became durable with the bundle.

## After

The Host projects explicit TaskCard hard rules, appends them to the final restricted user instruction, and validates the unmodified Draft with `xhs-hard-contract-l1-v1`. Actual title/body counts, exact keyword evidence, title-keyword checks, comment counts, topic counts, deferred checks, and `PASS/WARN/FAIL` are stored in one immutable `validation` Artifact. The output bundle and Validation Artifact become authoritative in the same Job compare-and-swap without changing schema version 5.

## Evidence

Synthetic tests cover range boundaries, Unicode, Markdown title wrappers, optional `正文：`, comment forms, hashtags, wrong and missing model declarations, duplicate execution, restart, and unchanged Draft bytes. A read-only replay reproduced the four frozen title/body results and preserved all four SHA-256 values. No Provider or Obsidian write was used.

## Screenshots

None. This phase changes no UI.

## Remaining work

Opening/middle/ending keyword locations and semantic requirements remain deferred until a separate segment definition exists. A new four-item verification set is required before expanding the experiment to twelve items.
