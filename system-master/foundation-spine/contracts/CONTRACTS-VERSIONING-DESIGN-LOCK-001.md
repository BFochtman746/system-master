# CORE Contracts & Versioning Design Lock 001

## Standing

`CORE-CONTRACTS-VERSIONING-DESIGN-LOCK-001` freezes the fresh Foundation/Spine contract/version authority boundary before implementation. It reuses F-WP-012 where sound, repairs identified defects, and does not transfer historical qualification to new bytes.

## 1. Canonical authority model

### `ContractSubjectV1`

Immutable fields:

- `subjectId` — globally unique qualified identifier;
- `kind` — `COMMAND | QUERY | EVENT | API | RECEIPT | STATE_SCHEMA | PROTOCOL`;
- `semanticOwnerSystemId` — owner reference only; Contracts does not acquire that semantic authority;
- `schemaFormat` — explicit format identifier;
- `versionScheme` — explicit scheme identifier;
- `createdAt` — evidence metadata, never compatibility authority.

A subject is create-once. Reusing `subjectId` with different immutable fields is `SUBJECT_IDENTITY_CONFLICT`.

### `ContractVersionV1`

Immutable fields:

- `subjectId`;
- `version` — normalized semantic version tuple `major.minor.patch` for the initial implementation;
- `schemaDigest` — SHA-256 of canonical schema/protocol bytes;
- `canonicalizationId` — exact canonicalizer name/version;
- `schemaArtifactRef` — opaque content-addressed reference;
- `introducedRegistryRevision`.

Version numbers communicate release intent only. **They never prove compatibility.** Once admitted, the bytes/digest for one version are immutable.

### `CompatibilityPolicyV1`

Per subject, revisioned separately from contract bytes:

- `policyId` / `policyRevision`;
- `mode` — `BACKWARD | FORWARD | FULL`;
- `scope` — `LATEST | TRANSITIVE`;
- `validatorId` / `validatorVersion`;
- optional format-specific bounded configuration digest.

`NONE` is intentionally not an admitted production mode for mutation-bearing System Master contracts. A development/test adapter may expose `NO_CHECK` only under an explicitly non-authoritative test profile and cannot emit a mutation-admission PASS.

### `CompatibilityDecisionReceiptV1`

Immutable receipt binds:

- exact subject;
- producer/requested version and schema digest;
- consumer/current/reference version and schema digest;
- exact policy id/revision;
- exact validator id/version;
- direction and transitivity evaluated;
- decision `COMPATIBLE | MIGRATION_REQUIRED | INCOMPATIBLE | UNKNOWN | VALIDATOR_ERROR`;
- ordered reason codes;
- deterministic decision digest.

`UNKNOWN` and `VALIDATOR_ERROR` fail closed for mutation.

### `MigrationEdgeV1`

Create-once immutable edge:

- `subjectId`;
- exact `fromVersion + fromSchemaDigest`;
- exact `toVersion + toSchemaDigest`;
- `migrationId`;
- `migrationArtifactDigest`;
- `migrationContractVersion`;
- `reversibilityStanding`;
- optional prerequisite refs.

Migration availability is edge-specific. A target version does not implicitly declare how every predecessor migrates to it.

### `ContractLifecycleV1`

Revisioned standing separate from immutable version bytes:

- `ACTIVE | DEPRECATED | SUNSET`;
- effective revision/time evidence;
- replacement subject/version ref when applicable;
- bounded reason codes.

Deprecation does not imply incompatibility. Sunset does not erase historical versions/evidence.

## 2. Durable registry authority

The initial portable reference implementation uses an append-only, hash-chained registry journal. Every canonical mutation carries:

- monotonic `registryRevision`;
- `commandId`;
- deterministic `requestHash`;
- prior event hash + event hash;
- canonical event payload.

Rules:

