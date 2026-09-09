# A01-OPERATING-MODE-001

Status: ACTIVE — NORMAL QUALIFICATION MODE
Date activated: 2026-09-08

## Purpose

A01-CONTROL-PLANE-001 is no longer an infrastructure build or migration project. It is the normal authoritative A-01 qualification path for System Master workstreams.

The proven execution baseline is frozen unless evidence demonstrates a real control-plane defect or an unavoidable platform/security requirement.

A01-OVERNIGHT-001 is an approved additive capability under change-control rule 4: it adds centrally governed long-run scheduling while retaining the same registered-wrapper, exact-SHA, receipt, evidence, failure-classification, and global-serialization authority.

## Frozen baseline

- Reusable gateway: `.github/workflows/a01-control-plane-gateway.yml@main`
- Policy: `qualification/a01/a01-policy.json`, policy version 4
- Global admission generation: `a01-global-r2`
- Registry-owned qualification IDs only
- Exact subject SHA checkout and receipt binding
- Result classes: `PASS`, `SUBJECT_FAILURE`, `INFRA_FAILURE`, `CONTROL_PLANE_FAILURE`
- Evidence upload and return ticket on every authoritative run
- Registered disruptive reboot handoff with hosted settle window
- Canonical overnight scheduler: `.github/workflows/a01-overnight-night-shift.yml`

Normal product work MUST NOT modify the gateway, concurrency generation, receipt authority, or admission semantics merely because a workstream test fails or waits in queue.

## Change-control rule

A new A-01 infrastructure objective is justified only by one of the following:

1. A receipt, workflow log, or reproduced test demonstrates `CONTROL_PLANE_FAILURE`.
2. A reproducible runner/platform fault demonstrates `INFRA_FAILURE` that cannot be repaired inside the affected workstream boundary.
3. GitHub Actions, Windows runner, security, or repository-platform behavior changes in a way that invalidates the frozen contract.
4. A genuinely new qualification capability cannot be represented safely by the existing registered-wrapper + thin-caller model.

The following are NOT control-plane defects:

- `SUBJECT_FAILURE`
- a workstream-specific missing fixture, corpus, private authority, model artifact, or test dependency
- a time-window guard refusing execution outside its authorized window
- a product test or regression failure
- ordinary queue delay or another workstream legitimately occupying A-01
- a request to change what a workstream qualifier tests

## Normal request flow

`BUILD -> deterministic prequalification -> registered A-01 request -> exact-SHA execution -> receipt/evidence -> workstream adjudication -> repair or continue`

Use focused gates at substantial integration boundaries, consolidated gates for accumulated slices, and promotion gates only for exact promotion subjects.

## Overnight extension

The normal 30-minute gateway envelope remains the default for ordinary work. A01-OVERNIGHT-001 may grant a larger bounded qualifier budget only through a central overnight ticket and only when the qualification explicitly opts into overnight execution in the registry.

The 00:00–07:00 America/New_York window is centrally owned. Independent workstream A-01 cron schedules are prohibited. The scheduler uses reservation-aware backfill rather than fixed chat time blocks, does not start work that cannot fit inside its declared window, and excludes disruptive reboot actions from overnight v1.

The detailed contract is `qualification/a01/overnight/A01-OVERNIGHT-001.md`.

## Workstream return standing after A01-MIGRATION-001

### Continuity

A-01 migration is closed PASS. Return to Continuity & Recovery product work. Use A-01 only at substantial integration or promotion boundaries; do not reopen A-01 infrastructure because a Continuity subject fails.

### Book Evaluation

A-01 migration is closed equivalent. Functional Gate D remains a workstream-owned `SUBJECT_FAILURE` because exact frozen `BASE_TRAINING` and `DEVELOPMENT_GOLD` authority is missing. Recovery must remain fail-closed. Do not run Teacher verification, student training, selective 120B, visible-regression, or hidden-holdout qualification until the exact frozen private authority requirement is satisfied.

### Learning

A-01 migration is closed PASS for exact qualified subject `84a4d72dccd05230e6fc85b3d0ff0a1fa4ec2535`. Return to Learning product/pilot work under its existing consent, privacy, and evidence rules. New product milestones earn their own qualification receipts; the prior PASS does not authorize changed SHAs.

### Literary Prose

A-01 migration is closed equivalent. Continue dependency-valid Literary Prose product work. Its independent overnight cron is retired under A01-OVERNIGHT-001; future deep-harvest execution must enter the central night plan as a ticket with whatever valid source-owned time restrictions remain in force.

## Cross-chat authority

Every chat working in this repository must treat this file, `A01-OPERATING-CONTRACT.md`, `a01-policy.json`, `registry.json`, and when relevant `overnight/A01-OVERNIGHT-001.md` as shared authority. A chat may build independently, but it may not invent a new A-01 scheduling or promotion path.

When a workstream encounters a failure, adjudicate the receipt classification first. `SUBJECT_FAILURE` returns to the workstream. Only evidence of `INFRA_FAILURE` or `CONTROL_PLANE_FAILURE` may reopen A-01 infrastructure work.

## Closure condition

A01-OPERATING-MODE-001 remains active indefinitely as the normal mode. There is no successor infrastructure objective unless the change-control rule above is met by evidence.
