# Agent Note: Complete authoritative XHS execution without regenerating output

Status: implemented

English | [中文](2026-09-03-business-output-finalization-recovery.zh.md)

## Problem

An operator process can exit after an XHS Agent Run and output bundle are committed but before it completes the owning Job. Transient metrics disappear with that process. Retrying generation would replace a first-pass experiment instead of recovering its completed work.

## Decision

The Business Host completes the latest running or interrupted XHS Attempt only after verifying its authoritative bundle, completed Agent Run, and frozen-package provenance. The same serialized operation serves explicit finalization and abandoned-execution recovery. Repeated completion retains one receipt and revision; a published orphan, corrupt output, or superseded Attempt is not recoverable this way. Execution completion grants no human approval or asset promotion.

Before new XHS output settlement, write-once, fsynced observations retain available runtime metrics separately from the unchanged V5 Job and three-file bundle formats. Recovery without observations records `telemetry incomplete`, not invented token values. Machine title counts use Unicode code points excluding the Markdown heading prefix; model declarations remain separately observable and never rewrite the draft.

This extends the [output-bundle decision](../architecture/2026-08-31-business-xhs-production-gate.md) and partially supersedes transient-only reporting in the [production Agent route](../architecture/2026-09-02-business-xhs-production-agent-route.md). Both source-policy decisions remain active.

## Alternatives considered

**Fix only the operator cleanup call.** Rejected because any crash in the post-bundle window still leaves a running Job.

**Regenerate output or infer missing usage.** Rejected because neither action restores recorded facts or preserves first-pass identity.

**Change V5 or the immutable output bundle.** Rejected because observations do not define business authority and existing approved bytes must remain untouched.

## Consequences

Fixture coverage exercises explicit and repeated completion, Loader restart without model services, missing observations, and corrupt-record rejection. The production recovery independently verifies unchanged output bytes and historical Jobs. Missing historical metrics remain unavailable; full content validation, body-count parsing, human review, and asset promotion are not implemented. Single-Runtime write ownership remains required.
