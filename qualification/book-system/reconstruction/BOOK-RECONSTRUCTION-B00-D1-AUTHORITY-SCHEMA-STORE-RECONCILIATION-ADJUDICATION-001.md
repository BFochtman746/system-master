# BOOK-RECONSTRUCTION-B00-D1 — AUTHORITY / SCHEMA / STORE / RECONCILIATION ADJUDICATION 001

Status: **ADJUDICATED / DESIGN-LOCK ADMITTED / NO BUILD AUTHORIZATION**

Owner: **SYSTEM_MASTER/BOOK**  
Controlling method: `BOOK-SYSTEM-RECONSTRUCTION-BLUEPRINT-001`  
Observed live owner head immediately before this write: `book-system/control-v1@659602de106b0a73b29d1a44430b6784faf405a6`  
Inputs:

- B00-A frozen 30-row census;
- B00-B1 gap/dependency/failure analysis;
- B00-C1 targeted research;
- current reusable Book runtimes and exact historical evidence described by those records.

## 1. Decision summary

B00 reconstruction will use **one logical canonical Book parent writer** and will reuse existing specialist runtimes behind typed effect/reconciliation boundaries.

The parent writer is the sole authority for current canonical Book/project state. Specialist ledgers retain their process/evidence truth but do not independently persist canonical state.

When a Book-owned specialist operation and parent effect can share one admitted local transaction, they should commit together as logically separate records inside one durability transaction. When an effect crosses an external/native/human boundary, the Book side uses durable prepared/evidence state plus idempotent reconcile; it does not require or simulate distributed two-phase commit.

## 2. Exact truth-owner adjudication

| Concept | Canonical truth owner | Other durable records | Rule |
|---|---|---|---|
| Book/project identity | canonical parent | references everywhere else | immutable after creation |
| current parent schema/version/digest | canonical parent | snapshots/history only | no specialist may declare an alternate current parent |
| active governing brief/canon/Story Bible/Book Plan/manuscript pointers | canonical parent | version ledger lineage | pointers change only by typed parent effect |
| project lifecycle status | canonical parent | lifecycle transition evidence | lifecycle runtime proposes/validates; parent commits |
| unit lifecycle/dependency states | lifecycle ledger | parent may reference summary/current evidence | lifecycle ledger owns unit/process truth |
| immutable governed object versions/lineage | version/admission substrate | parent registry/current pointers | object bytes/metadata immutable; parent chooses current canonical refs |
| author decision workflow | author-decision queue | parent finalized accepted decision records/refs | human choice never synthesized; queue cannot commit parent directly |
| integration proposal workflow | proposal ledger | parent admitted proposal records/refs | proposal process is not canonical content state |
| workflow coordination/checkpoints/evidence | workflow stores/receipts | parent evidence refs only | `canonical_effect_allowed=false` remains absolute |
| export validation/freeze workflow | freeze ledger/receipt | parent export release record | technical freeze is not publication authority |
| publication/delivery standing | canonical parent after explicit authority evidence | release/author/external evidence refs | never inferred from export PASS |
| rights/license/custody evidence | Book rights/custody evidence registry plus external/human evidence refs | parent current accepted standing/reference | Book validates/binds evidence; it does not create legal authority |
| governing copy-edit/style profile | Book style-profile registry + parent active profile ref | provider projections/findings | provider cannot select or mutate governing profile |

## 3. Canonical parent aggregate v2 target

This is a reconstruction target evolved from the recovered canonical model, not a new domain rewrite.

Required top-level identity:

- `schema_version`;
- `state_version`;
- `state_digest`;
- `book_project`;
- governed object registries already required by the recovered v1 model;
- `research_evidence_links`;
- `author_decisions`;
- `integration_proposals`;
- `export_releases`;
- `active` pointers;
- `authority_metadata`;
- `mutation_head`.

New requirements-backed additions permitted by the B00-A census:

- rights/custody evidence/standing references needed by B00.009;
- style-profile registry/current pointer needed by B00.027.

No generic untyped `metadata` or unrestricted JSON patch surface is admitted as canonical mutation authority.

## 4. Typed parent effect envelope

Every canonical mutation shall enter as a typed effect envelope with at least:

- `effect_schema_version`;
- `effect_request_id`;
- `idempotency_key`;
- `actor_class`;
- `authority_ref` when required;
- `expected_parent_state_version`;
- `expected_parent_state_digest`;
- `effect_type`;
- `effect_payload`;
- `effect_payload_digest`;
- `subject_identity_refs`;
- `evidence_refs`;
- `specialist_receipt_refs`;
- `created_at` / deterministic event-time representation required by the runtime contract;
- optional `expected_specialist_ledger_identity` for same-operation rebinds.

Rules:

