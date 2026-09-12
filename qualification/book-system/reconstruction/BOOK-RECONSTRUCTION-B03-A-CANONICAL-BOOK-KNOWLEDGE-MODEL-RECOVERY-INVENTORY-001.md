# BOOK-RECONSTRUCTION-B03-A — CANONICAL BOOK KNOWLEDGE MODEL RECOVERY + INVENTORY 001

Date: 2026-09-12
Owner: SYSTEM_MASTER/BOOK
Control ref: `book-system/control-v1`
Recovered-from live owner head before mutation: `91e81161e6dc6b9eb3ae3a266525e0530114da49`
Controlling blueprint: `qualification/book-system/reconstruction/BOOK-SYSTEM-RECONSTRUCTION-BLUEPRINT-001.md`
Predecessor freeze: `qualification/book-system/reconstruction/BOOK-RECONSTRUCTION-B02-F-CONTROL-FREEZE-001.md`
Standing: `B03-A_COMPLETE__UNACCOUNTED_REQUIREMENTS_0__B03-B_ANALYSIS_ADMITTED__NO_B03_DESIGN_OR_IMPLEMENTATION_AUTHORIZED`
Canonical effect: NONE

## Scope and authority

This artifact closes only the RECOVER + INVENTORY stage for B03 Canonical Book Knowledge Model. B00 Foundation & Authority, B01 Execution Foundation and B02 Source Intake & Existing-Book Recovery remain frozen. No B00-B02 invariant is contradicted by this archaeology, so none is reopened.

The current owner is `SYSTEM_MASTER/BOOK`. Historical Prose/Literary labels are provenance only. Historical executable narrative-state and narrative-orchestration code may be migration/adaptation donors, but their old ownership labels and the historical term `CANONICAL_NARRATIVE_STATE` do not create a second current canonical aggregate or a competing knowledge authority.

B03-A does not choose the final B03 schema, persistence topology or migration strategy. It does not synthesize canon, author decisions, extraction accuracy, private-source permission, real-book calibration, publication authority, production standing or A-01 standing.

Implementation truth classes are limited to the reconstruction blueprint classes: `MAIN-INSTALLED`, `BOOK-BRANCH-BUILT`, `HISTORICAL-BOOK-CODE`, `QUALIFIER-ONLY`, `DESIGNED-NOT-INSTALLED`, `EXTERNAL-REQUIRED`.

## Executive finding

B03 does not start from zero.

The current Book branch already owns the canonical parent authority for versioned `CANON_MANIFEST` and `STORY_BIBLE` governed objects. `canonical-parent-v2-core.js` carries their collections and active pointers, and `content-object-admission-core.js` can admit immutable versioned Story Bible objects with exact digest/provenance/predecessor/currentness controls. That is the current canonical object authority.

What is not yet proven current is the detailed semantic knowledge model inside a Story Bible/canon object. The current Book runtime does not yet prove a Book-owned semantic layer for entities, events, chronology, causal/goal relations, character knowledge, relationship state, arcs, setup/payoff, promises, motifs, themes and open questions with B03-specific persistence and interfaces.

Historical `literary-prose-engine-001` contains substantial executable donor code. `BOOK-INTELLIGENCE-NARRATIVE-STATE-001` implemented anchors, entities, events, story/discourse temporal relations, causal/goal relations, knowledge/belief/perception/focalization claims, provenance/confidence, ambiguity and invalidation. Its materializer implemented exact-source-bound candidate admission. `BOOK-INTELLIGENCE-NARRATIVE-ORCHESTRATION-001` implemented narrative functions, setup/payoff, open questions and character/relationship/plot/motif/idea arcs. Historical qualification recorded 31/31 representation fixtures, 65/65 cumulative narrative-state fixtures and 41/41 orchestration fixtures on their historical exact subjects. These are real archaeological implementation/evidence inputs, but historical PASS transfer into B03 is zero.

The reconstructed B01 registry also contains `BOOK.LITERARY.BUILD_NARRATIVE_STATE` as a provider-backed literary narrative-analysis projection. Its provider subject is unadmitted and the binding grants no canonical-write authority. It can become evidence/projection input only; it cannot become canonical Story Bible truth by provider success.

B02 supplies another input boundary: `existing-book-recovery.js` emits source-bound `STORY_BIBLE` semantic candidates with standing `PROPOSED_NOT_CANONICAL`. B03 must preserve that proposal boundary. Source recovery cannot directly populate current canon.

