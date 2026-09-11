# MORNING-CHAT-READINESS-GATE-001

Status: ACTIVE / TOPOLOGY-004 / PROGRAM-JOB-LOCKED
Target cadence: after morning canonical reconciliation
Purpose: independently verify that new-day chat bootstrap is current, coherent and executable before the user starts new chats.

## Required checks

1. Re-fetch current `main` and `governance/CURRENT-AUTHORITY.json`.
2. Read `program_job_lock` and `system_completion_status` selected by CURRENT-AUTHORITY.
3. Require the completion truth: PROSE is the only complete system; SYSTEM_MASTER, CORE, LEARNING, BOOK and DOCUMENTS remain incomplete unless a newer explicit completion record exists. PROGRAMMING is an incomplete active work program and is not yet an admitted Topology-004 peer system.
4. Read the current morning pointer/manifest and require a manifest for the current New York date when morning reconciliation has run.
5. Require owner packets for MASTER_ROOT, LEARNING, BOOK and DOCUMENTS plus a PROGRAMMING_WORK_PROGRAM packet when Programming work is requested or remains open; a Prose focus is represented through BOOK rather than a separate peer packet.
6. Resolve current controls for CORE, LEARNING, BOOK and DOCUMENTS; when Book-Prose integration is active also resolve `literary-prose-engine-001`. Programming has no peer control ref before admission; resolve its work-program lock and system packet instead.
7. Compare live controls/state to each packet and reconcile machine-resolvable AUTHORITY_DELTA.
8. Verify every selected objective belongs to that system or named work program's locked job.
9. Verify BOOK's current job includes finishing integration of the completed PROSE child through adapters and the Book Workflow Orchestrator, with Book retaining canonical manuscript/Story Bible/author/lifecycle/admission authority.
10. Verify DOCUMENTS current work is document/artifact implementation and System-Master integration only; any Prose-absorption, Book-literary or Programming-engineering ownership selector is stale and must be repaired before CHAT_READY.
11. Verify LEARNING current work stays inside Learning product/runtime/curriculum/mastery/assessment/evidence and System-Master integration and does not cross into Programming.
12. Verify CORE/System Master work stays within shared Foundation/Spine/integration infrastructure and does not take peer product semantics or Programming-specific engineering semantics.
13. Verify `PROGRAMMING-WORK-PROGRAM-CONTINUATION-001` is present and nonterminal when Programming remains open; load `programming_work_program_lock` and `programming_system_packet`; preserve prior Programming Foundation/capability/build/test/assurance/Genesis evidence; do not restart completed work.
14. Verify Programming remains a named non-peer work program until explicit topology admission. There must be no Programming peer owner control, repair inbox, peer Second Shift lane or claim domain created merely by startup/reconciliation.
15. Verify Programming Knowledge Recovery is only a supporting Core-administered source/custody/provenance subprogram. It must not be treated as the Programming product definition or replace the Programming engineering objective.
16. Verify active Second Shift peer lanes are CORE, LEARNING, BOOK and DOCUMENTS; `SYSTEM_MASTER/BOOK/PROSE` routes through BOOK; Programming has no peer Second Shift lane before admission; there is no separate PROSE/root worker lane.
17. Require `program-job-lock-enforcement` and `programming-work-program-enforcement` to have executed green results on the relevant current subject, or explicitly classify zero-step GitHub-hosted attempts as infrastructure-only. A zero-step run is neither semantic PASS nor semantic FAIL.
18. Verify no packet hides EVIDENCE_MISMATCH, false system completion, cross-lane job drift, Programming scope drift, stale delegation, owner-route mismatch, repair-owner mismatch or authority transfer.
19. Confirm System State Reconciler, topology validator, current-obligation enforcement and Second Shift enforcement are not red for an unadjudicated semantic defect. Infrastructure-only zero-step runner allocation is reported separately and does not fabricate a product failure.

## Active roles and jobs

MASTER_ROOT: integrate CORE, LEARNING, BOOK and DOCUMENTS into System Master without taking their product semantics; govern explicit named work-program admission/integration boundaries without absorbing their semantics.

LEARNING: finish Learning and integrate upward into System Master.

BOOK: finish Book, including completed Prose child adapters/orchestrator integration, then integrate upward into System Master.

PROSE: complete; active Book child specialist for integration/operation only, no canonical manuscript write and no separate peer/Second Shift lane.

DOCUMENTS: finish Documents and integrate upward into System Master; no Prose absorption and no Programming engineering ownership.

PROGRAMMING_WORK_PROGRAM: continue the existing Programming software-engineering program from preserved foundation/capability/build/test/assurance/Genesis evidence; recover only missing source/custody evidence; continue the first genuinely unclosed package; prepare explicit System Master integration/admission; do not silently promote to a peer system or cross another system's job.

PROGRAMMING_KNOWLEDGE_RECOVERY: supporting Core-administered source/custody/provenance subprogram only. It supports Programming but does not replace its engineering objective.

## Repair behavior

If machine-resolvable drift is found, repair/reconcile it and refresh the daily manifest/pointer before declaring readiness.

A false completion claim for any non-Prose system is a readiness defect. A cross-lane selector is a readiness defect. A Documents->Prose absorption instruction is stale. A standalone Prose mutation lane is stale. Programming product work routed as generic Core work is stale. A Programming peer lane created before explicit topology admission is stale. Preserve historical evidence, but do not execute stale current instructions.

If Book/Prose objective changes, reconcile `BOOK-DELEGATIONS.json`. If Documents changes, reconcile `DOCUMENTS-DELEGATIONS.json`. Learning and Core follow their own owner files. Programming work-program changes update its work-program lock/current obligation and startup packet; they do not create a peer delegation before admission.

## Notification behavior

When all owner roles, work-program roles, completion truth, locked jobs and active execution lanes are coherent, no user intervention is required. If a role is not ready, surface only the affected role, exact blocker, what was repaired automatically, the smallest required action/decision and independent work still safe to execute.
