# BOOK-RECONSTRUCTION-B04-C — BOOK UNDERSTANDING & READER INTELLIGENCE DESIGN LOCK 001

Date: 2026-09-13
Owner: SYSTEM_MASTER/BOOK
Predecessor freeze: B03-F @ 9476997dc99dbbfe2c8ce09936e507d0b600cc67
Standing: DESIGN_LOCKED__B04_D1_SELECTED__ISOLATED_DENOMINATOR_128__EXTERNAL_CALIBRATION_FENCES_PRESERVED__NO_IMPLEMENTATION_IN_THIS_ARTIFACT
Canonical effect: NONE

## Scope

B04 owns noncanonical reader-facing understanding projections over exact current Book knowledge. It does not own manuscript truth, Story Bible canon, provider execution infrastructure, craft diagnosis, revision generation, independent evaluation/calibration authority, voice/preference learning, author decisions, lifecycle, export, or publication.

## Locked architecture

accepted B03 Story Bible knowledge + exact source/anchor provenance
    -> reveal frontier
    -> BookReaderExposureProjectionV1
    -> accepted reader/perspective/dimension observation evidence
    -> BookReaderUnderstandingProjectionV1
    -> bounded queries / later-domain evidence

source/B03/evidence change
    -> BookReaderUnderstandingInvalidationV1
    -> stale noncanonical projection / recomputation requirement

No B04 path mutates canonical Book state.

## Contract 1 — BookReaderExposureProjectionV1

Required identity/binding fields:

- exposure_schema_version = BOOK_READER_EXPOSURE_V1
- exposure_projection_id
- exposure_projection_digest
- book_project_id
- story_bible_ref
- story_bible_digest
- knowledge_candidate_id
- knowledge_digest
- scope { scope_kind, scope_ref, scope_digest }
- reveal_frontier { frontier_anchor_id, frontier_ordinal, frontier_anchor_digest }
- visible_anchor_refs[]
- visible_semantic_refs { collection_name -> stable semantic refs[] }
- dependency_refs[]
- standing

Allowed scope_kind: PASSAGE | SCENE | CHAPTER.

Exposure is deterministic availability, not proof that a human reader noticed, remembered, understood, believed or inferred the available information.

### Future-text leakage law

A B03 semantic record is exposure-eligible only when:

1. every direct source anchor required by the record is at or before the reveal frontier;
2. every semantic dependency recursively required by the record is exposure-eligible;
3. the record has at least one visible direct anchor or one visible semantic dependency;
4. no future-only stable ID, status, count or metadata is emitted merely because it exists in the full Story Bible.

The output never lists hidden/future semantic IDs or hidden counts.

### Lifecycle-status leakage law

B04 does not copy final B03 lifecycle status for promises/open questions/setup-payoffs/arcs into reader state unless the status itself is supported entirely by frontier-visible evidence. The deterministic exposure layer primarily emits stable refs and provenance/currentness, not final future-aware narrative outcomes.

## Contract 2 — ReaderPerspectiveLensV1

The unrecovered PCE013 18-axis labels are not reconstructed.

The current Book lens contract uses 12 explicit lenses:

1. REVEAL_INFORMATION
2. SITUATION_ORIENTATION
3. PERSPECTIVE_FOCALIZATION
4. PURPOSE_NARRATIVE_FUNCTION
5. EXPECTATION_CURIOSITY_TENSION
6. ATTENTION_ENGAGEMENT
7. AFFECT_ABSORPTION
8. TRUST_EPISTEMIC_ALIGNMENT
9. EFFORT_CONFUSION_FATIGUE
10. PACING_MOMENTUM
11. RESONANCE_MEMORY
12. CALIBRATION_DISAGREEMENT

These are current B04 labels, not claimed historical PCE013 labels. Lenses organize observations; they do not own canonical manuscript facts.

## Contract 3 — exact 64-dimension registry

The exact recovered PCE013 dimensions and nine groups are immutable B04 observation taxonomy. No B04 implementation may silently rename, delete, merge or add primary dimensions without reopening B04-C.

No single aggregate reader score is permitted.

Each dimension in an understanding projection has exactly one disposition:

- OBSERVED
- ABSTAINED
- NOT_APPLICABLE
- UNOBSERVED

Sparse applicability is valid. NOT_APPLICABLE and ABSTAINED are not failures.

## Contract 4 — BookReaderObservationV1

An observation binds:

- exact exposure_projection_id/digest;
- one dimension_id or one perspective_lens_id;
- source_class = DETERMINISTIC | MODEL | SYNTHETIC_READER | HUMAN;
- standing = OBSERVED_UNCALIBRATED | OBSERVED_CALIBRATED | ABSTAINED | NOT_APPLICABLE;
- provider/profile/evidence refs where applicable;
- confidence nullable 0..1;
- calibration_ref nullable;
- frontier binding;
- immutable observation digest/id.

B04 coordination state stores no raw manuscript text, quoted passage text, credentials, chain-of-thought, inferred demographic traits, or free-form hidden reasoning.

B04 does not define a universal numeric scale for the 64 dimensions. Measurement payloads remain in evidence artifacts governed by their producer/calibration contract; B04 binds immutable evidence references and standing.

### Standing laws

- MODEL and SYNTHETIC_READER evidence cannot claim HUMAN standing.
- HUMAN evidence cannot become calibrated unless an external calibration authority/evidence ref establishes that standing.
- An unadmitted provider subject cannot create current executable-provider standing.
- Missing evidence may yield ABSTAINED/UNOBSERVED and may not be converted to PASS.

## Contract 5 — BookReaderUnderstandingProjectionV1

