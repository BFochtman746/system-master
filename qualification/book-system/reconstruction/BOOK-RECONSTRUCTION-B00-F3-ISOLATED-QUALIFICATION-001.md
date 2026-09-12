# BOOK-RECONSTRUCTION-B00-F3 — ISOLATED QUALIFICATION 001

Status: **F3 PASS / F4 ADMITTED / B00 NOT CLOSED / NO PASS TRANSFER**

Owner: **SYSTEM_MASTER/BOOK**

Design lock: `BOOK-RECONSTRUCTION-B00-E1-FORMAL-DESIGN-LOCK-001.md`

Qualified implementation lineage: `book-system/reconstruction-b00-parent-v2`

Exact qualified subject: `4ef25ac486c2c19906e84edf285d241f512b733a`

Hosted workflow run: **34678787163**.

## 1. Qualified surface

The exact subject contains the F1 canonical parent pure core, F2 transactional SQLite adapter and the F3 Book-owned rights/custody evidence-currentness runtime:

- `system-master/book-system/rights-custody-evidence-core.js`;
- `.github/scripts/book-system-rights-custody-evidence-001-qualify.js`.

The rights runtime evaluates evidence and creates Book-side acceptance/currentness records. It does not create legal authority. ODRL/SPDX or opaque policy data are references bound to identified evidence/issuer/source/currentness, not automatic clearance.

## 2. Exact qualification result

Both hosted jobs checked out exact subject `4ef25ac486c2c19906e84edf285d241f512b733a` and passed:

- Node 22 — Q001-Q050 baseline + Q067-Q076 rights/custody — **PASS**;
- Node 24 — Q001-Q050 baseline + Q067-Q076 rights/custody — **PASS**.

The F3 denominator proves for this exact subject:

- current scoped evidence can produce `ACCEPTED_FOR_DECLARED_SCOPE` only with identified issuer/evidence/source/currentness;
- caller-supplied authorization/disposition cannot manufacture authority;
- unknown, stale, expired, revoked and conflicting evidence fail closed;
- intended-use mismatch fails closed;
- source/digest mismatch fails closed;
- unknown ODRL profile semantics cannot upgrade evidence to accepted standing.

## 3. Evidence artifacts

Node 22:

- artifact id `10294030114`;
- name `book-reconstruction-b00-f3-node-22-4ef25ac486c2c19906e84edf285d241f512b733a`;
- digest `sha256:dbbfd3290aca339bb07343f179f461db19db6a861042345606d2e3320d3f0ac5`.

Node 24:

- artifact id `10293800604`;
- name `book-reconstruction-b00-f3-node-24-4ef25ac486c2c19906e84edf285d241f512b733a`;
- digest `sha256:ba1393b62b48a42813f3f436c4d6001059d7eb844f3ede67ff6f843458e71ee5`.

## 4. Evidence boundary

This is hosted deterministic evidence only. It is not legal advice, rights/license clearance, private-source permission, author approval, native/provider fidelity, publication authorization, A-01 qualification or production installation.

The separate A-01 control-plane enforcement workflow is not counted as A-01 qualification of this subject.

## 5. Remaining denominator

F1/F2/F3 exact current reconstruction evidence now covers:

- Q001-Q050;
- Q067-Q076.

Still open under the 96-case design lock:

- Q051-Q066 specialist rebind/reconciliation;
- Q077-Q084 governing style profile;
- Q085-Q090 privacy/native/publication boundaries;
- Q091-Q096 migration/cumulative seam behavior.

## 6. Exact next operation

**`BOOK-RECONSTRUCTION-B00-F4 — GOVERNING STYLE-PROFILE RUNTIME + Q001-Q050 BASELINE + Q067-Q084 CURRENT-SLICE QUALIFICATION`**

F4 shall implement only the Book-owned versioned style/copy-edit governing metadata authority. A copy-edit provider may receive immutable bounded profile projections and return findings/proposals, but cannot choose the current governing profile or mutate canonical Book/manuscript state.
