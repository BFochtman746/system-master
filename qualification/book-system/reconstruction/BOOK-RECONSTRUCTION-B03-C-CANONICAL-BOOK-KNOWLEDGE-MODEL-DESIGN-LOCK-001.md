# BOOK-RECONSTRUCTION-B03-C — CANONICAL BOOK KNOWLEDGE MODEL DESIGN LOCK 001

Date: 2026-09-12
Owner: SYSTEM_MASTER/BOOK
Parent Book head: `e0e6fea870d05827dc6e431b0b831f098afe09d2`
Predecessor: `BOOK-RECONSTRUCTION-B03-B — CANONICAL BOOK KNOWLEDGE MODEL ANALYSIS / ADJUDICATION 001`
Controlling blueprint: `qualification/book-system/reconstruction/BOOK-SYSTEM-RECONSTRUCTION-BLUEPRINT-001.md`
Standing: `DESIGN_LOCKED__B03_D1_SELECTED__ISOLATED_DENOMINATOR_108__UNRESOLVED_0__NO_IMPLEMENTATION_IN_THIS_ARTIFACT`
Canonical effect: NONE

## Scope and authority

This artifact freezes the exact B03 Canonical Book Knowledge Model contract before implementation. It does not build B03, mutate canonical Story Bible or Canon Manifest state, install historical literary code, transfer historical qualification, synthesize author decisions, claim model/extractor accuracy, claim real-book calibration, authorize publication, or claim production/A-01 standing.

B00 Foundation & Authority, B01 Execution Foundation, and B02 Source Intake & Existing-Book Recovery remain frozen. B03 composes beneath those authorities and does not reopen them.

B03-B adjudicated all 60 B03 requirements with zero unresolved ownership, placement, persistence, or admission decisions. This design lock converts those decisions into exact schema, identity, provenance, materialization, invalidation, persistence, admission, runtime, error, and proof contracts.

## Research decision

No separate external-research stage is inserted before build.

The remaining design questions are repository-owned authority and contract questions. External evidence is required later for model/provider extraction accuracy, inference reliability, real-book/long-form behavior, human/author adjudication, private-source standing, and production/A-01 where applicable. Those remain evidence classes or explicit blockers and do not define Book canonical authority.

## Locked end-to-end architecture

```text
accepted B00/B02 source + manuscript identities
    + B02 PROPOSED_NOT_CANONICAL Story Bible proposals
    + provider/model projection evidence
    + prior active Story Bible version when one exists
    -> BookStoryBibleKnowledgeCandidateV1 normalization
    -> BookKnowledgeCalibrationPolicyV1 application
    -> Book Story Bible knowledge materializer/validator
    -> MATERIALIZED_NOT_CANONICAL candidate + immutable receipt
    -> bounded provenance-based invalidation reconciliation
    -> optional AUTHOR adjudication only for definitive resolution of genuine contest
    -> PrepareStoryBibleKnowledgeAdmissionV1
    -> one atomic existing B00 content-admission mutation:
         REGISTER_CONTENT_OBJECT_VERSION(STORY_BIBLE)
         SET_ACTIVE_CONTENT_OBJECT_VERSION(STORY_BIBLE)
    -> immutable canonical Story Bible successor + B00 active pointer
```

No stage before the existing B00 content-admission mutation may create canonical Book truth.

There is exactly one canonical B03 semantic container: the governed immutable `STORY_BIBLE` object family. B03 does not create a second canonical narrative-state database, knowledge aggregate, or active-pointer authority.

## Responsibility lock

### B03 / SYSTEM_MASTER/BOOK owns

1. the current Story Bible knowledge schema and validator;
2. stable B03 semantic identity laws;
3. nonreconstructive semantic anchor acceptance;
4. entity, event, temporal, causal, bounded state, character-knowledge, relationship, arc, motif/theme, promise, setup/payoff, and open-question representation;
5. deterministic candidate normalization/materialization;
6. versioned calibration-policy acceptance and abstention behavior;
7. explicit ambiguity, alternative, unresolved, contested, and invalidated standing;
8. provenance dependency indexing and bounded transitive invalidation;
9. deterministic Story Bible graph/integrity checks;
10. immutable B03 materialization/invalidation/admission-preparation receipts;
11. preparation of the exact B00 Story Bible successor admission request;
12. bounded Book-owned B03 commands/queries and runtime reachability;
13. B03 isolated and B00-B03 cumulative proof criteria.

### B00 retains and B03 must not duplicate

1. Book/BookProject identity;
2. canonical parent authority;
3. governed `STORY_BIBLE` object identity/version family;
4. immutable object-version admission;
5. CAS/current-parent/version-ledger authority;
6. active Story Bible pointer mutation;
7. final author-decision registration/applicability authority;
8. rollback/history authority;
9. lifecycle, export, publication, and delivery authority.

### B01 retains and B03 must not duplicate

1. generic execution/workflow/concurrency/retry/idempotency/evidence laws;
2. the frozen 11-capability provider-binding registry;
3. provider routing/execution substrate.

B03 internal deterministic operations are Book domain operations. They are not silently added as provider capabilities to the frozen B01 registry.

### B02 retains

1. exact accepted source/projection identity;
2. source custody/rights/private-source acceptance evidence;
3. existing-book recovery semantics;
4. `PROPOSED_NOT_CANONICAL` recovered Story Bible proposal standing.

B02 recovery output is input evidence only. It never directly promotes B03 canon.

### External/model providers own

1. model/provider extraction execution;
2. provider-specific entity/event/relation/arc/theme/promise hypotheses;
3. provider confidence and model metadata;
4. provider-specific calibration evidence.

Provider output has no canonical-write, author-decision, Story Bible pointer, publication, or production authority.

### Delegated later domains

- **B04** owns reader state, information release, focalization/perspective interpretation, passage/scene purpose, narrative-function interpretation, pacing/attention/tension/comprehension.
- **B09** owns whole-book/distant-dependency semantic continuity/coherence/debt evaluation.

B03 supplies admitted knowledge facts and deterministic integrity results to those domains; neither B04 nor B09 directly mutates Story Bible canon.

