# BOOK-RECONSTRUCTION-B02-B — SOURCE INTAKE & EXISTING-BOOK RECOVERY ANALYSIS / ADJUDICATION 001

Date: 2026-09-12
Owner: SYSTEM_MASTER/BOOK
Parent Book head: `cc5093bb46bb54a4b7245ba479ed97ffa770c996`
Observed governance head: `c41884bf9cc66c24fb7f245d68eefc6dbbd1139f`
Precondition: B02-A Recover + Inventory closed with 50/50 atomic requirements accounted and unaccounted requirements=0.
Standing: `ANALYSIS_COMPLETE__50_OF_50_DISPOSITIONED__UNRESOLVED_0__B02_C_DESIGN_LOCK_SELECTED`
Canonical effect: NONE

## Scope and authority

This artifact closes only the ANALYZE / ADJUDICATE stage for B02 Source Intake & Existing-Book Recovery. It does not implement B02, install B02 on `main`, claim a native provider, qualify recovery, admit recovered content, synthesize author decisions, authorize publication, or reopen B00/B01.

B00 Foundation & Authority and B01 Execution Foundation remain frozen. B02 must compose those frozen authorities rather than fork them. Historical Prose/Literary material remains provenance/calibration evidence only and does not regain current topology, routing, scheduler, canonical-write or qualification authority.

## Targeted research decision

No external research stage is admitted between B02-B and B02-C.

The decisions in B02-B are System Master ownership, authority, routing, evidence and composition questions already determined by current repository contracts. External sources cannot decide who owns Book canonical state or whether frozen B00/B01 authority may be widened.

External/native evidence is still required later for PDF/DOCX/OCR fidelity, immutable-source-provider behavior, real-book recovery, private-source handling, device/production standing and A-01 where applicable. Those are evidence/qualification obligations, not missing architecture authority.

## Executive adjudication

B02 uses a bounded anti-corruption pipeline:

`immutable original source -> native/storage provider -> Book custody acceptance -> normalized source projection -> existing Book recovery semantic core -> author/review decision -> existing governed Book admission -> existing lifecycle rebind`

The adjudicated architecture is:

1. **KEEP-AS-IS** the current Book semantic recovery engine. It already performs deterministic source census, revision graph reconstruction, structure recovery, metadata/citation/comment/TODO/tracked-change preservation, semantic proposal preparation, author-decision preparation and noncanonical recovered-baseline assembly.
2. **DELEGATE** original binary storage mechanics and native PDF/DOCX/OCR decoding to an external/native provider boundary. Book owns the acceptance proof, not the binary parser or blob store.
3. **BUILD** one bounded B02 recovery runtime adapter so the existing semantic engine becomes a Book-owned reachable capability without creating another scheduler/router/execution authority.
4. **BUILD** the already-designed bounded recovery-specific admission adapter, composing frozen B00 author-decision/content-admission/version authority.
5. **MERGE** lifecycle rejoin into that bounded admission composition by calling the existing lifecycle rebind authority; do not build another lifecycle engine.
6. Preserve B01's frozen execution architecture. B02 may reuse its execution laws and substrate, but B02-B does not authorize mutation of B01's frozen 11-capability registry or its 64-case denominator.
7. No recovery/provider result may gain canonical-write, author-decision, lifecycle-transition, export-freeze or publication authority.

## Mandatory B02-B question 1 — native/source-provider acceptance boundary

### Decision

Book owns the **custody acceptance contract**. The native/storage provider owns the mechanics that preserve original bytes, create a stable immutable locator and extract/normalize PDF/DOCX/OCR content.

Book must not copy raw manuscript bytes into workflow coordination state merely to prove custody.

The B02-C design lock must freeze a content-addressed acceptance envelope whose semantics include at minimum:

- Book project / recovery-session identity;
- source id and source kind;
- exact SHA-256 digest of the original source bytes;
- immutable external source locator plus provider/object/version identity sufficient to re-resolve the same source;
- provider/extractor identity and exact provider subject/contract identity when execution depends on it;
- rights/custody/private-use evidence refs bound to the exact source digest and intended use;
- normalized-projection digest;
- version-candidate identity and exact recovered-content digest;
- normalized structure with stable ordered anchors and ambiguity/confidence evidence;
- metadata, citations/references, comments/editor queries, TODO/open-item signals and tracked-change evidence where the source format exposes them;
- semantic candidates as proposals only;
- exact per-unit digest/locator evidence when a chapter/scene/unit is intended for independent canonical admission.