1. Validate the complete request and all referenced current state **before append**. A rejected request leaves no canonical mutation.
2. Same `commandId + requestHash` replays the prior semantic result.
3. Same `commandId` with different request hash fails `COMMAND_REPLAY_CONFLICT`.
4. Acknowledgment follows append + `force(true)` in the portable reference adapter.
5. Replay reconstructs state; mutable caches are projections only.
6. Corrupt/truncated/hash-invalid replay fails closed.
7. Portable single-host writes use explicit single-writer exclusion. Distributed/network-filesystem writer safety is not claimed by this adapter.
8. Registry fields are identifiers/digests/opaque refs only; bearer credentials, secret bytes and private keys are forbidden.

Production database durability and native power-loss semantics remain later environment-specific qualification boundaries.

## 3. Registration and compatibility semantics

Registration is a two-phase semantic operation inside one service call: **prepare/validate with no mutation**, then durable append. Specifically:

- unknown semantic owner reference -> reject;
- invalid version/canonicalization/schema digest -> reject;
- same subject+version with same digest -> idempotent semantic result;
- same subject+version with different digest -> identity conflict;
- policy/validator unavailable for required evolution decision -> fail closed;
- compatibility is checked under the subject's exact current policy before the new version can become ACTIVE;
- breaking version intent without a required migration edge is rejected when policy/owner rules require migration;
- version arithmetic alone never yields COMPATIBLE.

Compatibility checking is deterministic over immutable inputs and does not perform network I/O inside the journal append critical section. Any external validator material must be resolved and bound before the canonical mutation is attempted.

## 4. Pre-mutation contract gate

`ResolveContractForMutation` is the authoritative structural/version gate consumed by Foundation mutation boundaries. Its receipt binds:

- caller-requested subject/version/digest;
- current admitted subject/version/digest;
- lifecycle standing;
- compatibility receipt ref/digest when versions differ;
- migration requirement/edge ref when applicable;
- registry revision observed;
- final structural standing `ADMITTED | MIGRATION_REQUIRED | REJECTED`.

This receipt proves only contract/version standing. It **cannot** grant principal authority, Keel ceiling, resource grant, route/placement standing, runtime lease/fence, Effect Authority, or peer business permission.

Callers must re-read/revalidate current contract state at their mutation boundary when registry revision/lifecycle policy is materially relevant; a stale receipt is not timeless authority.

## 5. Legacy and migration boundary

F-WP-012 crosswalk and migration mechanics are retained conceptually with these repairs:

- legacy bindings carry explicit current owner refs instead of historical `021F` as authority;
- ambiguous/unmapped/stale-owner mappings remain quarantined;
- checkpoint identity binds input-set digest + migration-edge digest + migration implementation version;
- checkpoints/results become durable adapter state, not caller-trusted progress assertions;
- content digest conflicts halt;
- reconciliation reports are immutable evidence, not canonical business-state truth.

## 6. Portability allocation

Contracts & Versioning owns exportable **contract identity/version/digest/lifecycle/compatibility references**. Canonical change-history export and release orchestration remain Change/Migration/Release governance responsibilities. The F-WP-012 `PortabilityService` is therefore preserved as donor evidence but is not imported wholesale into this owner.

## 7. Compatibility research decisions

The design intentionally separates version numbering from compatibility. Semantic Versioning requires released public API versions to remain immutable and uses version increments to communicate change intent. Schema evolution practice distinguishes backward, forward, full and transitive compatibility. The fresh authority therefore records both exact version identity and explicit validator-backed compatibility policy. No external schema-registry product becomes canonical System Master authority.

## 8. Error taxonomy

Bounded reasoned failures:

- `UNKNOWN_SUBJECT`
- `UNKNOWN_VERSION`
- `SUBJECT_IDENTITY_CONFLICT`
- `VERSION_IDENTITY_CONFLICT`
- `INVALID_SCHEMA_DIGEST`
- `UNKNOWN_CANONICALIZATION`
- `SEMANTIC_OWNER_UNKNOWN`
- `COMPATIBILITY_POLICY_MISSING`
- `VALIDATOR_UNAVAILABLE`
- `VALIDATOR_ERROR`
- `INCOMPATIBLE_EVOLUTION`
- `MIGRATION_EDGE_REQUIRED`
- `MIGRATION_EDGE_CONFLICT`
- `COMMAND_REPLAY_CONFLICT`
- `REGISTRY_REVISION_CONFLICT`
- `REGISTRY_CORRUPT`
- `CONTRACT_DEPRECATED`
- `CONTRACT_SUNSET`
- `STALE_CONTRACT_RECEIPT`