## Contract 1 — BookStoryBibleKnowledgeV1

The semantic payload stored inside each governed `STORY_BIBLE` version uses:

`knowledge_schema_version = "BOOK_STORY_BIBLE_KNOWLEDGE_V1"`

Required top-level semantic fields:

```text
knowledge_schema_version
book_project_id
knowledge_candidate_id
knowledge_digest
prior_story_bible_ref              // null only for first Story Bible version
source_subject_refs[]
source_acceptance_refs[]
projection_refs[]
manuscript_refs[]
calibration_policy_ref
calibration_policy_digest
anchors[]
entities[]
events[]
temporal_claims[]
causal_goal_claims[]
state_assertions[]
character_knowledge_claims[]
relationships[]
arcs[]
motifs[]
themes[]
promises[]
setup_payoffs[]
open_questions[]
identity_lineage[]
standing
```

Allowed top-level `standing` values:

- `MATERIALIZED_NOT_CANONICAL`
- `READY_FOR_GOVERNED_ADMISSION`
- `BLOCKED_INVALID`
- `BLOCKED_STALE`
- `BLOCKED_AUTHORITY_REQUIRED`

The outer B00 `STORY_BIBLE` object version becomes canonical only after successful B00 admission. A canonical Story Bible may contain semantic records whose own epistemic standing remains `ALTERNATIVE`, `UNRESOLVED`, `CONTESTED`, or `INVALIDATED`. Canonical admission means the uncertainty representation is canonical; it does not convert uncertainty into fact.

### Knowledge digest law

`knowledge_digest = SHA-256(stable semantic JSON)` over all semantic fields except `knowledge_candidate_id`, `knowledge_digest`, mutable audit timestamps, UI labels, retry counters, and transport metadata.

`knowledge_candidate_id = "book-story-bible-knowledge-v1:" + knowledge_digest`.

Any change to admitted semantic content, exact source/manuscript/projection bindings, calibration-policy identity, standing, or provenance dependencies produces a new candidate identity.

## Stable semantic ID law

Every B03 record has one type-prefixed stable semantic ID. IDs are stable across Story Bible versions when they refer to the same semantic subject.

Allowed prefixes include:

```text
ANCHOR:
ENTITY:
EVENT:
TEMPORAL:
CAUSAL:
STATE:
KNOWLEDGE:
RELATIONSHIP:
ARC:
MOTIF:
THEME:
PROMISE:
SETUP_PAYOFF:
OPEN_QUESTION:
```

Rules:

1. existing IDs from the prior active Story Bible are preserved when the referent remains the same;
2. a new record ID is created from immutable creation identity `(book_project_id, record_kind, creation_operation_id, candidate_local_id)` and is not recomputed from mutable labels, names, confidence, or prose text;
3. changing a mutable property does not change the stable ID when the referent remains the same;
4. identity correction that changes the referent must not recycle the prior ID;
5. split/merge/supersession uses `identity_lineage[]` with `SUPERSEDES`, `MERGED_FROM`, or `SPLIT_FROM` relations so history remains explicit;
6. duplicate stable IDs of the same type in one Story Bible version fail closed;
7. cross-type refs always use a typed ID and must resolve in the same candidate/version or an explicitly admitted external identity namespace.

## Contract 2 — nonreconstructive anchor

Required anchor fields:

```text
anchor_id
source_acceptance_id
source_acceptance_digest
projection_id
projection_digest
manuscript_ref
unit_ref                         // nullable when source cannot provide admitted unit identity
ordinal
span_start                       // token/character/normalized offset as declared by projection contract
span_end
span_sha256
source_current
provenance_refs[]
```

Rules:

- `span_sha256` binds the normalized admitted span representation without storing raw manuscript text in B03 coordination state;
- `span_start <= span_end` and the offset scheme must be declared by the admitted projection identity;
- every anchor binds one exact accepted source/projection and one manuscript identity context;
- raw text, quoted text, full manuscript text, credentials, provider chain-of-thought, or private payload copies are forbidden in B03 knowledge coordination records;
- source/projection currentness failure makes dependent knowledge stale/invalidation-eligible.

## Contract 3 — semantic record model

Every semantic record contains at minimum:

```text
<typed_stable_id>
status
confidence                      // nullable only when record class is deterministic identity/container state
source_anchor_ids[]
provenance_refs[]
evidence_refs[]
depends_on_refs[]
```

Common epistemic status values are:

- `ASSERTED`
- `ALTERNATIVE`
- `UNRESOLVED`
- `CONTESTED`
- `INVALIDATED`

`ASSERTED` means the current admitted evidence/policy supports the claim as asserted within the Story Bible representation. It does not create author intent, publication authority, or literary-quality truth.

### Entity

```text
entity_id
entity_type = CHARACTER | PLACE | OBJECT | GROUP | ABSTRACT | OTHER
aliases[]
source_anchor_ids[]
state_assertion_ids[]
status
confidence
provenance_refs[]
evidence_refs[]
depends_on_refs[]
```

Aliases are descriptive metadata, not identity keys.

### Event

```text
event_id
event_family_id                 // nullable
participant_entity_ids[]
source_anchor_ids[]
state_change_ids[]
goal_relation_ids[]
status
confidence
provenance_refs[]
evidence_refs[]
depends_on_refs[]
```

Repeated narration may map multiple anchors/events to one admitted event family without erasing discourse-local evidence.

### Temporal claim

Allowed relation types:

- `STORY_TIME_BEFORE`
- `STORY_TIME_AFTER`
- `STORY_TIME_OVERLAPS`
- `SAME_STORY_EVENT`
- `DISCOURSE_PRECEDES`

Descriptive duration/frequency fields are first-class and nullable when unknown:

```text
duration {
  value
  unit
  lower_bound
  upper_bound
  precision = EXACT | APPROXIMATE | RANGE | UNKNOWN
}
frequency {
  count
  recurrence_class = ONCE | REPEATED | HABITUAL | ITERATIVE | UNKNOWN
  lower_bound
  upper_bound
}
```

Story time and discourse order are separate semantics. Ambiguity remains `ALTERNATIVE`/`UNRESOLVED`; B03 never invents one chronology to make the graph total.

