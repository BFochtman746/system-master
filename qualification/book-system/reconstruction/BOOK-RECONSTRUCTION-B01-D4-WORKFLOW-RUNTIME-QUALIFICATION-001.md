# BOOK-RECONSTRUCTION-B01-D4 — WORKFLOW RUNTIME / RECOVERY / EVIDENCE / ADMISSION-HANDOFF QUALIFICATION 001

Date: 2026-09-12
Owner: SYSTEM_MASTER/BOOK
Design lock: `BOOK-RECONSTRUCTION-B01-C-CAPABILITY-BINDING-CONTEXT-RUNTIME-DESIGN-LOCK-001`
Qualified exact subject: `6d80ccb3c93409fc7066ef7a86138701bb0894c7`
Successful GitHub Actions run: `34686620698`
Preceding failed subject: `fa0c114ef57688b285d8174ad504911090f6259a`
Preceding failed run: `34686591106`
Standing: `D4_BUILD_COMPLETE__HOSTED_PORTABLE_PASS_AFTER_OBSERVED_REPAIR__B01_E_CUMULATIVE_QUALIFICATION_ADMITTED`
Canonical effect: NONE

## Built surface

D4 adds a current Book-owned coordination runtime without changing the recovered pre-reconstruction scheduler into a permissive execution path:

- `system-master/book-system/book-workflow-runtime-b01.js`
- `system-master/book-system/book-workflow-runtime-b01.test.js`
- `.github/workflows/book-b01-d4-workflow-runtime-qualification.yml`

The D4 runtime consumes D3 exact binding-plan/current-operation identity and produces only coordination/evidence objects. It does not call providers and does not invoke canonical admission.

## Scheduler / restart standing

Fresh reconciliation of current B01 tasks discovers blockers from the exact binding plan and persists `dispatch_authorized=false` for every task. Under the current D1 registry:

- literary tasks remain `BLOCKED_PROVIDER_SUBJECT_UNADMITTED`;
- evaluator tasks remain `BLOCKED_EVALUATOR_ISOLATION`;
- provider calls executed by this D4 runtime: 0;
- scheduler dispatch authorized: false;
- canonical effect: false.

Restart is idempotent over unchanged durable state. A previously verified completion remains `COMPLETED_VERIFIED` and is not redispatched. A task with `UNKNOWN_OUTCOME_RECONCILE_REQUIRED` remains reconciliation-blocked across restart. Current state and binding identity are revalidated rather than assuming read-after-write freshness.

Durable scheduler records are content-addressed/create-once. Exact replay is idempotent; same-key divergent state fails closed.

## Failure / cancellation / evidence

D4 content-addressed records bind exact plan/binding-plan/task/current capability/binding/operation/provider provenance and remain coordination-only:

- failure records never authorize retry by themselves;
- cancellation checkpoints require state reread on resume and prohibit redispatch of unknown outcomes;
- execution receipts are evidence records only and cannot self-authorize canon, publication or author decisions;
- raw/private manuscript/candidate fields and canonical-effect payload fields remain forbidden from durable D4 records.

The isolated tests use explicitly named `synthetic-test://` receipt/result references when exercising receipt and admission-envelope structure. Those synthetic values are test fixtures only and are expressly **not real provider evidence**.

## Admission handoff

D4 rebinds the candidate handoff to the current Book capability `BOOK.LITERARY.GENERATE_REVISION_CANDIDATE`, exact capability-binding digest and exact current operation/receipt identity. Historical/provider service/operation identity remains nested provenance.

The handoff is explicitly:

- target authority: `SYSTEM_MASTER/BOOK_CANONICAL_CONTENT_ADMISSION`;
- `canonical_effect=false`;
- `publication_authority=false`;
- `author_decision_authority=false`;
- `handoff_only=true`.

A non-generation result cannot be repackaged as a candidate-admission handoff. A tampered receipt/binding fails closed. D4 does not call or emulate canonical admission.

## Observed failed subject and repair

The first hosted D4 subject, `fa0c114ef57688b285d8174ad504911090f6259a`, failed run `34686591106` after D1 and D3 both passed. The defect was in content-addressed record validation: validation recomputed semantic digests while incorrectly retaining the derived content-addressed ID field, causing `SCHEDULER_STATE_DIGEST_MISMATCH`.

That failed subject is retained as failure evidence and grants no qualification standing.

The live Book head was re-read and the validator was repaired so each record digest is recomputed from the same semantic projection used at creation, excluding both the derived digest and derived content-addressed ID. The repaired exact subject is `6d80ccb3c93409fc7066ef7a86138701bb0894c7`.

## Hosted exact-subject qualification

Run `34686620698` completed `success` on exact subject `6d80ccb3c93409fc7066ef7a86138701bb0894c7`.

| Job | Environment | D1 | D3 | D4 |
|---|---|---:|---:|---:|
| `103534606078` | Ubuntu 24.04.5 LTS, Node 22 | PASS | PASS | PASS |
| `103534606005` | Ubuntu 24.04.5 LTS, Node `v24.20.0` | 216 checks PASS | 171 checks PASS | 63 checks PASS |

Observed D4 Node-24 result:

- scheduler tasks exercised: 3;
- provider subjects admitted: 0;
- provider calls executed: 0;
- scheduler dispatch authorized: false;
- retired Prose execution allowed: false;
- verified completion reused after restart: true;
- unknown outcome redispatched: false;
- admission handoff canonical effect: false;
- synthetic execution receipts counted as real provider evidence: false;
- canonical/publication/author/private authority granted: false.

The stage-local 63 check count does not replace the design-locked whole-B01 64-case denominator.

## Evidence boundaries

This PASS proves only the exact repaired D4 hosted-portable coordination/evidence semantics exercised here. It does not prove any provider availability/correctness, real provider result, private source access, author decision, evaluator independence, native target behavior, publication, production or A-01 standing. No historical PASS was transferred.

## D4 freeze disposition

D4 is frozen. D1-D4 now provide a current Book-owned execution-foundation candidate in which old Prose execution IDs remain permanently denied and current Book tasks remain non-dispatchable while required provider/isolation evidence is absent.

Exactly one dependency-valid successor is bound:

`BOOK-RECONSTRUCTION-B01-E — FROZEN 64-CASE ISOLATED DENOMINATOR + CUMULATIVE B00/CONTEXT/DURABILITY/SCHEDULER REGRESSION ON ONE EXACT SUBJECT`

B01-E must execute, on one exact candidate subject:

1. the design-locked I01-I24 + M01-M11 + A01-A20 + X01-X09 = 64 B01 cases;
2. B00 Q001-Q096 and PRE01-PRE21 cumulative behavior;
3. the exact recovered/current Context Compiler 44-case denominator;
4. the current durable-store 14-case regression;
5. the current recovered scheduler direct regression, including zero retired-Prose dispatch;
6. D1/D3/D4 direct stage regressions; and
7. explicit evidence-boundary assertions that no null provider, synthetic receipt, author/private/native/publication/production/A-01 standing is promoted.

B01 may freeze only if the exact-subject cumulative run is valid and unaccounted B01 requirements remain 0.
