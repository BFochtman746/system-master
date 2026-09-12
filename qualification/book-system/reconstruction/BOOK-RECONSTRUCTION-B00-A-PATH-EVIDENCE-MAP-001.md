# BOOK-RECONSTRUCTION-B00-A — PATH-LEVEL EVIDENCE MAP 001

Status: **IN_PROGRESS / FORENSIC EVIDENCE / NOT B00-A CLOSURE / NOT B00-B ADMISSION**

Owner: **SYSTEM_MASTER/BOOK**  
Controlling method: `qualification/book-system/reconstruction/BOOK-SYSTEM-RECONSTRUCTION-BLUEPRINT-001.md`  
Source owner head re-read immediately before this write: `book-system/control-v1@b928cee631acce447dad4c75282cd295f049ec57`  
Parent inventory: `BOOK-RECONSTRUCTION-B00-A — FOUNDATION & AUTHORITY LOSSLESS FORENSIC INVENTORY`

## 1. Purpose and evidence law

This artifact advances B00-A from a capability-level inventory toward the required path-level evidence map. It does not close archaeology, does not freeze a design, does not transfer any historical PASS to the reconstructed subject, and does not authorize B00-B while unresolved Foundation/Authority evidence remains.

Every classification below means only what the reconstruction blueprint permits:

- **BOOK-BRANCH-BUILT** means executable reusable Book code is present on the current Book owner branch, not that it is installed on canonical `main` or cumulatively qualified.
- **QUALIFIER-ONLY** means material runtime semantics are embedded in a qualifier/harness and are not accepted as reusable Book runtime.
- **DESIGNED-NOT-INSTALLED** means the requirement exists but complete reachable reusable runtime is not proven.
- **EXTERNAL-REQUIRED** means Book retains its own identity/provenance/acceptance/authority contract while mechanical execution may remain outside Book.

The reconstruction installation proof remains:

`requirement -> current executable implementation/admitted adapter -> reachable Book runtime call path -> execution evidence -> qualification evidence`

and empirical quality claims additionally require their correct calibration class.

## 2. Current reusable Book Foundation/Authority surfaces observed