### Causal/goal claim

Allowed relation types:

- `CAUSES`
- `ENABLES`
- `PREVENTS`
- `GOAL_SUPPORTS`
- `PRECONDITION_OF`
- `EFFECT_OF`

Each claim references exact subject/object typed IDs and provenance. B03 does not infer a missing causal edge merely to make a graph connected.

### State assertion

```text
state_assertion_id
subject_ref
predicate
value
valid_from_event_ref            // nullable
valid_to_event_ref              // nullable
change_event_refs[]
status
confidence
source_anchor_ids[]
provenance_refs[]
evidence_refs[]
depends_on_refs[]
```

This is a bounded evidence-bearing fact/change model, not a simulation engine. Unknown state stays unknown.

### Character knowledge claim

Allowed claim types:

- `KNOWS`
- `BELIEVES`
- `PERCEIVES`

Required fields bind a character entity, object/claim/event ref, exposure/evidence refs when known, temporal compatibility, status, confidence, and provenance.

`FOCALIZES` is not a B03 canonical claim type. Focalization/perspective interpretation is delegated to B04.

### Relationship

```text
relationship_id
participant_entity_ids[]
relationship_kind
state_assertion_ids[]
change_event_ids[]
status
confidence
source_anchor_ids[]
provenance_refs[]
evidence_refs[]
depends_on_refs[]
```

A relationship is first-class and is not reducible to a relationship arc.

### Arc

Allowed arc types:

- `CHARACTER`
- `RELATIONSHIP`
- `PLOT`
- `MOTIF`
- `THEME`
- `OTHER`

Required semantics:

```text
arc_id
arc_type
subject_refs[]
beats[] {
  beat_id
  event_refs[]
  role = INTRODUCE | DEVELOP | COMPLICATE | REVERSE | TRANSFORM | CALLBACK | PAYOFF | CLOSE | REOPEN | OTHER
  status
  confidence
  provenance_refs[]
}
status = ACTIVE | CLOSED | INTENTIONALLY_OPEN | INVALIDATED
source_anchor_ids[]
provenance_refs[]
evidence_refs[]
depends_on_refs[]
```

No universal plot beat is mandatory.

### Motif

A motif is a stable descriptive identity with occurrence/event/anchor refs, status, confidence, provenance, and dependencies. Motif frequency/pattern does not itself imply literary quality.

### Theme/subtext hypothesis

```text
theme_id
kind = THEME | IDEA | SUBTEXT
label
subject_refs[]
status
confidence
source_anchor_ids[]
provenance_refs[]
evidence_refs[]
depends_on_refs[]
```

Theme/subtext records are hypotheses. They may not encode author-intent certainty, literary-quality score, or revision instruction.

### Promise

```text
promise_id
introduced_event_refs[]
related_open_question_refs[]
related_setup_payoff_refs[]
resolution_event_refs[]
status = OPEN | PARTIAL | FULFILLED | INTENTIONALLY_UNRESOLVED | INVALIDATED
confidence
source_anchor_ids[]
provenance_refs[]
evidence_refs[]
depends_on_refs[]
```

B04 may model reader expectation generated by a promise; B03 owns the canonical promise identity/lifecycle record.

### Setup/payoff

```text
setup_payoff_id
setup_event_refs[]
payoff_event_refs[]
status = OPEN | PARTIAL | PAID_OFF | INTENTIONALLY_UNRESOLVED | INVALIDATED
confidence
source_anchor_ids[]
provenance_refs[]
evidence_refs[]
depends_on_refs[]
```

No synthetic payoff is created to satisfy a template.

### Open question

```text
open_question_id
introduced_event_refs[]
resolution_event_refs[]
reopened_event_refs[]
status = OPEN | PARTIAL | CLOSED | INTENTIONALLY_UNRESOLVED | INVALIDATED
confidence
source_anchor_ids[]
provenance_refs[]
evidence_refs[]
depends_on_refs[]
```

Intentional non-resolution is valid state, not an automatic defect.

## Contract 4 — BookKnowledgeCalibrationPolicyV1

Historical hard-coded global confidence floors are not canonical authority.

Every materialization operation binds an exact versioned policy:

```text
policy_schema_version = "BOOK_KNOWLEDGE_CALIBRATION_POLICY_V1"
policy_id
policy_version
policy_digest
provider_subject_scopes[]
rules[] {
  semantic_class
  admission_mode = DETERMINISTIC_ONLY | CALIBRATED_MODEL | AUTHOR_REQUIRED
  min_confidence                  // nullable when not applicable
  min_distinct_evidence_families
  allowed_support_statuses[]
  allowed_output_statuses[]
  calibration_evidence_refs[]
  abstain_when_uncalibrated
}
standing = ADMITTED | BLOCKED_UNCALIBRATED | SUPERSEDED
```

Policy digest covers all semantic policy fields.

Laws:

1. currentness/source/rights/authority failures override numeric confidence;
2. `CONTESTED` evidence cannot become one definitive `ASSERTED` winner solely because confidence is high;
3. an `AUTHOR_REQUIRED` rule cannot be satisfied by model confidence;
4. `CALIBRATED_MODEL` without admitted calibration evidence must abstain, reject, or materialize only an allowed non-definitive status according to the exact policy;
5. changing policy/provider subject/calibration evidence creates a new materialization operation identity;
6. confidence aggregation is never additive voting; duplicate evidence cannot inflate confidence by repetition.

## Contract 5 — BookStoryBibleKnowledgeCandidateV1 materialization

Required input identity:

```text
materialization_operation_id
materialization_operation_digest
book_project_id
prior_story_bible_ref
prior_story_bible_digest
source_acceptance_refs_and_digests[]
projection_refs_and_digests[]
manuscript_refs_and_digests[]
b02_recovery_proposal_refs_and_digests[]
provider_projection_refs_and_digests[]
calibration_policy_ref
calibration_policy_digest
candidate_records[]
```

The operation digest covers every semantic input above plus current B03 materializer/validator subject identity.

Materialization rules:

