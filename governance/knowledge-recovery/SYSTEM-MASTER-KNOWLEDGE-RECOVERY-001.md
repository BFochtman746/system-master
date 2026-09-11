# SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001

**Effective date:** 2026-09-10  
**Standing:** ACTIVE — HIGHEST SYSTEM MASTER PRIORITY — SUPERVISED FIRST PILOT  
**Semantic owner:** `SYSTEM_MASTER` product-root governance  
**Execution administrator:** `SYSTEM_MASTER/CORE`  
**Verification executor:** shared `A-01` control plane  
**First proving corpus:** `PROGRAMMING`

## Priority lock

`SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001` is the highest active System Master priority until the supervised Programming proving run is accepted or the user explicitly changes priority.

This priority lock applies to new discretionary System Master planning, research, qualification preparation and repository work. Existing safety, evidence-preservation, active owner integrity and human/private/native-authority boundaries remain non-preemptible. Peer-system work may continue only when it does not consume or block the resources required for the supervised Knowledge Recovery proving path.

The chat is a working surface, not a new system or authority domain. Making this chat highest priority means this selected Knowledge Recovery objective receives priority rank 1; it does not create a new peer system, owner lane, Second Shift worker or architecture authority.

Second Shift remains prohibited for Knowledge Recovery until the supervised-pass acceptance gate below is satisfied against the **current** authority topology.

## Objective

Build a deterministic source-ingest, manifest, asset-catalog and trace/provenance pipeline that lets every future System Master chat recover what already exists before doing new research or implementation. The first end-to-end proving corpus is Programming.

This control does **not** admit Programming as a first-class peer system. Only explicit user authority plus a superseding topology/ADR/control/obligation/repair/Second-Shift/startup transaction may do that.

## Current architecture boundary

Current authority is `SYSTEM-TOPOLOGY-004`:

- peer systems: `CORE`, `LEARNING`, `BOOK`, `DOCUMENTS`;
- `PROSE` is active only as child specialist `SYSTEM_MASTER/BOOK/PROSE`;
- PROSE has no independent peer-system or Second Shift owner lane and inherits BOOK execution control;
- Programming remains a cataloged, non-active candidate.

Knowledge Recovery must preserve this boundary exactly. It may index historic Prose-retirement evidence, but it must not treat that superseded retirement record as current topology authority.

## First-run rule

The first end-to-end A-01 run is supervised and **must not be overnight eligible**. Second Shift bulk ingestion is prohibited until the exact current-authority qualification receipt and its generated evidence are reviewed and accepted against this control.

A successful run proves the pipeline and the truthfulness of its coverage reporting. It does **not** mean every historical byte has been verified. Externally held Library/archive bytes that were not actually presented to A-01 must remain `EXTERNAL_BYTES_PENDING`, `IDENTITY_UNPROVEN`, or `QUARANTINE_CONFLICT` as appropriate.

If current authority changes while the supervised proof is in flight, the prior exact-subject receipt remains valid historical evidence for that subject but cannot authorize Second Shift under the new topology until the proving subject is reconciled and rerun.

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
13. PROSE may appear as active only at `SYSTEM_MASTER/BOOK/PROSE`; no independent PROSE peer or worker lane may be synthesized.

## Pipeline products

The qualifier must emit, into the A-01 evidence envelope:

- `knowledge-recovery-report.json`
- `programming-asset-catalog.json`
- `programming-trace-graph.json`
- `programming-source-observations.json`
- normal A-01 `request.json`, `receipt.json`, stdout/stderr and runner evidence

Canonical catalog/trace state is not mutated by the qualifier. Admission of generated catalog state is a separate reviewed repository transaction after the supervised receipt.

## Programming pilot coverage

`PROGRAMMING-INGEST-MANIFEST-001` is preserved as the original frozen pilot manifest. It records the topology-003 proving boundary and is historical input after the topology-004 change.

