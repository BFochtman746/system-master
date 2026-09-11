# MORNING-CHAT-READINESS-GATE-001

Status: PROPOSED_FOR_ADMISSION / TOPOLOGY-004-RECONCILED
Target cadence: after the 07:15 morning canonical reconciliation, nominally 07:30 America/New_York
Purpose: independently verify that the new-day chat bootstrap is current, coherent and executable before the user starts new chats.

## Required checks

1. Re-fetch current `main` and `governance/CURRENT-AUTHORITY.json`.
2. Read the current morning pointer/manifest and require a manifest for the current New York date.
3. Require owner packets for MASTER_ROOT, LEARNING, BOOK and DOCUMENTS; Prose focus is represented through BOOK rather than a separate peer packet.
4. Read the topology/current owner allocation and enumerate active Second Shift lanes from `SECOND-SHIFT-REGISTRY-001.json::owner_files`.
5. Resolve current controls for CORE, LEARNING, BOOK and DOCUMENTS; when Book-Prose work is active also resolve `literary-prose-engine-001` as the Book child specialist control.
6. Compare live controls/state to each packet and reconcile machine-resolvable AUTHORITY_DELTA.
7. Verify completion/current obligations/repair/delegation state against each selected objective.
8. Verify every active READY/ACTIVE owner has the correct active Second Shift route. Documents routes to DOCUMENTS; `SYSTEM_MASTER/BOOK/PROSE` routes to BOOK; neither PROSE nor SYSTEM_MASTER root appears as a separate `owner_files` lane.
9. Verify no current obligation, packet, repair transaction or scheduled work grants Prose a separate peer/mutation lane or canonical manuscript-write authority.
10. Verify no packet hides EVIDENCE_MISMATCH, stale delegation, owner-route mismatch, repair-owner mismatch or authority transfer.
11. Verify every packet is CHAT_READY or CHAT_READY_WITH_DECISION; NOT_READY identifies one exact blocker and safe fallback when available.
12. Confirm the repository-wide System State Reconciler, topology validator and Second Shift owner-coverage gate are not red for an unadjudicated current semantic defect. A workflow that failed before runner assignment must be classified separately as infrastructure-not-executed, not semantic failure.

## Active roles and lanes

User-facing owner chat roles: MASTER_ROOT, LEARNING, BOOK, DOCUMENTS. A Prose-focused chat is a BOOK-role focus at `SYSTEM_MASTER/BOOK/PROSE`.

Active Second Shift peer lanes: CORE, LEARNING, BOOK, DOCUMENTS, discovered from the registry rather than hard-coded. Active Prose child work inherits BOOK; it never creates a separate Prose owner lane. The temporary SYSTEM_MASTER root worker lane also remains retired; MASTER_ROOT is controller/orchestrator.

## Repair behavior

If the readiness gate finds machine-resolvable drift, repair/reconcile it and refresh the daily manifest/pointer before reporting failure.

If current data attempts to recreate Prose as a separate peer/owner lane, classify `RETIRED_PROSE_PEER_LANE_STALE_WORK`; preserve historical evidence and route active child work through BOOK. Never transfer historical Prose PASS to changed Book-Prose integration bytes.

If Book or its Prose child objective/state changes, reconcile `governance/second-shift/BOOK-DELEGATIONS.json` in the same repair transaction. If Documents objective/state changes, reconcile `governance/second-shift/DOCUMENTS-DELEGATIONS.json` separately.

If a real human/author/private/native/external decision remains, preserve CHAT_READY_WITH_DECISION when independent safe work remains; do not broaden it into project confusion.

## Notification behavior

When all current owner roles and active execution lanes are coherent, no user intervention is required. When any role is not ready, surface only the affected role, exact blocker, what was repaired automatically, the smallest required action/decision and independent work still safe to execute.
