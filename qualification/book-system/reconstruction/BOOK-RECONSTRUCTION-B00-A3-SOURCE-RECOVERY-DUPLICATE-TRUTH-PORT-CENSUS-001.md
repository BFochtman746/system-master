# BOOK-RECONSTRUCTION-B00-A3 — SOURCE RECOVERY + DUPLICATE-TRUTH / PORT CENSUS 001

Status: **IN_PROGRESS / FORENSIC EVIDENCE / NOT B00-A CLOSURE / NOT DESIGN-LOCK / NO BUILD AUTHORIZATION**

Owner: **SYSTEM_MASTER/BOOK**  
Controlling method: `BOOK-SYSTEM-RECONSTRUCTION-BLUEPRINT-001`  
Observed live owner head immediately before this write: `book-system/control-v1@797794657a9c0ede7e6f7665187c154c25b6f0bc`  
Predecessor: `BOOK-RECONSTRUCTION-B00-A2-CANONICAL-STATE-EXTRACTION-AND-HISTORICAL-GAP-CENSUS-001.md`

## 1. Purpose

Continue B00-A until the Foundation/Authority archaeology is lossless. This unit performs two bounded tasks:

1. deepen source-level recovery for rights/licensing/custody and copy-edit/style semantics without resurrecting retired PROSE ownership; and
2. classify duplicate-truth risk across the qualifier-only parent state and existing reusable Book runtimes so a later design-lock can preserve exactly one canonical writer.

This artifact is an inventory/adjudication input. It is not a final API design, implementation, or qualification result.

## 2. Exact sources inspected in this pass

### Current Book owner lineage

- `book-system/control-v1@797794657a9c0ede7e6f7665187c154c25b6f0bc`
- current tree after A2: `c6a37c9544dbc31c932d61dc7c4b114bcc34817a`
- `.github/scripts/book-system-canonical-state-001-qualify.js`
- `qualification/book-system/canonical-state-001/BOOK-SYSTEM-CANONICAL-BOOK-STATE-MODEL-001.json`
- `system-master/book-system/version-and-rollback-core.js`
- `system-master/book-system/content-object-admission-core.js`
- `system-master/book-system/lifecycle-transition-engine.js`
- `system-master/book-system/lifecycle-current-parent-compatibility-adapter.js`
- `system-master/book-system/integration-proposal-runtime-v2-core.js`
- `system-master/book-system/author-decision-queue-core.js`
- `system-master/book-system/export-freeze-core.js`
- `system-master/book-system/book-workflow-evidence-provenance.js`

### Preserved historical/reconciliation lineages

- `book-system/reconstruction-v1@0406abadcf903e828c278d6d0116b67606ef2215`, tree `dcbae81a1637ab21007042e30036c6ecf2048795`;
- `books-literary-prose-001@55fa713be0e9b704399bd75920d0186b406f8117`, tree `dc3b14f596aa3ec09de2e4a2622ff693df71a650`;
- `literary-prose-engine-001@e8b463f39c2951ed90dd1623327a4d8a0bbdf774`, tree `57ad42cf8c8056acd50aa50f90035f1c8fb41b43`;
- `prose/foundation-closure-final-refill-20260910@808cb8505c4df343771a553a77a14db85e0cc2c3`, tree `087d9a4614a2c71434cf3a939f5ed06be01d3f76`;
- `book-prose-integration/phase0-revalidation-20260910-1115@564cd3e1265a60d9ac499b9d69db8e110d9ced67`, tree `6d4f65601b199ab8ca3c469a20adab6c00fdab26`.

Bounded path-name searches over the inspected trees found no dedicated reusable path named for `rights`, `license`, `style`, or `copy` that can be accepted as current Book authority. This is a bounded source-recovery result, not proof that no semantics exist inside generically named files.

## 3. Historical authority adjudication

The preserved `qualification/book-writing-project/BOOK-WRITING-PROJECT-PRIMARY-AUTHORITY-001.json` on the literary lineage is explicitly marked:

`SUPERSEDED__INCORRECT_PROJECT_HIERARCHY__NO_CURRENT_AUTHORITY`

