# P05 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P05 Governance schema validation · **Effective** 2026-09-13
**Authority** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-001.json`

## 1. Contract / interface

`node .github/scripts/validate-governance.js [--json]` validates the four load-bearing
governance artifacts against the schemas in `governance/schemas/`, resolving each target
through `CURRENT-AUTHORITY.json` rather than a hardcoded list.

Offers: a pass/fail verdict, a per-file error list with JSON pointers, and cross-file
warnings. Does not offer: repair, formatting, or any mutation. It is a read-only judge.

Implements the JSON Schema subset the schemas use — `type`, `required`, `properties`,
`items`, `enum`, `pattern`, `minLength`, `minItems`. Zero dependencies is a contract term,
not an implementation detail: a governance gate that needs an install step is a gate that
gets skipped.

## 2. Ingress routes

Two, both pull.

1. **CI** — the `enforce` job of `a01-control-plane-enforcement.yml`, on every push and
   pull request touching `governance/**`. Admitting authority is the workflow's path
   filter. This is the authoritative route.
2. **Operator shell** — manual invocation. No admitting authority; advisory only. A local
   pass does not substitute for the CI gate.

No push route. Nothing calls this; it is called.

## 3. Egress routes

- stdout: human table, or JSON with `--json`.
- Exit code: 0 valid, 1 validation failure, 2 a required file unreadable.
- No side effects. No files written, no network, no state mutated.

The exit code is the load-bearing output — CI consumes it, humans read the table.

## 4. Persistence and canonical writer

None. P05 holds no durable state and has no writer.

It reads `governance/CURRENT-AUTHORITY.json`, the three artifacts that file points at, and
`governance/schemas/*.schema.json`. All read-only. A validator that could write the thing
it validates could make itself pass, so this section stays empty by design, not by
omission.

## 5. Dependencies

- **P00** authority pointer — resolves every target. If P00 is malformed, P05 exits 2.
- **P01** topology and allocation, **P02** obligation registry — the validated subjects.
- Node 22 runtime. No packages.

Crosses no boundary rule. CORE-internal.

## 6. Failure semantics

**Fail-closed throughout.**

- Authority unreadable or absent → exit 2, nothing else attempted. A validator that
  proceeds without its pointer of record is guessing.
- A declared pointer names a missing file → recorded as an error, remaining targets still
  checked, exit 1. One broken pointer must not hide three others.
- Schema unreadable → error for that target, others continue.
- Type mismatch → that subtree is not descended into, preventing a cascade of derived
  errors from one wrong type.
- Cross-file warnings never fail the build. They report conditions that may be intentional
  (an obligation owned by a path that owns no modules), and turning a maybe into a hard
  failure trains people to disable the gate.

Idempotent and side-effect free: running it N times is identical to running it once.
Retries are always safe.

## 7. Evidence target

CI job log for `Validate governance pointer chain and registries`, retained by the Actions
artifact policy. The terminal line `GOVERNANCE_VALIDATION=PASS` or `=FAIL errors=N` is the
evidence record. With `--json`, the full report is machine-readable for archival.

## 8. Acceptance target

```
node .github/scripts/validate-governance.js
```

**PASS** when all four targets report PASS and the final line is
`GOVERNANCE_VALIDATION=PASS`. Warnings do not affect PASS.

Negative acceptance, both verified 2026-09-13: an invalid `completion` enum value in the
topology and a non-path `obligation_registry` pointer each produce exit 1 with a located
error.

## 9. Authority boundary

**Lane may decide alone (`agent`):** error message wording, table formatting, the order
targets are checked, adding a test.

**Requires the owner (`owner`):** adding or removing a validated target; loosening any
schema pattern or enum; changing a warning into an error or the reverse; making any
condition non-fatal.

Loosening a schema to make a file pass is always an `owner` decision. That path is how a
gate becomes decoration.

## 10. Open gaps

None. All four targets PASS, negative cases verified, wired as a CI job.

Adjacent work, not a gap in P05: the five live cross-file warnings name obligations owned
by `SYSTEM_MASTER`, `SYSTEM_MASTER/SHARED_INFRASTRUCTURE`, and `.../A01` — paths that own
no modules. Those are P01/P02 decisions.
