# LEARNING LAB PILOT-001 RUN-001 — FINAL HUMAN EXECUTION A-01 CLOSURE

Status: **CLOSED — AUTHORITATIVE A-01 PASS / PROMOTED EXACT SHA**  
Closure date: 2026-09-09  
Workstream: `LEARNING`  
Qualification: `LEARNING-PILOT-001-RUN-001-FINAL-HUMAN-EXECUTION`

## 1. Qualification subject and promotion authority

The authoritative promotion subject is exactly:

`f49ac9eaf6e0f11894bf47f5d773090b4ef60ebf`

Canonical promoted branch:

`learning/pilot-001-run-001-final-human-execution-ready`

The promoted branch is pinned to the tested subject above. This closure document is documentation-only. The commit that first introduces this closure has the exact tested subject as its parent and is **not** itself a qualification subject. Qualification authority does not transfer to this documentation commit or to any later commit.

## 2. Authoritative A-01 receipt

A-01 workflow run: `34373368907`  
A-01 job: `102539884513`  
Control-plane snapshot: `685d5a95c38a50d668a54e86aee41b68ab787de3`  
Policy version: `6`  
Registry version: `14`

Receipt adjudication:

- `qualification_id = LEARNING-PILOT-001-RUN-001-FINAL-HUMAN-EXECUTION`
- `workstream_id = LEARNING`
- `gate_class = promotion`
- `subject_sha = f49ac9eaf6e0f11894bf47f5d773090b4ef60ebf`
- `checkout_sha = f49ac9eaf6e0f11894bf47f5d773090b4ef60ebf`
- `subject_sha == checkout_sha = TRUE`
- `result_class = PASS`
- `child_exit_code = 0`
- `promotion_authorized = true`
- runner name: `A-01`
- runner OS: `Windows`
- runner architecture: `X64`
- required labels: `self-hosted`, `Windows`, `X64`
- execution time: `1126033 ms`

The A-01 runner guard passed both preflight and postflight. The exact subject checkout and canonical control-plane policy/registry validation passed before qualification execution.

## 3. Authoritative evidence artifact

Artifact ID: `10113621506`  
Artifact name: `LEARNING-PILOT-001-RUN-001-FINAL-HUMAN-EXECUTION-34373368907-evidence`  
ZIP SHA-256: `30fb18db5dae75eb835e59b2cb10785448e6f0cd97048d466182e0ae10df1866`  
Recorded size: `122449` bytes  
Recorded file count during upload: `188`

The artifact is the preserved A-01 evidence package for this exact receipt. Historical failure artifacts remain historical evidence and are not replaced by this PASS artifact.

## 4. Exact tested evidence counts

Repair-004 preserves the full Learning Lab base coverage while eliminating a redundant second execution of already completed focused modules.

Focused base suites:

- closed-loop current: `54/54`
- predecessor regressions: `57/57`
- local-first evidence boundary: `13/13`
- focused base subtotal: `124`

Remaining unique base modules:

- remaining base tests: `574/574`

Base regression union:

- `124 + 574 = 698/698`
- coverage reduced: `FALSE`
- duplicate base reruns eliminated: `124`

Critical repeat campaign:

- seeds: `1, 7, 42, 99`
- `54` critical tests per seed
- repeated critical tests: `216/216`

Final qualifier output included:

- `PILOT_RUN001_FINAL_HUMAN_EXECUTION_STATUS=PASS`
- `PILOT_RUN001_FULL_LEARNING_LAB_TESTS=698`
- `PILOT_RUN001_CRITICAL_REPEAT_TESTS=216`
- `PILOT_RUN001_REAL_PARTICIPANT_EVIDENCE=NOT_CREATED`

## 5. Frozen PILOT-001-v1 authority

Repair work did not change the frozen PILOT-001-v1 authority:

- `learning/lab/LEARNING_LAB_PILOT_001_PROTOCOL.md` blob `0db3de824060f4eb7ce3c2c7ffa0ed4b57ba9d35`
- `learning/lab/learning_lab/real_learner_pilot.py` blob `0c9f7a8b7850cef15643e3c11899585d2c25a08d`
- `learning/lab/tests/test_real_learner_pilot.py` blob `e77d423078af4662f2c72b0cc1f8501e20d29851`
- `learning/lab/qualification_pilot001.py` blob `44aa0124f194f074a421f0a87a0695d96d7bae11`

Frozen protocol sequence remains:

`CONSENT -> BASELINE -> ADAPTIVE ROUTE -> INSTRUCTION/REMEDIATION OR SKIP -> INDEPENDENT VERIFICATION -> DELAYED RETENTION -> NOVEL TRANSFER -> OUTCOME`

Retention remains no earlier than `3600` seconds after the qualifying prior stage, with fresh-family and independence requirements preserved.

## 6. Human, privacy, and truth boundary

This A-01 PASS proves the qualified **machine/software boundary** only.

It does **not** prove that a real participant has consented, participated, completed the pilot, or produced effectiveness evidence.

The qualification suite contains synthetic fixtures that intentionally exercise consent, withdrawal, completion, and participant-state transitions. Console text emitted by those synthetic tests — including messages such as `Consent recorded` and synthetic pilot or participant identifiers — is test-fixture output. It is not real-human consent or real-participant evidence.

Authoritative truth boundary after qualification:

- real participant evidence created: `FALSE`
- human consent inferred: `FALSE`
- A-01 may supply participant consent: `FALSE`
- A-01 may supply participant responses: `FALSE`
- ChatGPT/operator may fabricate participant evidence: `FALSE`
- raw participant free-text retention authorized: `FALSE`
- automatic external upload authorized: `FALSE`
- one future participant proves population effectiveness: `FALSE`
- certification, psychometric validity, population validity, job readiness, or accreditation proved by this PASS: `FALSE`

Participant evidence remains local-by-default and digest/minimized according to the frozen PILOT-001 controls. External export or integrity anchoring remains a separate controlled action.

## 7. Repair and failure custody

Historical qualification failures remain preserved and are not rewritten as PASS:

1. `effcc16b158f16ec5cbc82ea228df9be52d0b75b` — authoritative Windows failure at the working-tree-byte frozen-authority boundary; superseded.
2. `ec83f726b5e026024eaf3a98f83083859ee87259` — repaired Git-object frozen-authority verification; authoritative A-01 run `34364154198` ended `SUBJECT_FAILURE` / exit `124` due qualifier runtime budget; superseded.
3. `2568265e2b2e179fc9457eed93ec31fee98eb6cc` — bounded parallel scheduling repair; hosted proof exposed aggregate-evidence/parser defect; superseded before A-01 promotion.
4. `66f25c8fd2eba3c31ed8dd06b6e0f8e90dc43893` — aggregate evidence repaired; authoritative A-01 run `34369088160` ended `SUBJECT_FAILURE` / exit `124` due redundant full-suite runtime; superseded.
5. `f49ac9eaf6e0f11894bf47f5d773090b4ef60ebf` — Repair-004; preserves `698/698` unique base coverage plus `216/216` critical repeats; authoritative A-01 PASS and promotion authorized.

Qualification authority belongs only to the exact SHA named by each receipt. Historical failure evidence must remain retained for auditability.

## 8. Night Shift disposition

The machine-side final-human-execution Night Shift is complete.

- old execution-prep ticket: `SUPERSEDED`
- old closed-loop ticket: `SUPERSEDED`
- original final-human `effcc...` ticket: `SUPERSEDED`
- Repair-001 runtime failure: historical / resolved by successor repairs
- Repair-002 hosted parser defect: historical / resolved by successor repairs
- Repair-003 A-01 runtime failure: historical / resolved by Repair-004
- Repair-004 hosted qualification: `COMPLETED`
- Repair-004 authoritative A-01 qualification: `COMPLETED`
- exact-SHA promotion: `COMPLETED`

No additional Learning A-01 qualification is justified merely to keep A-01 occupied.

## 9. Immediate successor and stop condition

Machine preparation for the first real PILOT-001 participant is closed at the promotion boundary.

Immediate successor:

`LEARNING-PILOT-001-RUN-001-REAL-HUMAN-EXECUTION`

Current standing: **BLOCKED — HUMAN** until an actual participant is present and personally provides explicit PILOT-001-v1 consent.

The first participant session must not be auto-started by this closure, A-01, ChatGPT, a scheduler, a fixture, or an operator acting in place of the participant.

On genuine participant execution, preserve truthful PASS, non-PASS, incomplete, contamination, retention-wait, and withdrawal outcomes. Do not rewrite an unfavorable human result into success.

A single genuine completed participant record may establish participant-level evidence only. It does not establish population effectiveness. Population/effectiveness claims require the separately governed downstream evidence and study gates.
