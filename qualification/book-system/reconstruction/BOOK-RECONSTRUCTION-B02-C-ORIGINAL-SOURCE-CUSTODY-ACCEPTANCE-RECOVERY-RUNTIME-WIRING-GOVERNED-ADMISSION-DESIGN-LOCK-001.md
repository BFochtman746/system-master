# BOOK-RECONSTRUCTION-B02-C — ORIGINAL-SOURCE CUSTODY ACCEPTANCE + RECOVERY RUNTIME WIRING + GOVERNED ADMISSION DESIGN LOCK 001

Date: 2026-09-12
Owner: SYSTEM_MASTER/BOOK
Parent Book head: `29ae3057c30d0d139f17d0e059d92f3b09428a1d`
Observed canonical governance head: `c41884bf9cc66c24fb7f245d68eefc6dbbd1139f`
Predecessor: `BOOK-RECONSTRUCTION-B02-B — SOURCE INTAKE & EXISTING-BOOK RECOVERY ANALYSIS / ADJUDICATION 001`
Standing: `DESIGN_LOCKED__B02_D1_SELECTED__ISOLATED_DENOMINATOR_72__NO_IMPLEMENTATION_IN_THIS_ARTIFACT`
Canonical effect: NONE

## Scope and authority

This artifact freezes the B02 design required by the controlling Book reconstruction blueprint before implementation. It does not build B02, install B02 on `main`, activate a native provider, execute PDF/DOCX/OCR extraction, qualify recovery, admit recovered content, synthesize author decisions, authorize publication, claim production standing or claim A-01 standing.

B00 Foundation & Authority and B01 Execution Foundation remain frozen. B02 composes those authorities and may not silently widen, replace or duplicate them. Historical Prose/Literary artifacts remain provenance/calibration evidence only.

B02-B closed 50/50 ledger dispositions with zero unresolved items and selected this design lock. The design below implements that adjudication exactly:

- keep the existing semantic recovery engine;
- delegate immutable original-byte storage and native PDF/DOCX/OCR execution to an external/native provider boundary;
- build a Book-owned custody/projection acceptance boundary;
- build one bounded Book recovery runtime adapter without creating a second scheduler/router/execution authority;
- build the already-designed recovery-specific admission composition using existing Book admission, author-decision applicability and lifecycle rebind authority.

## Research decision

No external research stage is inserted before build.

The remaining questions are repository-owned architecture, identity, authority, transaction and evidence questions. External sources cannot decide Book ownership or widen B00/B01 authority. Native/provider fidelity, real-book recovery quality, private-source handling, device/production and A-01 evidence remain later qualification obligations and may remain explicitly blocked until real evidence exists.

## Locked end-to-end architecture

```text
immutable original source bytes
    -> external/native storage provider
    -> BookSourceCustodyAcceptanceV1
    -> external/native PDF/DOCX/OCR/normalization provider
    -> BookNormalizedSourceProjectionV1 acceptance
    -> BOOK.SOURCE_RECOVERY.RECOVER_EXISTING_BOOK
    -> existing existing-book-recovery.js semantic core
    -> PROPOSED_RECOVERED_BASELINE__AWAITING_GOVERNED_ADMISSION
    -> explicit current-subject author/review decision
    -> BookRecoveredBaselineAdmissionV1 bounded composition
    -> existing Book canonical content admission
    -> existing lifecycle current-parent rebind
```

No stage before existing Book canonical admission may create canonical Book truth.

## Responsibility lock

### Book owns

1. source acceptance identity and digest validation;
2. custody/provenance/rights/private-source acceptance evidence;
3. the minimum normalized-projection acceptance schema;
4. validation that projections bind to an accepted source identity/digest;
5. semantic existing-book recovery;
6. recovery ambiguity/blocker semantics;
7. recovery checkpoints, evidence references and proposal identity;
8. author-decision preparation and exact current-subject applicability checks;
9. the bounded recovery-admission composition;
10. exact integration with existing canonical admission and lifecycle rebind;
11. B02 isolated and cumulative qualification evidence.

