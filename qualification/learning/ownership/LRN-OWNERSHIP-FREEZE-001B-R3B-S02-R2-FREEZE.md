# LRN-OWNERSHIP-FREEZE-001B-R3B-S02-R2 — Atomic Responsibility Repair Freeze

Status: **QUALIFIED_AND_FROZEN — SPECIFICATION / OWNERSHIP CONSTITUTION ONLY**  
Owner lane: `SYSTEM_MASTER/LEARNING`  
Date: `2026-09-12`

## Exact subject

This freeze binds the machine-applied atomic-responsibility delta recovered after `R3B-S02-R1` exposed residual collisions inside the otherwise lossless 001C/R3A ownership model.

Pre-freeze live parent re-read:

- branch: `learning/ownership-freeze-001b-20260912`
- parent commit: `63117c5cc010c21761f1476b18c17df84e4605f1`
- parent tree: `9b92368a1bd7c059a84a8227b192016890f0ba98`

The exact historical source universe remains unchanged:

- `110` historical P0 requirements;
- `110` historical interfaces;
- `26` historical semantic objects.

The prior active representation was `113 / 112 / 28`. The repaired active constitution is now:

- **116 active requirements**;
- **112 active interfaces**;
- **28 active semantic objects**.

The increase from 113 to 116 requirements is not feature expansion. Three compound active rows (`LRN-064`, `LRN-138`, `LRN-140`) are superseded by six atomic children while all original source-parent coverage remains exactly 110.

## Machine-applied repair evidence

Durable evidence in this branch:

- `LRN-OWNERSHIP-FREEZE-001B-R3B-S02-R2-DELTA.json`
- `LRN-OWNERSHIP-FREEZE-001B-R3B-S02-R2-QUALIFICATION.json`
- `LRN-OWNERSHIP-FREEZE-001B-R3B-S02-R2-REQUIREMENTS.csv.gz.b64`
- `LRN-OWNERSHIP-FREEZE-001B-R3B-S02-R2-INTERFACES.csv.gz.b64`

Exact locally generated/reconstructed CSV SHA-256 values:

- repaired requirements CSV: `63554c37366c2718e1453c56c4765d9a5a49621495a522ca8be26417c1d977a2`
- repaired interfaces CSV: `4f4387956bd8189b7a65f5de94ab3c722cb34f249ebe8a94ad74b4c0d0c3cbc0`

Source-ledger SHA-256 values used by the qualifier:

- 001C requirements: `48d580cdcd2412910c1ce5cb480ea47766646c5a35e7c8564d4d66cc3bf51962`
- 001C interfaces: `067becc2eb597e1dedc8169bee7222eaf5daad7e1dd122a8bfc6f0b7646e6f86`
- 001C objects: `a3cf9f19e5100bf66e45cc5a8c8e7f652a8d54c0dcae0b3adbe52a0157706120`
- 001C test obligations: `7688f208e56a86303ba76e54e918b9aaf0eb3198d7490f803bee018faf55b6f3`

The preserved carriers reconstruct to the exact generated CSV hashes above. Qualification result: **PASS**.

## Frozen collision eliminations

### Curriculum activation

`I006 ActivateCurriculumVersion` is the **sole Curriculum state-transition authority** for pinning the exact immutable CurriculumVersion ACTIVE and superseding the prior active pointer.

`I068 ApproveCourseActivation` is **approval-decision-only**. It records an immutable approval decision receipt bound to the exact CurriculumVersion, validation report, expected goal version, policy/input versions and semantic operation identity. It has no activation mutation side effect.

`I072 AcknowledgeCourseRefresh` records accept/postpone/reject of an immutable refresh diff. In v1, acceptance **never bundles activation**. Accepted candidates still require the explicit I068 approval decision and then I006 activation transition.

`I035 CurriculumActivated` remains a post-commit Curriculum event and cannot be emitted as authoritative fact before I006 commits.

### Generation / compilation

`I005 RequestCurriculumGeneration` owns the high-level Curriculum generation workflow intent from a versioned LearningGoal reference. It creates/deduplicates the durable CurriculumGenerationRequest and may obtain a generic external job reference without owning generic job lifecycle.

`I066 RequestCourseCompilation` owns the downstream compiler-stage request and must consume an admitted generation request plus source-plan/compiler-policy inputs. It cannot mint a second high-level generation intent from the same goal.

### Compound requirement repair

The following provenance parents are superseded as active rows without dropping source coverage:

- `LRN-064` -> `LRN-064-L` + `LRN-064-C`
- `LRN-138` -> `LRN-138-L` + `LRN-138-C`
- `LRN-140` -> `LRN-140-L` + `LRN-140-C`

The `-L` children hold Learning-owned learner/evidence/mastery/adaptation semantics. The `-C` children hold Curriculum-owned program/generation/validation/activation/source-readiness semantics. Shared rights, artifact, job, identity, authorization, accessibility-source facts and generic infrastructure remain external authorities referenced through contracts rather than absorbed by Learning.

## Qualification assertions frozen

The exact R2 qualifier proved all of the following:

- `113` source active requirements were read and represented;
- historical requirement parent denominator remains `110`;
- repaired active requirement count is exactly `116` with unique IDs;
- all six atomic children are present and all three superseded compound parents are absent as active rows;
- interfaces remain exactly `112`, with original historical parent denominator `110` preserved;
- semantic objects remain exactly `28`, with original parent denominator `26` preserved;
- I006 is the only activation transition;
- I068 is approval-only;
- I072 cannot activate;
- I005 and I066 have distinct workflow-stage identities;
- no Book, Documents or Programming semantic owner was imported;
- shared/Core authorities remain external.

## Relationship to prior freeze

`R3A` remains valid provenance for the lossless 113/112/28 attribution reconstruction and its owner/route qualification. This R2 freeze **supersedes only the residual atomic-responsibility representation** where later forensic analysis found compound/colliding active responsibilities. It does not erase historical evidence or transfer historical PASS to changed bytes.

The current ownership constitution for subsequent Learning work is therefore **116 requirements / 112 interfaces / 28 semantic objects**, losslessly rooted in the original **110 / 110 / 26** historical source universe.

## Build gate

The original S02 52-case denominator is no longer sufficient because it was frozen before the I068/I006 approval-transition separation was discovered. Runtime/owner-local S02 implementation remains paused until a repaired denominator explicitly exercises the approval boundary, activation uniqueness and generation/compilation stage identity.

Dependency-valid successor:

`LRN-OWNERSHIP-FREEZE-001B-R3B-S02-R3 — REPAIRED CURRICULUM LIFECYCLE DESIGN LOCK + 60-CASE EXACT-SUBJECT DENOMINATOR`

Only after R3 freezes may an owner-local source build resume against exact admitted source custody. Canonical repository-native application remains separately blocked until an authoritative repo-native source target is admitted.

## Evidence explicitly not claimed

This freeze does not claim runtime implementation, live PostgreSQL behavior, real user approval, participant consent or responses, mastery, retention, transfer, psychometric validity, instructional effectiveness, SME approval, certification/accreditation, real external-provider standing, native iPhone execution, A-01 execution or production execution.