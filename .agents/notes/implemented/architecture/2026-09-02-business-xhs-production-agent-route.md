# Agent Note: Admit one source-bound XHS production Agent route

Status: implemented

English | [中文](2026-09-02-business-xhs-production-agent-route.zh.md)

## Problem

The Business Host could resolve and freeze formal XHS sources, but the XHS Agent policy accepted only registry-owned fixture Skills. Reusing that route for production would either mislabel formal bytes as fixture input or weaken Skill-origin checks. The first real draft also needs observable latency and token facts without changing the frozen version-4 Business storage format.

## Decision

Add `production` as an explicit XHS execution mode beside `fixture`. The production policy requires a persisted production-source manifest, matches the requested account and note type against that manifest, and accepts only the exact `project-agents / business-xhs-production-v1` S3 source selected by the Host mapping. Fixture packages remain restricted to runtime-owned fixture Skills and cannot carry production evidence.

Immediately before model I/O, re-read the package's three exact inputs and ask the production resolver to verify the entry, baseline, source task, task card, rule, sample, and S3 snapshot. The Agent receives only the already frozen input bodies and S3 body. Keep the empty tool schema, deny-all executor, fresh Session, fixed deployment model, one model request, and existing three-file `intermediate` output settlement.

Return request timing and provider token usage as fresh invocation metrics. Do not add them to `BusinessAgentRun`, the output bundle, or the storage domain. XHS observations persist separately through [output finalization recovery](../bug-fix/2026-09-03-business-output-finalization-recovery.md); a durable replay returns the committed result without fresh execution metrics. Production package construction returns transient source-resolution, Skill-snapshot, and package-build durations.

The deterministic source selection remains owned by the [production source adapter](2026-09-01-business-xhs-production-source-adapter.md). This route consumes its manifest and does not add discovery, fallback, filesystem authority, content Validation, revision, finalization, or Obsidian promotion.

## Alternatives considered

- **Treat formal sources as fixture input.** Rejected because provenance and origin policy would state a false source class and permit fixture-only assumptions to reach production.
- **Register the formal S3 in the general Skill Registry.** Rejected because production execution needs one resolver-selected source, not a discoverable winning definition that Project or user layers can shadow.
- **Persist performance metrics in `BusinessAgentRun`.** Rejected because the first experiment freezes storage schema version 4 and the metrics are reporting evidence rather than recovery state.
- **Add transport retry to the Host.** Rejected because a retry policy is not required for the first experiment; any retry must remain an explicitly recorded caller decision.

## Consequences

One approved production Attempt can produce one authoritative intermediate draft bundle through the same Restricted Agent entry used by fixture coverage. Source or Skill drift, route mismatch, origin mismatch, a tool call, invalid model text transport, or duplicate settlement fails closed. The [text-output decision](../bug-fix/2026-09-03-business-xhs-text-output.md) owns transport validation. The remaining three Jobs in a four-slot Batch receive no execution automatically.

Fresh callers can record package, first-response, completion, structural-settlement, and token observations without changing durable Business data. Replays prove idempotent output but cannot reconstruct transient timing. Human review, Revision, finalization, and promotion remain separate future consumers.
