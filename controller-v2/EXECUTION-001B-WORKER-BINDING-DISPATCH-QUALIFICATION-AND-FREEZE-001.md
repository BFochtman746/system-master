# CONTROLLER V2 — EXECUTION-001B WORKER BINDING + DISPATCH QUALIFICATION AND FREEZE 001

Status: **HOSTED-PORTABLE QUALIFIED / EXECUTION-001B FROZEN / PRODUCTION ACTIVATION BLOCKED_EXTERNAL_SETUP**

Controller lineage base reread before this unit:
- `controller-v2/foundation-006-c1-rebind@73823a31e58e2083549a7916afbfed6065f7113d`
- frozen predecessor EXECUTION-001A exact qualified subject: `0991aeb39a1de71d1755ed6e5f5039ae6f3a7a05`

EXECUTION-001B forensic/build lineage:
- retired draft audit commit: `7029ec3ad538b8c6198e04898e720fffc57cbb71`
- repaired runtime candidate introduction: `406d395796b95097bd5dfa87f3f6c0566d4057c6`
- first 60-case denominator commit: `bbc8e012a2f98b109cde45fa5b971a50b70f9d4f`
- exact qualified executable subject: `70769023a7516fc0ff12fdb11fe1b5f86c9039b6`
- exact tree: `de8ab1ea586e380bc0b68a0e46fa0e5e58d8c0d4`
- workflow: `.github/workflows/controller-v2-foundation.yml`
- workflow run: `34689129790`
- run conclusion: **SUCCESS**
- historical/retired PASS transfer: **0**

## 1. Forensic cycle result

`RECOVER -> INVENTORY -> ANALYZE -> TARGETED RESEARCH -> ADJUDICATE -> DESIGN-LOCK -> BUILD -> ISOLATED QUALIFICATION -> CUMULATIVE REGRESSION/CALIBRATION -> FREEZE`

Standing:
- RECOVER: **PASS**
- INVENTORY: **PASS**
- ANALYZE: **PASS**
- TARGETED RESEARCH: **PASS / no additional research required after the provider-neutral identity/dispatch questions were already resolved by the frozen lock**
- ADJUDICATE: **PASS**
- DESIGN-LOCK: **PASS, including R1 + R2**
- BUILD: **PASS on exact subject 70769023...**
- ISOLATED QUALIFICATION: **PASS — WDI-001..060 preserved at 60/60**
- CUMULATIVE REGRESSION/CALIBRATION: **PASS on the same exact subject**
- FREEZE: **AUTHORIZED HOSTED-PORTABLE**
- PRODUCTION/NATIVE/A-01: **NOT CLAIMED**

## 2. Qualification environment and exact-subject evidence

GitHub Actions run `34689129790` checked out exact subject `70769023a7516fc0ff12fdb11fe1b5f86c9039b6` and completed successfully in all four required matrix jobs:

- Ubuntu latest / Node 22 — PASS
- Ubuntu latest / Node 24 — PASS
- Windows latest / Node 22 — PASS
- Windows latest / Node 24 — PASS

Each job executed the complete Controller v2 cumulative test command. The frozen `worker-dispatch-kernel.test.js` on that exact subject contains WDI-001 through WDI-060 without denominator shrinkage, so this same-subject matrix qualifies both the isolated EXECUTION-001B denominator and cumulative Controller regression.

The first denominator subject `bbc8e012...` is preserved as failed evidence only. Its failures exposed qualification-fixture defects: two expiration tests allowed the lease to expire before the intended binding-expiry assertion, and contract-only PLANNED-operation fixtures attempted to acquire a lease. Those fixtures were repaired without weakening runtime requirements or removing any WDI case. No PASS is transferred from the failed subject.

## 3. Frozen runtime boundaries

EXECUTION-001B now freezes the following Controller-owned semantics:

1. immutable content-addressed worker evidence bindings referencing external identity/delegation evidence without inventing that evidence;
2. append-only worker-binding revocation evidence;
3. immutable execution contracts exact-bound to current Controller transaction, operation, subject and resource truth;
4. content-addressed dispatch intent with live lease/fence validation at creation but no historical foreign key to the live lease projection;
5. two-stage R2 identity: Stage-A `controller.worker-dispatch/v1` dispatch identity and Stage-B `controller.worker-dispatch-envelope/v1` external request envelope;
6. deterministic request digest verification at effect preparation, authorization and permit boundaries;
7. strict full effect tuple binding: transaction, operation, provider, effect type, target, idempotency key and request digest;
8. reuse of Foundation-003 PREPARED -> UNKNOWN -> reconciliation semantics rather than creating a second effect/retry state machine;
9. no physical-send permit before the authorization event is durably `SEALED` in the journal/outbox barrier;
10. current worker binding + current live lease/fence are revalidated at send-authority boundaries;
11. fresh-store recovery reconstructs immutable dispatch history but restores zero historical live claim authority;
12. recovered contract/dispatch/binding data is admitted through semantic validators at least as strict as live mutation;
13. worker-facing ports remain bounded to heartbeat/result behavior and do not expose registrar, execution-contract, dispatch-intent, lease, effect-authorization, journal-seal or semantic-admission authority.