Therefore the central B03 problem is not invention from scratch. It is controlled reconciliation: migrate/adapt the useful historical semantic machinery beneath the current Book-owned Story Bible/Canon authority, fill explicitly recovered semantic gaps, define current persistence/reachability, and preserve B00-B02 admission/currentness/provenance fences.

## Atomic lossless B03 trace ledger

| # | Atomic B03 requirement | Current / target owner | Truth class | Durable state | Interface / contract | Reachable runtime path | Test / evidence class | Exact blocker / finding |
|---|---|---|---|---|---|---|---|---|
| B03-01 | Canon Manifest stable identity/version | BOOK | BOOK-BRANCH-BUILT | `canon_manifests[]`, active ref | B00 canonical parent/admission | Current Book canonical runtime | B00 frozen | Detailed B03 canon semantics not defined here |
| B03-02 | Story Bible stable identity/version | BOOK | BOOK-BRANCH-BUILT | `story_bibles[]`, active ref | B00 canonical parent/admission | Current Book canonical runtime | B00 frozen | Semantic body is not B03-specialized yet |
| B03-03 | Story Bible immutable version admission/CAS/provenance | BOOK | BOOK-BRANCH-BUILT | version lineage + digest/provenance | `content-object-admission-core.js` | Current Book module | B00 frozen | Generic payload admission, not detailed semantic validator |
| B03-04 | Detailed Story Bible semantic schema | BOOK | HISTORICAL-BOOK-CODE + DESIGNED-NOT-INSTALLED | historical narrative-state/orchestration structures | historical contracts | Historical only | historical hosted | Must be reconciled into current Book authority |
| B03-05 | Exact manuscript/source binding for knowledge state | BOOK | HISTORICAL-BOOK-CODE + BOOK-BRANCH-BUILT dependencies | source/document digest refs | historical materializer + B00/B02 identity laws | Split across historical/current | historical deterministic + B00/B02 | Current B03 composition absent |
| B03-06 | Nonreconstructive source anchors | BOOK | HISTORICAL-BOOK-CODE | chapter/ordinal/token/span digest IDs | Narrative State contract | Historical only | 31/31 historical | Must rebind to current source/projection identities |
| B03-07 | Entity identity and types | BOOK | HISTORICAL-BOOK-CODE | entity records | Narrative State contract | Historical only | 31/31 historical | Current B03 runtime absent |
| B03-08 | Entity provenance/source anchors | BOOK | HISTORICAL-BOOK-CODE | entity anchor refs | Narrative State | Historical only | historical | Current B03 persistence absent |
| B03-09 | Entity state/change representation | BOOK | HISTORICAL-BOOK-CODE partial + DESIGNED-NOT-INSTALLED | optional event state-change tags, entity refs | Narrative State | Historical partial | historical | First-class entity-state semantics not proven |
| B03-10 | Event identity | BOOK | HISTORICAL-BOOK-CODE | event records | Narrative State | Historical only | 31/31 historical | Current B03 runtime absent |
| B03-11 | Event participant linkage | BOOK | HISTORICAL-BOOK-CODE | participant entity IDs | Narrative State | Historical only | historical | Current B03 runtime absent |
| B03-12 | Event state-change tags | BOOK | HISTORICAL-BOOK-CODE | optional tags | Narrative State | Historical only | historical | Rich state transition semantics not proven |
| B03-13 | Event goal tags | BOOK | HISTORICAL-BOOK-CODE | optional goal tags | Narrative State | Historical only | historical | Current B03 runtime absent |
| B03-14 | Repeated-event/event-family identity | BOOK | HISTORICAL-BOOK-CODE | event family + SAME_STORY_EVENT | Narrative State | Historical only | historical | Current B03 runtime absent |
| B03-15 | Story-time before/after/overlap | BOOK | HISTORICAL-BOOK-CODE | temporal claims | Narrative State | Historical only | historical | Current B03 runtime absent |
| B03-16 | Discourse order separate from story time | BOOK | HISTORICAL-BOOK-CODE | `DISCOURSE_PRECEDES` | Narrative State | Historical only | historical | Current B03 runtime absent |
| B03-17 | Repeated narration of same story event | BOOK | HISTORICAL-BOOK-CODE | `SAME_STORY_EVENT` | Narrative State | Historical only | historical | Current B03 runtime absent |
| B03-18 | Ambiguous/alternative chronology | BOOK | HISTORICAL-BOOK-CODE | ASSERTED/ALTERNATIVE/UNRESOLVED/INVALIDATED | Narrative State | Historical only | historical | Must preserve ambiguity in migration |
| B03-19 | Explicit narrative duration model | BOOK | DESIGNED-NOT-INSTALLED | none proven | historical BIGAP-001 requirement | None current | gap evidence | Duration semantics remain unimplemented/unadjudicated |
| B03-20 | Explicit narrative frequency/recurrence model | BOOK | DESIGNED-NOT-INSTALLED | none proven beyond repeated-event identity | historical BIGAP-001 | None current | gap evidence | Frequency semantics remain unimplemented/unadjudicated |
| B03-21 | Causal `CAUSES` relation | BOOK | HISTORICAL-BOOK-CODE | provenance-bearing claim | Narrative State | Historical only | historical | Current B03 runtime absent |
| B03-22 | `ENABLES` / `PREVENTS` relations | BOOK | HISTORICAL-BOOK-CODE | provenance-bearing claims | Narrative State | Historical only | historical | Current B03 runtime absent |
| B03-23 | Goal-support relation | BOOK | HISTORICAL-BOOK-CODE | `GOAL_SUPPORTS` | Narrative State | Historical only | historical | Current B03 runtime absent |
| B03-24 | Preconditions/consequences/world-state transitions | BOOK | HISTORICAL-BOOK-CODE partial + DESIGNED-NOT-INSTALLED | causal/state-change evidence | historical gap register | Partial historical | gap evidence | First-class world-state model not proven |
| B03-25 | Character `KNOWS` state | BOOK | HISTORICAL-BOOK-CODE | claim | Narrative State | Historical only | historical | Keep separate from later reader state |
| B03-26 | Character `BELIEVES` state | BOOK | HISTORICAL-BOOK-CODE | claim | Narrative State | Historical only | historical | Keep separate from later reader state |
| B03-27 | Character `PERCEIVES` state | BOOK | HISTORICAL-BOOK-CODE | claim | Narrative State | Historical only | historical | Current B03 runtime absent |
| B03-28 | Focalization state | BOOK | HISTORICAL-BOOK-CODE | `FOCALIZES` claim | Narrative State | Historical only | historical | Current B03 runtime absent |
| B03-29 | Knowledge/exposure temporal compatibility | BOOK | HISTORICAL-BOOK-CODE | rule over knowledge + evidence | Narrative State | Historical only | historical | Current B03 runtime absent |
| B03-30 | Relationship identity/state | BOOK | HISTORICAL-BOOK-CODE partial + DESIGNED-NOT-INSTALLED | relationship arc subjects only | Orchestration + BIGAP-002 | Historical partial | historical/gap | No first-class relationship-state object proven |
| B03-31 | Character arcs | BOOK | HISTORICAL-BOOK-CODE | arc objects/beats | Narrative Orchestration | Historical only | 41/41 historical | Current B03 runtime absent |
| B03-32 | Relationship arcs | BOOK | HISTORICAL-BOOK-CODE | arc objects/beats | Narrative Orchestration | Historical only | historical | Current B03 runtime absent |
| B03-33 | Plot arcs | BOOK | HISTORICAL-BOOK-CODE | arc objects/beats | Narrative Orchestration | Historical only | historical | Current B03 runtime absent |
| B03-34 | Motif arcs | BOOK | HISTORICAL-BOOK-CODE | arc objects/beats | Narrative Orchestration | Historical only | historical | Current B03 runtime absent |
| B03-35 | Idea/theme-adjacent arcs | BOOK | HISTORICAL-BOOK-CODE partial | IDEA arcs | Narrative Orchestration | Historical only | historical | IDEA is not yet adjudicated as full theme semantics |
| B03-36 | Explicit theme/subtext state | BOOK | DESIGNED-NOT-INSTALLED | none first-class proven | BIGAP-003/reconstruction domain | None current | gap evidence | Must avoid duplicating later literary evaluation |
| B03-37 | Narrative-function assignments | BOOK | HISTORICAL-BOOK-CODE | function hypotheses | Narrative Orchestration | Historical only | 41/41 historical | Descriptive only; not quality/template authority |
| B03-38 | Setup/payoff lifecycle | BOOK | HISTORICAL-BOOK-CODE | setup/payoff links | Narrative Orchestration | Historical only | historical | Current B03 runtime absent |
| B03-39 | First-class promise identity/lifecycle | BOOK | HISTORICAL-BOOK-CODE partial + DESIGNED-NOT-INSTALLED | setup/payoff/open-question analogues | BIGAP-003 | Partial historical | gap evidence | Promise semantics require adjudication |
| B03-40 | Open-question lifecycle | BOOK | HISTORICAL-BOOK-CODE | open/partial/closed/intentionally unresolved | Narrative Orchestration | Historical only | historical | Current B03 runtime absent |
| B03-41 | Intentionally unresolved narrative state | BOOK | HISTORICAL-BOOK-CODE | explicit statuses | Narrative State/Orchestration | Historical only | historical | Must not force closure in migration |
| B03-42 | Arc beat lifecycle/reopen/payoff/close | BOOK | HISTORICAL-BOOK-CODE | beat roles + arc status | Narrative Orchestration | Historical only | historical | Current B03 runtime absent |
| B03-43 | Provenance/confidence/status on knowledge claims | BOOK | HISTORICAL-BOOK-CODE | claim provenance/confidence/status | Narrative State | Historical only | historical | Must bind to current B00/B02 evidence identities |
| B03-44 | Anchor-change invalidation | BOOK | HISTORICAL-BOOK-CODE | invalidation candidates | Narrative State | Historical only | historical | Current B03 invalidation integration absent |
| B03-45 | Dependent orchestration invalidation | BOOK | HISTORICAL-BOOK-CODE | dependent object invalidation | Narrative Orchestration | Historical only | historical | Current B03 invalidation integration absent |
| B03-46 | Candidate evidence/materialization admission | BOOK | HISTORICAL-BOOK-CODE | VERIFIED/OBSERVED/INFERRED/CONTESTED | Materialization contract | Historical only | 65/65 historical | Must be rebound under current canonical admission topology |
| B03-47 | Conflict/contest preservation without forced winner | BOOK | HISTORICAL-BOOK-CODE | alternative/unresolved claims | Materializer | Historical only | historical | Required invariant for migration |
| B03-48 | Duplicate merge without confidence vote inflation | BOOK | HISTORICAL-BOOK-CODE | merged provenance | Materializer | Historical only | historical | Current B03 runtime absent |
| B03-49 | B02 recovered Story Bible candidates as proposal input | BOOK | BOOK-BRANCH-BUILT | `STORY_BIBLE` proposals, `PROPOSED_NOT_CANONICAL` | `existing-book-recovery.js` | Current B02 runtime | B02 frozen mechanics | No direct promotion to canon allowed |
| B03-50 | Provider narrative-state projection input | BOOK owns acceptance; provider supplies projection | BOOK-BRANCH-BUILT binding + EXTERNAL-REQUIRED provider subject | provider result/evidence refs | `BOOK.LITERARY.BUILD_NARRATIVE_STATE` | Binding exists; provider subject unadmitted | B01 frozen binding mechanics | Provider success grants no canon authority |
| B03-51 | Canon consistency check surface | BOOK | DESIGNED-NOT-INSTALLED current; historical declaration | evidence/projection | historical `CANON.CONSISTENCY_CHECK` | No current callable B03 path proven | archaeological contract only | Old `STORY_BIBLE_CANON` owner label is not current authority |
| B03-52 | Continuity check surface | BOOK | DESIGNED-NOT-INSTALLED current; historical declaration | continuity evidence | historical `CONTINUITY.CHECK` | No current callable B03 path proven | archaeological contract only | Must be reconciled into B03/B04/B09 boundaries |
| B03-53 | Detailed B03 graph/state persistence under current Book versions | BOOK | DESIGNED-NOT-INSTALLED | generic Story Bible payload can persist; semantic store not proven | B00 admission + future B03 contract | Generic only | B00 mechanics only | Persistence topology requires B03-B decision |
| B03-54 | Current B03 commands/queries/runtime reachability | BOOK | DESIGNED-NOT-INSTALLED | none B03-specific proven | future B03 interface | None current | none current | Must not mutate frozen B01 registry silently |
| B03-55 | Current B03 isolated qualification denominator | BOOK | DESIGNED-NOT-INSTALLED | future evidence | future design lock | None | none | Denominator belongs later design-lock stage |
| B03-56 | Entity/event/temporal/causal extraction accuracy | BOOK acceptance + model/provider calibration | EXTERNAL-REQUIRED | calibration evidence | future extractor/provider boundary | Not proven | MODEL/BEHAVIORAL | Historical code explicitly did not prove extractor accuracy |
| B03-57 | Arc/function/setup-payoff inference accuracy | BOOK acceptance + model/provider calibration | EXTERNAL-REQUIRED | calibration evidence | future inference boundary | Not proven | MODEL/BEHAVIORAL | Representation PASS is not inference PASS |
| B03-58 | Real-book/long-form knowledge-model validation | BOOK + admissible evidence environment | EXTERNAL-REQUIRED | real-book calibration set/results | future qualification | Not proven | REAL-BOOK/LONG-FORM | Synthetic fixtures cannot establish literary/semantic reliability |
| B03-59 | Human/author adjudication for genuinely contested canon | AUTHOR/BOOK authority | EXTERNAL-REQUIRED | author decision/evidence | B00 author authority + future B03 admission | Human-gated | HUMAN/AUTHOR | Cannot be synthesized from confidence/model vote |
| B03-60 | B00-B02 authority preservation / no second canonical aggregate | BOOK | BOOK-BRANCH-BUILT invariant | canonical parent + exact source/projection identities | B00-B02 frozen contracts | Current Book substrate | frozen cumulative evidence | B03 must compose beneath these authorities, not replace them |

