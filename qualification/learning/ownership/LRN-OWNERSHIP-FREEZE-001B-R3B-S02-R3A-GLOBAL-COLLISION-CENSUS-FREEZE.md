# LRN-OWNERSHIP-FREEZE-001B-R3B-S02-R3A — Global Interface Collision Census / Freeze

Status: **QUALIFIED_AND_FROZEN — OWNER CONSTITUTION REPAIR ONLY / RUNTIME UNCHANGED**  
Owner lane: `SYSTEM_MASTER/LEARNING`  
Date: `2026-09-12`

## Exact controlling lineage

This unit follows the repaired S02 denominator design lock and preserves the current lossless ownership universe:

- historical source: **110 requirements / 110 interfaces / 26 semantic objects**;
- current atomic representation before this unit: **116 requirements / 112 interfaces / 28 semantic objects**;
- no Book, Documents or Programming semantic ownership is imported;
- Curriculum remains an internal Learning-system semantic owner, not a Topology peer.

Immediately before this unit's repository mutation, the exact reconstruction head was re-read as `2f658e2c2717bfbb79ddd97bde7f2e937e2fe498`, tree `b0a241c530e10d5a28af9887afd16e51a9402b98`.

## RECOVER / INVENTORY / ANALYZE

The complete 112-interface repaired R2 ledger was scanned owner-by-owner, type-by-type and pairwise for overlapping authority nouns/actions. The 28 semantic-object ledger was also re-read for owner/lifecycle overlap, and the 116 active requirements were screened for remaining cross-owner compound responsibilities.

The prior R2 repair correctly removed the known I006/I068/I072 activation collision and split LRN-064/LRN-138/LRN-140 into atomic Learning/Curriculum children. One additional **confirmed interface collision** remained:

- `I035 CurriculumActivated` already meant the successful ACTIVE transition committed and a new active CurriculumVersion exists.
- `I082 CourseActivationApproved` was named as an approval event but still had trigger `Course activated` and output `New active course version`.

That made I082 a second event-level representation of completed activation and erased the newly frozen approval-versus-activation boundary.

A second wording defect was also confirmed:

- `I007 RequestCourseRefresh` still said `Durable refresh job request`, which could be read as Curriculum owning generic job truth even though the frozen architecture gives Curriculum only its workflow intent/reference and leaves generic job lifecycle external/Core-owned.

No semantic-object owner collision was found in the exact 28-object ledger. The current split objects (`RemediationNeed/RemediationPlan` and `AdaptiveLearningPolicyVersion/InstructionalPolicyVersion`) remain correctly separated. No additional cross-owner compound requirement requiring a new split was confirmed beyond the already frozen LRN-064/LRN-138/LRN-140 repair.

## ADJUDICATION / DESIGN LOCK

The interface denominator remains exactly **112** and historical parent-interface coverage remains exactly **110**.

### I082 repair

`I082 CourseActivationApproved` is now an **approval-decision event only**:

- trigger: I068 approval decision committed for the exact CurriculumVersion;
- payload: approval receipt reference + exact CurriculumVersion + validation reference + expected LearningGoal version;
- meaning: immutable approval decision exists;
- explicit negative: it does **not** mean the CurriculumVersion is ACTIVE;
- delivery may retry and consumers deduplicate by stable event identity;
- I006 remains the sole ACTIVE state transition;
- I035 remains the only activation-completed Curriculum event.

This creates an exact distinction:

`I068 approval command -> I082 approval event -> I006 activation command/transition -> I035 activation-completed event`.

No qualification fixture may be interpreted as evidence that a real user approved activation.

### I007 repair

I007 now creates/deduplicates a **Curriculum-owned refresh workflow intent**. It may reference generic external job execution but never owns generic job lifecycle and never mutates the active CurriculumVersion in place. Candidate activation still requires I068 then I006.

## Qualification

Machine-applied repaired interface ledger:

- source repaired-R2 interface SHA-256: `4f4387956bd8189b7a65f5de94ab3c722cb34f249ebe8a94ad74b4c0d0c3cbc0`;
- R3A repaired interface SHA-256: `217d3eecafadbb2e1e415423ab8e744948a7e474cd130c8fe90baade52bac563`;
- exact active interfaces: `112`;
- unique active IDs: `112`;
- historical parent-interface IDs represented: `110`.

The machine qualifier passed all frozen assertions: I006 sole activation transition; I068 approval-only; I082 approval-event-only; I035 activation-event-only; I082/I035 distinct; I007 does not own generic job truth; I005/I066 remain distinct workflow stages; I072 cannot activate; no Book/Documents/Programming owner import.

Durable evidence:

- `LRN-OWNERSHIP-FREEZE-001B-R3B-S02-R3A-INTERFACE-DELTA.json`
- `LRN-OWNERSHIP-FREEZE-001B-R3B-S02-R3A-QUALIFICATION.json`

## Effect on S02 denominator

The 60-case S02 denominator remains structurally valid but must bind the repaired I082 semantics wherever approval-event behavior is exercised. Runtime implementation has **not** begun in this unit.

The exact owner-local build successor remains:

`LRN-OWNERSHIP-FREEZE-001B-R3B-S02-R4 — RECONSTRUCT S01B EXACT PATCH -> BUILD S02 CURRICULUM LIFECYCLE OWNER-LOCAL PATCH -> 60-CASE ISOLATED QUALIFICATION -> CUMULATIVE OWNER/ROUTE/ATOMIC-RESPONSIBILITY REGRESSION`

The owner-local source lineage is still the admitted source ZIP SHA-256 `28e3317e5494c9df7df2f8aefb7f83f7c69fbc9d0ababfb696700542c831edc3` followed by exact S01B patch SHA-256 `b3ce4bc021c657f7dffb6ad9f628bcd8d63783281b7af55252059f0b5d61454b`. No approximation of that patch is authorized.

Canonical repository-native application remains separately blocked by source-custody target admission. Shared/Core route activation remains fail-closed until exact current external contracts are admitted.

## Evidence explicitly not claimed

No runtime implementation PASS, live PostgreSQL behavior, real user approval, participant consent/response, mastery, retention, transfer, psychometric validity, instructional effectiveness, SME approval, certification/accreditation, external-provider standing, native iPhone execution, A-01 execution or production standing is claimed.