The acceptance contract must fail closed when source digest, locator/provider identity, projection identity, rights/custody evidence or currentness is absent, stale, contradictory or mismatched. A missing provider identity may not be guessed.

## Mandatory B02-B question 2 — recovery engine disposition

### Decision: KEEP-AS-IS

`system-master/book-system/existing-book-recovery.js` remains the sole current Book semantic existing-book recovery implementation.

Do not refactor it into a native parser, blob store, scheduler, admission engine, lifecycle engine or author-decision engine. Those are separate authority boundaries.

Any adapter work in B02-C/D must preserve these semantic properties:

- deterministic recovery identity;
- `RECOVER_EXISTING` and `NEW_EDITION` lineage semantics;
- source and content digest binding;
- revision-graph preservation rather than destructive winner selection;
- explicit ambiguity/blocking state;
- source-local evidence retention;
- semantic candidates remain `PROPOSED_NOT_CANONICAL`;
- recovered baseline remains noncanonical until governed admission.

## Mandatory B02-B question 3 — routed recovery without duplicating B01

### Decision

B02 must **BUILD a B02-owned bounded recovery runtime adapter** that composes the frozen B01 execution foundation rather than creating another execution foundation.

The current B01 `BookCapabilityBindingV1` implementation has a frozen 11-capability map and currently recognizes generation/evaluation context classes. B02-B therefore does **not** authorize adding a twelfth recovery capability directly to that frozen registry.

B02-C must freeze the least-invasive compatible mechanism for a current Book recovery capability, with these laws:

- current owner is `SYSTEM_MASTER/BOOK`;
- current execution identity uses a `BOOK.*` recovery identity; exact identifier is frozen in B02-C;
- no `PROSE.*` or historical provider identity becomes current dispatch identity;
- provider/native identity is immutable nested provenance/evidence, never ownership;
- exact source/custody/projection/recovery identity participates in task/operation identity;
- runtime remains coordination-only and has `canonical_write_authority=false`;
- no second scheduler, retry engine, concurrency authority, durable workflow authority or context authority is created;
- if B02-C finds an additive B01 extension unavoidable, it must prove that the extension does not alter frozen B01 semantics/denominator or explicitly stop as a B01 reopen blocker. Silent mutation is forbidden.

## Mandatory B02-B question 4 — recovery-specific governed admission

### Decision: BUILD BOUNDED ADAPTER, REUSE FROZEN AUTHORITY

Implement the preserved `BOOK-SYSTEM-EXISTING-BOOK-RECOVERY-GOVERNED-ADMISSION-INTEGRATION-002` contract as a bounded composition only.

The adapter must require, at minimum:

- exact current BookProject identity;
- exact current canonical manuscript identity;
- exact recovered-baseline id/digest;
- exactly one selected recovery candidate;
- no unresolved BLOCKING recovery finding;
- exact selected candidate/content/source provenance;
- current applicable author-decision/ratification receipt;
- exact predecessor/currentness/provenance checks from frozen content admission;
- exact compatible lifecycle ledger bound to the pre-admission parent.

The adapter may construct the existing admission/rebind operation plan but may not independently mutate canon. Successful recovery admission creates an immutable successor manuscript version and preserves prior history. It does not change lifecycle status. Any lifecycle advance remains a separate governed request.

## Mandatory B02-B question 5 — chapter/scene/unit digest and locator rule

### Decision

Independent chapter/scene/unit admission remains blocked until the native/provider boundary supplies exact unit evidence.

For every independently admissible unit, B02-C must require:

- stable unit id/type/order;
- exact source id and original-source digest;
- stable source locator/anchor/range sufficient to trace the unit back to accepted source evidence;
- exact unit content digest derived from the provider's admitted extraction representation;
- projection/provider identity that produced the unit;
- ambiguity/confidence evidence and any blocking extraction finding;
- parent manuscript/version identity when applicable.

Book validates and binds these values. Book may not synthesize an authoritative unit digest from an anchor alone. Until this evidence exists, manuscript-level recovery may proceed, but independent unit admission remains unavailable.

## Mandatory B02-B question 6 — duplicate historical Prose/Literary concepts

### Decision

Do not migrate a historical Prose/Literary execution owner into current Book architecture.

