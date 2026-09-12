# CONTROLLER-FOUNDATION-006-C1 — Recovery / Inventory / Analysis 001

Status: RECOVERED / INVENTORIED / ANALYZED / TARGETED-RESEARCH-PENDING
Working branch: `controller-v2/foundation-006-c1-rebind`
Qualified predecessor evidence head: `controller-v2/foundation-005-c1-rebind@2d41fb86d0058cba5391e0f5bdd00f60248977b1`
Qualified Foundation-005 exact subject: `97f4d1d5d7e8e56578ef17b37b411009a8a56794`
Historical Foundation-006 marker: `controller-v2/foundation-006@5dc4b83811d8a1af1c48d7cdbab71e22e7863fc5`
Production Controller activation: `BLOCKED_EXTERNAL_SETUP`

## 1. Archaeology result

The historical `controller-v2/foundation-006` branch does **not** contain a Foundation-006 specification, acceptance denominator, implementation delta, or qualification receipt. Its head is the same historical commit that closed Foundation-005 (`Close Foundation-005 identity proof and exception boundary`). Repository search found no stage-specific `FOUNDATION-006` or `F006` artifact to transfer.

Therefore:

- no historical Foundation-006 PASS exists to inherit;
- no historical Foundation-006 implementation may be treated as authority;
- the stage must be reconstructed from explicit predecessor obligations and the current C1-derived runtime gap;
- the stage name/scope below is an adjudicated reconstruction target, not a claim about lost historical bytes.

## 2. Dependency gap that must be closed before worker/scheduler layers

Foundation-005 intentionally ends with an authenticated local command in state `OPEN` and explicitly refuses to treat transport authentication as semantic authorization. Foundation-002D likewise terminates at durable/idempotent command acceptance. Both require a later policy/approval/admission authority before dangerous or consequential work can proceed.

The current C1-derived kernel already contains a generic `admitTransaction(transactionId, completionContract)` transition and `rejectTransaction(...)`, but those methods currently accept no durable policy-decision object, no command fingerprint binding, no principal/delegation/approval evidence binding, no policy snapshot digest, and no decision idempotency key. A caller able to invoke the kernel directly can therefore move an `OPEN` transaction to `ADMITTED` without proving that a semantic authorization decision was evaluated.

This is the next foundation dependency seam. Worker/scheduler/execution work must not be built on top of an admission transition that has no reusable authority contract.

## 3. Reconstructed stage scope

Provisional stage title:

**CONTROLLER-FOUNDATION-006 — Semantic Admission Decision + Policy/Approval Binding**

Foundation-006 owns only the Controller-side enforcement and durable binding of an admission decision. It does **not** own generalized identity, delegation, organization policy, Book/Learning/Documents/Core semantics, human approval truth, or provider execution authority.

The target shape is:

`OPEN transaction + immutable command identity + exact subject + selected policy snapshot + opaque identity/delegation/approval evidence references -> bounded admission decision -> durable decision record -> exactly one legal transaction outcome`

Possible outcomes are bounded to:

- `ALLOW` -> transaction may become `ADMITTED` with a frozen completion contract;
- `DENY` -> transaction becomes `REJECTED` with bounded reason/evidence references;
- `DEFER` -> transaction remains `OPEN`; no admission/rejection side effect occurs.

`DEFER` is not a hidden retry loop and is not an approval.

## 4. Current reusable substrate

### Foundation-002B — semantic command + transaction authority

Reuse:

- immutable/create-once command identity;
- canonical command fingerprint;
- one transaction per command;
- exact subject binding;
- transaction state machine;
- append-only semantic event stream and outbox;
- completion contract normalization;
- `OPEN -> ADMITTED` and `OPEN -> REJECTED` transitions.

Do not create a second command fingerprint algorithm or second transaction identity.

### Foundation-002D — durable ingress

Reuse its restart/offline rediscovery and idempotent acceptance behavior. Admission must be independently reconcilable after restart: accepted `OPEN` transactions cannot depend on a remembered webhook, socket, or chat event.

### Foundation-004 — lifecycle authority

Admission processing occurs only while the Controller owns the runtime and is READY. Runtime status/PID/socket metadata are not policy evidence.

### Foundation-005 — local transport provenance

Its HMAC principal label is transport provenance only. It may be one input reference to a later identity resolver, but it is never sufficient by itself to authorize dangerous commands.

### Existing authority ports

`authority-ports.js` already proves the architecture uses capability-specific ports to restrict worker authority. Foundation-006 should follow the same principle: expose a narrow admission port rather than handing policy adapters raw kernel/database authority.

## 5. Missing current reusable surfaces

