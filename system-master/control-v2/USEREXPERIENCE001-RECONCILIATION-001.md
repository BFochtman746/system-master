# USER-EXPERIENCE-001 / SMR021 — Reconciliation 001

Date: 2026-09-09
Repository control branch: `system-master/control-v2`
Disposition: **HISTORICAL CARRIER VERIFIED / HISTORICAL PORTABLE REPLAY PASS / DATABASE-PARITY DEFECT REPRODUCED / CORRECTED HISTORICAL CANDIDATE PORTABLE PASS / DEPENDENCY-CURRENT REBUILD PENDING**

## Recovered historical authority

The exact historical R025 application carrier was recovered from Library/workspace custody:

`SYSTEM_MASTER_OFFICIAL_SPINE_v2.0.24_USER-EXPERIENCE-001-REVIEWED_A01-PENDING.zip`

Independent archive identity:

- bytes: `12,828,994`
- SHA-256: `408e8aaeddad67d983568a05263303ef5e0106f9af62e314d40dda2b738b9ced`

The recovered identity exactly matches the preserved v2.0.24 Program Vault and provenance sidecar authority.

## Fresh historical replay

The historical carrier was extracted fresh and replayed without mutation.

PASS evidence:

- strict Java 21 compile: `578 main / 66 test` sources;
- official cumulative portable suites: `60/60 PASS`;
- USER-EXPERIENCE authority verifier: `21 controls PASS`;
- `UserExperiencePortableTests`: `19 assertions PASS`;
- `FinalWavePortableTests`: `22 assertions PASS`;
- Foundation-005 contract parity: `119 controls / 111 contracts PASS`;
- assurance code quality: PASS;
- toolchain lanes: `PASS_WITH_EXTERNAL_ADMISSION_LANES_BLOCKED`;
- release manifest: exact size/SHA replay PASS;
- deterministic archive: two independent rebuilds reproduced the historical carrier byte-for-byte at `408e8aae...`;
- official portable verifier: PASS with subject immutable before/after verification.

Historical R025 remains portable evidence only. A-01/device/browser/accessibility/usability/live-PostgreSQL/production claims are not transferred or invented.

## Demonstrated residual database-contract parity defect

Adversarial review compared the R025 Java invariants, JSON Schema invariants and migration 051 database constraints.

R025 Java/schema reject or bound all of the following, while migration 051 did not independently encode the same database-layer rule:

1. `target_authority = USER-EXPERIENCE-001` is rejected by Java and JSON Schema, but the database constraint set only bounded target-authority length.
2. nullable `approval_ref` is globally nonblank / <=512 in Java and JSON Schema, but the database bounded it only for APPROVE/REJECT/ROLLBACK actions.
3. nullable attention `action_capability_id` is nonblank / <=256 in Java and JSON Schema, but migration 051 had no matching database constraint.
4. nullable attention `evidence_ref` is nonblank / <=512 in Java and JSON Schema, but migration 051 enforced the bound only for CRITICAL attention.

The historical authority verifier also did not demand these exact database controls, so this drift class could retain a green static authority result.

This is a real schema/Java/database parity defect. Historical PASS remains valid for the immutable historical bytes but does not transfer to corrected bytes.

## Bounded repair

Focused repair artifact:

`USEREXPERIENCE001_R025_DB_PARITY_REPAIR_001.patch`

The repair:

- adds `core_user_interaction_target_authority_external`;
- adds global nullable `core_user_interaction_approval_len` and keeps the approval-action lineage-presence constraint separate;
- adds `core_attention_action_capability_len`;
- adds global nullable `core_attention_evidence_len` and keeps the CRITICAL evidence-presence rule separate;
- adds symmetric down-migration removals;
- strengthens `verify_userexperience001_authority.py` so these database controls are qualification-visible.

No effect authority, authentication authority, capability admission authority or production authority is added.

## Corrected historical candidate qualification

The repair was applied only to a separate candidate copy; the recovered historical carrier was not mutated.

Candidate portable results:

- strengthened USER-EXPERIENCE authority verifier: PASS;
- explicit database-parity regression: `5/5 PASS`;
- Foundation-005 contract parity: `119/119 across 111 contracts PASS`;
- assurance code quality: PASS;
- strict Java 21 compile: `578 main / 66 test PASS`;
- official cumulative portable suites: `60/60 PASS`;
- migration manifest regenerated: 28 migrations;
- release manifest regenerated and independently verified: `1,354` subjects, `0` missing, `0` mismatched;
- candidate release-manifest SHA-256: `3c8e07b9938d7c886dbd751eed1a9bfa546f6f4b0b8e0b3159bbcacd2c2926ad`;
- two independent deterministic candidate builds: BYTE-IDENTICAL PASS;
- corrected historical candidate archive SHA-256: `6fe46bd3020a732a2f41a0df4097ac6bcf95632b15696c9e9181fd7f809b8b21`.

This candidate identity is a corrected historical R025 artifact, not the dependency-current SMR021 promotion subject and not an A-01 subject.

## Dependency-current boundary

Current Core predecessor authority remains SMR020 dependency-current subject:

`89066e5662554b1810691473e0ed9bf49d8cc2fd4964444043b878461ed75477`

The next dependency-valid action is to derive the SMR021 rebuild from that exact predecessor, transplant the recovered USER-EXPERIENCE semantics plus this database-parity repair, produce a new exact source/test subject, then replay the current rebuild qualification set.

Do not use the old v2.0.24 spine as the current product base. Do not transfer its 60/60 PASS to the dependency-current rebuilt subject. Do not queue A-01 until a GitHub-native immutable dependency-current candidate exists, hosted qualification passes on that exact subject, and a distinct A-01 evidence delta is justified.

## Evidence fences retained

Still not proven:

- physical iPhone/iPad/Android/desktop behavior;
- VoiceOver/TalkBack/screen-reader/full-keyboard behavior;
- browser matrix, zoom/dynamic-type/orientation/safe-area/touch-target measurements;
- usability study or cross-device production continuity;
- live PostgreSQL migration execution on the target runtime;
- A-01 qualification;
- production certification or promotion authority.

## Exact next objective

`SYSTEM-MASTER-REBUILD-021-DEPENDENCY-CURRENT-REBUILD-001 — DERIVE USER-EXPERIENCE-001 FROM EXACT SMR020 SUBJECT 89066e56... -> TRANSPLANT R025 HUMAN-INTENT/ATTENTION/PWA SEMANTICS + DB-PARITY REPAIR -> PRODUCE NEW EXACT SOURCE/TEST SUBJECT -> RUN STRICT JAVA + FOCUSED UX + CONTRACT/SQL/RECURRENCE + COHERENCE/CONGRUENCE + MANIFEST QUALIFICATION.`
