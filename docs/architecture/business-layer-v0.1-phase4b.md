# Business Layer V0.1 Phase 4B: XHS production execution gate

English | [中文](business-layer-v0.1-phase4b.zh.md)

Phase 4B makes `xhs-body-prepare-v0` executable through the Restricted Agent Runner only for an explicit safe-fixture route. It audits and freezes the production source mapping, creates a three-file intermediate output bundle, and proves the assembled fixture lifecycle. It does not execute a real task card, resolve production Vault bytes at runtime, perform content Validation or Human Gate work, promote to Obsidian, add UI, or modify Harness Core. The later [Phase 4C-0 source adapter](business-layer-v0.1-phase4c0.md) satisfies the source-resolution prerequisite without enabling production Agent execution.

## Production input audit

The read-only audit used the formal XHS production baseline and the four account S3 files under the current production Vault. Each formal S3 requires one confirmed task card, its own S3 instruction, the task-card-selected V3.0 writing rule, and the corresponding golden sample. The S3 instruction is model policy and therefore belongs in the Skill snapshot; it is not a package input. The formal instructions exclude a separate account-rule file and product-description or product-truth material.

| Execution role | Production source rule | Runtime treatment |
|---|---|---|
| `taskCard` | One confirmed task-card file selected by the caller | Exact-file input snapshot |
| `writingRule` | The one formal V3.0 file selected by task-card `note_type` | Exact-file input snapshot |
| `goldenSample` | The one formal sample selected by the same `note_type` | Exact-file input snapshot |
| Account S3 | The account's `.agents/skills/S3-笔记写作-账号X/SKILL.md` | Exact Skill snapshot |

The Phase 4A proposal is revised from four input files to three. `accountRule` and `productTruth` are removed; adding them would contradict the approved S3 operating instructions. `allowedReadRoots` remains empty and `allowedReadFiles` must equal the three input paths, so the action cannot scan the project or Vault.

## Exact S3 binding

Harness Skill ids permit lowercase ASCII identifiers, while the approved S3 directories use uppercase and Chinese names. Phase 4B does not rename or duplicate those production Skills and does not weaken the registry parser. The Host owns four deterministic adapter ids that identify the exact formal source it must snapshot later:

| Account | Host Skill id | Formal source | Audited baseline SHA-256 |
|---|---|---|---|
| `account1` | `xhs-s3-account1` | `.agents/skills/S3-笔记写作-账号1/SKILL.md` | `e718198d57caf4f6fe25b8ba617fad5fe4c4b804b59c49d04dca02535cbd50a7` |
| `account2` | `xhs-s3-account2` | `.agents/skills/S3-笔记写作-账号2/SKILL.md` | `7448eeec29199bfb0078d4a14207b378b0a4137dbd899188cf9103f0c2bc6350` |
| `account3` | `xhs-s3-account3` | `.agents/skills/S3-笔记写作-账号3/SKILL.md` | `12e3a3610ab31294a30d469e5cd33b3c3c28681c1340a3b27fdc6a4a2d350eb3` |
| `account4` | `xhs-s3-account4` | `.agents/skills/S3-笔记写作-账号4/SKILL.md` | `ef9a8daefd78deef5766f95537b2bc160d107b11498202d398b0191394619a68` |

The executable fixture route registers one safe Skill definition under the selected adapter id and freezes its winning provider, source, origin, version when present, resource base, body, resources, and manifest hashes. The audited formal S3 files declare no separate version or dependent-resource list; their required writing rule and golden sample are explicit execution inputs. Policy requires exactly one selected id; another account, extra Skill, discovery result, unapproved origin, changed bytes, or changed manifest fails before model I/O. A production resolver that reads the named formal file and reports its `project-agents` origin remains a Phase 4C prerequisite.

## Closed action policy

The action is `xhs-body-prepare-v0`, Project is `xhs`, Workflow version is `xhs-body-prepare-v0`, and the policy version is `xhs-body-prepare-policy-v1`. The request must declare route mode `fixture`, one of four accounts, and one supported `note_type`. The Host maps that pair to the exact writing-rule and golden-sample binding, requires `restricted-agent`, uses exactly one account Skill, fixes the deployment-configured provider and model, and admits no callable tools.

