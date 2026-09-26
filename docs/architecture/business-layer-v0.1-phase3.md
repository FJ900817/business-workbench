# Business Layer V0.1 Phase 3: restricted Agent runtime

English | [中文](business-layer-v0.1-phase3.zh.md)

Phase 3 connects the frozen Business execution package to one real Harness AgentLoop turn while keeping authority in `dsh-business-workbench`. It proves policy enforcement with fixture inputs and fixture Skills only. It does not generate an XHS body, validate business output, add a Human Gate, write Obsidian, expose a UI, or modify Harness Core.

## Current execution path

```text
Host caller
  -> Job + current Attempt + live Lease
  -> immutable Execution Package
       -> exact logical input files and hashes
       -> exact Skill bodies, origins, and hashes
       -> requested capability and Skill subset
  -> fixed Host action policy
  -> fresh restricted Harness Agent Session
       -> complete prompt from frozen material only
       -> zero published tools + deny-all executor guard
       -> one fixed provider/model request
  -> durable Agent Run + intermediate Artifact provenance
```

The package remains a request, not authorization. `resolveRestrictedAgentPolicy` owns the closed `xhs` fixture action, the allowed `restricted-agent` capability, and the two allowed Skill ids. Deployment configuration owns provider, model, reasoning effort, token ceiling, and timeout. The caller cannot replace these facts through package content or prompt text.

## Skill materialization

Package creation resolves each exact requested Skill id through the current Registry view at the configured XHS Project root. It never lists or searches Skills. The package stores the winning definition's id, source, provider, path or resource base when present, complete content, byte count, content hash, resolution time, and snapshot hash. An ordered manifest hash covers all snapshots.

Before every model request, the Host re-resolves the same ids at the same Project root and compares the complete snapshot identity. Missing definitions, content changes, provider changes, source-layer shadowing, or path/resource-origin changes fail with `SKILL_DRIFT`. A snapshot whose winning source/provider is not the Host runtime fails with `SKILL_ORIGIN_NOT_ALLOWED`. This fixture policy deliberately rejects Project, user, global, or external-provider shadows even when they reuse an allowed id.

## Restricted Agent context

`HarnessRestrictedAgentRuntime` creates one fresh Agent through the existing Agent Registry and AgentLoop. Its scoped setup selects native tool presentation, restricts the visible tool set to empty, and installs a deny-all execution guard. Native presentation prevents the reserved `run_code` tool from appearing even if the deployment default is code mode. The guard is the final execution authorization check if a provider emits a tool call despite an empty schema list.

The setup suppresses runtime context and installs one complete system-prompt section. The section contains only fixed fixture instructions and the frozen Skill bodies. One user message contains Job, Attempt, package identifiers, roles, logical paths, and frozen input bytes. It contains no Session history, preset, workspace inventory, Skill discovery result, filesystem path, shell capability, or subagent capability. Malicious input remains quoted data and does not expand Host authority.

The temporary Session is retained only for the AgentLoop lifecycle and observation of model events. It is disposed after the single turn. The durable source of truth is the Business Agent Run, not the temporary Session.

## Preflight and settlement

`runRestrictedAgent` checks the Job, addressed current running Attempt, live lease owner and Runtime identity, exact package id and manifest, input bytes, action policy, requested capability/Skill subset, Skill origin and drift, and required Agent services before model I/O. It persists a `running` Agent Run before invoking the model.

Successful text output is published as one immutable `intermediate` Artifact. Artifact provenance records Agent Run id, package id and manifest hash, Skill manifest hash, and fixed model facts. The same mutation settles the Agent Run and writes a `run-agent` idempotency receipt. Reusing the invocation key returns the verified committed Artifact without another model request, including after restart.

Provider error, timeout, tool-call attempt, drift, or policy rejection settles the Attempt as failed or interrupted and references no output Artifact. No automatic retry occurs. Startup changes an abandoned running Agent Run to interrupted together with its Attempt. A new execution requires an explicit new Attempt and lease.

## Schema and compatibility

Storage schema 2 adds `skillSnapshots` and `skillManifestHash` to every execution package, `agentRuns` to every Attempt, restricted-Agent provenance to Artifact references, and `run-agent` receipts. These are structural changes, so schema 1 now fails closed. No production Business domain existed before this phase; migration remains intentionally absent.

Agent Run and Artifact schemas verify ownership relationships, unique run ids and idempotency keys, terminal timestamps and failure facts, completed-run Artifact references, and provenance back-references. Model-visible frozen inputs and Skill bodies are reconstructable from durable Business records and Artifact provenance.

## Verification scope

Keyless temporary-home tests assemble the real Skill Registry, Tool Runtime, system-prompt service, Agent Registry, AgentLoop, Session store, and a deterministic LLM adapter. They cover exact Skill snapshots, no ambient context, zero tool schemas, executor denial, prompt injection, missing/disallowed/cross-origin Skills, content and origin drift, wrong package/Attempt/owner, expired lease, input drift, provider error, timeout, idempotent replay, Artifact provenance, and restart restoration. Existing Phase 1, Phase 2, and Web assembly tests remain in scope.

Production verification is assembly-only. The current Web Profile may load the plugin without `restrictedAgent`; that leaves the new execution route disabled and creates no Job or model request. Tests use only OS temporary roots and never read or write the production Obsidian source.

## Remaining risks and Phase 4 prerequisites

- The action policy and output are fixtures; a real XHS action needs a reviewed input specification, approved production Skill origins, and deterministic output validation.
- The JSON domain remains a single-Runtime-writer deployment. Cross-process execution requires a complete writer-coordination design, not a partial lock.
- A crash after Artifact fsync but before state settlement can leave a verified orphan. Reconciliation is intentionally read-only.

Phase 4 may add the first real action only after freezing its action policy, production Skill source, output schema, Validation boundary, and no-Obsidian-write acceptance tests. AgentLoop, WorkflowEngine, Session format, and global tool policy remain unchanged.
