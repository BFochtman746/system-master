# A01-MIGRATION-001 Closure

Status: CLOSED — CONTROL-PLANE MIGRATION PROVEN
Date: 2026-09-08

## Objective
Convert the active A-01 qualification paths to the canonical shared A-01 control plane in order: Continuity -> Book Evaluation -> Learning -> Literary Prose, while preserving exact subject identity, evidence, failure semantics, and workstream return tickets.

## Canonical control-plane standing
- Shared reusable gateway: `.github/workflows/a01-control-plane-gateway.yml@main`
- Policy: version 3
- Global admission generation: `a01-global-r2`
- Registered disruptive reboot behavior: schedule reboot only after receipt/evidence preservation and hold admission through the reboot settle window.

## 1. Continuity — CLOSED PASS
- Legacy VERIFY run: `34290314506`
- Legacy VERIFY subject: `7c30d501aacef9ec8558a50ad9a9bdc961c32296`
- Migrated ARM run: `34291041277`
- Migrated ARM subject: `e0b00c69c7fd5954e04a8736b225eeaa6c1ef95f`
- Migrated ARM evidence artifact: `CONTINUITY-TARGET-WINDOWS-REBOOT-34291041277-evidence`
- Migrated VERIFY run: `34291128646`
- Migrated VERIFY subject: `f57fe85a653c0700f3005f02f3a67c948a945c69`
- Result: PASS. Genuine reboot durability boundary preserved. Receipt/evidence are preserved before disruptive handoff.

## 2. Book Evaluation — CLOSED EQUIVALENT SUBJECT FAILURE
- Legacy run: `34289986330`
- Legacy subject: `2dbdeed59692891a6d2931cdeda83c2611044ba5`
- Migrated run: `34292412264`
- Migrated subject/check-out SHA: `815dce7883986d5a62c6d7c63f63b9d82acea2fe`
- Result class: `SUBJECT_FAILURE`
- Missing required roles reproduced: `BASE_TRAINING`, `DEVELOPMENT_GOLD`
- Recovered roles reproduced: `PROVIDER`, `REPAIRED_OUTPUT`
- Exact hash binding: false
- Evidence artifact: `BOOK-EVAL-REPAIR-005-GATE-D-PRIVATE-GOLD-RECOVERY-34292412264-evidence`
- Migration standing: PASS/EQUIVALENT. Functional Gate D remains blocked on missing frozen private authority; migration must not convert that legitimate blocker into success.
- No Teacher verification, student training, selective 120B, visible-regression, or hidden-holdout qualification was run by this recovery boundary.

## 3. Learning — CLOSED PASS
- Migrated run: `34292254602`
- Exact qualified subject/check-out SHA: `84a4d72dccd05230e6fc85b3d0ff0a1fa4ec2535`
- Result class: PASS
- Focused tests: 26
- Predecessor regressions: 57
- Total tests: 83
- Raw response persistence: NONE
- Human evidence manufactured: FALSE
- Promotion authorized: true
- Evidence artifact: `LEARNING-PILOT-001-RUN-001-HUMAN-SESSION-34292254602-evidence`

## 4. Literary Prose — CLOSED CONTROL-PLANE EQUIVALENCE; FULL WINDOWED HARVEST STILL SEPARATE
- Canonical scheduled workflow: `.github/workflows/literary-research-overnight-a01.yml`
- Exact bound Literary subject: `55fa713be0e9b704399bd75920d0186b406f8117`
- Controlled migration probe run: `34292649573`
- Probe result class: `SUBJECT_FAILURE`
- Expected refusal: `A01_LITERARY_0100_0130_WINDOW_NOT_ACTIVE`
- Subject SHA equals checkout SHA.
- Evidence artifact: `LITERARY-RESEARCH-OVERNIGHT-DEEP-HARVEST-34292649573-evidence`
- Migration standing: PASS/EQUIVALENT. The canonical gateway executed the exact Literary subject on A-01 and preserved the subject's authorized time-window fail-closed behavior without starting research acquisition.
- The full harvest remains governed by its independent 01:00-01:30 America/New_York execution window and must earn its own PASS; migration equivalence does not manufacture or imply that future functional result.

## Closure rule
A01-MIGRATION-001 is closed because all four workstreams now route through the canonical A-01 control plane and have A-01 evidence demonstrating exact-subject execution plus preserved success/failure semantics. Any remaining Book private-authority blocker or Literary full-window qualification is a workstream qualification concern, not an A-01 migration defect.
