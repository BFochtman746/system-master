# SYSTEM-STATE-RECONCILER-001

Status: ACTIVE IMPLEMENTATION CONTRACT
Repository: BFochtman746/system-master

## Purpose

Provide one deterministic repository-native truth compiler that continuously checks whether System Master's current authority, topology, owner controls, completion history, open obligations, expectations, reallocations, Second Shift delegations, and A-01 registry agree.

This reconciler does not create authority. It validates and projects authority already present in repository records.

## Canonical inputs

- governance/CURRENT-AUTHORITY.json
- governance/SYSTEM-TOPOLOGY-002.json
- governance/COMPLETION-LEDGER-001.json
- governance/WORK-OBLIGATION-REGISTRY-001.json
- governance/EXPECTATION-REGISTRY-001.json
- governance/REALLOCATION-LEDGER-001.json
- governance/second-shift/SECOND-SHIFT-REGISTRY-001.json
- the four owner delegation files selected by that registry
- qualification/a01/registry.json
- the active census selected by CURRENT-AUTHORITY, when present
- live Git refs for main, CORE, LEARNING, BOOK and PROSE when available

## Required outputs

1. `DERIVED-CURRENT-STATE.json`
2. `SYSTEM-STATE-DRIFT-REPORT.json`
3. deterministic process exit status

The derived projection is disposable and reproducible. Source ledgers/receipts remain authority.

## Truth classes

- `AUTHORITY_CURRENT`
- `AUTHORITY_DELTA`
- `STALE_DELEGATION`
- `EVIDENCE_MISMATCH`
- `UNALLOCATED`
- `REGISTERED_EXECUTABLE_MISSING`
- `DUPLICATE_ID`
- `BROKEN_REFERENCE`

## Minimum invariants

1. Product root is SYSTEM_MASTER.
2. Canonical hierarchy is SYSTEM_MASTER -> CORE, LEARNING, BOOK -> PROSE.
3. Every non-closed obligation has one valid owner path.
4. Every completion has one valid owner path.
5. Completion and obligation IDs are unique inside their own registries.
6. Second Shift owner files map to the correct canonical owner/control ref.
7. Active delegations satisfy the delegation schema's required fields.
8. When live owner heads are available, an active delegation bound to any other head is `STALE_DELEGATION`.
9. Every A-01 workstream maps through SYSTEM-TOPOLOGY-002.
10. Every repository-owned executable registered in A-01 exists at the registered path.
11. Census watermark movement is reported as `AUTHORITY_DELTA`, not silently treated as failure or ignored.
12. Human, author, private-data, external-authority, native-platform, publication and production boundaries are never broadened by reconciliation.

## Closed-loop repair integration

`A01-CLOSED-LOOP-REPAIR-001` is a separate execution-control capability but depends on this reconciler.

Before an automated repair attempt is admitted, the reconciler must confirm:

- the failed receipt belongs to the claimed owner/workstream;
- the failure class is repair-eligible;
- the failed subject SHA is immutable and preserved;
- the repair attempt budget is not exhausted;
- a changed repair produces a new exact SHA;
- required prequalification exists for the replacement SHA;
- the replacement ticket preserves original receipt and workstream lineage;
- non-automatable classes route to human/author/private/native/external/dead-letter handling instead of mutation.

The repair worker can prepare a replacement candidate but can never grant A-01 PASS, promotion, publication or production authority.

## CI behavior

The reconciler must run under one GitHub Actions concurrency group so state checks serialize rather than race. Expected live-head movement is emitted as warnings/deltas. Structural contradictions, unmapped ownership, stale active delegations and missing registered executables are failures.

## First proof case

At creation time the A-01 registry contains `A01-CLOSED-LOOP-REPAIR-SELFTEST` pointing to `.github/scripts/a01-closed-loop-repair-selftest.js`. The current main tree does not contain that executable. The first reconciler run is expected to detect this as `REGISTERED_EXECUTABLE_MISSING`; no synthetic PASS or placeholder executable may be created merely to make the reconciler green.