1. every candidate record cites at least one valid admitted anchor/evidence path;
2. all source/projection/manuscript refs must be exact and current for the requested materialization;
3. provider and B02 inputs remain proposal/evidence state throughout normalization;
4. existing stable IDs are preserved by prior Story Bible reconciliation when referents are unchanged;
5. contradictory identity payloads for the same stable ID fail closed;
6. duplicate claims may merge provenance/evidence refs but may not sum confidence or votes;
7. conflicting interpretations remain explicit `ALTERNATIVE`, `UNRESOLVED`, or `CONTESTED` records unless applicable authority resolves them;
8. sparse output is valid; the materializer must not invent missing entities, events, chronology, causality, relationships, arcs, themes, promises, or resolutions;
9. all output must pass `BookStoryBibleKnowledgeV1` validation before readiness can be considered;
10. materialization never performs B00 Story Bible admission or pointer mutation.

Materialization output standing is `MATERIALIZED_NOT_CANONICAL` until preparation proves admission readiness.

## Contract 6 — BookKnowledgeMaterializationReceiptV1

Required immutable receipt fields:

```text
receipt_schema_version = "BOOK_KNOWLEDGE_MATERIALIZATION_RECEIPT_V1"
receipt_id
receipt_digest
materialization_operation_id
materialization_operation_digest
materializer_subject_ref
validator_subject_ref
prior_story_bible_ref
input_identity_refs[]
calibration_policy_ref
calibration_policy_digest
input_counts_by_class
admitted_counts_by_class
alternative_counts_by_class
unresolved_counts_by_class
contested_counts_by_class
rejected_counts_by_class
rejection_reasons[]
identity_lineage_changes[]
knowledge_candidate_id
knowledge_digest
knowledge_valid
raw_manuscript_text_persisted = false
canonical_write_performed = false
```

A receipt records mechanics and exact evidence. It does not prove extraction/inference accuracy, author agreement, literary quality, or publication standing.

## Contract 7 — bounded transitive invalidation

Every B03 record has explicit `depends_on_refs[]` plus provenance/anchor refs sufficient to build a deterministic dependency graph.

Invalidation trigger classes include:

- changed/removed accepted source identity or digest;
- changed projection identity/digest;
- changed manuscript/current content identity;
- changed source anchor/span digest;
- superseded semantic identity where downstream records depend on the superseded referent;
- explicit authority decision invalidating a prior contested/alternative record.

Invalidation laws:

1. directly dependent records become invalidation candidates;
2. invalidation propagates transitively only through declared dependency edges;
3. traversal is cycle-safe and deterministic;
4. unrelated records are retained unchanged;
5. stale records cannot retain current/ASSERTED standing merely because stable IDs still exist;
6. historical Story Bible versions are never mutated;
7. invalidation produces an impact receipt and a successor materialization candidate;
8. unresolved/alternative/contested state remains explicit unless new evidence or applicable authority resolves it;
9. invalidation does not itself create new semantic facts;
10. changed calibration policy creates a new materialization identity but does not retroactively mutate prior admitted Story Bible versions.

Required invalidation impact fields:

```text
impact_id
impact_digest
base_story_bible_ref
changed_identity_refs[]
directly_affected_refs[]
transitively_affected_refs[]
unaffected_refs[]
cycle_refs[]
reason_codes[]
proposed_successor_candidate_ref
```

## Persistence topology lock

### Canonical Book storage

Canonical B03 semantics live only inside immutable governed `STORY_BIBLE` versions admitted by B00.

The outer Story Bible payload includes the exact `BookStoryBibleKnowledgeV1` body and its `knowledge_digest`. B00 object admission metadata remains controlling for Story Bible object identity/version/provenance/currentness.

### Canon Manifest

`CANON_MANIFEST` may reference the active Story Bible version and related canonical object refs. It must not duplicate the detailed entity/event/temporal/relationship/arc/promise/theme/open-question graph as an independently mutable semantic copy.

### Book coordination/evidence storage

May persist:

- calibration policy refs/digests;
- materialization operation identity/status;
- materialization receipts;
- rejected-candidate evidence;
- invalidation impact receipts;
- admission-preparation receipts;
- provider/B02 projection refs/digests;
- stable-ID lineage receipts.

It must not become a second mutable canonical knowledge store and must not silently persist raw/private manuscript text.

### External/shared artifact storage

May hold provider/model projection artifacts and calibration datasets/evidence where authorized. Book persists exact refs/digests and acceptance evidence, not implicit trust.

## Contract 8 — governed Story Bible admission transaction

### PrepareStoryBibleKnowledgeAdmissionV1

Preparation has zero canonical effect.

Required semantic inputs:

```text
admission_operation_id
admission_operation_digest
book_project_id
current_parent_state_version
current_parent_state_digest
current_story_bible_ref
current_story_bible_digest
knowledge_candidate_id
knowledge_digest
materialization_receipt_id
materialization_receipt_digest
calibration_policy_ref
calibration_policy_digest
source/manuscript/projection identity refs + digests
author_decision_refs[]
new_story_bible_id
new_story_bible_version
new_story_bible_content_digest
```

Preparation succeeds only when:

1. candidate validates exactly under the locked schema;
2. candidate standing is materialized and not blocked/stale;
3. exact source/manuscript/projection identities are current;
4. materialization receipt matches the candidate/digest;
5. calibration policy is exact and admissible for every materialized semantic class;
6. prior/current Story Bible parent identity is exact;
7. new Story Bible version has the exact required predecessor;
8. no deterministic graph-integrity blocker remains;
9. any definitive resolution of a genuinely contested interpretation has a current applicable B00 author decision;
10. unresolved/alternative/contested records may be admitted as such without fabricating author resolution;
11. all required rights/private-source constraints remain current.

### CommitStoryBibleKnowledgeAdmissionV1

Commit is a bounded composition into the existing B00 content-admission authority.

It constructs one existing B00 `commitContentAdmission` request with exactly these semantic canonical operations for the Story Bible successor:

