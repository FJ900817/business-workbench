# Agent Note: XHS revision, retry, and contract repair are separate additive executions

Status: implemented

English | [中文](2026-09-06-business-xhs-revision-retry-v0.zh.md)

The later [length patch repair note](2026-09-08-business-xhs-length-patch-repair.md) supersedes this note only for future title/body-only repair execution; this note remains authoritative for Revision, Retry, and historical Contract Repair evidence.

## Problem

The first production samples exposed two unrelated second-pass needs. A complete candidate may need limited changes directed by a human or external business review, while an empty or structurally incomplete response may need one execution retry. A new ordinary preparation Job cannot express either source relationship, and mutating a completed Job or overwriting its bundle would destroy First-Pass evidence.

## Decision

Business Workbench keeps schema version 5 and represents both operations as new single Jobs. A revision Job owns an immutable `review` Artifact whose body names the source Job, Attempt, output bundle, draft path and hash, candidate type and sequence, review authority, required changes, optional quality suggestions, preserved content, and a self-verifying review hash. The target Job must carry the same task-card input identity as the source. A `MODIFY` review over a completed, structurally parseable First Pass, Revision, or successful Retry is the only review state admitted by revision preflight. Version-1 First-Pass Reviews remain readable without rewriting their Artifacts; new Reviews use version 2 source metadata.

`xhs-body-revise-v0` freezes the original three production inputs, the immutable currently reviewed candidate, the Review Artifact, and the same account S3 snapshot. Lineage assigns revision number 1 after First Pass or Retry and revision number 2 after Revision 1. Revision 2 rejects another revision with `MAX_REVISION_REACHED`. Every Revision points directly to the reviewed candidate and Review, so the immutable chain reaches the original First Pass or failed execution through its Retry without flattening the history. The model instruction permits only `required_changes`, treats `quality_suggestions` as optional, and protects TaskCard truth and listed content. The ordinary XHS validator evaluates the new bundle; no revision-specific relaxed validator exists.

`xhs-body-retry-v0` is admitted only when a failed Agent Run records empty output or the source Validation records `FORMAT_CONTRACT_FAIL`. It excludes the failed draft from model inputs, retains the source Job, Attempt, optional output bundle, closed retry reason, and retry number 1, and accepts no second retry. A completed, structurally parseable Retry result is reviewable and may produce Revision 1. Revision results never enter Retry. Ordinary hard-rule and quality failures are not retryable. Both actions re-resolve the formal production slot and require its task-card, rule, sample, and S3 hashes to equal the First-Pass package before model I/O.

`xhs-body-contract-repair-v0` is a third additive execution for a narrower state: business Review has passed and only deterministic Hard Contract checks remain failed. Its preflight verifies the PASS Review and matching Validation against the exact Candidate hash, derives a closed repair scope, and admits one repair per Candidate. Each production Workflow has an explicit `required` or `none` Skill requirement. First Pass, Revision, and Retry require one account S3 snapshot; Contract Repair requires none. Package creation, durable parsing, public verification, Host policy, and Agent preflight reject an undeclared requirement, a missing required snapshot, or unexpected Skill authority. The repair package contains only the TaskCard, source Candidate, PASS Review, and Hard Validation, with no Skill, writing rule, or golden sample. V0.1 derives title/body length, exact keyword, declared-count metadata, and topic-order repair fields; topic truth changes and comment failures are rejected. Repair provenance records both evidence Artifacts and the derived fields. Repair output cannot enter a second repair or business Revision.

Execution settlement now distinguishes a parseable candidate from structural completion failure. A parseable candidate completes with a `review-ready` status reason even when deterministic content checks fail. A structurally invalid bundle preserves its bytes and Validation but ends the Job and Attempt as `failed` with a retryable status reason. Existing historical Jobs are not rewritten; retry eligibility is derived from their preserved Validation evidence.

## Alternatives considered

- **Add another Attempt to a completed source Job** — this would reopen terminal history and make source and result ownership ambiguous.
- **Use one generic regenerate action** — it would permit review changes to bypass explicit review evidence and could expose failed output during structural retry.
- **Store source relations on Job fields** — changing the persisted Job record would require a schema migration; the execution package and Review Artifact already provide immutable source evidence.
- **Retry any Hard Contract failure** — structural replay cannot establish that business quality has passed; deterministic repair requires separate PASS Review evidence.
- **Let callers name repair fields** — caller-supplied scope could disguise comments, product routing, experiences, or topic truth changes as contract work, so the Host derives the closed fields from Validation.
- **Allow the current production sources to drift** — a second pass would no longer be comparable to its confirmed First Pass and could silently change business truth.

## Consequences

Callers must create a new single Job and pending Attempt, persist a new Review before each Revision or Contract Repair, then acquire a lease and create the dedicated execution package. A task admits at most two Revision executions, Retry callers can create at most one dedicated package from the original structural failure, and each exact Candidate admits at most one Contract Repair Agent execution. A package-verification failure before an Agent session starts does not consume that allowance: runtime recovery interrupts the abandoned Attempt, preserves its evidence, and requires a new Attempt and package. No operation calls a model automatically. All candidate bundles remain immutable, immediate-source lineage appears in output provenance, and runtime recovery uses the existing output-bundle finalizer without reopening source Jobs.