Historical concepts such as source digest, extraction observations, confidence, abstention, semantic observations and calibration receipts may remain immutable provenance/calibration evidence where truthful. They do not become callable current routes, current capability IDs, current scheduler obligations or current canonical authority.

The current Book recovery engine is the sole live semantic recovery owner discovered by B02-A. Historical duplicate execution paths are removed from the live architecture, not aliased back into service.

## Mandatory B02-B question 7 — evidence classes

B02 qualification must keep evidence classes separate:

1. **Synthetic mechanics evidence** — deterministic recovery, digest binding, fail-closed validation, adapter composition, checkpoint/replay and adversarial tests on the exact current candidate.
2. **Native/provider fidelity evidence** — real PDF/DOCX/OCR extraction, immutable-source re-resolution, exact source/projected/unit digest binding, locator stability and provider-specific confidence/calibration.
3. **Real-book recovery evidence** — authorized representative manuscripts showing structure, metadata, citations, comments/editor queries, TODOs, tracked changes, revision lineage and ambiguity preservation across recovery.
4. **Human/author evidence** — exact current-subject ratification/decision receipts where author authority is required. No synthetic test may stand in for author approval.
5. **Cumulative B00-B02 evidence** — fresh regression/qualification against the exact reconstructed candidate. Historical PASS is provenance only and does not transfer.
6. **External environment evidence** — private-source authority, device/production standing, publication authority and A-01 where applicable remain separately proved and may not be inferred from mechanics PASS.

## Mandatory B02-B question 8 — complete 50-item disposition

