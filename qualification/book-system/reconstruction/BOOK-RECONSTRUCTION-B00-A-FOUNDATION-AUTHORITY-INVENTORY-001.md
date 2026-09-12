# BOOK-RECONSTRUCTION-B00-A — FOUNDATION & AUTHORITY LOSSLESS FORENSIC INVENTORY

Status: **IN_PROGRESS**  
Owner: **BOOK SYSTEM**  
Method authority: `qualification/book-system/reconstruction/BOOK-SYSTEM-RECONSTRUCTION-BLUEPRINT-001.md`  
Inventory subject head at creation: `book-system/control-v1@b7d883836a214b341f2e2353a5986a38b26447c4`  
Canonical-main comparison head: `main@8849a85fc01fa6bc16d9541061ec936539ff4554`

## 1. Purpose

This is a forensic inventory, not a closure artifact and not a redesign artifact. It records what the Book System Foundation & Authority layer actually has, where it lives, what prior evidence proves, and what remains absent or unproven under the reconstruction blueprint.

Historical labels such as Prose, Literary Prose Engine, Book Evaluator, or Creative Excellence are provenance labels only. They do not establish separate current system ownership. Recovered capabilities belong to BOOK SYSTEM unless a true shared/external mechanical provider boundary is proven.

No designed Book capability is discarded because an older artifact called it optional, deferred, child-owned, future, or out-of-scope. Those labels are non-authoritative reconstruction evidence only.

## 2. Classification law

- **MAIN-INSTALLED** — executable implementation is materialized on canonical `main`, has a reachable runtime path, and evidence shows that path executes.
- **BOOK-BRANCH-BUILT** — executable reusable implementation exists on `book-system/control-v1`, but is not yet materialized on canonical `main` and/or has not yet been requalified as the reconstructed cumulative subject.
- **HISTORICAL-BOOK-CODE** — executable implementation exists only in historical Book/literary lineage and is not installed in the current Book runtime.
- **QUALIFIER-ONLY** — executable behavior exists inside a qualifier/test/qualification harness rather than reusable current Book runtime.
- **DESIGNED-NOT-INSTALLED** — required behavior is defined by design/research/evidence but no qualifying current reusable runtime is proven.
- **EXTERNAL-REQUIRED** — the mechanical implementation may correctly remain owned by another shared/external provider, but Book must still own and implement its invocation, acceptance, identity, provenance, currentness, and authority boundary.

A historical or exact-SHA PASS does **not** transfer to changed bytes, changed ownership, changed topology, or the reconstructed cumulative subject. Old PASS evidence proves that a capability was once successfully exercised on the stated subject; it does not close reconstruction qualification.

## 3. Installation finding

Canonical `main` currently materializes only the Book Context Compiler subtree under `system-master/book-system`. The Foundation/Authority runtimes enumerated below are therefore not MAIN-INSTALLED at this census point. Most reusable B00 execution code is presently BOOK-BRANCH-BUILT on `book-system/control-v1`; the canonical state implementation is materially different because its implementation is still embedded in its qualification script.

## 4. Atomic B00 inventory — first lossless pass

