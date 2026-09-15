# BOOK-RECONSTRUCTION-B05-B — LITERARY / CRAFT INTELLIGENCE ANALYSIS + ARCHITECTURE OPTION ADJUDICATION 001

Date: 2026-09-15
Owner: SYSTEM_MASTER/BOOK
Domain: BOOK-RECONSTRUCTION-B05 — LITERARY & CRAFT INTELLIGENCE
Predecessor: `BOOK-RECONSTRUCTION-B05-A2-LITERARY-CRAFT-CAPABILITY-SPECIALIST-OWNER-CENSUS-001`
Predecessor branch/head: `book-system/b05-a-literary-craft-recovery-v1@835fb2b45256958bb32ff99fb56b061e6e6b1f7f`
Frozen upstream boundary: `BOOK-RECONSTRUCTION-B04-F-CONTROL-FREEZE-001`
Standing: `ARCHITECTURE_SELECTED__BOOK_OWNED_BOUNDED_DIAGNOSTIC_EVIDENCE_LAYER__READY_FOR_B05_C_DESIGN_LOCK__NO_RUNTIME_ADMITTED__NONCANONICAL`
Canonical effect: NONE

## 1. Decision to make

B05 must recover the useful literary/craft intelligence of the historical Prose engine without recreating its retired topology, duplicating B02/B03/B04 truth, stealing B06/B07/B08/B09/B10 authority, or turning provider output into Book authority.

The selected architecture must support:

- bounded passage/scene/chapter literary analysis;
- strength-first and limitation/risk diagnosis;
- conditioned craft-intelligence retrieval;
- separable specialist/lens evidence;
- disagreement, abstention and blocked standing;
- bounded pre-revision opportunity adjudication;
- exact source/upstream/provider/currentness bindings;
- no replacement prose;
- no candidate winner/evaluation authority;
- no governing voice/preference authority;
- no universal prose score;
- no named-author imitation target;
- no canonical Book effect.

## 2. Architecture options analyzed

### Option A — resurrect historical monolithic Prose / `PASSAGE_STATE` engine

Description:

Reinstall the old Literary Prose engine as a single active domain that owns passage state, craft diagnosis, revision, evaluation, voice evolution, homogenization defense and preference learning.

Advantages:

- maximum direct reuse of historical semantics;
- fewer new interface seams;
- historical pipeline already demonstrated internal conceptual coherence.

Fatal defects:

1. reactivates or semantically recreates retired `/PROSE` ownership;
2. collapses the current B03/B04/B05/B06/B07/B08/B10 owner split;
3. risks a second Story Bible/reader/voice/author-intent state inside `PASSAGE_STATE`;
4. lets one subsystem diagnose, generate, evaluate and learn from its own output;
5. makes currentness ambiguous because multiple truths are copied into one literary object;
6. makes historical PASS look transferable even though current ownership/contracts changed;
7. conflicts with frozen B01 retired-identity law.

Disposition: **REJECT**.

### Option B — thin Book router; all literary semantics remain external/provider-owned

Description:

Keep B05 nearly stateless. Route `BOOK.LITERARY.*` calls to a provider and store only provider receipts/results.

Advantages:

- little Book-side code;
- easy provider substitution in theory;
- avoids reimplementing specialist algorithms.

Fatal defects:

1. provider identity risks becoming de facto authority;
2. no stable Book-owned diagnostic schema or evidence semantics;
3. no Book-owned specialist coverage/abstention/disagreement law;
4. no Book-owned currentness/invalidation relation to B02/B03/B04;
5. no stable distinction between diagnosis, revision, evaluation and voice standing;
6. provider-specific payload changes could silently change Book semantics;
7. weak offline/deterministic qualification surface;
8. makes downstream B06/B07/B08 contracts depend on provider-specific output shape.

Disposition: **REJECT**.

### Option C — Book-owned bounded diagnostic/evidence layer with registry-driven literary lenses and provider-neutral evidence acceptance

Description:

B05 owns a compact noncanonical semantic layer:

1. exact diagnostic context projection over frozen/current upstream identities;
2. a Book-owned diagnostic-lens registry and observation contract;
3. provider-neutral acceptance/sealing of diagnostic evidence;
4. conditioned Craft Intelligence records/retrieval over B02-admitted source provenance;
5. a bounded opportunity ledger/adjudicator;
6. exact B05 currentness/invalidation;
7. read-only query/runtime surface.