`PROGRAMMING-INGEST-MANIFEST-002` is the current supervised proving manifest. It extends Manifest 001 without rewriting it, replaces the stale topology-003 current-authority source with topology 004, and adds System Catalog 002 plus ADR-0004 as exact-subject authority inputs.

The effective pilot corpus contains:

- current GitHub authority/catalog/control sources that A-01 can read directly from the exact subject;
- known Programming Library artifacts with stable Library file/version locators;
- pre-stage SHA-256 observations for Library files materialized in ChatGPT on 2026-09-10, clearly marked `CHATGPT_PRESTAGE_OBSERVED` rather than `A01_VERIFIED`;
- additional historical Programming evidence families discovered in Library, even when bytes have not yet been presented to A-01;
- explicit conflict/quarantine records where historical identity is not proven.

The receipt must report both `metadata_coverage` and `byte_verification_coverage`; neither may be inferred from the other.

## Supervised-pass acceptance gate

Before enabling Second Shift processing, review the exact current-authority evidence and require all of the following:

- control-plane admission is `ADMITTED`;
- exact subject SHA equals checkout SHA;
- runner identity is A-01 / Windows / X64;
- qualifier result is `PASS`;
- the receipt is bound to the current authority/topology proving subject;
- no architecture mutation or Programming peer-system promotion occurred;
- peer systems remain exactly CORE, LEARNING, BOOK and DOCUMENTS;
- PROSE remains active only as BOOK child `SYSTEM_MASTER/BOOK/PROSE`, with no independent peer or Second Shift lane;
- all manifest sources received an explicit processing disposition;
- repository-present source digests were computed and bound to exact subject bytes;
- unavailable external bytes remained explicitly unavailable rather than being treated as verified;
- duplicate/conflict/quarantine semantics behaved correctly;
- generated asset catalog and trace graph validate and have no dangling source references;
- a second deterministic invocation over the same exact subject produces the same canonicalized asset-catalog, trace-graph and source-observation digests.

Only after this gate passes may Knowledge Recovery be marked `SECOND_SHIFT_ELIGIBLE` and the registered qualification be changed from `overnight_eligible: false` under a reviewed control-plane update.

## Attempt history

### RUN-001

`SYSTEM-MASTER-KNOWLEDGE-RECOVERY-PROGRAMMING-001-RUN-001` reached the mandatory GitHub-hosted admission boundary but GitHub assigned no `ubuntu-latest` runner (`runner_id: 0`, no executed steps). A-01 was not consumed. The attempt is `INFRA_FAILURE`, not a pipeline/product result, and cannot be used for Second Shift admission.

### RUN-004 / attempt 1 and attempt 2

Workflow run `34548195760` executed the qualifier twice on exact subject `98361fe491dc55fff6789f71db506680303a6fdc` using A-01 / Windows / X64. Both invocations returned PASS and produced identical canonical digests:

- asset catalog: `078060f9d06adf836a6ce8dfbc2508e78290d42b3d0fc1665a1f8d38d059af8e`
- trace graph: `e2c42ffe9e4d420f3f581d792d0b7f531fe9506de89af0a8ec3a79d0bf517431`
- source observations: `aad974e606f94555d5004717c5ae74e9490565f179c9b4d1911bcc3aa3b22696`

That proves deterministic execution for the exact topology-003 subject. Before Second Shift admission, however, `main` advanced to `SYSTEM-TOPOLOGY-004` and restored PROSE as the BOOK child specialist. Therefore these PASS receipts are retained as valid exact-subject evidence but are **not** the current-authority acceptance receipt.

## Current next action

1. Use `PROGRAMMING-INGEST-MANIFEST-002` and the topology-004-aware qualifier.
2. Run a fresh exact-subject supervised Programming qualification through the current A-01 control plane.
3. Repeat the exact same subject once for deterministic digest comparison.
4. Review both receipts and generated evidence against the current acceptance gate.
5. If all gates pass, record supervised acceptance and then make Knowledge Recovery eligible for Second Shift bulk deterministic ingestion under its existing architecture/non-promotion restrictions.
