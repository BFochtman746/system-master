# CORE Contracts & Versioning — Design Lock 001

Status: **DESIGN LOCKED — IMPLEMENTATION NOT YET CLAIMED**  
Predecessor: `CORE-CONTRACTS-VERSIONING-RECOVERY-INVENTORY-001`  
Owner base: `system-master/control-v2@044f6f809060b94226a7f546a55f2736bdf9c73f`

## Purpose

Freeze the current CORE Contracts & Versioning authority before implementation. This design reuses the useful F-WP-012 registry/migration/portability substrate while repairing the gaps identified by the fresh Foundation specification.

Version labels do not prove compatibility. A mutation may proceed only when the exact contract subject is known and its required compatibility standing is current, explicit and evidence-bound.

## Owner boundary

Contracts & Versioning owns:

- contract keys and immutable contract revisions;
- exact schema/protocol representation identity and digests;
- compatibility policy metadata and compatibility decisions;
- migration compatibility edges;
- contract lifecycle/deprecation/sunset/retirement metadata;
- explicit adopted/current version pointers;
- pre-mutation contract-binding receipts;
- registry revision/history and registration/adoption receipts.

Contracts & Versioning does not own:

- Book/Learning/Documents/Programming or other specialist semantics;
- user intent/Keel truth;
- Work/Plan/Job/Attempt truth;
- routing decisions;
- resource admission or placement;
- effect permission;
- provider or executor health;
- Evidence Authority claim standing.

A specialist owner defines the business meaning of its contract. Contracts & Versioning owns the shared version identity, structural/declared semantic compatibility record and exchange gating metadata.

## Canonical objects

### `ContractKeyV1`

Fields:

- `ownerSystemId`
- `contractKind`: `COMMAND | QUERY | API_REQUEST | API_RESPONSE | EVENT | STATE | RECEIPT`
- `contractName`

Canonical key digest:

`sha256("SM-CONTRACT-KEY-V1|" + ownerSystemId + "|" + contractKind + "|" + contractName)`

No wildcard contract keys are authoritative.

### `ContractVersionV1`

Fields:

- `major >= 1`
- `minor >= 0`
- `patch >= 0`

The version is an identifier and lifecycle coordinate. It is **not compatibility proof**.

### `SchemaDescriptorV1`

Fields:

- `schemaFormat`: e.g. `JSON_SCHEMA`, `PROTOBUF`, `AVRO`, `OPENAPI`, `CUSTOM`, `OPAQUE_BYTES`
- `schemaRef`
- `schemaByteDigest`
- `canonicalizationProfileId`
- `canonicalizationProfileDigest`
- `canonicalSchemaDigest`

Rules:

1. `schemaByteDigest` binds exact stored bytes.
2. `canonicalSchemaDigest` is present only when an admitted canonicalization adapter actually ran.
3. Unsupported/unknown canonicalization never invents equivalence; exact-byte identity remains usable as identity, while structural compatibility is `UNKNOWN` until adjudicated.
4. Schema bytes remain artifact/custody references where large; Contracts does not become a second Artifact Gateway.

### `ContractRevisionV1`

Immutable create-once record:

- `contractKey`
- `version`
- `schemaDescriptor`
- `ownerAuthorityRef`
- `registeredAt`
- `registrationEvidenceRefs[]`
- `revisionDigest`

`revisionDigest` covers all canonical fields. The tuple `(contractKey, version)` may never be rebound to changed bytes or changed schema identity.

### `CompatibilityPolicyV1`

Per contract key:

- `mode`: `EXACT_ONLY | BACKWARD | FORWARD | FULL | BACKWARD_TRANSITIVE | FORWARD_TRANSITIVE | FULL_TRANSITIVE`
- `formatRulesetRef`
- `formatRulesetDigest`
- `semanticRulesetRef`
- `semanticRulesetDigest`
- `policyRevision`

`NONE`/unchecked compatibility is not admitted for consequential mutation boundaries. A contract may be registered without a compatibility decision, but resolution then fails closed except for exact-revision use explicitly allowed by policy.

### `CompatibilityDecisionV1`

Immutable evidence-bound decision:

- `contractKey`
- `producerRevisionDigest`
- `consumerRevisionDigest`
- `direction`: `PRODUCER_TO_CONSUMER | CONSUMER_TO_PRODUCER | BIDIRECTIONAL`
- `scope`: `DIRECT | TRANSITIVE`
- `standing`: `COMPATIBLE | MIGRATION_REQUIRED | INCOMPATIBLE | UNKNOWN`
- `comparedRevisionDigests[]`
- `evaluatorId`
- `evaluatorVersion`
- `evaluatorDigest`
- `policyRevision`
- `evidenceRefs[]`
- `evaluatedAt`
- `decisionDigest`

Rules:

- `UNKNOWN` fails closed for mutation.
- `MIGRATION_REQUIRED` does not authorize mutation until the required migration path completes and produces a compatible target subject.
- transitive decisions bind the exact compared historical revision set; later retained-history changes invalidate/re-evaluate as policy requires.
- format-specific structural rules may prove only structural compatibility. Required owner semantic evidence remains separate and explicit.

### `MigrationEdgeV1`

Immutable edge:

- `contractKey`
- `sourceRevisionDigest`
- `targetRevisionDigest`
- `migrationId`
- `migrationArtifactRef`
- `migrationArtifactDigest`
- `migrationRulesetDigest`
- `idempotencyProfile`
- `preconditionDigest`
- `postconditionDigest`
- `evidenceRefs[]`
- `edgeDigest`

Rules:

- self edges are forbidden;
- active migration-edge graph must be acyclic;
- source and target must already be registered;
- migration cannot change the owning `ContractKey` silently;
- multiple valid migration paths are not guessed. Resolution requires one explicitly selected active path or returns `AMBIGUOUS_MIGRATION_PATH`;
- migration execution state remains in the appropriate migration/runtime/data owner; Contracts owns the compatibility path definition and receipts, not a shadow job engine.

### `ContractLifecycleV1`

Revisioned state:

- `standing`: `ACTIVE | DEPRECATED | SUNSET_PENDING | RETIRED | QUARANTINED`
- `successorRevisionDigest?`
- `deprecatedAt?`
- `sunsetNotBefore?`
- `reasonRef`
- `evidenceRefs[]`
- `lifecycleRevision`

Rules:

- `RETIRED` and `QUARANTINED` fail contract resolution for new mutation.
- retirement requires an external usage/reachability evidence input appropriate to the subject; telemetry alone cannot certify zero use.
- a successor must be registered and compatible/migratable under current policy.
- lifecycle transitions are explicit durable mutations; time alone does not silently retire a version.

### `ContractPointerV1`

An explicit adopted/current pointer per `ContractKey`:

- `contractKey`
- `adoptedRevisionDigest`
- `pointerRevision`
- `adoptionDecisionRef`
- `evidenceRefs[]`

The registry never infers current authority from the numerically highest version.

### `ContractBindingReceiptV1`

Pre-mutation resolution output:

- `contractKeyDigest`
- `requiredRole`: `EXACT | PRODUCER | CONSUMER`
- `requestedRevisionDigest`
- `resolvedRevisionDigest`
- `schemaByteDigest`
- `canonicalSchemaDigest?`
- `registryRevision`
- `pointerRevision`
- `compatibilityDecisionDigest?`
- `migrationPathDigest?`
- `lifecycleStanding`
- `resolvedAt`
- `expiresAt`
- `bindingDigest`

A binding receipt proves only that Contracts & Versioning resolved the requested exchange subject under its current registry. It does **not** grant effect permission, route eligibility, resource capacity, placement or business completion.

## Durable authority

Fresh implementation must expose one canonical durable registry journal/state adapter. The first portable implementation may be append-journal based, but must retain an adapter boundary for later canonical database binding.

Durable event set:

- `CONTRACT_REVISION_REGISTERED`
- `COMPATIBILITY_POLICY_SET`
- `COMPATIBILITY_DECISION_RECORDED`
- `MIGRATION_EDGE_REGISTERED`
- `MIGRATION_EDGE_RETIRED`
- `CONTRACT_LIFECYCLE_CHANGED`
- `CONTRACT_POINTER_ADVANCED`

Every event carries:

- monotonic registry sequence/revision;
- prior-record/hash or equivalent integrity linkage in the portable adapter;
- mutation command id;
- semantic request digest;
- actor/authority reference;
- exact result identity.