### External/native/shared providers own

1. immutable binary object storage mechanics;
2. native file acquisition and locator production;
3. PDF decoding/extraction;
4. DOCX decoding/extraction;
5. OCR execution for image/scanned content;
6. provider-specific object version/generation identity;
7. provider-specific extraction fidelity and calibration evidence;
8. exact per-unit byte/locator evidence when chapter/scene/unit admission is requested.

### Book does not own and B02 must not create

- a second binary/blob store merely to duplicate provider custody;
- a second scheduler, workflow engine, retry engine or generic router;
- a second canonical admission authority;
- a second lifecycle state machine;
- author-decision authority;
- publication/export-freeze authority;
- provider-native fidelity authority;
- production/device/A-01 authority.

## Contract 1 — BookSourceCustodyAcceptanceV1

A source may enter B02 recovery only through a content-addressed Book acceptance receipt.

Required semantic fields:

```text
source_acceptance_schema_version = "1"
book_project_id
source_id
source_kind
source_locator_ref
provider_identity {
  provider_class
  provider_subject_ref
  provider_contract_ref
  provider_contract_digest
  object_id
  object_version_or_generation
  content_address_or_etag
}
source_digest_sha256
source_byte_length
media_type
rights_record_id
rights_record_digest
intended_use_scope
private_source_evidence_ref       // nullable only when policy says no separate private-source evidence is required
private_source_evidence_digest    // nullable iff ref is null
canonical_write_authority = false
author_decision_authority = false
publication_authority = false
source_acceptance_id
source_acceptance_digest
accepted_at                       // audit metadata, excluded from semantic digest
```

### Digest and identity law

`source_acceptance_digest = SHA-256(stable semantic JSON)` over every semantic field above except `source_acceptance_id`, `source_acceptance_digest` and `accepted_at`.

`source_acceptance_id = "book-source-custody-v1:" + source_acceptance_digest`.

The provider subject, provider contract identity, immutable object/version identity, source digest, byte length, media type, rights evidence identity and intended-use scope are semantic. Changing any of them creates a new acceptance identity.

Display names, UI labels, temporary access URLs, timestamps, retry counters and chat metadata are nonsemantic and may not define source identity.

### Acceptance law

Acceptance succeeds only when all are true:

1. exact source SHA-256 is present and valid;
2. byte length is a non-negative integer and is bound to the same provider object/version observation;
3. provider subject and provider contract identity are explicit; no provider/default subject may be guessed;
4. object identity is immutable/versioned or content-addressed strongly enough to re-resolve the accepted bytes;
5. rights/custody evidence evaluates to `ACCEPTED_FOR_DECLARED_SCOPE` for this exact source ref/digest and intended use;
6. required private-source permission evidence is present and current;
7. source locator/ref is opaque coordination metadata and does not itself grant authority;
8. no raw original bytes are stored in Book workflow coordination state.

A mutable display path with no immutable object/version identity is not sufficient custody proof.

### Re-resolution/currentness law

Whenever the provider object must be read again, the provider must re-resolve the exact accepted object/version and prove the same digest and byte length. Same display name with changed bytes is stale. A changed provider subject, contract, object version, digest or length requires a new acceptance receipt and a new downstream operation identity.

## Contract 2 — BookNormalizedSourceProjectionV1

The semantic recovery engine continues to consume normalized projections rather than parsing arbitrary native files.

Required projection acceptance fields:

```text
projection_schema_version = "1"
projection_id
projection_digest
source_acceptance_id
source_acceptance_digest
source_digest_sha256
extractor_identity {
  provider_class
  provider_subject_ref
  provider_service_id
  provider_operation_id
  provider_contract_ref
  provider_contract_digest
  extractor_version
}
projection_artifact_ref
projection_artifact_digest
recovered_content_digest_sha256
structure[] {
  structure_id
  kind
  title
  ordinal
  anchor
  confidence
  ambiguous
}
metadata_ref_or_inline
citations_ref_or_inline
comments_ref_or_inline
todos_ref_or_inline
tracked_changes_ref_or_inline
story_bible_candidate_ref_or_inline
nonfiction_knowledge_candidate_ref_or_inline
voice_candidate_ref_or_inline
unit_evidence[] // optional for whole-manuscript recovery; mandatory for independent unit admission
```

