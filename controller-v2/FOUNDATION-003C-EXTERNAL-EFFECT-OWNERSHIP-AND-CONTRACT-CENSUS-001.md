# CONTROLLER-FOUNDATION-003C — EXTERNAL EFFECT OWNERSHIP + CONTRACT CENSUS

Status: **RECOVER / INVENTORY / TARGETED RESEARCH / ADJUDICATE COMPLETE — GENERIC EFFECT AUTHORITY IS A REAL GAP; NO RUNTIME BUILD AUTHORIZED BY THIS FILE**

Current lineage re-read before mutation:

- frozen C1: `controller-v2/foundation-002c-c1@a2ed4205cb7674b41f09db42fd9e687cdcf8eb2d`
- portable 002D receipt head: `controller-v2/foundation-002d-c1-rebind@2ad38d6c431e76748dc21db2b1d23b0851cc1f83`
- 003A exact hosted subject: `367d6628371eea6f3888853c4afcb2466b67c0d0` (`201/201` Node 22 and `201/201` Node 24)
- current 003 archaeology predecessor: `controller-v2/foundation-003-forensic-recovery@f2ae7f176b83666a5a2c29fb19004095ce019c0c`
- historical Foundation-003 candidate: `controller-v2/foundation-003@ec2fcbf188acfad20dd640cf14c2dbb5bf79c0dd` — evidence only, not an implementation ancestor.

This artifact adds no CORE/LEARNING/BOOK/DOCUMENTS authority and does not alter Topology-005.

## 1. Requirement being adjudicated

The Controller eventually performs mutations whose durable semantic truth is inside Controller but whose physical effect is applied by an external provider. The system therefore needs one provider-neutral way to preserve **effect intent, semantic idempotency identity, dispatch uncertainty, provider observation, and evidence-backed outcome** across crashes and retries.

This requirement is distinct from:

- 002D command ingress, which creates Controller transactions from immutable command authority;
- 002C journal publication, whose provider-specific Git transport is already an append-only durability mechanism;
- promotion, whose current state machine already handles one special external mutation class;
- worker/lease fencing, which controls internal mutation authority;
- projections, which are read models and cannot become semantic truth.

## 2. Current ownership census

| Concern | Current owner | What is already true | 003C decision |
|---|---|---|---|
| immutable command rediscovery | 002D ingress | lost wakeups and local observation loss recover by ref reconciliation | do not add command retry/effect state |
| semantic command idempotency | 002B kernel | same command ID + same fingerprint returns existing transaction; semantic mismatch fails | reuse this law conceptually; do not duplicate command table |
| durable event publication | 002C journal/publisher | unknown acknowledgement is reconciled against immutable publication identity | do not wrap in another effect ledger |
| promotion mutation | kernel `promotions` | observe-before-apply; ambiguous apply enters `RECONCILIATION_REQUIRED`; absence can re-authorize | preserve as special-purpose existing owner until an explicit later migration proves equivalence |
| generic future external mutations | **none proven** | no provider-neutral durable effect-intent/outcome authority exists in current schema v3 | **gap confirmed** |
| disaster rebuild | `recovery.js` | verified journal reconstructs semantic state | any new generic effect truth must be event-reducible/rebuildable |
| retry timing | operation-specific adapter/client | 002D already owns ingress retry; AWS guidance warns against stacked retry layers | generic effect authority records retry disposition but must not become an automatic second retry engine |

## 3. Historical evidence recovered

Historical Foundation-003 had a provider-neutral `external_effects` model with:

- unique `(provider, idempotency_key)` semantic identity;
- request-payload digest binding;
- explicit prepare -> in-flight -> outcome progression;
- successful outcome requiring a remote result reference;
- failed/unknown outcome requiring an error code;
- `UNKNOWN` requiring observation/reconciliation before resolution;
- effect events appended to Controller semantic history;
- restart logic treating in-flight effects as ambiguous rather than blindly replaying them.

Those are useful requirements and adversarial fixtures, but the old Python implementation cannot be transplanted because the current Controller is the C1-derived Node/SQLite lineage with schema v3, a different event reducer, different promotion semantics, and a frozen 002B/002C/C1 base.

## 4. Targeted external research

Research was limited to uncertainty that can change the design.

1. **Kubernetes controller pattern** — controllers repeatedly compare desired and current state and converge rather than assuming a single notification or write succeeded. External-state controllers observe the external system and report current state back. Source: https://kubernetes.io/docs/concepts/architecture/controller/
2. **Stripe idempotent requests** — an idempotency key makes retries safe, and the service rejects reuse of the same key with different parameters. This directly supports binding a semantic request digest to an effect identity. Source: https://docs.stripe.com/api/idempotent_requests
3. **AWS Builders' Library retry guidance** — side-effecting APIs are safely retryable only when idempotency exists; retry ownership should be bounded and avoid amplification. Source: https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/
4. **GitHub Git refs API** — reference updates can be constrained to non-force fast-forward behavior; conflicts/validation failures are explicit, so an adapter can observe/refuse rather than treating every failed response as proof of no mutation. Source: https://docs.github.com/rest/git/refs

### Research implication

The portable contract must be **observe/reconcile first for uncertain outcomes**, bind a stable idempotency identity to immutable request semantics, and keep retry policy at one designated layer. A timeout or lost response is not evidence that the external mutation did not occur.

## 5. Adjudication — truth owner

A generic provider-neutral **External Effect Authority** is genuinely missing and belongs inside Controller Foundation because it governs Controller-owned execution semantics across provider boundaries.

