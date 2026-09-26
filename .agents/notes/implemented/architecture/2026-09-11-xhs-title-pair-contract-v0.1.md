# Agent Note: XHS body-title to P1-title handoff contract V0.1

Status: implemented

English | [中文](2026-09-11-xhs-title-pair-contract-v0.1.zh.md)

## Problem

Business Workbench XHS final bodies do not persist the `title_pair_contract` required by S15. The task card, Hard Contract projection, and three-file body output bundle do not own all five fields, while S15 must not infer missing values from prose or historical cover output. Account 2 contains both `20分钟` and `4步`, but the formal interface has a singular `verified_number`.

S15 `source_note.schema.json` also placed `title_pair_contract` outside the root object's `properties`, so it was not an effective JSON Schema field. No formal entry recomputed the body SHA-256 or checked the final title before execution.

## Decision

V0.1 preserves the five field names published by S15. After human approval of a final body, Workbench creates a separate immutable `xhs-cover-handoff-v0.1` Artifact. It binds the body path and SHA-256, finalization state, `note_type`, five-field object, per-field sources, human decision source, creation time, and TaskCard lineage. The handoff neither writes back to the Obsidian body nor extends the three-file body output bundle.

`verified_number` is the sole primary number eligible for priority use in P1. When a body contains several numbers, the upstream owner selects the number that best strengthens the click reason and willingness to act. Step counts, item counts, and structural quantities do not enter this field by default. Two equally ranked numbers require upstream human approval; S15 cannot choose. The business owner selected `20分钟` for account 2, while `4步` remains a content-structure number usable on later pages.

Before Cover Plan execution, Workbench verifies the body hash, `content_status=final`, `finalized_at`, one unambiguous title, all five fields, exact title equality, and number evidence. Missing fields return `XHS_TITLE_PAIR_CONTRACT_MISSING`; hash, title, or number conflicts return `XHS_BODY_TITLE_P1_PAIR_FAILED`.

The Host fixes the search-solution Cover Plan to `search_solution → Swiss → V2_1_Swiss_Purple_QingYa`, including the P1-P8 template sequence, shared Swiss title capacities, `SENSE / JUDGE / ACT` nodes, and the sole P5 image slot. S15 now places the five fields inside effective schema `properties`, lists them in the root `required` array, and exposes a read-only entry that recomputes the body hash and checks the title and number.

The detailed field lifecycle and account 2 example are in the [architecture document](../../../../docs/architecture/xhs-title-pair-contract-v0.1.md).

## Alternatives considered

**Let S15 infer values from the final body.** The same body could produce different problems, answers, or directions after a model or prompt change, and missing upstream facts would bypass the gate.

**Write the handoff into the body or initial body bundle.** Title-pair values freeze only after human final-body approval. Writing them back changes the content source of truth, while putting them in initial output makes Revision overwrite historical facts.

**Concatenate `20分钟` and `4步`.** This hides the unresolved primary-number decision and leaks P1 selection authority into S15.

## Consequences

S15 receives one traceable and replayable body handoff. Historical final bodies are not backfilled automatically and require per-note human decisions. A body or handoff-value change creates a new Artifact and cannot overwrite the old one. V0.1 covers only handoff and Cover Plan; it does not authorize image generation, rendering, composition, or publishing.
