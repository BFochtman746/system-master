# A01-OPERATING-MODE-001

Status: ACTIVE - POLICY V8 TRUSTED METADATA ADMISSION / NORMAL QUALIFICATION MODE
Date updated: 2026-09-10

## Purpose

`A01-CONTROL-PLANE-001` is normal shared qualification infrastructure for System Master. Product work uses the registered gateway/control plane rather than rebuilding or directly invoking A-01.

## Current baseline

- Policy: `qualification/a01/a01-policy.json`, policy version **8**.
- Registry: `qualification/a01/registry.json`, versioned independently.
- Public compatibility front door: `.github/workflows/a01-control-plane-gateway.yml`.
- Trusted metadata-only admission broker: `.github/workflows/a01-control-plane-admission-broker.yml`.
- Private exact-subject executor: `.github/workflows/a01-control-plane-executor.yml`.
- A-01 identity: self-hosted / Windows / X64.
- Global execution generation: `a01-global-r2`, `queue: max`, `cancel-in-progress: false`.
- Registered qualification IDs only; arbitrary command input disabled.
- Result classes remain `PASS`, `SUBJECT_FAILURE`, `INFRA_FAILURE`, `CONTROL_PLANE_FAILURE`.
- Receipts bind product subject and control-plane generation.
- Canonical overnight scheduler: `.github/workflows/a01-overnight-night-shift.yml`.
- Registration/dispatch contract: `A01-REGISTRATION-DISPATCH-BARRIER-001`.

## Normal request flow

`BUILD -> deterministic prequalification -> canonical gateway -> trusted A-01 metadata-only admission -> ADMITTED -> exact-SHA A-01 subject execution -> receipt/evidence -> workstream adjudication`

The admission job may use A-01, but it checks out only trusted canonical control-plane bytes. It validates the requested subject by GitHub commit/tree metadata. It must not checkout or execute subject bytes before `ADMITTED`.

This mode removes the GitHub-hosted-runner dependency for non-disruptive qualifications while preserving registration and exact-subject isolation.

## Mandatory retry behavior

GitHub Actions failed-job and specific-job reruns may retain the reusable-workflow SHA from the original attempt. Therefore:

- never use a job-level or failed-job rerun to pick up a newer A-01 registry/policy/gateway;
- after any control-plane authority change, start a fresh caller run or `workflow_dispatch`;
- historical failed attempts remain evidence only;
- same-SHA retries remain allowed only when the control-plane generation is intentionally unchanged and repair policy permits them.

## Runner availability

The A-01 machine does not require an operator physically present for a correctly admitted request. An online idle matching runner receives the trusted admission job and, after successful admission, the separate executor job. If no matching runner is online, the job remains queued until one is available or the platform queue limit is reached. Waiting is not product failure.

## Subject isolation

Before `ADMITTED`:

- control-plane checkout is allowed;
- authenticated GitHub metadata lookup for the exact subject commit/tree is allowed;
- qualification-subject checkout is forbidden;
- qualification-subject execution is forbidden;
- arbitrary workflow/command injection is forbidden.

After `ADMITTED`, the executor independently checks out and verifies the exact subject SHA and exact admitted control-plane SHA before qualification.

## Disruptive boundary

Policy v8 trusted metadata admission is non-disruptive only. Any registered qualification with a post action such as `windows_reboot` fails closed before subject acquisition with `DISRUPTIVE_QUALIFICATION_REQUIRES_HOSTED_BARRIER`. The historical reboot/settle mechanism is not silently transferred to the v8 fallback.

## Overnight extension

The 00:00-07:00 America/New_York window remains centrally owned. Independent workstream A-01 cron schedules remain prohibited. Non-disruptive overnight tickets call the same canonical gateway and inherit the same metadata-only registration/identity barrier.

## Repair extension

The closed-loop repair ledger remains authoritative for repair lineage and attempt budgets. Repair reruns enter the same gateway/broker/executor path. A registry or control-plane change requires a new repair workflow dispatch; rerunning an old failed job cannot refresh authority.

## Change-control rule

A new A-01 infrastructure objective is justified only by demonstrated `CONTROL_PLANE_FAILURE`, `INFRA_FAILURE` outside a product lane, a GitHub/Windows/security/platform change that invalidates the baseline, or a shared qualification need that cannot be represented safely by the registry model. Repeated GitHub-hosted jobs ending with `runner_id:0` and no executed steps while A-01 remained operational justified policy v8.

## Security stance

Use immutable full-SHA pins for third-party actions. Admission and execution remain separate jobs. Trusted admission may inspect only canonical control-plane bytes and repository metadata; unadmitted subject bytes are never checked out or executed. Provenance/attestations supplement receipts but never replace exact-subject qualification.

## Cross-chat authority

Every chat must read repository bootstrap and this A-01 operating contract before scheduling or adjudicating A-01. Repository receipts and exact identities are authority; conversation memory is not.