## 4. Adversarial defects closed from the retired draft

The exact qualified subject closes all blocking findings from `EXECUTION-001B-RETIRED-DRAFT-FORENSIC-ADJUDICATION-001.md`:

- RD-001 — Stage-B envelope protocol can no longer be overwritten by Stage-A identity spread;
- RD-002 — dispatch effect preparation now rereads READY + executable transaction standing;
- RD-003 — activation/permit exact-check the full external-effect binding tuple;
- RD-004 — recovered execution contracts exact-bind recovered transaction subject identity;
- RD-005 — recovered dispatches exact-check transaction/operation/resource/contract relations;
- RD-006 — binding/revocation recovery uses strong canonical schema validators;
- RD-007 — envelope digest is revalidated at authority boundaries before authorization/permit.

## 5. Authority and blocker fences

This freeze does **not** manufacture or transfer:

- production worker identity;
- delegation validity from an external identity/delegation authority;
- real capability attestation;
- human approval for dangerous work;
- provider credentials or real provider execution standing;
- native/device correctness;
- distributed/network-filesystem correctness;
- production deployment standing;
- A-01 evidence.

Production Controller activation therefore remains **`BLOCKED_EXTERNAL_SETUP`**.

No CORE, LEARNING, BOOK or DOCUMENTS owner control or specialist semantics are mutated or absorbed by this freeze.

## 6. Traceability closure

| Requirement / invariant | Current component | Durable state | Interface / contract | Qualification | Environment | Remaining blocker |
|---|---|---|---|---|---|---|
| verified worker evidence binding | WorkerDispatchKernel | worker_bindings + revocations + events | registrar-side record/revoke/current-standing | WDI-007..020 PASS | hosted portable | real external identity/delegation evidence |
| immutable execution contract | WorkerDispatchKernel | execution_contracts + event | record execution contract | WDI-021..028 PASS | hosted portable | real specialist payload/provider is external |
| fenced dispatch identity | WorkerDispatchKernel | dispatch_intents + event | create/reconcile dispatch intent | WDI-029..042 PASS | hosted portable | later worker selection policy |
| ambiguous external send | Foundation-003 reused by WorkerDispatchKernel | external_effects + attempts + journal/outbox | prepare/authorize/reconcile/permit | WDI-043..053 + cumulative PASS | hosted portable | real provider observation/credentials external |
| cancellation/restart/fencing | tx/op/claim recovery + v7 projections | durable journal + recovered projections | reconcile | WDI-054..060 + cumulative PASS | hosted portable | native/production evidence external |
| no peer-specialist authority capture | bounded Controller kernel/ports | immutable refs/digests only | worker port excludes control mutation | WDI-014..020,058..059 PASS | structural + hosted | none inside Controller; external setup remains external |

For this bounded EXECUTION-001B scope, **unaccounted requirements = 0** and denominator shrinkage = 0.

## 7. One dependency-valid successor

`CONTROLLER-EXECUTION-001C-WORKER-SELECTION-AND-DISPATCH-RECONCILER-RECOVERY-INVENTORY-001 — RECOVER CURRENT SCHEDULER/WORKER-SELECTION/RECONCILIATION SUBSTRATE AGAINST FROZEN EXECUTION-001A + EXECUTION-001B; INVENTORY PRIORITY/FAIRNESS/PLACEMENT/CAPABILITY-SELECTION/WAKEUP/RESTART CONTRACTS; CLASSIFY REUSE/ADAPT/QUALIFIER_ONLY/PROVENANCE_ONLY/GAP; DO NOT BUILD UNTIL THE LOSSLESS INVENTORY AND AUTHORITY BOUNDARIES ARE FROZEN.`

Hard fence for the successor: worker selection may consume immutable eligibility, worker-binding and dispatch interfaces but may not mutate CORE/LEARNING/BOOK/DOCUMENTS owner controls, invent external identity/delegation truth, bypass Resource/lease fencing, create a second external-effect state machine, or treat wakeups/heartbeats/chat/webhook metadata as semantic authority.