| Surface | Current path | Blob at source head | Forensic role |
|---|---|---:|---|
| Canonical parent state model / mutation semantics | `.github/scripts/book-system-canonical-state-001-qualify.js` | `4f7aba633d413bed6613379234cedfb5424fe03d` | **QUALIFIER-ONLY**. Defines state validation, active canonical pointers, actor operation scopes, canonical mutation preconditions, research/author/proposal/export registration and state digest behavior inside the qualifier. This is the first mandatory extraction/reusable-runtime candidate. |
| Content object admission | `system-master/book-system/content-object-admission-core.js` | `82057df226705ac55f7553fff888d4e0fc67968c` | **BOOK-BRANCH-BUILT** reusable admission/currentness/idempotency/content-unit identity substrate. |
| Version / rollback | `system-master/book-system/version-and-rollback-core.js` | `64c477d08dc9790ca2a8c321afa88f21707c0ad6` | **BOOK-BRANCH-BUILT**. Validates parent state, governed object families, active pointers, immutable snapshots/version lineage, append-only histories and rollback/restore constraints. |
| Author decision queue | `system-master/book-system/author-decision-queue-core.js` | `a54543fcd6084c5518a9f3f088bada80f2496028` | **BOOK-BRANCH-BUILT** durable author-decision authority/queue substrate. |
| Current-subject author guard | `system-master/book-system/author-decision-current-subject-guard.js` | `b44abbc1387be0ca9ea6f628d21b0878fbfd57b6` | **BOOK-BRANCH-BUILT** current-subject/stale-subject fence. |
| Author-decision admission applicability | `system-master/book-system/content-admission-author-decision-applicability-guard.js` | `e4db77b199845eac5e7c9346f68714158c815e56` | **BOOK-BRANCH-BUILT** guard joining author-decision standing to admission. |
| Integration proposal runtime | `system-master/book-system/integration-proposal-runtime-v2-core.js` | `28d743306c617db68084a897bbd6a81c51dbdb80` | **BOOK-BRANCH-BUILT** proposal identity/state, source/provenance currentness, rights/privacy reclassification blocking, receipts/outbox and author handoff. This is partial rights/provenance enforcement, not a complete unified rights/licensing/custody authority. |
| Lifecycle transition | `system-master/book-system/lifecycle-transition-engine.js` | `26d36d2186c6e88fcab1acb3c9626b2d2d9e11db` | **BOOK-BRANCH-BUILT** project/unit transition, invalidation/restoration and authority-gated lifecycle behavior. |
| Lifecycle current-parent compatibility | `system-master/book-system/lifecycle-current-parent-compatibility-adapter.js` | `24764271147cbf3d504914b8d32e208b325d204f` | **BOOK-BRANCH-BUILT** compatibility/rebinding support; cumulative correctness remains to prove. |
| Lifecycle current-parent rebind | `system-master/book-system/lifecycle-current-parent-rebind-adapter.js` | `6daab688b984c4b5dc8b4cadb8174702e1c28506` | **BOOK-BRANCH-BUILT** current-parent rebind support. |
| Workflow state model | `system-master/book-system/book-workflow-state-model.js` | `81d17b4f71735821799eb4008b3b4db294aba7ba` | **BOOK-BRANCH-BUILT** workflow-state semantics; belongs primarily to B01 but supplies B00 identity/currentness integration evidence. |
| Workflow durable store | `system-master/book-system/book-workflow-durable-store.js` | `976543f540b7f6a74bd5fcbeacdc168335aacb2c` | **BOOK-BRANCH-BUILT** durable workflow persistence substrate; B01-owned mechanics with B00 boundary evidence. |
| Workflow concurrency | `system-master/book-system/book-workflow-concurrency-rules.js` | `c691c12d11ea3502b4d44bc2907ddb2e57034bc3` | **BOOK-BRANCH-BUILT** concurrency/currentness rules; cumulative parent-state race coverage still required. |
| Workflow evidence/provenance | `system-master/book-system/book-workflow-evidence-provenance.js` | `d66e053ab841231cdaa8f36ba64fdff27af10fd2` | **BOOK-BRANCH-BUILT** evidence/provenance identity, canonical serialization/digests and reference separation. |
| Workflow retry/idempotency | `system-master/book-system/book-workflow-retry-idempotency-rules.js` | `a81f4259ab75d19e2bf347201d4160dca0ae9da2` | **BOOK-BRANCH-BUILT** B01 mechanics relevant to B00 replay/currentness boundaries. |
| Workflow cancellation/resume | `system-master/book-system/book-workflow-cancellation-resume.js` | `614b9eab521ebc7937d81e33e16b2ada5fa426d9` | **BOOK-BRANCH-BUILT** B01 mechanics relevant to durable authority/currentness recovery. |
| Existing-book recovery semantic core | `system-master/book-system/existing-book-recovery.js` | `dd2e04b8efba921b9ce86d695fce37211fe18c38` | **BOOK-BRANCH-BUILT** semantic recovery over normalized inputs. Native PDF/DOCX/OCR extraction fidelity remains external/native evidence, not implied by this runtime. |
| Export freeze core | `system-master/book-system/export-freeze-core.js` | `781a63d9bbfd000aead0fd983f049cf4eda0003d` | **BOOK-BRANCH-BUILT** Book-side freeze/release-precondition substrate. |
| Export parent admission guard | `system-master/book-system/export-freeze-parent-admission-guard.js` | `c80195df7d461b91207c3b3461089e58a57a6780` | **BOOK-BRANCH-BUILT** parent/currentness gate for export freeze. |
| Book admission handoff | `system-master/book-system/book-workflow-book-admission-handoff.js` | `2f5d9996384c0056da790aba8c7d1e3b8b18a654` | **BOOK-BRANCH-BUILT** bridge into Book admission; does not transfer canonical writer authority. |

## 3. Atomic B00 path/evidence crosswalk — current pass