Providers may execute analysis, but B05 defines what may be accepted and what authority it has. B03/B04/B08/B10 data remain exact-bound inputs, not copied truth authority. B06/B07 remain downstream.

Advantages:

- preserves current Book ownership;
- provider-neutral and deterministic at the contract layer;
- isolates diagnosis from revision/evaluation/preference learning;
- permits reuse of historical specialist/Craft-Academy semantics without stale topology;
- exact currentness is composable;
- supports synthetic/deterministic qualification while keeping model/human/real-book calibration fences open;
- creates a stable interface for B06 and B07.

Risks requiring design lock:

- accidental duplication of B03/B04 fields;
- excessive context payload/raw-text persistence;
- diagnostic confidence being treated as calibration;
- craft retrieval becoming prestige ranking or named-author similarity;
- local diction/dialogue evidence leaking into B08 voice standing;
- B05 opportunity priority becoming a universal prose score;
- scope creep into global coherence/B09.

Disposition: **SELECT**.

### Option D — one independently owned runtime/service per historical specialist

Description:

Create many specialist services with separate schemas/currentness and aggregate them in B05.

Advantages:

- modular deployment;
- specialist-specific evolution.

Defects:

- unnecessary orchestration/state explosion before evidence justifies it;
- duplicated currentness and source binding across specialists;
- harder correlation/dependency accounting;
- encourages confidence inflation and divergent payload semantics;
- recreates provider/service topology inside Book rather than a bounded semantic layer.

Disposition: **REJECT AS B05 DOMAIN ARCHITECTURE**. Providers may internally use specialist modules, but Book sees one governed B05 evidence contract plus a registry of diagnostic lenses.

## 3. Selected architecture

**SELECTED: Option C — Book-owned bounded diagnostic/evidence layer with registry-driven literary lenses and provider-neutral evidence acceptance.**

Logical flow:

`B02 accepted source/projection identity`
+
`B03 canonical Story Bible/current truth refs`
+
`optional/current B04 reader evidence refs`
+
`optional/current B08 voice constraints`
+
`optional/current B10 author/editorial constraints`
+
`B05 literary task/scope`

→ `BookLiteraryDiagnosticContextV1`

→ deterministic or admitted-provider diagnostic execution

→ `BookLiteraryDiagnosticObservationV1` acceptance/sealing

+ conditioned `BookCraftIntelligenceRecordV1` retrieval

→ `BookLiteraryDiagnosisProjectionV1`

→ `BookLiteraryOpportunityLedgerV1`

→ B06 revision target evidence and/or B07 qualification evidence

Any consumed dependency drift

→ `BookLiteraryDiagnosticCurrentnessV1`

→ stale B05 projection/recompute boundary without mutating upstream owners.

All names remain candidates until B05-C design lock, but the ownership decomposition is selected.

## 4. Domain invariant: B05 is diagnosis, not prose generation

The most important selected boundary is:

> B05 may explain, diagnose, retrieve craft mechanisms, prioritize opportunities, abstain, block and expose evidence. B05 may not emit replacement manuscript prose or decide that a revision candidate is superior.

Therefore:

- no B05 field may contain a revision candidate as a semantic output;
- a provider returning replacement prose to a diagnostic operation must be rejected or stripped before durable acceptance;
- abstract craft transforms may exist as knowledge descriptions, but applying a transform to manuscript content belongs B06;
- original-vs-candidate comparative evaluation belongs B07;
- canonical mutation remains outside B05.

## 5. Diagnostic context architecture

`BookLiteraryDiagnosticContextV1` is selected as a **derived context projection**, not an authority object.

It should bind identities/digests rather than copy whole upstream models.

Required conceptual classes:

- Book project/source identity;
- bounded diagnostic scope identity/digest;
- exact source anchor refs/digests required for evidence locality;
- B02 source acceptance/projection ref/digest/currentness evidence;
- B03 Story Bible/knowledge ref/digest plus exact semantic dependency refs used by this diagnostic context;
- optional B04 exposure/understanding refs/digests plus exact dimension/lens evidence refs actually consumed;
- optional B08 voice/preference refs/digests if available and required by the requested diagnostic lenses;
- optional B10 author/editorial constraint refs/digests when explicit constraints exist or are required;
- literary task/purpose hypothesis with provenance and uncertainty, clearly distinct from explicit author intent;
- allowed diagnostic lens set;
- craft-intelligence retrieval policy ref/digest;
- currentness standing;
- `canonical_effect=false`.

