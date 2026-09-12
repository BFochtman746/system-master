# CONTROLLER-FOUNDATION-003E-R1 — DISPATCH DURABILITY BARRIER QUALIFICATION RECEIPT 001

Status: **HOSTED PORTABLE PASS / CUMULATIVE REGRESSION PASS / NARROW 003E REPAIR FROZEN / PRODUCTION ACTIVATION STILL BLOCKED**

## Exact tested subject

- branch: `controller-v2/foundation-003-forensic-recovery`
- exact tested subject: `1bb0054862969f09429f1053db872dc56eab2102`
- lineage: frozen C1 `a2ed4205cb7674b41f09db42fd9e687cdcf8eb2d` -> qualified 002D rebind `2ad38d6c431e76748dc21db2b1d23b0851cc1f83` -> 003A backup hardening -> 003C/003D/003E -> 003F restart audit -> 003E-R1 repair
- historical `controller-v2/foundation-003@ec2fcbf188acfad20dd640cf14c2dbb5bf79c0dd` remains archaeology only and is not an implementation ancestor.

## Why R1 was required

The initial 003E hosted implementation correctly durably modeled external-effect intent, one immutable dispatch attempt, UNKNOWN/reconciliation semantics and event-backed disaster rebuild. The immediate 003F restart taxonomy then found a narrower but material boundary defect: a caller could receive local dispatch authorization while its semantic event was still only a PENDING outbox row, physically mutate a provider, and then lose local SQLite before 002C durable publication. Rebuild from the authoritative durable journal would then lack the dispatch-attempt truth.

R1 repairs that gap without adding another journal or retry engine. The existing 002C publisher remains the sole durability owner. Physical provider apply is now gated behind an exact `SEALED` dispatch-authorization event plus the same still-live fenced lease.

## Hosted qualification

Workflow: `Controller v2 Foundation`

Run: `34677817825`

Both jobs checked out exact subject `1bb0054862969f09429f1053db872dc56eab2102`.

### Node 22

- runtime: `v22.23.2`
- hosted environment: Ubuntu 24.04.5 / GitHub-hosted runner
- tests: **237/237 PASS**
- failures: **0**

### Node 24

- runtime: `v24.20.0`
- hosted environment: Ubuntu 24.04.5 / GitHub-hosted runner
- tests: **237/237 PASS**
- failures: **0**

## External Effect Authority isolated denominator

The External Effect Authority denominator is now **36/36 PASS on each supported hosted runtime**.

Existing EE-T001..EE-T032 continue to prove schema-v4 migration, immutable semantic identity, request-digest binding, idempotency conflicts, current fenced-lease dispatch authorization, one-physical-attempt portable-v1 law, explicit UNKNOWN/RECONCILING outcomes, bounded observation evidence, cancellation boundary, event replay, durable rebuild and absence of provider/network/retry code in semantic authority.

R1 adds and passes these exact adversaries:

- `EE-T033` — a PENDING dispatch event cannot yield a provider-call permit;
- `EE-T034` — the exact SEALED dispatch event plus the same current live fence yields an immutable permit bound to exact effect/attempt/event/lease/resource/generation identity;
- `EE-T035` — a released authorizing lease cannot yield a permit even after the event is durably SEALED;
- `EE-T036` — disaster rebuild restores a SEALED uncertain effect + attempt but resurrects no live lease, so no provider-call permit exists and recovery requires external-state observation.

## Cumulative regression / calibration

The same exact subject passed the full Controller cumulative suite **237/237 on Node 22 and 237/237 on Node 24**. The cumulative pass preserves:

- frozen C1 activation-closure and production-authority fail-closed checks;
- 002D immutable command ingress, full-scan lost-wakeup recovery, semantic idempotency and bounded transient retry classification;
- 002C outbox/durable-journal publication, global integrity verification and GitHub journal/anchor concurrency/ambiguity behavior;
- worker lease fencing and bounded typed-result authority;
- promotion durability barrier and observe-before-reapply behavior;
- disaster rebuild, orphan-operation staling and exact SubjectRef preservation;
- 003A immutable verified backup semantics;
- schema migrations through v4, RFC-8785 canonicalization and failure-injection coverage.

## Frozen portable semantics

For portable v1 the provider-call sequence is now frozen as:

1. observe external provider state;
2. prepare one semantic external effect;
3. when absence is proven, atomically authorize one local dispatch attempt under the current fenced lease;
4. publish the exact dispatch-authorization event through the existing 002C durability mechanism;
5. obtain `getExternalEffectDispatchPermit(...)` only when that exact event is `SEALED` and the same lease/generation remains current;
6. only then may adapter code perform the one physical provider apply;
7. observe again before terminal semantic resolution unless provider-specific response evidence has separately been qualified as authoritative observation;
8. unknown outcomes remain observation/reconciliation work and never create generic redispatch authority.

`authorizeExternalEffectDispatch(...)` is therefore local attempt preparation, not provider-call permission.

## Evidence and blocker boundary

This receipt proves hosted portable semantics only. It does **not** claim:

- A-01 qualification;
- target-native sudden-power-loss durability;
- a real external-provider mutation;
- real provider-side idempotency;
- production GitHub App principal, credential, repository or ruleset installation;
- dangerous-command policy approval;
- production Controller activation;
- CORE, LEARNING, BOOK, DOCUMENTS or Programming behavior.

C1 production activation remains `BLOCKED_EXTERNAL_SETUP`. The unresolved production ingress principal/ruleset installation evidence from C1/002D is not changed by this hosted PASS.

## Freeze standing

`CONTROLLER-FOUNDATION-003E-R1-DISPATCH-DURABILITY-BARRIER-REPAIR-001` is **FROZEN_HOSTED_PORTABLE** at exact subject `1bb0054862969f09429f1053db872dc56eab2102` for the portable semantics stated above.

Any executable change to schema-v4 External Effect Authority, effect events/reducer/rebuild, single-dispatch law, dispatch-permit durability barrier, fencing, evidence requirements, or predecessor Controller code requires a fresh exact-subject cumulative qualification.

## Exact dependency-valid successor

`CONTROLLER-FOUNDATION-003G-PROJECTION-CHECKPOINT-IDENTITY-AND-FRESHNESS-CENSUS-001` — recover and adjudicate the remaining projection/read-model boundary: distinguish local provisional state from durable-authoritative state, bind projections to an exact durable journal checkpoint/event identity, prevent wall-clock freshness from masquerading as source-authority freshness, and determine the smallest design/test change required before Foundation-003 can close its portable restart/observability boundary.
