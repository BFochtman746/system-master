# SMR021 Minimum UX Work/Descriptor/Action Binding Donor Map 001

Date: 2026-09-10
Owner lane: `SYSTEM_MASTER/CORE`
Input CORE head: `768361e35ffd692c5b0b0abf7babd1b9e147aac5`
Exact runnable predecessor source/test SHA-256: `e22ecedfd3850be6b744ee82f2c02722cd3d203a5785f6f423ac395011cf821f`
Status: **DONOR MAPPING CLOSED / MINIMUM DERIVATIVE REPAIR DESIGN READY / NO PASS TRANSFER**

## Purpose

Continue the admitted successor from `SMR021-EXACT-E22-PREDECESSOR-PLATFORM006-ACTION-GRANT-INSPECTION-001.md` without guessing across authority boundaries. This packet maps the already-sealed historical USER-EXPERIENCE implementation carrier to the exact current PLATFORM-006 action-admission contract and freezes the minimum repair shape before executable mutation.

No A-01, native, human, usability, accessibility, publication, production, or effect-execution evidence is claimed here.

## 1. Exact historical donor custody

Recovered durable Library object:

`/System Assurance/SYSTEM_MASTER_OFFICIAL_SPINE_v2.0.24_USER-EXPERIENCE-001-REVIEWED_A01-PENDING.zip`

Observed archive SHA-256:

`408e8aaeddad67d983568a05263303ef5e0106f9af62e314d40dda2b738b9ced`

This matches the existing historical readiness witness for the v2.0.24 donor.

Relevant donor file digests inspected:

- `src/main/java/org/systemmaster/core/ExperienceAdmission.java` — `65e16fb1fafd4c5efec45190468d14accbc22166b23f7a2f4b5faa57baa05086`
- `src/main/java/org/systemmaster/core/UserExperienceService.java` — `420d7ce4cbf6aaf00cfb86de4f4566a8f5d74597fc2a7a48a19fbde51ca47b85`
- `src/main/java/org/systemmaster/core/UserInteractionCommand.java` — `727a76e0f84d4627d091fb3afc552f1a5ce129d06d7ec8625aba26ca26c70e31`
- `src/main/java/org/systemmaster/core/UserExperienceStore.java` — `244285a22462252ad361911dea05232493fcaa4d0e35600965ab062a975272e6`
- `src/main/java/org/systemmaster/core/JdbcUserExperienceStore.java` — `9afdc58a061d5d6936ee00849841a91eb4219126695f4bfb2a66d05bb452aed8`
- `07_DATABASE/migrations/051_user_experience_001_hardening.up.sql` — `022707dd93a52f4d6c8a5e218d17ecbe4a8868818ccb39cd15678a2f91dd92ce`
- `00_PROGRAM_CONTROL/userexperience001_review/USER-EXPERIENCE-001-R025-INTEGRATED-PORTABLE-VERIFICATION.json` — `230f412cdbc63f2315930b9495ff64ef72069d9e176c328e49f8b6b5aa5266b8`

The historical R025 receipt records integrated portable remediation PASS but explicitly remains `A01_PENDING` and production uncertified. That historical result is donor evidence only; it is not transferable to a changed SMR021 subject.

## 2. Historical defect carrier confirmed

The donor `ExperienceAdmission` records:

- `principalId`
- `sessionId`
- caller-supplied `Set<String> admittedActions`
- `admissionEvidenceRef`

`UserExperienceService.submit(...)` correctly rejects stale work version, principal/session mismatch, action not present in the admission, admission-evidence mismatch, USER-EXPERIENCE self-effect targets, and approval-like actions without `approvalRef`. It then records intent only; `executeEffect(...)` always throws.

However, the admission object itself does **not** bind:

- exact `workId`;
- PLATFORM-006 selected descriptor identity;
- PLATFORM-006 selected descriptor canonical digest;
- the routed requirement digest / route decision identity;
- descriptor-owned permitted effect/action semantics.

Therefore a route/admission issued for one work item can be structurally separated from the later proposed command's `workId`, and `admittedActions` is a free set inside the admission projection rather than an immutable projection of the selected PLATFORM-006 descriptor contract. This is the exact historical seam the current SMR021 repair must close.

## 3. Current PLATFORM-006 target authority

The exact `e22...` predecessor has already been inspected and classified `EXISTING_DESCRIPTOR_ACTION_GRANT`.

The target contract provides owner-defined immutable route/admission evidence through:

- `CapabilityDescriptor.allowedCallers`;
- `CapabilityDescriptor.permittedEffects`;
- `CapabilityDescriptor.authorityRequirements`;
- descriptor canonical digest binding those controls;
- `CapabilityRequirement.workId`, `planId`, `callerAuthority`, requested effect, granted authorities, capability id and canonical requirement digest;
- `CapabilityRouteDecision.workId`, `planId`, requirement digest, capability/caller identity, selected descriptor identity/digest, selected implementation digest and health observation identity.

`Platform006Authority.grantsAuthority()` remains false. The repair may consume/prove an already-admitted action envelope; it may not mint caller authority or effect authority.

## 4. Minimum semantic mapping

The derivative USER-EXPERIENCE admission projection SHALL be constructed from a PLATFORM-006 route decision + its selected descriptor/requirement evidence, not from a UX-local action allowlist.

Minimum immutable admission fields:

