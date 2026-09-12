# BOOK-RECONSTRUCTION-B00-E1 — FORMAL CANONICAL PARENT DESIGN LOCK 001

Status: **DESIGN-LOCKED / BUILD ADMITTED IN DEPENDENCY ORDER / B00 NOT CLOSED / NO QUALIFICATION TRANSFER**

Owner: **SYSTEM_MASTER/BOOK**

Controlling method: `BOOK-SYSTEM-RECONSTRUCTION-BLUEPRINT-001`

Observed live owner head immediately before this write: `book-system/control-v1@e5dd9b15999be4d4e536bd9f7baa8180498f8f87`

Inputs:

- frozen B00-A 30/30 lossless census;
- B00-B1 gap/dependency/failure analysis;
- B00-C1 targeted research;
- B00-D1 authority/schema/store/reconciliation adjudication;
- exact reusable Book runtime and qualification paths present on this owner lineage.

This record freezes the normative B00 reconstruction target. It does not claim implementation, isolated qualification, cumulative regression, native evidence, A-01 evidence, publication authority, legal clearance, or production installation.

## 1. Constitutional design decisions

1. **Exactly one logical canonical Book parent writer.** Current canonical Book/project state is owned only by the canonical parent runtime/store.
2. **Specialist ledgers remain specialist truth.** Version, admission, lifecycle, author-decision, proposal, export-freeze, workflow/evidence and recovery ledgers keep their process/evidence truth but cannot independently declare current parent state.
3. **No generic canonical patch operation.** Canonical mutation is only through enumerated typed effects backed by B00 requirements.
4. **Every effect is exact-current and replay-safe.** Parent version, digest, material subject refs, effect request identity and idempotency fingerprint are checked before mutation.
5. **Canonical commit is transactional.** Parent successor, immutable commit receipt and parent history/index changes that define the effect commit atomically. Eligible Book-owned specialist deltas may join that local transaction as logically separate records.
6. **External/native/human operations never share the parent transaction.** They produce immutable evidence/proposals/decisions; Book re-reads current state and independently admits a typed effect.
7. **Response loss is reconciled, not guessed.** Receipt lookup plus current-state re-read precedes any retry.
8. **Rights/licensing/custody records evidence; it does not manufacture legal authority.** ODRL/SPDX may appear only as exact external references where applicable.
9. **Book owns the governing style/copy-edit profile.** Providers receive immutable projections and may return findings/proposals only.
10. **Private/raw content is excluded from canonical history/effect receipts.** History stores stable refs/digests/minimum metadata.
11. **Technical export never implies publication.** Publication/delivery standing requires a separate explicit authority transition.
12. **Historical PASS never transfers.** Every reconstructed byte requires fresh exact-subject qualification.

## 2. Canonical parent aggregate — schema contract v2

The parent aggregate is one deterministic serializable object with these required top-level fields/concepts:

- `schema_version` — exactly `BOOK_CANONICAL_PARENT_V2` for the first reconstructed implementation;
- `state_version` — positive monotonic integer;
- `state_digest` — deterministic SHA-256 over the canonical digest subject with `state_digest` excluded/blanked by the canonical serializer rule;
- `book_project` — stable Book/project identity and canonical project lifecycle standing;
- `governed_objects` — immutable canonical references/registries required by the recovered v1 model;
- `research_evidence_links` — immutable evidence/source references only, no raw source payload;
- `author_decisions` — finalized current decision records/refs admitted by typed effect;
- `integration_proposals` — admitted proposal records/refs only;
- `rights_custody_records` — accepted/current or historical rights/custody evidence records/refs;
- `style_profiles` — immutable versioned governing style-profile records/refs;
- `export_releases` — immutable freeze/release records;
- `active` — current canonical pointers, including governing brief, canon manifest, Story Bible, Book Plan, canonical manuscript and active style profile where present;
- `authority_metadata` — schema-level authority/fence metadata, never a substitute for per-effect authority evidence;
- `mutation_head` — latest canonical parent commit receipt identity.

