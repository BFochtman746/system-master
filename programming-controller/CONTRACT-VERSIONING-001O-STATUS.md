# PROGRAMMING-FOUNDATION-001O / CONTRACT-VERSIONING-001

This is a stacked external Programming-controller implementation branch on the exact portable-qualified `001N / IDENTITY-SEMANTICS-001` head `e503f43883b39d7eeb6e5ecc6d6a7f24076555cf`.

It is not System Master iPhone runtime code and it does not replace the shared A-01 control plane.

## Current candidate slices

### `IMPL-001O-01`

- canonical contract-family and contract-version identities are delegated to the 001N identity port rather than derived from names or version labels;
- contract surfaces are typed explicitly (`COMMAND`, `QUERY`, `EVENT`, `HTTP`, `FILE`, `SCHEMA`);
- `VersionSchemeRegistry` provides deterministic registered parser/order semantics, including SemVer 2.0.0 and integer profiles plus explicit custom profiles;
- contract drafts bind exact base version/family revision and use optimistic `draft_revision` compare-and-set;
- published versions are deeply immutable;
- effectful publication is idempotent by `command_id`, and semantic reuse of a command ID for a different request fails closed;
- family + scheme + label is unique and cannot overwrite a published version;
- a family advance after draft creation makes the draft stale rather than silently rebasing it.

### `IMPL-001O-02`

- every admitted artifact receives an exact SHA-256 raw digest before canonicalization is attempted;
- deterministic canonicalization is profile/version bound and never destroys the raw digest when canonicalization fails;
- the current portable canonicalization adapter is explicitly `JSON / GENERIC_JSON / canon:json-sorted-v1`; it is not represented as a universal JSON standard;
- format/dialect/profile mismatch fails the canonical claim while retaining raw-integrity evidence;
- raw and canonical corruption checks fail closed with `DIGEST_MISMATCH`;
- normalized diff is bound to exact source/target version IDs plus exact canonicalization profile/version and never emits a compatibility verdict;
- incomplete canonicalization or profile drift produces `DIFF_INCOMPLETE`, never a false no-change result;
- an injected secret-scanner policy can reject sensitive artifacts without echoing secret values into the error path;
- when an artifact resolver is bound, published `ContractVersion` records carry raw/canonical digest plus exact canonicalization profile provenance.

## Authority boundary

These slices deliberately use in-memory candidate registries with standing `PORTABLE_IN_MEMORY_CANDIDATE__001P_NOT_BOUND`. Physical persistence and transactional data governance remain 001P responsibilities. Durable identity remains 001N. Authorization/trust remains 001Q. Generic consistency/idempotency primitives remain 001R. Evidence infrastructure remains 001S. Canonicalization/diff produces structure and integrity facts only; compatibility verdicts belong to later 001O compatibility-policy/evaluator work.

## Qualification

Targeted realistic-layout local qualification through `IMPL-001O-02`: **20/20 tests PASS**.

Do not claim hosted qualification until the exact stacked PR head passes the repository Programming Controller Portable Qualification workflow. Do not claim target/provider qualification from portable evidence.

## Next slice

`IMPL-001O-03` — compatibility policy/evaluation engine plus qualified format-adapter framework, preserving native format semantics and explicit UNKNOWN/conflict/cache-invalidation behavior.