Each `unit_evidence` item, when present, must bind:

```text
unit_id
unit_kind
ordinal
anchor
source_acceptance_digest
projection_digest
unit_content_digest_sha256
unit_locator_ref
provider_evidence_ref
provider_evidence_digest
```

### Projection identity law

The projection digest covers the exact normalized semantic projection consumed by recovery, including structure, metadata, citations, comments, TODOs, tracked changes and semantic candidate inputs. It also binds the accepted source identity and extractor identity.

The projection artifact may live in an external/shared artifact store. Book coordination state persists refs/digests and bounded recovery records; it does not duplicate raw original bytes or full provider payloads merely for orchestration.

### Lossless-minimum law

A projection is acceptable for B02 only when it preserves, when present in the source/provider output:

- ordered structural units;
- stable anchors;
- metadata and conflicts;
- citations/references;
- comments/editor queries;
- TODO/TBD/open/missing-citation signals;
- tracked-change evidence;
- revision/version candidate identity;
- extraction confidence/ambiguity evidence;
- semantic proposal inputs as proposal evidence, never author truth.

The provider may provide richer fields, but unrecognized fields do not silently gain authority and must not affect semantic identity unless admitted by an explicit schema revision.

### Per-unit admission law

Whole-manuscript recovery may proceed without exact per-unit digest evidence. Independent chapter/scene/unit canonical admission may not. Absence of exact `unit_content_digest_sha256` plus exact locator/evidence produces `BLOCKED_PER_UNIT_EVIDENCE` for that unit admission path.

## Contract 3 — BookRecoveryRuntimeBindingV1

B02 introduces exactly one current recovery execution identity:

`BOOK.SOURCE_RECOVERY.RECOVER_EXISTING_BOOK`

This identity is Book-owned and is not added to the frozen B01 11-capability provider-binding registry.

Required binding fields:

```text
binding_schema_version = "1"
binding_id
binding_digest
current_capability_id = "BOOK.SOURCE_RECOVERY.RECOVER_EXISTING_BOOK"
current_owner_path = "SYSTEM_MASTER/BOOK"
adapter_id = "BOOK_EXISTING_BOOK_RECOVERY_ADAPTER_V1"
adapter_version
recovery_engine_id = "BOOK-SYSTEM-EXISTING-BOOK-RECOVERY-SEMANTIC-CORE-001"
recovery_profile_version = "EBR-SEMANTIC-PROFILE-001"
recovery_engine_subject_ref
b01_execution_freeze_ref = "BOOK-RECONSTRUCTION-B01-F-CONTROL-FREEZE-001"
source_acceptance_schema_version = "1"
projection_schema_version = "1"
registered_idempotent = true
canonical_write_authority = false
lifecycle_transition_authority = false
author_decision_authority = false
publication_authority = false
```

The binding digest covers all semantic fields except the id/digest themselves.

### B01 compatibility law

B02 recovery is a deterministic Book-internal domain operation over already accepted immutable inputs. It may use B01 durable coordination, checkpoint, retry/reconciliation and evidence laws, but it must not:

- add a twelfth provider capability to B01's frozen 11-capability `BookCapabilityBindingV1` registry;
- reactivate any `PROSE.*` dispatch identity;
- introduce a second scheduler/retry/workflow authority;
- weaken B01 raw/private-content coordination restrictions;
- reinterpret historical provider identity as current Book ownership.

The B02 adapter is a bounded Book domain entry point. If implementation discovers that making it reachable requires changing a frozen B01 semantic invariant rather than using/extending an allowed Book-internal entry point, build stops and the exact affected B01 scope must be reopened explicitly. No silent B01 mutation is permitted.

### Runtime input