### 2.1 Parent schema invariants

- stable Book/project identity cannot change after creation;
- every active pointer targets an admitted immutable object/version/profile in the same Book scope;
- `state_version` increments exactly once per successful effect;
- `state_digest` must match the canonical serializer result;
- current project lifecycle status must be legal under the frozen project transition graph;
- every admitted finalized author decision/proposal/release/rights standing/style-profile change is traceable to an immutable receipt/evidence ref;
- no raw manuscript prose, raw research bytes, private evaluator text, credentials, access tokens or unbounded provider payload may appear recursively in canonical history/receipts;
- an unknown field at a mutation boundary is rejected unless a future schema version explicitly admits it.

## 3. Typed canonical effect envelope v1

Every mutation request has these required fields unless explicitly marked conditional:

- `effect_schema_version = BOOK_PARENT_EFFECT_V1`;
- `effect_request_id` — globally unique immutable request identity;
- `idempotency_key` — stable semantic replay identity;
- `actor_class`;
- `authority_ref` — required when the effect class requires explicit author/external/system authority evidence;
- `expected_parent_state_version`;
- `expected_parent_state_digest`;
- `effect_type`;
- `effect_payload`;
- `effect_payload_digest` — SHA-256 over canonical effect payload;
- `subject_identity_refs` — exact material object/version/source/profile/release refs;
- `evidence_refs`;
- `specialist_receipt_refs`;
- `created_at` — deterministic RFC3339/ISO time supplied by admitted clock boundary;
- `expected_specialist_ledger_identity` — conditional for same-operation specialist rebinds.

The request fingerprint is a deterministic SHA-256 of all semantic fields excluding transport metadata. Exact replay requires the same idempotency key and exact request fingerprint. Conflicting reuse fails closed.

## 4. Enumerated effect vocabulary v1

Only these effect families are admitted by this lock:

- `ADVANCE_PROJECT_STATUS`;
- `SET_ACTIVE_GOVERNING_BRIEF`;
- `SET_ACTIVE_CANON_MANIFEST`;
- `SET_ACTIVE_STORY_BIBLE`;
- `SET_ACTIVE_BOOK_PLAN`;
- `SET_ACTIVE_CANONICAL_MANUSCRIPT`;
- `REGISTER_RESEARCH_EVIDENCE_LINK`;
- `REGISTER_FINAL_AUTHOR_DECISION`;
- `REGISTER_ADMITTED_INTEGRATION_PROPOSAL`;
- `REGISTER_RIGHTS_CUSTODY_RECORD`;
- `REGISTER_STYLE_PROFILE_VERSION`;
- `SET_ACTIVE_STYLE_PROFILE`;
- `REGISTER_EXPORT_RELEASE`;
- `REGISTER_PUBLICATION_AUTHORIZATION` only when explicit current author/external publication authority evidence is present and the separate publication contract has been admitted.

`REGISTER_PUBLICATION_AUTHORIZATION` is design-reserved but BUILD-BLOCKED until its authority evidence contract has an executable current test subject. Technical export/freeze code cannot invoke it implicitly.

No `PATCH`, `MERGE`, arbitrary JSON Pointer update, or provider-defined effect is admitted.

## 5. Canonical store port v1

The constitutional interface is semantics-first and adapter-neutral:

- `createParent(initialParent, createIdentity)` — create-once;
- `readCurrentParent(bookProjectId)`;
- `readCommitReceiptByRequest(effectRequestId)`;
- `readCommitReceiptByIdempotencyKey(idempotencyKey)`;
- `commitEffect(effectEnvelope, preparedSpecialistDelta?)` — one atomic local canonical transaction;
- `readParentCommitReceipt(receiptId)`;
- `listParentHistory(bookProjectId, cursor?)`;
- `recoverAndVerify(bookProjectId)` — integrity/recovery/reconciliation entry;
- `listPreparedEffects(bookProjectId)` when an adapter supports durable prepared effects.

