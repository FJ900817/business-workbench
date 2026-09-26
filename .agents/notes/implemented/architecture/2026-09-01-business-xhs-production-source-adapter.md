# Agent Note: Resolve formal XHS sources before production execution

Status: implemented

English | [中文](2026-09-01-business-xhs-production-source-adapter.zh.md)

## Problem

The frozen XHS action accepted three exact inputs and one account Skill, but the Host could build those packages only from caller-supplied fixture paths and registry definitions. Production task cards use a formal account/month/week/note directory model, derive from a separate confirmed source task, and select rule and sample files by `note_type`. The four approved S3 files live below the Vault-wide `.agents` root rather than the XHS Project root. Letting a caller or Agent search for these files would permit ambiguous candidates, archive fallback, cross-account selection, and silent source changes.

## Decision

Add one Host-owned production source resolver inside `dsh-business-workbench`. Configure it with a Vault root and require the existing `xhs` read root to equal the fixed Project below that Vault. Read only the exact formal entry and baseline, derive the task-card path from validated account/month/week/note values, and verify the card's confirmed source-task lineage. Parse YAML and frontmatter with the maintained `yaml` package and reject duplicate keys. Keep complete versioned Host mappings for the three `note_type` rule/sample pairs and the four account S3 sources. Require the baseline to name the same paths and current hashes; do not discover, rank, or fall back to another file.

Materialize the selected S3 body through the existing Business Skill snapshot function without registering a discoverable Skill. Preserve the formal source hash and bytes separately from the model-visible body hash. Verify that the S3 still declares only the four approved inputs so a newly added hard dependency fails before package creation.

Add `createXhsProductionExecutionPackage` as the only production package constructor. It fixes the Workflow, three exact files, empty directory allow-list, `restricted-agent` capability, and one account Skill. Persist a content-free source manifest containing the entry, baseline, source-task lineage, input routes, S3 source, adapter version, and contract schema. Raise the Business storage schema to version 4 and reject older media without migration. Re-read exact frozen sources during package verification; use `INPUT_DRIFT` for input/control/lineage changes and `SKILL_DRIFT` for S3 changes.

The [source-bound production Agent route](2026-09-02-business-xhs-production-agent-route.md) consumes this manifest through an independent policy decision. The resolver itself does not authorize model execution, Artifact settlement, or Obsidian writes.

## Alternatives considered

- Use the filesystem Skill provider and registry discovery. Rejected because the formal S3 names are not the logical ids, production origins must be exact, and discovery can select shadowing or unrelated candidates.
- Copy production files into the Business data root. Rejected because a copy creates a second source of truth and weakens source drift evidence.
- Let callers pass absolute paths. Rejected because callers could select another account, archive, Project, rule type, or sample.
- Trust only the baseline paths. Rejected because a swapped rule/sample path with a matching hash would silently change `note_type` semantics; the versioned Host mapping must agree.
- Store only the three input hashes. Rejected because the formal entry, baseline, source-task lineage, and S3 full-file identity would disappear after restart.
- Enable the production Agent route in the same change. Rejected because source resolution must be validated independently before the first real content experiment.

## Consequences

One production Attempt has durable evidence for every authority that selected its three input files and S3 Skill. Exact retry identity ignores observation timestamps but includes source identities; changed sources require another Attempt and idempotency key. The Agent still receives only package bytes and the S3 snapshot, never filesystem authority or a Vault path lookup mechanism.

Storage schema 3 data is intentionally incompatible with schema 4 under the repository's pre-release policy. Deployments must use an isolated Phase 4C-0 data root or explicitly recreate non-production Business state. Production execution reuses version 4 and must verify this manifest immediately before model I/O.
