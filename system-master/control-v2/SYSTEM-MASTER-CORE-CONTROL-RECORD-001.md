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

`PLATFORM005-REDERIVED-ASSEMBLY-004.md` and `PLATFORM005-RECONCILIATION-004.md` supersede the earlier instruction to recover and modify the unavailable `0ae86ee3...` composite. The prior composite remains historical evidence; its PASS does not transfer.

## Current Core objective

SMR018 / PLATFORM-005 portable residual closure is complete on the independently qualified re-derived exact subject:

`cc67826bb608fc82459e23c59d5e0106d10422c6fe79f45f0571be60356b7d54`

The remaining SMR018 boundary is source custody, not another portable repair: the complete runnable `cc67826...` tree is still outside ordinary GitHub-native immutable source custody and was not found in the saved-file Library. Do not restart the obsolete attempt to recover `0ae86ee36d00d3d5749e20889dafbcf85c1dd84baecbcc4bc34c8d39ba31553c` as the current product objective.

The dependency-valid next reconciliation step is `SYSTEM-MASTER-REBUILD-019 / CHAT-001A`. Required sequence:

1. import/admit the exact runnable `cc67826...` SMR018 source tree without mutation and independently reproduce its exact source/test subject;
2. recover/verify the exact historical SMR019 carrier and historical source/test subject;
3. cumulatively rebuild SMR019 with the complete `cc67826...` predecessor state while preserving `CHAT001A_STREAM_CHECKPOINT_FINAL_STANDING_REPAIR_001.patch`;
4. derive a new exact SMR019 subject and rerun strict Java 21, all 19 executable suites, PLATFORM-005 + CHAT-001A focused/contract/recurrence gates, CHAT PostgreSQL static contract, persistence, coherence, congruence, exact-subject, control-count and complete release-manifest gates on those same bytes;
5. preserve the new exact candidate and evidence before unblocking `SYSTEM-MASTER-REBUILD-020 / OPERATOR-OPS-001`.

Until step 4 passes, SMR020 remains `BLOCKED — PREDECESSOR RECONCILIATION`.

Hosted/A-01 admission remains separate: do not create an A-01 ticket until the dependency-current exact candidate is GitHub-native, hosted-qualified and has a real Windows-specific completion delta.

## Boundary rules

- Qualification evidence remains bound to exact tested subjects; this control record transfers no PASS.
- Assurance/Reconciliation and Continuity remain Core subsystem/evidence lanes, not peer systems.
- A-01 is shared System Master infrastructure, administratively integrated through Core; it is not Core product logic and not a peer product system.
- Core may expose shared interfaces to Learning, Book and Prose, but may not select or overwrite their product critical paths.
- Cross-system use requires an explicit published/qualified interface or parent admission boundary.

## Second Shift

Core Second Shift delegation is owned by `governance/second-shift/CORE-DELEGATIONS.json` on current main. Any delegated item must be revalidated against this branch's live head before execution. A head mismatch makes the delegation stale until re-evaluated.
