# BOOK-RECONSTRUCTION-B00-F1 — ISOLATED QUALIFICATION 001

Status: **F1 PASS / F2 ADMITTED / B00 NOT CLOSED / NO PASS TRANSFER**

Owner: **SYSTEM_MASTER/BOOK**

Design lock: `BOOK-RECONSTRUCTION-B00-E1-FORMAL-DESIGN-LOCK-001.md`

Qualified implementation lineage: `book-system/reconstruction-b00-parent-v2`

Exact qualified subject: `33039fb1531c7a28f35516e6e552486dacd6cbbd`

Qualified executable surface:

- `system-master/book-system/canonical-parent-v2-core.js`
- `.github/scripts/book-system-canonical-parent-v2-core-001-qualify.js`
- qualification workflow used only as hosted execution/evidence transport.

## 1. Gate

E1 froze F1 as the pure canonical-parent core slice and required E1 cases Q001-Q036 = 36/36 before F2 could mutate the implementation lineage.

Hosted workflow run: **34678577617**.

Both matrix jobs checked out exact subject `33039fb1531c7a28f35516e6e552486dacd6cbbd` and completed successfully:

- Node 22 — `36/36 F1 core` — PASS;
- Node 24 — `36/36 F1 core` — PASS.

No A-01 runner or native platform was used or claimed.

## 2. Evidence artifacts

Node 22 artifact:

- artifact id `10292849711`;
- name `book-reconstruction-b00-f1-node-22-33039fb1531c7a28f35516e6e552486dacd6cbbd`;
- digest `sha256:e0ba866a470302fcacad3225ed941866db63e4a031d2b5c19aefff1847b93b55`.

Node 24 artifact:

- artifact id `10293795260`;
- name `book-reconstruction-b00-f1-node-24-33039fb1531c7a28f35516e6e552486dacd6cbbd`;
- digest `sha256:ff8ba91122e253abfa5851705de041796f2a1ec4235acd5c7563a5a6dfc01db5`.

Each job recorded the exact subject SHA, ran the frozen 36-case qualifier, hashed its local evidence files and uploaded them.

## 3. What F1 now proves

For this exact hosted subject only, the pure core has fresh evidence for:

- v2 parent schema/identity/digest validation;
- fail-closed pointer/object/private-field checks;
- enumerated typed-effect and actor/authority validation;
- generic/unknown/provider-defined effect rejection;
- publication effect remaining build-blocked;
- exact current parent CAS checks;
- deterministic effect payload/request fingerprints;
- idempotent exact replay and conflict rejection;
- one-success/one-version-increment behavior;
- response-loss replay convergence when the durable prior receipt/state are supplied by the future store boundary.

## 4. What F1 does not prove

F1 is pure and performs no durable I/O. It does **not** prove E1 Q037-Q050:

- atomic parent + receipt + history durability;
- rollback on persistence failure;
- crash/reopen recovery;
- corruption/integrity recovery behavior;
- one-writer durable contention semantics;
- durable receipt lookup after restart;
- same-transaction specialist + parent persistence.

Those are F2 responsibilities.

F1 also does not prove real author decisions, legal/rights clearance, private-source permission, native document fidelity, publication authorization, A-01 behavior or production installation.

## 5. Adjudication

F1 isolated gate: **PASS**.

F2 dependency gate: **ADMITTED**.

The F1 PASS is bound only to exact subject `33039fb1531c7a28f35516e6e552486dacd6cbbd`. Any F2 commit requires fresh isolated qualification including Q001-Q050 on its exact subject; this record cannot be transferred to changed bytes.

## 6. Exact next operation

**`BOOK-RECONSTRUCTION-B00-F2 — CANONICAL DURABLE STORE PORT + FIRST TRANSACTIONAL ADAPTER + Q001-Q050 EXACT-SUBJECT HOSTED QUALIFICATION`**

F2 must preserve one canonical writer, atomic parent/receipt/history persistence, exact CAS/idempotency, crash/reopen verification and response-loss receipt recovery. It may not weaken the existing workflow store's `canonical_effect_allowed=false` boundary.
