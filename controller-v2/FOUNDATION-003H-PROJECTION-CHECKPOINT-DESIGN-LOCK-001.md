# CONTROLLER-FOUNDATION-003H — PROJECTION CHECKPOINT DESIGN LOCK 001

Status: **DESIGN-LOCK COMPLETE — BOUNDED PORTABLE BUILD AUTHORIZED**

Predecessor: `CONTROLLER-FOUNDATION-003G-PROJECTION-CHECKPOINT-IDENTITY-AND-FRESHNESS-CENSUS-001`.

This unit changes no semantic truth owner, no durable journal owner, no Topology-005 owner control, and no production activation standing.

## 1. Locked principles

1. A projection is always a **derived read model**, never canonical semantic truth.
2. A local SQLite projection and a verified durable-journal projection are different evidence classes and must say so in their output.
3. Wall-clock recency is not durability and is not source-currentness.
4. 002C's existing `{size,head_digest}` checkpoint is the only durable source identity used by this repair; no second cursor or projection-offset authority is created.
5. `reduceSemanticEvents` remains the single semantic reducer.
6. No projection table is introduced in portable v1.

## 2. Local provisional projection contract

Existing `ControllerKernel.projection(maxAgeMs,nowMs)` remains source-compatible but its returned object is extended to:

- `source_authority: 'LOCAL_PROVISIONAL'`
- `semantic_authority: false`
- `generated_at`
- `freshness: 'FRESH' | 'STALE'` — retained only for backward compatibility
- `freshness_basis: 'LOCAL_EVENT_RECENCY_ONLY'`
- `source_event_count`
- `pending_outbox_count`
- `state`

`freshness:'FRESH'` means only that the newest local semantic event occurred within the requested age window. It does not mean the projection is durably published, globally current or safe as irreversible-effect authority.

The method performs no semantic write and no outbox sealing.

## 3. Durable verified projection API

Add a provider-neutral pure API in a dedicated read-model module:

`projectVerifiedDurableJournal(entries,{ expectedCheckpoint, nowMs = Date.now() })`

Requirements:

1. `expectedCheckpoint` is mandatory.
2. Call `verifyDurableJournal(entries,{expectedCheckpoint})` before reduction.
3. Reduce exactly the verified ordered semantic events using `reduceSemanticEvents`.
4. Return:
   - `source_authority:'DURABLE_VERIFIED'`
   - `semantic_authority:false`
   - `checkpoint_standing:'AT_CHECKPOINT'`
   - `source_checkpoint:{size,head_digest}`
   - `source_event_count`
   - `source_tail_event_id` or null
   - `source_tail_event_digest` or null
   - `generated_at`
   - `state`
5. Do not return wall-clock `FRESH`/`STALE` for durable source-currentness.
6. Empty verified history is valid at `{size:0,head_digest:null}`.
7. The function never receives or touches a ControllerKernel and cannot write SQLite/outbox state.

## 4. Current durable-head comparison

Add pure helper:

`projectionCheckpointStanding(projection, observedCheckpoint)`

It accepts only a `DURABLE_VERIFIED` projection and a normalized durable checkpoint.

Return:

- `AT_OBSERVED_HEAD` only when exact checkpoint equality holds;
- `NOT_AT_OBSERVED_HEAD` for every non-equal checkpoint.

The helper must **not** label a non-equal checkpoint `BEHIND` or `DIVERGED` from checkpoint values alone because `{size,head_digest}` equality proves identity but inequality alone does not prove ancestry.

## 5. Local-versus-durable behavior

An event that exists locally with a PENDING outbox row:

- may appear in the local provisional projection;
- must not appear in a durable verified projection built from the still-current durable journal checkpoint;
- appears in a newly regenerated durable projection only after exact durable publication advances the journal checkpoint.

This distinction is a first-class test invariant.

## 6. Failure law

Durable projection generation fails closed on:

- missing/invalid expected checkpoint;
- checkpoint mismatch;
- global journal position gap;
- journal predecessor/digest corruption;
- duplicate event identity;
- unsupported historic semantic event schema;
- semantic event integrity/fork/gap failures detected by the existing reducer.

No projection repair catches these and substitutes partial state.

## 7. Qualification denominator — 18 cases

### Local provisional identity
1. local projection reports `LOCAL_PROVISIONAL` and `semantic_authority:false`;
2. local projection reports exact local event count;
3. local projection reports exact pending outbox count;
4. wall-clock `FRESH` carries `freshness_basis:LOCAL_EVENT_RECENCY_ONLY` and no durable checkpoint;

### Durable verified identity
5. empty verified journal yields exact empty checkpoint and empty reducer state;
6. nonempty verified journal binds exact checkpoint;
7. durable source event count equals checkpoint size;
8. durable tail event id/digest equals exact verified tail;
9. same verified history/checkpoint yields equivalent semantic state independent of generation clock;
10. exact checkpoint comparison returns `AT_OBSERVED_HEAD` only on equality;
11. unequal checkpoint returns only `NOT_AT_OBSERVED_HEAD`;

### Fail closed / authority separation
12. expected-checkpoint mismatch fails closed;
13. journal position gap fails closed;
14. journal digest/predecessor tamper fails closed;
15. unsupported semantic event schema fails closed;
16. local PENDING semantic event appears locally but not in durable projection until published;
17. after publication, regenerated durable projection includes the event at the new exact checkpoint;
18. External Effect Authority UNKNOWN state and immutable attempt survive durable projection reduction exactly, and full predecessor cumulative Controller suite remains green.

If implementation exposes additional behavior, the denominator expands rather than shrinks.

## 8. Evidence/non-claim boundary

Hosted Node/SQLite can prove the read-model contract and exact durable-source identity. It cannot prove A-01, native filesystem/power-loss behavior, production provider installation, production principal/ruleset evidence or production Controller activation.

C1 production activation remains `BLOCKED_EXTERNAL_SETUP`.

## 9. Exact build successor

`CONTROLLER-FOUNDATION-003I-PROJECTION-CHECKPOINT-BUILD-001` — implement the local-provisional metadata, durable-verified projection API, exact checkpoint-standing helper and locked isolated tests; then run the entire Controller cumulative suite on Node 22 and Node 24 before any freeze.
