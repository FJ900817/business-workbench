# Business Layer V0.1 Phase 2.5: production readiness gate

English | [中文](business-layer-v0.1-phase2.5.zh.md)

Phase 2.5 freezes the first production storage baseline and mounts the formal XHS source through machine-local logical roots. It does not add an Agent, model request, Workflow, Validation, UI, Skill enforcement, or Obsidian writer.

## Production audit

Before deployment on 2026-08-30, the production Harness home had neither `storages/business_workbench.json` nor `business-workbench/`. There was therefore no formal Business Batch, Job, Attempt, or Artifact to migrate. The current Profile manifest, lockfile, and patch hashes matched the Stable V0 recovery manifest before the Profile patch changed, so that recovery point remains sufficient and unchanged.

The formal Obsidian vault is `<PRIVATE_XHS_VAULT_ROOT>`. XHS task cards, production rules, and product truth are all below `<PRIVATE_XHS_VAULT_ROOT>/03 项目生态【生命体】/项目-小红书`. Directories with `_副本` suffixes are not production sources.

## Schema V1 baseline

`BUSINESS_WORKBENCH_SCHEMA_VERSION` remains `1`. Phase 2 had already introduced lease and execution-package fields, so changing the number again would create a second format without a structural change. Version 1 is now the first formal production schema baseline for Business Layer V0.1.

An empty domain opens without creating a Job. The JSON backend writes the domain document lazily on the first Business mutation; that document records `business_workbench` version 1. Schema 0 and every unknown version fail closed without changing their storage files. No migration framework is present.

## Production logical roots

The Host configuration now accepts fixed `readRoots` slots instead of one synthetic directory:

| Logical prefix | Physical production root |
| --- | --- |
| `xhs/**` | `<PRIVATE_XHS_VAULT_ROOT>/03 项目生态【生命体】/项目-小红书` |
| `shared/product-truth/**` | `<PRIVATE_XHS_VAULT_ROOT>/03 项目生态【生命体】/项目-小红书/00_项目公共底座/01_产品库` |

The XHS root is the smallest common directory containing the formal task-card system and production-rule system. The product library receives a separate logical name even though it is physically inside the XHS Project. Neither the vault root, Desktop, nor another Project is mounted.

`BusinessReadBoundary` canonicalizes each configured physical root independently. A request must first use one of the two admitted logical prefixes, then resolve within that prefix's canonical root, name a regular file, and survive symlink-containment checks. An unconfigured logical root fails with `READ_DENIED`.

## Final read gate

Logical-root membership is necessary but insufficient. `createExecutionPackage` must name each input and authorize it through an exact file or directory entry. The package freezes presence, byte count, and SHA-256. `readExecutionInput` only accepts an exact frozen input, verifies the current execution owner, and rejects drift. Absolute production paths never enter the durable package or future Agent input.

The effective path is:

`Production source -> logical-root resolver -> Execution Package allow-list -> exact frozen input`

## Production assembly

The Web bundle mounts `@deepseek-ai/dsh-business-workbench` after `storage-domain` with a 30-second lease policy. Machine-specific roots live in `<PRIVATE_DSH_HOME>/profiles/web/cordis.patch.yml`, which replaces the complete Business row config. The package remains Host-only and starts no business work. Runtime startup may initialize the private Artifact directory and open the empty storage domain, but it creates no Batch or Job and performs no Obsidian scan.

## Verification

Temporary-directory tests cover schema-v1 first persistence and restart, schema-0 and unknown-version rejection, separate logical-root resolution, authorized task-card/rule/product-truth reads, unmounted logical roots, unlisted files, unrelated Projects, traversal, POSIX and Windows absolute paths, symlink escape, input drift, leases, restart recovery, Batch isolation, and Artifact integrity. The existing Phase 1 and Phase 2 suites run under schema v1.

Production verification uses exact formal task-card, account-rule, and product-truth paths through the same resolver, reads them without emitting content, and compares metadata and hashes before and after. Runtime health is checked on loopback port 3080 after the built Host loads the production Profile. No test creates a production Business Job.

## Remaining risks and Phase 3 prerequisites

- The JSON backend still permits only one Runtime writer for one `DSH_HOME`.
- `allowedCapabilities` and `allowedSkills` remain declarations until Phase 3 adds Host-side enforcement.
- Production roots are deployment configuration; a Vault rename or move makes startup fail loud until the Profile patch is updated.

Phase 3 may begin only while schema v1, both production roots, the Execution Package read gate, Runtime health, and the no-Obsidian-write rule remain intact.