The understanding projection contains:

- exact exposure projection binding;
- exact observation IDs/digests;
- all 64 dimension dispositions;
- lens coverage/observation refs;
- currentness standing;
- external calibration fences;
- canonical_effect = false.

Allowed projection standing:

- READY_FOR_OBSERVATION
- PARTIALLY_OBSERVED
- OBSERVED_UNCALIBRATED
- OBSERVED_WITH_CALIBRATION_EVIDENCE
- BLOCKED_STALE
- BLOCKED_INVALID

No projection standing means literary quality, author approval, publication readiness, or production standing.

## Contract 6 — currentness / invalidation

A reader projection binds exact:

- B03 knowledge candidate ID/digest;
- Story Bible ref/digest;
- scope ref/digest;
- frontier anchor/digest/ordinal;
- observation IDs/digests;
- provider subject/calibration refs when present.

Any changed dependency makes the affected projection stale. B04 may reuse B03 invalidation impact evidence but does not mutate B03.

No stale projection may be returned as current.

## Book-internal command surface

1. BuildReaderExposureProjectionV1
2. AssembleReaderUnderstandingProjectionV1
3. ComputeReaderUnderstandingInvalidationV1

These are Book-internal deterministic operations, not B01 provider-registry capabilities.

## Read-only query surface

1. GetReaderExposureProjectionV1
2. GetReaderUnderstandingProjectionV1
3. GetReaderDimensionEvidenceV1
4. GetReaderLensCoverageV1
5. GetReaderUnderstandingCurrentnessV1

## Existing provider seam

If model/provider analysis is executed, the existing B01 capability seam BOOK.LITERARY.ANALYZE_PASSAGE is preferred after a provider subject is properly admitted. B04 does not widen the frozen 11-capability registry.

BOOK.LITERARY.BUILD_NARRATIVE_STATE remains historical provenance and may not become a competing B03 source-truth authority.

## Error taxonomy

- BLOCKED_KNOWLEDGE_INVALID
- BLOCKED_STORY_BIBLE_BINDING_MISMATCH
- BLOCKED_SCOPE_INVALID
- BLOCKED_FRONTIER_UNRESOLVED
- BLOCKED_FRONTIER_BINDING_MISMATCH
- BLOCKED_FUTURE_TEXT_LEAKAGE
- BLOCKED_RAW_TEXT_FORBIDDEN
- BLOCKED_DIMENSION_UNKNOWN
- BLOCKED_LENS_UNKNOWN
- BLOCKED_OBSERVATION_BINDING_MISMATCH
- BLOCKED_OBSERVATION_STALE
- BLOCKED_HUMAN_STANDING_SYNTHESIZED
- BLOCKED_CALIBRATION_EVIDENCE_REQUIRED
- BLOCKED_PROVIDER_SUBJECT_UNADMITTED
- BLOCKED_UNIVERSAL_READER_SCORE_FORBIDDEN
- BLOCKED_DEMOGRAPHIC_ESSENTIALISM_FORBIDDEN
- BLOCKED_DIGEST_MISMATCH
- BLOCKED_CURRENTNESS_REQUIRED
- BLOCKED_CANONICAL_EFFECT_FORBIDDEN

## Persistence/privacy

B04 reader projections are derived noncanonical coordination/evidence records. They may be cached or stored under B01 durable-state/evidence rules, but must remain reconstructible from exact bound dependencies and must not store raw manuscript text.

Opaque reader_profile_ref values may identify an explicitly governed synthetic or observed profile. B04 may not infer or persist protected demographic attributes as essentialist reader identity.

## Transactions/concurrency/idempotency

All B04 build/assemble/invalidation operations are deterministic and content-addressed. Repeating an operation with identical semantic input yields the same digest/id. Read-only B04 projection work is parallel-eligible under B01; no B04 operation acquires canonical-write locks.

## Calibration fences

Deterministic B04 mechanics may be qualified without converting these external classes to PASS:

- MODEL_READER_SIMULATION_CALIBRATION_REQUIRED
- HUMAN_READER_ALIGNMENT_REQUIRED
- REAL_BOOK_LONG_FORM_CALIBRATION_REQUIRED
- PROVIDER_SUBJECT_ADMISSION_REQUIRED

Synthetic fixtures prove mechanics only.

## Locked isolated denominator — 128 cases

- E01-E32: exposure/frontier/source/B03 binding/currentness/privacy
- D01-D32: exact dimension registry, grouping, sparse applicability, non-scalar law
- P01-P24: perspective/observation target, standing, calibration and evidence laws
- U01-U24: understanding assembly, sparse applicability, projection standing and cross-boundary adversarial laws
- I01-I16: invalidation/currentness/idempotency/query/content-addressing

Adversarial future leakage, authority widening, synthetic-human confusion, demographic essentialism, raw-text, stale-evidence and provider-boundary defenses are distributed across E/P/U/I rather than counted as a second denominator.

Total = 128. Denominator shrinkage forbidden after build begins.

## Build order

B04-D1 — exact dimension/lens registry + exposure projection.
B04-D2 — observation acceptance + understanding projection.
B04-D3 — invalidation/currentness + query/runtime reachability composition.
B04-E — 128-case isolated + B00-B04 cumulative qualification/calibration.
B04-F — deterministic control freeze only if required mechanics pass and external calibration fences remain explicit.

## Design-lock closure

Unresolved deterministic design decisions: 0.
Historical 18-axis labels: unrecoverable provenance, explicitly superseded by current lens contract without false recovery.
Runtime implementation: NOT EXECUTED by this artifact.