| ID | Requirement | Final disposition | Adjudication |
|---|---|---|---|
| B02-01 | Intake request identity | KEEP-AS-IS | Keep deterministic recovery request/session identity; expose it only through the bounded B02 runtime seam. |
| B02-02 | Immutable source identity | KEEP-AS-IS | Keep exact source identity in recovery; custody acceptance strengthens how it is admitted. |
| B02-03 | Exact source digest | KEEP-AS-IS | Keep SHA-256 requirement; acceptance binds it to exact original bytes/provider object. |
| B02-04 | Exact recovered-content digest | KEEP-AS-IS | Keep exact version-candidate content digest; provider evidence must support it. |
| B02-05 | Original/raw bytes custody | DELEGATE | Immutable byte storage mechanics stay external/shared; Book owns acceptance/custody proof. |
| B02-06 | Source locator | DELEGATE | Provider/storage produces immutable locator/object identity; Book validates and binds it. |
| B02-07 | Rights/custody/provenance evidence | KEEP-AS-IS | Reuse current exact-source rights/custody evidence core; no new rights authority. |
| B02-08 | Private-source permission/privacy | KEEP-AS-IS | Preserve frozen Book privacy/custody guards; human/external permission evidence remains required. |
| B02-09 | Source-currentness / stale-source rejection | KEEP-AS-IS | Preserve exact-subject/currentness fail-closed behavior. |
| B02-10 | Native PDF extraction | DELEGATE | Native/provider boundary owns extraction; Book accepts proved normalized projection. |
| B02-11 | Native DOCX extraction | DELEGATE | Native/provider boundary owns extraction including document-specific fidelity. |
| B02-12 | OCR for image/scanned sources | DELEGATE | Native/provider boundary owns OCR and calibration; Book consumes evidence-bound projection. |
| B02-13 | Normalized source projection schema/acceptance | KEEP-BUT-REFACTOR | Keep recovery projection semantics but separate/freeze a formal custody/provider acceptance envelope around them; do not enlarge the recovery core into a parser. |
| B02-14 | Historical source-text extraction observations | REMOVE | Remove from live execution architecture; preserve only truthful provenance/calibration evidence. |
| B02-15 | Source census | KEEP-AS-IS | Existing semantic recovery behavior is retained. |
| B02-16 | Recovery session determinism | KEEP-AS-IS | Existing recovery-key/profile determinism is retained. |
| B02-17 | Book/project identity | KEEP-AS-IS | Existing BookProject/recovery anchor semantics are retained. |
| B02-18 | Existing edition re-entry | KEEP-AS-IS | Preserve `RECOVER_EXISTING` semantics. |
| B02-19 | New-edition lineage | KEEP-AS-IS | Preserve exact prior-edition id/digest and non-destructive lineage. |
| B02-20 | Manuscript/version identity | KEEP-AS-IS | Preserve candidate/manuscript/version identity. |
| B02-21 | Revision parent graph | KEEP-AS-IS | Preserve graph rather than overwriting historical variants. |
| B02-22 | Authoritative-version ambiguity | KEEP-AS-IS | Preserve ambiguity; final authority requires author/governed decision. |
| B02-23 | Exact duplicate detection | KEEP-AS-IS | Keep digest-based exact duplicate semantics. |
| B02-24 | Near-duplicate/overlap handling | KEEP-AS-IS | Keep evidence-bearing overlap handling; changed empirical thresholds require later calibration. |
| B02-25 | Manuscript variants | KEEP-AS-IS | Preserve competing variants until governed selection. |
| B02-26 | Parts/front matter/chapters | KEEP-AS-IS | Preserve normalized ordered structure; extraction fidelity stays provider evidence. |
| B02-27 | Scenes/sections/units | KEEP-AS-IS | Preserve recovered unit structure; independent admission remains gated by B02-45 evidence. |
| B02-28 | Stable order/anchors | KEEP-AS-IS | Preserve order/anchor/confidence model; provider fidelity remains separately proved. |
| B02-29 | Recovery confidence | KEEP-AS-IS | Preserve recovery confidence/ambiguity semantics; native confidence requires provider calibration. |
| B02-30 | Boundary ambiguity blockers | KEEP-AS-IS | Preserve fail-closed blockers through admission. |
| B02-31 | Metadata preservation/conflicts | KEEP-AS-IS | Preserve source-local metadata without silently inventing a winner; admission/design must carry conflicts as evidence. |
| B02-32 | Citations/reference preservation | KEEP-AS-IS | Preserve citations/reference arrays and evidence refs; native fidelity remains provider proof. |
| B02-33 | Comments/editor queries | KEEP-AS-IS | Preserve comments/editor-query evidence. |
| B02-34 | TODO/TBD/open/missing-citation signals | KEEP-AS-IS | Preserve open-item evidence without promoting classification guesses to author truth. |
| B02-35 | Tracked changes | KEEP-AS-IS | Preserve tracked-change evidence; DOCX fidelity remains provider proof. |
| B02-36 | Semantic extraction inputs/candidates | KEEP-AS-IS | Keep semantic candidates proposal-only and evidence-bound. |
| B02-37 | Author decision preparation | KEEP-AS-IS | Keep preparation only; author decision authority remains human/governed. |
| B02-38 | Recovered baseline assembly | KEEP-AS-IS | Keep proposed recovered baseline noncanonical until admission. |
| B02-39 | Recovery-specific canonical admission | BUILD | Implement the already-designed bounded recovery-admission adapter; do not build a second canonical admission authority. |
| B02-40 | Generic manuscript/chapter/scene canonical admission guard | KEEP-AS-IS | Reuse frozen generic admission/currentness/author-decision guards unchanged. |
| B02-41 | Lifecycle rejoin/rebind after recovery | MERGE | Compose existing lifecycle current-parent rebind inside the bounded recovery-admission transaction; no new lifecycle engine. |
| B02-42 | Durable recovery coordination state | KEEP-AS-IS | Reuse frozen durable coordination substrate; keep raw manuscript bytes out of it. |
| B02-43 | Checkpoint/resume/idempotent replay | KEEP-AS-IS | Preserve recovery key/checkpoint semantics and compose with B01 execution/reconciliation laws. |
| B02-44 | Error/fail-closed semantics | KEEP-AS-IS | Preserve explicit validation/error fences and add adapter-level fail-closed tests. |
| B02-45 | Exact per-unit digests for chapter/scene admission | DELEGATE | Provider/native boundary produces exact unit digest/locator evidence; Book validates it before unit admission. |
| B02-46 | Capability routing/reachability | BUILD | Build bounded B02 recovery runtime adapter using frozen B01 execution substrate/laws without creating or silently mutating a second execution authority. |
| B02-47 | Main integration standing | DELEGATE | Later System Master integration authority installs the exact qualified candidate; B02-B/C may not claim main standing. |
| B02-48 | Native/provider availability/fidelity | DELEGATE | Requires exact external/native evidence; never inferred from a configured adapter. |
| B02-49 | Production/device/A-01 standing | DELEGATE | Requires external qualification authority and exact environment evidence. |
| B02-50 | Publication authority from recovered content | DELEGATE | Remains later Book/Author/publication authority; recovery can never self-authorize publication. |

### Disposition accounting

