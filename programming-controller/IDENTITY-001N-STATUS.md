# PROGRAMMING-FOUNDATION-001N / IDENTITY-SEMANTICS-001

This is a stacked Programming-controller implementation branch on the exact qualified `WP-001M / SYSTEM-MODEL-001` candidate head `a231f6f7ea9fe47d7d58f4328cfd67a37c8933ec`.

It is external development-controller code. It is not System Master iPhone runtime code and it does not replace or take ownership of the shared A-01 control plane.

## Candidate implementation standing

All seven R5C implementation packages are present as portable/controller-contract candidates:

- `IMPL-001N-01` — canonical opaque ID types, RFC 9562 UUIDv7/v4 scheme profiles, allocator, CSPRNG boundary and bounded collision handling.
- `IMPL-001N-02` — namespaces, normalization profiles, aliases, locators and Unicode-security findings.
- `IMPL-001N-03` — exact typed resolution, external-identity bindings, reference validation and disposable revision-keyed cache semantics.
- `IMPL-001N-04` — evidence-bound correlation/adjudication, lifecycle, retirement/tombstones and explicit replacement/merge/split/derivation lineage.
- `IMPL-001N-05` — logical 001P durability transaction port, 001R consistency/idempotency behavior, 001Q authorization boundary, privacy classification and 001S evidence outbox semantics.
- `IMPL-001N-06` — brownfield migration planning, legacy crosswalk closure, stale-source rebase, cutover delegation, versioned import/export and rollback-safe preservation.
- `IMPL-001N-07` — 42/42 qualification-destination profile, explicit resource budgets, exact-store/workload performance-evidence registry, RFC 9562 portability probes and target-only evidence register.

## Boundary and evidence rules

Portable qualification can prove the platform-independent controller contract. It cannot prove target-native providers or physical-store performance.

- Physical database/index and transactional storage remain owned by `001P` and require exact provider/store evidence.
- Authorization/trust remains owned by `001Q`; possession of an `EntityId` is never authorization.
- Generic consistency/idempotency remains owned by `001R`.
- Evidence projection/transport remains owned by `001S` and never becomes a second identity truth store.
- Performance claims are valid only for an exact store adapter + version + workload profile + environment fingerprint actually measured.
- `BS-001N-042` remains `TARGET_NATIVE_PENDING` until `AUD-036` evidence exists for the target UUID library, physical database/index, encryption provider and OS-specific normalization behavior.

## Closure rule

Do not claim `PORTABLE_HOSTED_QUALIFIED` until the exact current stacked head passes the complete hosted Node suite with the 001N qualification tests included. Do not claim production/target qualification while any required `AUD-036` target evidence is missing.