| ID | Required Foundation / Authority capability | Current classification | Current implementation / evidence surface | Forensic disposition / remaining proof |
|---|---|---|---|---|
| B00.001 | Book/project stable identity | QUALIFIER-ONLY | `.github/scripts/book-system-canonical-state-001-qualify.js`; canonical-state qualification | Executable identity/state logic exists inside qualifier; reusable production Book state core not yet proven. |
| B00.002 | Chapter/scene/unit stable IDs | BOOK-BRANCH-BUILT + QUALIFIER-ONLY | `system-master/book-system/content-object-admission-core.js`; canonical-state qualifier | Reusable admission code exists for content-unit identity; parent canonical materialization still depends on qualifier-only state core. |
| B00.003 | Canonical object envelope/schema | QUALIFIER-ONLY | canonical-state qualifier; `qualification/book-system/canonical-state-001/` | Prior exact-SHA state-model qualification exists, but no separate reusable canonical-state runtime is proven. |
| B00.004 | Current canonical revision/version pointer | BOOK-BRANCH-BUILT + QUALIFIER-ONLY | `version-and-rollback-core.js`; canonical-state qualifier | Version runtime has active-version semantics; canonical parent state core still qualifier-embedded. |
| B00.005 | Story Bible canonical structure | QUALIFIER-ONLY + BOOK-BRANCH-BUILT mutation support | canonical-state qualifier; `version-and-rollback-core.js`; `integration-proposal-runtime-v2-core.js` | Structure exists in canonical model; mutation/version surfaces exist, but canonical state engine must be extracted/installed. |
| B00.006 | Book Plan canonical structure | QUALIFIER-ONLY + BOOK-BRANCH-BUILT mutation support | same surfaces as B00.005; `content-object-admission-core.js` | Same split-state finding; active content ordering is versioned through Book Plan. |
| B00.007 | Manuscript canonical structure | QUALIFIER-ONLY + BOOK-BRANCH-BUILT version support | canonical-state qualifier; `version-and-rollback-core.js` | Canonical schema exists; reusable canonical state runtime not yet installed. |
| B00.008 | Research/source canonical structure | QUALIFIER-ONLY + BOOK-BRANCH-BUILT intake/history support | canonical-state qualifier; proposal/version runtimes; existing-book recovery | Research/source slots and append-only history exist across surfaces; one unified installed source authority model is not yet proven. |
| B00.009 | Source identity, rights, licensing/custody, provenance policy | DESIGNED-NOT-INSTALLED + BOOK-BRANCH-BUILT partial | `integration-proposal-runtime-v2-core.js`; `existing-book-recovery.js`; research `BOOK-SYSTEM-PROVENANCE-INTEROPERABILITY-PROJECTION-001.json` | Exact source/provenance and rights/privacy reclassification blocking are partly implemented. Complete source-rights/licensing/custody model is not proven as reusable runtime. Architecture projection explicitly has qualification effect NONE. |
| B00.010 | Author decision identity and durable queue | BOOK-BRANCH-BUILT | `author-decision-queue-core.js` | Real reusable runtime exists; prior exact-SHA A-01 queue qualification does not transfer to reconstruction subject. |
| B00.011 | Current-subject / stale-SHA guard | BOOK-BRANCH-BUILT | `author-decision-current-subject-guard.js` | Fail-closed current owner/subject guard exists. Dedicated current reconstruction qualification remains required. |
| B00.012 | Integration proposal identity/state | BOOK-BRANCH-BUILT | `integration-proposal-runtime-v2-core.js` | Real proposal runtime exists; prior 35-case hosted + A-01 exact-SHA proof is historical evidence only for reconstruction. |
| B00.013 | Author-only ACCEPT / REJECT / DEFER authority | BOOK-BRANCH-BUILT | proposal runtime; author decision queue | Implemented authority boundary. Must be cumulatively requalified with current canonical state and version runtime. |
| B00.014 | Canonical mutation CAS / exact preconditions | BOOK-BRANCH-BUILT + QUALIFIER-ONLY | proposal runtime; version runtime; admission core; canonical-state qualifier | Multiple runtimes enforce exact state/source/digest preconditions; parent canonical core remains qualifier-only. |
| B00.015 | Immutable versions and predecessor lineage | BOOK-BRANCH-BUILT | `version-and-rollback-core.js`; admission core | Real immutable successor/version lineage runtime exists. Prior exact-SHA 48/48 hosted + A-01 evidence must be rerun under reconstruction. |
| B00.016 | Rollback/restore without history rewrite | BOOK-BRANCH-BUILT | `version-and-rollback-core.js` | Restore-as-new-successor semantics are built. Reconstruction must prove dependencies/current evidence cannot be bypassed. |
| B00.017 | Approved restore requires author authorization | BOOK-BRANCH-BUILT | `version-and-rollback-core.js`; author decision surfaces | Built authority fence; real human decision correctness remains inherently human-fenced. |
| B00.018 | Project/unit lifecycle state authority | BOOK-BRANCH-BUILT | `lifecycle-transition-engine.js`; `lifecycle-native-adapter.js` | Real transition engine exists. Prior A-01 qualification covered project/unit gates and service denial, exact-SHA only. |
| B00.019 | Admission currentness, idempotency, stale-write denial | BOOK-BRANCH-BUILT | `content-object-admission-core.js` | Reusable runtime exists; reconstruction qualification/cumulative regression still required. |
| B00.020 | Content/body hash and artifact identity | BOOK-BRANCH-BUILT | admission core; evidence/provenance runtime; existing-book recovery | Digest identities are implemented across current Book branch surfaces. Need single B00 invariant test across all entry paths. |
| B00.021 | Mutation/audit/event history | BOOK-BRANCH-BUILT + QUALIFIER-ONLY | version/proposal/author/lifecycle ledgers; canonical-state qualifier | Append-only histories exist across runtimes; canonical parent audit representation is still partly qualifier-only. |
| B00.022 | Workflow/evidence/provenance item identity | BOOK-BRANCH-BUILT | `book-workflow-evidence-provenance.js` | Canonical JSON + SHA-256, source refs, version identifiers and materialization digest are built. |
| B00.023 | Private payload separation / minimum necessary persistence | BOOK-BRANCH-BUILT partial | workflow evidence/provenance; proposal runtime; durable workflow serializer/store | Digest/size/reference separation is built for workflow evidence. Full cross-B00 privacy/rights policy is not yet unified. |
| B00.024 | Native PDF/DOCX/OCR/source-byte extraction mechanics | EXTERNAL-REQUIRED | Existing Book Recovery contract + shared provider boundary | Raw parsing/rendering mechanics may remain shared/external; Book must own request identity, source provenance, semantic acceptance and fail-closed admission. Existing-book semantic core was qualified only on normalized synthetic input. |
| B00.025 | Upstream dependency invalidation and restoration | BOOK-BRANCH-BUILT | `lifecycle-transition-engine.js` | Transitive invalidation and invalidation restore are real runtime behavior with prior exact-SHA qualification. Rich editorial-substage invalidation remains a later reconstruction obligation. |
| B00.026 | Concurrency/currentness across workflow and parent state | BOOK-BRANCH-BUILT | lifecycle engine; version runtime; proposal runtime; `book-workflow-concurrency-control.js` | Multiple real CAS/concurrency boundaries exist; cumulative cross-runtime race/conflict testing is required. |
| B00.027 | Copy-edit profile / style-sheet metadata persistence | DESIGNED-NOT-INSTALLED + BOOK-BRANCH-BUILT partial metadata | version runtime metadata; research-verified authoring lifecycle amendment | Some metadata survives versioning, but a complete versioned copy-edit profile/style-sheet runtime is not proven installed. |
| B00.028 | Export/release canonical identity and freeze preconditions | BOOK-BRANCH-BUILT + QUALIFIER-ONLY parent structure | `export-freeze-precondition-adapter.js`; canonical-state export structure; export-freeze qualification | Book-side freeze/precondition machinery exists; canonical parent export structure still shares qualifier-only canonical state limitation. |
| B00.029 | Publication/delivery authorization boundary | EXTERNAL-REQUIRED + human/Book authority fence | canonical-state/lifecycle/proposal evidence; publication/export research profiles | Book must own explicit release authorization state; downstream distribution/render/delivery mechanics may remain external. No provider result may fabricate publication authority. |
| B00.030 | Human/author/private/native/external/publication/A-01 fences | BOOK-BRANCH-BUILT + EXTERNAL-REQUIRED | author queue/guard, proposal, lifecycle, version/rollback, existing-book recovery contracts, governance qualification paths | Core fail-closed fences are substantially represented. Each fence must be re-proven against reconstructed current bytes; human/private/native/publication evidence cannot be synthesized by tests. |

