# A01-OPERATING-MODE-001

Status: ACTIVE - NORMAL QUALIFICATION MODE WITH REGISTRATION/DISPATCH BARRIER
Date updated: 2026-09-09

## Purpose

`A01-CONTROL-PLANE-001` is normal shared qualification infrastructure for System Master. Product work should use it, not rebuild it. The registration/dispatch barrier makes normal, repair, overnight, and Second Shift qualification use one deterministic admission path.

## Current baseline

- Policy: `qualification/a01/a01-policy.json`, policy version **7**.
- Registry: `qualification/a01/registry.json`, versioned independently.
- Public compatibility front door: `.github/workflows/a01-control-plane-gateway.yml`.
- Hosted admission broker: `.github/workflows/a01-control-plane-admission-broker.yml`.
- Private A-01 executor: `.github/workflows/a01-control-plane-executor.yml`.
- Global A-01 admission generation: `a01-global-r2`, `queue: max`, `cancel-in-progress: false`.
- Exact subject SHA and exact control-plane SHA checkouts.
- Registered qualification IDs only; arbitrary command input disabled.
- Result classes remain `PASS`, `SUBJECT_FAILURE`, `INFRA_FAILURE`, `CONTROL_PLANE_FAILURE`.
- Current receipts bind both product subject and control-plane generation.
- Canonical overnight scheduler: `.github/workflows/a01-overnight-night-shift.yml`.
- Repair contract: `A01-REGISTRATION-DISPATCH-BARRIER-001`.

## Normal request flow

`BUILD -> deterministic prequalification -> canonical gateway -> hosted registration/identity admission -> ADMITTED -> A-01 queue -> exact-SHA execution -> receipt/evidence -> workstream adjudication`

If hosted admission returns `WAITING_FOR_REGISTRATION` or another blocked state, A-01 is not consumed. Land or repair the canonical registration/control-plane boundary, then create a **fresh workflow run**.

## Mandatory retry behavior

GitHub Actions failed-job and specific-job reruns may retain the reusable-workflow SHA from the original attempt. Therefore:

- never use a job-level or failed-job rerun to pick up a newer A-01 registry/policy/gateway;
- after any control-plane authority change, start a fresh caller run or `workflow_dispatch`;
- historical failed attempts remain evidence only;
- same-SHA retries remain allowed only when the control-plane generation is intentionally unchanged and repair policy permits them.

## Runner availability

The A-01 machine does not require an operator physically present for a correctly admitted request. An online idle matching runner receives the job; if no matching runner is online, the job remains queued until one is available or the platform queue limit is reached. Waiting is not product failure.

## Overnight extension

The 00:00-07:00 America/New_York window remains centrally owned. Independent workstream A-01 cron schedules remain prohibited. The night planner calls the same-commit canonical gateway, so all overnight tickets inherit the registration/identity barrier.

## Repair extension

The closed-loop repair ledger remains authoritative for repair lineage and attempt budgets. Repair reruns enter the same gateway/broker/executor path. A registry or control-plane change requires a new repair workflow dispatch; rerunning an old failed job cannot refresh authority.

## Change-control rule

A new A-01 infrastructure objective is justified only by a demonstrated `CONTROL_PLANE_FAILURE`, an `INFRA_FAILURE` outside a product lane, a GitHub/Windows/security/platform change that invalidates the baseline, or a shared qualification need that cannot be represented safely by the registry model. The reproduced stale-reusable-workflow/late-registration failure satisfies this rule.

Ordinary `SUBJECT_FAILURE`, missing product fixtures/private data/human authority, a valid overnight-window refusal, another workstream legitimately occupying A-01, or an admitted job waiting on an offline runner are not control-plane defects.

## Security stance

Use immutable full-SHA pins for third-party actions in shared workflows. Keep the Windows executor private behind hosted admission. Do not grant arbitrary shell or workflow references to callers. Artifact attestations are optional future evidence hardening, not a replacement for the A-01 receipt.

## Cross-chat authority

Every chat must read the repository bootstrap and A-01 operating contract before scheduling or adjudicating A-01. Repository receipts and exact identities are authority; conversation memory is not.
