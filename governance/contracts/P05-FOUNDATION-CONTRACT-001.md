# P05 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P05 Governance schema validation · **Effective** 2026-09-13
**Authority** `governance/CURRENT-AUTHORITY.json` (`CURRENT-AUTHORITY-005`) · **Crosswalk** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`

## 1. Contract / interface

`node .github/scripts/validate-governance.js [--json]` is the read-only governance schema gate. It schema-validates the four schematized root documents resolved from CURRENT-AUTHORITY: authority, obligation registry, topology and owner allocation.

In addition, it requires the current authority to contain resolvable local pointers for every Foundation-critical entry route: obligation registry, topology, completion status, owner allocation, capability crosswalk, Foundation census, Foundation matrix generator and the governance validator itself.

Crosswalk semantics are owned by `foundation-closure-matrix.js`; Foundation evidence-registry semantics and exact-subject freshness are owned by `foundation-closure-evidence-verify.js`. P05 does not duplicate those validators or convert their authority into schema authority.

## 2. Ingress routes

1. CI through A-01 Control Plane Enforcement whenever governance or enforcement subjects change.
2. Direct operator invocation for diagnosis and qualification.
3. P05 exact-subject qualification through `.github/workflows/p05-governance-schema-foundation-qualification.yml`.

All routes are read-only. A local PASS is diagnostic unless bound to a qualifying CI subject.

## 3. Egress routes

- Human PASS/FAIL table or machine-readable JSON with `--json`.
- `critical_pointers` observations in JSON output.
- Exit `0` on valid governance, `1` on validation/pointer failure, `2` when CURRENT-AUTHORITY itself is unreadable.
- No file, network or governance mutation.

## 4. Persistence and canonical writer

P05 persists nothing and has no canonical writer. It reads canonical governance state only. The only durable P05 evidence is the immutable qualification artifact admitted through the Foundation evidence registry.

## 5. Dependencies

- P00 CURRENT-AUTHORITY pointer of record.
- P01 topology and owner allocation.
- P02 obligation registry.
- Four schemas under `governance/schemas/`.
- Node 22 standard runtime; no package install.
- Dedicated Foundation crosswalk/evidence validators for adjacent semantic checks; those remain separate owners of their invariants.

## 6. Failure semantics

**Fail closed.** Missing/malformed CURRENT-AUTHORITY exits `2`. Missing, malformed or schema-invalid root targets produce exit `1`. Missing or non-path Foundation-critical pointers produce exit `1`; path-shaped pointers that resolve to no current repository artifact also produce exit `1`.

Schema errors are located by JSON pointer. One target failure does not suppress validation of the remaining targets. Cross-file owner anomalies remain warnings because P01/P02 own those semantic decisions. Repeated validation is idempotent and side-effect free.

## 7. Evidence target

Machine-readable exact-subject P05 evidence must bind CURRENT-AUTHORITY, all four current schema targets, all four schema files, the validator, the P05 contract, the Foundation evidence verifier and the qualification workflow. It records positive validation plus negative-case log hashes and the immutable Actions artifact identity when admitted.

Validator-dependent Foundation receipts are transitively freshness-checked against the exact schemas and root governance target blobs that existed at their qualifying SHA, preventing a later schema/target change from silently inheriting an old PASS.

## 8. Acceptance target

```bash
node .github/scripts/validate-governance.js
```

PASS requires four schematized targets with zero errors and all eight Foundation-critical pointers present/resolvable.

The qualification workflow must also prove three negative cases fail closed without leaving a working-tree mutation: removing `capability_crosswalk` from CURRENT-AUTHORITY, corrupting a topology completion enum, and pointing `governance_validator` at a missing repository artifact.

Repository qualification: `.github/workflows/p05-governance-schema-foundation-qualification.yml`.

## 9. Authority boundary

CORE/P05 may improve deterministic validation, diagnostics and negative tests without weakening existing checks. Owner authority is required to add/remove a schema target, remove a Foundation-critical pointer, loosen a schema constraint, downgrade an error to warning, or transfer semantic ownership from a dedicated validator.

Repository qualification grants no native/private/external/publication/production authority.

## 10. Open gaps

No Foundation-local P05 gap remains once the exact-subject qualification passes and P00/P01/P02 are requalified against the changed validator. Those predecessor receipts must not transfer across the validator change.