1. `REGISTER_CONTENT_OBJECT_VERSION` with `object_type = STORY_BIBLE`, exact predecessor, content digest, provenance, current source subject, payload, and `requires_author_decision` only where the proposed canonical change contains a definitive resolution that requires author authority;
2. `SET_ACTIVE_CONTENT_OBJECT_VERSION` with `object_type = STORY_BIBLE` and exact newly registered Story Bible ref.

The current Book implementation executes those operations inside one B00 successor commit. Therefore registration and active-pointer movement are atomic under the existing B00 state/version ledger; B03 never moves the pointer independently.

Commit laws:

- exact parent state/version/digest precondition is mandatory;
- same committed `admission_operation_id` + same fingerprint replays one verified effect;
- changed candidate, policy, source/projection/manuscript identity, author decision, Story Bible predecessor, or parent state creates a new operation identity or stale failure;
- no lifecycle status changes;
- no export/publication side effects;
- no B03-side direct canonical mutation if B00 admission fails.

## Internal runtime identity lock

B03 internal deterministic operation identities are:

- `BOOK.KNOWLEDGE.VALIDATE_STORY_BIBLE`
- `BOOK.KNOWLEDGE.MATERIALIZE_STORY_BIBLE`
- `BOOK.KNOWLEDGE.COMPUTE_STORY_BIBLE_INVALIDATION`
- `BOOK.KNOWLEDGE.PREPARE_STORY_BIBLE_ADMISSION`
- `BOOK.KNOWLEDGE.COMMIT_STORY_BIBLE_ADMISSION`
- `BOOK.KNOWLEDGE.CHECK_STORY_BIBLE_INTEGRITY`

Owner is exactly `SYSTEM_MASTER/BOOK`.

These are Book domain operation identities, not additions to the frozen B01 11-capability provider registry. Existing `BOOK.LITERARY.BUILD_NARRATIVE_STATE` remains a noncanonical provider projection route and is not renamed into canonical B03 authority.

Any implementation discovery showing that B03 reachability requires changing a frozen B01 semantic invariant must stop and reopen only the exact affected B01 scope. Silent registry widening is forbidden.

## Command interface lock

B03 exposes the following logical commands only:

1. `ValidateStoryBibleKnowledgeV1`
2. `MaterializeStoryBibleKnowledgeCandidateV1`
3. `ComputeStoryBibleInvalidationImpactV1`
4. `PrepareStoryBibleKnowledgeAdmissionV1`
5. `CommitStoryBibleKnowledgeAdmissionV1`

No B03 command grants lifecycle, export-freeze, publication, or author-decision authority.

## Query interface lock

Read-only queries:

- `GetStoryBibleKnowledgeByIdV1`
- `GetStoryBibleKnowledgeRelationsV1`
- `GetStoryBibleKnowledgeCandidateStatusV1`
- `GetStoryBibleKnowledgeEvidenceV1`
- `GetStoryBibleInvalidationImpactV1`
- `GetStoryBibleKnowledgeAdmissionReadinessV1`
- `CheckStoryBibleKnowledgeIntegrityV1`

Queries never mutate canonical state, infer missing authority, or convert provider/model confidence into truth.

## Deterministic integrity lock

`CheckStoryBibleKnowledgeIntegrityV1` checks mechanics only:

- schema/version/digest validity;
- duplicate or malformed stable IDs;
- broken typed refs;
- source/projection/manuscript/currentness mismatches;
- missing provenance/dependency refs;
- impossible simultaneously `ASSERTED` temporal contradictions unless explicitly modeled as alternatives/invalidated conflict state;
- invalid relationship/arc/promise/setup-payoff/open-question references/status combinations;
- stale records retaining current asserted standing;
- forbidden raw/private-content fields;
- invalid identity-lineage cycles or referent reuse.

It does not score pacing, literary effectiveness, reader experience, plot quality, theme quality, or whole-book coherence.

## Evidence/event record lock

Immutable B03 evidence/coordination records include:

- `BOOK_KNOWLEDGE_VALIDATED`
- `BOOK_KNOWLEDGE_VALIDATION_BLOCKED`
- `BOOK_KNOWLEDGE_MATERIALIZATION_STARTED`
- `BOOK_KNOWLEDGE_MATERIALIZED`
- `BOOK_KNOWLEDGE_MATERIALIZATION_BLOCKED`
- `BOOK_KNOWLEDGE_INVALIDATION_COMPUTED`
- `BOOK_KNOWLEDGE_ADMISSION_PREPARED`
- `BOOK_KNOWLEDGE_ADMISSION_BLOCKED`
- `BOOK_KNOWLEDGE_ADMISSION_COMMITTED`

Records bind exact semantic identities/digests and are evidence, not a parallel event-sourced canonical Book aggregate.

## Blocker taxonomy lock

At minimum B03 build/qualification distinguishes:

- `BLOCKED_KNOWLEDGE_SCHEMA_INVALID`
- `BLOCKED_KNOWLEDGE_DIGEST_MISMATCH`
- `BLOCKED_STABLE_ID_CONFLICT`
- `BLOCKED_REFERENCE_INTEGRITY`
- `BLOCKED_SOURCE_STALE`
- `BLOCKED_PROJECTION_STALE`
- `BLOCKED_MANUSCRIPT_STALE`
- `BLOCKED_RIGHTS_OR_PRIVATE_AUTHORITY`
- `BLOCKED_PROVIDER_SUBJECT_UNADMITTED`
- `BLOCKED_CALIBRATION_POLICY_MISSING`
- `BLOCKED_CALIBRATION_UNPROVED`
- `BLOCKED_CONTESTED_AUTHORITY_REQUIRED`
- `BLOCKED_INVALIDATION_REQUIRED`
- `BLOCKED_CURRENT_STORY_BIBLE_STALE`
- `BLOCKED_AUTHOR_DECISION`
- `BLOCKED_GRAPH_INTEGRITY`
- `BLOCKED_REAL_BOOK_CALIBRATION`
- `BLOCKED_EXTERNAL_SETUP`
- `BLOCKED_A01_REQUIRED`

Missing evidence remains blocked; it is never converted into synthetic PASS.

## Error/fail-closed lock

Deterministic B03 errors must distinguish at minimum:

