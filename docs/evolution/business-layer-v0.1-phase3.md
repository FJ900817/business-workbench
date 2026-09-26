# Business Layer V0.1 Phase 3 evolution

English | [中文](business-layer-v0.1-phase3.zh.md)

Version: Phase 3

Date: 2026-08-30

## Before

The Execution Package froze exact input files and declarative capability/Skill names, but no Host adapter consumed those declarations. Business Workbench started no Agent, Skill definitions were not frozen, and a package could not produce an Artifact through AgentLoop.

## After

The Host freezes complete approved Skill definitions and their winning origins into schema 2 packages. The closed `fixture-agent-run` action validates the Job, Attempt, lease, package, inputs, Skill policy, origin, and drift before one tool-free AgentLoop turn. Success settles a durable Agent Run and an intermediate Artifact with complete execution provenance; failure publishes no referenced output.

## Evidence

Keyless tests assemble the real AgentLoop stack with a deterministic provider. They prove zero visible tools under a code-mode deployment, deny execution of a malicious bash call, keep ambient prompt context out, treat injected instructions as input data, reject missing/disallowed/shadowed/drifted Skills, reject stale execution authority, avoid model retry on failure, replay successful invocation keys once, and restore provenance after restart. Existing Business Workbench and Web bundle assembly regressions remain green.

## Screenshots

None. Phase 3 changes Host execution and persistence only; it has no user-interface change.

## Remaining work

The action, Skills, and output are fixtures. A real XHS action, deterministic output schema, Validation, Human Gate, UI, and Obsidian promotion remain absent. Production Profile execution stays disabled until an explicit provider/model policy is approved.