It may remain forensic history only. It cannot define Book identity, Prose identity, or a current next step and its exact-SHA qualification authority does not transfer.

Therefore no Book reconstruction decision may rely on that superseded record as current authority.

Historical literary/prose state also preserves important negative/safety boundaries, including no unknown-rights source admission, no named-author imitation target, no raw private manuscript/candidate prose in repository evidence, no automatic canonical overwrite, and no publication without separate authority. These are useful prior constraints, but PROSE is retired and those controls do not become a reusable Book rights/licensing/custody runtime by inheritance.

## 4. Rights / licensing / custody — source-level finding

### 4.1 What current Book runtime actually has

Current Book runtime consumes/enforces rights-related standing in several places:

- integration proposal runtime binds source identities/currentness and blocks unsafe rights/privacy reclassification;
- export freeze requires a rights/privacy evidence object and fails unless `rights_state == CURRENT_AUTHORIZED` and `privacy_state == CURRENT_ALLOWED`;
- existing-book recovery and workflow evidence preserve source/provenance identities;
- Book evidence/provenance receipts forbid canonical/publication effects and raw private-content persistence.

These are meaningful controls. They do **not** establish who performs rights/legal adjudication, how licenses are represented/versioned, how custody/permission expiration or revocation is recorded, or how one authoritative rights standing is revalidated across source reuse.

### 4.2 Ownership adjudication

Book must own the **Book-side source acceptance contract**: stable source identity, relevant source/version/digest, provenance reference, declared rights/privacy standing reference, currentness/expiry/revocation result, intended-use binding, and the fail-closed decision about whether a source may participate in Book workflows.

Book must **not fabricate legal clearance** or silently become the external legal/provider authority. A real legal/licensing/private-source decision may remain human/external. Book stores/uses the authoritative reference and currentness result under explicit fences.

### 4.3 B00.009 standing

`B00.009` remains **PARTIAL / NOT INSTALLED AS A COMPLETE AUTHORITY**.

The archaeology now establishes a narrower gap than before: the missing surface is not generic provenance or a simple `rights_state` boolean. It is the reusable, versioned Book-side rights/licensing/custody **reference/currentness/acceptance contract** that consumes legitimate external/human evidence without inventing it.

## 5. Copy-edit / style — source-level finding

No dedicated current Book runtime path was recovered for a versioned copy-edit profile or style sheet.

Current `integration-proposal-runtime-v2-core.js` explicitly recognizes editorial stages including:

- `STYLISTIC_OR_LINE_EDIT_REVIEW`
- `COPY_EDIT_REVIEW`
- `POST_LAYOUT_PROOFREAD_REVIEW`

That proves the current integration model understands those stages. It does **not** prove persistence/ownership of a Book-specific style profile, copy-edit rule set, terminology/spelling policy, exceptions, profile version, governing source, or invalidation semantics.

No inspected historical tree produced a dedicated reusable style/copy-edit authority by path-name census. A previously guessed historical qualification path could not be fetched and is not counted as evidence.

### B00.027 standing

`B00.027` remains **DESIGNED-NOT-INSTALLED + PARTIAL GENERIC/EDITORIAL-STAGE SEMANTICS**.

The remaining Book-owned semantic gap is now explicit: a versioned Book-specific copy-edit/style metadata object or equivalent canonical reference, with currentness and invalidation rules. Mechanical editing may remain a specialist/provider operation; the Book project remains owner of which profile/version governs the manuscript.

## 6. Duplicate-truth census

The reconstruction must preserve one truth owner per concept. Current reusable modules are valuable and should be rebound, not rewritten wholesale.

