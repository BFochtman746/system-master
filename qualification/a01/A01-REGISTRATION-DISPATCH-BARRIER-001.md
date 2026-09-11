# A01-REGISTRATION-DISPATCH-BARRIER-001

Status: POLICY V8 IMPLEMENTATION CANDIDATE — REQUIRES EXACT-SHA QUALIFICATION
Owner: SYSTEM_MASTER/CORE
Scope: Shared A-01 control-plane admission and retry semantics

## Authority

This shared-control-plane repair is justified by repeated GitHub-hosted runner non-assignment before any hosted step executed, while the private A-01 Windows/X64 runner remained operational. It does not change product qualification semantics, A-01 identity, registry ownership, promotion authority, product topology, or any product lane objective.

## Canonical flow

For non-disruptive qualifications:

`request -> gateway -> trusted A-01 metadata-only admission -> ADMITTED -> exact subject executor -> receipt/evidence -> return/repair`

Only `ADMITTED` may invoke subject checkout or the private subject executor.

## Trusted metadata-only admission

The admission job may acquire A-01, but before admission it may checkout only the exact canonical control-plane commit. It must not checkout, read, load, or execute qualification-subject bytes.

Using canonical control-plane code plus authenticated GitHub repository metadata, the broker validates:

- exact control-plane checkout SHA;
- exact requested subject commit SHA exists in the repository;
- registered qualification ID at the exact control-plane SHA;
- registered workstream equality;
- safe registered wrapper path and declared source;
- wrapper existence in the exact subject tree by Git metadata, or in exact control-plane bytes when `source=control_plane`;
- normal/overnight context and timeout policy;
- overnight eligibility;
- absence of disruptive post actions under the metadata-only fallback;
- repair lineage when an existing repair transaction is supplied.

The admission evidence records `admission_mode=TRUSTED_SELF_HOSTED_METADATA_ONLY`, `pre_admission_subject_checkout=false`, and `pre_admission_subject_execution=false`.

Canonical states include `ADMITTED`, `WAITING_FOR_REGISTRATION`, `REGISTERED_EXECUTABLE_MISSING`, `WORKSTREAM_MISMATCH`, `INVALID_SUBJECT_SHA`, `SUBJECT_METADATA_READ_FAILURE`, `SUBJECT_METADATA_IDENTITY_MISMATCH`, `SUBJECT_METADATA_TREE_TRUNCATED`, `CONTROL_PLANE_CHECKOUT_MISMATCH`, `INVALID_CONTROL_PLANE_POLICY`, `INVALID_REGISTRY`, `INVALID_REGISTERED_WRAPPER_PATH`, `INVALID_REGISTERED_WRAPPER_SOURCE`, `INVALID_EXECUTION_CONTEXT`, `INVALID_QUALIFIER_TIMEOUT`, `QUALIFICATION_NOT_OVERNIGHT_ELIGIBLE`, `QUALIFIER_TIMEOUT_EXCEEDS_REGISTRY`, `DISRUPTIVE_QUALIFICATION_NOT_ALLOWED_OVERNIGHT`, `DISRUPTIVE_QUALIFICATION_REQUIRES_HOSTED_BARRIER`, and `CONTROL_PLANE_READ_FAILURE`.

A blocked request may consume only the trusted admission slot. It must fail before subject checkout/execution and must not be classified as a product subject failure.

## Exact identity

The broker emits one exact `control_plane_sha` and verifies one exact subject commit identity by repository metadata. After admission, the executor independently checks out that control-plane SHA and subject SHA and verifies both working-tree identities before executing the registered wrapper. Receipt fields remain `subject_sha`, `checkout_sha`, `control_plane_sha`, `control_plane_checkout_sha`, and `workflow_run_attempt`.

## Retry law

GitHub failed-job or specific-job reruns can retain the original resolved reusable-workflow SHA. Therefore a rerun is never an authority refresh. If registry, policy, gateway, broker, executor, or qualifier registration changes, use a fresh workflow run. Stale attempts remain historical evidence.

## All-process contract

### Normal
All active System Master owner/candidate callers use `.github/workflows/a01-control-plane-gateway.yml`; that filename remains the compatibility front door.

### Repair
`.github/workflows/a01-repair-rerun.yml` preserves exact transaction identity and uses the same-commit gateway. Optional repair lineage is validated using trusted control-plane bytes only before subject execution.

### Overnight / Second Shift
The central night scheduler remains the only independent A-01 schedule. Non-disruptive registered tickets use the same metadata-only admission. Second Shift cannot bypass registration, exact SHA, owner, or qualification rules.

### Runner offline
If A-01 is offline, admission or execution may wait in GitHub's self-hosted queue. This is infrastructure waiting, not product failure.

### Reboot / disruptive actions
Policy v8 metadata-only admission is deliberately non-disruptive. A qualification with a registered post action such as `windows_reboot` returns `DISRUPTIVE_QUALIFICATION_REQUIRES_HOSTED_BARRIER` and does not reach subject execution until a separately safe hosted/lease-based disruptive path is restored and requalified.

## Enforcement

- Gateway must call the canonical broker.
- Broker may use A-01 only for trusted metadata-only admission and must not checkout subject bytes.
- Broker alone may call the private subject executor.
- Executor remains the only canonical phase allowed to checkout/execute admitted subject bytes.
- Legacy pinned direct workflows remain immutable historical exceptions.
- Independent scheduled A-01 callers remain prohibited outside central Night Shift.
- Arbitrary qualifier commands remain prohibited.

## PASS criteria

Exact candidate must prove:
1. admission barrier selftest PASS;
2. synthetic unregistered ID blocks before subject checkout/execution;
3. registered non-disruptive qualification can return `ADMITTED` from exact repository metadata;
4. pre-admission subject checkout is absent from the broker workflow;
5. control-plane SHA and subject metadata identity checks PASS;
6. enforcement rejects any broker that checks out subject bytes before admission;
7. disruptive qualification is rejected by metadata-only admission;
8. repair/overnight/global-queue invariants remain intact;
9. executor independently verifies exact subject and control-plane checkouts after admission;
10. authoritative A-01 control-plane selftest PASS on the exact candidate.
