# PROGRAMMING-FOUNDATION-001O / CONTRACT-VERSIONING-001

This is a stacked external Programming-controller implementation branch on the exact portable-qualified `001N / IDENTITY-SEMANTICS-001` head `e503f43883b39d7eeb6e5ecc6d6a7f24076555cf`.

It is not System Master iPhone runtime code and it does not replace the shared A-01 control plane.

## Current candidate slices

### `IMPL-001O-01` — candidate implemented

- canonical contract-family and contract-version identities are delegated to the 001N identity port rather than derived from names or version labels;
- contract surfaces are typed explicitly (`COMMAND`, `QUERY`, `EVENT`, `HTTP`, `FILE`, `SCHEMA`);
- `VersionSchemeRegistry` provides deterministic registered parser/order semantics, including SemVer 2.0.0 and integer profiles plus explicit custom profiles;
- contract drafts bind exact base version/family revision and use optimistic `draft_revision` compare-and-set;
- published versions are deeply immutable;
- effectful publication is idempotent by `command_id`, and semantic reuse of a command ID for a different request fails closed;
- family + scheme + label is unique and cannot overwrite a published version;
- a family advance after draft creation makes the draft stale rather than silently rebasing it.

### `IMPL-001O-02` — candidate implemented

- every admitted artifact receives an exact SHA-256 raw digest before canonicalization is attempted;
- deterministic canonicalization is profile/version bound and never destroys the raw digest when canonicalization fails;
- the current portable canonicalization adapter is explicitly `JSON / GENERIC_JSON / canon:json-sorted-v1`; it is not represented as a universal JSON standard;
- format/dialect/profile mismatch fails the canonical claim while retaining raw-integrity evidence;
- raw and canonical corruption checks fail closed with `DIGEST_MISMATCH`;
- normalized diff is bound to exact source/target version IDs plus exact canonicalization profile/version and never emits a compatibility verdict;
- incomplete canonicalization or profile drift produces `DIFF_INCOMPLETE`, never a false no-change result;
- an injected secret-scanner policy can reject sensitive artifacts without echoing secret values into the error path;
- when an artifact resolver is bound, published `ContractVersion` records carry raw/canonical digest plus exact canonicalization profile provenance.

### `IMPL-001O-03` — framework core implemented; native provider adapters pending

- compatibility policy identity is immutable and includes explicit direction, baseline scope, six independent compatibility axes, policy version and policy digest;
- every assessment binds exact source/target version IDs and exact content digests;
- `TRANSITIVE` policy requires explicit historical baseline IDs rather than silently comparing latest-only;
- axis outcomes preserve `COMPATIBLE / INCOMPATIBLE / CONDITIONAL / UNKNOWN / FAILED / NOT_APPLICABLE`; required UNKNOWN/FAILED evidence can never aggregate to compatible;
- schema/wire compatibility cannot hide ERROR or AUTHORIZATION/SECURITY breakage;
- `FormatAdapterProfile` records exact tool/version, adapter version, dialects, supported axes, execution boundary and qualification standing;
- native adapter outputs/evidence are retained separately from normalized `CompatibilityFinding` records;
- material adapter disagreement becomes explicit `COMPATIBILITY_CONFLICT / UNKNOWN`, not a false pass;
- exact-key cache identity includes source/target digests, exact policy version/digest, exact adapter/tool versions, consumer profile, environment assumptions and transitive baseline IDs;
- compatibility work has an explicit adapter-invocation budget and fails bounded with `RESOURCE_LIMIT_EXCEEDED` rather than truncating.

Real Protobuf, Avro, JSON Schema and OpenAPI provider adapters are deliberately **not yet claimed**. Their exact tool/library versions and native semantics must be selected and qualified through the 001X execution boundary before `IMPL-001O-03` can be called complete.

## Authority boundary

These slices deliberately use in-memory candidate registries with standing `PORTABLE_IN_MEMORY_CANDIDATE__001P_NOT_BOUND`. Physical persistence and transactional data governance remain 001P responsibilities. Durable identity remains 001N. Authorization/trust remains 001Q. Generic consistency/idempotency primitives remain 001R. Evidence infrastructure remains 001S. Canonicalization/diff produces structure and integrity facts only; compatibility policy/evaluation owns compatibility verdicts but executable native adapter tools remain 001X-mediated providers.

## Qualification

Targeted realistic-layout local qualification through the 001O-03 framework core: **31/31 tests PASS**.

Hosted qualification must bind the exact current PR head before any `PORTABLE_HOSTED_QUALIFIED` claim. Native-format provider qualification and target/provider evidence remain separate.

## Next operation

Select and bind exact native-format provider adapters for Protobuf, Avro, JSON Schema and OpenAPI through 001X; run differential/native compatibility fixtures; then close residual `IMPL-001O-03` before advancing to `IMPL-001O-04` consumer bindings and impact analysis.