No raw manuscript body is required in the durable context projection. Ephemeral execution may receive source text through an authorized source/provider channel, but durable B05 records bind stable source/anchor identities and derived evidence rather than duplicating manuscript payloads.

## 6. Diagnostic lens architecture

B05-C should freeze a Book-owned registry of diagnostic lenses rather than instantiate eighteen independently authoritative specialist services.

### 6.1 Sixteen B05 diagnostic coverage areas

The selected B05 registry must preserve coverage for the sixteen B05-direct/composed rows from A2:

1. sentence rhythm/syntax;
2. paragraph movement;
3. diction/register local craft;
4. POV/focalization/narrative-distance craft effect;
5. character goal/agency/continuity realization;
6. dialogue/subtext/local distinctiveness;
7. scene tension/causality craft effect;
8. pacing/compression/expansion craft effect;
9. information release/reader orientation craft effect;
10. description/sensory/imagery/metaphor/motif craft effect;
11. emotional progression craft effect;
12. exposition/argument;
13. theological/philosophical presentation craft;
14. historical-register craft;
15. opening/ending turns;
16. canon/protected-language constraint-check evidence.

B05-C may normalize labels, but it may not delete a recovered coverage area without an explicit adjudication and denominator impact.

### 6.2 Two external-owner evidence seams

Historical specialist areas 17 and 18 do not become B05 governing lenses:

- voice preservation/evolution → B08;
- homogenization/overoptimization standing → B08.

B05 may emit nonauthoritative local signals relevant to those owners, but B05-C must prevent those signals from being serialized as B08 standing.

## 7. Diagnostic observation architecture

`BookLiteraryDiagnosticObservationV1` should be immutable/content-addressed and bind one context plus one diagnostic lens.

Proposed finding classes:

- `STRENGTH`
- `LIMITATION`
- `RISK`
- `OPPORTUNITY_SUPPORT`
- `CONTRADICTION`
- `NO_FINDING`
- `ABSTAINED`
- `BLOCKED`

Required conceptual fields:

- context id/digest;
- lens id;
- finding class;
- bounded target/source-anchor refs;
- evidence refs;
- upstream dependency refs actually relied upon;
- source class (`DETERMINISTIC`, admitted `MODEL`, other governed classes only if later justified);
- provider subject/admission refs/digest where provider-produced;
- confidence/evidence-strength representation that is explicitly non-calibration and non-universal;
- purpose relevance;
- preservation risk evidence;
- collateral-risk evidence;
- contradictions/related observation refs;
- scope limits;
- abstention/blocker reason where applicable;
- no replacement prose;
- no evaluation winner;
- no voice standing;
- `canonical_effect=false`.

B05-C must decide whether confidence remains a nullable bounded scalar, an ordinal evidence-strength class, or a structured evidence envelope. It may not be interpreted as literary quality or calibration standing.

## 8. Craft Intelligence architecture

B05 owns conditioned craft intelligence over B02-admitted/provenanced sources.

`BookCraftIntelligenceRecordV1` should preserve at least:

- craft record id/digest;
- source/projection provenance refs and exact rights/custody standing refs from B02;
- mechanism;
- intended/observed reader or literary effect as an evidence claim, not universal law;
- conditions/applicability;
- counterconditions;
- failure modes;
- interactions;
- diagnostic signals;
- abstract revision-transform descriptions;
- genre/form/audience applicability;
- POV/distance applicability where relevant;
- evidence/provenance refs;
- uncertainty/confidence;
- task-fit standing;
- no named-author imitation target;
- no unauthorized source text;
- `canonical_effect=false`.

Retrieval must optimize task relevance and conditions, not prestige, author similarity, citation count or one universal quality score.

## 9. Opportunity ledger architecture

`BookLiteraryOpportunityLedgerV1` is selected as the pre-revision adjudication output.

It should:

- group observations that point to the same underlying opportunity;
- preserve contributing and contradicting observation refs;
- preserve upstream owner blockers;
- prevent correlated evidence from being counted as independent confirmation;
- surface strengths relevant to preservation;
- permit `NO_ACTION`;
- produce bounded, ordered opportunity records;
- carry purpose relevance, expected impact hypothesis, evidence strength, preservation/voice/collateral risk and scope recommendation;
- never emit replacement prose;
- never claim candidate superiority;
- never become a universal prose-quality score.

### Cardinality decision