| ID | Requirement | Current path-level evidence | Truth class now | Remaining B00-A proof |
|---|---|---|---|---|
| B00.001 | Book/project stable identity | canonical-state qualifier; version/rollback parent validation | **QUALIFIER-ONLY + branch-built consumer** | Extract/install one reusable canonical parent identity/state authority. |
| B00.002 | Chapter/scene/unit stable IDs | `content-object-admission-core.js` | **BOOK-BRANCH-BUILT** | Trace every unit-entry path and prove uniqueness/collision/current-parent behavior cumulatively. |
| B00.003 | Canonical object envelope/schema | canonical-state qualifier/model JSON | **QUALIFIER-ONLY** | Extract schema/runtime validation into reusable current Book authority; bind migrations/versioning. |
| B00.004 | Current canonical revision/version pointer | qualifier active pointers + `version-and-rollback-core.js` | **QUALIFIER-ONLY + BOOK-BRANCH-BUILT** | Remove split parent-state authority; prove one current pointer source. |
| B00.005 | Story Bible canonical structure | qualifier parent model + version/rollback object family | **QUALIFIER-ONLY + BOOK-BRANCH-BUILT** | Prove reusable parent state owns the canonical pointer and version runtime never becomes a second canonical owner. |
| B00.006 | Book Plan canonical structure | same split as B00.005 + admission ordering surfaces | **QUALIFIER-ONLY + BOOK-BRANCH-BUILT** | Same owner consolidation/currentness proof. |
| B00.007 | Manuscript canonical structure | qualifier parent model + version/rollback manuscript family | **QUALIFIER-ONLY + BOOK-BRANCH-BUILT** | Install parent canonical authority; preserve digest/version/authority-state invariant. |
| B00.008 | Research/source canonical structure | qualifier research links + proposal/recovery/evidence surfaces | **QUALIFIER-ONLY + BOOK-BRANCH-BUILT partial** | Unify source identity/currentness/custody pointers without collapsing evidence into canonical state. |
| B00.009 | Source identity, rights, licensing/custody, provenance | proposal runtime currentness/reclassification checks; recovery source semantics; workflow evidence/provenance | **DESIGNED-NOT-INSTALLED + BOOK-BRANCH-BUILT partial** | No dedicated complete reusable rights/licensing/custody runtime was found in the current Book runtime path-name census. Historical archaeology must still prove whether one exists elsewhere before `BUILD` is selected. |
| B00.010 | Author decision identity + durable queue | `author-decision-queue-core.js` | **BOOK-BRANCH-BUILT** | Rebind to reusable canonical parent state; rerun exact reconstruction qualification. |
| B00.011 | Current-subject/stale-SHA guard | `author-decision-current-subject-guard.js` | **BOOK-BRANCH-BUILT** | Cumulative current-subject tests across all B00 mutation paths. |
| B00.012 | Integration proposal identity/state | `integration-proposal-runtime-v2-core.js` | **BOOK-BRANCH-BUILT** | Rebind canonical parent state; preserve historical 35-case/A-01 evidence as non-transferable prior evidence. |
| B00.013 | Author-only ACCEPT/REJECT/DEFER | proposal runtime + author queue | **BOOK-BRANCH-BUILT** | Cross-runtime actor-chain and stale-decision applicability proof. |
| B00.014 | Canonical mutation CAS/exact preconditions | qualifier mutation envelope + admission/version/proposal/lifecycle guards | **BOOK-BRANCH-BUILT + QUALIFIER-ONLY** | Consolidate parent CAS authority and run cross-runtime races. |
| B00.015 | Immutable versions/predecessor lineage | `version-and-rollback-core.js` | **BOOK-BRANCH-BUILT** | Reconstruction-subject exact tests + parent-state integration. |
| B00.016 | Rollback/restore without history rewrite | `version-and-rollback-core.js` | **BOOK-BRANCH-BUILT** | Prove restore cannot bypass evidence/rights/privacy/author/currentness dependencies after parent extraction. |
| B00.017 | Approved restore requires author authority | version/rollback + author queue/applicability guard | **BOOK-BRANCH-BUILT** | Cumulative actor/currentness tests; real author choice remains HUMAN fenced. |
| B00.018 | Project/unit lifecycle authority | `lifecycle-transition-engine.js` + current-parent adapters | **BOOK-BRANCH-BUILT** | Rebind to reusable parent canonical state and prove lifecycle/canonical-state single-owner rule. |
| B00.019 | Admission currentness/idempotency/stale-write denial | `content-object-admission-core.js` | **BOOK-BRANCH-BUILT** | Cross-entry cumulative tests against extracted parent state. |
| B00.020 | Content/body hash and artifact identity | admission + evidence/provenance + recovery | **BOOK-BRANCH-BUILT** | One invariant suite across all source/admission/version/export entry paths. |
| B00.021 | Mutation/audit/event history | version/proposal/author/lifecycle ledgers + qualifier parent mutations | **BOOK-BRANCH-BUILT + QUALIFIER-ONLY** | Decide one authoritative parent mutation-history contract versus specialized ledgers/projections; eliminate duplicate truth. |
| B00.022 | Workflow/evidence/provenance item identity | `book-workflow-evidence-provenance.js` | **BOOK-BRANCH-BUILT** | B00/B01 ownership seam + current parent subject binding. |
| B00.023 | Private payload separation/minimum necessary persistence | workflow evidence/provenance + proposal/runtime persistence rules | **BOOK-BRANCH-BUILT partial** | Complete cross-B00 privacy/data-minimization policy and test every persistence surface; no private-evidence claim without real authority. |
| B00.024 | Native PDF/DOCX/OCR/source-byte extraction mechanics | `existing-book-recovery.js` accepts normalized semantic input; native parser is not Book runtime | **EXTERNAL-REQUIRED** | Freeze provider contract: source identity, byte digest, provenance, extraction-version/currentness and semantic acceptance remain Book-owned; native fidelity remains external/native evidence. |
| B00.025 | Dependency invalidation/restoration | lifecycle transition engine | **BOOK-BRANCH-BUILT** | Map all B00 dependency edges and prove transitive invalidation/reopen against canonical parent state. |
| B00.026 | Concurrency/currentness across workflow + parent state | version/proposal/lifecycle CAS + `book-workflow-concurrency-rules.js` | **BOOK-BRANCH-BUILT** | Dedicated cumulative race/conflict suite after parent extraction. |
| B00.027 | Copy-edit profile/style-sheet metadata persistence | no dedicated copy-edit/style runtime path appears in the current Book runtime directory; version metadata may preserve generic metadata | **DESIGNED-NOT-INSTALLED + partial metadata** | Search historical Book/literary artifacts before deciding BUILD; specify versioned ownership/invalidation semantics if absent. |
| B00.028 | Export/release canonical identity + freeze preconditions | `export-freeze-core.js`, `export-freeze-parent-admission-guard.js`, qualifier export-release parent structure | **BOOK-BRANCH-BUILT + QUALIFIER-ONLY parent** | Rebind freeze to reusable parent state; prove exact manuscript/version/evidence identity end-to-end. |
| B00.029 | Publication/delivery authorization boundary | export/lifecycle/author/proposal boundaries; downstream mechanics external | **EXTERNAL-REQUIRED + Book/human fence** | Define explicit reusable Book release-authorization state; publication/distribution evidence remains external/human. |
| B00.030 | Human/author/private/native/external/publication/A-01 fences | author queue/guard, proposal runtime, lifecycle, version/rollback, recovery/export boundaries | **BOOK-BRANCH-BUILT + EXTERNAL-REQUIRED** | One cumulative fail-closed authority-fence suite; never convert unavailable authority into synthetic PASS. |

