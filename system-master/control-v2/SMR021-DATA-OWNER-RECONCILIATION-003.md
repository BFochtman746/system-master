# SMR021 Closure-003 DATA-001 Reconciliation 003

Date: 2026-09-11
Owner lane: `DATA-001`
Consumer: `USER-EXPERIENCE-001`
Control parent: `d88a5952e93b5bae4ce96e4017f334aeb8abaa00`
Standing: **DATA OWNER PORTABLE CONTRACT ACCEPTED / LIVE POSTGRESQL + GITHUB-NATIVE RUNNABLE SOURCE CUSTODY + HOSTED EXACT-SHA QUALIFICATION OPEN**

## Authority disposition

DATA-001 accepts the SMR021 durable-admission persistence contract at the portable/static boundary. Candidate 002 was not accepted as-is because it created parallel command/attention tables and declared current-admission state without implementing authoritative current-selection mutation. Reconciliation 003 removes those defects.

R025 canonical persistence remains singular:

- command authority: `core_user_interaction_command`;
- attention authority: `core_attention_item`.

SMR021 adds only immutable `user_experience001_admission` evidence, `user_experience001_current_admission` current-selector state, and bounded columns/constraints on the existing R025 command table.

Historical R025 `admission_ref` remains preserved route/admission evidence. New `admission_record_id` is the resolvable immutable admission identity. Existing R025 `RECORDED_INTENT` rows lacking that identity migrate fail-closed to `MIGRATED_UNQUALIFIED`; no authority is synthesized.

Current-admission arbitration is monotonic by admitted work version. Same-version/same-admission replay converges; higher version advances; stale or same-version/different-admission loses. A valid losing admission remains immutable evidence while the current selector and command ledger are not changed by the loser.

Down migration is fail-closed once migrated or SMR021-linked command evidence exists, preventing provenance loss.

## Exact local candidate identity

- capsule: `SMR021_DATA001_PORTABLE_ACCEPTED_SOURCE_TEST_CANDIDATE_003.zip`
- capsule SHA-256: `734f06a101ac906d7cba088fbf970eadb820e6660544b372f4a873e4add909f3`
- source/test manifest SHA-256: `077ea181f1acf90687b25ebebf1e2eba3ba9e5810ab8dad18a419600930c5d16`
- reconciliation patch SHA-256: `4a2128b9ea9c39d6ddb224e827f9f7c886e14b29b93a5894bf6debc0a677ade8`
- source/test files: `445`
- main + portable-test Java files: `434`
- hosted PostgreSQL Java tests: `1`

These digests identify local evidence only until the exact runnable candidate is reconstructed from GitHub-native custody and verified again. This control record is not source custody by itself.

## Portable qualification

- strict Java 21 `--release 21 -Xlint:all -Werror`: PASS;
- inherited/current portable suites plus migration parity: **23/23 PASS**;
- DATA-001 persistence acceptance: **173 checks PASS**;
- migration artifact parity: **28 checks PASS**;
- SMR021 admission binding: **33 checks PASS**;
- hosted PostgreSQL integration test source strict compile: PASS;
- exact fresh capsule extraction manifest: PASS;
- exact fresh capsule strict compile: PASS;
- exact fresh capsule portable suites: **23/23 PASS**;
- TODO/FIXME/HACK scan: none;
- UI-framework ownership scan: none;
- `USER-EXPERIENCE-001` execute-effect boundary remains deny-only.

## Evidence fence

No live PostgreSQL migration/apply/rollback/reapply result is claimed. The local execution environment had no PostgreSQL server/client and no Docker/Podman runtime. No GitHub-native runnable source custody, hosted exact-SHA PASS, A-01 PASS, native/device/accessibility/usability evidence, human/private approval evidence, release promotion, publication, or production authority is claimed.

The separate UI coordinator remains outside this persistence/controller authority. It consumes projections/intents; it does not own DATA persistence, admission authority, or effect execution.

## Exact successor

1. Establish GitHub-native reconstructible custody for exact candidate 003 and bind the manifest/capsule digests.
2. Execute hosted PostgreSQL qualification on that exact subject: R025 prerequisite verification, legacy fail-closed migration, round-trip/replay, divergent idempotency, current-admission races, monotonic versioning, corruption rejection, attention dedupe/CAS, authority constraints, and safe apply/rollback/reapply behavior.
3. Rebind release/current-authority manifests and run hosted exact-SHA portable qualification.
4. Keep A-01/native/production as later independent evidence gates.

Closure-003 remains open until the remaining evidence gates above are satisfied.