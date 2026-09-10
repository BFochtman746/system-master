# MORNING-CHAT-READINESS-GATE-001

Status: PROPOSED_FOR_ADMISSION
Target cadence: after the 07:15 morning canonical reconciliation, nominally 07:30 America/New_York
Purpose: independently verify that the new-day chat bootstrap is current, coherent and executable before the user starts new chats.

## Required checks

1. Re-fetch current `main` and `governance/CURRENT-AUTHORITY.json`.
2. Read `governance/morning/LATEST-BOOTSTRAP-POINTER.json` and require a manifest for the current New York date.
3. Read the selected manifest and require packets for MASTER_ROOT, LEARNING, BOOK and PROSE.
4. Read the current headless-tool owner allocation and the Second Shift registry, then enumerate every lane declared by `owner_files`.
5. Resolve every relevant current owner control binding again, including the SYSTEM_MASTER product-root binding and live child/system heads.
6. Compare current controls/state to each packet.
7. Reconcile machine-resolvable `AUTHORITY_DELTA` rather than declaring the packet stale and stopping.
8. Verify completion/obligation/repair/delegation state is consistent with each packet's selected objective and next-step contract, using the obligation registry selected by CURRENT-AUTHORITY.
9. Verify every READY/ACTIVE current obligation owner path has a registry-declared Second Shift route and every READY/ACTIVE SYSTEM_MASTER-owned `central_next_objective` is bound in the SYSTEM_MASTER root lane or has a valid all-eight-rungs exhaustion proof.
10. Verify no packet hides `EVIDENCE_MISMATCH`, stale delegation, unresolved repair-owner mismatch, missing owner coverage, or invalid authority transfer.
11. Verify every packet is `CHAT_READY` or `CHAT_READY_WITH_DECISION`; `NOT_READY` must identify one exact blocker and safe fallback if available.
12. Confirm the repository-wide System State Reconciler and Second Shift owner-coverage gate are not red for an unadjudicated current defect.

The four user-facing chat roles do not imply only four execution lanes. MASTER_ROOT consumes the SYSTEM_MASTER product-root lane, which covers current and future SYSTEM_MASTER-owned non-system headless capability portfolios such as Content & Document Artifacts. Do not require a separate Documents chat or Documents Second Shift lane.

## Repair behavior

If the readiness gate finds machine-resolvable drift, repair/reconcile it and refresh the daily manifest/pointer before reporting failure.

If a root-owned tool portfolio was created or its current objective changed, reconcile `governance/second-shift/SYSTEM-MASTER-DELEGATIONS.json` in the same repair transaction. Tool creation alone must not create a peer-system lane; only explicit first-class system admission changes Second Shift owner topology.

If a real human/author/private/native/external decision remains, do not broaden it into project confusion. Preserve the packet as `CHAT_READY_WITH_DECISION` when independent safe work remains, or `NOT_READY` only when the exact decision truly blocks current execution.

## Notification behavior

When all four chat roles are ready and all registry-declared execution lanes are coherent, no user intervention is required. The normal new-chat commands should work immediately.

When any role is not ready, surface only:
- affected chat role;
- exact classified blocker;
- what was already reconciled automatically;
- the smallest user decision/action required;
- independent work still safe to execute.

Do not ask the user to explain project history, architecture, repository identity or what Second Shift did.