```text
book_project_id or recovery_session_id
reentry_mode = RECOVER_EXISTING | NEW_EDITION
prior_edition_ref when NEW_EDITION
source_acceptance_refs[]
projection_acceptance_refs[]
```

Every projection must bind exactly one accepted source. Every accepted source used in the recovery request must have one admitted projection for the requested recovery run.

### Logical operation identity

The recovery operation identity includes:

- exact `BookRecoveryRuntimeBindingV1` digest;
- Book project/recovery anchor;
- re-entry mode;
- prior-edition identity when applicable;
- sorted source acceptance digests;
- sorted projection digests;
- existing recovery profile/recovery key.

Any changed source, projection, provider/extractor identity, adapter version, engine subject, profile version or prior-edition identity creates a new operation identity, never a retry of the old operation.

### Retry/checkpoint law

Because native extraction is outside this runtime operation and semantic recovery is deterministic over accepted inputs, the Book recovery operation is registered idempotent.

- identical completed operation -> reuse verified result/receipt;
- interrupted operation -> resume from validated checkpoint when checkpoint identity matches exact operation identity;
- changed semantic input -> new operation;
- unknown or contradictory durable state -> `BLOCKED_RECONCILIATION` until reconciled;
- no completed verified recovery is redispatched merely because the caller retries.

## Existing semantic recovery engine lock

`system-master/book-system/existing-book-recovery.js` remains the semantic recovery core and is **KEEP-AS-IS** for B02-C.

The runtime adapter may validate, load accepted projections, invoke the engine, persist bounded coordination/evidence records and translate fail-closed errors. It may not rewrite recovery semantics during D1/D2 unless a design-lock addendum first records a newly discovered requirement that cannot be met by adaptation.

Recovery output remains proposal/evidence state with standing:

`PROPOSED_RECOVERED_BASELINE__AWAITING_GOVERNED_ADMISSION`

No recovery output may directly mutate canonical Book state.

## Contract 4 — BookRecoveredBaselineAdmissionV1

The already-designed recovery-specific governed-admission contract is retained and becomes the exact bounded composition target.

Required semantic input identity:

```text
admission_operation_id
admission_operation_digest
book_project_id
current_book_state_version
current_book_state_digest
current_manuscript_id
current_manuscript_version
current_manuscript_digest
recovery_baseline_id
recovery_baseline_digest
selected_candidate_id
selected_candidate_content_digest
source_acceptance_ids_and_digests[]
projection_ids_and_digests[]
author_decision_id
author_resolution_receipt_id
author_resolution_receipt_digest
prior_edition_ref // when NEW_EDITION
unit_evidence[]   // when unit-level admission is requested
```

The admission operation digest covers all semantic fields above. Mutable timestamps and UI metadata do not define admission identity.

### Prepare law

Preparation has zero canonical effect and must fail closed unless:

1. baseline standing is exactly proposed/awaiting governed admission;
2. baseline id/digest validates;
3. exactly one candidate is selected;
4. no `BLOCKING` recovery finding remains;
5. selected candidate/source provenance is complete;
6. all source/projection identities match the recovery baseline;
7. current BookProject/manuscript identity matches the ratification subject;
8. author decision/receipt is current and passes the frozen author-decision applicability guard;
9. NEW_EDITION prior-edition identity is exact when required;
10. requested unit admission has exact per-unit evidence.

### Commit law

The bounded composition executes in this order:

1. revalidate every prepare precondition against current state;
2. run existing author-decision applicability guard;
3. call existing Book content-admission/version authority to create one immutable manuscript successor;
4. bind the successful admission receipt to the exact recovered baseline/candidate/source/projection/author-decision identity;
5. call existing lifecycle current-parent rebind for the exact admitted successor;
6. emit the recovery admission receipt and an exact-next lifecycle directive;
7. do **not** change lifecycle status as a side effect.

The recovery adapter never becomes a second canonical-write authority. Canonical content mutation still occurs only through the existing Book admission boundary.

### Admission idempotency/reconciliation law

The exact admission operation identity is create-once.

