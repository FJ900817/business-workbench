# Business Layer V0.1 Phase 4C-0: production source adapter gate

English | [中文](business-layer-v0.1-phase4c0.zh.md)

Phase 4C-0 defines the deterministic Host bridge from the current formal XHS Vault sources to a frozen Business execution package. It resolves one confirmed task card, the task-card-selected V3.0 writing rule and golden sample, and the account S3 Skill. The resolver itself invokes no Agent, generates no draft, commits no Artifact, writes no Obsidian data, exposes no UI, and modifies no Harness Core.

## Production authority

The deployment config supplies one `vaultRoot`; `readRoots.xhs` must canonicalize to the fixed XHS Project below that Vault. The adapter first reads the exact `00_小红书单篇正式生产入口.md` and `00_小红书正式生产运行基线.yaml`. The entry must be `正式`, its version must match the compiled task card, and the baseline must name that exact entry. The adapter version is `xhs-production-source-v1`; its durable contract schema is `1`.

The resolver accepts exactly `account`, `productionMonth`, `productionWeek`, and `note`. It validates their closed grammars and derives one `写作任务卡.md` path from the formal directory model. It never lists a directory or accepts a candidate path. The card must be `已确认`, match all four requested fields, declare `task_id`, `topic_id`, and a supported `note_type`, and point to one exact system-two source task. The source task must remain confirmed, its hash must equal `source_task_sha256`, and its account, task, topic, and note type must match the compiled card.

## Exact routes

| Task-card `note_type` | Host value | V3.0 writing rule | Golden sample |
|---|---|---|---|
| `干货搜索型（dry_search）` | `dry-search` | `干货搜索型选题创作规范_V3.0.md` | `01_干货搜索型/02_黄金样稿.md` |
| `干货推荐型（recommendation）` | `recommendation` | `干货推荐型选题创作规范_V3.0.md` | `02_干货推荐型/02_黄金样稿.md` |
| `热点流量型（hot_traffic）` | `hot-traffic` | `热点流量型选题创作规范_V3.0.md` | `03_热点流量型/02_黄金样稿.md` |

The Host mapping contains the complete Project-relative paths. The baseline must contain the same mapping and a hash matching current bytes. A missing type, swapped path, changed bytes, Project escape, archive path, duplicate YAML binding, or unsupported syntax fails closed. There is no fuzzy match, alternate-version lookup, or fallback.

| Account | Logical Skill id | Exact Vault-relative source | Provider |
|---|---|---|---|
| `account1` | `xhs-s3-account1` | `.agents/skills/S3-笔记写作-账号1/SKILL.md` | `business-xhs-production-v1` |
| `account2` | `xhs-s3-account2` | `.agents/skills/S3-笔记写作-账号2/SKILL.md` | `business-xhs-production-v1` |
| `account3` | `xhs-s3-account3` | `.agents/skills/S3-笔记写作-账号3/SKILL.md` | `business-xhs-production-v1` |
| `account4` | `xhs-s3-account4` | `.agents/skills/S3-笔记写作-账号4/SKILL.md` | `business-xhs-production-v1` |

The S3 adapter verifies the baseline path and full-file hash, formal frontmatter name, and the declared four inputs: current task card, this Skill, one V3.0 rule, and one golden sample. A new numbered dependency is rejected as a contract gap. The adapter strips S3 frontmatter from model-visible Skill content, freezes the exact body through the existing Phase 3 Skill snapshot implementation, and records source hash, bytes, account, formal name, origin, provider, resolved time, snapshot hash, and route reason. It does not register a discoverable Skill or modify the Skill Registry.

## Package evidence and drift

`createXhsProductionExecutionPackage` owns all package declarations. Callers cannot supply source paths, read roots, capabilities, or Skills. The package has exactly three allowed files, no allowed directory root, `restricted-agent`, and one mapped S3 id. It also persists a content-free production-source manifest containing formal entry, baseline, source-task lineage, resolved task identity, three input routes, and the S3 source identity. Storage schema version `4` rejects versions 0 through 3 without migration.

Package creation freezes each input through the existing read boundary and compares its hash and size with the just-resolved route, closing the resolution-to-package race. Verification re-reads the same paths and never resolves a replacement. Entry, baseline, source task, task card, rule, or sample changes produce `INPUT_DRIFT`; S3 removal, source change, or snapshot change produces `SKILL_DRIFT`. A caller must create a new Attempt and package to use changed sources.

The package contains source bytes, but the restricted Agent remains unable to read the Vault. The separate `production` route consumes only these frozen bytes and source evidence, publishes no filesystem or discovery tool, and retains the deny-all executor.

## Real production resolution dry run

One read-only run used `account1 / 2026-08 / 第01周 / note002`, task `T-A1-20260809-002`, topic `C003`, and `dry-search`. It used a temporary DSH home and stopped after resolve, snapshot, package build, Skill snapshot, and manifest verification.

| Role | Result | SHA-256 | Bytes | Route reason |
|---|---|---|---:|---|
| `taskCard` | resolved | `68bdac0f442e6d9601263a26376c1595adae4bc2063cadcb9dc66d531f323432` | 6561 | Exact requested slot; confirmed |
| `writingRule` | resolved | `e6ec8d256365c9dd4ce5b693c75aeef416a3b6b36abd8194677ee8ad0b5c894a` | 3058 | `dry-search` exact V3.0 route |
| `goldenSample` | resolved | `506e3b78b25610ea37b03a0aba96e95734f40c2983a4349e4c0232da82f3b57e` | 3230 | `dry-search` exact formal sample route |
| account S3 | resolved | `e718198d57caf4f6fe25b8ba617fad5fe4c4b804b59c49d04dca02535cbd50a7` | 4795 | `account1` exact formal S3 route |

The entry, baseline, and source-task lineage were also hash-verified. The run loaded no Agent, LLM, tool, or Session and did not call the Artifact writer. It produced no body, Agent Run, output bundle, or Artifact and made no production Vault write.

## Failure coverage

Keyless tests reject a wrong account, nonexistent note, unconfirmed card, wrong card account or `note_type`, missing or swapped rule, missing or swapped golden sample, wrong/missing/archived S3, duplicate baseline binding, moved task card, modified S3, and Project escape. The package integration verifies schema persistence, exact manifests, empty Agent Run history, and zero Artifact references. Existing Phase 1 through Phase 4B tests continue to cover lease, recovery, read policy, Skill snapshot, restricted tools, output settlement, and fixture action behavior.

## Phase 4C-1 handoff

The `production` route consumes the persisted source manifest, re-verifies all sources immediately before model I/O, accepts only this adapter's formal S3 origin, retains the empty tool set, and commits only an `intermediate` bundle. A Phase 4C-1 experiment may execute one explicitly approved Job, then stop for manual review without finalization or Obsidian promotion. Four-Job production, automated Validation, Human Gate UI, and promotion remain out of scope.

Harness Core, AgentLoop, WorkflowEngine, Skill Registry, Workspace, Session, LLM Core, production Obsidian files, and the Restricted Agent tool boundary are unchanged.
