# A01-REGISTRATION-DISPATCH-BARRIER-001

Status: IMPLEMENTATION CANDIDATE — REQUIRES EXACT-SHA QUALIFICATION
Owner: SYSTEM_MASTER/CORE
Scope: Shared A-01 control-plane admission and retry semantics

## Authority

This is an additive shared-control-plane repair justified by reproduced `CONTROL_PLANE_FAILURE`. It does not change product qualification semantics, A-01 Windows/X64 identity, registry ownership, promotion authority, global concurrency generation, or any product lane objective.

## Canonical flow

`request -> gateway -> hosted admission -> exact control-plane binding -> A-01 executor -> receipt/evidence -> return/repair`

Only `ADMITTED` may invoke the private executor.

## Hosted admission

The broker must validate before a self-hosted job exists:

- exact control-plane checkout SHA;
- exact subject checkout SHA;
- registered qualification ID at that control-plane SHA;
- registered workstream equality;
- safe registered wrapper path and declared source;
- wrapper existence in exact subject or exact control-plane source;
- normal/overnight context and timeout policy;
- overnight eligibility and no disruptive post-action when overnight;
- repair lineage when an existing repair transaction is supplied.

Canonical states are `ADMITTED`, `WAITING_FOR_REGISTRATION`, `REGISTERED_EXECUTABLE_MISSING`, `WORKSTREAM_MISMATCH`, `SUBJECT_CHECKOUT_MISMATCH`, `CONTROL_PLANE_CHECKOUT_MISMATCH`, `INVALID_CONTROL_PLANE_POLICY`, `INVALID_REGISTRY`, `INVALID_REGISTERED_WRAPPER_PATH`, `INVALID_REGISTERED_WRAPPER_SOURCE`, `INVALID_EXECUTION_CONTEXT`, `INVALID_QUALIFIER_TIMEOUT`, `QUALIFICATION_NOT_OVERNIGHT_ELIGIBLE`, `QUALIFIER_TIMEOUT_EXCEEDS_REGISTRY`, `DISRUPTIVE_QUALIFICATION_NOT_ALLOWED_OVERNIGHT`, and `CONTROL_PLANE_READ_FAILURE`.

Blocked admission must preserve evidence, must not acquire A-01, and must not be classified as a product subject failure.

## Exact identity

The broker emits one exact `control_plane_sha`. The private executor must checkout that SHA rather than a floating branch and must independently verify it. The exact product `subject_sha` remains independently verified. Current evidence adds `control_plane_sha`, `control_plane_checkout_sha`, and `workflow_run_attempt` alongside existing subject identity fields.

## Retry law

GitHub failed-job or specific-job reruns of a branch-referenced reusable workflow can reuse the original resolved reusable-workflow SHA. Therefore a rerun is never considered an authority refresh.

If registry, policy, gateway, broker, executor, or qualifier registration changes, use a fresh workflow run. A stale run may be retained/retried only for diagnostics against its frozen generation and cannot claim newer `main` authority.

## All-process contract

### Normal
All CORE/LEARNING/BOOK/PROSE callers continue using `.github/workflows/a01-control-plane-gateway.yml`; that filename remains the compatibility front door.

### Repair
`.github/workflows/a01-repair-rerun.yml` must resolve its request against one exact workflow commit and use the same-commit gateway. Existing repair transaction identity and bounded attempt semantics remain intact.

### Overnight / Second Shift
The central night scheduler remains the only independent A-01 schedule and continues using the same-commit gateway. Every slot passes hosted admission before reaching A-01.

### Runner offline
If admission passed but A-01 is offline, the job may wait in GitHub's self-hosted queue. This is `WAITING_FOR_RUNNER`, not product failure. No physical operator is required while the runner service is online or once it returns.

### Reboot
The executor preserves existing health guard, receipt/evidence upload, delayed reboot, and hosted settle-window ordering.

## Enforcement

- Gateway must call hosted broker.
- Broker alone may call private executor.
- Executor is the only canonical new direct self-hosted workflow.
- Legacy pinned direct workflows remain immutable historical exceptions.
- Independent scheduled A-01 callers remain prohibited outside central Night Shift.
- Arbitrary qualifier commands remain prohibited.

## PASS criteria

Exact candidate must prove:
1. admission barrier selftest PASS;
2. synthetic unregistered ID yields `WAITING_FOR_REGISTRATION` and no runner acquisition;
3. registered selftest yields `ADMITTED`;
4. control-plane and subject SHA verification PASS;
5. enforcement rejects bypass architecture;
6. A-01 predecessor selftest regressions PASS;
7. overnight planner/enforcement regressions PASS;
8. repair lineage still validates;
9. global queue generation and reboot ordering remain unchanged;
10. authoritative A-01 selftest PASS on the exact candidate.