- KEEP-AS-IS: **35**
- KEEP-BUT-REFACTOR: **1**
- MERGE: **1**
- BUILD: **2**
- DELEGATE: **10**
- REMOVE: **1**
- MIGRATE-INTO-BOOK: **0**
- REPLACE: **0**

Total: **50 / 50**

Unresolved dispositions: **0**

No B02 requirement is left without an owner, boundary and action class.

## B02-C design-lock obligations

The successor design lock must freeze, before implementation:

1. exact source-custody acceptance envelope schema and digest law;
2. immutable locator/provider/object identity rules and source re-resolution/currentness rules;
3. minimum lossless normalized-projection acceptance schema;
4. exact B02 recovery capability identity and B02-owned binding/adapter contract;
5. compatibility law showing B02 composes frozen B01 execution without silently changing B01's 11-capability map or 64-case denominator;
6. recovery runtime dispatch/retry/checkpoint/reconciliation rules;
7. recovery admission adapter input/output/digest/transaction law bound to frozen B00 admission and author-decision applicability;
8. lifecycle-rebind composition with no lifecycle status change;
9. exact per-unit digest/locator contract for chapter/scene/unit admission and the blocker when absent;
10. blocker taxonomy for custody, rights, provider, extraction, ambiguity, author decision, stale state, per-unit evidence, reconciliation, external setup and A-01;
11. isolated/adversarial qualification denominator before any build;
12. cumulative B00+B01+B02 regression/evidence composition and explicit non-transfer of historical PASS.

## Required B02-C adversarial locks

At minimum, B02-C must design fail-closed coverage for:

1. original-source digest does not match provider object/locator;
2. locator resolves to changed bytes under the same display name;
3. provider/extractor subject is missing and caller tries to guess/default it;
4. normalized projection is supplied without accepted custody/source evidence;
5. projection digest or recovered-content digest changes after acceptance;
6. stale/revoked/conflicting rights or private-use evidence;
7. raw manuscript bytes leak into durable workflow coordination state;
8. historical `PROSE.*` identity is presented as current recovery dispatch identity;
9. recovery is wired by modifying the frozen B01 11-capability registry without an admitted compatibility/reopen decision;
10. a second scheduler/retry/workflow authority is introduced for recovery;
11. recovery output attempts direct canonical mutation;
12. provider output claims author ratification or publication authority;
13. multiple/ambiguous revision heads are auto-selected without governed decision;
14. a BLOCKING recovery finding is ignored during admission;
15. stale author ratification is replayed after current manuscript/BookProject changes;
16. NEW_EDITION recovery overwrites prior-edition history;
17. lifecycle status advances as a side effect of recovery admission;
18. chapter/scene admission proceeds without exact per-unit digest/locator evidence;
19. synthetic tests are presented as native PDF/DOCX/OCR fidelity proof;
20. historical recovery PASS is transferred to changed current bytes/contracts.

The denominator may grow if B02-C discovers a previously unaccounted requirement. It may not shrink to obtain PASS.

## Frozen B00/B01 invariant check

B02-B found no contradiction requiring B00 or B01 to reopen.

The following remain mandatory:

- canonical Book mutation stays behind governed Book admission;
- provider/recovery/proposal state is not canonical state;
- author decisions are never synthesized;
- exact current-subject/source identity fails closed on staleness;
- immutable history and prior editions are preserved;
- old Prose execution identity remains retired;
- B01 remains the execution foundation; B02 does not create a parallel one;
- raw/private manuscript content is not silently persisted into coordination-state records;
- provider/native success never implies publication, production or A-01 standing.

## Closure accounting

Mandatory B02-B analysis questions: **8 / 8 adjudicated**

B02 ledger dispositions: **50 / 50 adjudicated**

Unresolved analysis questions: **0**

Unresolved ledger dispositions: **0**

B02-B is complete as ANALYSIS / ADJUDICATION. This does not mean B02 is built, installed, reachable, tested end-to-end, qualified, calibrated or production-ready.

## Exactly one dependency-valid successor

`BOOK-RECONSTRUCTION-B02-C — ORIGINAL-SOURCE CUSTODY ACCEPTANCE + RECOVERY RUNTIME WIRING + GOVERNED ADMISSION DESIGN LOCK`

B02-C is the sole admitted successor. It must freeze the contracts and qualification denominator described above before any B02 implementation mutation.

No B02 implementation is authorized by this B02-B artifact itself.