Replay must reconstruct identical authoritative state or fail `CORRUPT_STATE`. Partial/truncated records fail closed.

## Command contracts

- `RegisterContractRevision`
- `SetCompatibilityPolicy`
- `RecordCompatibilityDecision`
- `RegisterMigrationEdge`
- `RetireMigrationEdge`
- `ChangeContractLifecycle`
- `AdvanceContractPointer`

All mutation commands require:

- unique command id;
- expected registry revision or explicitly documented commutative exception;
- actor principal/authority reference;
- authority evidence references;
- semantic request digest;
- durable acknowledgment after authoritative append/commit.

Same command + same semantic request is idempotent. Same command + changed semantic request is `CONFLICT`. Stale expected registry revision is `STALE_BASE`.

## Query contracts

- `GetContractRevision`
- `GetContractPointer`
- `ListContractHistory`
- `ResolveCompatibility`
- `ResolveMigrationPath`
- `ResolveContractBinding`
- `GetLifecycleStanding`

Queries never mutate registry truth.

## Compatibility adjudication rules

1. Exact revision/digest equality is identity, not a need for a compatibility guess.
2. Same major version is **not automatically compatible**.
3. Direction is mandatory when versions differ.
4. Required transitive mode checks the retained version set required by policy, not only the immediately preceding revision.
5. Structural evaluators are format-specific. A Protobuf-compatible structural change is evaluated under a Protobuf ruleset; JSON/OpenAPI/custom contracts use their own admitted evaluator.
6. A format evaluator cannot certify specialist business semantics it does not own. Required semantic compatibility evidence is supplied by the owning system and bound into the decision.
7. Missing evaluator, stale ruleset, missing semantic evidence, disagreement or ambiguous result yields `UNKNOWN` and fails closed.
8. Compatibility decision evidence is invalidated by material change to either subject, evaluator/ruleset, policy revision or required comparison set.

## Research-derived constraints

- Backward, forward and full compatibility are distinct directions; their transitive forms cover materially different retained histories. The registry therefore persists direction and transitive scope rather than a single compatible flag.
- Wire formats can contain identity rules not representable by SemVer. Example: Protocol Buffers field numbers are wire identities and cannot be safely treated as freely changeable/reusable. Therefore schema-format evaluator identity is part of the decision evidence.

## Canonical Work Chain integration

Every consequential command/API/event crossing a logical owner boundary must be able to bind an exact `ContractBindingReceiptV1` before mutation. The receipt may be referenced by:

- Keel goal/revision commands;
- Work/Project commands;
- Plan/Step commands and events;
- Resource admission/grant exchanges;
- Route decision inputs;
- Placement assignment exchanges;
- Job/attempt commands/events;
- context/model/tool/specialist invocation contracts;
- effect preflight/commit contracts;
- artifact/evidence/recovery exchanges.

This is a reference seam only: Contracts does not become owner of those systems' records.

## Owner-boundary locks

- Routing reads contract standing but owns route eligibility/decision.
- Effect Authority reads exact contract standing but owns commit-time effect permission.
- Identity validates mutation actor authority; Contracts does not mint identity authority.
- Evidence Authority owns evidence/claim standing; Contracts stores references and exact decision subjects.
- Artifact Gateway owns schema/migration artifact custody where bytes are externalized.
- Canonical Data owns shared structured-state transaction/persistence primitives; Contracts owns contract semantics/version registry state.

## Error taxonomy

At minimum:

- `INVALID_CONTRACT_KEY`
- `UNKNOWN_CONTRACT`
- `UNKNOWN_CONTRACT_REVISION`
- `VERSION_IDENTITY_CONFLICT`
- `SCHEMA_DIGEST_MISMATCH`
- `CANONICALIZATION_UNAVAILABLE`
- `COMPATIBILITY_UNKNOWN`
- `INCOMPATIBLE_CONTRACT`
- `MIGRATION_REQUIRED`
- `NO_MIGRATION_PATH`
- `AMBIGUOUS_MIGRATION_PATH`
- `MIGRATION_GRAPH_CYCLE`
- `DEPRECATED_CONTRACT`
- `RETIRED_CONTRACT`
- `QUARANTINED_CONTRACT`
- `STALE_BASE`
- `CONFLICT`
- `DENIED`
- `CORRUPT_STATE`
- `BLOCKED_DEPENDENCY`