Failures never silently downgrade to compatibility.

## 9. Isolated qualification denominator — 48 cases

Freeze before build: **48 isolated adversarial cases**.

### Registration / identity — 10

1. create subject;
2. exact subject replay;
3. conflicting subject replay;
4. create version;
5. exact version replay;
6. same version different digest conflict;
7. invalid digest rejects without mutation;
8. unknown semantic owner rejects without mutation;
9. unknown canonicalizer rejects without mutation;
10. rejected major/migration request leaves registry revision/state unchanged.

### Compatibility / gate — 14

11. explicit backward compatible evolution;
12. backward incompatible evolution;
13. forward compatible evolution;
14. forward incompatible evolution;
15. full compatible evolution;
16. full failure on one direction;
17. latest-only evaluation;
18. transitive evaluation detects older incompatibility;
19. same-major incompatible schema is rejected;
20. different-major validator-compatible schema does not become mutation-admitted when required migration policy says migration;
21. validator unavailable -> fail closed;
22. validator error -> fail closed;
23. exact decision receipt digest reproducible;
24. mutation gate cannot emit authorization/effect/placement/runtime authority.

### Migration / lifecycle / legacy — 8

25. exact migration edge creation;
26. conflicting edge digest rejected;
27. wrong from digest rejected;
28. migration checkpoint input/edge digest mismatch rejected;
29. ambiguous legacy map quarantined;
30. stale/unknown semantic owner legacy map quarantined;
31. deprecated remains resolvable with explicit standing;
32. sunset blocks new mutation admission without deleting history.

### Journal / idempotency / replay / concurrency — 10

33. append + replay reconstructs exact state;
34. command replay returns same result;
35. command id changed payload conflicts;
36. corrupt event fails replay;
37. truncated event fails replay;
38. hash-chain break fails replay;
39. force-before-ack path exercised;
40. concurrent same-version writers converge to one identity;
41. concurrent conflicting-version bytes yield one canonical winner + conflict;
42. stale registry revision mutation fails without append.

### Ownership / secrets / exact-subject evidence — 6

43. secret-like field cannot enter canonical registry payload;
44. Contracts cannot change peer semantic owner business state;
45. Contracts cannot grant principal/delegation authority;
46. Contracts cannot grant resource/route/placement/runtime/effect authority;
47. changed schema digest invalidates prior exact-subject compatibility receipt;
48. historical F-WP-012 qualification is preserved as provenance but cannot satisfy fresh-subject PASS.

## 10. Cumulative qualification after isolated PASS

Before freeze of a build candidate, execute on the **same exact candidate SHA/tree**:

- all 48 Contracts & Versioning isolated cases;
- current System Root qualification;
- O-WP-001 identity qualification;
- O-WP-002 identity proofing qualification;
- current Identity Delegation 36-case qualification;
- F-WP-012 47-case donor regression, proving the reused historical behavior has not been silently broken where still intentionally preserved.

Calibration/performance thresholds, if added, must be frozen before execution. A-01/native/production execution is a separate evidence class and cannot be inferred from hosted portable PASS.

## 11. Build packet

Dependency-valid successor after this lock:

`CORE-CONTRACTS-VERSIONING-BUILD-001 — DURABLE CONTRACT SUBJECT/VERSION REGISTRY + EXPLICIT COMPATIBILITY POLICY/RECEIPT + MIGRATION/LIFECYCLE + PRE-MUTATION GATE + 48-CASE ISOLATED QUALIFICATION + CUMULATIVE FOUNDATION REGRESSION`.

Implementation must reuse F-WP-012 behavior where this lock marks it reusable and must not rewrite unrelated Foundation systems.
