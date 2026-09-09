# A01-REPAIR-BROKER-001

Status: CANONICAL REPAIR-ROUTING CONTRACT
Owner: `SYSTEM_MASTER/SHARED_INFRASTRUCTURE/A01`
Administrative owner: `SYSTEM_MASTER/CORE`

## Purpose

Close the durable handoff gap between an authoritative A-01 failure and the owning System Master lane.

The broker does **not** repair product code itself and does **not** grant PASS. It converts an authoritative receipt into one truthful route:

`A-01 receipt -> classify -> durable repair/hold/retry route -> owner work -> deterministic prequalification -> changed exact SHA -> A01_ELIGIBLE replacement -> authoritative A-01 rerun`

The repository is the event/evidence bus. Chats and agents are working surfaces. A-01 remains the authoritative Windows qualification executor.

## Owner mapping

The broker resolves `workstream_id` only through `governance/SYSTEM-TOPOLOGY-002.json`.

- `SYSTEM-MASTER`, Continuity, Assurance/Reconciliation, and A-01 control-plane work map to CORE/shared infrastructure as defined by topology.
- `LEARNING` maps to LEARNING.
- `BOOK-SYSTEM` maps to BOOK.
- `LITERARY-PROSE` and `BOOK-EVAL-LEMONADE-001` map to PROSE.
- an unmapped workstream fails closed as `UNALLOCATED`; it is not repaired.

## Open transaction classifications

- `PASS` -> `NO_ACTION`
- `SUBJECT_FAILURE` -> `REPAIR_REQUEST_READY` for the canonical product owner
- `INFRA_FAILURE` -> bounded same-SHA `RETRY_REQUEST_READY` under shared A-01 infrastructure, subject to the closed-loop retry budget
- `CONTROL_PLANE_FAILURE` -> `OWNER_ACTION_REQUIRED` under CORE/A-01 control-plane ownership
- human/author/private/native/external/publication/production authority -> `OWNER_AUTHORITY_REQUIRED`, never product auto-repair
- stale/window/admission outcomes -> `REPLAN_ADMISSION`, never subject repair
- predecessor/dependency blocks -> `WAIT_FOR_PREDECESSOR`
- unknown classification -> `DEAD_LETTER`

## Product subject repair

A repairable product transaction contains immutable lineage:

- parent receipt ID;
- qualification ID;
- workstream ID;
- canonical owner path;
- failed exact subject SHA;
- original result classification;
- original evidence pointer when available;
- repair attempt and maximum attempt budget.

The owner may reproduce and minimally repair the proven failing boundary. A candidate is not eligible to return to A-01 until:

1. its exact SHA differs from the failed subject SHA;
2. deterministic prequalification is PASS on that same candidate SHA;
3. qualification and workstream lineage remain unchanged;
4. repair-worker evidence is preserved;
5. no worker-generated PASS/promotion/publication/production authority is asserted.

The broker then emits only `A01_ELIGIBLE`. The subsequent A-01 receipt is the authority.

## Repair inboxes

Each canonical owner has a live repair inbox registered by `governance/repair/REPAIR-INBOX-REGISTRY-001.json`.

A repair request is active only while its state is one of:

- `REPAIR_REQUEST_READY`
- `CLAIMED`
- `CANDIDATE_PREQUAL_REQUIRED`
- `A01_REQUEUE_READY`
- `OWNER_ACTION_REQUIRED`
- `OWNER_AUTHORITY_REQUIRED`
- `WAIT_FOR_PREDECESSOR`
- `REPLAN_ADMISSION`
- `RETRY_REQUEST_READY`

Terminal transaction state is preserved in history rather than erased.

## Chat and Second Shift rule

Every owner chat and Second Shift worker checks its repair inbox after resolving current authority and before selecting speculative new work.

A repair request does **not** automatically preempt a more important safety/authority boundary, but a current repairable failure on that lane should normally outrank unrelated build-ahead because it shortens the active critical path.

A changed owner control head does not erase a repair transaction. The owner revalidates the transaction against current state before mutation. If the failed objective has been superseded or made irrelevant, the transaction is closed/superseded with evidence rather than repaired unnecessarily.

## Authority limits

The broker and repair worker may never:

- emit authoritative A-01 PASS;
- set promotion/publication/production authority;
- transfer PASS from the failed SHA;
- repair human, author, private-data, native-platform or external-authority blockers as code defects;
- treat a stale/window/dependency outcome as `SUBJECT_FAILURE`;
- accept arbitrary shell/command input as a repair plan;
- silently change workstream or owner lineage;
- bypass the System State Reconciler when repository ownership/state conflicts.

## Relationship to System State Reconciler

The State Reconciler proves current ownership and state consistency. The Repair Broker acts only after that truth layer resolves the lane and the failure classification.

If the Reconciler reports `UNALLOCATED`, `STALE_DELEGATION`, `EVIDENCE_MISMATCH`, or an unresolved owner conflict relevant to the failed work, repair admission fails closed until the state discrepancy is reconciled.