## Duplicate-truth and historical-provenance findings

1. Current B00 Story Bible/Canon identity and historical `CANONICAL_NARRATIVE_STATE` are not admitted as two canonical stores. The historical semantic implementation is a donor to be reconciled beneath the current Book parent authority.
2. Historical `PROSE.BUILD_NARRATIVE_STATE` and reconstructed `BOOK.LITERARY.BUILD_NARRATIVE_STATE` are narrative-analysis projection paths only. They have no canonical-write authority and cannot self-promote a projection into Story Bible truth.
3. Historical `CANON.CONSISTENCY_CHECK` and `CONTINUITY.CHECK` declarations prove a required capability surface existed in prior architecture, but no current callable B03 implementation is proven by those declarations.
4. B02 `story_bible_candidates` are deliberately `PROPOSED_NOT_CANONICAL`. Recovery evidence is input to B03 adjudication/materialization, never an automatic canonical Story Bible update.
5. Historical deterministic PASS is retained as archaeological evidence only: Narrative State representation 31/31, Narrative State representation+materialization 65/65, Narrative Orchestration 41/41. Historical PASS transferred to B03 = 0.
6. PCE013 reader knowledge/belief and reader-experience state belongs the later B04 Reader Intelligence domain. It must not be confused with B03 manuscript/character knowledge truth.
7. Recovered but not yet solved semantic gaps are now accounted rather than hidden: narrative duration/frequency, richer relationship/world-state semantics, explicit theme/subtext semantics, first-class promise semantics, current B03 persistence/reachability, and extraction/inference calibration.