Historical `max-three` opportunity output is useful but is not frozen here.

B05-C must select one of:

- exact hard maximum 3;
- default 3 with a small hard upper cap under explicit task policy;
- another bounded rule with adversarial justification.

Unbounded opportunity lists are rejected.

## 10. Currentness and invalidation architecture

B05 currentness must be **dependency selective**.

A B05 diagnostic artifact becomes stale only when a dependency it actually consumed changes.

Dependency classes:

1. B02 source acceptance/projection/custody/rights identity;
2. B03 Story Bible/knowledge/semantic dependency identities;
3. B04 reader exposure/understanding/dimension/lens evidence if consumed;
4. B05 craft record/retrieval-policy identity;
5. B01 provider subject/admission evidence for provider-produced observations;
6. B08 voice/preference evidence if consumed;
7. B10 author/editorial constraint evidence if consumed;
8. diagnostic scope/source-anchor identity.

Currentness must distinguish at least:

- context stale → dependent observations/diagnosis/opportunity ledger stale;
- one craft-record stale → only artifacts consuming that record stale;
- one optional B04/B08/B10 dependency stale → only artifacts consuming it stale;
- a new unrelated upstream record → no false invalidation.

B05 currentness may consume upstream invalidation/currentness evidence but may not mutate upstream state.

## 11. Provider architecture

The current Book capability identity and provider implementation identity remain separate.

A provider-produced B05 observation requires:

- current Book-owned capability contract;
- exact provider subject ref;
- exact provider admission ref/digest/currentness;
- exact diagnostic context id/digest;
- exact operation/task identity where dispatched through B01 execution foundation;
- evidence refs sufficient for accepted standing;
- no provider canonical/author/publication authority.

Unadmitted providers may be represented as definitions/provenance but cannot create current executable-provider standing.

Provider-specific payloads must be normalized into the B05 observation contract before they become durable B05 evidence.

## 12. Raw-text / privacy / custody decision

Selected law:

- B05 durable context, observation, craft retrieval and opportunity records do not duplicate raw manuscript/full source text;
- source anchors/refs/digests identify the evidence location;
- ephemeral execution may access text only through an authorized source/provider mechanism consistent with B02/private-source standing;
- credentials, secrets, hidden reasoning/chain-of-thought and publication credentials are forbidden in B05 durable records;
- retrieved craft intelligence returns conditioned derived records/provenance, not unauthorized source passages.

B05-C must freeze exact forbidden-field and allowed-excerpt behavior if any excerpts are necessary for user-visible diagnostic explanation.

## 13. Score/optimization decision

Rejected:

- one `prose_score`;
- one `quality_score` controlling diagnosis;
- prestige ranking;
- named-author similarity score;
- average specialist score;
- unqualified sum of confidence values;
- one target whose optimization can erase voice, ambiguity, irregularity or task-specific intent.

Allowed:

- bounded evidence confidence/strength tied to one observation;
- purpose relevance;
- risk classes;
- opportunity triage under explicit multi-factor conditions;
- uncertainty and disagreement.

Any scalar used internally for deterministic sorting must be non-authoritative, reproducible, bounded, and never exposed as universal literary quality standing.

## 14. Candidate command surface for B05-C

B05-C should design-lock a minimal Book-internal command set around:

1. `BuildLiteraryDiagnosticContextV1`
2. `AcceptLiteraryDiagnosticObservationV1`
3. `AssembleLiteraryDiagnosisV1`
4. `AcceptCraftIntelligenceRecordV1`
5. `ComputeLiteraryDiagnosticInvalidationV1`

`RetrieveCraftIntelligenceV1` may be a read-only query if retrieval has no side effect; B05-C must lock this interface direction.

No B05 command may generate candidate prose, perform independent candidate evaluation, set governing voice preference, make author decisions, canonically admit content, export or publish.

## 15. Candidate read-only query surface for B05-C

At minimum analyze/freeze:

1. `GetLiteraryDiagnosticContextV1`
2. `GetLiteraryDiagnosisV1`
3. `GetLiteraryLensEvidenceV1`
4. `GetLiteraryOpportunityLedgerV1`
5. `RetrieveCraftIntelligenceV1`
6. `GetLiteraryDiagnosticCurrentnessV1`

Queries must fail closed or explicitly expose stale standing rather than returning stale evidence as current.

## 16. Candidate standing model