## 5. Prior qualification evidence retained as evidence, not reconstruction closure

### Canonical state
`BOOK-SYSTEM-CANONICAL-BOOK-STATE-MODEL-001-CLOSURE` reports exact-SHA A-01 PASS for object completeness, state version/digest preconditions, illegal transition fail-closed behavior, research atomicity, author-decision registration, publication boundary and rollback retention. Its subject was `b6938fcfc5c2c24ac23b558de6dfc7f75c382312`. The current repository inspection shows the implementation still lives in the qualifier rather than a reusable `system-master/book-system` canonical-state runtime; therefore reconstruction classification is QUALIFIER-ONLY until extracted/installed and requalified.

### Lifecycle
`BOOK-SYSTEM-LIFECYCLE-TRANSITION-ENGINE-001-CLOSURE` reports exact-SHA A-01 PASS on subject `4a6e3459d6ba94b7ce191e426ca64bef00d23582`, including project/unit gates, author/service boundaries, stale evidence denial, parent/ledger concurrency, defer/resume, transitive invalidation, invalidation restore, replay/conflict safety, atomic failure and rollback identity. That PASS does not transfer to the current reconstructed subject.

### Integration proposal runtime
`BOOK-SYSTEM-INTEGRATION-PROPOSAL-RUNTIME-002-CLOSURE` reports 35 deterministic adversarial cases and authoritative A-01 PASS on `837e479415afb2d9724e4b913d456ef1d3a62df5`, including exact source/provenance identity, stale source blocking, rights/privacy reclassification blocking, immutable receipts/outbox state, author handoff and rollback identity. It explicitly grants no provider canonical write, lifecycle, freeze or publication authority.

