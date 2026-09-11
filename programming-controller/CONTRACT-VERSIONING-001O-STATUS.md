# PROGRAMMING-FOUNDATION-001O / CONTRACT-VERSIONING-001

This is a stacked external Programming-controller implementation branch on the exact portable-qualified `001N / IDENTITY-SEMANTICS-001` head `e503f43883b39d7eeb6e5ecc6d6a7f24076555cf`.

It is not System Master iPhone runtime code and it does not replace the shared A-01 control plane.

## Current candidate slice

`IMPL-001O-01` is implemented as a portable/controller-contract candidate:

- canonical contract-family and contract-version identities are delegated to the 001N identity port rather than derived from names or version labels;
- contract surfaces are typed explicitly (`COMMAND`, `QUERY`, `EVENT`, `HTTP`, `FILE`, `SCHEMA`);
- `VersionSchemeRegistry` provides deterministic registered parser/order semantics, including SemVer 2.0.0 and integer profiles plus explicit custom profiles;
- contract drafts bind exact base version/family revision and use optimistic `draft_revision` compare-and-set;
- published versions are deeply immutable;
- effectful publication is idempotent by `command_id`, and semantic reuse of a command ID for a different request fails closed;
- family + scheme + label is unique and cannot overwrite a published version;
- a family advance after draft creation makes the draft stale rather than silently rebasing it.

## Authority boundary

This slice deliberately uses an in-memory candidate registry with standing `PORTABLE_IN_MEMORY_CANDIDATE__001P_NOT_BOUND`. Physical persistence and transactional data governance remain 001P responsibilities. Durable identity remains 001N. Authorization/trust remains 001Q. Generic consistency/idempotency primitives remain 001R. Evidence infrastructure remains 001S.

## Qualification

Targeted local qualification before branch publication: 12/12 tests PASS.

Do not claim hosted qualification until the exact stacked PR head passes the repository Programming Controller Portable Qualification workflow. Do not claim target/provider qualification from portable evidence.

## Next slice

`IMPL-001O-02` — artifact canonicalization, exact raw/canonical digesting, normalized contract diff, and corruption detection without making compatibility verdicts.
