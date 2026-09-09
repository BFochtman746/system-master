# USER-EXPERIENCE-001 / SYSTEM-MASTER-REBUILD-021 — Adversarial Reconciliation 001

Status: **PHASE-2 CLOSED / MATERIAL ADMISSION-BINDING DEFECT REPRODUCED / CHANGED CANDIDATE REQUIRED / NO PASS TRANSFER**  
Date: 2026-09-09  
Owner: `SYSTEM_MASTER/CORE`  
Authority: `USER-EXPERIENCE-001`  
Packet: `SYSTEM-MASTER-REBUILD-021`

Predecessor checkpoint: `USEREXPERIENCE001-SOURCE-CUSTODY-RECONCILIATION-001.md`.

This record preserves the first completed adversarial reconciliation phase after historical v2.0.24 replay. It does not transfer historical R025 PASS to changed bytes and does not claim A-01, device/browser, assistive-technology, usability, native-platform or production authority.

## 1. Historical subject standing remains historical

Recovered historical v2.0.24 carrier:

`SYSTEM_MASTER_OFFICIAL_SPINE_v2.0.24_USER-EXPERIENCE-001-REVIEWED_A01-PENDING.zip`

Archive SHA-256:

`408e8aaeddad67d983568a05263303ef5e0106f9af62e314d40dda2b738b9ced`

The historical constituent replay is already checkpointed: strict Java 21 PASS, 578 main / 66 test, USER-EXPERIENCE authority 21/21, focused 19/19, FinalWave 22/22, Foundation-005 parity 119/111, assurance/code-quality/toolchain, and registry-driven 60/60 executable suites.

## 2. Historical Java / schema / database parity residual

R025 finding 6 says commands must not target `USER-EXPERIENCE-001` as effect authority, and finding 18 says schema/database contracts encode runtime authority invariants.

Historical Java rejects a command whose `targetAuthority` is `USER-EXPERIENCE-001`. Historical `user-interaction-command.schema.json` also carries:

`not: { const: "USER-EXPERIENCE-001" }`

for `target_authority`.

Historical migration `051_user_experience_001_hardening.up.sql`, however, constrains target-authority length only and does not include the corresponding non-self-authority constraint. Therefore the historical PostgreSQL contract can persist a self-targeted row that the Java/runtime and JSON Schema reject.

This is a material contract-parity residual; historical R025 PASS remains scoped to its exact historical bytes and cannot be treated as proof of full Java/schema/database parity.

## 3. Dependency-current first overlay

A dependency-current SMR021 overlay was assembled on exact SMR020 subject:

`89066e5662554b1810691473e0ed9bf49d8cc2fd4964444043b878461ed75477`

Before additional repair, its source/test exact subject was independently computed as:

`ca2c9348040936a7b11d5367d16aed1251abc3e92dd5ec7b62326ff5c1f7aef8`

That overlay correctly added a new PostgreSQL semantic store with:

`target_authority <> 'USER-EXPERIENCE-001'`

and therefore closes the historical database self-authority residual.

It is **not** a closable candidate because the following deeper admission defect was reproduced before sealing.

## 4. Admission/work binding bypass reproduced

`ExperienceAdmission.bind(...)` in subject `ca2c9348...`:

- verifies a currently usable PLATFORM-003 session;
- verifies a ROUTED PLATFORM-006 decision selecting a QUALIFIED descriptor whose caller allowlist permits USER-EXPERIENCE-001;
- accepts `admittedActions` as a free method argument;
- does not bind the route's `workId` into `ExperienceAdmission`.

`UserExperienceService.submit(...)` then validates principal, session, action membership, admission evidence and authoritative work version, but it cannot compare the command work identity against the work identity in the PLATFORM-006 decision because that identity was discarded.

A fresh external adversarial probe against the compiled `ca2c9348...` tree constructed:

- a current session for principal `alice`;
- a ROUTED PLATFORM-006 decision for `work-A`;
- a QUALIFIED descriptor for unrelated capability `CAP-UNRELATED-QUALIFIED` that merely allowed caller `USER-EXPERIENCE-001`;
- freely injected `admittedActions = { APPROVE }`;
- an APPROVE interaction command for `work-B`.

The service accepted and recorded the command.

Observed output:

`ADMISSION_BYPASS_REPRODUCED work=work-B action=APPROVE routed_work=work-A routed_capability=CAP-UNRELATED-QUALIFIED`

This violates the SMR021 packet's own intent/admission law: the durable human command must bind the admitted action and authoritative work to the PLATFORM-006 admission evidence. A valid route for one work/capability cannot authorize arbitrary action-set injection for another work.

## 5. Required minimum repair

The dependency-current SMR021 candidate must, at minimum:

1. preserve the route `workId` in the admission projection and require exact command-work equality at submit time;
2. bind admitted actions to immutable selected-descriptor content whose digest is already bound by the PLATFORM-006 route decision, rather than accepting an unbound free action set;
3. retain session usability, caller authority, descriptor identity/digest, QUALIFIED standing and caller allowlist checks;
4. add adversarial regression coverage proving cross-work and unbound-action injection fail closed;
5. preserve USER-EXPERIENCE as intent/presentation only and never effect authority;
6. derive a new exact subject and rerun the complete applicable SMR021 portable gate.

`ca2c9348...` must not be sealed or promoted.

## 6. First incomplete phase

Next phase:

`UAF-S1-USEREXPERIENCE001-ADMISSION-BINDING-REPAIR-001`

Apply only the minimum admission/work/action binding repair on the dependency-current SMR020 lineage, re-run focused adversarial proof first, then complete strict Java + full executable regression + contract/PostgreSQL/R025 recurrence + coherence/congruence + exact-subject + release-manifest qualification before any local portable closure is claimed.
