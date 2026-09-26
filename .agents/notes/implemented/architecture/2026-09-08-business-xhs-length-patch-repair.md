# Agent Note: XHS length repair applies bounded model proposals in the Host

Status: implemented

English | [中文](2026-09-08-business-xhs-length-patch-repair.zh.md)

This note narrows future title/body-only repairs but does not replace the broader historical Contract Repair and Revision decisions in [the V0 lineage note](2026-09-06-business-xhs-revision-retry-v0.md).

## Problem

A real XHS candidate passed business review but failed only the deterministic title and body length ranges. The existing Contract Repair action asked the model to return a complete Draft; its production result changed the body from 848 to 876 characters while leaving a 17-character title unchanged. Repeating full-Draft generation would weaken the already-passed business content and still would not guarantee numeric compliance.

## Decision

`xhs-body-length-repair-v0` is a separate Skill-free execution. Preflight requires a hash-bound `PASS` Review, a format-complete source Candidate, matching Hard Validation, and failures limited to `titleRange` or `bodyRange`. A started length-repair Agent Run consumes the source Candidate's only allowance; a length-repair output cannot enter Repair 2 or ordinary business Revision.

The model returns one strict JSON proposal containing at most three title candidates and three independent body options. Each body option consists of local, single-line `old_text` to `new_text` replacements. It cannot return a complete Draft or character metadata. The Host rejects unknown fields, multiline values, source text that occurs zero or multiple times, and overlapping replacements.

Every trial starts from the exact immutable source Draft. The Host applies the proposed title and body edits, regenerates title/body metadata with `countXhsFullCharacters`, parses `xhs-draft-markdown-v1`, reruns the current Hard Contract Validator, compares comments and topics with the source, and requires every exact Review `preserve` value to remain present. It never claims that these deterministic checks prove semantic equivalence; a human Patch Approval owns that judgment. If no trial passes, the operation stores proposal evidence and produces no Candidate. If multiple trials pass, the Host selects the lowest Unicode Levenshtein distance, then proposal order, without another model call.

A machine-valid Candidate remains `CANDIDATE_READY`. A separate Patch Approval records only `APPROVE / PROMOTION_ELIGIBLE` or `REJECT / STOP`, including before/after title text and Host counts. Approval starts no execution and performs no Obsidian promotion. Existing schema version 5 can encode the additive action, lineage, Artifacts, and output bundle without rewriting prior records.

## Alternatives considered

- **Reuse Contract Repair** — its full-Draft response is broader than a safe length patch and already failed the real numeric objective.
- **Let the model select its own compliant result** — model-declared counts are not authoritative and cannot replace the Validator's counter.
- **Apply body options cumulatively** — this makes later trials depend on rejected edits and violates comparison against the reviewed source.
- **Automatically promote a passing patch** — deterministic length checks do not establish that the business meaning remains acceptable.
- **Increase schema version** — the current additive unions and immutable Artifact plane represent the new execution without changing stored Job fields.

## Consequences

Callers create a new single Job and PASS Review, perform read-only eligibility checks, acquire execution, and freeze the four exact evidence inputs. One provider request can create either proposal evidence only or one authoritative repaired Candidate. The source Candidate and its business PASS remain unchanged. A human must inspect the patch diff before promotion becomes eligible, and rejection is terminal for this repair allowance.