### 5.1 Store semantics

- one-writer serialization or equivalent exact CAS prevents history forks;
- the parent state successor + immutable commit receipt + parent history/index change commit atomically;
- same-transaction specialist changes are logically separate records but share one durability outcome;
- adapter recovery returns either the fully committed transaction or its predecessor, never a half-committed canonical effect;
- integrity/digest mismatch fails closed;
- transient store contention is classified separately from semantic CAS conflict;
- adapter-specific journal mode is not constitutionalized;
- SQLite-like transactional semantics are the preferred local adapter target; a specific Node SQLite API is not required by this lock.

The existing workflow durable store is explicitly excluded from this port and retains `canonical_effect_allowed=false`.

## 6. Parent commit receipt v1

Every committed effect produces one immutable receipt with:

- `receipt_schema_version = BOOK_PARENT_COMMIT_RECEIPT_V1`;
- stable `receipt_id`;
- `book_project_id`;
- effect request ID, idempotency key and request fingerprint;
- effect type and effect payload digest;
- actor class and authority refs;
- exact pre-parent state version/digest;
- exact post-parent state version/digest;
- subject identity refs;
- evidence refs;
- specialist receipt refs;
- specialist pre/post ledger identity where same-transaction eligible;
- predecessor parent commit receipt ref;
- transaction/commit sequence identity;
- committed-at value;
- deterministic receipt digest;
- no raw private content.

A receipt is the durable answer to response-loss replay. It is not permission for later effects to skip current-state re-read.

## 7. Rights / licensing / custody record v1

The Book-owned record is evidence/currentness/acceptance state, not legal judgment.

Required concepts:

- stable record ID/version/digest;
- Book/project identity;
- bound source identity/version/digest/locator when available and authorized;
- evidence issuer/authority identity/ref;
- evidence source/custody ref;
- intended-use scope and bound Book operation class;
- optional ODRL policy/profile/action/constraint refs;
- optional SPDX license expression when actually applicable;
- otherwise opaque exact external policy/contract refs;
- effective/expiry/revocation/currentness data when authoritative evidence provides it;
- privacy evidence ref where relevant;
- last validation/revalidation identity and evidence;
- predecessor/supersession/revocation link;
- one fail-closed disposition.

Admitted dispositions:

`UNKNOWN`, `REVIEW_REQUIRED`, `STALE`, `EXPIRED`, `REVOKED`, `CONFLICTING`, `REJECTED_FOR_SCOPE`, `ACCEPTED_FOR_DECLARED_SCOPE`.

`ACCEPTED_FOR_DECLARED_SCOPE` only means Book has current evidence satisfying the configured acceptance contract for that exact scope. Caller-supplied authorization strings without trusted issuer/evidence/currentness bindings cannot produce this standing.

## 8. Governing style-profile v1

Required concepts:

- stable profile ID/version/digest;
- Book/project identity;
- predecessor profile ref;
- governing brief/canon/protected-language/current author-decision refs that constrain the profile;
- language/locale;
- external human style-guide refs plus edition/version when applicable;
- spelling/usage/terminology conventions as bounded structured metadata/refs;
- protected term/language refs;
- exceptions/waivers with authority refs;
- standing: `DRAFT`, `CURRENT`, `SUPERSEDED`, `INVALIDATED`;
- invalidation-input digest/currentness identity;
- creation/admission evidence refs.

Only the parent may select the active style-profile pointer. Editing providers receive immutable bounded projections and cannot change parent/profile standing.

## 9. Specialist prepare/commit/reconcile protocol v1

### 9.1 Local Book-owned specialist

A re-bound specialist operation executes in this order:

1. re-read parent + specialist ledger;
2. validate request/authority/currentness;
3. produce deterministic `PREPARED_FOR_PARENT` delta, typed parent effect and specialist receipt candidate without advertising canonical completion;
4. enter canonical store transaction;
5. revalidate expected parent identity and expected specialist identity;
6. commit specialist delta + parent effect atomically as logically separate records when the adapter admits same-transaction storage;
7. return parent commit receipt + specialist receipt identity;
8. on response uncertainty, lookup receipts and reconcile before any retry.

