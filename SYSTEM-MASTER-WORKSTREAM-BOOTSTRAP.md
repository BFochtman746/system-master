# System Master Workstream Bootstrap

This file is the cross-chat entry point for work in `BFochtman746/system-master`.

## Required startup

Before a workstream schedules or adjudicates A-01 machine qualification, read:

1. `qualification/a01/A01-OPERATING-MODE-001.md`
2. `qualification/a01/A01-OPERATING-CONTRACT.md`
3. `qualification/a01/a01-policy.json`
4. `qualification/a01/registry.json`
5. `qualification/a01/overnight/A01-OVERNIGHT-001.md` when requesting unattended overnight capacity

These repository artifacts, not conversation memory, are authoritative for A-01 usage.

## Current standing

A01-MIGRATION-001 is closed. A01-CONTROL-PLANE-001 is the normal qualification path. A01-OVERNIGHT-001 is the canonical scheduling extension for unattended 00:00–07:00 America/New_York capacity.

Do not start another A-01 infrastructure objective merely because a workstream has a failing subject, missing workstream artifact, time-window refusal, product regression, or ordinary queue delay. Adjudicate the receipt first. `SUBJECT_FAILURE` belongs to the workstream. Reopen A-01 infrastructure only when evidence demonstrates `INFRA_FAILURE`, `CONTROL_PLANE_FAILURE`, a material platform/security change, or a genuinely new qualification capability that cannot safely use the existing registered gateway model.

## Workstream behavior

- Build and prequalify before requesting A-01.
- Use a registered qualification through `.github/workflows/a01-control-plane-gateway.yml` when available.
- Do not create an independent A-01 scheduling policy for a new workstream.
- Continue dependency-valid work while a qualification is queued or running.
- Never promote a different SHA under another SHA's evidence.
- Treat only a conforming control-plane receipt as A-01 authority.
- On failure, distinguish subject failure from infrastructure/control-plane failure before repair.
- When adding a new A-01 qualification, add a repository-owned constrained wrapper to `.github/scripts/`, register it in `qualification/a01/registry.json`, and make the workstream workflow a thin caller of the gateway.
- Do not modify the proven gateway, global admission generation, or receipt semantics as part of ordinary product work.

## Overnight behavior

- The central workflow `.github/workflows/a01-overnight-night-shift.yml` exclusively owns canonical overnight scheduling.
- Do not add or retain an independent workstream overnight `schedule:` trigger for A-01. Convert the desired work into an overnight ticket instead.
- Follow the active `qualification/a01/a01-policy.json` cap for READY overnight tickets. Policy v6 currently permits up to four READY tickets per workstream per night and supports bounded same-workstream dependency chains up to the policy limit; dependent tickets execute only after the named predecessor PASS and must follow it immediately.
- Re-evaluate the workstream before ticketing. Choose the highest-value A-01-executable work that benefits from unattended runtime: long tests, training/evaluation, benchmarks, corpus/API harvesting, deterministic analysis, or similar bounded work.
- Every READY second-shift ticket must carry a real completion delta and stop condition. Never create work merely to keep A-01 utilized.
- Overnight work is not limited to the normal 30-minute envelope. A registered overnight-eligible qualifier may request up to its registry cap and at most the active policy maximum, currently 300 minutes under policy v6.
- Work above 180 minutes must be checkpoint-capable with checkpoints no farther than 30 minutes apart.
- Do not spend overnight capacity on a known blocker that cannot change without new authority/input. Do dependency-valid executable work instead.
- A-01 is not an autonomous ChatGPT reasoning session. Open-ended reasoning must occur in chat or through a separately authorized API-agent design; overnight A-01 work must be executable and evidence-producing.
- Disruptive reboot qualifications are excluded from overnight scheduling.

## Return routing

Every request supplies a return ticket: workstream, origin ref, pass continuation, failure continuation, and notification target. Completion belongs to the workstream named by that ticket even if another chat observes the GitHub run first.

## Normal operating mode

The frozen normal-mode baseline and change-control rule are defined in `qualification/a01/A01-OPERATING-MODE-001.md`.

Historical migration evidence is preserved in `qualification/a01/A01-MIGRATION-001-CLOSURE.md`. Do not continue migration work after that closure unless new evidence invalidates it.
