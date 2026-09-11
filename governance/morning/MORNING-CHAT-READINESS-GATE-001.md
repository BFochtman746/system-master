# MORNING-CHAT-READINESS-GATE-001

Status: ACTIVE / TOPOLOGY-004 / PROGRAM-JOB-LOCKED
Target cadence: after morning canonical reconciliation
Purpose: independently verify that new-day chat bootstrap is current, coherent and executable before the user starts new chats.

## Required checks

1. Re-fetch current `main` and `governance/CURRENT-AUTHORITY.json`.
2. Read `program_job_lock` and `system_completion_status` selected by CURRENT-AUTHORITY.
3. Require the completion truth: PROSE is the only complete system; SYSTEM_MASTER, CORE, LEARNING, BOOK and DOCUMENTS remain incomplete unless a newer explicit completion record exists.
4. Read the current morning pointer/manifest and require a manifest for the current New York date when morning reconciliation has run.
5. Require owner packets for MASTER_ROOT, LEARNING, BOOK and DOCUMENTS; a Prose focus is represented through BOOK rather than a separate peer packet.
6. Resolve current controls for CORE, LEARNING, BOOK and DOCUMENTS; when Book-Prose integration is active also resolve `literary-prose-engine-001`.
7. Compare live controls/state to each packet and reconcile machine-resolvable AUTHORITY_DELTA.
8. Verify every selected objective belongs to that system's locked job.
9. Verify BOOK's current job includes finishing integration of the completed PROSE child through adapters and the Book Workflow Orchestrator, with Book retaining canonical manuscript/Story Bible/author/lifecycle/admission authority.
10. Verify DOCUMENTS current work is document/artifact implementation and System-Master integration only; any Prose-absorption or Book-literary ownership selector is stale and must be repaired before CHAT_READY.
11. Verify LEARNING current work stays inside Learning product/runtime/curriculum/mastery/assessment/evidence and System-Master integration.
12. Verify CORE/System Master work stays within shared Foundation/Spine/integration infrastructure and does not take peer product semantics.
13. Verify Programming/Knowledge Recovery is supporting CORE work rather than a peer system or product-wide priority override.
14. Verify active Second Shift lanes are CORE, LEARNING, BOOK and DOCUMENTS; `SYSTEM_MASTER/BOOK/PROSE` routes through BOOK and there is no separate PROSE/root worker lane.
15. Verify no packet hides EVIDENCE_MISMATCH, false system completion, cross-lane job drift, stale delegation, owner-route mismatch, repair-owner mismatch or authority transfer.
16. Confirm System State Reconciler, topology validator, current-obligation enforcement and Second Shift enforcement are not red for an unadjudicated semantic defect.

## Active roles and jobs

MASTER_ROOT: integrate CORE, LEARNING, BOOK and DOCUMENTS into System Master without taking their product semantics.

LEARNING: finish Learning and integrate upward into System Master.

BOOK: finish Book, including completed Prose child adapters/orchestrator integration, then integrate upward into System Master.

PROSE: complete; active Book child specialist for integration/operation only, no canonical manuscript write and no separate peer/Second Shift lane.

DOCUMENTS: finish Documents and integrate upward into System Master; no Prose absorption.

## Repair behavior

If machine-resolvable drift is found, repair/reconcile it and refresh the daily manifest/pointer before declaring readiness.

A false completion claim for any non-Prose system is a readiness defect. A cross-lane selector is a readiness defect. A Documents->Prose absorption instruction is stale. A standalone Prose mutation lane is stale. Preserve historical evidence, but do not execute stale current instructions.

If Book/Prose objective changes, reconcile `BOOK-DELEGATIONS.json`. If Documents changes, reconcile `DOCUMENTS-DELEGATIONS.json`. Learning and Core follow their own owner files.

## Notification behavior

When all owner roles, completion truth, locked jobs and active execution lanes are coherent, no user intervention is required. If a role is not ready, surface only the affected role, exact blocker, what was repaired automatically, the smallest required action/decision and independent work still safe to execute.