### 9.2 External/native/human specialist

1. obtain immutable evidence/proposal/decision bound to exact subject/source/provider identity;
2. persist only under its proper evidence/queue authority;
3. re-read canonical parent;
4. validate evidence currentness/authority;
5. submit typed effect;
6. parent independently commits or rejects it.

There is no cross-provider distributed transaction and no automatic retry that turns prepared evidence into canonical truth.

## 10. Migration contract from recovered canonical v1

Migration is explicit and one-way into v2 subject qualification:

- validate the recovered v1 fixture with its historical schema rules;
- preserve stable Book/project identity exactly;
- preserve immutable governed object IDs/version refs/history refs;
- map recovered active pointers only after their targets validate;
- map author/proposal/research/export registrations as historical canonical refs, never as fresh human/legal/publication authority;
- initialize rights/custody records only from explicit existing evidence refs; otherwise standing remains `UNKNOWN`/`REVIEW_REQUIRED` as appropriate;
- initialize style-profile registry/pointer only from explicit admitted governing metadata; absence remains absence and is not synthesized;
- preserve current project lifecycle status only if legal in the v2 graph;
- create a migration receipt containing v1 source digest, v2 result digest and migration implementation identity;
- v1 historical qualification does not qualify the v2 result.

## 11. Build decomposition and admission

BUILD is admitted only in this dependency order:

- **F1 — canonical parent pure core**: deterministic schema validation, digesting, effect validation/application, receipt formation, no I/O;
- **F2 — canonical durable store port + first transactional adapter**: crash-safe persistence, CAS/idempotency/receipt/history/recovery;
- **F3 — rights/custody record runtime**;
- **F4 — style-profile runtime**;
- **F5 — version/admission rebind**;
- **F6 — lifecycle rebind**;
- **F7 — author-decision rebind**;
- **F8 — integration-proposal rebind**;
- **F9 — export-freeze/release rebind**;
- **F10 — workflow evidence/recovery seam integration**;
- **F11 — v1 -> v2 migration utility**.

No later F-step may bypass a failed predecessor. Each unit is isolated-qualified before the next mutation-capable unit is admitted unless the frozen test plan explicitly marks a pure non-mutating helper as safe to develop in parallel.

## 12. Exact isolated qualification denominator — 96 required cases

The first complete reconstructed B00 implementation must pass all **B00-E1-Q001..Q096**. Cases are frozen by semantic ID; tests may be reorganized but no case may silently disappear.

### A — Parent schema / identity / digest: Q001-Q012 (12)

Q001 valid v2 parent; Q002 wrong schema version; Q003 missing stable project ID; Q004 attempted identity change; Q005 invalid state version; Q006 digest mismatch; Q007 active pointer missing target; Q008 active pointer foreign Book; Q009 malformed governed object ref; Q010 illegal project status; Q011 unknown mutation field fail-closed; Q012 recursive forbidden raw/private field detection.

### B — Effect / authority / typed vocabulary: Q013-Q024 (12)

Q013 valid typed effect; Q014 unknown effect type; Q015 generic patch rejected; Q016 payload digest mismatch; Q017 actor class disallowed; Q018 required authority ref absent; Q019 subject identity mismatch; Q020 evidence ref malformed; Q021 illegal project transition; Q022 active-pointer target not admitted; Q023 publication effect without explicit current authority rejected; Q024 provider-defined effect rejected.

### C — CAS / idempotency / replay: Q025-Q036 (12)

Q025 exact parent version match; Q026 stale version denied; Q027 stale digest denied; Q028 exact replay returns same receipt; Q029 same idempotency key different fingerprint denied; Q030 same request ID conflicting key denied; Q031 same request ID conflicting payload denied; Q032 one success increments exactly once; Q033 replay does not increment; Q034 stale subject ref denied; Q035 request fingerprint deterministic; Q036 receipt lookup after simulated lost response converges.

