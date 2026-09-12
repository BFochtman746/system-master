# CONTROLLER-FOUNDATION-003G — PROJECTION CHECKPOINT IDENTITY + FRESHNESS CENSUS 001

Status: **RECOVER / INVENTORY / ANALYZE / ADJUDICATE COMPLETE — READ-MODEL AUTHORITY GAP CONFIRMED; NO NEW EXTERNAL RESEARCH REQUIRED**

Predecessor: `CONTROLLER-FOUNDATION-003E-R1-DISPATCH-DURABILITY-BARRIER-QUALIFICATION-RECEIPT-001`.

Current exact branch before this unit was `controller-v2/foundation-003-forensic-recovery@dd53726ff05f3a33f4b4c5f2c83dc00411e77ac5`.

This unit does not change CORE/LEARNING/BOOK/DOCUMENTS controls and does not create Controller production authority.

## 1. Why this census is required

Foundation-003 restart closure requires every read model to say exactly **which authority it was derived from**. A projection must never look authoritative merely because it was generated recently.

The current kernel exposes:

`projection(maxAgeMs, nowMs)` -> `{ generated_at, freshness, state }`

It derives `state` from **all local SQLite semantic events**, including events whose outbox rows may still be `PENDING`, and labels the result `FRESH` or `STALE` only from the wall-clock age of the newest event.

The existing durable journal already has a stronger identity primitive:

`{ size, head_digest }`

and `verifyDurableJournal(entries,{expectedCheckpoint})` proves that the supplied ordered event set exactly matches that checkpoint.

## 2. Lossless requirement / implementation / evidence census

| Requirement / invariant | Current component | Durable state | Interface / contract | Current tests/evidence | Environment | Standing / blocker |
|---|---|---|---|---|---|---|
| semantic truth comes from event reduction, not projection storage | `reduceSemanticEvents` | semantic events | reducer | cumulative Controller replay/recovery tests | hosted Node/SQLite | CLOSED |
| local read model regenerates from local events | `ControllerKernel.projection()` | local `events` table | kernel method | CF-T024 | hosted Node/SQLite | CLOSED but local only |
| stale wall-clock recency does not get guessed fresh | `ControllerKernel.projection()` | newest local event timestamp | `freshness` | CF-T025 | hosted Node/SQLite | CLOSED for recency only |
| projection identifies whether source events are durably authoritative | **none** | local outbox status exists separately | none | none | all | **GAP** |
| projection binds to exact authoritative durable checkpoint | **none** | 002C journal `{size,head_digest}` exists | `verifyDurableJournal` exists but is not used by projection | journal integrity tests | hosted + provider-neutral journal model | **GAP** |
| projection distinguishes unsealed local semantic state from durable state | **none explicit** | `outbox.PENDING/SEALED` | current projection ignores distinction | outbox tests exist separately | hosted Node/SQLite | **GAP** |
| read-model freshness means source-currentness, not merely wall-clock recency | **none** | durable checkpoint can represent source identity | current `FRESH/STALE` is timestamp-only | CF-T025 | all | **GAP** |
| projection is never canonical mutation authority | architectural law, implicit implementation | none | no write API on projection | existing reducer/projection behavior | all | PARTIAL — must be explicit in contract/output |
| empty durable journal can yield a valid empty read model | reducer + journal verifier can represent empty set/checkpoint | `{size:0,head_digest:null}` | no durable projection API | journal genesis tests | hosted | GAP at read-model API only |
| projection can prove exact tail/event identity | durable entries contain journal position/event/event digest | journal | no projection output | journal integrity tests | hosted | GAP |

## 3. Material defect class

This is not a semantic-state corruption defect like the 003E dispatch durability gap. It is an **observability/authority-labeling defect**:

- a local projection can include a committed semantic event that is not yet in authoritative durable history;
- `generated_at` and newest-event age say nothing about whether that event has been durably published;
- therefore a consumer could mistake `freshness: FRESH` for `authority: durable/current`.

No current evidence shows that a projection is itself used as a canonical writer, so no existing semantic PASS is revoked. Foundation-003 cannot fully close its read-model/restart boundary until the distinction is explicit and tested.

## 4. Targeted research decision

No additional external research is necessary for this unit. The repository already contains the controlling primitives:

- append-only semantic event reduction;
- exact global durable-journal positions;
- content-addressed global journal digest chain;
- normalized exact checkpoints;
- fail-closed checkpoint verification.

