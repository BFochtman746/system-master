# BOOK-RECONSTRUCTION-B00-F5 — ISOLATED QUALIFICATION 001

Status: **F5 PASS / F6 ADMITTED / B00 NOT CLOSED / NO PASS TRANSFER**

Owner: **SYSTEM_MASTER/BOOK**

Parent design lock: `BOOK-RECONSTRUCTION-B00-E1-FORMAL-DESIGN-LOCK-001.md`

F5 design repair: `BOOK-RECONSTRUCTION-B00-F5-DESIGN-REPAIR-001.md`

Qualified implementation lineage: `book-system/reconstruction-b00-parent-v2`

Exact qualified subject: `fdfc2879c09cd098be9a0a49bbc4ddf26d5eadfa`

Hosted workflow run: **34679394844**.

Observed live Book owner immediately before this evidence write: `book-system/control-v1@4c989177bc48b369d4559fa00fbdb5fb40d48651`.

## 1. Recovered seam and design repair

F5 re-read the frozen E1 parent schema and the recovered version/content-admission substrates before mutation. A real specification/implementation seam was found: canonical v2 owns `governed_objects`, but the frozen v1 parent effect vocabulary had no typed operation for admitting a newly versioned Governing Brief, Canon Manifest, Story Bible, Book Plan or Canonical Manuscript summary. The recovered admission runtime can create those versions, so literal implementation would otherwise require an invalid generic parent patch, silent specialist-to-parent authority promotion, or inability to activate newly admitted versions.

The repair adds exactly one closed Book-owned parent effect family: `COMMIT_CONTENT_ADMISSION`. It admits only canonical identity/integrity summaries for the five already-owned governed-object classes, typed active-pointer updates for those classes, and an exact specialist-delta digest. It does not admit arbitrary patch/merge behavior, lifecycle/export/publication mutation, author synthesis, provider-defined fields, raw prose, chapter/scene payloads, or cross-owner semantics.

## 2. Qualified implementation surface

The exact subject contains the prior F1-F4 reconstructed surfaces plus:

- `system-master/book-system/canonical-parent-v2-f5-core.js` — closed `COMMIT_CONTENT_ADMISSION` parent effect validation/application;
- `system-master/book-system/version-admission-v2-rebind.js` — recovered version/admission substrate adapter that produces `PREPARED_FOR_PARENT` specialist state + typed parent effect rather than canonical completion;
- `system-master/book-system/version-admission-v2-sqlite-store.js` — same-transaction parent + specialist CAS/persistence/receipts/reconciliation;
- `.github/scripts/book-reconstruction-b00-f5-version-admission-001-qualify.js` — Q051-Q058 denominator;
- `.github/workflows/book-reconstruction-b00-f5-qualify.yml` — hosted cumulative F5 subject qualification.

The recovered `version-and-rollback-core.js` and `content-object-admission-core.js` remain reused specialist semantics. Their legacy proposed parent successor is treated only as specialist candidate state in reconstructed v2 and cannot itself become canonical parent truth.

## 3. Exact qualification result

Run `34679394844` completed successfully on exact subject `fdfc2879c09cd098be9a0a49bbc4ddf26d5eadfa`.

Both hosted matrix jobs passed:

- Node 22 — Q001-Q058 + Q067-Q084 current reconstruction slice — **PASS**;
- Node 24 — Q001-Q058 + Q067-Q084 current reconstruction slice — **PASS**.

For F5 specifically, Q051-Q058 prove on this exact subject:

- prepared specialist output is not canonical completion;
- stale specialist identity is denied before transaction commit;
- specialist state + canonical parent commit atomically under one local transaction;
- injected specialist persistence failure rolls back parent state;
- parent CAS/validation failure leaves specialist state at its predecessor;
- simulated response loss after commit reconciles immutable parent + specialist receipts and exact replay converges;
- historical version/admission candidate parent bytes never become reconstructed current-parent truth by themselves;
- content admission produces the typed `COMMIT_CONTENT_ADMISSION` effect instead of writing canonical v2 state directly.

The same exact subject also reran and passed the F1/F2 parent baseline plus F3/F4 rights/style denominator already admitted by predecessor units.

## 4. Evidence artifacts

Node 22:

- artifact id `10293256472`;
- name `book-reconstruction-b00-f5-node-22-fdfc2879c09cd098be9a0a49bbc4ddf26d5eadfa`;
- digest `sha256:77f2df67c79cd18fc2b63ba436eb15ee8c4fc591d9227ad5f1d8e24eb7656bc5`.

Node 24:

- artifact id `10293781614`;
- name `book-reconstruction-b00-f5-node-24-fdfc2879c09cd098be9a0a49bbc4ddf26d5eadfa`;
- digest `sha256:fd083dacebfba085f27cf02910318fc33fbde3c406260000ad1e5938ceeebbbd`.

## 5. Evidence boundary

This is hosted deterministic exact-subject evidence only. It is not real author choice, private-source authority, legal/rights clearance, native Office/document fidelity, publication authorization, A-01 qualification or production installation.

A separate repository A-01 control-plane enforcement check happened to pass on the subject; it is not counted as A-01 qualification of this Book implementation.

No historical PASS was transferred. F5 is qualified only for the exact bytes and hosted environments above.

## 6. Current reconstruction denominator standing

Fresh exact-subject reconstruction evidence now covers:

- Q001-Q050 — canonical parent pure core + durable parent store;
- Q051-Q058 — version/content-admission specialist rebind and atomic reconciliation;
- Q067-Q076 — rights/custody evidence/currentness;
- Q077-Q084 — governing style profile.

Still open under the frozen 96-case denominator:

- Q059-Q066 — lifecycle, author-decision, proposal, workflow-evidence, export/publication and external/native rebind/fence cases;
- Q085-Q090 — cross-surface privacy/native/publication fences;
- Q091-Q096 — v1->v2 migration and cumulative seam behavior.

No B00 freeze/closure is allowed until the exact integrated reconstructed subject passes the full required denominator plus frozen predecessor regression/cumulative calibration.

## 7. Exact next operation

**`BOOK-RECONSTRUCTION-B00-F6 — LIFECYCLE SPECIALIST REBIND TO CANONICAL PARENT V2 + Q059-Q060 EXACT-SUBJECT QUALIFICATION`**

F6 shall reuse the existing lifecycle substrate rather than rewrite valid lifecycle semantics. Project-level canonical lifecycle status must route only through the typed parent `ADVANCE_PROJECT_STATUS` effect. Unit/workflow lifecycle state remains specialist truth. Any local same-operation specialist change follows the frozen prepare/commit/reconcile protocol with exact parent + specialist identities; human/native/external evidence remains outside the local transaction and is never synthesized.

F6 must at minimum prove:

- Q059 lifecycle project transition commits through canonical parent authority;
- Q060 lifecycle unit ledger remains specialist truth and cannot silently become canonical parent state.

F6 must rerun the current Q001-Q058 + Q067-Q084 baseline on its exact subject before F7 is admitted.
