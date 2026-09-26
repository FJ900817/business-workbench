# Business Layer V0.1: XHS hard-contract enforcement

English | [中文](business-layer-v0.1-hard-contract-enforcement.zh.md)

Phase 4C-3C adds deterministic TaskCard projection and L1 Validation to `xhs-body-prepare-v0`. It changes only `dsh-business-workbench`: schema version 5, the production source resolver, S3 adapter, text-first output policy, model policy, Harness Core, and Obsidian remain unchanged.

## Execution-contract projection

`projectXhsExecutionContract()` reads the frozen TaskCard already present in the execution package. It extracts only explicit machine-readable values: note type, title and body ranges, exact keywords and requested locations, body-structure entries, product module, pinned and non-pinned comment counts, topic count, and lines that explicitly contain a prohibition. Missing or contradictory required fields fail before model I/O with `XHS_BODY_INPUT_INVALID`.

The projection does not interpret creative intent or infer rules from the writing rule, golden sample, S3 Skill, or historical output. The selected XHS route must match the projected note type.

## Model-visible checklist

`renderXhsExecutionChecklist()` renders the projection as `【本篇执行硬合同】` at the end of the restricted user instruction. The checklist repeats the TaskCard values and states that Host counts, not model-declared counts, are authoritative. It adds no creative method, semantic criterion, filesystem authority, tool, Skill, or model choice.

## Deterministic L1 Validation

`validateXhsDraft()` reads the unmodified Markdown output. `countXhsFullCharacters()` counts Unicode code points for the extracted title and body. Model-declared title and body counts remain separate nullable observations and never affect a check.

L1 checks title/body ranges, total exact-keyword minima, an exact title-keyword requirement when the TaskCard names one, pinned/non-pinned comment counts, and hashtag count. Keyword evidence records code-point offsets over the complete Draft. Opening, middle, and ending positions remain unresolved because the TaskCard defines no machine segment boundaries; body-structure meaning, product-module meaning, and prose prohibitions are also deferred.

Any failed deterministic check produces `FAIL`. A result with no failure but at least one deferred check produces `WARN`. `PASS` is reserved for a projection whose checks are all machine-verifiable and successful. Validation never changes Draft bytes, requests another model turn, or starts Revision.

## Persistence and recovery

Each new XHS Agent success builds the three-file intermediate output bundle and a newline-terminated JSON `validation` Artifact. The Host writes both immutable byte sets before one Job compare-and-swap; that update attaches the bundle, completes the Agent Run, and attaches the Validation Artifact together. Bytes left by a failed compare-and-swap remain non-authoritative orphans visible to reconciliation.

The Validation Artifact records schema version 5, Job/Attempt/package/bundle identities, validation time, the exact projection, Draft SHA-256, deterministic facts, checks, keyword evidence, deferred checks, and final status. It uses the existing Artifact reference array and storage path, so the Business Job schema does not change. Idempotent Agent replay returns the existing output without a second provider request or second Validation Artifact. Startup verifies referenced Artifact bytes before recovering execution.

## Four-sample replay

The read-only replay used each authoritative Draft and its frozen production TaskCard. Source hashes were checked before and after validation.

| Sample | Title | Body | Comments | Topics | L1 result |
|---|---:|---:|---|---|---|
| 01 | 20 / 18–20 `PASS` | 598 / 700–800 `FAIL` | `PASS` | `PASS` | `FAIL` |
| 02 | 16 / 18–20 `FAIL` | 485 / 400–600 `PASS` | `PASS` | `PASS` | `FAIL` |
| 03 | 16 / 18–20 `FAIL` | 967 / 700–800 `FAIL` | `PASS` | `PASS` | `FAIL` |
| 04 | 19 / 18–20 `PASS` | 570 / 400–600 `PASS` | `PASS` | `PASS` | `WARN` |

Sample 01 also fails the main-keyword minimum and title requirement. The other samples meet the minimum exact-occurrence evidence; their non-title locations remain deferred. All four Draft SHA-256 values remained unchanged.

Offsets below count Unicode code points from the start of the complete Draft. `PASS` for a title requirement means only that the exact title occurrence was proven; opening, middle, and ending requirements remain deferred.

| Sample | Keyword | Required locations | Exact occurrences | Code-point offsets | Deterministic evidence |
|---|---|---|---:|---|---|
| 01 | 设计留白技巧 | 标题×1 / 开头×1 / 中段×1 | 2 | 109, 960 | minimum `FAIL`; title `FAIL`; 开头/中段 deferred |
| 01 | 审美判断力 | 中段×1 | 2 | 381, 909 | minimum `PASS`; 中段 deferred |
| 01 | 设计审美 | 中段×1 | 2 | 559, 916 | minimum `PASS`; 中段 deferred |
| 01 | 自检 | 末尾×1 | 6 | 16, 611, 709, 740, 901, 922 | minimum `PASS`; 末尾 deferred |
| 02 | 灵感网站 | 标题×1 / 开头×1 / 中段×1 | 3 | 13, 63, 737 | minimum `PASS`; title `PASS`; 开头/中段 deferred |
| 02 | 设计审美 | 开头×1 / 中段×1 | 2 | 452, 743 | minimum `PASS`; 开头/中段 deferred |
| 02 | 设计师审美提升 | 末尾×1 | 2 | 535, 749 | minimum `PASS`; 末尾 deferred |
| 03 | 设计风格形成 | 标题×1 / 开头×1 / 中段×1 | 5 | 2, 116, 344, 788, 1254 | minimum `PASS`; title `PASS`; 开头/中段 deferred |
| 03 | 设计审美 | 开头×1 / 中段×1 | 3 | 184, 543, 1262 | minimum `PASS`; 开头/中段 deferred |
| 03 | 设计师审美提升 | 末尾×1 | 2 | 891, 1268 | minimum `PASS`; 末尾 deferred |
| 04 | 观夏设计 | 开头×1 / 中段×1 | 2 | 148, 923 | minimum `PASS`; 开头/中段 deferred |
| 04 | 设计审美 | 中段×1 | 2 | 493, 935 | minimum `PASS`; 中段 deferred |
| 04 | 方法论 | 末尾×1 | 2 | 513, 941 | minimum `PASS`; 末尾 deferred |

## Deferred scope

This phase does not define opening/middle/ending segments, semantic Validation, Human Gate, Revision, approved final assets, or Obsidian promotion. It does not retroactively attach Validation Artifacts to the four historical samples; their replay is read-only evidence. A new verification set should exercise the checklist and atomic Validation persistence before expanding to twelve samples.
