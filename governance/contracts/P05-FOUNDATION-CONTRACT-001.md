# P05 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P05 Governance schema validation · **Effective** 2026-09-14
**Authority** `governance/CURRENT-AUTHORITY.json` (`CURRENT-AUTHORITY-005`) · **Crosswalk** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`

## 1. Contract / interface

`.github/scripts/validate-governance.js [--json]` is the dependency-free schema and pointer-chain gate for the four load-bearing governance targets selected from current authority:

1. `governance/CURRENT-AUTHORITY.json` against `CURRENT-AUTHORITY-001.schema.json`;
2. the authority-selected obligation registry against `WORK-OBLIGATION-REGISTRY-001.schema.json`;
3. the authority-selected topology against `SYSTEM-TOPOLOGY-001.schema.json`;
4. the authority-selected tool-owner allocation against `TOOL-OWNER-ALLOCATION-001.schema.json`.

It implements only the JSON Schema subset these schemas use: `type`, `required`, `properties`, `items`, `enum`, `pattern`, `minLength`, and `minItems`. It also emits cross-file owner warnings without silently promoting warnings to errors.

P05 is a read-only judge. It offers PASS/FAIL, located errors and machine-readable output; it does not repair, format or mutate governance.

## 2. Ingress routes

1. **Authoritative CI route:** `.github/workflows/a01-control-plane-enforcement.yml` runs `node .github/scripts/validate-governance.js` for governance/workflow changes admitted by that workflow's push/pull-request filters.
2. **Qualification route:** `.github/workflows/p05-governance-schema-validation-foundation-qualification.yml` runs positive and negative acceptance on the exact source identity and preserves evidence.
3. **Operator route:** direct shell invocation is advisory unless its exact subject is subsequently qualified and admitted as Foundation evidence.

No route grants P05 write authority over a validated subject.

## 3. Egress routes

- human-readable target PASS/FAIL and warnings on stdout;
- JSON report with `--json`;
- exit `0` when all four targets validate, exit `1` for validation/pointer failure, exit `2` when the root authority file is unreadable;
- immutable qualification artifact `p05-foundation-1.0-evidence` from the P05 qualification workflow.

No files, network resources or canonical governance state are mutated by the validator itself.

## 4. Persistence and canonical writer

P05 has no canonical mutable state and no writer. Its durable specification is this contract; its proof state is the immutable GitHub Actions evidence plus the Foundation evidence registry entry.

Schemas and validated governance artifacts retain their own canonical writers. P05 may reject them but never rewrite them to obtain PASS.

## 5. Dependencies

- **P00** — selects current authority and pointer targets.
- **P01** — provides the current Topology 007 and Allocation 006 subjects P05 validates.
- **P02** — provides the current Registry 017 subject P05 validates.
- Node 22 runtime, standard library only.
- The four schema files named in section 1.

P05 requires no private corpus, native device, production credential, publication authority or external-provider mutation authority.

## 6. Failure semantics

**Fail closed.**

- `CURRENT-AUTHORITY.json` missing/unreadable/malformed → exit `2`.
- A required authority pointer missing → validation error/exit `1`; no historical fallback is selected.
- A pointed document or schema unreadable → error for that target; remaining targets are still inspected so one defect does not hide others.
- Type mismatch stops descent into that subtree to avoid derived-error cascades.
- Enum/pattern/required/minimum violations produce located validation errors and exit `1`.
- Cross-file owner conditions currently classified as warnings remain non-fatal unless owner authority changes the schema/contract boundary.
- Any changed contract, validator, schema, selected current governance subject, CI wiring or qualification workflow invalidates a prior P05 PASS for current completion purposes.

The validator is pure and idempotent; retrying an unchanged subject has no side effects.

## 7. Evidence target

`.github/workflows/p05-governance-schema-validation-foundation-qualification.yml` must emit `p05-foundation-1.0-evidence` containing:

- `CURRENT-AUTHORITY-005`, `SYSTEM_MASTER/CORE`, P05 PASS and source commit identity;
- exact Git blob SHAs for the current authority, P05 contract, validator, four schemas, current obligation registry/topology/allocation, CI enforcement workflow and P05 qualification workflow;
- hashes of positive validation, invalid-topology negative validation, invalid-authority-pointer negative validation and CI-wiring proof logs;
- the immutable workflow run/artifact identity when admitted to `FOUNDATION-CLOSURE-EVIDENCE-REGISTRY-001.json`.

Contract prose or an unrelated green workflow is not P05 completion evidence.

## 8. Acceptance target

Positive:

```bash
node .github/scripts/validate-governance.js
```

Negative acceptance must independently prove both directions:

1. change a topology `completion` value to one outside the schema enum and prove validation exits non-zero;
2. change `CURRENT-AUTHORITY.json::obligation_registry` to a non-path value and prove validation exits non-zero.

The qualification must also prove `.github/workflows/a01-control-plane-enforcement.yml` contains the authoritative `node .github/scripts/validate-governance.js` step.

**PASS** requires the positive case to return zero, both negative cases to fail as intended, CI wiring to be present, and exact-subject machine-readable evidence to be uploaded successfully.

## 9. Authority boundary

**CORE/P05 may decide:** deterministic validator implementation, error rendering, check order and additional tests that preserve the current schema semantics.

**Owner/governance authority required:** adding/removing a load-bearing target; weakening a schema; changing an enum/pattern/required property; changing warning versus failure classification; bypassing current P00 pointer resolution; or removing the authoritative CI gate.

P05 qualification proves repository governance validation only. It grants no production, native, private, publication or external side-effect authority.

## 10. Open gaps

P05 remains `ACTIVE_GAP` until the exact current-subject qualification succeeds and its run/artifact/subject bindings are admitted to `governance/census/FOUNDATION-CLOSURE-EVIDENCE-REGISTRY-001.json`.
