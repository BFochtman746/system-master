# CONTROLLER V2 — EXECUTION-001B RETIRED DRAFT FORENSIC ADJUDICATION 001

Status: **RETIRED DRAFT AUDITED / BUILD CONTRACT PRESERVED / REIMPLEMENTATION REQUIRED / NO PASS TRANSFER**

Working branch: `controller-v2/execution-001b-forensic-restart`
Base live Controller continuation reread before mutation: `controller-v2/foundation-006-c1-rebind@73823a31e58e2083549a7916afbfed6065f7113d`
Frozen execution predecessor: `EXECUTION-001A-WORK-GRAPH-ELIGIBILITY-QUALIFICATION-RECEIPT-001.md`
Exact qualified EXECUTION-001A subject: `0991aeb39a1de71d1755ed6e5f5039ae6f3a7a05`
Frozen 001B design inputs:
- `EXECUTION-001B-WORKER-CAPABILITY-DISPATCH-RECOVERY-INVENTORY-001.md`
- `EXECUTION-001B-WORKER-BINDING-DISPATCH-DESIGN-LOCK-001.md`
- `EXECUTION-001B-WORKER-BINDING-DISPATCH-DESIGN-REPAIR-R1-001.md`
- `EXECUTION-001B-WORKER-BINDING-DISPATCH-DESIGN-REPAIR-R2-001.md`

Retired implementation subject inspected: `edc1cd12a86a92738f138bc51f159f19c841eadb`
Retirement commit: `73823a31e58e2083549a7916afbfed6065f7113d`
Historical/retired draft PASS transfer: **0**
Production Controller activation: **BLOCKED_EXTERNAL_SETUP**

## 1. Why this audit exists

The retired `worker-dispatch-kernel.js` implementation was intentionally removed before qualification. It is not executable authority and must not be restored blindly. This audit reuses it only as implementation archaeology against the frozen WDI-001..060 contract and R1/R2 repairs.

The governing rule remains:

`RECOVER -> INVENTORY -> ANALYZE -> TARGETED RESEARCH -> ADJUDICATE -> DESIGN-LOCK -> BUILD -> ISOLATED QUALIFICATION -> CUMULATIVE REGRESSION/CALIBRATION -> FREEZE`

EXECUTION-001B is already design-locked. This artifact performs the mandatory pre-build forensic comparison of the retired bytes against that lock so the next implementation does not repeat known defects.

## 2. Preserved authority boundaries

The following are unchanged and are not reopened by this audit:

- semantic command / transaction admission remains Foundation-006;
- dependency eligibility / READY remains EXECUTION-001A;
- durable lease / resource-generation / fencing remains the qualified claim authority;
- ambiguous external send authority remains Foundation-003 external-effect authority;
- local transport authentication remains Foundation-005 and is not semantic worker authorization;
- durable journal / outbox remains the existing Controller authority;
- worker identity, delegation validity, real capability attestation, human approval and credential issuance remain external authorities;
- Controller may persist immutable references/digests/verifier-policy facts but may not invent those external truths;
- no CORE / LEARNING / BOOK / DOCUMENTS specialist semantics are admitted here.

## 3. Retired draft findings

### RD-001 — dispatch-envelope protocol overwrite — **BLOCKING DEFECT**

The retired helper constructed:

```js
return { protocol: WORKER_DISPATCH_ENVELOPE_PROTOCOL, dispatch_id: row.dispatch_id, ...dispatchIdentity(row) };
```

but `dispatchIdentity(row)` itself contains `protocol: WORKER_DISPATCH_PROTOCOL`. JavaScript spread order therefore overwrites the envelope protocol with `controller.worker-dispatch/v1`.

The persisted `request_digest` was created from an envelope using `controller.worker-dispatch-envelope/v1`, so the retired runtime's reconstructed envelope cannot hash to the persisted digest. This violates R2 and WDI-030/WDI-044 before any physical send is possible.

**Required repair:** `dispatchIdentity()` must not carry a protocol field when spread into an envelope, or `workerDispatchEnvelope()` must explicitly construct all Stage-B fields after Stage-A identity without an overwritable protocol property. The two-stage R2 construction is controlling.

### RD-002 — PREPARED effect creation lacks explicit READY-state reread — **BLOCKING DEFECT**

