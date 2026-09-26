# Agent Note: XHS hard rules are projected, repeated, and validated by the Host

Status: implemented

English | [中文](2026-09-04-business-xhs-hard-contract-enforcement.zh.md)

## Problem

The first four production XHS samples preserved correct input isolation and routing, but their title length, body length, and exact-keyword compliance were inconsistent. Model-declared character counts were wrong in all four samples. The execution path preserved the raw output bundle, but it did not persist independent evidence of the frozen TaskCard requirements or the actual output facts. Correcting a Draft after generation would erase the First-Pass evidence that the experiment is intended to measure.

## Decision

`dsh-business-workbench` first compiles the frozen formal TaskCard into `xhs-task-card-contract-v2`, then projects that result for execution. The compiled value contains the formal compiler and production identity, confirmation state, note type, title and body ranges, exact keywords and requested locations, body-structure entries, product module, comment counts, exact ordered topic values, and explicit prohibition lines. The compiler accepts only the closed formal note-type values and exact machine-field grammar. The production-source adapter deterministically maps the active System2 recommendation identifier `干货推荐型（soft_plant）` to the canonical TaskCard machine value `干货推荐型（recommendation）`; it does not infer note type from human-readable prose. Missing, duplicate, legacy, or contradictory required fields fail before model I/O. Production resolution also requires the confirmed upstream task and confirmed compiled TaskCard to contain the same ten unique topics in the same order. `SEO高亮词：无` explicitly represents a task with no exact keyword requirement; a missing keyword field still fails. The Host renders the same projection as a short checklist at the end of the restricted user instruction, so the checklist cannot introduce a rule absent from the TaskCard.

After one successful model response, a pure L1 validator measures the unmodified Draft. `xhs-draft-markdown-v1` requires one leading H1 title, the combined model-declared count line immediately below it, and ordered pinned-comment, unpinned-comment, and topic H2 sections. The parser returns `FORMAT_CONTRACT_FAIL` without actual counts or hard-rule results when these ranges are absent or ambiguous. A separate read-only historical replay retains that format failure and derives evidence only when one known old layout identifies every range uniquely.

After format parsing succeeds, Unicode code-point counts produced by `countXhsFullCharacters` are authoritative; model-declared counts remain separate observations. The validator checks title and body ranges, exact-keyword totals, title-keyword requirements, comment counts, and the final ordered hashtag values. Missing, unexpected, duplicate, reordered, or eleventh topics return `HARD_CONTRACT_FAIL` with exact expected, actual, missing, and unexpected evidence. The comparison performs no normalization, alias mapping, or semantic matching. The validator records exact code-point offsets for every required keyword. Opening, middle, and ending keyword placement remains unresolved until those segments have a machine-readable definition. Body-structure meaning, product-module meaning, and prose prohibitions also remain deferred.

The Host writes the three-file output bundle and one immutable `validation` Artifact before a single Job compare-and-swap attaches both as authoritative facts. The Validation Artifact uses the existing version-5 Artifact reference and storage mechanism, so no schema change is required. Replaying an idempotency key returns the existing result without another model request or another authoritative Validation Artifact. Validation never modifies the Draft, retries generation, or starts Revision.

## Alternatives considered

- **Trust model-declared counts** — the four-sample baseline proved that these labels are not reliable measurements.
- **Repair failures automatically** — a rewrite, truncation, expansion, or keyword insertion would replace the First-Pass sample and invalidate the experiment.
- **Infer missing TaskCard fields from nearby prose** — natural-language fallback could turn an incomplete or legacy card into an apparently valid production input.
- **Require at least one exact keyword for every note type** — formally confirmed hot-traffic tasks may explicitly carry no SEO highlight keyword; rejecting that state changes business truth instead of validating it.
- **Infer opening, middle, and ending from percentages** — the TaskCard does not define those boundaries, so an inferred segmentation would create a new business rule.
- **Continue counting after an ambiguous Markdown parse** — a plausible title or section boundary is not authoritative evidence and can turn a format defect into false content violations.
- **Accept topic aliases or semantic matches** — equivalence would introduce a mapping rule that does not exist in the formal production sources and could conceal a model substitution.
- **Sort or normalize topic values before comparison** — normalization would discard the upstream order and exact spelling that the compiled TaskCard is required to preserve.
- **Accept historical layouts as additional production formats** — multiple accepted structures would preserve the ambiguity; the compatibility parser is read-only and never authorizes a new run.
- **Store validation in a new schema version** — version 5 already supports immutable `validation` Artifacts and Job Artifact references.
- **Attach validation after completing the Job** — a crash between the two updates could leave an authoritative Draft without its required deterministic evidence.

## Consequences

New `xhs-body-prepare-v0` runs fail before provider access when their frozen TaskCard cannot compile into the required projection or when its topics differ from the confirmed upstream task. Formal `XHS-PROD-1.3` cards with an explicit empty keyword policy compile without inventing a keyword; cards without compiler identity or the closed bilingual note type remain unsupported. The model instruction includes the one accepted Markdown structure and the exact ten hashtags. A successful response always preserves its raw Draft and records either a format failure or deterministic hard-rule facts without rewriting the output. Existing historical output bundles are not mutated or given retroactive Artifact references; replay remains read-only evidence. Current TaskCards require semantic or segment-aware checks, so a Draft can remain `WARN` after every deterministic check passes.