### Version and rollback
`BOOK-SYSTEM-VERSION-AND-ROLLBACK-001-CLOSURE` reports 48/48 hosted plus authoritative A-01 PASS on `402ab84a14e9d345530d60394ebc36176541dd21`, proving immutable snapshots/lineage, active-version binding, CAS, append-only history, restore-as-new-successor, current evidence/rights/privacy/author revalidation, idempotency/conflict safety and authority separation. Its own non-transfer rule requires new evidence for changed subjects.

### Author decision queue
`BOOK-SYSTEM-AUTHOR-DECISION-QUEUE-001-CLOSURE` reports 48/48 hosted plus authoritative A-01 PASS on `9601ae5df8348c1daac8805eaefa1718c431dd49`, proving parent-only queue authority, immutable decision lineage, exact CAS, no preselected/model-synthesized author choice, authority proof, custom choice preservation, confirmation binding, defer/reopen/withdraw/stale/supersession semantics, replay/conflict safety and exactly one canonical decision append. It does not prove that a real author has actually made any specific decision.

### Existing Book Recovery semantic core
`BOOK-SYSTEM-EXISTING-BOOK-RECOVERY-SEMANTIC-CORE-001` is a real current Book runtime slice with hosted synthetic normalized-input evidence (13/13 positive, 4/4 negative, 45 assertions). That proof does not cover native PDF/DOCX/OCR fidelity, private manuscripts, A-01, device behavior, real-author usability, production resources or publication/distribution.

## 6. B00 gaps already proven

1. **Canonical parent state is not yet installed as a reusable Book runtime.** Its implementation is qualifier-embedded. This is a reconstruction-blocking Foundation gap.
2. **B00 is not materialized on canonical main.** Current Foundation execution code is largely isolated on `book-system/control-v1`.
3. **Rights/licensing/custody is incomplete as an executable unified Book model.** Proposal intake enforces material rights/privacy staleness and provenance constraints, but the broader provenance projection is architecture-only and Existing Book Recovery does not by itself prove a complete rights/licensing/custody record.
4. **Copy-edit profile/style-sheet persistence is only partial.** Complete runtime semantics remain to be recovered/built.
5. **Native source extraction is legitimately provider-owned only at the mechanical boundary.** Book still requires a complete source identity/provenance/semantic acceptance path.
6. **All old PASS evidence is exact-SHA historical evidence for reconstruction purposes.** No old PASS substitutes for the blueprint's isolated B00 qualification and later B00-through-current cumulative regression/calibration.

## 7. Open B00-A archaeology — must be resolved before closure

- Exhaustively enumerate all Foundation-relevant historical literary/Book branch artifacts that may contain source identity, rights/custody, canonical state, author authority, versioning or provenance behavior not present in current Book runtime.
- Reconcile `canonical-state-001`, `content-object-admission-001`, `lifecycle-transition-001`, `lifecycle-transition-compatibility-001`, `version-and-rollback-001`, `author-decision-001`, `integration-proposal-001/002`, `export-freeze-001`, `existing-book-recovery-semantic-core-001`, workflow persistence/evidence/concurrency qualifications, and research-verification artifacts into one path-level evidence map.
- Identify every qualifier-only behavior that must be extracted into reusable runtime, beginning with canonical state.
- Prove whether any complete executable rights/licensing/custody model exists elsewhere before classifying the residual as build-new.
- Determine the exact Book-side publication/release state object required while preserving external distribution mechanics as external.
- Determine the final versioned copy-edit/style-sheet object model required by the authoring lifecycle.
- Map every B00 entry to tests, fixtures, negative/adversarial cases, and future cumulative calibration obligations.

## 8. Testing and calibration rule inherited from blueprint

B00 may not freeze on inventory alone. After B00 reconstruction/build work, B00 must pass its isolated qualification and calibration suite. Every later layer must then re-run all Book layers through the current layer: B00-B01, B00-B02, B00-B03, and so on. Changed bytes invalidate exact-subject evidence until the applicable tests are rerun.

## 9. Current disposition

`B00-A = IN_PROGRESS__FIRST_LOSSLESS_LEDGER_PERSISTED__NO_CLOSURE_CLAIM`

Exact continuation: finish historical/current path census for the open archaeology above, update this ledger losslessly, then perform B00-A completeness adjudication. Do not advance to redesign/build B00-B until the Foundation/Authority evidence census is complete enough to prove what is reusable, what must be extracted, what must be built, and what is truly external.