- same operation already committed -> return/reuse the existing verified receipt;
- parent/current manuscript changed before commit -> stale, fail closed;
- canonical admission committed but lifecycle rebind outcome is unknown/failed -> enter `RECONCILE_REQUIRED__ADMISSION_COMMITTED__LIFECYCLE_REBIND_PENDING`; never repeat canonical admission;
- reconciliation may complete only the missing lifecycle rebind after proving the already-admitted successor identity;
- contradictory outcome -> `BLOCKED_RECONCILIATION`;
- changed baseline/candidate/author decision/parent/source/projection -> new operation identity.

## Command interface lock

B02 exposes the following logical commands only:

1. `AcceptOriginalBookSourceV1` — validate provider object identity/digest and Book rights/custody/private-source evidence; emit `BookSourceCustodyAcceptanceV1`.
2. `AcceptNormalizedBookSourceProjectionV1` — validate exact source binding, extractor identity and normalized projection; emit projection acceptance identity.
3. `RecoverExistingBookV1` — invoke `BOOK.SOURCE_RECOVERY.RECOVER_EXISTING_BOOK` on accepted projections; emit proposal/evidence only.
4. `PrepareRecoveredBaselineAdmissionV1` — validate readiness and exact current-subject author ratification; no canonical effect.
5. `CommitRecoveredBaselineAdmissionV1` — bounded composition into existing Book content admission and lifecycle rebind.

No command above grants publication/export-freeze authority.

## Query interface lock

Read-only queries:

- `GetBookSourceAcceptanceStatusV1`
- `GetExistingBookRecoveryStatusV1`
- `GetExistingBookRecoveryEvidenceV1`
- `GetRecoveredBaselineAdmissionReadinessV1`

Queries are projections only. They cannot mutate state or infer missing authority.

## Evidence/event record lock

B02 records immutable evidence classes rather than relying on UI/chat state:

- `BOOK_SOURCE_ACCEPTED`
- `BOOK_SOURCE_ACCEPTANCE_BLOCKED`
- `BOOK_SOURCE_PROJECTION_ACCEPTED`
- `BOOK_RECOVERY_STARTED`
- `BOOK_RECOVERY_CHECKPOINTED`
- `BOOK_RECOVERY_PROPOSED`
- `BOOK_RECOVERY_BLOCKED`
- `BOOK_RECOVERY_ADMISSION_PREPARED`
- `BOOK_RECOVERY_ADMISSION_COMMITTED`
- `BOOK_RECOVERY_ADMISSION_RECONCILE_REQUIRED`

These records bind exact semantic identity/digests. They are evidence/coordination records, not a second event-sourced canonical Book aggregate.

## Persistence and privacy lock

### External/shared immutable source/artifact storage

May hold:

- original PDF/DOCX/image/native bytes;
- provider-versioned source objects;
- normalized projection artifacts;
- provider extraction/OCR artifacts and fidelity evidence.

### Book durable coordination storage

May hold:

- source acceptance receipts/digests;
- provider/object/locator refs;
- projection refs/digests;
- recovery binding/operation identity;
- checkpoints/status;
- recovery baseline identity/digest and bounded proposal metadata;
- evidence refs;
- admission operation status/receipts.

It must not silently duplicate original raw bytes, full manuscript text, secret author data, provider chain-of-thought, publication credentials or canonical mutation commands.

### Canonical Book storage

Changes only after successful existing Book admission. Historical versions/editions remain immutable and addressable.

## Blocker taxonomy lock

The B02 build/qualification must use explicit non-overlapping blocker classes at minimum:

