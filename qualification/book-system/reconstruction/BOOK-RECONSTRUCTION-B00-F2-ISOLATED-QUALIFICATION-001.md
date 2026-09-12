# BOOK-RECONSTRUCTION-B00-F2 — ISOLATED QUALIFICATION 001

Status: **F2 PASS / F3 ADMITTED / B00 NOT CLOSED / NO PASS TRANSFER**

Owner: **SYSTEM_MASTER/BOOK**

Design lock: `BOOK-RECONSTRUCTION-B00-E1-FORMAL-DESIGN-LOCK-001.md`

Qualified implementation lineage: `book-system/reconstruction-b00-parent-v2`

Exact qualified subject: `a499d6c0f22edf280b426fbe608803f6b91db6c1`

Hosted workflow run: **34678723760**.

## 1. Qualified surface

The exact subject contains the previously qualified F1 canonical parent pure core plus:

- `system-master/book-system/canonical-parent-v2-sqlite-store.js`;
- `.github/scripts/book-system-canonical-parent-v2-store-001-qualify.js`;
- hosted qualification transport for the combined Q001-Q050 gate.

The F2 adapter uses Node's SQLite binding behind the design-locked adapter-neutral parent-store port. The constitutional contract remains transaction/CAS/recovery semantics; the current Node binding is implementation evidence, not architectural authority.

The existing Book workflow durable store remains unchanged and coordination-only; its `canonical_effect_allowed=false` fence was not weakened.

## 2. Exact qualification result

Both hosted matrix jobs checked out exact subject `a499d6c0f22edf280b426fbe608803f6b91db6c1` and passed:

- Node 22 — Q001-Q050 — **PASS**;
- Node 24 — Q001-Q050 — **PASS**.

The workflow reran the frozen F1 Q001-Q036 denominator and then the F2 Q037-Q050 durability/recovery denominator on each runtime.

F2 therefore adds fresh exact-subject evidence for:

- atomic canonical parent + receipt commit;
- atomic parent history/index update;
- rollback on validation/persistence failure;
- post-commit response-loss recovery;
- reopen/current-parent and reopen/receipt recovery;
- corruption/integrity fail-closed behavior;
- predecessor commit-receipt chain verification;
- competing-writer one-winner/CAS behavior;
- transient SQLite busy/locked classification separate from semantic CAS conflict;
- no half-effect exposure after injected pre-commit failures;
- restart-preserved exact idempotent replay.

## 3. Evidence artifacts

Node 22:

- artifact id `10293750569`;
- name `book-reconstruction-b00-f2-node-22-a499d6c0f22edf280b426fbe608803f6b91db6c1`;
- digest `sha256:8c221b306b6304b95753cc62750a1c7cf740d67e560d64113a95d5bb289dd5b5`.

Node 24:

- artifact id `10293725561`;
- name `book-reconstruction-b00-f2-node-24-a499d6c0f22edf280b426fbe608803f6b91db6c1`;
- digest `sha256:2496417c07fd1f4d04e144954aaa63d61b40652873d6b2b7c11c225f5ee42eb9`.

## 4. Evidence boundary

This is hosted exact-subject evidence only. It is not A-01 qualification, native iOS/macOS/Office evidence, production installation, legal/rights clearance, author approval, private-source permission or publication authorization.

The separate A-01 control-plane enforcement workflow that may run on repository pushes is not an A-01 qualification of this Book subject and is not counted as such.

## 5. F2 closure and remaining denominator

F2 isolated gate: **PASS**.

The design-locked 96-case B00 denominator is not complete. Q051-Q096 remain future reconstruction work. In particular:

- specialist rebind/reconciliation Q051-Q066 is not yet proven;
- rights/custody Q067-Q076 is not yet proven;
- governing style profile Q077-Q084 is not yet proven;
- privacy/native/publication Q085-Q090 is not yet proven;
- migration/cumulative seam Q091-Q096 is not yet proven.

No historical predecessor PASS transfers to those future bytes.

## 6. Exact next operation

**`BOOK-RECONSTRUCTION-B00-F3 — RIGHTS/CUSTODY EVIDENCE-CURRENTNESS RUNTIME + Q001-Q050 BASELINE + Q067-Q076 ISOLATED QUALIFICATION`**

F3 shall build only the Book-owned evidence/reference/currentness/acceptance authority defined by E1. It must not create legal clearance, infer permission from caller strings, or absorb human/external legal authority. ODRL/SPDX remain typed optional references bound to exact evidence/currentness, not sources of machine-created authorization.
