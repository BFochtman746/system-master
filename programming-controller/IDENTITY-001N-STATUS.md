# PROGRAMMING-FOUNDATION-001N / IDENTITY-SEMANTICS-001

This is a stacked Programming-controller implementation branch based on the exact qualified `WP-001M` candidate head `97ab2bac56c55a195e20897c15902e15ae6d648e`.

It is external development-controller code, not System Master iPhone runtime code and not a replacement for the shared A-01 control plane.

## Current slice

`IMPL-001N-01 — canonical ID types, scheme profiles and allocator`

Candidate implementation includes:

- immutable canonical UUID identity values independent of mutable names/paths/locators;
- versioned `IdentitySchemeProfile` registry;
- RFC 9562 UUIDv7 internal default with monotonic same-millisecond handling;
- RFC 9562 UUIDv4 opaque profile for external/security-sensitive identifiers;
- CSPRNG abstraction with fail-closed generator errors;
- bounded collision-probe contract with no overwrite semantics;
- canonical 128-bit bytes/text round-trip helpers;
- explicit `UNPROBED_NOT_COMMITTED` / `PROBED_NOT_COMMITTED` standing so allocation never implies persistence or authorization.

Full transactional uniqueness, authorization, persistence, idempotency and evidence remain later `001N` slices bound to 001P/001Q/001R/001S.

## Current evidence rule

No implementation PASS is claimed until the stacked PR exact head completes hosted portable qualification and A-01 control-plane enforcement.
