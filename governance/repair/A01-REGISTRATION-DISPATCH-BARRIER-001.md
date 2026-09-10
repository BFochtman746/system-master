# A01-REGISTRATION-DISPATCH-BARRIER-001

Status: IMPLEMENTATION CANDIDATE
Owner: SYSTEM_MASTER shared A-01 control plane
Successor boundary: A01-CLOSED-LOOP-REPAIR-001D
Date: 2026-09-09

## Problem

A qualification may be registered on `main` after a caller run has already resolved a reusable workflow reference such as `a01-control-plane-gateway.yml@main`. GitHub preserves the originally resolved reusable-workflow commit when failed jobs or a specific job are rerun. Therefore a rerun can execute an older control-plane checkout and truthfully return `UNREGISTERED_QUALIFICATION` even though the live `main` registry contains the qualification.

This is a control-plane freshness race, not an A-01 Windows-runner defect.

## Repository proof

- Run `34419309748` resolved the reusable gateway to `581f5842f17fe191e9faa178c5b62d58008f08a2` and later returned `UNREGISTERED_QUALIFICATION` for the lifecycle compatibility adapter.
- The qualification was subsequently registered at `49dac6aa75a3b617092c0a20c66fa692ee04f5a2`.
- A new run `34419773379` resolved the gateway to that newer authority and passed the unchanged exact subject `fc5adf8fd130d7b5324cff0058ab3804d75ec54e`.
- A01-CLOSED-LOOP-REPAIR-001C now preserves same-transaction repair lineage after a real non-PASS. It does not remove the initial registration/freshness race, so this boundary is additive.

## External behavior researched

1. GitHub documents that rerunning failed jobs or one job in a workflow that references a reusable workflow by a non-SHA ref reuses the reusable workflow commit from the first attempt.
2. GitHub documents that reruns retain the original `GITHUB_SHA` and `GITHUB_REF`.
3. GitHub recommends same-repository relative reusable-workflow references when both workflows are in one repository; they execute from the caller's commit.
4. GitHub states that full commit SHAs are the safest immutable reference for externally referenced actions/workflows.
5. `workflow_dispatch` accepts an explicit `ref` and declared inputs, giving the control plane a single default-branch front door while keeping `subject_sha` an independent exact input.
6. `workflow_dispatch` is accepted only when its workflow file exists on the default branch.

Primary references:
- https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations
- https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs
- https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows
- https://docs.github.com/en/rest/actions/workflows
- https://docs.github.com/en/actions/reference/security/secure-use

## Permanent invariants

### I1 — One ordinary front door

All ordinary cross-lane A-01 requests enter through `.github/workflows/a01-qualification-dispatch.yml` on the default branch. Product lanes do not create a new self-hosted workflow or floating `@main` reusable-workflow caller for each qualification.

### I2 — Hosted admission before A-01 acquisition

A hosted admission job verifies, against one exact control-plane commit:

- control-plane commit identity;
- policy validity;
- registry entry existence;
- exact workstream ownership;
- exact subject checkout SHA;
- registered wrapper source/path and existence;
- no arbitrary command input;
- optional repair transaction binding.

The self-hosted A-01 job cannot begin unless this barrier passes.

### I3 — Dual immutable identity

Every new A-01 request and authoritative receipt binds both:

- `subject_sha`: bytes being qualified;
- `control_plane_sha`: exact policy/registry/gateway bytes that admitted and executed the qualification.

Neither identity may be silently rebound.

### I4 — Fresh dispatch after control-plane change

If registry, policy, gateway, qualifier registration, admission code, or other control-plane bytes change after a failed attempt, **do not rerun a failed/specific job from that old run**. Create a fresh default-branch dispatch. A same-run/same-SHA retry is valid only when the control-plane SHA is unchanged and A01-CLOSED-LOOP-REPAIR-001C classifies the failure as bounded retryable infrastructure.

### I5 — Same-commit reuse inside the control plane

Canonical same-repository control workflows call one another with relative `./.github/workflows/...` references. They must not use a floating `@main` reference for the canonical gateway. This binds the workflow graph to one commit.

### I6 — Enforcement, not convention

Hosted enforcement rejects:

- direct unregistered self-hosted A-01 workflows;
- independent scheduled A-01 workflows;
- floating canonical-gateway references such as `@main`, `@master`, tags, or arbitrary branch names;
- noncanonical relative gateway callers outside the explicit front-door / repair-rerun / overnight scheduler set.

An emergency full 40-hex SHA reference can remain temporarily admissible because it is immutable, but it is not the ordinary launch path.

### I7 — Existing 001C repair lineage remains authoritative

001D does not replace 001C. After a real A-01 non-PASS, 001C continues to own durable repair transaction, changed-subject prequalification, bounded same-SHA infrastructure retry, replacement rerun, and terminal receipt adjudication.

### I8 — No user-at-machine requirement

The A-01 Windows runner remains a worker behind GitHub Actions. Registration, admission, dispatch, evidence routing and fresh-run creation are remote control-plane functions. Physical access is required only for a genuine host/runner failure that cannot be remediated remotely.

## Admission states

- `ADMISSION_READY`: exact control-plane and exact subject have passed hosted admission.
- `WAITING_FOR_REGISTRATION`: qualification is absent from the exact control-plane registry; do not acquire A-01.
- `CONTROL_PLANE_STALE`: expected control-plane SHA differs; require fresh dispatch.
- `SUBJECT_IDENTITY_MISMATCH`: checkout does not equal requested exact subject.
- `REGISTERED_EXECUTABLE_MISSING`: registered wrapper is absent at the declared source.
- `WORKSTREAM_MISMATCH`: request does not match registry owner.

Only `ADMISSION_READY` unlocks the self-hosted A-01 job.

## Required qualification

Hosted qualification must prove at minimum:

1. valid registered request passes;
2. unknown qualification fails before A-01;
3. wrong workstream fails;
4. wrong expected control-plane SHA fails;
5. wrong exact subject checkout fails;
6. missing/unsafe wrapper fails;
7. control-plane-source wrapper resolves from control plane;
8. subject-source wrapper resolves from exact subject;
9. emitted admission evidence contains both immutable identities;
10. enforcement rejects floating gateway refs;
11. repair rerun and overnight scheduler retain same-commit semantics;
12. prior 001C repair selftests remain green.

A real live proof must then show one fresh dispatched registered qualification reaching A-01 with identical `control_plane_sha` in admission evidence and authoritative receipt.

## Migration rule

Historical exact-SHA receipts and failed runs are append-only. Do not relabel them. Existing lane-specific callers become historical/quarantined; they are not evidence that must be regenerated. New qualifications use the canonical front door.
