# Agent Note: Bind XHS production sources and settle one output bundle

Status: implemented

English | [中文](2026-08-31-business-xhs-production-gate.zh.md)

## Problem

The Phase 4A XHS action proposal treated account policy and product truth as input files and used generic Skill ids. The approved production S3 instructions instead require one confirmed task card, one note-type writing rule, one note-type golden sample, and the account S3 itself. The S3 directories also cannot be registered verbatim because their uppercase and Chinese names violate the Harness Skill-id grammar. Separately committing three output Artifacts would permit a crash or failed compare-and-swap to leave a partial authoritative result.

## Decision

Revise `xhs-body-prepare-v0` to three exact input roles: `taskCard`, `writingRule`, and `goldenSample`. Treat the selected account S3 as the only Skill snapshot. Remove `accountRule` and `productTruth` because they are not production dependencies and the formal S3 instructions exclude product-description material.

Give each account one Host-owned lowercase adapter id, `xhs-s3-account1` through `xhs-s3-account4`, and map it to exactly one formal `.agents/skills/S3-笔记写作-账号X/SKILL.md` source. Do not rename, copy, discover, or fall back between production Skills. The Phase 4B executable route accepts only a safe fixture snapshot under the selected adapter id; a later production adapter must resolve the mapped formal source and preserve its reported origin, source, content, resources, and hashes.

Keep `xhs-body-prepare-v0` inside the existing Restricted Agent Runner with one fresh Session, the deployment-fixed model, an empty tool set, and the deny-all execution guard. Require an explicit `fixture` route and exact account/note-type policy. The Host creates metadata and provenance so model output cannot invent execution identity or source evidence. The [text-output decision](../bug-fix/2026-09-03-business-xhs-text-output.md) owns the current Markdown transport and deterministic internal encoding.

Represent the three files as one immutable output bundle. Write and fsync an owner-private staging directory, validate every file and relationship, atomically rename the complete directory to its deterministic Attempt-owned location, then use one Job compare-and-swap to attach the bundle and settle the Agent Run, Attempt, and receipt. Published bytes remain non-authoritative until the state update succeeds. Keep publication or staging orphans detectable and never adopt them automatically.

Raise the Business storage schema to version 3. Every Attempt has a nullable output-bundle field, and every completed Agent Run references exactly one output kind: the existing single Artifact or the XHS bundle. Reject older schemas without migration.

## Alternatives considered

- Register the Chinese S3 directory names directly. Rejected because weakening the global Skill-id grammar changes Core behavior and expands the blast radius.
- Copy each S3 into a Business package. Rejected because it creates a second production source and silent drift risk.
- Keep product truth as an input for future flexibility. Rejected because the approved S3 explicitly excludes that source and exact packages should contain only current dependencies.
- Let the Agent return metadata and provenance. Rejected because execution identities, hashes, timing, and policy facts are Host evidence.
- Commit three ordinary Artifacts sequentially. Rejected because no single durable state transition could distinguish a complete result from a partial one.
- Automatically adopt a valid published orphan after restart. Rejected because bytes without the owning Job compare-and-swap are not authorized business facts.

## Consequences

The fixture route proves the production action policy and output lifecycle without reading a real task card or production Vault path. One Attempt can acquire at most one authoritative XHS bundle; exact retries replay it without a model call, while another successful result is rejected before model I/O. Restart verifies every referenced bundle, and reconciliation reports incomplete or unreferenced bytes without changing them.

Production execution remains disabled until a Host resolver freezes the three approved production files and a Skill adapter freezes the one mapped formal S3 definition. Content Validation, Human Gate, and Obsidian promotion remain separate future consumers and cannot treat this intermediate bundle as final.
