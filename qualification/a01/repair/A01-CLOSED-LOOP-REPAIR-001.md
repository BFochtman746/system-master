# A01-CLOSED-LOOP-REPAIR-001

Status: CANDIDATE — HOSTED PREQUALIFICATION REQUIRED  
Owner: `SYSTEM_MASTER/SHARED_INFRASTRUCTURE/A01`  
Administrative owner: `SYSTEM_MASTER/CORE`

## Purpose

Add a bounded, fail-closed repair coordination layer after authoritative A-01 receipts without changing the canonical gateway, exact-SHA receipt authority, global concurrency generation, registered-wrapper model, or promotion semantics.

This is a new qualification capability under A01 change-control rule 4. It is not evidence that ordinary `SUBJECT_FAILURE` is an A-01 infrastructure defect.

## Closed-loop state machine

`AUTHORITATIVE_RECEIPT -> CLASSIFY -> REPAIR_REQUIRED | ROUTE_INFRA | ROUTE_CONTROL_PLANE | NO_REPAIR_PASS`

For a repairable `SUBJECT_FAILURE` only:

`REPAIR_REQUIRED -> REPAIR_WORKER_CONTRACT -> CHANGED_CANDIDATE -> DETERMINISTIC_PREQUALIFICATION -> CANDIDATE_VALIDATION -> REPLACEMENT_REQUEST_READY -> AUTHORITATIVE_A01_RERUN`

If an attempt budget is exhausted or the repair depends on human/author/private/native/external/source-custody authority:

`REPAIR_REQUIRED -> DEAD_LETTER_OR_OWNER_ROUTE`

## Non-negotiable fences

1. Only an authoritative `SUBJECT_FAILURE` is eligible for product repair.
2. `INFRA_FAILURE` routes to infrastructure adjudication; `CONTROL_PLANE_FAILURE` routes to control-plane adjudication.
3. Receipt subject and checkout SHA must match before any automatic product-repair decision.
4. Repair attempts are bounded. Default maximum: 2 attempts per original failed subject.
5. A repair worker may prepare changed bytes but cannot authorize A-01 PASS, promotion, canonical standing, or production.
6. A candidate SHA must differ from the failed subject SHA.
7. Deterministic prequalification must say `PASS` and bind to the same candidate SHA before a replacement request becomes eligible.
8. Qualification ID and workstream ID cannot change across the repair loop without explicit owner reclassification outside this coordinator.
9. Generated replacement requests never contain arbitrary shell commands. They carry only registered qualification identity, exact candidate SHA, origin/return routing, attempt lineage, and evidence references.
10. The coordinator does not mutate product code. It emits a bounded repair-worker contract and validates the returned candidate manifest.
11. Human, author, private-data, native-platform, external-authority and source-custody boundaries are never synthesized by automation.
12. An unchanged failed SHA is never converted into a replacement candidate by relabeling metadata.
13. Original receipt/evidence identity is retained in every repair state and replacement request.
14. A replacement request is only `A01_ELIGIBLE`; authoritative PASS still requires the canonical registered gateway and a new receipt on the exact candidate SHA.

## Repair worker boundary

The repair worker receives a machine contract containing:

- original qualification/workstream identity;
- failed exact subject SHA;
- original receipt/evidence reference;
- bounded attempt number and maximum;
- repair scope from the owning workstream;
- forbidden authority classes.

The worker returns a candidate manifest. The coordinator validates it but does not trust claims of PASS. The required deterministic prequalification record must independently bind to the changed candidate SHA.

## Dead-letter / owner routes

The following cannot be silently auto-repaired:

- `HUMAN_ONLY`
- `AUTHOR_ONLY`
- `PRIVATE_DATA`
- `NATIVE_PLATFORM`
- `EXTERNAL_AUTHORITY`
- `SOURCE_CUSTODY`
- `UNSAFE_TO_AUTOREPAIR`
- repair-attempt budget exhaustion

These produce a durable non-rerun disposition with the exact blocker and lineage.

## Qualification plan

Before admission to canonical `main`:

1. hosted self-test on the exact candidate branch;
2. prove PASS/no-repair, subject-repair, infrastructure-route, control-plane-route, SHA mismatch, unchanged-candidate, prequalification mismatch, blocker route, attempt exhaustion, and valid replacement-request cases;
3. prove generated replacement requests contain no arbitrary command surface and promotion authority is never synthesized;
4. inspect the candidate diff to confirm the existing A-01 gateway, concurrency group, receipt writer and product qualifier semantics are unchanged.

Only after candidate prequalification and governance review may a canonical self-test/registration path be added. This candidate branch itself has no A-01 or promotion authority.
