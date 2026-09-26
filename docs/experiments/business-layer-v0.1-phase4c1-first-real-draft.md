# Business Layer V0.1 Phase 4C-1: first real draft experiment

English | [中文](business-layer-v0.1-phase4c1-first-real-draft.zh.md)

## Result

This engineering experiment is invalid and did not enter manual First-Pass Quality review. The sole real-model request ended with `PROVIDER_ERROR` after the normalized assistant message yielded no extractable text. The raw provider response was not retained, so this record cannot determine whether the response itself was empty. The system did not retry, generate a draft, commit an output bundle or Artifact, or write Obsidian. The failed state, Execution Package, and Agent Run remain durable as the experiment record.

## Experiment identity

| Field | Value |
|---|---|
| Time | 2026-09-02 19:52:22–19:52:48 +08:00 |
| account / month / week / note | `account1 / 2026-08 / 第01周 / note002` |
| task / topic / note type | `T-A1-20260809-002 / C003 / dry-search` |
| software HEAD | `605ce8412600d7a614154f57fb87aafe42c2e15a` |
| Business schema | `4`, unchanged in this run |
| action | `xhs-body-prepare-v0` |
| resolver | `xhs-production-source-v1`, contract schema `1` |
| provider / model / reasoning | `deepseek-official / deepseek-v4-flash / low` |
| max tokens | `4096` |
| comparison mode | `architecture + model mixed` |

## Frozen sources

The Host repeated formal source resolution, hashing, Execution Package freezing, and drift verification before model I/O. A read-only post-run check returned the same source hashes; neither `INPUT_DRIFT` nor `SKILL_DRIFT` occurred.

| Role | SHA-256 | Bytes |
|---|---|---:|
| `taskCard` | `68bdac0f442e6d9601263a26376c1595adae4bc2063cadcb9dc66d531f323432` | 6561 |
| `writingRule` | `e6ec8d256365c9dd4ce5b693c75aeef416a3b6b36abd8194677ee8ad0b5c894a` | 3058 |
| `goldenSample` | `506e3b78b25610ea37b03a0aba96e95734f40c2983a4349e4c0232da82f3b57e` | 3230 |
| account1 S3 source | `e718198d57caf4f6fe25b8ba617fad5fe4c4b804b59c49d04dca02535cbd50a7` | 4795 |

The durable model-visible S3 snapshot hash is `b2d26ffefa0fd5cdcd919f63acda49aeed057ae5488d01a689ff3c3f4ded3261`; the Execution Package id is `package_214d8cadc3f0b02abf8cd123626f709de0643c64a239901663165d75dcb07b43`. The restricted Agent received only these four frozen inputs and no filesystem, bash, Workspace scan, Skill discovery, or subagent tool.

## Durable state

Business Batch `a4367ad7-bf81-4db6-aea9-130d6fe3b4d5` contains the four slots required by the V4 service. Real Job `c18e86fb-90eb-40ff-bbe1-85cb8015951f` and its sole Attempt `0d5b9c35-fafd-48f8-a592-33620c10cdfe` ended as `failed`; the other three disabled placeholder Jobs remain `draft` with no Attempt or Artifact. No four-draft production occurred, but the single-Job experiment still requires a four-slot Batch container under V4.

Agent Run `agent_run_b2aa6b31c011d7dc5e77a98e38ecd6c41044bb8c5287a873b6f1e55dafa03bd6` has failure code `PROVIDER_ERROR` and reason `business-workbench: restricted Agent produced no text output`. Runtime checks session tool calls before checking text output, so this failure also proves that the tool-call count was `0`. Attempt `outputBundle` is `null`, Job `artifactRefs` is empty, and there is no duplicate result or orphan Artifact.

## Performance and engineering result

| Metric | Result |
|---|---:|
| Successful content generations | 0 |
| Real-model requests | 1 |
| Transport retries | 0 |
| Agent Run duration | 26,196 ms |
| Total Job duration | 26,305 ms |
| First response | unavailable |
| Token usage | unavailable |
| Structural bundle time | not applicable |
| Unauthorized actions | 0 |
| Production Obsidian writes | 0 |
| Engineering errors | 1: normalized assistant output contained zero extractable text; raw cause unknown |

Execution Package build time and Skill snapshot time were transient values intended for the success report. The request failed before that report could be committed, so this record does not infer them from durable timestamps. The old-system baseline exists at `account1/2026-08/第01周/note002/小红书笔记完整方案.md`; its body was not read and its post-run mtime remains `2026-08-19T22:24:36+08:00`. The baseline was absent from the Package and Prompt.

## Draft Artifact

None. There is no `draft.md`, `draft-metadata.json`, or `provenance.json`, so there is no body to review and output provenance cannot be called complete. Source provenance remains complete in the Execution Package.

## Human review placeholder

`First-Pass Review` is disabled. This is an engineering failure and must not be rated as directly approved, usable after minor edits, requiring a substantial rewrite, or completely unacceptable. No Revision may start.

## Next step

This run stops at the failure without changing S3, Workflow, Resolver, Prompt, Golden Sample, Model, Schema, or Action and without retrying content generation. The [provider-output recovery experiment](business-layer-v0.1-phase4c1r-provider-output-recovery.md) records the evidence limit and the diagnostic path added for future runs. A production retry still requires fresh authorization. This record does not count as a First-Pass Quality sample.
