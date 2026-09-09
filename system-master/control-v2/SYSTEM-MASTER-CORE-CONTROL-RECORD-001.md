# SYSTEM MASTER CORE / FOUNDATION & SPINE — Control Record 001

Status: **ACTIVE / PRIMARY CORE CONTROL AUTHORITY**  
Date: 2026-09-09  
Owner path: `SYSTEM_MASTER/CORE`  
Parent product: `SYSTEM_MASTER`  
Control branch: `system-master/control-v2`  
Topology authority: `governance/SYSTEM-TOPOLOGY-002.json` on canonical `main`

## Scope

CORE is the shared Foundation & Spine inside the System Master product. It owns the shared authority spine, data/platform/runtime foundations, continuity/recovery, assurance/reconciliation and shared A-01/control-plane integration.

CORE is **not** the System Master product root and does not own Learning product logic, Book product logic or Prose product logic. LEARNING and BOOK are sibling tool systems under SYSTEM MASTER; PROSE is a child of BOOK.

Historical references to `MASTER`, `MASTER SYSTEM` or `System Master foundation/spine` in this branch map to `SYSTEM_MASTER/CORE` under the current topology.

## Technical-state preservation

Detailed dependency-spine standing, exact candidate identities, reconciliation evidence, source-custody constraints and the current SMR018 -> SMR019 -> SMR020 dependency sequence remain preserved in:

`system-master/control-v2/SYSTEM-MASTER-V2-CONTROL-RECORD.md`

Where that historical control record describes MASTER/LEARNING/BOOK/PROSE as four peers, that taxonomy is superseded by `SYSTEM-TOPOLOGY-002.json`. Its technical/evidence statements remain scoped exactly as written unless separately superseded.

## Current Core objective

Recover the exact runnable source tree for the fully qualified SMR018 composite `0ae86ee36d00d3d5749e20889dafbcf85c1dd84baecbcc4bc34c8d39ba31553c`; reproduce it exactly; apply only `PLATFORM005_PARSED_PATH_API_ROUTE_REPAIR_002.patch`; derive a new exact subject; rerun all SMR018 portable gates; then cumulatively rebase SMR019 while preserving its CHAT repair. Do not resume SMR020 until rebased SMR019 passes on its exact bytes.

## Boundary rules

- Qualification evidence remains bound to exact tested subjects; this control record transfers no PASS.
- Assurance/Reconciliation and Continuity remain Core subsystem/evidence lanes, not peer systems.
- A-01 is shared System Master infrastructure, administratively integrated through Core; it is not Core product logic and not a peer product system.
- Core may expose shared interfaces to Learning, Book and Prose, but may not select or overwrite their product critical paths.
- Cross-system use requires an explicit published/qualified interface or parent admission boundary.

## Second Shift

Core Second Shift delegation is owned by `governance/second-shift/CORE-DELEGATIONS.json` on current main. Any delegated item must be revalidated against this branch's live head before execution. A head mismatch makes the delegation stale until re-evaluated.