| Surface | Durable truth it legitimately owns | Parent-state interaction observed | Duplicate-truth risk / required adjudication |
|---|---|---|---|
| Canonical state qualifier/model | canonical Book/project aggregate, active pointers, project lifecycle status, append-only parent registries, state version/digest | currently implements parent semantics inside qualifier | **CRITICAL**: material parent authority is qualifier-only |
| Version/rollback core | immutable object-version lineage, snapshots, family heads, rollback receipts, replay/idempotency ledger | validates parent state, snapshots full parent state, binds to parent version/digest | snapshot must remain historical/version evidence, never a second current parent owner |
| Content admission core | admission validation for governed object/unit versions and provenance/currentness | creates proposed parent changes and relies on version/rollback substrate | admitted effects must commit through the one parent authority; admission cannot become independent canonical writer |
| Lifecycle engine + current-parent adapter | unit lifecycle ledger, dependency edges, transition receipts; project-transition decision mechanics | compatibility adapter projects current parent, delegates, then rebuilds/seals current parent | project status remains parent truth; lifecycle ledger owns transition evidence/unit states, not a competing canonical project status |
| Integration proposal runtime | proposal intake/dedup/currentness/admission ledger, source/artifact/provenance indexes, author-handoff/outbox | validates/binds parent identity and later contributes admitted proposal standing | proposal ledger owns proposal process; parent should contain only the canonical admitted/current reference/record required by Book state |
| Author decision queue | decision request families/snapshots, presentation/staleness/resolution receipts/outbox | bound to parent identity and current subjects | queue owns decision workflow; parent canonical state owns only accepted finalized decision record/reference as defined by parent contract |
| Export freeze core | freeze request replay ledger and freeze receipt | directly builds a successor parent and appends `export_releases` after evidence/author/admission checks | release record is parent truth; freeze ledger is process/evidence truth. Commit must be centralized through parent authority after extraction |
| Workflow evidence/provenance | append-only workflow/evidence receipts, provider/operation/source bindings | explicitly `canonical_effect_allowed: false` | low duplicate risk if canonical-effect prohibition stays absolute |

## 7. Important compatibility finding

The legacy lifecycle engine calculates its own projected-parent digest semantics. The current `lifecycle-current-parent-compatibility-adapter.js` explicitly mediates that mismatch: it validates the current parent with `version-and-rollback-core.js`, projects collections into the legacy shape, translates current `state_digest` into the legacy projected digest for delegated execution, rejects out-of-scope parent deltas, then rebuilds/seals the current parent representation.

Adjudication: **reuse the adapter/rebind knowledge; do not directly promote the legacy lifecycle parent representation into the reconstructed canonical core.** The adapter is evidence that parent-shape/digest compatibility is already a known boundary.

## 8. Provisional minimum parent-port census

These are **port classes**, not frozen API names or implementation design. A later design-lock should minimize them further if possible.

### PARENT-READ

Read the exact current canonical Book state and its immutable identity tuple:

- Book/project identity;
- schema version;
- state version;
- canonical state digest;
- active/current pointers;
- canonical project lifecycle status.

No caller receives write authority merely by reading.

### PARENT-ASSERT-CURRENT

Fail closed against expected parent identity before effects are admitted:

- expected state version;
- expected digest;
- expected active object/version refs when material;
- expected subject/source identity.

### PARENT-APPLY-TYPED-EFFECT

One canonical writer applies only enumerated, schema-valid effects under CAS/idempotency/audit rules. Candidate effect families recovered from current semantics include:

- register immutable governed object version;
- register immutable chapter/scene unit version;
- set an active canonical pointer to an already-admitted version;
- register a research/source/evidence reference;
- register a finalized author decision reference/record;
- register an admitted integration proposal reference/record;
- transition canonical project lifecycle status;
- register an export-freeze/release record;
- register or change governing Book metadata such as a future copy-edit/style profile reference only after its schema/ownership is adjudicated.

Specialized runtimes may validate/prepare an effect but may not commit around this port.

### PARENT-HISTORY/AUDIT

Every committed effect must preserve predecessor identity, actor/authority class, request/idempotency identity, exact evidence/control references, pre/post parent identity, and a replay-safe receipt. Specialized ledgers remain linked evidence, not alternate parent history.

### PARENT-RECONCILE

Re-read and reconcile after write/restart rather than assuming read-after-write freshness. A request replay with the same idempotency identity must converge to the already-committed result; conflicting reuse must fail closed.

## 9. Reconstruction invariants now explicit