Only explicitly classified transient transport/storage failures are retry candidates. Semantic conflicts, incompatibility, stale authority, corruption and invalid schemas are not retried blindly.

## Frozen isolated qualification denominator — 48 cases

### Identity / registration — 10

1. valid stable contract key;
2. invalid/blank/wildcard key rejected;
3. exact revision register succeeds;
4. exact semantic registration replay is idempotent;
5. same command changed payload conflicts;
6. same key/version changed schema conflicts;
7. schema-byte digest mismatch rejected;
8. unsupported canonicalizer does not fabricate canonical digest;
9. stale registry revision rejected;
10. explicit adopted pointer is not inferred from max version.

### Compatibility — 12

11. exact revision resolves;
12. backward compatible decision resolves in required direction;
13. forward-only decision does not satisfy backward request;
14. full decision satisfies both directions;
15. backward-transitive binds all required retained revisions;
16. missing transitive comparison yields UNKNOWN;
17. same-major without decision does not become compatible;
18. evaluator version/digest change invalidates old decision;
19. schema subject digest change invalidates old decision;
20. missing semantic evidence yields UNKNOWN when policy requires it;
21. evaluator disagreement yields UNKNOWN;
22. incompatible decision blocks binding before mutation.

### Migration — 8

23. explicit source->target edge registers;
24. missing source/target revision rejected;
25. self edge rejected;
26. cycle introduction rejected;
27. unique migration path resolves;
28. no path is explicit;
29. multiple active paths return ambiguity rather than guess;
30. migrated target still requires compatibility/lifecycle validation.

### Lifecycle / pointer — 7

31. deprecation is explicit and revisioned;
32. deprecation alone does not silently retire;
33. sunset-before constraint validated;
34. retirement blocked without required reachability evidence;
35. retired revision fails new mutation binding;
36. quarantined revision fails closed;
37. stale pointer advancement rejected.

### Durability / concurrency — 6

38. restart replay reconstructs identical registry state;
39. truncated journal fails corrupt;
40. altered hash/record fails corrupt;
41. duplicate version under competing command cannot rebind identity;
42. stale concurrent pointer writer loses authority;
43. acknowledged portable mutation is present after reopen/replay.

### Boundary / integration — 5

44. binding receipt contains no Effect Authority commit permission;
45. binding receipt contains no routing/placement/resource grant authority;
46. specialist contract key preserves specialist owner rather than transferring business semantics to CORE;
47. Work Chain reference round-trip preserves exact revision/digest without creating shadow Work truth;
48. secret/token/private-key payload is absent from ordinary registry/evidence fields.

**Frozen denominator: 48 / 48.**

## Cumulative regression requirement

A build may not freeze unless the exact candidate also reruns, at minimum:

- System Root hosted portable qualification;
- Identity O-WP-001 qualification + performance calibration;
- Identity O-WP-002 qualification + evidence-authority cases;
- Identity Delegation 36-case isolated denominator + its frozen calibration;
- Contracts 48-case isolated denominator;
- any current F-WP-012 compatibility/portability regression harness retained for historical-substrate equivalence where applicable.

A-01/native/production tests remain separate evidence classes and are not prerequisites to claim hosted-portable standing unless the specific build obligation explicitly requires them.

## Build order

1. durable contract records + registry journal/state adapter;
2. idempotent registration and explicit pointer mutation;
3. compatibility policy/decision records and evaluator adapter seam;
4. migration-edge graph and deterministic fail-closed resolution;
5. lifecycle/deprecation/retirement state;
6. contract-binding receipt query;
7. F-WP-012 migration/portability substrate rebind;
8. 48-case isolated qualification;
9. cumulative Foundation regression/calibration;
10. freeze exact evidence and only then bind the next Foundation boundary.

## Exact next operation

`CORE-CONTRACTS-VERSIONING-BUILD-001 — DURABLE REGISTRY + COMPATIBILITY/MIGRATION/LIFECYCLE AUTHORITY + 48-CASE ISOLATED QUALIFICATION + CUMULATIVE FOUNDATION REGRESSION`

No implementation, A-01, native or production standing is asserted by this design lock.
