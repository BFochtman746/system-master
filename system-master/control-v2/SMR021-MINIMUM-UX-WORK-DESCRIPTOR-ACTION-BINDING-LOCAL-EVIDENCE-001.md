# SMR021 Minimum UX Work/Descriptor/Action Binding — Local Evidence 001

Date: 2026-09-10
Owner lane: `SYSTEM_MASTER/CORE`
Objective: `SMR021-MINIMUM-UX-WORK-DESCRIPTOR-ACTION-BINDING-IMPLEMENTATION-002`
Standing: **BOUNDED LOCAL IMPLEMENTATION PASS / FULL RELEASE CLOSURE NOT CLAIMED / NO PASS TRANSFER**

## Exact lineage

- Exact predecessor source/test SHA-256: `e22ecedfd3850be6b744ee82f2c02722cd3d203a5785f6f423ac395011cf821f`
- Exact candidate source/test SHA-256: `fe325804bacfd5c40339a18bc393fb1bdfb2191c8b0f3946219d7d81f1971596`
- Source/test patch SHA-256: `77bb53bfef9a8ff3a49357736ed4aef2c908dda47c9aa7001946fe98a33a90a0`
- Candidate source/test capsule SHA-256: `377afa2c9ff2c7c69e5cd5bc45c66dd95ceb2315c1787afc35df6d907165fca1`

The predecessor was re-measured from the preserved runnable SMR020 Library object before mutation and matched the governing `e22...` identity. The derivative does not reuse the historical R025 USER-EXPERIENCE PASS.

## Implemented bounded delta

The derivative adds a current-package `org.systemmaster.rebuild.experience` projection of the historical USER-EXPERIENCE intent-recording semantics and closes the defect identified in the donor map:

- admission is immutable and can only be created from a `ROUTED` PLATFORM-006 `CapabilityRequirement` + `CapabilityRouteDecision` + exact selected `CapabilityDescriptor`;
- exact `workId`, capability identity, requirement digest, selected descriptor identity/digest, route-decision digest, caller, effect and required-authority bindings are checked before an admission projection exists;
- the UX action is mapped to the admitted PLATFORM-006 effect rather than accepted from a caller-supplied action set;
- USER-EXPERIENCE remains unable to mint caller/effect authority;
- submit-time work/principal/session/action/evidence/work-version checks fail closed before persistence;
- USER-EXPERIENCE cannot target itself as effect authority;
- approval/control intents retain the existing `approvalRef` requirement;
- `executeEffect(...)` remains impossible.

## Executed evidence

Strict Java 21 compilation of the full current source/test tree plus the bounded derivative: **PASS**.

All executable Java suites discovered under `12_TESTS` were rerun from the candidate root: **21/21 PASS**. This includes all 20 preserved SMR020 suites plus the new USER-EXPERIENCE admission-binding suite.

The new focused suite produced:

`USER-EXPERIENCE-001 SMR021 ADMISSION BINDING PASS checks=28 writes=1`

The single write is the one deliberately admitted positive case. All tested authorization failures left command persistence unchanged.

The required adversarial gate is covered:

1. exact admitted `work-A` + command `work-A` records intent;
2. admitted `work-A` + command `work-B` fails;
3. injected action absent from the admitted action/effect projection fails;
4. descriptor digest substitution fails;
5. requirement/route digest substitution fails;
6. selected descriptor identity substitution fails;
7. principal mismatch fails;
8. session mismatch fails;
9. admission evidence substitution fails;
10. stale work version fails;
11. caller context not admitted by PLATFORM-006 cannot be promoted by USER-EXPERIENCE;
12. USER-EXPERIENCE self-effect target fails;
13. approval intent without `approvalRef` fails;
14. failed submit authorization leaves persistence unchanged;
15. `executeEffect` remains impossible and fabricates no effect receipt.

Additional focused checks reject `PENDING` descriptor qualification, reject missing descriptor authority grants, and prove `INSPECT` maps only to `READ_ONLY`.

## Durable custody

Preserved in Library `/System Assurance`:

- `SMR021_MINIMUM_UX_ADMISSION_BINDING_SOURCE_TEST_CANDIDATE_001.zip`
- `SMR021-MINIMUM-UX-WORK-DESCRIPTOR-ACTION-BINDING-IMPLEMENTATION-002.patch`
- `SMR021-MINIMUM-UX-WORK-DESCRIPTOR-ACTION-BINDING-LOCAL-EVIDENCE-001.json`
- `SMR021-MINIMUM-UX-ADMISSION-BINDING-SUITES-001.txt`

## Boundaries intentionally left open

This is **not** full SMR021 release closure. The following remain unclaimed and must not be inferred from the local result:

- DATA-owned durable persistence/migration for the new immutable admission fields;
- regenerated full release manifest/current-authority records for a new packet;
- complete static/release/coherence qualification of that full release candidate;
- GitHub-native exact-SHA runnable-source custody/hosted qualification;
- A-01 PASS;
- Apple/native, physical accessibility, usability, human approval, publication or production evidence.

A release-manifest verifier was intentionally not treated as a passing gate for this bounded source/test candidate because the sealed SMR020 release manifest cannot truthfully enumerate changed SMR021 files without a formal full-release reconstitution. No false release PASS is claimed.

## Exact successor

`SMR021-MINIMUM-UX-WORK-DESCRIPTOR-ACTION-BINDING-DATA-PERSISTENCE-AND-FULL-PORTABLE-CLOSURE-003`

Evidence target: reconcile the immutable admission fields with DATA-owned durable persistence/migration contracts, then generate a formal full SMR021 candidate with current release/current-authority metadata and execute fresh static/release/coherence qualification on that exact candidate. If bytes change, compute a new exact source/test SHA and do not transfer this local PASS. GitHub-native/A-01/native evidence remains separate.
