# Agent Note: Make Business Job the durable business authority

Status: implemented

English | [中文](2026-08-28-business-workbench-job-authority.zh.md)

## Problem

Business Layer V0.1 needs four independently recoverable XHS article Jobs whose state survives Session, Runtime, App, and machine restarts. Session history records model-visible execution, but it cannot be the sole authority for business approval and delivery state. The first phase also needs to survive interruption while constructing the fixed four-Job Batch and while publishing Artifact bytes, without adding Agent or UI behavior.

## Decision

Add one Host-only `dsh-business-workbench` plugin as the sole authority for Batch, Job, Attempt, and Artifact facts. It owns storage domain `business_workbench` at schema version `0`, with separate `batches` and `jobs` tables. It exposes only an in-process Host service and registers no Remote API or model-facing tool.

A Batch creation marker stores all four preallocated Job ids and inputs before the Job records are materialized. Startup creates only missing matching records and then marks the Batch ready. Independent Job creation is not public.

Every Job mutation uses compare-and-swap revision and a persisted fingerprinted idempotency receipt. Attempts are append-only history. Artifact bytes are fsynced and published without overwrite before their reference is appended to the Job. Startup validates ready Batch relations and all referenced Artifact hashes before the service accepts work.

## Alternatives considered

- Use Session events as Business Job state. Rejected because business progress must survive independently from Chat Session lifecycle and execution transcript concerns.
- Reuse `ctx.jobs`. Rejected because it owns short-lived queued callbacks rather than durable business aggregates.
- Store all four articles inside one mutable Batch record. Rejected because one article's revision or failure would contend with and risk changing the other three.
- Commit an Artifact reference before bytes. Rejected because a crash could leave durable state pointing to absent or partial content.
- Add transactions, schema migration, execution recovery, Remote API, and UI in the same package now. Deferred because Phase 1 has no second writer or executor and those concerns require their own acceptance evidence.

## Consequences

The service can recover every Batch creation prefix and preserve independent Job facts after restart. Callers receive explicit revision conflicts and can safely retry an acknowledged operation. Artifact reads fail closed on absence, path escape, size mismatch, or hash mismatch.

The current JSON backend remains a single-Host writer and does not provide a transaction spanning its state file and the filesystem. A failed state commit after Artifact publication can leave an inaccessible complete orphan. Phase 2 supersedes the temporary running-Attempt behavior with [explicit execution ownership and read policy](2026-08-29-business-execution-ownership-and-read-policy.md), and raises the schema to v1 without implicit migration.
