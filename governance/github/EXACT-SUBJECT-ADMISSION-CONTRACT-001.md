# EXACT-SUBJECT-ADMISSION-CONTRACT-001

Status: PROPOSED_FOR_ADMISSION
Owner: SYSTEM_MASTER
Applies to: recovered/imported source trees and other immutable subjects requiring GitHub-native custody and fresh qualification.

## Goal

Provide one reusable admission primitive for Document, Spreadsheet/Math/Data, Software Engineering/Local Model, Research/Knowledge, Media and later SYSTEM_MASTER-owned headless portfolios so each tool does not invent a new transport/qualification workflow.

## State machine

`STAGE -> FREEZE_READY -> CARRIER_VERIFIED -> SUBJECT_MATERIALIZED -> SUBJECT_COMMITTED -> QUALIFIED -> RECEIPT_SEALED -> PROMOTED`

Terminal non-PASS states are classified, durable states such as `INPUT_MISMATCH`, `STALE_AUTHORITY`, `STALE_REF`, `QUALIFICATION_FAILED`, `INFRASTRUCTURE_FAILED`, `PROMOTION_REJECTED`, or `HUMAN_DECISION_REQUIRED`; they are not silently retried as new work.

## Contract

### STAGE

Transport/import bytes may arrive incrementally on a dedicated staging branch/path. Staging events may run cheap syntax/count/hash preflight only. They must not invoke heavyweight compilation, Office/native qualification, package installation or promotion.

Text-safe transport is preferred when a connector/API cannot reliably preserve binary Git blobs. Transport representation is not evidence until the reconstructed carrier digest matches the declared authoritative digest.

### FREEZE_READY

READY is created only after all expected transport parts and the deterministic manifest are present. READY records carrier digest, part count/order, manifest digest, expected subject-file count and admission contract version.

READY is immutable for that admission attempt. Any changed transport byte creates a new freeze identity.

### CARRIER_VERIFIED

Reconstruct the carrier deterministically and verify its exact digest before extraction. Reject unsafe paths, duplicate paths, unexpected entries, encoding errors and manifest/count mismatches.

### SUBJECT_MATERIALIZED

Materialize only manifest-authorized files. Verify every expected path, byte size and cryptographic digest. Reject extras where the manifest contract forbids them.

### SUBJECT_COMMITTED

Create the immutable Git subject commit before authoritative qualification. Record its exact Git SHA. Qualification is bound to this SHA; historical results on other SHAs are evidence only and never transfer PASS.

### QUALIFIED

Qualification runs read-only against the exact subject SHA. It records the exact toolchain/runner environment and all required gates. A native/A-01 claim may only be made when the exact subject was actually executed through the authoritative native lane.

### RECEIPT_SEALED

Emit a receipt conforming to `EXACT-SUBJECT-PROVENANCE-SCHEMA-001.json`. The receipt is bound to the exact subject SHA, workflow digest, run identity, runner/toolchain facts and output digests.

### PROMOTED

Promotion is a separate narrow mutation boundary. Immediately before mutation it revalidates:

- current canonical authority;
- current obligation/owner routing;
- subject SHA and sealed receipt;
- target branch head and expected base;
- absence of a conflicting live mutation claim where applicable.

Promotion is fast-forward/PR-based and fail-closed. It never force-pushes over unrelated work.

## Workflow architecture

The preferred repository implementation is a small caller per subject plus shared same-repository reusable workflow/action logic. When all relevant runners are GitHub Actions runner 2.336.0 or newer, use `$/` self-repository references so shared logic resolves at the exact caller commit without a separate checkout solely for composition.

Qualification jobs use read-only permissions. Promotion jobs/workflows request only the exact write permission needed. Self-hosted/A-01 jobs are isolated from untrusted pull-request events.

## Retry semantics

Retries preserve the same admission identity when inputs and subject SHA are unchanged and the failure is classified as retryable infrastructure failure. Changed bytes or manifest create a new exact subject/admission identity. Product failures do not become infrastructure retries.

## Run-volume invariant

One frozen exact subject should normally cause one authoritative qualification. Incremental transport commits must not produce one expensive run per chunk. Duplicate READY events are idempotent against the same freeze identity.

## Document R4 binding

The current Document R4 objective remains the first execution subject for this reusable contract. Its authoritative source identity and historical qualification evidence remain unchanged; this contract changes the GitHub admission mechanics, not the Document source or the requirement for a fresh exact-Git-SHA qualification.