## Installed / reachable / tested truth

### CURRENT BOOK AUTHORITY
- B00 provides current Book-owned Canon Manifest and Story Bible governed-object identity, immutable versions, active pointers and admission/version/provenance authority.
- B01 provides execution/provenance machinery and a noncanonical `BOOK.LITERARY.BUILD_NARRATIVE_STATE` provider binding with no provider subject standing.
- B02 provides exact source/projection identity and noncanonical recovered Story Bible candidate inputs.

### HISTORICAL EXECUTABLE DONORS
- Narrative State representation/validator: real Python code on `literary-prose-engine-001`.
- Narrative State materializer: real Python code on `literary-prose-engine-001`.
- Narrative Orchestration representation/validator: real Python code on `literary-prose-engine-001`.

### CURRENT B03 IMPLEMENTATION
- Generic Story Bible version/admission mechanics are real current Book code.
- A current Book-owned detailed B03 semantic graph/materializer/orchestration runtime is not yet proven installed or reachable.
- No B03-A runtime code is created by this inventory.

### TESTED / QUALIFIED / CALIBRATED
- Historical representation/materialization/orchestration mechanics have exact-subject hosted qualification evidence, but no historical PASS transfers.
- Current B00-B02 frozen qualification remains intact because B03-A changes no runtime semantics.
- B03 current isolated/cumulative qualification has not begun and is not claimed.
- Extraction/inference accuracy, real-book behavior, human/author adjudication, private-source standing, production and A-01 remain unproved where applicable.

