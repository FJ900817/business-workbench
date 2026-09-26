# Agent Note: Freeze the XHS body action before enabling it

Status: implemented

English | [中文](2026-08-31-business-xhs-action-contract.zh.md)

## Problem

The restricted Business Agent proves that a Host can constrain one model turn, but its fixture action does not define the minimum production input or output obligations for XHS body preparation. Reusing that action for real content would mix safety evidence with production authorization and could let an incomplete output or wider read request become durable behavior before Validation and review exist. This note records the pre-enablement decision; the production-source audit and current executable fixture policy are owned by [the Phase 4B note](2026-08-31-business-xhs-production-gate.md).

## Decision

Keep `fixture-agent-run` as the only executable `BusinessAgentAction` and use it for one credential-gated real-provider smoke over safe temporary fixtures. The smoke mounts the configured DeepSeek adapter and model, keeps an empty tool set plus the deny-all executor guard, and proves package, input, and Skill checks before any production action is registered.

Reserve `xhs-body-prepare-v0` as immutable exported metadata and a pure package assertion. Require exactly four Markdown inputs in fixed order: `taskCard`, `accountRule`, `writingRule`, and `productTruth`. Permit exact-file reads only, the `restricted-agent` capability, and the `xhs-body-writing-v0` and `xhs-product-truth-v0` Skill ids. Reserve three intermediate outputs named `draft.md`, `draft-metadata.json`, and `provenance.json`, with disabled Validation and review Artifact slots.

Tie one future invocation to `xhs-body-prepare-v0:attempt:<attemptId>`. Reserve `XHS_BODY_INPUT_INVALID` for package mismatches and `XHS_BODY_OUTPUT_INVALID` for the future output-bundle validator. Do not add the action to the durable Agent Run union or change storage schema until an executable consumer and atomic output settlement exist.

When an Agent turn ends in a structured Session error without an assistant message, preserve its non-sensitive provider code and message inside the Business `PROVIDER_ERROR` diagnostic. Keep the Business error code stable and publish no Artifact.

## Alternatives considered

- Enable `xhs-body-prepare-v0` immediately and rely on documentation to prevent use. Rejected because the runtime would accept paid production work before output validation and approved production Skills exist.
- Rename the fixture action to the production action after the smoke. Rejected because fixture Skills, fixture output, and production obligations are different contracts and should not share durable identity.
- Freeze directory read roots for convenience. Rejected because the four required files are known before execution and exact-file admission is narrower and auditable.
- Put the action contract only in Markdown. Rejected because package construction needs an executable assertion that rejects extra inputs, reads, capabilities, and Skills before model I/O.
- Add Validation and review state to the Job schema now. Rejected because neither has a current consumer in Phase 4A; disabled Artifact slots preserve naming without creating unused durable state.

## Consequences

The real provider has exercised the same Agent Registry and AgentLoop path as future work without receiving filesystem, shell, Workspace scan, Skill discovery, or cross-Project authority. The smoke can be repeated explicitly without touching production Business storage or Obsidian.

Phase 4B has one exact input and output target and cannot accidentally execute it through the Phase 4A Host API. Enabling it still requires approved Skill definitions, a separate closed action policy, atomic validation and settlement of all three outputs, and assembled replay coverage. The two reserved XHS failure codes are public before their full output-producing consumer exists, but only the input code is emitted in this phase.
