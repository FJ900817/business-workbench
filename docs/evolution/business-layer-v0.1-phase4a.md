# Business Layer V0.1 Phase 4A evolution

English | [中文](business-layer-v0.1-phase4a.zh.md)

Version: Phase 4A

Date: 2026-08-31

## Before

The restricted Agent route had keyless fixture coverage but no successful call through the configured real provider. The first XHS body action had no machine-readable minimum input, Skill, output, idempotency, or future Validation/review contract.

## After

One credential-gated e2e uses the real `deepseek-official / deepseek-v4-flash` route while keeping Business state and inputs in a temporary home. It proves zero forbidden executor calls, one intermediate Artifact, pre-model rejection of input drift, Skill drift, and package mismatch, and unchanged managed credentials. `xhs-body-prepare-v0` now has a machine-readable package and output contract but remains impossible to invoke through `runRestrictedAgent`.

## Evidence

The real-provider smoke passed once in about 2.8 seconds. The focused keyless suite covers contract acceptance and every input/read/capability/Skill expansion, plus existing restricted-Agent failure and persistence behavior. The Provider failure path retains its non-sensitive Session code and message while publishing no Artifact.

## Screenshots

None. Phase 4A has no user-interface change.

## Remaining work

The production Skills, executable XHS action policy, atomic three-output validation, Human Gate, full Validation, and Obsidian promotion remain absent. No real XHS body has been generated.