## B00-B02 invariant check

B03-A archaeology found no contradiction requiring an earlier frozen domain to reopen.

Mandatory preserved invariants are:

- B00 canonical parent/admission/version authority remains the terminal canonical object-mutation boundary;
- B03 domain semantics must live beneath or inside the governed Book Story Bible/Canon model rather than create a second top-level canonical aggregate;
- B01 current Book capability identity/execution laws remain controlling; historical `PROSE.*` identity cannot become current ownership;
- provider/model success is evidence/projection only and cannot grant canonical-write authority;
- B02 exact source/projection identities and `PROPOSED_NOT_CANONICAL` recovery boundary remain intact;
- raw/private manuscript text may not be silently duplicated into workflow/knowledge coordination state;
- ambiguous or contested narrative interpretation remains explicit rather than machine-normalized into invented canon;
- author authority remains required where genuinely contested interpretation becomes canonical Book truth;
- historical PASS is evidence only and cannot transfer to changed current bytes/contracts;
- private/native/external/production/publication/A-01 evidence gaps remain blockers rather than synthetic PASS.

## Archaeology accounting

- Atomic B03-A requirements inventoried: **60**
- Atomic requirements with an explicit current/historical/designed/external disposition: **60 / 60**
- Current Book-owned authoritative object/admission families relevant to B03: **Canon Manifest + Story Bible**
- Historical executable semantic donor families: **2** (`Narrative State`, `Narrative Orchestration`; materialization is a qualified Narrative State stage)
- Historical deterministic qualification retained: **31/31 representation; 65/65 narrative-state cumulative; 41/41 orchestration**
- Historical PASS transferred: **0**
- Earlier frozen domains reopened: **0**
- B03 design decisions made by this artifact: **0**
- B03 runtime implementation changes made by this artifact: **0**
- Unaccounted B03-A archaeology requirements: **0**