1. Exactly one canonical parent writer.
2. Version snapshots are historical/version truth, not live parent truth.
3. Lifecycle project status is canonical parent truth; lifecycle unit state/dependency evidence may remain in its specialized ledger.
4. Proposal and author queues own their workflows; only final accepted/current effects become parent references/records.
5. Workflow evidence can never acquire canonical effect authority.
6. Export freeze can validate and produce a typed release effect, but final parent mutation must pass through canonical parent authority.
7. Rights/licensing/private/publication standing cannot be synthesized from flags supplied by an untrusted caller.
8. Book owns currentness/acceptance/reference semantics for source rights/custody evidence; external/human legal authority remains external/human.
9. Book owns which style/copy-edit profile governs its manuscript; editing execution may be delegated without transferring that governing metadata authority.
10. Every mutable operation is bound to exact current parent identity and deterministic idempotency semantics.

## 10. Test-denominator inventory for later design-lock

No numeric denominator is frozen yet. The following test families are now mandatory candidates before BUILD:

- parent schema/identity/digest integrity;
- CAS stale-write denial;
- idempotent exact replay and conflicting replay denial;
- active-pointer ambiguity/nonexistent target denial;
- immutable history preservation;
- actor/authority scope denial;
- specialized-ledger/parent binding mismatch;
- lifecycle adapter projection/digest mismatch and out-of-scope delta denial;
- version snapshot not promoted as current parent;
- proposal/author queue cannot write canonical state directly;
- workflow evidence canonical-effect denial;
- export freeze cannot bypass canonical parent commit;
- rights evidence missing/stale/revoked/expired/mismatched/untrusted standing denial;
- copy-edit/style governing-profile stale/missing/wrong-version/invalidation denial;
- restart/reconcile after committed-but-response-lost scenarios;
- concurrent competing parent effects;
- cumulative regression against existing admission/version/lifecycle/proposal/author/export/workflow semantics.

The exact count must be frozen only after the remaining B00-A objects/contracts are losslessly recovered.

## 11. B00-A accounting after A3

- 30 B00 requirements remain mapped.
- `B00.009` is narrowed but still open: reusable Book rights/licensing/custody reference/currentness/acceptance contract not installed.
- `B00.027` is narrowed but still open: versioned governing copy-edit/style metadata authority not installed/recovered.
- canonical parent state remains mandatory qualifier-only extraction work.
- duplicate-truth boundaries for version, admission, lifecycle, proposals, author queue, export freeze and workflow evidence are now classified.
- historical PROSE artifacts remain provenance only and do not create a Prose lane.
- unaccounted archaeology is **still greater than zero** because the exact parent-state schema/port contract and the two open metadata authorities have not yet been fully specified/rebound.
- B00-A: **NOT CLOSED**.
- B00-B: **NOT ADMITTED**.

## 12. Exact dependency-valid successor

**`BOOK-RECONSTRUCTION-B00-A4 — CANONICAL-PARENT SCHEMA/PORT CONTRACT DRAFT + RIGHTS-CUSTODY AND STYLE-PROFILE OBJECT MODEL + 30-ROW ZERO-UNACCOUNTED READINESS CENSUS`**

A4 must remain pre-build. It shall:

1. draft the reusable canonical parent schema/typed-effect contract from recovered semantics rather than copying the qualifier wholesale;
2. define the minimum Book-owned rights/licensing/custody evidence-reference/currentness object without inventing legal authority;
3. define the minimum versioned governing copy-edit/style metadata object and its invalidation/currentness semantics;
4. map every one of the 30 B00 rows through requirement -> implementation/target -> durable state -> port/contract -> tests -> evidence -> environment -> blocker;
5. identify every remaining qualifier-only behavior and every direct specialized parent mutation that must be routed through the canonical writer;
6. determine whether unaccounted archaeology is truly zero. If not, bind only the smallest evidence-required continuation. If yes, only then admit B00-B analysis.

## 13. Evidence fences

No real author decision, private-source permission, legal/rights clearance, license, native extraction fidelity, publication authorization, production installation, or A-01 PASS is claimed. Historical exact-SHA PASS remains exact-subject evidence only and does not transfer to reconstructed bytes.
