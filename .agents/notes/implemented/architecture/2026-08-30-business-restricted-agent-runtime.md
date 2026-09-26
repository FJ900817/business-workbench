# Agent Note: Enforce restricted business Agent execution in the Host

Status: implemented

English | [中文](2026-08-30-business-restricted-agent-runtime.zh.md)

## Problem

An immutable execution package can constrain Business input reads, but capability and Skill names inside that package are still caller declarations. Passing them directly into a general Agent would let caller-controlled prompt content, ambient Session state, Skill discovery, or globally available tools expand execution authority. Business output also needs durable provenance and retry behavior independent of a temporary Agent Session.

## Decision

Keep execution inside `dsh-business-workbench` and add one closed Host action for the Phase 3 fixture. Treat package capability and Skill lists only as requests that must be a subset of the Host action policy. Keep provider, model, reasoning effort, token ceiling, and timeout in deployment configuration. Omission disables Agent execution without disabling persistence APIs.

Resolve exact Skill ids during package creation and persist the complete winning definitions, origins, and hashes. Before model I/O, resolve them again at the same Project root and reject missing, changed, or shadowed definitions. For the fixture action, admit only Host-runtime origins. Never expose Skill list or load operations to the Agent.

Use the existing Agent Registry and AgentLoop for one fresh Session. In its scoped context, select native tool presentation, publish an empty tool set, install a deny-all execution guard, suppress runtime context, and install a complete prompt assembled only from fixed instructions, frozen Skill bodies, and frozen input bytes. Dispose the Session after the turn. Persist a Business Agent Run before model I/O, then atomically settle it with one intermediate Artifact and a durable idempotency receipt.

Raise the Business storage schema from 1 to 2 because execution packages, Attempts, Artifacts, and operation receipts gain structural fields. Continue rejecting every older or unknown format without migration.

## Alternatives considered

- Rely on prompts to prohibit files, tools, and Skill discovery. Rejected because model instructions are not authorization.
- Call the LLM adapter directly. Rejected because this would bypass the actual AgentLoop request and Session projection that production execution will use.
- Reuse a normal preset or existing Session. Rejected because ambient tools, history, and prompt sections would make the effective execution package larger than the durable Business package.
- Modify AgentLoop or global tool policy. Rejected because scoped Agent and Tool extension points already enforce the required policy and Core changes would increase upgrade risk.
- Let package callers select arbitrary provider/model or Skills. Rejected because a durable package cannot grant authority that the Host has not approved.
- Automatically retry a failed or interrupted invocation. Rejected because retry can repeat paid model work or publish ambiguous output without a new Attempt decision.

## Consequences

The Agent sees only frozen inputs and approved Skill bodies, while both tool presentation and tool execution fail closed. Prompt injection can alter model output quality but cannot add a Host capability. Skill origin or content changes become explicit drift before model I/O.

Successful output is tied to one Job, Attempt, package manifest, Skill manifest, model route, and Agent Run. Reusing its idempotency key returns the same verified Artifact across restart without another model request. Failure and interruption keep durable evidence and require an explicit new Attempt.

The production Profile can load schema 2 without enabling execution when no Business data exists and no `restrictedAgent` route is configured. A real XHS action remains separate work: it must freeze production Skill sources, output validation, and business acceptance rules before production model I/O is enabled.
