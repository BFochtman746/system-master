# BOOK-RECONSTRUCTION-B01-D3 — EXECUTION FOUNDATION CURRENT-IDENTITY REBIND / QUALIFICATION 001

Date: 2026-09-12
Owner: SYSTEM_MASTER/BOOK
Design lock: `BOOK-RECONSTRUCTION-B01-C-CAPABILITY-BINDING-CONTEXT-RUNTIME-DESIGN-LOCK-001`
Qualified exact subject: `77f488b9c73fe1bb3c923863f6557b914a05a0a0`
Successful GitHub Actions run: `34686482841`
Preceding failed subject: `fc557da0e6bac890c6d4bb59f2f53de15a731b55`
Preceding failed run: `34686449202`
Standing: `D3_BUILD_COMPLETE__HOSTED_PORTABLE_PASS_AFTER_OBSERVED_REPAIR__D4_ADMITTED`
Canonical effect: NONE

## Built surface

D3 added an additive current-lineage execution-foundation layer instead of destructively rewriting recovered workflow substrate:

- `system-master/book-system/book-execution-foundation-b01.js`
- `system-master/book-system/book-execution-foundation-b01.test.js`
- `.github/workflows/book-b01-d3-execution-foundation-qualification.yml`

Recovered pre-reconstruction routing/planning/concurrency/retry modules remain available as donor/provenance substrate. D3 does not make retired `PROSE.*` execution IDs callable and does not change scheduler dispatch eligibility.

## Current Book routing and execution identity

The D3 layer requires current `BOOK.LITERARY.*` / `BOOK.EVALUATION.*` capability IDs plus exact `BookCapabilityBindingV1` identity/digest. It records immutable underlying provider service/operation provenance separately. Current owner is always `SYSTEM_MASTER/BOOK`.

Every D3 route currently remains non-dispatchable. With the frozen D1 registry, literary routes are blocked by `BLOCKED_PROVIDER_SUBJECT_UNADMITTED`; evaluator routes are additionally `BLOCKED_EVALUATOR_ISOLATION`. A provider subject reference, if later observed, still does not by itself prove availability and therefore does not automatically authorize dispatch.

All current routes remain explicit false for canonical write, lifecycle transition, export freeze, publication and author-decision authority; private authority remains `NOT_GRANTED_BY_BINDING`.

## Plan / concurrency / retry semantics

D3 binds execution-plan task semantic identity to:

- workflow/source identity;
- plan identity/digest;
- current Book capability ID;
- exact capability binding ID/digest;
- adapter ID/version;
- provider service/operation/subject provenance;
- input hashes; and
- bound-context identity/digest.

A changed binding therefore changes the task/plan/operation identity rather than being treated as the same logical operation.

Concurrency is policy-only at D3: read-only current Book literary work may be classified parallel-eligible, candidate generation remains serial and non-idempotent, and evaluator work remains isolation-gated. `executable_now` remains false.

Retry/reconciliation preserves the recovered law:

- idempotent same-operation retry can only be a policy result and does not itself dispatch;
- non-idempotent unknown outcome => `RECONCILE_REQUIRED`;
- confirmed no effect requires evidence before a new attempt policy can be returned;
- confirmed existing result => reuse/review existing result;
- changed binding/input => new operation identity;
- automatic dispatch is false for all D3 retry decisions.

## Observed failed subject and repair

The first hosted D3 subject, `fc557da0e6bac890c6d4bb59f2f53de15a731b55`, failed run `34686449202` after the D1 substrate passed. The failure was an implementation defect in `buildCurrentOperationIdentity`: the returned object referenced undefined variable `task_id` instead of parameter `taskId`.

That failed subject is preserved as failure evidence and grants no qualification standing.

The exact live head was re-read, the defect was repaired in commit `77f488b9c73fe1bb3c923863f6557b914a05a0a0`, and a fresh hosted run was allowed to qualify only the repaired subject.

## Hosted exact-subject qualification

Run `34686482841` completed `success` on exact subject `77f488b9c73fe1bb3c923863f6557b914a05a0a0`.

| Job | Environment | D1 substrate | D3 current-identity result |
|---|---|---|---|
| `103534234229` | Ubuntu 24.04.5 LTS, Node 22 | PASS | PASS |
| `103534234337` | Ubuntu 24.04.5 LTS, Node `v24.20.0` | 216 checks PASS | 171 checks PASS |

Observed D3 result on Node 24:

- current Book capability mappings: 11;
- execution-plan task bindings exercised: 3;
- retired Prose execution allowed: false;
- scheduler dispatch changed: false;
- current dispatch authorized by D3: false;
- non-idempotent unknown-outcome auto replay: false;
- evaluator isolation satisfied: false;
- provider subjects admitted: 0;
- canonical effect allowed: false;
- publication authority granted: false;
- private authority granted: false.

The D1 implementation-level 216 checks and D3 171 checks do not replace the design-locked whole-B01 64-case denominator. They are stage-local direct assertions.

## Evidence boundaries

This PASS proves only the exact repaired D3 hosted portable subject and the exercised D1/D3 semantics. It does not prove:

- external/provider availability or correctness;
- author decision standing;
- private manuscript/source authorization;
- fresh-blind evaluator isolation;
- native target behavior;
- publication or production standing;
- A-01 target standing;
- complete B01 integration or B00 cumulative preservation.

Historical Prose/provider identities remain nested provenance only. No historical PASS was transferred.

## D3 freeze disposition

D3 is frozen as current Book routing/plan/concurrency/retry identity substrate. It intentionally does not alter current scheduler dispatch eligibility.

Exactly one dependency-valid successor is bound:

`BOOK-RECONSTRUCTION-B01-D4 — SCHEDULER + FAILURE + CANCELLATION/RESUME + EVIDENCE + ADMISSION HANDOFF CURRENT-BOOK REBIND`

D4 requirements:

1. consume the D3 binding-plan/current operation identity rather than old Prose execution ownership;
2. permanently reject retired `PROSE.*` execution tasks and stale binding/context identities;
3. with current null provider subjects, rediscover/persist explicit blockers rather than call workers;
4. preserve restart/offline recovery, lost-response reconciliation and verified-completion reuse;
5. preserve failure/cancel/resume/evidence records with exact current capability/binding/operation/provider provenance;
6. rebind candidate admission handoff to `BOOK.LITERARY.GENERATE_REVISION_CANDIDATE` + exact binding digest while keeping handoff `canonical_effect=false`;
7. do not authorize scheduler dispatch merely from capability name, provider reference or mutable transport metadata;
8. add direct current tests before any current `BOOK.*` dispatch eligibility can change; and
9. re-read the exact live Book owner head before mutation.

No author/private/native/publication/external-provider/production/A-01 standing is claimed.