1. `workId` — exact equality with the proposed `UserInteractionCommand.workId`.
2. `principalId` — exact equality with command principal.
3. `sessionId` — exact equality with command session.
4. `capabilityId` — selected routed capability identity.
5. `selectedDescriptorId` or equivalent exact selected descriptor identity available in the current PLATFORM-006 model.
6. `selectedDescriptorDigest` — exact current descriptor canonical digest.
7. `requirementDigest` and/or exact route-decision evidence identity sufficient to prevent route reuse against another requirement/work item.
8. descriptor-owned admitted effect/action projection derived from `permittedEffects` plus caller/authority checks already proved by PLATFORM-006; never an untrusted UX caller-provided set.
9. `admissionEvidenceRef` — durable evidence pointer retained from R025 semantics.

If the current PLATFORM-006 type system does not expose an exact `selectedDescriptorId` field by that name, the implementation must bind the exact existing descriptor identity tuple (`capabilityId`, version/implementation identity, canonical descriptor digest) rather than invent a second descriptor authority.

## 5. Submit-time invariants

Before persistence, USER-EXPERIENCE must fail closed unless all of the following hold:

- proposed command `workId == admission.workId`;
- proposed principal/session exactly match admission principal/session;
- proposed action/effect is within the immutable descriptor-owned admitted projection;
- route/requirement and descriptor digests match the evidence carried by the admission;
- admission evidence ref matches the proposed command admission ref;
- approval/control actions retain their existing `approvalRef` requirement;
- target authority is not USER-EXPERIENCE itself;
- USER-EXPERIENCE records intent only and never executes the effect;
- failed authorization creates zero persistence side effects.

## 6. R025 durable-database controls to preserve

The historical migration `051_user_experience_001_hardening.up.sql` already established useful controls that must be transplanted or equivalently enforced in the current database authority rather than discarded:

- session, target-authority, idempotency and admission reference fields become non-null;
- bounded identity fields and lowercase SHA-256 payload digest;
- closed action/status enums;
- approval-like actions require an approval reference;
- unique command idempotency by `(work_id, idempotency_key)`;
- attention dedupe/state/evidence constraints.

The SMR021 derivative must add the new work/descriptor/route binding without weakening those controls. Database migration ownership remains with the governing DATA/database authority; USER-EXPERIENCE may consume the resulting contract but must not create an independent persistence authority.

## 7. 15-case focused adversarial micro-gate

The first changed derivative is not eligible for a full-campaign claim until this focused gate passes at minimum:

1. exact admitted `work-A` + command `work-A` passes;
2. admitted `work-A` + command `work-B` fails;
3. injected action absent from descriptor-owned permitted projection fails;
4. descriptor digest substitution fails;
5. requirement/route digest substitution fails;
6. selected descriptor/capability identity substitution fails;
7. principal mismatch fails;
8. session mismatch fails;
9. admission evidence mismatch fails;
10. stale work version fails;
11. caller/authority context not admitted by PLATFORM-006 cannot be promoted by UX;
12. USER-EXPERIENCE self-effect target fails;
13. approval/reject/rollback without required approval reference fails;
14. every failed authorization leaves command persistence unchanged;
15. `executeEffect` remains impossible and no effect receipt is fabricated.

## 8. Exact transplant boundary

Historical donor semantics are source material only. The implementation successor must:

- start from exact SMR020 predecessor `e22ecedfd3850be6b744ee82f2c02722cd3d203a5785f6f423ac395011cf821f`;
- map donor USER-EXPERIENCE types into the current `org.systemmaster.rebuild...` structure rather than replacing current PLATFORM-006 contracts with old `org.systemmaster.core` contracts;
- preserve only authority-compatible R025 behavior;
- record every changed/added source, test, migration and verifier file;
- compute a new exact source/test subject digest after mutation;
- obtain fresh portable/hosted qualification on that exact changed subject;
- retain A-01 as pending unless and until the canonical shared gateway produces an authoritative exact-subject receipt.

## 9. Completion delta

Before this map, CORE had proven that current PLATFORM-006 exposes the needed descriptor action grant but still lacked an exact, file-level mapping from the historical USER-EXPERIENCE carrier into the current predecessor.

After this map:

- exact historical donor archive and critical file digests are frozen;
- the historical cross-work/free-action seam is directly identified;
- the current PLATFORM-006 fields that replace the free admission semantics are fixed;
- R025 database/idempotency controls to preserve are enumerated;
- the 15-case micro-gate is fixed;
- executable mutation can proceed without inventing new authority.

## 10. Next executable successor

`SMR021-MINIMUM-UX-WORK-DESCRIPTOR-ACTION-BINDING-IMPLEMENTATION-002`

Evidence target:

- derivative built from exact `e22...` predecessor;
- changed-file inventory + new source/test SHA-256;
- 15/15 focused micro-gate PASS;
- R025 durable controls preserved/equivalently governed;
- zero failed-authorization persistence side effects;
- zero USER-EXPERIENCE effect execution;
- fresh full portable campaign after micro-gate;
- hosted/A-01/native/human/production standings reported separately and truthfully.

Stop condition: if mapping a required persistence field or action/effect projection would require USER-EXPERIENCE to own PLATFORM-006, DATA/database, approval, effect-execution, human, native or production authority, stop that implementation edge and emit the exact cross-owner dependency instead of widening authority.
