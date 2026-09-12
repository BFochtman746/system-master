# CORE Durable Runtime Continuity Evidence Seam Rebind 001

Status: RECOVER / INVENTORY / ANALYZE / ADJUDICATE / CONSUMER-SIDE DESIGN LOCK COMPLETE  
Current Evidence / Provenance / Assurance provider integration: NOT FROZEN BY THIS UNIT  
Durable Runtime build against this seam: NOT AUTHORIZED YET  
Historical PASS/A-01/native/production transfer: NONE

Exact live Foundation owner reread immediately before mutation:

- `system-master/control-v2@54de1268b1036f966dd9235f5463e430ab1fcd19`
- isolated predecessor: `second-shift/core-durable-runtime-continuity-recovery-001-20260912@53023964d716f621ca6f953a4bf8b4d18d070074`

## 1. Current authority standing

`IMPLEMENTATION-STATUS.md` classifies **Evidence, Provenance & Assurance** as `CURRENT — SUBSTANTIAL`: current verification/evidence/quarantine code and strong historical causal-evidence/qualification substrate exist, while independent trust/checkpoint and whole-chain completion evidence still require closure.

The exact live Foundation owner does not yet expose a dedicated freshly frozen Evidence provider/service subtree comparable to the frozen Identity, Contracts and Keel components. Therefore this unit may freeze the continuity **consumer-side semantic contract** and owner boundaries, but it may not invent a current Evidence service endpoint or claim provider integration complete.

## 2. Current/recovered evidence substrate

### Live F-WP-008 contract substrate

The exact live `f-wp-008/.../VerificationEvidenceContracts.java` contains reusable current semantics:

- explicit `EvidenceClass`;
- explicit standing `CURRENT | STALE | UNKNOWN | CORRUPT`;
- source authority;
- exact subject digest;
- observed/expires timestamps;
- coverage digest;
- content reference rather than requiring raw payload;
- data classification;
- content-bound evidence digest;
- verification criteria declaring required evidence classes and source authorities;
- explicit criterion outcomes including `UNKNOWN`;
- integrity findings;
- verification standing including `VERIFYING`, `FAILED`, `QUARANTINED`.

These semantics are useful, but F-WP Change-specific `changeId/revision` objects do not become generic Evidence authority identities by default.

### Recovered G-WP-012 continuity publisher

`ContinuityEvidencePublisher` carries a useful continuity-specific envelope:

- evidence id;
- subject ref;
- subject digest;
- evidence class;
- source;
- observed time;
- payload digest;
- payload ref;
- durable-intent concept with later backfill.

Its implementation is **not** sufficient as current durable Evidence authority. It appends and rewrites a local text file using `Files.writeString` without an explicit fsync, checksum, OS-lock or atomic rewrite/rename protocol. It is therefore `ADAPT SEMANTICS / QUALIFIER_ONLY STORAGE`, not a production/current Evidence ledger.

### F-WP-008 publisher/quarantine implementations

The already recovered F-WP-008 `EvidencePublisher` and `IntegrityQuarantineService` use in-memory maps. Their no-raw-payload, content-bound receipt and quarantine/reconciliation concepts are reusable, but the implementations are `PROVENANCE_ONLY` for durable current authority.

## 3. Ownership lock

**Evidence, Provenance & Assurance owns:**

- immutable evidence object/receipt identity;
- evidence class and source authority;
- exact subject/digest binding;
- freshness/expiry/invalidation standing;
- claim-support / criterion linkage;
- integrity/quarantine standing;
- qualification evidence classification and the distinction between portable/hosted/native/A-01/production/human/external evidence;
- final verification/assurance standing where the architecture assigns it;
- provenance graph/link semantics.

**Durable Runtime Continuity owns:**

- the fact that a runtime continuity transition requires evidence emission;
- a durable evidence **intent/outbox** coupled to the runtime semantic transaction;
- exact foreign Evidence receipt refs/digests after acceptance;
- retry/delivery cursor for the evidence intent;
- runtime continuity subject/version/fence facts that are supplied as evidence input;
- fail-closed behavior when required Evidence standing is missing/stale/corrupt/unknown.

**Durable Runtime Continuity does not own:**

- Evidence acceptance or canonical Evidence object identity;
- qualification/PASS classification;
- specialist-domain verification truth;
- human/author/participant truth;
- publication/certification standing;
- native/A-01/production standing;
- a duplicate evidence ledger.

Owner collision after adjudication: **0 for the consumer-side boundary**.

## 4. Consumer-side semantic contract freeze

Names below are design identifiers for the consumed semantics. They are not claims that an external service API already exists.

### V1 — ContinuityEvidenceIntent

Runtime-owned durable outbox intent containing:

- immutable intent id;
- exact runtime subject type/id/version/fence;
- exact Work/Job/Attempt refs available from their owners;
- evidence event/type requested;
- proposed evidence class, never a self-issued PASS standing;
- source authority = Durable Runtime for runtime facts only;
- observed logical/time metadata;
- payload/content digest;
- payload/content ref;
- data-class/minimization marker where required;
- contract version/digest;
- semantic idempotency identity/digest.

