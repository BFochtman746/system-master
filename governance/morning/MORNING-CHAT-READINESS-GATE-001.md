# MORNING-CHAT-READINESS-GATE-001

Status: PROPOSED_FOR_ADMISSION
Target cadence: after the 07:15 morning canonical reconciliation, nominally 07:30 America/New_York
Purpose: independently verify that the new-day chat bootstrap is current, coherent and executable before the user starts new chats.

## Required checks

1. Re-fetch current `main` and `governance/CURRENT-AUTHORITY.json`.
2. Read the current morning pointer/manifest and require a manifest for the current New York date.
3. Require packets for MASTER_ROOT, LEARNING, BOOK and DOCUMENTS.
4. Read the topology/current owner allocation and enumerate active Second Shift lanes from `SECOND-SHIFT-REGISTRY-001.json::owner_files`.
5. Resolve current controls for CORE, LEARNING, BOOK and DOCUMENTS.
6. Compare live controls/state to each packet and reconcile machine-resolvable AUTHORITY_DELTA.
7. Verify completion/current obligations/repair/delegation state against each selected objective.
8. Verify every active READY/ACTIVE owner has the correct active Second Shift route. Documents must route to DOCUMENTS; PROSE and SYSTEM_MASTER root must not appear in active owner_files.
9. Verify no current obligation, packet, repair transaction or scheduled work routes to retired `SYSTEM_MASTER/BOOK/PROSE`.
10. Verify no packet hides EVIDENCE_MISMATCH, stale delegation, retired-owner stale work, repair-owner mismatch or authority transfer.
11. Verify every packet is CHAT_READY or CHAT_READY_WITH_DECISION; NOT_READY identifies one exact blocker and safe fallback when available.
12. Confirm the repository-wide System State Reconciler, topology validator and Second Shift owner-coverage gate are not red for an unadjudicated current defect.

## Active roles and lanes

User-facing current chat roles: MASTER_ROOT, LEARNING, BOOK, DOCUMENTS.

Active Second Shift lanes: CORE, LEARNING, BOOK, DOCUMENTS, discovered from the registry rather than hard-coded.

PROSE is completed and retired. A historical Prose chat request redirects to DOCUMENTS and may inspect Prose provenance, but it cannot create a current Prose packet or execution lane. The temporary SYSTEM_MASTER root worker lane is also retired; MASTER_ROOT remains the controller/orchestrator.

## Repair behavior

If the readiness gate finds machine-resolvable drift, repair/reconcile it and refresh the daily manifest/pointer before reporting failure.

If current data attempts to resurrect Prose, classify `RETIRED_OWNER_STALE_WORK`; preserve historical evidence and route genuinely required capability integration to DOCUMENTS. Never transfer historical Prose PASS to changed Documents integration bytes.

If Documents objective/state changes, reconcile `governance/second-shift/DOCUMENTS-DELEGATIONS.json` in the same repair transaction.

If a real human/author/private/native/external decision remains, preserve CHAT_READY_WITH_DECISION when independent safe work remains; do not broaden it into project confusion.

## Notification behavior

When all four current chat roles and all active execution lanes are coherent, no user intervention is required. When any role is not ready, surface only the affected role, exact blocker, what was repaired automatically, the smallest required action/decision and independent work still safe to execute.
