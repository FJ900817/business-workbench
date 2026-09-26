# Agent Note: Own business execution and freeze its reads

Status: implemented

English | [中文](2026-08-29-business-execution-ownership-and-read-policy.zh.md)

## Problem

Business Job persistence cannot safely drive execution while `running` means only that an Attempt record exists. Runtime termination leaves no evidence that the former owner is gone, and a new caller could mistake stale state for live work. An Agent also must not discover inputs by scanning the full Obsidian tree. Each Attempt needs a fixed input set and host-enforced read policy before any model integration is permitted.

## Decision

Keep one Host-only `dsh-business-workbench` plugin and separate Attempt creation from execution lease acquisition. Persist one lease inside the Attempt with caller owner, Runtime instance, renewal, expiry, and status. Every execution mutation verifies current Attempt, owner, Runtime, expiry, Job revision, and idempotency receipt. Startup converts foreign-Runtime running leases to interrupted history; explicit recovery converts expired leases. Neither path retries automatically.

Persist at most one immutable execution package per Attempt. It records exact input files with frozen presence, hash, and size; Workflow version; allowed read roots and files; and declarative capability and Skill lists. A package-internal resolver accepts only relative paths below xhs or the shared product-truth root, requires an exact package input, canonicalizes the source root and file, rejects symlink escape, and reports drift without rewriting the manifest.

Raise the business storage schema from 0 to 1 and reject v0 without mutation. Retain the single-Runtime-writer deployment rule instead of adding a lock file without a complete stale-owner protocol. Add read-only orphan Artifact reconciliation and leave disposition to a later policy.

## Alternatives considered

- Treat a persisted running state as resumable. Rejected because process ownership and in-memory execution cannot survive restart by implication.
- Create a new Attempt automatically at startup. Rejected because recovery must not repeat model work or produce duplicate Artifacts without caller approval.
- Put read restrictions in prompts or Skill instructions. Rejected because those are model-visible guidance, not Host authorization.
- Change the global filesystem sandbox. Rejected because the business Project policy is narrower than general Harness filesystem behavior and must not affect unrelated workloads.
- Split lease, package, and read policy into separate plugins. Rejected because they mutate or authorize the same Job/Attempt aggregate and do not yet evolve independently.
- Add a cross-process lock file. Deferred because reliable stale-lock recovery would recreate the same ownership problem at a second layer.

## Consequences

No Job is truly running without one current non-expired lease owned by the current Runtime. Restart makes abandoned work explicitly recoverable while preserving old Attempt, package, Artifact, and receipt evidence. A future Agent adapter receives an exact frozen input set and cannot use this service to scan unrelated Projects.

Schema v0 is no longer loadable by this package and needs an explicit, separately reviewed migration before production reuse. The JSON backend remains safe only under the documented single-Runtime-writer deployment. Capability and Skill allow-lists are durable declarations until a later adapter enforces them at invocation.