The Agent receives one fresh Session, one complete system prompt formed from the fixed action instruction and Skill snapshot, and one user message containing the three frozen inputs. It receives no preset, prior Session, filesystem, Bash, Workspace, Skill discovery, subagent, Workflow tool, or alternate model selection. The model response must be a JSON object containing only a non-empty `draft` string of at most 64 KiB; the Host creates all other output facts.

## Output bundle and settlement

The result is one `intermediate` Business output bundle with exactly three UTF-8 files:

| File | Owner | Required facts |
|---|---|---|
| `draft.md` | Model text after Host parsing | Non-empty Markdown, size and SHA-256 |
| `draft-metadata.json` | Host | Output version, Project/action, Batch/Job/Attempt, account, note type, draft hash and size, validation slot |
| `provenance.json` | Host | Package and Skill manifest hashes, exact input and Skill snapshots, action-policy version, provider/model, run identity, start/end times, draft hash |

The Host validates exact filenames, JSON schemas, Project/action identities, Batch/Job/Attempt/run relations, input and Skill facts, draft size/hash, and manifest hash before settlement. Validation has a reserved disabled slot only; this phase performs structural and provenance checks, not content-quality judgment.

The output store writes an owner-private staging directory, fsyncs its three files and manifest, atomically renames the complete directory to its deterministic Attempt-owned location, and then performs one Job compare-and-swap that attaches the bundle, completes the Agent Run and Attempt, and records the idempotency receipt. Published bytes are not authoritative until that single state update succeeds. A crash before or during publication produces no referenced result; a crash after publication but before CAS leaves a read-only detectable orphan. Reconciliation never adopts or deletes an orphan automatically.

One Attempt can have at most one authoritative output bundle. The idempotency key is `xhs-body-prepare-v0:attempt:<attemptId>`; a retry returns the same persisted result without another model request. A different key cannot produce a second success for that Attempt.

## Verification

The keyless assembled snapshot records the action, policy version, fixed model policy, empty tool policy, four formal Skill mappings, three input roles, three output names, safe fixture Skill hash, schema version, and fixture input-content hash. The fixture integration covers Batch, Job, Attempt, lease, package, policy, Restricted Agent, bundle publication, Job CAS, restart, verified read, idempotent replay, and second-success rejection.

Negative coverage rejects wrong Project, action, account, note type, Workflow, capability, Skill id, Skill origin, package, input drift, Skill drift, tool invocation, malformed model JSON, missing or extra output fields, empty or oversized draft, malformed metadata or provenance, relationship or hash mismatch, partial bundle, manifest corruption, duplicate success, interrupted publication, and v0/v1/v2 storage.

One credential-gated smoke used the configured `deepseek-official / deepseek-v4-flash` route with safe temporary fixtures and produced one valid bundle. Forbidden tool executor calls were zero, the temporary DSH home was isolated, and the managed credential document hash did not change. No production task card or Vault path was mounted for that call.

## Why real content generation remains disabled

The production input resolver and formal-S3 adapter are not yet wired to the runtime. Content Validation, Human Gate, review feedback, and Obsidian promotion also do not exist. Enabling real task-card bytes before those controls would turn a source-mapping audit into production authorization. Phase 4B therefore proves only the fixture route and preserves a fail-closed production gate.

## Phase 4C prerequisites

- Add a Host-owned resolver that accepts an approved task-card reference, reads only the three deterministic production files, verifies the audited baseline and task-card status, and materializes the same package without exposing filesystem authority to the Agent.
- Add a production Skill provider or adapter that resolves exactly one mapped S3 file, reports its formal origin and source, and freezes the winning definition without discovery or fallback.
- Freeze a content Validation policy and Human Gate consumer before any result can become `final` or reach Obsidian.
- Define explicit approval, recovery, and audit evidence for the first single real Job; keep four-Job batch production disabled until that result is reviewed.

Harness Core, AgentLoop, WorkflowEngine, Session format, production Obsidian data, UI, and Profile plugins are unchanged.