- invalid schema version;
- knowledge/candidate/policy/receipt digest mismatch;
- malformed/duplicate typed stable ID;
- stable ID referent conflict;
- broken typed reference;
- forbidden raw/private field;
- missing/stale source/projection/manuscript identity;
- invalid anchor span/digest/currentness;
- contradictory asserted temporal state;
- invalid relationship/arc/promise/setup-payoff/open-question lifecycle;
- missing provenance/dependency evidence;
- calibration policy missing/stale/provider-mismatched;
- contested evidence forced toward unsupported definitive assertion;
- author decision missing/stale/not applicable;
- invalidation closure stale/incomplete;
- current Story Bible predecessor stale;
- B00 parent state/version/digest stale;
- B00 canonical admission conflict;
- retired `CANONICAL_NARRATIVE_STATE` or `PROSE.*` identity presented as current B03 authority;
- B01 registry mutation attempted for B03 internal reachability.

Errors do not self-repair by guessing provider, author, source, semantic identity, or canonical truth.

## B04/B09 boundary lock

### B04 receives but B03 does not own

B03 may provide exact entity/event/character-knowledge/temporal/promise refs to B04. B04 owns:

- focalization/perspective interpretation;
- narrative function/passage/scene purpose;
- reader knowledge/belief/state;
- information release;
- pacing, attention, tension, comprehension.

No B04 reader-state claim is written into B03 as character/manuscript truth without a separately valid B03 semantic basis.

### B09 receives but B03 does not own

B03 provides deterministic graph integrity and canonical knowledge refs. B09 owns long-range/whole-book continuity, coherence, contradiction/debt, and distant-dependency evaluation. B09 findings return as evidence/proposals only and cannot directly mutate Story Bible canon.

## Frozen isolated deterministic denominator — 108 cases

The B03 design freezes **108 isolated deterministic cases before build**. The denominator may grow only through an explicit design-lock addendum for newly discovered requirements; it may not shrink to obtain PASS.

### K01-K32 — schema, identity, semantic integrity

- K01 valid `BookStoryBibleKnowledgeV1` payload passes.
- K02 wrong/unknown schema version fails.
- K03 knowledge digest tamper fails.
- K04 foreign BookProject identity fails.
- K05 forbidden raw manuscript/private payload field fails.
- K06 anchor without exact accepted source/projection identity fails.
- K07 invalid anchor span/range/digest fails.
- K08 duplicate anchor stable ID fails.
- K09 valid entity identity/type/provenance passes.
- K10 duplicate entity stable ID or referent conflict fails.
- K11 valid event identity/participants passes.
- K12 unresolved event participant ref fails integrity.
- K13 event-family / same-story-event identity preserves repeated narration.
- K14 story time and discourse order remain separate claim classes.
- K15 impossible simultaneously asserted temporal contradiction fails unless explicitly alternative/invalidated.
- K16 valid duration exact/approximate/range/unknown semantics pass.
- K17 valid recurrence/frequency semantics pass without pacing interpretation.
- K18 causal/goal claim requires valid typed subject/object refs.
- K19 bounded state assertion requires valid subject/provenance/change refs.
- K20 `KNOWS`/`BELIEVES`/`PERCEIVES` remain distinct and separate from reader state.
- K21 valid first-class relationship identity/state passes.
- K22 relationship change refs must resolve to admitted events/state assertions.
- K23 arc subjects/beats/statuses validate without universal beat requirement.
- K24 motif identity/occurrence refs validate without quality inference.
- K25 theme/idea/subtext hypothesis validates while author-intent/quality-authority fields are rejected.
- K26 promise lifecycle validates including intentional unresolved state.
- K27 setup/payoff lifecycle validates without synthetic payoff requirement.
- K28 open-question lifecycle validates including reopen and intentional unresolved state.
- K29 `ALTERNATIVE`/`UNRESOLVED`/`CONTESTED` are valid canonical-representation states.
- K30 every semantic record requires exact provenance/dependency structure.
- K31 stable IDs persist across successor Story Bible versions when referent is unchanged; split/merge lineage remains explicit.
- K32 all typed refs and identity-lineage relations are globally integrity-checked and cycle/referent conflicts fail.

### M01-M20 — materialization and calibration policy

- M01 materialization accepts only exact admitted source/projection/manuscript evidence.
- M02 B02 `PROPOSED_NOT_CANONICAL` candidates remain noncanonical inputs.
- M03 provider output remains projection/evidence and cannot self-promote.
- M04 exact admitted calibration-policy ref/digest is required.
- M05 policy/provider subject mismatch blocks.
- M06 `AUTHOR_REQUIRED` rule cannot be satisfied by confidence.
- M07 `CALIBRATED_MODEL` with missing calibration evidence abstains/blocks per policy.
- M08 high confidence cannot override stale/currentness/rights/private-source failure.
- M09 contested evidence cannot silently become one asserted winner.
- M10 duplicate evidence merges provenance without vote/confidence inflation.
- M11 contradictory identity payload for one stable ID fails closed.
- M12 sparse materialization is valid and does not invent missing facts.
- M13 prior Story Bible stable IDs are reconciled/preserved for same referents.
- M14 changed referent creates new stable ID plus lineage rather than ID reuse.
- M15 materialization output validates before readiness.
- M16 rejected candidates retain exact reason/evidence in receipt.
- M17 materialization receipt binds exact input/policy/materializer/validator/output identity.
- M18 identical semantic inputs/policy/subjects produce identical operation identity and deterministic result.
- M19 changed policy/provider/source/projection/manuscript/materializer subject creates a new operation identity.
- M20 materialization persists no raw manuscript text and performs no canonical write.

### I01-I16 — invalidation/currentness