- `BLOCKED_CUSTODY_EVIDENCE`
- `BLOCKED_SOURCE_STALE`
- `BLOCKED_RIGHTS_OR_PRIVATE_AUTHORITY`
- `BLOCKED_PROVIDER_SUBJECT_UNADMITTED`
- `BLOCKED_PROVIDER_UNAVAILABLE`
- `BLOCKED_EXTRACTION_FIDELITY_UNPROVED`
- `BLOCKED_NORMALIZED_PROJECTION_INVALID`
- `BLOCKED_RECOVERY_AMBIGUITY`
- `BLOCKED_AUTHOR_DECISION`
- `BLOCKED_CURRENT_PARENT_STALE`
- `BLOCKED_PER_UNIT_EVIDENCE`
- `BLOCKED_RECONCILIATION`
- `BLOCKED_EXTERNAL_SETUP`
- `BLOCKED_A01_REQUIRED`

Missing evidence never converts to PASS.

## Error/fail-closed lock

At minimum, deterministic runtime errors must distinguish:

- invalid source acceptance schema/digest;
- provider subject/contract/object identity missing;
- source digest/length mismatch;
- rights/custody/private-source rejection;
- stale source object/version;
- invalid projection schema/digest;
- projection/source acceptance mismatch;
- extractor identity missing or changed;
- recovery binding stale/missing;
- recovery engine subject mismatch;
- recovery ambiguity/blocking finding;
- author decision missing/stale/mismatched;
- current parent/manuscript stale;
- per-unit evidence absent/invalid;
- canonical admission conflict;
- lifecycle rebind reconcile-required;
- retired Prose identity presented as current execution identity.

Errors do not self-repair by guessing provider, source, author or canonical identity.

## Frozen isolated qualification denominator — 72 cases

B02-C freezes **72 isolated deterministic cases before build**. The denominator may grow only if build discovers a previously unaccounted requirement; it may not shrink to obtain PASS.

### S01-S20 — source custody + normalized projection

- S01 valid immutable/versioned source acceptance succeeds.
- S02 source digest mismatch blocks.
- S03 source byte-length mismatch blocks.
- S04 missing provider subject blocks.
- S05 missing immutable object/version identity blocks.
- S06 rights scope mismatch blocks.
- S07 stale/expired/revoked/conflicting rights evidence blocks.
- S08 required private-source evidence missing blocks.
- S09 policy semantics not understood yields review/block, not acceptance.
- S10 source acceptance digest tamper blocks.
- S11 same semantic source acceptance is create-once/reusable.
- S12 changed provider contract/subject creates changed source acceptance identity.
- S13 re-resolution of exact same object/digest/length succeeds.
- S14 same display locator with changed bytes becomes stale.
- S15 valid normalized projection acceptance succeeds.
- S16 projection bound to wrong source acceptance blocks.
- S17 projection digest tamper blocks.
- S18 missing/invalid recovered-content digest blocks.
- S19 whole-manuscript recovery remains possible when unit evidence is absent, while unit admission is explicitly blocked.
- S20 invalid/mismatched unit digest/locator evidence blocks unit admission.

### R01-R16 — recovery runtime wiring

- R01 exact current recovery capability identity is required.
- R02 retired `PROSE.*` recovery identity is rejected.
- R03 B02 adapter owner is exactly `SYSTEM_MASTER/BOOK`.
- R04 exact recovery engine/profile subject is required.
- R05 recovery requires accepted sources and accepted projections only.
- R06 missing or mismatched accepted source/projection blocks before engine invocation.
- R07 identical accepted inputs produce identical recovery operation identity/recovery key.
- R08 valid checkpoint resumes the same exact operation.
- R09 verified completed recovery is not redispatched on replay.
- R10 changed source acceptance creates a new operation identity.
- R11 changed projection/extractor identity creates a new operation identity.
- R12 changed adapter/engine/profile identity creates a new operation identity.
- R13 unknown/contradictory durable recovery state requires reconciliation.
- R14 raw original/manuscript bytes are rejected from coordination state.
- R15 recovery output remains proposed/noncanonical and preserves blockers/ambiguity.
- R16 recovery evidence receipt binds exact capability/binding/source/projection/operation/result identity.

### A01-A16 — governed admission + lifecycle composition

