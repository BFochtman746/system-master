# P00 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P00 Authority pointer of record · **Effective** 2026-09-13
**Authority** `governance/CURRENT-AUTHORITY.json` → `CURRENT-AUTHORITY-005`
**Crosswalk** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`

## 1. Contract / interface

`governance/CURRENT-AUTHORITY.json` is the single entry point to the estate. Every
consumer resolves state by reading this file and following its pointers. It carries
`authority_id`, `effective_date`, `standing`, `supersedes`, and named pointers to
canonical artifacts.

Offers: a stable resolution path that survives artifact renumbering, because consumers
name the role (`obligation_registry`) rather than a particular numbered artifact.

Does not offer: independent product facts. Durable product/system facts belong in the
artifacts to which P00 points; duplicating them into the pointer of record is a defect.

## 2. Ingress routes

Writes to `governance/CURRENT-AUTHORITY.json` require an owner/human-authorized repository
change and remain subject to A-01/control-plane enforcement. No autonomous process may
repoint P00 merely because a downstream artifact changed.

Reads include `system-brief.js`, `lane-brief.js`, `foundation-closure-matrix.js`,
`validate-governance.js`, `scaffold-foundation-contracts.js`, and A-01 ingress/control
consumers.

## 3. Egress routes

P00 is consumed read-only. It emits no product-side effect. A pointer change becomes
visible when a consumer next reads the file; there is no independent cache or invalidation
writer owned by P00.

## 4. Persistence and canonical writer

The canonical persistent artifact is `governance/CURRENT-AUTHORITY.json` in git. Git
history records file revisions while `authority_id` and `supersedes` record the authority
chain.

Canonical writer: an owner/human-authorized repository change. Automated qualification
may read and validate P00 but may not repoint it.

The pointer path is intentionally stable and overwritten in place; numbered authority
identity is carried inside the file rather than by renaming the pointer itself.

## 5. Dependencies

P00 is the root authority pointer. It has no upstream authority dependency. Downstream
pointer targets are references that validation inspects; one absent or federated target
must be reported without silently inventing a replacement authority.

P00 acceptance depends only on repository-readable governance validation and the system
brief renderer. It requires no private, native, publication, credential, or external
provider authority.

## 6. Failure semantics

**Fail closed and report the exact defect.**

- Absent P00: authority-aware consumers fail rather than choosing a default.
- Malformed JSON: validation fails; no partial authority is admitted.
- Missing pointer target: report the broken pointer without fabricating a target.
- Federated target resident on another admitted ref: report that condition explicitly;
  do not reinterpret it as corruption or completion.
- Changed authority, contract, validator, brief renderer, or qualification workflow:
  prior P00 PASS does not transfer. Exact-subject evidence must be regenerated.

Reads are pure and require no mutation idempotency mechanism.

## 7. Evidence target

`.github/workflows/p00-authority-pointer-foundation-qualification.yml` must execute the P00
acceptance target on the exact repository subject and preserve the machine-readable
`p00-foundation-1.0-evidence` artifact.

The JSON evidence must include `CURRENT-AUTHORITY-005`, `SYSTEM_MASTER/CORE`, source commit
identity, `PASS`, hashes of the two acceptance logs, and exact Git blob bindings for:

- `governance/CURRENT-AUTHORITY.json`
- `governance/contracts/P00-FOUNDATION-CONTRACT-001.md`
- `.github/scripts/validate-governance.js`
- `.github/scripts/system-brief.js`
- `.github/workflows/p00-authority-pointer-foundation-qualification.yml`

Foundation census completion additionally requires admission of that exact successful run
into `governance/census/FOUNDATION-CLOSURE-EVIDENCE-REGISTRY-001.json`.

## 8. Acceptance target

```bash
node .github/scripts/validate-governance.js
node .github/scripts/system-brief.js
```

**PASS** only when both commands exit zero on the same source identity, governance
validation accepts the current authority chain, the brief renders the current authority,
and the P00 qualification workflow emits exact-subject machine-readable evidence.

A previous run, previous authority, or previous subject blob is not transferable PASS.

## 9. Authority boundary

**Lane may decide alone (`agent`):** read, validate, render, qualify, and report P00 without
mutating the authority pointer.

**Requires the owner/human-authorized change (`owner`):** adding, removing, or repointing
any authority pointer; changing `standing`; superseding `authority_id`; or otherwise
changing the semantic authority selected by `governance/CURRENT-AUTHORITY.json`.

Qualification and evidence admission prove the selected authority; they do not grant a
machine permission to select a different authority.

## 10. Open gaps

P00 remains `ACTIVE_GAP` until a successful current-subject qualification receipt is
admitted by the Foundation evidence registry. Federated control-record pointers, when
reported by the current governance tooling, remain explicit topology/federation conditions
and are not silently treated as P00 completion evidence.