`prepareWorkerDispatchEffect()` checked current worker binding and lease, then called `prepareExternalEffect()`. Foundation-003 validates operation ownership but does not require the operation to still be `READY` for preparation.

The frozen 001B lock explicitly places preparation while the operation is READY and requires fresh-state reconciliation. Without an explicit READY / executable-transaction reread, a caller could prepare a new dispatch effect after the operation had become RUNNING, CANCELLED, STALE or otherwise non-preparation-eligible.

**Required repair:** before effect preparation, reread operation + transaction and require exact dispatch-preparation standing (`READY` plus executable transaction) in addition to binding/lease/fence checks. No cached earlier READY observation is authority.

### RD-003 — effect identity checks are not complete — **BLOCKING DEFECT**

The retired activation path checked transaction, operation, idempotency key, request digest and effect type, but did not exact-bind both:

- `provider === worker-transport:<executor_kind>`; and
- `target_key === worker_binding_id`.

The retired permit path was narrower still: it checked idempotency key and request digest but not the complete transaction / operation / effect type / provider / target tuple.

A caller-supplied `effect_id` therefore was not proven to be the exact worker-dispatch effect intended by the immutable dispatch record.

**Required repair:** one shared exact effect-binding validator must compare the full expected tuple before activation and again before permit issuance. No provider/target ambiguity is allowed.

### RD-004 — recovery contract does not revalidate transaction subject identity — **BLOCKING DEFECT**

`restoreWorkerDispatchProjection()` verified a recovered execution-contract hash and checked operation transaction/resource binding, but did not reread the transaction's `subject_repo`, `subject_algorithm` and `subject_oid` and compare them to the recovered contract event.

A self-consistent but semantically wrong event could therefore recompute its own content-addressed contract ID while carrying a subject not equal to current recovered Controller transaction truth.

**Required repair:** recovered execution-contract admission must exact-bind transaction + operation + subject + resource exactly as live contract creation does.

### RD-005 — recovered dispatch relation validation is incomplete — **BLOCKING DEFECT**

The retired recovery reducer recomputed the Stage-A dispatch ID and Stage-B request digest but did not independently prove that:

- the referenced contract belongs to the same transaction / operation / resource;
- the referenced worker binding has the same `worker_ref` that was bound to the historical lease identity at creation time, where that relation is available from immutable event facts;
- the dispatch transaction/operation relation is semantically coherent rather than merely satisfying independent foreign keys.

Content-addressing a malformed relation does not make the relation valid.

**Required repair:** recovery must apply the same cross-object semantic binding laws as creation, except that it must not require a live lease row because R1 makes `lease_id` historical identity during fresh-store reconstruction.

### RD-006 — recovered binding/revocation schema validation is too weak — **BLOCKING DEFECT**

The retired binding reducer verified content hashes and capability digest but did not run the full live receipt validators for text, SHA-256 fields, RFC3339 time shape and `valid_until > observed_at`. The revocation reducer inserted event data after only checking that the binding existed.

A journal event can be integrity-valid at the byte level and still be semantically invalid. Recovery must fail closed on semantic invalidity.

**Required repair:** share canonical validators between live creation and recovery; validate exact revocation evidence shape; reject conflicting or malformed revocation evidence; never allow recovery to be a weaker admission path than live mutation.

### RD-007 — authorization path must verify reconstructed envelope immediately before local effect authorization — **REQUIRED HARDENING**

The retired preparation path verified the request digest and the permit path verified it again, but `activateWorkerDispatch()` did not reconstruct and compare the immutable dispatch envelope before calling `authorizeExternalEffectDispatch()`.

R1/R2 require fresh reread and deterministic envelope verification at authority boundaries. Local row corruption or mismatched relation must fail before an authorization attempt becomes UNKNOWN history.

**Required repair:** reconstruct Stage-B envelope and verify `sha256(envelope) === dispatch_intents.request_digest === external_effects.request_digest` immediately before authorization as well as before permit issuance.

### RD-008 — live claim and current binding checks were directionally correct — **REUSE WITH REPAIR**

The retired draft correctly reused:

- current worker-binding standing;
- capability subset checks;
- exact live lease/fence validation;
- Foundation-003 `prepareExternalEffect()`;
- `authorizeExternalEffectDispatch()`;
- the SEALED `getExternalEffectDispatchPermit()` durability barrier;
- no retry counter / no second generic dispatch effect state machine;
- no lease foreign key in `dispatch_intents`, consistent with R1 fresh-store history requirements.

These patterns may be reused after RD-001..007 are repaired and proven by the frozen denominator.

## 4. WDI denominator impact

The frozen **WDI-001..060** denominator is preserved with zero shrinkage. The retired draft is not credited with any PASS.

The defects above map directly to existing mandatory cases and therefore do not require weakening or replacing the denominator:

| Finding | Required cases that must catch it |
|---|---|
| RD-001 envelope protocol overwrite | WDI-030, WDI-044, WDI-006 |
| RD-002 non-READY preparation | WDI-043, WDI-046, WDI-054, WDI-060 |
| RD-003 partial effect identity | WDI-043..049, WDI-060 |
| RD-004 recovered subject mismatch | WDI-005, WDI-006, WDI-021, WDI-027 |
| RD-005 recovered relation mismatch | WDI-005, WDI-006, WDI-029..042, WDI-056 |
| RD-006 weak recovery validators | WDI-005..006, WDI-012..020, WDI-056 |
| RD-007 missing pre-authorization digest check | WDI-044, WDI-047..050, WDI-060 |

Qualification remains:

- isolated WDI: **60/60 required**;
- cumulative Controller suite on the same exact executable subject;
- Ubuntu / Windows x Node 22 / 24 hosted matrix;
- fresh v6 -> v7 migration, restart and fresh-store journal reconstruction;
- no historical PASS transfer;
- no production/native/A-01 standing inferred from hosted tests.

## 5. Exact implementation order

The next build must proceed in this order so defects fail locally before later authority is layered on top:

1. implement canonical Stage-A dispatch identity and Stage-B envelope helpers with protocol overwrite impossible by construction;
2. implement v7 migration and immutable worker binding / revocation state;
3. implement execution-contract creation plus shared live/recovery semantic validators;
4. implement dispatch-intent creation with no live-lease foreign key but mandatory live lease/fence validation at creation;
5. implement recovery reducers using the same semantic validators and full cross-object relation checks;
6. implement PREPARED effect creation with fresh READY + executable-transaction + binding + live fence checks;
7. implement full effect tuple validator and use it before activation and permit;
8. implement pre-authorization envelope digest check;
9. reuse Foundation-003 UNKNOWN / SEALED permit semantics unchanged;
10. run WDI-001..060 before accepting the implementation as an executable candidate;
11. only if 60/60 passes, run the full cumulative hosted matrix and preserve the exact subject/run evidence;
12. freeze only after exact-subject cumulative PASS.

## 6. Gate standing after retired-draft audit

- RECOVER: **PASS**
- INVENTORY: **PASS**
- ANALYZE: **PASS, including retired draft byte-level comparison**
- TARGETED RESEARCH: **PASS / no additional external research required for the defects found**
- ADJUDICATE: **PASS**
- DESIGN-LOCK: **PASS with R1 + R2 controlling**
- BUILD: **AUTHORIZED, but retired draft remains removed**
- ISOLATED QUALIFICATION: **NOT RUN on an admitted 001B implementation**
- CUMULATIVE REGRESSION/CALIBRATION: **NOT RUN for 001B**
- FREEZE: **NOT AUTHORIZED**
- PRODUCTION/NATIVE/A-01: **NOT CLAIMED**

## 7. One dependency-valid successor

`CONTROLLER-EXECUTION-001B-WORKER-BINDING-DISPATCH-IMPLEMENTATION-R3-001 — REIMPLEMENT FROM THE FROZEN LOCK + R1 + R2, APPLY RD-001..007 REPAIRS, ADD/EXECUTE WDI-001..060 ON THE EXACT SUBJECT, THEN RUN THE COMPLETE HOSTED CUMULATIVE MATRIX; DO NOT ADD SCHEDULER SELECTION, WORKER SPAWNING OR PROVIDER BUSINESS SEMANTICS.`

No CORE, LEARNING, BOOK or DOCUMENTS owner control is mutated by this work.