- A01 valid baseline + exact current-subject ratification admits one immutable manuscript successor.
- A02 recovery output cannot directly mutate canonical state.
- A03 missing author decision/receipt blocks.
- A04 stale/mismatched author decision blocks.
- A05 tampered baseline/candidate digest blocks.
- A06 zero or multiple selected candidates block.
- A07 any `BLOCKING` recovery finding blocks.
- A08 changed current BookProject/manuscript parent blocks stale admission.
- A09 NEW_EDITION preserves prior-edition identity/history without overwrite.
- A10 successful recovery admission does not change lifecycle status.
- A11 lifecycle rebind targets the exact admitted successor/current-parent lineage.
- A12 replay of the same committed admission returns/reuses one verified effect.
- A13 admission committed + lifecycle rebind unknown enters reconcile-required without duplicate admission.
- A14 reconciliation may complete only the missing lifecycle rebind after proving the admitted successor.
- A15 unit admission succeeds only with exact unit digest/locator/provider evidence.
- A16 recovery/admission never grants export-freeze/publication authority.

### X01-X20 — adversarial locks carried from B02-B

- X01 original-source digest does not match provider object/locator -> block.
- X02 locator resolves to changed bytes under the same display name -> stale/block.
- X03 provider/extractor subject missing and caller attempts guess/default -> block.
- X04 normalized projection supplied without accepted custody/source evidence -> block.
- X05 projection or recovered-content digest changes after acceptance -> block.
- X06 stale/revoked/conflicting rights/private-use evidence -> block.
- X07 raw manuscript bytes leak into durable workflow coordination state -> reject.
- X08 historical `PROSE.*` identity presented as current recovery dispatch identity -> reject.
- X09 implementation attempts to modify the frozen B01 11-capability provider registry to wire recovery -> fail design compatibility gate.
- X10 second scheduler/retry/workflow authority introduced for recovery -> reject.
- X11 recovery output attempts direct canonical mutation -> reject.
- X12 provider output claims author ratification or publication authority -> reject.
- X13 ambiguous revision heads are auto-selected without governed decision -> reject.
- X14 `BLOCKING` recovery finding ignored during admission -> reject.
- X15 stale author ratification replayed after current manuscript/BookProject change -> reject.
- X16 NEW_EDITION recovery overwrites prior-edition history -> reject.
- X17 lifecycle status advances as a side effect of recovery admission -> reject.
- X18 chapter/scene/unit admission proceeds without exact per-unit evidence -> reject.
- X19 synthetic mechanics are represented as native PDF/DOCX/OCR fidelity proof -> reject evidence claim.
- X20 historical recovery PASS is transferred to changed current bytes/contracts -> reject evidence claim.

`20 + 16 + 16 + 20 = 72`.

## Cumulative B00-B02 qualification lock

Before B02 freeze, qualification must freshly compose on the exact B02 candidate subject:

1. B02 isolated denominator: 72/72 deterministic cases, unless an admitted design-lock addendum increases the denominator;
2. frozen B01 isolated denominator: 64/64 freshly rerun or exact current harness proving unchanged frozen B01 behavior on the B02 candidate integration subject;
3. B00 Q001-Q096 and PRE01-PRE21 cumulative invariants freshly rerun or exact current harness proving the same frozen behavior;
4. recovered/current existing-book-recovery mechanics tests rerun against the exact current engine/adapter subject; historical PASS does not transfer;
5. rights/custody evidence direct tests and any changed durable-store/evidence/admission direct tests rerun;
6. B00-B02 cumulative integration proving source acceptance -> recovery proposal -> author-gated admission -> lifecycle rebind without authority widening.

Synthetic deterministic PASS cannot be relabeled as native/provider, real-book, private-source, human/author, publication, production or A-01 proof.

## Calibration/evidence classes

### Deterministic

May be satisfied by the frozen 72-case denominator plus cumulative current-subject regression.

### Native/provider fidelity

Requires real PDF/DOCX/OCR/provider execution evidence on exact provider subjects. Until available, preserve explicit blocker(s); do not synthesize PASS.

### Real-book recovery

Requires admissible real-book/manuscript recovery evidence sufficient to evaluate structural/version recovery behavior on representative long-form material. Synthetic fixtures prove mechanics only.