External CQRS/materialized-view patterns cannot improve the core decision: the Controller must bind an authoritative read model to the Controller's own exact verified durable checkpoint rather than invent a second offset/freshness scheme.

## 5. Ownership adjudication

Projection/read-model identity belongs to Controller Foundation observability/recovery infrastructure.

It owns:

- declaring whether a projection source is `LOCAL_PROVISIONAL` or `DURABLE_VERIFIED`;
- exact durable checkpoint identity when durable;
- exact source event count and tail identity;
- read-model derivation through the existing semantic reducer.

It does **not** own:

- semantic mutation truth;
- durable journal publication;
- provider transport;
- wall-clock synchronization;
- CORE/LEARNING/BOOK/DOCUMENTS/Programming domain interpretation;
- operator UI policy.

002C remains the sole durable-journal authority. `reduceSemanticEvents` remains the semantic reconstruction authority.

## 6. Required repair direction

### 6.1 Preserve local projection but label it truthfully

The existing `ControllerKernel.projection()` may remain as a convenience read model, but its contract must expose at least:

- `source_authority: 'LOCAL_PROVISIONAL'`;
- `semantic_authority: false`;
- `source_event_count`;
- `pending_outbox_count`;
- `freshness_basis: 'LOCAL_EVENT_RECENCY_ONLY'`.

Its existing wall-clock `FRESH/STALE` field may remain for compatibility but must not imply durable-current standing.

### 6.2 Add a verified durable projection

A pure provider-neutral API should accept durable journal entries plus an exact expected checkpoint and:

1. call `verifyDurableJournal(entries,{expectedCheckpoint})`;
2. reduce exactly those verified semantic events with `reduceSemanticEvents`;
3. return:
   - `source_authority: 'DURABLE_VERIFIED'`;
   - `semantic_authority: false`;
   - exact normalized `source_checkpoint` `{size,head_digest}`;
   - `source_event_count` equal to checkpoint size;
   - `source_tail_event_id` and `source_tail_event_digest` or null for empty history;
   - generated projection state;
   - `generated_at` only as metadata, never as source-currentness proof.

No projection table is needed. Persisting another read-model truth would create another recovery problem without adding authority.

### 6.3 Currentness law

A durable projection is **exactly valid at its bound checkpoint**. It may be called `AT_CHECKPOINT`; it is not labeled globally `CURRENT` unless a caller independently supplies and verifies that the projection checkpoint equals the durable journal's presently observed head.

A projection with a different checkpoint is not silently refreshed or guessed current; caller must regenerate from a newly verified event set.

## 7. Minimum qualification denominator

Before implementation is frozen, at least these cases are required:

1. local projection explicitly reports `LOCAL_PROVISIONAL` and `semantic_authority:false`;
2. local projection reports local event count;
3. local projection reports PENDING outbox count;
4. local `FRESH` still carries `freshness_basis:LOCAL_EVENT_RECENCY_ONLY`;
5. durable projection over empty verified journal returns exact empty checkpoint and empty reducer state;
6. durable projection over nonempty verified journal binds exact `{size,head_digest}`;
7. durable projection source count equals checkpoint size;
8. durable projection tail event id/digest equals exact verified tail;
9. expected-checkpoint mismatch fails closed;
10. journal gap fails closed;
11. journal digest tamper fails closed;
12. semantic event tamper/schema mismatch fails closed through existing reducer/integrity checks;
13. local PENDING event can appear in local provisional projection but is absent from durable projection until published;
14. after publication, newly regenerated durable projection includes the event at the new exact checkpoint;
15. same verified event set/checkpoint yields equivalent semantic state independent of `generated_at`;
16. no projection API writes semantic rows/events or seals outbox state;
17. external-effect UNKNOWN/RECONCILING state survives durable projection reduction exactly;
18. cumulative Controller suite remains green.

## 8. Non-claims

This census does not claim A-01, native, production, real-provider, production-principal/ruleset, or target-filesystem durability evidence. C1 production activation remains `BLOCKED_EXTERNAL_SETUP`.

## 9. Exact successor

`CONTROLLER-FOUNDATION-003H-PROJECTION-CHECKPOINT-DESIGN-LOCK-001` — freeze the local-provisional and durable-verified projection contracts, exact checkpoint/tail representation, fail-closed API, and >=18-case denominator before any executable projection repair.