The C1-derived line has no reusable current implementation for:

1. immutable admission-decision records;
2. admission decision idempotency/conflict handling;
3. exact command fingerprint + transaction + subject binding in a decision;
4. exact policy snapshot/version/digest binding;
5. opaque principal/delegation evidence references;
6. opaque approval evidence references for policy-selected dangerous commands;
7. bounded ALLOW/DENY/DEFER semantics;
8. decision expiry/freshness semantics where a policy requires them;
9. revocation/supersession semantics for evidence inputs before commit;
10. one narrow policy-decision adapter interface;
11. fail-closed handling when policy state/evidence is unavailable or stale;
12. durable reason-code/evidence traceability without copying secrets/private evidence into Controller records;
13. replay/restart reconciliation for undecided `OPEN` transactions;
14. a single atomic method that binds the decision and performs the legal state transition;
15. tests proving direct generic admission cannot bypass the new public authority path once Foundation-006 is frozen.

## 6. Ownership adjudication

| Concept | Owner | Foundation-006 handling |
| --- | --- | --- |
| command semantic bytes/fingerprint | Foundation-002B | consume exact identity |
| transaction state | Foundation-002B kernel | mutate only through bounded admission commit |
| transport authentication | Foundation-002D / 005 ingress adapters | evidence input only |
| human / service / delegated identity semantics | external/Core identity authority | opaque validated receipt/reference only |
| delegation chain semantics | external/Core identity/delegation authority | never reimplemented here |
| organization/domain authorization policy | external policy authority / later configured policy source | selected immutable snapshot + decision receipt |
| dangerous-command approval truth | approval/policy authority | opaque approval evidence; never synthesized |
| completion contract | Controller transaction contract | admission decision may select/bind the contract within allowed schema |
| scheduler/worker placement | later Controller layers | prohibited in F006 |
| provider side effects | external-effect authority/later execution | prohibited in F006 |
| specialist Book/Learning/Documents/Core semantics | respective owner systems | opaque command content; F006 does not reinterpret specialist truth |

## 7. Core invariants

A design lock must preserve at least these invariants:

1. An `OPEN` transaction cannot become `ADMITTED` merely because transport authentication succeeded.
2. An admission decision binds the exact `transaction_id`, `command_id`, command fingerprint, repository and canonical subject.
3. The decision binds the exact selected policy version and immutable policy digest/snapshot identity.
4. The command's `required_policy_version` is an input constraint, not caller permission; incompatible policy selection fails closed.
5. Identity/delegation/approval evidence is referenced by immutable identifiers/digests; private evidence is not copied into Controller durable state unless explicitly part of a later owned contract.
6. `ALLOW`, `DENY`, and `DEFER` are the only Foundation-006 decision outcomes.
7. `ALLOW` is the only outcome capable of `OPEN -> ADMITTED`.
8. `DENY` is the only policy decision capable of `OPEN -> REJECTED`.
9. `DEFER` leaves the transaction `OPEN` and records no false approval.
10. Same decision identity + same semantic contents is idempotent.
11. Same decision identity or transaction with conflicting semantic decision contents fails closed.
12. A transaction cannot accumulate two competing terminal admission decisions.
13. Completion contract is frozen as part of successful admission and cannot be caller-mutated afterward.
14. Policy evaluation/network I/O does not occur inside the SQLite mutation transaction.
15. The commit phase re-reads current transaction/command/policy-evidence preconditions; no read-before-evaluate snapshot is assumed fresh.
16. Policy evaluation is reconciliation-friendly: re-evaluating the same current state may produce the same decision without duplicate side effects.
17. Transient policy-source failures are `DEFER`/classified unavailable outcomes, not implicit ALLOW.
18. Automatic retries, if any, are owned by one layer only, bounded, jittered and restricted to classified transient reads; semantic DENY/conflict/schema failures are never retried as transient.
19. Restart discovers undecided `OPEN` transactions from durable state rather than remembered wakeups.
20. A stale approval/evidence reference cannot be upgraded to ALLOW because a caller says it is current.
21. A policy adapter cannot call provider effects, scheduler dispatch, worker leasing, qualification execution or promotion.
22. Admission reason codes are bounded/stable; raw exceptions, secrets and private approval content are not durable reason text.
23. Every admission mutation emits durable event/evidence sufficient to reconstruct why the transaction is ADMITTED or REJECTED.
24. Worker/scheduler/execution layers consume only ADMITTED/ACTIVE transactions; they never become alternate admission authorities.
25. Existing 002D/005 ingress acceptance remains independent from semantic authorization.
26. No CORE/LEARNING/BOOK/DOCUMENTS owner control is mutated by Foundation-006.