1. exact replay of the same idempotency key + request fingerprint returns the stored commit receipt;
2. same key with different request fingerprint fails closed;
3. same request ID with conflicting key/payload fails closed;
4. parent version/digest mismatch fails before mutation;
5. material subject/current-pointer mismatch fails before mutation;
6. effect type determines legal payload schema and actor/authority class;
7. no partial typed-effect execution is committed;
8. every successful effect increments parent state version exactly once and produces a new state digest;
9. every successful effect writes one immutable parent commit receipt;
10. every effect is re-readable/reconcilable after restart.

## 5. Admitted typed effect families

The recovered v1 operation families remain admitted conceptually:

- advance project status;
- set active governing brief;
- set active canon manifest;
- set active Story Bible;
- set active Book Plan;
- set active canonical manuscript;
- register research/source/evidence reference;
- register finalized author decision;
- register admitted integration proposal;
- register export release.

B00-A adds only requirements-backed families:

- register/update rights/custody evidence standing/reference under strict authority rules;
- register style-profile version;
- set active governing style profile.

Any future effect family requires a requirement/owner/invariant change and cannot appear as an implementation convenience.

## 6. Canonical durable store contract

The store is a **port with transactional semantics**, not a file-format promise.

Required operations/semantics:

- create initial parent if absent under create-once identity rule;
- read exact current parent;
- read parent commit receipt by request/idempotency identity;
- execute one atomic parent transaction that may include:
  - expected-current verification;
  - canonical parent successor;
  - immutable parent commit receipt;
  - parent history/index update;
  - logically separate Book-owned specialist ledger changes when the operation is explicitly same-transaction eligible;
- integrity check/recovery on reopen;
- enumerate/reconcile pending prepared effects where applicable;
- transaction rollback on any validation/persistence failure.

Preferred adapter semantics are SQLite-like atomic transactions, serializable/one-writer behavior and crash recovery, but the constitutional port is not bound to a specific Node SQLite API or journal mode.

The existing coordination-only workflow store remains separate and must keep its raw-content/canonical-effect prohibition.

## 7. Parent commit receipt

Each successful canonical effect creates an immutable receipt containing at least:

- receipt schema/version and stable receipt ID;
- effect request ID/idempotency key/request fingerprint;
- effect type/payload digest;
- actor/authority refs;
- exact pre-parent version/digest;
- exact post-parent version/digest;
- material subject refs;
- evidence/specialist receipt refs;
- specialist pre/post ledger identities if committed in the same transaction;
- transaction/commit sequence identity;
- predecessor parent commit receipt ref;
- committed-at identity/time representation;
- no raw private manuscript/source payload.

Commit receipt identity is the durable answer to a response-lost retry. Callers still re-read current parent before subsequent work.

## 8. Specialist effect/reconcile contract

### 8.1 Same-transaction Book-owned specialists

Where an existing Book-owned runtime returns both a specialist ledger successor and a proposed parent successor/effect, reconstruction shall convert that to:

1. validate current parent and specialist ledger;
2. produce a deterministic prepared typed parent effect + specialist delta/receipt;
3. revalidate exact parent/specialist identities inside store transaction;
4. persist the specialist delta and parent effect atomically as logically separate records;
5. return parent commit receipt + specialist receipt identity.

This is preferred for version/admission/lifecycle/author/proposal/export operations when both durable states live behind the same admitted Book store transaction boundary.

### 8.2 External/native/human specialists

External operations never share the canonical database transaction. They return immutable evidence/proposals/decisions with exact subject/source/provider identity. Book then re-reads and independently commits a typed parent effect if still current and authorized.

### 8.3 Prepared-but-not-committed state

If a specialist must durably prepare before parent commit, the specialist state must explicitly say `PREPARED_FOR_PARENT` (or equivalent) and must not advertise canonical completion. Reconcile either commits the still-current effect exactly once or marks the preparation stale/rejected/superseded with evidence. No generic retry promotes it automatically.

## 9. Rights / licensing / custody object adjudication

Book shall persist a versioned **rights/custody evidence record**, not a legal opinion.

Minimum fields/concepts:

- stable record ID/version/digest;
- bound source identity/version/digest/locator as available and authorized;
- evidence issuer/authority identity/reference;
- evidence source/custody reference;
- policy/license expression references:
  - optional ODRL policy/profile/action/constraint references;
  - optional SPDX license expression where actually applicable;
  - opaque external policy/contract refs otherwise;
- intended-use scope and Book operation binding;
- evidence effective/expiry/revocation/currentness data when provided;
- privacy standing evidence reference where relevant;
- validation/revalidation identity and result;
- Book acceptance disposition;
- predecessor/supersession/revocation link;
- no raw private content requirement.

Fail-closed dispositions include at least:

- `UNKNOWN`;
- `REVIEW_REQUIRED`;
- `STALE`;
- `EXPIRED`;
- `REVOKED`;
- `CONFLICTING`;
- `REJECTED_FOR_SCOPE`;
- `ACCEPTED_FOR_DECLARED_SCOPE`.