- I01 changed anchor/span directly marks dependent records invalidation-eligible.
- I02 changed source acceptance identity/digest triggers exact dependency invalidation.
- I03 changed projection identity/digest triggers exact dependency invalidation.
- I04 changed manuscript/current content identity triggers exact dependency invalidation.
- I05 invalidation propagates through declared dependency edges transitively.
- I06 invalidation traversal is deterministic and cycle-safe.
- I07 unrelated records remain unchanged/current.
- I08 stale dependent `ASSERTED` record cannot remain current.
- I09 relationship dependents invalidate when underlying entity/event/state dependency changes.
- I10 arc dependents invalidate when referenced subject/beat dependency changes.
- I11 promise/setup-payoff/open-question dependents invalidate from changed referenced events/evidence.
- I12 motif/theme dependents invalidate only through declared provenance/dependency edges.
- I13 historical Story Bible versions remain immutable after invalidation.
- I14 successor candidate preserves stable IDs for unaffected/same referents.
- I15 unresolved/alternative/contested state remains explicit unless new evidence/authority resolves it.
- I16 invalidation impact receipt exactly partitions direct/transitive/unaffected refs and binds proposed successor candidate.

### A01-A16 — runtime and governed admission

- A01 exact B03 internal operation identities/owner are required.
- A02 retired `CANONICAL_NARRATIVE_STATE`/`PROSE.*` identity is rejected as current B03 authority.
- A03 prepare admission has zero canonical effect.
- A04 prepare requires exact current Story Bible predecessor and B00 parent state/version/digest.
- A05 candidate/materialization/policy/source/projection/manuscript digest mismatch blocks.
- A06 deterministic graph-integrity blocker prevents admission readiness.
- A07 definitive contested resolution requiring author authority blocks without current applicable author decision.
- A08 unresolved/alternative/contested representation may be admitted without fabricated winner/author decision when no definitive resolution is claimed.
- A09 commit constructs one B00 content-admission request registering exactly one Story Bible successor and setting that exact version active.
- A10 B00 registration + active Story Bible switch is atomic in one existing content-admission successor commit.
- A11 stale B00 parent/current Story Bible precondition blocks without partial canonical mutation.
- A12 exact committed admission replay reuses one verified effect under B00 idempotency.
- A13 changed candidate/policy/parent/author/source/projection/manuscript creates new identity or stale failure, never same-operation mutation.
- A14 B03 internal runtime reachability does not widen the frozen B01 11-capability provider registry.
- A15 all B03 queries are read-only and cannot infer missing authority.
- A16 B03 admission changes neither lifecycle status nor export/publication authority.

### X01-X24 — adversarial authority/domain/evidence locks

- X01 second mutable canonical B03 store is introduced -> reject.
- X02 Canon Manifest duplicates independently mutable detailed Story Bible semantics -> reject.
- X03 historical `CANONICAL_NARRATIVE_STATE` is presented as current canonical authority -> reject.
- X04 historical `PROSE.*` route is reactivated as current B03 ownership -> reject.
- X05 raw/private manuscript text is persisted in B03 coordination state -> reject.
- X06 provider/model output directly mutates Story Bible or active pointer -> reject.
- X07 confidence threshold is treated as canonical truth/author authority -> reject.
- X08 contested interpretations are forced to one winner without applicable authority -> reject.
- X09 machine/provider output synthesizes an author decision -> reject.
- X10 stale source/projection/manuscript identity is accepted because semantic IDs still match -> reject.
- X11 invalidated dependent remains current/asserted after its provenance dependency changes -> reject.
- X12 historical Story Bible version is mutated in place -> reject.
- X13 B03 moves active Story Bible pointer outside existing B00 content-admission authority -> reject.
- X14 B03 adds itself to the frozen B01 11-capability provider registry without explicit reopen -> reject.
- X15 reader knowledge/state is stored as B03 character/manuscript truth merely because B04 inferred it -> reject.
- X16 focalization/perspective interpretation is retained as B03 canonical claim type -> reject.
- X17 narrative-function/passage-purpose interpretation is retained as B03 authority -> reject.
- X18 whole-book continuity/coherence evaluation is claimed by B03 rather than B09 -> reject domain claim.
- X19 historical Narrative State/Orchestration PASS is transferred to changed current B03 bytes/contracts -> reject evidence claim.
- X20 synthetic mechanics are relabeled model/extraction/inference accuracy proof -> reject evidence claim.
- X21 synthetic fixtures are relabeled real-book/long-form validation -> reject evidence claim.
- X22 missing rights/private-source authority is bypassed by model confidence or prior Story Bible presence -> reject.
- X23 duplicate candidate evidence inflates confidence by vote/sum -> reject.
- X24 B03 mechanics/model success is represented as publication, production, or A-01 standing -> reject evidence claim.

`32 + 20 + 16 + 16 + 24 = 108`.

## Cumulative B00-B03 qualification lock

Before B03 freeze, qualification must run on the exact B03 candidate subject and include:

1. B03 isolated deterministic denominator: 108/108, unless a formal design-lock addendum increases the denominator;
2. frozen B02 deterministic denominator: 72/72 freshly rerun or exact current harness proving unchanged B02 behavior on the B03 candidate integration subject;
3. frozen B01 deterministic denominator: 64/64 freshly rerun or exact current harness proving unchanged B01 behavior;
4. B00 Q001-Q096 plus the current applicable PRE chain freshly rerun/verified under current frozen evidence rules, preserving any exact external/A-01 blocker rather than synthesizing PASS;
5. fresh deterministic integration proving provider/B02 proposal -> B03 materialization -> invalidation/currentness -> author-gated-when-required Story Bible admission through B00 without authority widening;
6. exact tests that Story Bible admission remains one immutable successor and that B00 active-pointer/currentness/version-ledger behavior is unchanged;
7. historical Narrative State/Materialization/Orchestration qualification remains archaeological evidence only and transfers zero PASS to changed current B03 code/contracts.

No denominator may shrink to obtain green status.

## Calibration/evidence obligations

### Deterministic

The 108-case denominator plus cumulative B00-B03 regression proves schemas, identities, refs, deterministic materialization behavior, invalidation, authority boundaries, atomic admission, idempotency, and fail-closed mechanics.

### MODEL/BEHAVIORAL

Requires current-subject/provider-specific evaluation of extraction/inference accuracy by semantic class, including entity/event, chronology, causality, character knowledge, relationships, arcs, setup/payoff, themes, and promises as applicable. Calibration must measure abstention/contest preservation and must produce/admit an exact `BookKnowledgeCalibrationPolicyV1` before calibrated model outputs may receive policy-authorized standing.