## 8. Requirement / implementation / state / contract / evidence census

| ID | Requirement | Current component | Durable state | Contract | Test/evidence required | Current blocker |
| --- | --- | --- | --- | --- | --- | --- |
| F006-R01 | decision binds exact command + tx + fingerprint + subject | partial 002B data exists | MISSING decision row | admission decision v1 | wrong-command/subject/fingerprint adversarial | design lock |
| F006-R02 | decision binds immutable policy snapshot identity | policy_version string only | MISSING digest/snapshot | policy selection v1 | mismatch/stale tests | policy-source contract |
| F006-R03 | ALLOW/DENY/DEFER only | MISSING | MISSING | decision enum | schema tests | design lock |
| F006-R04 | ALLOW atomically records decision + ADMITTED + completion contract | generic admit exists | tx/event partial | atomic commit API | crash/conflict tests | build |
| F006-R05 | DENY atomically records decision + REJECTED | generic reject exists | tx/event partial | atomic commit API | replay/conflict tests | build |
| F006-R06 | DEFER does not mutate semantic transaction outcome | MISSING | none | reconcile result | no-side-effect tests | design lock |
| F006-R07 | decision semantic idempotency | MISSING | MISSING | decision fingerprint/id | replay tests | design lock |
| F006-R08 | conflicting decision fails closed | MISSING | MISSING | unique constraints | adversarial | design lock |
| F006-R09 | required policy version honored | command field exists | tx policy field exists | selection rule | mismatch tests | design lock |
| F006-R10 | identity evidence opaque/bound, not synthesized | MISSING | MISSING refs | evidence-ref profile | fake/stale/mismatch tests | external owner interface |
| F006-R11 | delegation evidence opaque/bound | MISSING | MISSING refs | evidence-ref profile | attenuation-owner boundary tests | external owner interface |
| F006-R12 | dangerous approval evidence required when policy says so | MISSING | MISSING refs | approval requirement result | absence/mismatch tests | external approval interface |
| F006-R13 | no policy network I/O inside DB transaction | MISSING adapter | none | evaluate/commit split | fault injection | design lock |
| F006-R14 | re-read current state before commit | MISSING | durable tx/command | commit preconditions | stale read tests | build |
| F006-R15 | restart rediscovery of undecided OPEN tx | OPEN state exists | SQLite | reconciler query | restart tests | build |
| F006-R16 | bounded reason codes, no private data leakage | MISSING | decision/event | reason taxonomy | leak/fault tests | design lock |
| F006-R17 | later scheduler/workers cannot bypass admission | partial state gates | tx state | narrow authority port | source/negative tests | later-layer integration |
| F006-R18 | cumulative inherited foundations remain green | CI exists | Git evidence | exact-SHA matrix | Ubuntu/Windows Node22/24 | qualification |

Accounted bounded recovery denominator: **18/18**. Unaccounted rows: **0** for the reconstructed scope above. This does not claim that targeted research cannot add requirements before design lock.

## 9. Adversarial cases requiring design resolution

- policy evaluates ALLOW, then policy snapshot or approval is revoked before commit;
- command/transaction changes are impossible by identity, but current transaction state advances while evaluation is in flight;
- two reconcilers evaluate the same OPEN transaction concurrently and return different outcomes;
- first ALLOW commit succeeds but response is lost and the caller retries;
- DENY is replayed after transaction has already been legally admitted by the same decision;
- policy source times out after returning partial evidence;
- caller supplies a `required_policy_version` that is older/newer/incomparable to configured policy;
- approval reference points to the right principal but wrong command fingerprint/subject;
- approval is valid when read but expired by commit time;
- private evidence contains secrets/PII that must not be copied into Controller event payloads;
- a direct caller invokes generic `kernel.admitTransaction()` and bypasses the intended policy path;
- policy adapter tries to perform a provider side effect or schedule work during evaluation;
- stale local projection is mistaken for authoritative policy truth.

## 10. Current gate standing

RECOVER: PASS
INVENTORY: PASS
ANALYZE: PASS
TARGETED RESEARCH: REQUIRED NEXT
ADJUDICATE: PARTIAL — ownership fence established; exact policy-source/decision contract unresolved
DESIGN-LOCK: NOT AUTHORIZED YET
BUILD: NOT AUTHORIZED
ISOLATED QUALIFICATION: NOT RUN
CUMULATIVE REGRESSION/CALIBRATION: NOT RUN
FREEZE: NOT AUTHORIZED

Exact next operation: `CONTROLLER-FOUNDATION-006A-C1-POLICY-DECISION-TARGETED-RESEARCH-ADJUDICATION-001`.