`ACCEPTED_FOR_DECLARED_SCOPE` means only that Book possesses current evidence satisfying its configured acceptance contract for that scope. It is not a system-generated legal judgment.

Caller-supplied strings such as `CURRENT_AUTHORIZED` are never sufficient without accepted issuer/evidence/currentness bindings.

## 10. Governing copy-edit/style profile adjudication

Book shall persist a compact versioned profile object with at least:

- stable profile ID/version/digest;
- Book/project identity;
- predecessor profile ref;
- governing brief/canon/protected-language/current author-decision refs that materially constrain it;
- language/locale;
- external human style-guide references + edition/version when applicable;
- spelling/usage/terminology conventions as bounded structured metadata/refs;
- protected term/language refs;
- exceptions/waivers with authority refs;
- standing (`CURRENT`, `SUPERSEDED`, `INVALIDATED`, `DRAFT` or equivalent);
- invalidation-input digest/currentness identity;
- creation/admission evidence refs.

The canonical parent owns the active style-profile pointer. A copy-edit provider receives a bounded immutable projection and may return findings/proposals only.

## 11. Parent history and privacy adjudication

Canonical history is append-only identity/effect history, not a full copy of private content at every state.

Persist only the minimum necessary for deterministic recovery/audit:

- parent identity/version/digest;
- typed effect identity/payload digest;
- stable object/version refs;
- authority/evidence refs;
- predecessor receipt/ref;
- specialist receipt refs;
- required rollback/recovery metadata.

Raw manuscript prose, raw research, private source bytes, private evaluator text, credentials/tokens and unbounded provider payloads are forbidden from parent audit/history unless an explicit future requirement and storage/privacy authority changes this rule.

## 12. Retry / contention adjudication

- CAS/currentness conflict is **semantic**, not blindly retryable; re-read and re-adjudicate.
- SQLite/store busy/contention may be **transient** only if no canonical effect is known committed and request identity is idempotent.
- response loss/unknown result triggers receipt lookup + reconcile before retry.
- retries are bounded with backoff/jitter at one selected orchestration layer; lower layers report classified errors rather than stacking autonomous retry loops.
- after any retryable wait, current parent and material specialist/evidence identities are re-read.

## 13. Design-lock qualification denominator classes

Formal DESIGN-LOCK must freeze an exact case denominator covering all of these classes before BUILD:

1. parent schema/identity/integrity;
2. typed-effect payload/actor/authority validation;
3. active-pointer and subject-currentness validation;
4. CAS/idempotency/request-conflict behavior;
5. transaction atomicity/rollback;
6. reopen/crash/recovery/integrity behavior;
7. response-lost replay/reconcile;
8. concurrent competing writers;
9. same-transaction specialist + parent commit;
10. prepared-specialist/reconcile paths;
11. version/admission rebind;
12. lifecycle adapter/rebind;
13. author-decision rebind and human-only fences;
14. proposal/admission rebind;
15. rights/custody evidence/currentness and caller-trust denial;
16. style-profile version/currentness/invalidation/provider-no-write;
17. export freeze/release/publication separation;
18. workflow evidence canonical-effect denial;
19. raw/private payload non-persistence;
20. native/external evidence identity fences;
21. migration/backward compatibility from recovered canonical v1 fixtures;
22. cumulative B00 + B01 seam regression.

## 14. Contradiction resolution

Resolved for DESIGN-LOCK entry:

- parent versus specialist current truth: **one parent writer; specialist process/evidence ledgers**;
- file-store versus database semantics: **transactional store port; SQLite semantics preferred; exact adapter deferred to qualification matrix**;
- ODRL/SPDX versus legal authority: **reference vocabulary only; no authority transfer**;
- style standard versus internal schema: **internal versioned profile**;
- technical export versus publication: **strictly separate**;
- historical Prose artifacts versus current ownership: **provenance only; no Prose lane**.

No unresolved contradiction now requires reopening B00-A or generic external research.

## 15. Standing

- RECOVER: complete for B00-A scope.
- INVENTORY: frozen, 30/30 accounted, unaccounted=0.
- ANALYZE: complete for current census.
- TARGETED RESEARCH: complete for design-sensitive questions.
- ADJUDICATE: **COMPLETE**.
- DESIGN-LOCK: **ADMITTED**.
- BUILD: **NOT ADMITTED**.

## 16. Exact next operation

**`BOOK-RECONSTRUCTION-B00-E1 — FORMAL CANONICAL-PARENT / STORE / RIGHTS / STYLE DESIGN-LOCK + EXACT QUALIFICATION DENOMINATOR`**

E1 must freeze the normative contracts and exact pre-build test denominator. No implementation begins until E1 proves that each B00 row has a requirements-backed design destination and every mutation-capable specialist seam is accounted for.

## 17. Evidence fences

No real author decision, legal clearance, private-source permission, native fidelity, publication authorization, production installation or A-01 PASS is created by this adjudication.