B03-A therefore closes as recovery/inventory only. Gaps are accounted even when implementation or calibration remains absent; `unaccounted requirements = 0` does not mean `implemented = 60` or `qualified = 60`.

## Exactly one dependency-valid successor

`BOOK-RECONSTRUCTION-B03-B — CANONICAL BOOK KNOWLEDGE MODEL ANALYSIS / ADJUDICATION`

B03-B is the sole admitted successor.

It must analyze and adjudicate the 60-item inventory without redesigning from scratch. At minimum it must:

1. reconcile current B00 Story Bible/Canon object authority with the historical Narrative State and Narrative Orchestration implementation donors;
2. decide the exact current B03 semantic schema and persistence topology while preventing a second canonical aggregate;
3. classify each historical donor behavior as KEEP-AS-IS, KEEP-BUT-REFACTOR, MIGRATE-INTO-BOOK, MERGE, REPLACE, BUILD, DELEGATE or REMOVE, with rationale;
4. resolve the historical `CANONICAL_NARRATIVE_STATE` naming/authority collision under current `SYSTEM_MASTER/BOOK` ownership;
5. adjudicate first-class versus derived semantics for narrative duration/frequency, relationship/world state, theme/subtext and promise/payoff without stealing B04 reader-intelligence or B09 whole-book-evaluation responsibility;
6. define the B02 recovered-candidate -> B03 evidence/materialization -> governed Story Bible/Canon admission boundary;
7. define the role of `BOOK.LITERARY.BUILD_NARRATIVE_STATE` as provider projection/evidence versus Book-owned deterministic acceptance/materialization;
8. define invalidation/currentness behavior from changed manuscript/source anchors through B03 dependents;
9. identify any external-research question only where external evidence can materially alter an unresolved B03 design decision; do not insert broad research theater;
10. reach unresolved B03 ownership/interface/persistence/admission decisions = 0 before B03 design-lock/build is admitted.

B03-B may not synthesize canon, transfer historical qualification, reactivate Prose ownership, mutate B00-B02 frozen authority silently, or treat provider/model confidence as author/canonical truth.