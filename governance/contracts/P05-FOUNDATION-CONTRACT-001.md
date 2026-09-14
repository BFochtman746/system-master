# P05 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P05 Governance schema validation · **Effective** 2026-09-14
**Authority** `CURRENT-AUTHORITY-005` → `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`

## 1. Contract / interface

`node .github/scripts/validate-governance.js [--json]` validates the four load-bearing
governance artifacts against the schemas in `governance/schemas/`, resolving each target
through `CURRENT-AUTHORITY.json` rather than a hardcoded list.

Offers: a pass/fail verdict, a per-file error list with JSON pointers, and cross-file
warnings. Does not offer: repair, formatting, or any mutation. It is a read-only judge.

Implements the JSON Schema subset the schemas use — `type`, `required`, `properties`,
`items`, `enum`, `pattern`, `minLength`, `minItems`. Zero package dependencies is a
contract term, not an implementation detail: a governance gate that needs an install step
is a gate that gets skipped.

## 2. Ingress routes

Two, both pull.

1. **CI** — the `enforce` job of `.github/workflows/a01-control-plane-enforcement.yml`,
   on every push and pull request touching the governed path set. Its
   `Validate governance pointer chain and registries` step invokes the validator before
   the rest of A-01 enforcement. The workflow path filter is the admitting authority.
2. **Operator shell** — manual invocation. No admitting authority; advisory only. A local
   pass does not substitute for the CI gate.

No push route. Nothing calls this by external side effect; it is invoked as a read-only
validation gate.

## 3. Egress routes

- stdout: human table, or JSON with `--json`.
- Exit code: 0 valid, 1 validation failure, 2 a required authority file unreadable.
- No side effects. No files written, no network, no state mutated.

The exit code is the load-bearing output — CI consumes it, humans read the report.

## 4. Persistence and canonical writer

None. P05 holds no durable product state and has no canonical writer.

It reads `governance/CURRENT-AUTHORITY.json`, the three artifacts that file points at, and
`governance/schemas/*.schema.json`. All are read-only inputs. A validator that could write
the thing it validates could make itself pass, so no persistence is a required property,
not an omission.

Foundation qualification evidence is written only by GitHub Actions as an immutable run
artifact; that evidence is not governance state and does not grant the validator write
authority.

## 5. Dependencies

- **P00** authority pointer — resolves every target. If P00 is malformed or unreadable,
  P05 fails closed.
- **P01** topology and owner allocation, **P02** obligation registry — validated subjects.
- The four governance schemas named by `.github/scripts/validate-governance.js`.
- Node 22 runtime. No packages and no network dependency.

Crosses no product-owner boundary; P05 is CORE-internal validation infrastructure.

## 6. Failure semantics

**Fail-closed throughout.**

- Authority unreadable or absent → exit 2, nothing else is trusted.
- A declared pointer names a missing or invalid file → recorded as an error; remaining
  targets are still checked; final exit is nonzero.
- Schema unreadable → error for that target; remaining targets continue.
- Type mismatch → that subtree is not descended into, preventing derivative error noise.
- Cross-file warnings do not fail the build. They identify potentially intentional owner
  relationships that schema validation alone cannot adjudicate.

The validator is idempotent and side-effect free: retries are safe. Qualification must
prove the positive path and at least two negative paths by corrupting only the disposable
CI checkout, observing rejection, restoring the exact subject, and proving PASS again.

## 7. Evidence target

The authoritative closure evidence is the artifact emitted by
`.github/workflows/p05-governance-schema-foundation-qualification.yml` on the exact PR
head. It contains a machine-readable P05 receipt with:

- exact qualification head SHA;
- exact Git blob SHA for every bound subject;
- positive validation output;
- negative topology-enum rejection output;
- negative authority-pointer rejection output;
- final restored positive PASS.

The live enforcement step in `a01-control-plane-enforcement.yml` is operational evidence;
Foundation completion additionally requires the subject-bound P05 qualification artifact
and its admission into `FOUNDATION-CLOSURE-EVIDENCE-REGISTRY-001.json`.

## 8. Acceptance target

Operational gate:

```sh
node .github/scripts/validate-governance.js
```

**PASS** requires all four targets to validate and the final line
`GOVERNANCE_VALIDATION=PASS`. Warnings do not affect PASS.

Foundation closure additionally requires
`.github/workflows/p05-governance-schema-foundation-qualification.yml` to succeed on the
exact subject after proving both rejection directions and restoration, followed by a
current-authority registry entry whose exact subject blobs still match. The disposition
matrix must then classify `P05` as `COMPLETE_WITH_EVIDENCE`.

## 9. Authority boundary

**Lane may decide alone (`agent`):** error message wording, report formatting, validation
order, and adding tests that do not weaken acceptance.

**Requires the owner (`owner`):** adding or removing a validated target; loosening a
schema pattern or enum; changing warning/error severity; making a currently fatal
condition non-fatal; or changing the evidence-admission rule.

Loosening a schema merely to make a subject pass is always an owner decision. Repository
qualification does not grant native-device, private-data, provider, publication,
production, credential, or external-side-effect authority.

## 10. Open gaps

The implementation and contract are complete once the active enforcement workflow
contains the governance-validation step. Foundation closure remains open until a fresh
exact-subject P05 qualification PASS is admitted to the Foundation evidence registry and
the current disposition matrix reports `P05` as `COMPLETE_WITH_EVIDENCE`.