### D — transactional durability / recovery: Q037-Q050 (14)

Q037 atomic parent+receipt commit; Q038 atomic history/index update; Q039 validation failure rolls back; Q040 persistence failure before commit leaves predecessor; Q041 simulated failure after commit recovers successor; Q042 reopen current parent; Q043 reopen receipt lookup; Q044 integrity corruption fails closed; Q045 predecessor receipt chain valid; Q046 competing writer one-winner semantics; Q047 transient contention classified separately; Q048 semantic CAS conflict not transient; Q049 recovery never exposes half effect; Q050 adapter restart preserves idempotent replay.

### E — specialist rebind / reconciliation: Q051-Q066 (16)

Q051 prepared specialist not canonical completion; Q052 specialist identity stale before transaction denied; Q053 same-transaction specialist+parent atomic success; Q054 specialist write failure rolls back parent; Q055 parent validation failure rolls back specialist; Q056 response loss reconciles both receipts; Q057 version snapshot never becomes current parent; Q058 admission prepares typed effect only; Q059 lifecycle project transition commits through parent; Q060 lifecycle unit ledger remains specialist truth; Q061 author queue cannot directly mutate parent; Q062 real author choice absence remains blocked; Q063 proposal ledger cannot directly mutate parent; Q064 workflow evidence cannot create canonical effect; Q065 export freeze cannot imply publication; Q066 external/native evidence requires fresh parent re-read.

### F — rights/custody: Q067-Q076 (10)

Q067 accepted current scoped evidence; Q068 caller flag without issuer/evidence rejected; Q069 unknown standing fails closed; Q070 stale evidence rejected; Q071 expired evidence rejected; Q072 revoked evidence rejected; Q073 conflicting evidence rejected; Q074 intended-use mismatch rejected; Q075 source/digest mismatch rejected; Q076 unknown ODRL/profile/external policy semantics cannot upgrade authority.

### G — governing style profile: Q077-Q084 (8)

Q077 valid versioned profile; Q078 stale predecessor/currentness denied; Q079 wrong Book profile denied; Q080 invalid governing brief/canon refs denied; Q081 invalidated profile cannot become active; Q082 active pointer change only by typed parent effect; Q083 provider projection cannot mutate profile/parent; Q084 changed invalidation inputs force currentness failure/re-adjudication.

### H — privacy / native / publication boundaries: Q085-Q090 (6)

Q085 parent history stores refs/digests not raw manuscript; Q086 rights record stores no raw private source bytes; Q087 provider/native receipt exact source identity mismatch rejected; Q088 native fidelity not inferred from normalized semantic output; Q089 export PASS remains publication-not-authorized; Q090 publication authority expiration/revocation blocks publication effect.

### I — migration / cumulative seam behavior: Q091-Q096 (6)

Q091 valid v1 fixture -> deterministic v2 migration; Q092 invalid v1 fixture rejected; Q093 absent rights evidence migrates fail-closed; Q094 absent style metadata is not invented; Q095 lifecycle compatibility projection cannot introduce out-of-scope parent delta; Q096 migrated v2 exact result receives new digest/receipt and does not inherit historical PASS.

**Isolated denominator = 96 / 96 required. No partial PASS closes reconstructed B00.**

## 13. Frozen cumulative predecessor regression set

After F1-F11 are integrated, cumulative regression must run the 96-case reconstructed denominator plus current exact predecessor harness families on the reconstructed subject. At minimum the following current scripts, identified on the design-lock lineage, are mandatory unless superseded by an explicitly lossless successor that cites this lock:

- `.github/scripts/book-system-canonical-state-001-qualify.js`;
- `.github/scripts/book-system-version-and-rollback-001-qualify-v2.js`;
- `.github/scripts/book-system-content-object-admission-001-qualify.js`;
- `.github/scripts/book-system-content-admission-author-decision-applicability-guard-004-qualify.js`;
- `.github/scripts/book-system-lifecycle-transition-001-qualify.js`;
- `.github/scripts/book-system-lifecycle-current-parent-compatibility-001-qualify-v2.js`;
- `.github/scripts/book-system-lifecycle-current-parent-rebind-001-qualify.js`;
- `.github/scripts/book-system-author-decision-queue-001-qualify-v2.js`;
- `.github/scripts/book-system-author-decision-current-subject-guard-001-qualify.js`;
- `.github/scripts/book-system-integration-proposal-runtime-002-qualify.js`;
- `.github/scripts/book-system-export-freeze-001-reconciled-qualify.js`;
- `.github/scripts/book-system-existing-book-recovery-semantic-core-001-qualify-v2.js`;
- `.github/scripts/book-system-e2e-authority-guards-001-qualify.js`;
- `.github/scripts/book-system-end-to-end-authoring-001-qualify-v2.js`;
- `.github/scripts/book-workflow-orchestrator-authority-contract-001-qualify.js`;
- `.github/scripts/book-workflow-orchestrator-book-admission-handoff-001-qualify.js`;
- `.github/scripts/book-workflow-orchestrator-concurrency-rules-001-qualify.js`;
- `.github/scripts/book-workflow-orchestrator-failure-semantics-001-qualify.js`;
- `.github/scripts/book-workflow-orchestrator-retry-idempotency-rules-001-qualify.js`;
- `.github/scripts/book-workflow-orchestrator-cancellation-resume-001-qualify.js`;
- `.github/scripts/book-workflow-orchestrator-evidence-provenance-emission-001-qualify.js`.

A historical pass of any listed harness is evidence of predecessor behavior only. Cumulative closure requires fresh execution on the exact reconstructed subject or an exact tree-equivalent subject with preserved executable-tree proof.

## 14. 30-row design destination closure

Every B00.001-B00.030 row now has a design destination:

- parent identity/schema/current pointers/project status -> canonical parent v2;
- immutable object/version lineage/rollback -> existing version/admission substrate re-bound through parent typed effects;
- author/proposal/lifecycle/export workflows -> existing specialist ledgers re-bound through prepare/commit/reconcile;
- research/source/evidence -> immutable refs plus rights/custody acceptance contract;
- style/copy-edit governance -> Book style-profile registry + parent active pointer;
- workflow/evidence/private/native/publication boundaries -> explicit evidence/reference/fail-closed interfaces;
- concurrency/idempotency/history -> parent store transaction + commit receipt + reconciliation protocol.

Design-unaccounted B00 rows: **0**.

## 15. Build admission gate

F1 BUILD is admitted because:

- B00-A archaeology is frozen at 30/30 accounted;
- design-sensitive targeted research is closed;
- truth ownership and durable-state boundaries are adjudicated;
- parent/store/rights/style/reconcile contracts are frozen;
- 96 exact isolated qualification cases are frozen;
- cumulative predecessor harness set is frozen;
- external/human/private/native/publication/A-01 boundaries remain explicit.

This admission does not authorize direct mutation of live canonical Book data. Initial implementation must be branch-local, fixture-driven and side-effect-free outside its dedicated test stores.

## 16. Exact next operation

**`BOOK-RECONSTRUCTION-B00-F1 — CANONICAL PARENT V2 PURE CORE BUILD + 36-CASE CORE-SLICE ISOLATED QUALIFICATION`**

F1 shall implement only deterministic schema/digest/effect/CAS/idempotency/receipt logic with no durable I/O. Its minimum gate is E1 Q001-Q036 = **36/36**. Durable transaction/recovery cases Q037-Q050 belong to F2 and are not eligible to be faked by the pure core.

Only after F1 passes fresh exact-subject hosted qualification may F2 mutate the implementation lineage.

## 17. Evidence fences

No real author decision, legal/rights clearance, private-source permission, native fidelity, publication authorization, production installation or A-01 PASS is claimed by this design lock.