## 4. Qualifier-only extraction candidates

### QX-001 — Canonical parent Book state — **MANDATORY / FIRST**

The current canonical-state qualifier contains material production semantics, including:

- aggregate/schema validation;
- stable Book/project identity validation;
- active governing brief/canon/Story Bible/Book Plan/canonical manuscript pointers;
- canonical-manuscript authority-state enforcement;
- state version + digest preconditions;
- mutation operation vocabulary;
- actor-class operation scopes;
- canonical-write denial for non-parent literary/evaluator actors;
- bounded research-link, author-decision, integration-proposal and export-release registration;
- legal project-state transitions.

Those semantics are executable but remain inside `.github/scripts/book-system-canonical-state-001-qualify.js`. B00 cannot freeze while the parent canonical authority is only a qualifier implementation and downstream branch-built runtimes are separately consuming/replicating pieces of its contract.

Extraction must not simply copy the qualifier into production. B00-D/B00-E must first adjudicate the authoritative parent-state boundary, eliminate duplicate truth with version/lifecycle/admission ledgers, then build the smallest reusable canonical state core with explicit ports.

### QX-002 — Additional qualifier-only behavior — **OPEN CENSUS**

B00-A must continue examining canonical-state, export-freeze, compatibility and other qualification scripts for executable behavior that does not have a reachable reusable runtime counterpart. Presence of a similarly named production file is not proof of semantic parity.

## 5. Rights / licensing / custody / provenance finding

Current Book runtime has real partial enforcement:

- integration proposal runtime carries source/provenance currentness and rights/privacy reclassification blocking;
- existing-book recovery carries source/recovery semantic identity over normalized inputs;
- workflow evidence/provenance carries digest/reference/provenance mechanics.

But the current Book runtime directory/path census contains no dedicated complete rights/licensing/custody authority implementation, and this pass did not locate a complete equivalent through current default-branch code search. This is **not proof that no historical implementation exists**. Therefore B00.009 remains `DESIGNED-NOT-INSTALLED + BOOK-BRANCH-BUILT partial` until historical Book/literary branches and qualification/research archives are exhaustively searched.

No Book work may infer permission to ingest, transform, quote, imitate, publish or distribute merely from source availability or provenance identity.

