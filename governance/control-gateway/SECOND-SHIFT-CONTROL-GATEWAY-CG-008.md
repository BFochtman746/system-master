# SECOND-SHIFT-CONTROL-GATEWAY-CG-008 — SUPERVISOR INTEGRATION / A-01 ADMISSION + ORDERING HANDOFF + HOST QUALIFICATION

Status: **HOST QUALIFIED / DEVELOPMENT FROZEN / A-01 WINDOWS QUALIFICATION NOT YET PERFORMED / PRODUCTION NOT ACTIVATED**  
Mission authority: `SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v1.0`  
Exact predecessor freeze: `8d6a9bd0fd22cc0ee8db2fe688b4c2e0209f91c4`  
Branch: `second-shift-control-gateway/cg-008-supervisor-integration`  
Exact qualified implementation: `8a74194a37e81ae979f92ecbb0c55fbc371b4fc2`  
Host qualification run: `34671167418`  
Qualification receipt: `SECOND-SHIFT-CONTROL-GATEWAY-CG-008-HOST-QUALIFICATION-34671167418`

## 1. Closure statement

CG-008 closes the host-qualified handoff boundary from durable GitHub Control Gateway admission into A-01 `SecondShiftSupervisorV2`. The Control Gateway owns durable authority, validation, dependency-valid admission intent, and the exact handoff contract. After handoff, `SecondShiftSupervisorV2` owns live execution order/timing, claims, leases, fencing, retry/circuit behavior, dispatch outbox reconciliation, and restart recovery.

GitHub Actions remains transport/admission/evidence/resource-lock infrastructure. It is not an independent A-01 scheduler.

CG-008 does not claim general multi-item dependency-DAG, concurrency, or cancellation closure; those remain CG-009. It also does not claim actual A-01 Windows qualification or production activation.

## 2. Implemented and qualified surface

CG-008 provides:

- strict A-01 admission + supervisor handoff contracts in `control-gateway/src/a01-supervisor-handoff.js`;
- gateway-to-supervisor binding in `control-gateway/python/a01_supervisor_adapter.py`;
- exact adapter tests proving timing, idempotency, fencing/claim ownership, tamper rejection, and that GitHub cannot become scheduler owner;
- registered A-01 qualification `SECOND-SHIFT-SUPERVISOR-V2-A01-STRESS` in registry version 31;
- registered wrapper `.github/scripts/a01-second-shift-supervisor-v2-qualify.js`;
- migrated supervisor Windows stress entry point that routes only through `.github/workflows/a01-control-plane-gateway.yml`;
- explicit `subject_sha` and `origin_ref` inputs for A-01 stress qualification;
- removal of the legacy automatic repository-push trigger from the A-01 stress path;
- standalone external-infrastructure classification so this controller cannot be reinterpreted as a System Master product system or inherit a product execution lane;
- a host qualification workflow that binds the exact durable CG-008 authority snapshot and does not recursively rerun on the terminal governance freeze.

## 3. Ordering ownership freeze

CG-008 freezes the following boundary:

1. The Control Gateway verifies exact mission/workstream/authority epoch/operation/predecessor/dependencies/subject and emits an admitted handoff.
2. The handoff preserves `execution_order`, priority, timing window, idempotency, exact subject, and exact admitted payload.
3. A-01 `SecondShiftSupervisorV2` converts the handoff into its own READY/claim lifecycle.
4. A-01—not GitHub Actions—owns live ordering/timing, claims, fencing, retries, dispatch reconciliation, and restart recovery.
5. GitHub Actions may transport the request, perform policy admission, hold a resource lock, and persist evidence; it is not a second scheduler.

This is an **ordering handoff** closure, not the full general dependency-DAG/concurrency/cancellation engine.

## 4. Legacy route closure

The old supervisor stress path no longer executes directly on a self-hosted runner. It calls the canonical A-01 gateway with the registered qualification ID. It also no longer has an automatic `push:` trigger; A-01 supervisor qualification requires an explicit exact subject and owning ref.

The legacy GitHub overnight workflow `.github/workflows/a01-overnight-night-shift.yml` remains a separate cutover blocker because it still expresses GitHub cron/slot-chain scheduling semantics. It is not silently retired by CG-008; its scheduler authority must be retired or demoted in the dedicated night-scheduler cutover operation.

## 5. Host qualification

Exact subject `8a74194a37e81ae979f92ecbb0c55fbc371b4fc2` passed on both Node 22 and Node 24.

Per runtime:

- Control Gateway suite: **145 tests / 142 pass / 0 fail / 3 intentional environment skips**.
- Gateway-to-supervisor adapter: **11 / 11 pass**.
- Supervisor reliability suite: **28 / 28 pass**.
- Randomized supervisor stress: **20,000 transitions**, seed `0x5EC0D5`, logical invariants checked every transition.
- Crash, concurrency, idempotency, shift-window, stale-fence, outbox, restart, committed/uncommitted SQLite transaction, final full snapshot, and physical integrity cases passed.
- The optimized stress path changes only current-row read strategy; transition semantics and rigor are preserved, `rigor_reduced=false`.

The qualification also passed A-01 registry validation, standalone topology validation, and exact gateway-only routing checks against the live revision-8 durable authority snapshot.

## 6. Durable state closure

CG-008 terminal publication is revision 9 on:

`control-gateway-state/active-work/second-shift-control-gateway-dev`

State commit: `72d24ba45584797d172a3222adaf17f0ec9e231b`  
Authority epoch: `10`  
Packet digest: `8cef60ae4e047337a974002e6460e91c38724b514438cc82bf6f859466c7c7a6`  
Publication digest: `bcb8c0d29b14f4c57b91fdb260f9d304fc54d562bf787f03b76400ca1dbb22a4`

The authoritative subject is now the exact host-qualified implementation `8a74194a37e81ae979f92ecbb0c55fbc371b4fc2`. CG-008 is `TERMINAL / PASSED / ADMITTED`; A-01 state is `NOT_REQUIRED` because this operation is host qualification only.

## 7. Remaining blockers

1. **Actual A-01 Windows qualification remains mandatory.** Registration and host qualification are not execution on the actual A-01 host.
2. **Legacy GitHub night scheduler authority remains open.** The cron/slot-chain workflow must be retired or demoted before production single-scheduler cutover.
3. **Production activation remains false.** CG-008 is a development freeze only.

## 8. Exact successor

`SECOND-SHIFT-CONTROL-GATEWAY-CG-009 — DEPENDENCY DAG / CONCURRENCY / CANCELLATION + HOST QUALIFICATION`

Exact predecessor receipt:

`SECOND-SHIFT-CONTROL-GATEWAY-CG-008-HOST-QUALIFICATION-34671167418`
