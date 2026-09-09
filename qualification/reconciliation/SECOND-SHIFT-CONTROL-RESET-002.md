# SECOND-SHIFT-CONTROL-RESET-002

Status: **CLOSED — RESTARTABLE SECOND-SHIFT CONTROL ACTIVE**

Effective date: 2026-09-09
Predecessor: `qualification/reconciliation/SYSTEM-MASTER-GLOBAL-RECONCILIATION-RESET-001.md`

## Resolution

The active recurring ChatGPT second-shift control surfaces identified as stale in RESET-001 have been rewritten in place without changing their schedules.

Updated active workers:

- `Book Evaluation Second Shift` — repository-first, immutable run watermark, bounded phases, durable checkpoint, final delta check, no independent A-01 authority.
- `Learning Second Shift` — repository-first; historical failed subjects are not embedded or rescheduled; human evidence remains human-only; bounded checkpoints and delta check required.
- `Prose Project Second Shift` — repository-first; latest consolidated workstream state governs; author/human/external-authority boundaries remain fail-closed; bounded checkpoints required.
- `Assurance Second Shift` — repository-first; latest RECON authority governs; evidence/source-custody classes remain explicit; bounded checkpoints required.
- `Second Shift Portfolio Controller` — starts from RESET-001 and current repository authority, captures a portfolio watermark, prepares only dependency-valid work, persists a compact portfolio/checkpoint and reconciles only post-watermark deltas.
- `Morning Second Shift Handoff` — starts from RESET-001 and current authoritative heads/receipts/evidence, verifies overnight claims independently and reports only evidence-backed deltas.

The dedicated `System Master Night Shift` remains retired/disabled. System Master work is governed through `system-master/control-v2` and the central portfolio controller rather than a duplicate independent night authority.

## Operating rule

A scheduled second-shift chat/task is a disposable worker, not authority. Each run must:

1. read current durable repository authority first;
2. freeze exact main/workstream heads as its run watermark;
3. work in bounded independently resumable phases;
4. write or commit compact checkpoints after completed phases;
5. preserve raw logs/test outputs in evidence/artifact stores rather than conversation memory;
6. delta-check authoritative heads at completion;
7. never transfer qualification authority between SHAs;
8. never fabricate human, author, private-data, external-authority or native-platform evidence.

A dropped, exhausted or replaced chat resumes from the latest durable checkpoint and the first incomplete phase. It does not reconstruct already completed work from the predecessor conversation.

## Remaining central control gap

`A01-CLOSED-LOOP-REPAIR-001` remains open.

Required loop:

`authoritative A-01 receipt -> failure classifier -> bounded repair worker -> fresh exact SHA -> hosted/local prequalification -> replacement A-01 ticket -> authoritative rerun`

The loop must distinguish subject/software failures, qualification-wrapper defects, infrastructure/transient failures, control-plane/admission failures, predecessor skips, human/author/private/native/external-authority blockers and unknown failures. A repair worker may produce a new candidate SHA but may not grant its own A-01 authority.

## Next objective

**`A01-CLOSED-LOOP-REPAIR-001 — FAILURE CLASSIFICATION -> BOUNDED REPAIR -> NEW-SHA PREQUALIFICATION -> CENTRAL A-01 REQUEUE`**

First action: add the failure-broker/repair-ledger contract behind current A-01 receipts, including attempt budget, original receipt linkage, repairability/authority classification, replacement SHA, prequalification evidence and exact replacement-ticket lineage.

This control reset creates no product, production, human, author, private-data or native-platform authority.