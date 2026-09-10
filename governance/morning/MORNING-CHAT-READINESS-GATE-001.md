# MORNING-CHAT-READINESS-GATE-001

Status: PROPOSED_FOR_ADMISSION
Target cadence: after the 07:15 morning canonical reconciliation, nominally 07:30 America/New_York
Purpose: independently verify that the new-day chat bootstrap is current, coherent and executable before the user starts new chats.

## Required checks

1. Re-fetch current `main` and `governance/CURRENT-AUTHORITY.json`.
2. Read `governance/morning/LATEST-BOOTSTRAP-POINTER.json` and require a manifest for the current New York date.
3. Read the selected manifest and require packets for MASTER_ROOT, LEARNING, BOOK and PROSE.
4. Fetch every relevant live owner control ref/head again.
5. Compare live heads/current state to each packet.
6. Reconcile machine-resolvable `AUTHORITY_DELTA` rather than declaring the packet stale and stopping.
7. Verify completion/obligation/repair/delegation state is consistent with the packet's selected objective and next-step contract.
8. Verify no packet hides `EVIDENCE_MISMATCH`, stale delegation, unresolved repair-owner mismatch, or invalid authority transfer.
9. Verify every packet is `CHAT_READY` or `CHAT_READY_WITH_DECISION`; `NOT_READY` must identify one exact blocker and safe fallback if available.
10. Confirm the repository-wide System State Reconciler is not red for an unadjudicated current defect.

## Repair behavior

If the readiness gate finds machine-resolvable drift, repair/reconcile it and refresh the daily manifest/pointer before reporting failure.

If a real human/author/private/native/external decision remains, do not broaden it into project confusion. Preserve the packet as `CHAT_READY_WITH_DECISION` when independent safe work remains, or `NOT_READY` only when the exact decision truly blocks current execution.

## Notification behavior

When all four chat roles are ready, no user intervention is required. The normal new-chat commands should work immediately.

When any role is not ready, surface only:
- affected chat role;
- exact classified blocker;
- what was already reconciled automatically;
- the smallest user decision/action required;
- independent work still safe to execute.

Do not ask the user to explain project history, architecture, repository identity or what Second Shift did.
