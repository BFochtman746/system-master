# SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001

**Effective date:** 2026-09-10  
**Standing:** ACTIVE — SUPERVISED FIRST PILOT  
**Semantic owner:** `SYSTEM_MASTER` product-root governance  
**Execution administrator:** `SYSTEM_MASTER/CORE`  
**Verification executor:** shared `A-01` control plane  
**First proving corpus:** `PROGRAMMING`

## Objective

Build a deterministic source-ingest, manifest, asset-catalog and trace/provenance pipeline that lets every future System Master chat recover what already exists before doing new research or implementation. The first end-to-end proving corpus is Programming.

This control does **not** admit Programming as a first-class peer system. Only explicit user authority plus a superseding topology/ADR/control/obligation/repair/Second-Shift/startup transaction may do that.

## First-run rule

The first end-to-end A-01 run is supervised and **must not be overnight eligible**. Second Shift bulk ingestion is prohibited until the exact first-run qualification receipt and its generated evidence are reviewed and accepted against this control.

A successful first run proves the pipeline and the truthfulness of its coverage reporting. It does **not** mean every historical byte has been verified. Externally held Library/archive bytes that were not actually presented to A-01 must remain `EXTERNAL_BYTES_PENDING`, `IDENTITY_UNPROVEN`, or `QUARANTINE_CONFLICT` as appropriate.

## Required invariants

1. Current architecture comes only from `governance/CURRENT-AUTHORITY.json` and its selected topology. Ingest cannot create, promote, retire or re-parent a system.
2. Every recovered source keeps its original locator, source name/version and historical identity.
3. A digest is `A01_VERIFIED` only when A-01 actually reads those bytes during the qualification.
4. A Library file id/version is a discovery locator, not a content digest.
5. Historical digest claims remain claims until compared with actual bytes.
6. Conflicting claims are preserved and quarantined; they are never silently normalized.
7. Research closure, build-spec closure, implementation, portable qualification, target-native qualification and production standing remain distinct.
8. Historical PASS never transfers to changed bytes or a different subject.
9. Duplicate detection never deletes provenance. One canonical candidate may reference many source records.
10. Every derived asset and trace edge identifies the source records from which it was derived.
11. Human, author, private-data, external-provider, Apple-native and production authority cannot be synthesized.
12. Re-running the same exact manifest/subject must be deterministic and idempotent except for runtime timestamps in the outer A-01 receipt.

## Pipeline products

The qualifier must emit, into the A-01 evidence envelope:

- `knowledge-recovery-report.json`
- `programming-asset-catalog.json`
- `programming-trace-graph.json`
- `programming-source-observations.json`
- normal A-01 `request.json`, `receipt.json`, stdout/stderr and runner evidence

Canonical catalog/trace state is not mutated by the qualifier. Admission of generated catalog state is a separate reviewed repository transaction after the supervised receipt.

## Programming pilot coverage

The pilot manifest contains:

- current GitHub authority/catalog/control sources that A-01 can read directly from the exact subject;
- known Programming Library artifacts with stable Library file/version locators;
- pre-stage SHA-256 observations for the five Library files that were materialized in ChatGPT on 2026-09-10, clearly marked `CHATGPT_PRESTAGE_OBSERVED` rather than `A01_VERIFIED`;
- additional historical Programming evidence families discovered in Library, even when bytes have not yet been presented to A-01;
- explicit conflict/quarantine records where historical identity is not proven.

The first receipt must report both `metadata_coverage` and `byte_verification_coverage`; neither may be inferred from the other.

## Supervised-pass acceptance gate

Before enabling Second Shift processing, review the exact first-run evidence and require all of the following:

- control-plane admission is `ADMITTED`;
- exact subject SHA equals checkout SHA;
- runner identity is A-01 / Windows / X64;
- qualifier result is `PASS`;
- no architecture mutation or peer-system promotion occurred;
- all manifest sources received an explicit processing disposition;
- repository-present source digests were computed and bound to exact subject bytes;
- unavailable external bytes remained explicitly unavailable rather than being treated as verified;
- duplicate/conflict/quarantine semantics behaved correctly;
- generated asset catalog and trace graph validate and have no dangling source references;
- a second deterministic local invocation over the same exact subject produces the same canonicalized catalog/graph digests;
- no current work was routed to retired `PROSE`.

Only after this gate passes may Knowledge Recovery be marked `SECOND_SHIFT_ELIGIBLE` and the registered qualification be changed from `overnight_eligible: false` under a reviewed control-plane update.

## Current next action

1. Freeze `PROGRAMMING-INGEST-MANIFEST-001.json`.
2. Register `SYSTEM-MASTER-KNOWLEDGE-RECOVERY-PROGRAMMING-001` as a focused, normal-context A-01 qualification with overnight execution disabled.
3. Run hosted structural checks.
4. Submit the exact pilot subject through the canonical A-01 gateway.
5. Inspect the first receipt and generated evidence before any Second Shift promotion.
