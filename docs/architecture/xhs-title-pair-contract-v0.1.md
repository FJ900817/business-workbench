# XHS body-title to P1-title handoff contract V0.1

English | [中文](xhs-title-pair-contract-v0.1.zh.md)

This document defines the formal `title_pair_contract` interface delivered by Business Workbench from an S3 final body to S15. V0.1 implements a separate immutable final-body handoff Artifact bound to the exact body SHA-256. The original Obsidian body remains the content source of truth and is never overwritten by the handoff. The decision is recorded in the [implemented Agent Note](../../.agents/notes/implemented/architecture/2026-09-11-xhs-title-pair-contract-v0.1.md).

## Problem

The account 2 final body has `content_status: final` and `finalized_at`, but its YAML does not contain `title_pair_contract`. S15 cannot synthesize semantic fields from the body, task card, or historical cover output, so the earlier replay stopped with `TITLE_PAIR_CONTRACT_MISSING` and `XHS_BODY_TITLE_P1_PAIR_GATE_BLOCKED`.

V0.1 changes neither that final body nor the three-file body bundle. A human-confirmed Workbench handoff Artifact freezes the five fields, body path and hash, status, finalization time, field sources, decision source, creation time, and lineage. S15 consumes it read-only and fails closed.

## Formal schema

V0.1 preserves the field names and types already published by S15. `verified_number` remains singular and accepts an integer, string, or null; it is not renamed to `verified_numbers`.

```yaml
title_pair_contract:
  body_title: string
  core_problem_or_object: string
  core_answer_or_judgment: string
  verified_number: integer | string | null
  p1_title_direction: string
```

All five keys must be present. Every value except nullable `verified_number` is a non-empty string. `body_title` must exactly equal the final-body title and contain at most 20 Unicode code points. A non-null `verified_number` must occur verbatim in the final body. S15 may not add, rewrite, or infer any field.

## Field sources

| Field | Business meaning | Sole source | First creation | Final freeze | Missing behavior |
|---|---|---|---|---|---|
| `body_title` | Final published body title | Human-approved S3 final-body title | S3 body generation | Final-body handoff Artifact | `BLOCK` |
| `core_problem_or_object` | Problem or object addressed | Independent System2 task truth; legacy migration requires per-note human decision | System2 task truth | Formal task-card approval; migration decision for a legacy sample | `BLOCK` |
| `core_answer_or_judgment` | Final answer or core judgment | Independent System2 task truth; legacy migration requires per-note human decision | System2 task truth | Formal task-card approval; migration decision for a legacy sample | `BLOCK` |
| `verified_number` | Sole primary number eligible for P1 | Human decision proven by confirmed task truth and the final body | Task truth supplies number evidence | Final-body handoff Artifact | `BLOCK` |
| `p1_title_direction` | One semantic direction for the S15 P1 title | Human-confirmed S3 finalization value; legacy migration requires per-note human decision | S3 finalization | Final-body handoff Artifact | `BLOCK` |

S3 copies the title, checks the sources, and produces the handoff. S15 consumes it read-only. No field may be inferred by AI at consumption time. Account 2 is an explicit owner-approved legacy migration and does not establish automatic backfill for other old bodies.

## Formal `verified_number` rule

`verified_number` is the sole primary number eligible for priority use in the P1 cover title. When a body contains several numbers, select the number that best strengthens the reader's click reason and willingness to act. Step counts, item counts, and structural quantities are content-structure numbers by default and do not enter this field. If two numbers have equal primary status, an upstream human decision is required before cover production; S15 cannot choose.

For account 2, `20分钟` is the low-friction action anchor and therefore the `verified_number`. `4步` is a structure number that remains usable in the body and later pages but is not the P1 primary number.

## Lifecycle and gates

System2 task truth projects through the formal and writing task cards. After S3 body generation and human finalization, the handoff Artifact binds the exact body SHA-256. Any change to the body, a title-pair value, or lineage creates a new Artifact and never overwrites the old one.

Workbench verifies the body hash, `content_status=final`, `finalized_at`, one unambiguous title, and all five fields before checking exact title equality and number evidence. Missing fields return `XHS_TITLE_PAIR_CONTRACT_MISSING`; hash, title, or number conflicts return `XHS_BODY_TITLE_P1_PAIR_FAILED`. Cover planning can run its fixed route and P1-P8 checks only after these gates pass.

S15 `source_note.schema.json` now places `title_pair_contract` inside root `properties` and lists it in root `required`. The formal `validate-source-note` entry reads the source, recomputes SHA-256, and checks the final title and number evidence; a missing or conflicting input cannot produce P1.

## Formal account 2 example

```yaml
title_pair_contract:
  body_title: "设计师审美提升难？每天20分钟分4步练"
  core_problem_or_object: "想提升设计审美，但不知道每天练什么、怎么练、练多久。"
  core_answer_or_judgment: "审美提升不是漫无目的地看素材，而是按“看、拆、存、仿”建立每天可执行的训练步骤，重点训练判断能力。"
  verified_number: "20分钟"
  p1_title_direction: "突出“想提升审美但不知道怎么练”的核心痛点，以“每天20分钟”作为低门槛行动抓手，强调这是可执行的审美训练方法；“4步”作为方法结构，不作为P1主数字。"
```

The decision source is the owner's business decision dated 2026-09-11. `body_title` comes from the final body whose SHA-256 is `17bd8f59aaba0c88e8ec333e2bfb67e15f6c2eaff0977359bcf28f80fb04f5e3`. The object is not written back to that body.

## Upstream impact

| Layer | V0.1 status and next minimum change |
|---|---|
| System2 | New tasks should store independent problem, answer, and primary-number decisions; account 2 uses an explicit migration decision |
| Formal task card | New tasks should carry the independent machine values and sources; this change does not edit account 2's card |
| System1 writing task card | New tasks should project the values verbatim; this change does not recompile account 2 |
| S3 | New final bodies should form handoff values at human approval; this change does not edit body output or generation |
| Workbench | Implements the five-field schema, hash binding, immutable handoff Artifact, fixed Swiss route, and P1-P8 gate |
| S15 | Keeps the field interface and visual rules; only the effective schema position and strict read-only validation entry change |

## Implementation status

`title_pair_contract` V0.1 is `READY`. This means the field interface, primary-number rule, strict gates, and explicit account 2 migration values are implemented. It does not claim that every historical body is migrated, and it authorizes no image generation, rendering, composition, or publishing.