V1 is not itself accepted Evidence authority truth.

### V2 — EvidenceObjectReceiptRef

Foreign owner receipt/ref required after the Evidence authority accepts or records the evidence object:

- immutable evidence id;
- exact subject ref/digest;
- evidence class;
- source authority;
- observed time;
- expiry/freshness or standing metadata when applicable;
- coverage/claim-support digest or refs where applicable;
- content ref + payload digest;
- data class/minimization status;
- evidence receipt digest/version.

Runtime treats this as immutable foreign truth and does not rewrite it.

### V3 — EvidenceStandingRef

Foreign owner standing used by recovery/completion gates:

- exact evidence/claim/criterion subject;
- standing such as `CURRENT | STALE | UNKNOWN | CORRUPT` or current equivalent;
- evaluation time;
- evidence/source set used;
- invalidation/supersession reason/ref;
- authority id + receipt digest/version.

A cached V3 may be used only within its declared validity/freshness contract. Material subject mutation or expired evidence requires reevaluation.

### V4 — IntegrityQuarantineRef

Foreign owner finding/ref containing:

- finding id;
- exact corrupt/questioned subject/evidence ref;
- reason/category;
- detected-at/source;
- current quarantine standing;
- reconciliation/release evidence refs if later resolved;
- immutable finding digest/version.

Continuity may block on V4 and preserve it in recovery state; it does not unilaterally clear it.

### V5 — QualificationEvidenceClassRef

Foreign Assurance classification for an executed test/evidence result:

- exact executable/evidence subject;
- environment class;
- runner/provider/environment identity sufficient for that class;
- test/requirement denominator refs;
- observed result refs;
- exclusions/unexecuted classes;
- classification digest/version.

The absence of native/A-01/production/human evidence remains absence; hosted/portable evidence cannot be relabeled upward.

## 5. Evidence lifecycle lock

The following invariants are frozen for continuity:

1. **subject-bound** — evidence always names the exact subject/ref/digest it supports;
2. **classed** — evidence class/environment class is explicit, never inferred from repository location or workflow name;
3. **sourced** — source authority is explicit;
4. **freshness-aware** — current/stale/unknown/corrupt is explicit where the claim requires freshness;
5. **content-bound** — payload/content reference is digest-bound;
6. **minimum necessary** — ordinary evidence records store content refs/digests rather than secret/private/raw payload unless an owner-authorized evidence contract explicitly requires otherwise;
7. **non-upgrading** — recording evidence does not itself create PASS/completion/certification/publication/native/A-01/production standing;
8. **immutable history** — later invalidation/supersession changes standing via new owner records/links rather than rewriting historical observations;
9. **material-subject invalidation** — a material digest/version/fence change prevents prior evidence from silently supporting the new subject;
10. **unknown stays unknown** — missing/unavailable/ambiguous evidence cannot be coerced to PASS or FAIL by Runtime;
11. **quarantine is fail-closed** — corrupt/unverifiable evidence blocks any gate that requires it until the Evidence owner resolves standing;
12. **projection only** — UI/telemetry/query projections cannot become canonical evidence standing.

## 6. Durable outbox coupling lock

The P7 `Continuity Evidence Outbox` record family from the persistence design is now frozen semantically:

- when a runtime semantic transition requires continuity evidence, TX1/TX2/TX3/TX4/TX5 commits the state mutation and V1 evidence intent atomically in the same persistence transaction group;
- delivery to Evidence is asynchronous/replayable;
- a lost wakeup or Evidence-provider outage cannot erase V1;
- retry scans durable outbox state and re-reads the current intent/receipt state before publishing;
- the Evidence provider must dedupe/reconcile using V1 semantic identity/digest or an exact mapped request identity;
- once V2 exists, Runtime records the exact receipt ref/digest and may mark the outbox delivery complete;
- duplicate delivery may reproduce/recover the same V2, never create a second semantic evidence object for the same exact V1 unless the Evidence contract explicitly models distinct observations;
- evidence delivery status is not business truth and cannot change Work/Job/effect standing by itself.

The local-text-file `ContinuityEvidencePublisher.backfill()` algorithm is useful behavioral provenance for replay, but its rewrite implementation is not admitted as the durable P7 adapter.

## 7. Invalidation and freshness lock

Continuity must request/re-read Evidence standing when a decision depends on evidence whose subject may have materially changed.

At minimum, the following invalidate cached support unless the Evidence owner explicitly states equivalence:

- executable/content digest change;
- contract/schema version change material to the claim;
- attempt/fence change when evidence is attempt/fence-specific;
- authorization/policy generation change when evidence claims that standing;
- provider/environment change when evidence claims environment-specific behavior;
- migration/transformation that changes the evidence subject;
- expiry;
- new integrity/quarantine finding;
- owner-issued supersession/invalidation.