### Human/author

Required where recovery ambiguity, authoritative-version selection, usefulness or ratification depends on the author/human authority. Machine output cannot substitute.

### Private-source handling

Requires actual permission and environment evidence when private manuscripts are used. No private-source standing is inferred from schema validation.

### Production/device/A-01/publication

Remain separate external authority classes and may remain blocked through B02 if exact evidence is unavailable.

## Build order lock

Implementation is admitted only in this order:

1. **B02-D1 — ORIGINAL-SOURCE CUSTODY ACCEPTANCE + NORMALIZED-PROJECTION CONTRACT BUILD**
   - implement `BookSourceCustodyAcceptanceV1` validator/receipt;
   - bind existing rights/custody evidence core;
   - implement `BookNormalizedSourceProjectionV1` validator/acceptance;
   - implement S01-S20 tests;
   - no recovery-engine rewrite; no admission mutation.

2. **B02-D2 — RECOVERY RUNTIME ADAPTER BUILD**
   - implement `BookRecoveryRuntimeBindingV1`;
   - make existing semantic recovery reachable through the one Book-owned recovery command;
   - reuse B01 execution laws/substrate without mutating the frozen 11-capability provider registry;
   - implement R01-R16 tests.

3. **B02-D3 — GOVERNED RECOVERY ADMISSION + LIFECYCLE REBIND COMPOSITION BUILD**
   - implement the preserved recovery governed-admission contract as a bounded adapter;
   - bind exact current-subject author-decision applicability;
   - reuse existing content admission/version and lifecycle rebind authority;
   - implement A01-A16 and X01-X20 tests.

4. **B02-E — ISOLATED + CUMULATIVE QUALIFICATION/CALIBRATION**
   - run frozen 72 B02 cases plus required B00/B01 cumulative regressions on the exact candidate;
   - collect real native/provider/real-book/human/private evidence where available;
   - preserve exact blockers where external evidence remains unavailable.

5. **B02-F — CONTROL FREEZE**
   - freeze only with unaccounted B02 requirements = 0, required deterministic/current-subject evidence valid, and every external evidence gap represented by an exact blocker rather than synthetic PASS.

Each build stage must re-read the live Book head before mutation and preserve rollback-friendly commit boundaries.

## B00/B01 invariant check

This design does not reopen B00 or B01.

Mandatory preserved invariants include:

- Book canonical admission is the terminal content-mutation boundary;
- author decisions are never synthesized;
- rights/private-source authority is evidence-bound and fail-closed;
- immutable source/current-subject identity is exact and stale changes fail closed;
- historical versions/editions remain immutable;
- old `PROSE.*` execution identity remains retired;
- B01 remains the execution foundation;
- B02 creates no parallel scheduler/router/retry/workflow authority;
- raw/private manuscript bytes are not silently persisted into coordination state;
- provider/recovery success never implies canonical, publication, production or A-01 standing.

If D1/D2/D3 implementation evidence contradicts one of these frozen invariants, stop and reopen only the exact invalidated earlier scope before continuing.

## Design-lock closure accounting

B02-B design-lock obligations frozen: **12 / 12**

B02-B adversarial locks incorporated: **20 / 20**

B02 ledger requirements represented by locked owner/interface/evidence/build path: **50 / 50**

Frozen B02 isolated deterministic denominator: **72**

Unresolved design decisions: **0**

Implementation performed by this artifact: **0**

## Exactly one dependency-valid successor

`BOOK-RECONSTRUCTION-B02-D1 — ORIGINAL-SOURCE CUSTODY ACCEPTANCE + NORMALIZED-PROJECTION CONTRACT BUILD`

B02-D1 is the sole admitted successor.

It may implement only the custody/projection acceptance boundary and S01-S20 tests defined above. It may not yet wire the recovery runtime, implement governed admission, mutate the frozen B01 11-capability provider registry, claim native/provider fidelity, claim Book completion or skip directly to B02-D2/D3/E/F.