B05-C should design-lock separate standings for context, observation, assembled diagnosis, opportunity and currentness rather than overload one status field.

Minimum semantic states that must be representable somewhere in the contracts:

- `READY_FOR_DIAGNOSIS`
- `PARTIALLY_OBSERVED`
- `DIAGNOSED`
- `NO_ACTION`
- `ABSTAINED`
- `BLOCKED_NEEDS_CONTEXT`
- `BLOCKED_OWNER_CONSTRAINT`
- `BLOCKED_PROVIDER_UNADMITTED`
- `BLOCKED_STALE`
- `BLOCKED_INVALID`

These names are not yet frozen; semantics are.

## 17. Candidate fail-closed error taxonomy

B05-C should cover at least these error classes:

- `BLOCKED_SOURCE_BINDING_MISMATCH`
- `BLOCKED_SOURCE_CURRENTNESS_REQUIRED`
- `BLOCKED_STORY_BIBLE_CURRENTNESS_REQUIRED`
- `BLOCKED_READER_EVIDENCE_STALE`
- `BLOCKED_VOICE_EVIDENCE_STALE`
- `BLOCKED_AUTHOR_CONSTRAINT_STALE`
- `BLOCKED_CRAFT_SOURCE_UNADMITTED`
- `BLOCKED_CRAFT_TASK_FIT_UNRESOLVED`
- `BLOCKED_PROVIDER_SUBJECT_UNADMITTED`
- `BLOCKED_DIAGNOSTIC_SCOPE_INVALID`
- `BLOCKED_DIAGNOSTIC_LENS_UNKNOWN`
- `BLOCKED_OBSERVATION_BINDING_MISMATCH`
- `BLOCKED_OBSERVATION_STALE`
- `BLOCKED_REWRITE_PAYLOAD_FORBIDDEN`
- `BLOCKED_EVALUATION_AUTHORITY_FORBIDDEN`
- `BLOCKED_VOICE_STANDING_FORBIDDEN`
- `BLOCKED_UNIVERSAL_PROSE_SCORE_FORBIDDEN`
- `BLOCKED_NAMED_AUTHOR_TARGET_FORBIDDEN`
- `BLOCKED_RAW_TEXT_FORBIDDEN`
- `BLOCKED_CONFLICT_UNRESOLVED`
- `BLOCKED_DIGEST_MISMATCH`
- `BLOCKED_CURRENTNESS_REQUIRED`
- `BLOCKED_CANONICAL_EFFECT_FORBIDDEN`

B05-C may normalize labels but cannot weaken the represented failure semantics.

## 18. External calibration / environment fences

The following must remain outside deterministic B05 PASS unless fresh exact evidence exists:

1. `MODEL_LITERARY_SPECIALIST_CALIBRATION_REQUIRED`
2. `HUMAN_EDITOR_ALIGNMENT_REQUIRED`
3. `REAL_BOOK_DIAGNOSTIC_CALIBRATION_REQUIRED`
4. `CROSS_GENRE_GENERALIZATION_REQUIRED`
5. `PROVIDER_SUBJECT_ADMISSION_REQUIRED`
6. `PRIVATE_MANUSCRIPT_ENVIRONMENT_REQUIRED`

Additionally, when theological, historical or other factual-domain diagnostics depend on truth claims, B05 must bind an appropriate upstream factual/canonical evidence source. Literary diagnosis alone may not certify factual correctness.

## 19. Proposed deterministic qualification denominator

B05-C should freeze a denominator no smaller than the following **proposed 152-case structure** unless it documents a lossless alternative with equal or stronger coverage before implementation:

- **C01-C24 — Diagnostic Context / Scope / Upstream Binding**: 24
- **S01-S36 — Specialist/Lens Coverage + Standing**: 36
  - designed to support at least two adversarial/positive obligations for each of the 18 recovered coverage rows/seams;
- **K01-K20 — Craft Intelligence / Rights / Task-Fit / Retrieval**: 20
- **O01-O24 — Observation Assembly / Opportunity Adjudication / Disagreement / NO_ACTION**: 24
- **I01-I24 — Invalidation / Currentness / Query / Replay / Content Addressing**: 24
- **X01-X24 — Cross-Owner / Privacy / Authority / Provider / Anti-Score / Anti-Imitation Adversarial**: 24

**Proposed total: 152.**

This is a B-stage denominator proposal, not yet a frozen E-stage denominator. B05-C must enumerate exact case statements and freeze or explicitly strengthen it before B05-D implementation.