Historical evidence remains provenance even after it becomes stale; it simply stops satisfying a current gate.

## 8. Qualification-class separation lock

Continuity/Assurance integration must preserve these evidence distinctions as separate classes/claims:

- unit/component portable;
- hosted CI/portable;
- boundary/integration;
- process-kill/restart/chaos;
- target/native/device;
- A-01, if actually executed;
- production;
- human/author/participant/operator;
- external-provider credential/standing.

A successful hosted workflow is not native evidence. A branch/path/workflow name containing `a01` is not A-01 execution evidence. Historical PASS receipts are not current-subject PASS unless the current Assurance contract explicitly proves exact subject identity and allows the transfer; this reconstruction currently assumes no such transfer.

## 9. Integrity / quarantine lock

If evidence or its referenced content fails digest, schema, provenance, source-authority or current-subject validation:

- record a V4-equivalent finding through the Evidence authority;
- mark the dependent gate as blocked/quarantined/unknown according to the owner contract;
- preserve immutable source/evidence history;
- do not silently skip the bad evidence and continue with a partial set if that evidence is required;
- release from quarantine only from owner-issued reconciliation evidence;
- emit continuity evidence of the runtime block without treating Runtime's report as the authoritative resolution.

## 10. Evidence-seam isolated qualification denominator

A current Evidence provider seam plus Durable Runtime adapter must satisfy this **40-case minimum** in addition to previously frozen denominators. This is a test obligation, not PASS evidence.

- exact subject/digest/class/source/content binding: **8**
- freshness/expiry/material-subject invalidation/supersession: **6**
- semantic-state + evidence-intent atomic coupling: **4**
- outbox restart/replay/dedup/provider-outage/lost-ack: **4**
- sensitive/private/secret minimization and content-ref enforcement: **4**
- integrity/corruption/quarantine/release-by-owner-evidence: **4**
- evidence-class / environment-class separation and no PASS/native/A-01/production upgrade: **6**
- missing/unknown/stale required evidence fail-closed at closure/recovery gates: **4**

Total: **40 cases**.

The existing minimum obligations are now:

- 80 owner-local continuity persistence cases;
- 48 Effect-seam cases;
- 40 Evidence-seam cases;
- plus the 42 recovered G-WP-008..015 requirement rows and all current Root/Identity/Contracts/Keel and later peer regressions.

These sets may overlap behaviorally; cumulative reporting must cross-reference overlaps rather than falsely claiming a sum as independent PASS count.

## 11. Remaining blockers

- `BLOCKED_EVIDENCE_ASSURANCE_INTERFACE_NOT_BOUND` — consumer semantics are frozen, but no exact fresh Evidence provider/service interface is frozen here.
- `BLOCKED_EVIDENCE_DURABLE_PROVIDER_NOT_QUALIFIED` — live F-WP publisher/quarantine implementations are in-memory; recovered G-WP publisher storage is not sufficiently crash-safe for current authority.
- `BLOCKED_RECOVERY_SOURCE_AUTHORITY` — Work/Project and Orchestration exact subjects needed for whole-chain evidence binding remain unresolved.
- `BLOCKED_EFFECT_AUTHORITY_IMPLEMENTATION_NOT_CURRENT` — exact effect receipts/provider integration remain unresolved.
- `BLOCKED_SECURITY_POLICY_BINDING_NOT_BOUND` — exact data minimization/secret/privacy contract still requires its current owner.
- `BLOCKED_TRANSPORT_REDISCOVERY_CONTRACT_NOT_BOUND` — evidence delivery transport contract is not yet frozen.
- `BLOCKED_FRESH_QUALIFICATION_NOT_RUN` — no current implementation has been built against this seam.
- `BLOCKED_NATIVE_A01_PRODUCTION_EVIDENCE_NOT_EXECUTED` — explicitly unclaimed.

## 12. One dependency-valid successor

**`CORE-DURABLE-RUNTIME-CONTINUITY-TRANSPORT-SEAM-RECOVERY-001`**

Recover and inventory current/historical Transport & Delivery substrate required by continuity and the evidence outbox: outbox/inbox records, delivery identity, dedupe identity, ordering scope, replay/redelivery, acknowledgement, quarantine/dead-letter behavior, restart rediscovery and wakeup semantics. Rebind it strictly as carriage mechanics: transport receipt/ack/wakeup is never Work/Job/effect/evidence business truth. Map requirement -> current owner -> durable transport state -> consumed/ref contract -> runtime/evidence interaction -> tests -> evidence/environment -> blocker. Reuse recovered primitives where owner-correct; do not build until the exact current transport boundary and test denominator are frozen.

## 13. Evidence fence

This unit freezes only continuity's consumed Evidence semantics and evidence-outbox obligations. It claims no current Evidence provider implementation, no new current PASS, no historical PASS transfer, no A-01/native/production result, no real provider/credential standing, no human/author/private/publication/certification evidence, and no Book/Learning/Documents/Programming specialist correctness.