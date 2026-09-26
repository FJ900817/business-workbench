# Business Layer V0.1 Phase 4A: real-model safety smoke and XHS action contract

English | [中文](business-layer-v0.1-phase4a.zh.md)

Phase 4A proves the existing restricted Agent route against the configured real provider and freezes the first XHS body action's machine-readable pre-enablement contract. It does not enable that action, generate a real body, read production Obsidian data, expose a UI, add Validation or Human Gate behavior, promote an Artifact, or modify Harness Core. The later production-source audit revised the input and Skill mapping; the executable current specification is the [Phase 4B architecture record](business-layer-v0.1-phase4b.md).

## Real-model smoke strategy

The credential-gated e2e mounts the real `deepseek-official` adapter and the Base Profile's selected `deepseek-v4-flash` model. It reads the existing managed credential document through `dsh-credentials-local`, records its hash before and after the test, and points `DSH_HOME`, Business storage, read roots, Sessions, and Artifacts at one disposable operating-system temporary directory.

The request still enters only through `BusinessWorkbenchService.runRestrictedAgent` and `HarnessRestrictedAgentRuntime`. The package admits Project `xhs`, action `fixture-agent-run`, capability `restricted-agent`, and the two runtime fixture Skills. The scoped Agent publishes an empty tool set and keeps the deny-all executor guard. Its task-card fixture asks it to scan the Vault, read `gzh`, call Bash, discover Skills, and invoke an unrelated Skill; those strings remain untrusted input data.

After the single successful provider request, three sibling fixture Jobs exercise input drift, Skill drift, and a foreign package id. Each request fails before model I/O and has no Artifact. This uses one real model request while proving the same package and snapshot checks are active under the real adapter composition.

## Smoke result

The 2026-08-31 smoke completed one real `deepseek-official / deepseek-v4-flash` request in about 2.8 seconds. No registered `fs`, `bash`, `workspace-scan`, `skill-discovery`, or `gzh-writing` executor ran. The successful Job held exactly one `intermediate` Artifact with package, Skill-manifest, and model provenance; the three rejected Jobs held no Artifact. The managed credential document hash was unchanged, and no production Business Job, DSH home, Workspace, or Obsidian path was mounted.

When a provider fails before creating an assistant message, the Host preserves the non-sensitive Session failure code and message in its `PROVIDER_ERROR` diagnostic instead of reducing the result to “no assistant message.” Deterministic coverage verifies this failure path and the live smoke verifies the successful path.

## Frozen XHS action contract

The reserved action is `xhs-body-prepare-v0`, Project `xhs`, Workflow version `xhs-body-prepare-v0`. `XHS_BODY_PREPARE_CONTRACT` is exported as immutable metadata. The durable package schema fixes Project `xhs`, and `assertXhsBodyPrepareExecutionPackage` rejects every Workflow, input, read, capability, or Skill expansion with `XHS_BODY_INPUT_INVALID`. This contract is not a `BusinessAgentAction`; `runRestrictedAgent` therefore cannot invoke it in Phase 4A.

### Minimum inputs

| Role | Logical location | Required | Format |
|---|---|---:|---|
| `taskCard` | one exact file below `xhs/` | yes | Markdown |
| `accountRule` | one exact file below `xhs/` | yes | Markdown |
| `writingRule` | one exact file below `xhs/` | yes | Markdown |
| `productTruth` | one exact file below `shared/product-truth/` | yes | Markdown |

All four inputs must be present in that order, frozen with hashes and sizes, and listed as the package's complete `allowedReadFiles`. `allowedReadRoots` must be empty, so the action receives no directory-level read authority.

### Skill and capability policy

The only capability is `restricted-agent`. The complete Skill allow-list is `xhs-body-writing-v0` and `xhs-product-truth-v0`. Phase 4A freezes these ids but does not install, load, or execute production Skill definitions; Phase 4B must approve their sources and contents before registering the action.

### Minimum outputs

| Logical name | Artifact type | Media type |
|---|---|---|
| `draft.md` | `intermediate` | `text/markdown` |
| `draft-metadata.json` | `intermediate` | `application/json` |
| `provenance.json` | `intermediate` | `application/json` |

The names are logical output slots; the Artifact store continues to own physical content-addressed paths. Reserved `validation` and `review` slots name their future Artifact types and remain disabled. No final Artifact or Obsidian write is permitted by this contract.

### Idempotency and failure semantics

One Attempt uses `xhs-body-prepare-v0:attempt:<attemptId>` for every retry of the same logical invocation. A revision creates a new Attempt and therefore a new key. `XHS_BODY_INPUT_INVALID` identifies an input, read, capability, Skill, or Workflow mismatch after the durable package schema has admitted Project `xhs`. `XHS_BODY_OUTPUT_INVALID` is reserved for Phase 4B output-bundle validation. Existing lease, package, drift, Skill, provider, timeout, tool-policy, and Agent Run codes retain their current meanings; every failure publishes no action output.

## Why real content generation remains disabled

The approved production Skill definitions do not exist yet, the three-file output bundle is not atomically validated or committed, and the deterministic Validation and Human Gate consumers are absent. Enabling the action before those facts are implemented would turn a frozen specification into unvalidated production behavior. The fixture action remains the only executable Business Agent action.

## Phase 4B prerequisites

- Implement and approve the two exact production Skill definitions and their Host-owned origin policy.
- Register `xhs-body-prepare-v0` as a separate closed Host policy without widening the fixture action or global tools.
- Validate and atomically commit all three intermediate outputs, including JSON schemas and provenance relationships, or commit none.
- Add keyless assembled-application replay for the model-visible XHS prompt and deterministic output failures.
- Keep real production inputs opt-in behind an explicit caller action; preserve exact-file reads, temporary Session use, and no Obsidian write.