Until adequate evidence exists, affected calibrated rules remain `BLOCKED_UNCALIBRATED` or abstaining/non-definitive according to policy. Deterministic mechanics may still qualify.

### REAL-BOOK/LONG-FORM

Requires authorized representative long-form material to evaluate distant semantic dependency, ID stability across revisions, invalidation precision, ambiguity preservation, arc/promise/open-question behavior, and Story Bible usefulness. Synthetic fixtures cannot establish this standing.

### HUMAN/AUTHOR

Required for genuine contested-canon resolution, usefulness/alignment judgments where machine evidence cannot substitute, and any final author authority required by B00. Machine votes/confidence cannot stand in for author evidence.

### PRIVATE/NATIVE/EXTERNAL/A-01/PUBLICATION

Remain separate evidence classes. Missing environment/provider/private/publication/A-01 evidence remains explicit blocker state and does not invalidate deterministic B03 mechanics when not part of the deterministic claim.

## Build order lock

Implementation is admitted only in this order:

1. **B03-D1 — STORY-BIBLE KNOWLEDGE SCHEMA + VALIDATOR BUILD**
   - implement `BookStoryBibleKnowledgeV1` schema/validator;
   - implement stable semantic-ID and identity-lineage validation;
   - implement typed refs and deterministic integrity checks;
   - implement K01-K32;
   - no materializer, invalidation mutation, or canonical admission yet.

2. **B03-D2 — KNOWLEDGE MATERIALIZER + CALIBRATION-POLICY BUILD**
   - adapt/migrate historical Narrative State materialization semantics into Book ownership;
   - implement `BookKnowledgeCalibrationPolicyV1` acceptance;
   - implement candidate normalization, provenance merge, contest preservation, sparse-state behavior, and materialization receipt;
   - implement M01-M20;
   - historical PASS remains zero-transfer.

3. **B03-D3 — TRANSITIVE INVALIDATION + SUCCESSOR RECONCILIATION BUILD**
   - implement dependency graph/currentness/invalidation impact;
   - implement successor candidate reconciliation and stable-ID preservation;
   - implement I01-I16;
   - no direct canonical pointer mutation.

4. **B03-D4 — GOVERNED STORY-BIBLE ADMISSION + RUNTIME/QUERY BUILD**
   - implement B03 internal command/query runtime surface;
   - implement prepare/commit bounded composition into existing B00 `commitContentAdmission`;
   - use atomic `REGISTER_CONTENT_OBJECT_VERSION(STORY_BIBLE)` + `SET_ACTIVE_CONTENT_OBJECT_VERSION(STORY_BIBLE)`;
   - implement A01-A16 and X01-X24;
   - do not widen frozen B01 provider registry.

5. **B03-E — ISOLATED + B00-B03 CUMULATIVE QUALIFICATION/CALIBRATION**
   - run 108/108 deterministic B03 denominator and frozen B00-B02 regressions on exact candidate;
   - collect MODEL/BEHAVIORAL, REAL-BOOK/LONG-FORM, HUMAN/AUTHOR, and external evidence where available;
   - preserve exact blockers where unavailable.

6. **B03-F — CONTROL FREEZE**
   - freeze only when unaccounted B03 requirements = 0, required current-subject deterministic evidence is valid, denominator shrinkage = 0, historical PASS transfer = 0, and every unresolved external evidence gap is represented by an exact blocker rather than synthetic PASS.

Each build stage must re-read the live Book head before mutation and preserve rollback-friendly commit boundaries.

## B00-B02 invariant check

This design does not reopen B00, B01, or B02.

Mandatory preserved invariants include:

- B00 canonical content admission/version/currentness remains terminal for Story Bible mutation;
- active Story Bible pointer changes only through existing B00 authority;
- author decisions are never synthesized;
- Story Bible versions are immutable successor objects, never in-place edits;
- B01 remains the generic execution foundation and its frozen provider registry is not silently widened;
- B02 accepted source/projection identities remain exact and B02 Story Bible candidates remain noncanonical proposals;
- raw/private manuscript text is not silently duplicated into coordination state;
- stale/currentness/rights/private-source failures remain fail-closed;
- historical `PROSE.*` and `CANONICAL_NARRATIVE_STATE` ownership/authority names remain retired from current architecture;
- ambiguity/contest remains explicit;
- provider/model success never implies canonical, author, publication, production, or A-01 standing;
- B04/B09 delegated responsibilities are not pulled back into B03;
- historical qualification does not transfer to changed current B03 bytes/contracts.

If D1-D4 implementation evidence contradicts one of these frozen invariants, stop and reopen only the exact invalidated earlier scope before continuing.

## Design-lock closure accounting

B03-B mandatory design-lock contents frozen: **15 / 15**

B03 atomic requirements represented by locked schema/owner/interface/persistence/evidence/build path: **60 / 60**

B03 adversarial authority/evidence locks frozen: **24 / 24**

Frozen B03 isolated deterministic denominator: **108**

Historical PASS transferred: **0**

Earlier frozen domains reopened: **0**

Unresolved schema decisions: **0**

Unresolved identity decisions: **0**

Unresolved persistence decisions: **0**

Unresolved admission decisions: **0**

Unresolved runtime/interface decisions: **0**

Unresolved domain-placement decisions: **0**

Unresolved deterministic proof decisions: **0**

Unaccounted B03 requirements: **0**

Implementation performed by this artifact: **0**

## Exactly one dependency-valid successor

`BOOK-RECONSTRUCTION-B03-D1 — STORY-BIBLE KNOWLEDGE SCHEMA + VALIDATOR BUILD`

B03-D1 is the sole admitted successor.

It may implement only the locked `BookStoryBibleKnowledgeV1` schema/validator, stable semantic-ID/lineage laws, typed refs, deterministic integrity checks, and K01-K32 tests. It may not yet implement the materializer, calibration-policy application, invalidation engine, governed Story Bible admission, change the active Story Bible pointer, widen B01 provider bindings, claim model/real-book/human calibration, or skip directly to B03-D2/D3/D4/E/F.