It does **not** own:

- provider credentials or token issuance;
- provider-specific policy authorization;
- GitHub branch/ruleset administration;
- Book/Learning/Documents/Programming domain semantics;
- transport authorization or human approval;
- provider network clients;
- scheduling policy.

It owns only the durable semantic record needed to answer:

> What exact external mutation did Controller intend, under what idempotency identity and precondition, what dispatch was attempted, what was actually observed, and what evidence permits a terminal conclusion?

## 6. Required durable contract

A future schema addition is justified only if it satisfies all of the following.

### 6.1 Effect identity

Each effect must bind immutably to:

- `effect_id` — Controller UUIDv7;
- `transaction_id` and, where applicable, `operation_id`;
- provider class/name;
- effect type;
- canonical target key;
- idempotency key;
- canonical request digest;
- optional expected remote version / compare token;
- created timestamp.

Reusing an idempotency key for different provider/effect/target/request/precondition semantics is an **idempotency conflict**, never a second effect.

### 6.2 Evidence boundary

A terminal success requires provider observation evidence that is specific enough to establish the intended mutation. A transport `2xx` alone is not universally sufficient if the adapter contract says the response can be ambiguous.

A terminal failure requires evidence that the mutation is known not to have succeeded or is permanently rejected. Timeout/connection loss after dispatch is `UNKNOWN`, not `FAILED`.

### 6.3 Reconciliation law

For any nonterminal or unknown effect:

1. re-read durable Controller effect truth;
2. observe provider current state using the same immutable effect identity/precondition;
3. if the intended result is already present, record success with observation evidence;
4. if absence/non-application is proven and retry is still authorized, return a retryable disposition without minting a new semantic effect;
5. if outcome cannot be established, remain unknown/deferred;
6. never silently retarget a stale expected remote version;
7. never let a wakeup/webhook payload become effect truth.

### 6.4 Retry ownership

The authority layer must not sleep/retry provider calls by itself. It may classify an observation as `TRANSIENT_RETRYABLE`, but exactly one caller/adapter layer owns the bounded backoff/jitter loop for that effect class. Existing 002D ingress and 002C publication retry logic remain separate and must not be wrapped.

### 6.5 Rebuild requirement

Every authoritative effect transition must have a semantic event form sufficient for `reduceSemanticEvents` + `rebuildControllerStore` to reconstruct current effect truth. A table row without event-backed reconstruction is not acceptable semantic authority.

## 7. State model decision

Do **not** copy the historical state names mechanically. The required semantic distinctions are:

1. `PREPARED` — intent durably exists; no dispatch claim yet.
2. `DISPATCHING` — Controller has crossed the send boundary; outcome may become uncertain if acknowledgement is lost.
3. `UNKNOWN` — dispatch may have committed but current evidence cannot prove success/failure.
4. `RECONCILING` — an observation cycle is actively adjudicating an unknown outcome.
5. `SUCCEEDED` — intended external state is proven present.
6. `FAILED` — permanent non-success is proven.
7. `CANCELLED` — effect was cancelled before any send boundary.

The design-lock phase must decide whether `DISPATCHING` should be a durable state or whether a durable dispatch-attempt record is a safer representation. No implementation is authorized until that question is settled with failure-injection tests.

## 8. Minimum isolated qualification denominator before build

At least these cases must exist before implementation is considered design-locked:

1. prepare new effect;
2. semantic duplicate returns same effect;
3. same idempotency key + changed request conflicts;
4. same key + changed target conflicts;
5. same key + changed expected version conflicts;
6. success requires evidence;
7. failure requires evidence/reason;
8. timeout after send becomes unknown, not failed;
9. unknown cannot directly become prepared/succeeded without observation path;
10. reconcile observes intended state already present -> success without reapply;
11. reconcile proves absence -> retryable disposition, same effect identity;
12. reconcile remains ambiguous -> unknown/deferred;
13. stale expected remote version is preserved and blocks silent retarget;
14. restart after pre-send leaves effect safely prepared;
15. restart after send-boundary ambiguity does not blindly reapply;
16. duplicate worker/reconciler races cannot produce two dispatch authorities;
17. provider client/network code is absent from semantic kernel;
18. 002D retry loop is not wrapped by generic effect retry;
19. 002C journal publication remains outside generic effect table;
20. current promotion regression remains unchanged;
21. semantic effect events rebuild exact effect state after local DB loss;
22. tampered/missing effect event chain fails under existing journal integrity rules;
23. terminal success is idempotent;
24. terminal failure cannot be overwritten by a later guessed success;
25. cancellation after send boundary is rejected.

Cumulative qualification must include the full frozen Controller suite, not only the new tests.

## 9. Blockers and non-claims

- Production Controller activation remains `BLOCKED_EXTERNAL_SETUP` from C1/002D.
- No production provider principal, repository ruleset, credential, or external effect has been observed by this artifact.
- No A-01/native/production qualification is claimed.
- Historical Foundation-003 PASS does not transfer to this lineage.

## 10. Exact successor

`CONTROLLER-FOUNDATION-003D-EXTERNAL-EFFECT-DESIGN-LOCK-001` — settle dispatch-attempt representation, event schema/reducer contract, append-only schema migration, concurrency/fencing rule, adapter port, recovery/restart behavior, and the exact >=25-case test denominator. Only after 003D is complete may a bounded generic External Effect Authority implementation be built on the C1 -> 002D -> 003A lineage.
