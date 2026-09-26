# Business Layer V0.1 Phase 4B Evolution

English | [中文](business-layer-v0.1-phase4b.zh.md)

Version: Phase 4B

Date: 2026-08-31

## Before

`xhs-body-prepare-v0` was non-executable and proposed four input files plus two generic Skill ids. There was no audited mapping to the approved account S3 instructions, no closed action route, no three-file bundle validation, and no atomic business-state attachment for one XHS draft result.

## After

The production source audit revised the action to three exact input files plus one account S3 Skill snapshot. Four legal Host adapter ids now map deterministically to the four formal S3 source files. An explicit fixture-only XHS route uses the Restricted Agent Runner, one fixed configured model, no tools, no discovery, and no alternate Skill. The Host accepts only a draft string from the model, creates metadata and provenance, validates the complete bundle, atomically publishes it, and makes it authoritative through one Job CAS.

## Evidence

The assembled keyless snapshot freezes the action, model and tool policies, production Skill mappings, input/output names, schema version, and safe fixture hashes. The full fixture lifecycle passes through Batch, Job, Attempt, lease, package, Restricted Agent, output bundle, restart, read verification, and idempotent replay. Negative tests cover source, policy, drift, output, relation, persistence, duplicate, and interrupted-publication failures. One credential-gated real-provider smoke produced a valid safe-fixture bundle with zero forbidden executor calls and no production Vault mount.

## Screenshots

None. Phase 4B has no UI change.

## Remaining work

The runtime still lacks the production input resolver, formal S3 provider adapter, content Validation, Human Gate, and Obsidian promotion. Real task cards remain disabled, and no real XHS body was generated.