Denominator shrinkage after C lock must be forbidden.

## 20. Adversarial architecture review

The selected Option C survives the following attacks only if B05-C locks them explicitly:

### Attack: second Story Bible through diagnostic context
Mitigation: B03 semantic facts are exact refs/digests; B05 stores only derived diagnostic claims and dependency refs.

### Attack: second reader model through target-reader-effect fields
Mitigation: observed reader state is B04 evidence; B05 literary intent hypothesis is structurally distinct.

### Attack: B05 voice authority through diction/dialogue diagnosis
Mitigation: local craft observations cannot become B08 voice standing.

### Attack: B05 self-validates its own diagnostic quality
Mitigation: B07 owns independent evaluation/calibration; deterministic tests prove mechanics only.

### Attack: provider output becomes Book authority
Mitigation: Book-owned acceptance schema, exact admitted provider binding, content-addressed sealed evidence, no provider authority uplift.

### Attack: Craft Academy recreates rights ingestion
Mitigation: B02 source custody/rights standing required; B05 owns task fit/derived craft knowledge only.

### Attack: opportunity rank becomes universal prose score
Mitigation: bounded conditional triage, disagreement/risk/strength visibility, `NO_ACTION`, no universal aggregate.

### Attack: diagnostic system starts rewriting prose
Mitigation: explicit rewrite-payload rejection; B06 is sole revision intelligence owner.

### Attack: global structure leaks into B05
Mitigation: bounded diagnostic scope; distant/global coherence owner B09.

### Attack: stale upstream state yields confident diagnosis
Mitigation: dependency-selective currentness plus fail-closed current queries.

### Attack: historical Prose PASS transfers
Mitigation: historical evidence remains provenance; current B05 bytes require fresh isolated/cumulative qualification.

## 21. Selected implementation decomposition for B05-C to lock

B05-C should either lock or explicitly reject/refine this build decomposition:

- **D1 — diagnostic context + lens registry**
- **D2 — diagnostic observation acceptance/sealing + diagnosis assembly**
- **D3 — craft intelligence record acceptance/retrieval + opportunity adjudication**
- **D4 — currentness/invalidation + hardened queries/runtime reachability**
- **E — fixed isolated denominator + B00-B05 cumulative qualification/calibration accounting**
- **F — deterministic B05 control freeze**

This mirrors the successful reconstruction discipline used in B02-B04 while keeping B05's semantic layers independently testable.

## 22. Architecture decision ledger

| Question | Decision |
|---|---|
| active `/PROSE` owner restored? | NO |
| Book-owned B05 semantic layer? | YES |
| B03 truth duplicated? | NO |
| B04 reader truth duplicated? | NO |
| B08 voice standing duplicated? | NO |
| B10 author decision standing duplicated? | NO |
| replacement prose generated by B05? | NO |
| candidate winner selected by B05? | NO |
| craft knowledge/retrieval B05-owned? | YES, over B02-admitted provenance |
| provider-neutral observation acceptance? | YES |
| diagnostic lens registry Book-owned? | YES |
| disagreement/abstention/blocked/NO_ACTION first-class? | YES |
| universal prose score? | FORBIDDEN |
| named-author imitation target? | FORBIDDEN |
| dependency-selective currentness? | YES |
| raw manuscript duplication in durable B05 records? | FORBIDDEN BY DEFAULT |
| canonical effect? | NONE |
| historical PASS transfer? | 0 |
| proposed deterministic denominator | 152 |

## 23. Exactly one successor

`BOOK-RECONSTRUCTION-B05-C — LITERARY/CRAFT INTELLIGENCE DESIGN LOCK`

B05-C must freeze:

1. exact schemas and content-addressing rules;
2. exact diagnostic lens registry/coverage law;
3. exact source/upstream dependency binding rules;
4. exact context/observation/diagnosis/craft/opportunity/currentness standings;
5. exact command/query/runtime surface;
6. exact provider acceptance/admission evidence law;
7. raw-text/excerpt/privacy rules;
8. exact craft task-fit/retrieval law;
9. opportunity cardinality/adjudication law;
10. invalidation/currentness composition;
11. error taxonomy;
12. external calibration fences;
13. exact D1-D4 build order;
14. exact isolated qualification case list and immutable denominator;
15. cumulative B00-B05 qualification requirements;
16. reopen/change law.

No B05 runtime implementation is authorized before B05-C is committed.