## 6. Copy-edit profile / style-sheet finding

No dedicated copy-edit/style runtime path appears in the current `system-master/book-system` directory, and current default-branch code search did not surface a complete implementation. Generic version metadata is not sufficient to claim this requirement installed.

B00.027 therefore remains open. B00-A must search historical Book/literary implementation and research evidence before B00-D selects `BUILD`, `MIGRATE`, `MERGE` or another disposition.

## 7. B00/B01 seam finding

The current Book branch contains substantial workflow persistence, concurrency, retry/idempotency, cancellation/resume, evidence/provenance and scheduler code. Under the reconstruction blueprint these mechanics are primarily **B01 Execution Foundation**, while B00 owns the Book identity/canonical-state/authority semantics they bind to.

B00 must not absorb workflow execution truth merely because B00 needs currentness, CAS or evidence references. Conversely B01 may not become canonical Book state. The required seam is an explicit B00 parent identity/revision/digest/authority contract consumed by B01 execution machinery.

## 8. Historical qualification evidence — retained, not transferred

The following remain useful exact-subject evidence inputs only:

- canonical state A-01 subject `b6938fcfc5c2c24ac23b558de6dfc7f75c382312`;
- lifecycle A-01 subject `4a6e3459d6ba94b7ce191e426ca64bef00d23582`;
- integration proposal v2 historical 35-case hosted/adversarial + A-01 subject `837e479415afb2d9724e4b913d456ef1d3a62df5`;
- version/rollback historical 48/48 hosted + A-01 subject `402ab84a14e9d345530d60394ebc36176541dd21`;
- author-decision queue historical 48/48 hosted + A-01 subject `9601ae5df8348c1daac8805eaefa1718c431dd49`;
- existing-book-recovery semantic core historical normalized synthetic-input evidence: 13/13 positive, 4/4 negative, 45 assertions.

None closes the current reconstruction subject. Fresh isolated B00 plus B00 cumulative evidence is still required after B00 design/build changes.

## 9. Open archaeology required before B00-A can be declared lossless

1. Enumerate historical Book/literary branches and archived qualification/research artifacts for a complete rights/licensing/custody implementation.
2. Search historical artifacts for copy-edit profile/style-sheet persistence and invalidation/version semantics.
3. Complete semantic parity mapping between canonical-state qualifier behavior and all reusable branch-built consumers; identify every duplicated parent-state invariant.
4. Reconcile the full qualification families for canonical state, content admission, lifecycle + compatibility/rebind, version/rollback, author decisions, integration proposal v1/v2, export freeze, existing-book recovery, workflow persistence/evidence/concurrency.
5. Map every durable store/ledger field that carries B00 identity, authority, currentness, provenance, private-reference or history semantics and adjudicate authoritative owner versus projection.
6. Enumerate every external/human/author/private/native/publication/A-01 fence and the exact interface/evidence class required to cross it.
7. Verify canonical `main` materialization separately; branch-built evidence does not establish main installation.
8. Count unaccounted atomic B00 requirements only after the above census. Do not report `0` by assumption.

## 10. Current phase standing

- RECOVER: **ACTIVE / substantial current-runtime recovery complete, historical archaeology incomplete**
- INVENTORY: **ACTIVE / 30-capability inventory now augmented by path-level current-runtime evidence**
- ANALYZE: **LIMITED EARLY FINDINGS ONLY; B00-B not admitted**
- TARGETED RESEARCH: **NOT YET OPENED as B00-C**
- ADJUDICATE: **NOT STARTED as B00-D**
- DESIGN-LOCK: **NOT STARTED**
- BUILD: **NOT STARTED**
- ISOLATED QUALIFICATION: **NOT STARTED for reconstructed B00**
- CUMULATIVE REGRESSION/CALIBRATION: **NOT STARTED for reconstructed B00**
- FREEZE: **NOT PERMITTED**

Unaccounted requirements: **UNKNOWN / non-zero closure cannot be claimed while archaeology remains open**.

## 11. Exact dependency-valid successor

`BOOK-RECONSTRUCTION-B00-A2 — QUALIFIER-ONLY CANONICAL-STATE EXTRACTION SURFACE CENSUS + RIGHTS/CUSTODY/STYLE HISTORICAL SEARCH + PATH-MAP COMPLETION`

A2 remains inside B00-A. It may not implement the canonical-state core yet. It must first finish the archaeological and semantic-parity evidence needed for later B00-B analysis and B00-D adjudication.
