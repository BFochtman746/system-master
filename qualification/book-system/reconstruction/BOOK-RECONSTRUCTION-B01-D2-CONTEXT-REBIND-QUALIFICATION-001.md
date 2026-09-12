# BOOK-RECONSTRUCTION-B01-D2 — CONTEXT COMPILER CURRENT-LINEAGE REBIND / QUALIFICATION 001

Date: 2026-09-12
Owner: SYSTEM_MASTER/BOOK
Design lock: `BOOK-RECONSTRUCTION-B01-C-CAPABILITY-BINDING-CONTEXT-RUNTIME-DESIGN-LOCK-001`
Qualified exact subject: `c93533f4341347d22707d52bbc54a83e7446155c`
GitHub Actions run: `34686263760`
Standing: `D2_BUILD_COMPLETE__EXACT_DONOR_PRESERVED__HOSTED_PORTABLE_PASS__D3_ADMITTED`
Canonical effect: NONE

## Exact donor materialization

The recovered Context Compiler donor was materialized byte-for-byte on the current B01 owner lineage before the B01 rebind layer was added.

Exact donor identities verified by the qualification workflow:

- `system-master/book-system/context-compiler/book-context-compiler.js`
  - current blob: `8b71624cd555e834fb6572cb659ad3d50a1ade2c`
  - recovered historical blob: `8b71624cd555e834fb6572cb659ad3d50a1ade2c`
- `system-master/book-system/context-compiler/book-context-package.schema.json`
  - current blob: `725f3a16990f096c6fd99fe9e27d026445839efa`
  - recovered historical blob: `725f3a16990f096c6fd99fe9e27d026445839efa`
- `.github/scripts/book-context-compiler-context-package-001-qualify.js`
  - current blob: `0a903198ea4baff3ceaa3b8b82da1546ef15fb14`
  - recovered historical blob: `0a903198ea4baff3ceaa3b8b82da1546ef15fb14`

The donor was therefore **reused**, not reconstructed from prose or silently rewritten.

## Current-lineage B01 rebind layer

Added:

- `system-master/book-system/context-compiler/book-context-compiler-b01-rebind.js`
- `system-master/book-system/context-compiler/book-context-compiler-b01-rebind.test.js`

The rebind layer leaves the donor compiler/package schema intact and wraps donor output with a content-addressed `bound_context` identity that includes:

- current Book capability ID;
- exact `BookCapabilityBindingV1` ID and digest;
- current Book owner path;
- adapter ID/version;
- immutable provider service/operation provenance;
- provider subject reference, including explicit `null` standing;
- exact donor context package ID/digest and package class;
- explicit false canonical/publication/author-decision authority;
- explicit `NOT_GRANTED_BY_BINDING` private-data authority.

A changed current capability binding makes the old bound context stale. Mutable chat/webhook metadata is not part of semantic binding identity. A null provider subject remains `BLOCKED_PROVIDER_SUBJECT_UNADMITTED`; it is never guessed into executable standing.

## Preserved donor fences

The current subject re-executed the recovered 44-case donor denominator with no expectation changes. Preserved behavior includes:

- exact manuscript source binding;
- exact Book-state version/digest binding;
- exact Story-Bible snapshot/canon binding;
- service-registry binding and stale detection;
- unresolved author decisions fail closed;
- hard constraint conflict detection;
- raw manuscript/candidate, blind/private labels, author secrets, chain-of-thought, canonical mutation commands and publication credentials excluded/rejected;
- active retired Prose authority domain rejected;
- Documents cannot own completed-Prose integration;
- generation/evaluation context role separation;
- admission authority requires admission context;
- all context compilation remains `canonical_effect=false`.

## Hosted exact-subject evidence

Run `34686263760` completed `success` on exact subject `c93533f4341347d22707d52bbc54a83e7446155c`.

| Job | Environment | Donor result | B01 rebind result |
|---|---|---|---|
| `103533660433` | Ubuntu 24.04.5 LTS, Node `v22.23.2` | exact donor blobs verified; 44/44 PASS | 101 checks PASS; 11 mappings bound; binding digest fenced; changed binding stale; provider subjects admitted=0; retired Prose execution=false; canonical/publication/private authority=false |
| `103533660398` | Ubuntu 24.04.5 LTS, Node `v24.20.0` | exact donor blobs verified; 44/44 PASS | same 101-check result and authority boundaries |

This D2 evidence is portable hosted evidence only. It is not native target, private manuscript, fresh-blind evaluator, external-provider, publication, production or A-01 evidence.

## Relationship to frozen B01 denominator

D2 directly qualifies the Context Compiler donor preservation requirement and the B01 design-lock binding-context seams, including X01/X02/X09. The implementation-level 101-check count does not replace the frozen whole-B01 64-case denominator. B01 is not frozen until D3/D4 integration completes and B01-E executes the full isolated + cumulative denominator on the exact candidate subject.

Historical Context Compiler run `34564007172` remains provenance. The current PASS comes from fresh re-execution on the current exact subject; no historical PASS was transferred.

## D2 freeze disposition

D2 is frozen as reusable current-lineage context substrate. Current `BOOK.*` capability bindings may now produce durable bound context identities, but **provider execution remains unavailable** because the D1 registry intentionally carries no admitted provider subjects, and scheduler/routing dispatch has not yet been rebound.

Exactly one dependency-valid successor is bound:

`BOOK-RECONSTRUCTION-B01-D3 — ROUTING + EXECUTION PLAN + CONCURRENCY + RETRY CURRENT-BOOK-IDENTITY REBIND`

D3 must:

1. preserve old `PROSE.*` and `/PROSE` current execution denial permanently;
2. make current `BOOK.*` task/routing identity depend on exact admitted `BookCapabilityBindingV1` identity/digest;
3. bind execution-plan semantic identity to current capability + binding digest so a changed binding changes the plan/task identity;
4. preserve non-idempotent candidate generation as serial and reconcile-before-regenerate;
5. include exact binding digest + provider service/operation identity in logical operation identity;
6. preserve evaluator isolation-gated standing and null-provider blocking;
7. add direct current tests for changed routing/plan/concurrency/retry semantics before scheduler dispatch eligibility changes; and
8. re-read the live Book owner head before mutation.

No author/private/native/publication/external-provider/production/A-01 standing is claimed.
