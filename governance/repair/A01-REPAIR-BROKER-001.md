# A01-REPAIR-BROKER-001

Status: CANONICAL REPAIR-ROUTING CONTRACT / TOPOLOGY-004 / PROGRAM-JOB-LOCKED
Owner: `SYSTEM_MASTER/SHARED_INFRASTRUCTURE/A01`
Administrative owner: `SYSTEM_MASTER/CORE`

## Purpose

Close the durable handoff gap between an authoritative A-01 failure and the owning System Master execution lane without changing product ownership or granting PASS.

`A-01 receipt -> classify -> durable repair/hold/retry route -> owner work -> deterministic prequalification -> changed exact SHA -> A01_ELIGIBLE replacement -> authoritative A-01 rerun`

The repository is the event/evidence bus. Chats and agents are working surfaces. A-01 remains the authoritative Windows qualification executor.

## Current authority and owner mapping

The broker resolves `workstream_id` only through the topology selected by `governance/CURRENT-AUTHORITY.json`, currently `governance/SYSTEM-TOPOLOGY-004.json`, and must conform to `governance/SYSTEM-PROGRAM-JOB-LOCK-001.json`.

- `SYSTEM-MASTER`, Continuity, Assurance/Reconciliation and A-01 control-plane work map to CORE/shared infrastructure as defined by topology.
- `LEARNING` maps to LEARNING.
- `BOOK-SYSTEM` maps to BOOK.
- `LITERARY-PROSE` and `BOOK-EVAL-LEMONADE-001` are Book-child workstreams and execute/repair through BOOK.
- `DOCUMENTS` and `DOCUMENT-ARTIFACTS` map to DOCUMENTS.
- an unmapped workstream fails closed as `UNALLOCATED`; it is not repaired.

PROSE is the completed active specialist child at `SYSTEM_MASTER/BOOK/PROSE`. It has no independent repair lane. A current Book-Prose subject failure may open a BOOK-owned repair transaction only when it is a demonstrated defect or current integration failure; the broker must not reopen completed Prose feature scope merely because a historical Prose receipt exists.

DOCUMENTS must not absorb, schedule, repair or claim Book-specific Prose literary work.

## Open transaction classifications

- `PASS` -> `NO_ACTION`
- `SUBJECT_FAILURE` -> `REPAIR_REQUEST_READY` for the current topology-resolved product execution owner
- `INFRA_FAILURE` -> bounded same-SHA `RETRY_REQUEST_READY` under shared A-01 infrastructure, subject to the closed-loop retry budget
- `CONTROL_PLANE_FAILURE` -> `OWNER_ACTION_REQUIRED` under CORE/A-01 control-plane ownership
- human/author/private/native/external/publication/production authority -> `OWNER_AUTHORITY_REQUIRED`, never product auto-repair
- stale/window/admission outcomes -> `REPLAN_ADMISSION`, never subject repair
- predecessor/dependency blocks -> `WAIT_FOR_PREDECESSOR`
- unknown classification -> `DEAD_LETTER`

## Product subject repair

A repairable product transaction contains immutable lineage: parent receipt ID, qualification ID, workstream ID, current execution-owner path, failed exact subject SHA, original result classification, evidence pointer when available, repair attempt and maximum attempt budget.

A candidate is not eligible to return to A-01 until:

1. its exact SHA differs from the failed subject SHA;
2. deterministic prequalification is PASS on that same candidate SHA;
3. qualification and workstream lineage remain unchanged;
4. repair-worker evidence is preserved;
5. no worker-generated PASS/promotion/publication/production authority is asserted;
6. the current topology/job lock still resolves the workstream to the same execution owner immediately before finalization.

The broker emits only `A01_ELIGIBLE` / `A01_REQUEUE_READY`. The subsequent A-01 receipt is the authority.

## Durable implementation

The receipt-to-repair transport remains repository-native and restartable:

1. `.github/workflows/a01-control-plane-gateway.yml` invokes the broker path on a non-PASS terminal A-01 result.
2. The broker emits an immutable transaction envelope and artifact; the gateway does not write product PASS.
3. `.github/workflows/a01-repair-receipt-ingest.yml` persists the transaction through `.github/scripts/a01-repair-ledger.js`.
4. The ledger writes append-only transaction events under `governance/repair/events/<transaction-id>/` and projects current owner state into the registered repair inbox.
5. Repairable product transactions may emit owner-bound agent-dispatch packets.
6. The owner chat, Second Shift worker or another explicitly authorized coding agent may prepare the smallest justified changed candidate within that owner's locked job.
7. `.github/workflows/a01-repair-finalize.yml` advances only an exact changed subject with deterministic prequalification PASS to `A01_REQUEUE_READY`.
8. `governance/repair/REPAIR-LEDGER-REGISTRY-001.json`, `REPAIR-EVENT-SCHEMA-001.json`, and `REPAIR-INBOX-REGISTRY-001.json` define the current durable lineage/routing contract.

Historical qualification of earlier broker versions remains exact-subject evidence only. Topology/job-routing changes require current-subject validation and do not receive PASS transfer.

## Repair inboxes

Active peer execution owners have live repair inboxes for CORE, LEARNING, BOOK and DOCUMENTS. `SYSTEM_MASTER/BOOK/PROSE` routes current child repair work through BOOK and has no separate active inbox for new transactions. Historical standalone Prose repair records remain immutable evidence.

A repair request is active only while its state is one of `REPAIR_REQUEST_READY`, `CLAIMED`, `CANDIDATE_PREQUAL_REQUIRED`, `A01_REQUEUE_READY`, `OWNER_ACTION_REQUIRED`, `OWNER_AUTHORITY_REQUIRED`, `WAIT_FOR_PREDECESSOR`, `REPLAN_ADMISSION`, or `RETRY_REQUEST_READY`.

Terminal transaction state is preserved in history rather than erased.

## Chat and Second Shift rule

Every owner chat and Second Shift worker checks its repair inbox after resolving current authority/job lock and before selecting unrelated build-ahead. A changed owner control head does not erase a repair transaction; the owner revalidates the transaction against current state before mutation.

Book-Prose repair activity uses BOOK scheduling, claims and telemetry. No standalone Prose mutation claim, repair lane or Second Shift lane may be created.

## Authority limits

The broker, ledger, dispatch packet and repair worker may never emit authoritative A-01 PASS; set promotion/publication/production authority; transfer PASS from a failed SHA; repair human/author/private/native/external blockers as code defects; treat stale/window/dependency outcomes as `SUBJECT_FAILURE`; silently change workstream or owner lineage; move Book-Prose work into Documents; or bypass current System State Reconciler/job-lock conflicts.

## Relationship to System State Reconciler

The State Reconciler proves current ownership and state consistency. The Repair Broker acts only after that truth layer resolves the execution owner and failure classification. `UNALLOCATED`, `STALE_DELEGATION`, `EVIDENCE_MISMATCH`, `REPAIR_OWNER_MISMATCH`, `JOB_LANE_VIOLATION`, or unresolved owner conflicts fail repair admission closed until reconciled.

## Closed-loop boundary

The existing closed-loop repair train remains authoritative for receipt classification, durable ledgering, owner dispatch, exact-SHA prequalification binding, replacement-ticket emission, and same-lineage A-01 rerun adjudication. This topology-004 update changes only current owner routing semantics and transfers no PASS or product authority.
