# P00 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P00 Authority pointer of record · **Effective** 2026-09-14  
**Current architecture authority** `governance/CURRENT-AUTHORITY.json` → `CURRENT-AUTHORITY-005` / `SYSTEM-TOPOLOGY-007`  
**Capability authority** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`

## 1. Contract / interface

`governance/CURRENT-AUTHORITY.json` is the single canonical entry point to the current System Master governance estate. Consumers resolve current state by reading this file first and following its named role pointers rather than selecting numbered artifacts directly.

The pointer contract is role-based. For example, a consumer reads `obligation_registry` from `CURRENT-AUTHORITY.json`; it does not assume a specific `WORK-OBLIGATION-REGISTRY-NNN.json` filename. The same rule applies to topology, owner allocation, capability crosswalk, completion status, control records, and every other selected governance artifact.

P00 supplies selection authority, not the selected artifacts' semantic content. Facts owned by another artifact remain authoritative there. Historical receipts and superseded numbered records retain their original bytes and subjects; repointing the current selector never relabels historical evidence.

## 2. Ingress routes

Canonical pointer-file mutation enters through a reviewed repository change to `governance/CURRENT-AUTHORITY.json`. Any mutation must preserve schema validity, pointer integrity, explicit supersession/ratification semantics, and the authority rules selected by the current file.

Read ingress includes `system-brief.js`, `lane-brief.js`, `foundation-closure-matrix.js`, `validate-governance.js`, the control/ingress surfaces that resolve current authority, and any owner lane that must determine current topology, ownership, completion, or work-selection truth.

P04 content-addressed authority bootstrap is a separate interface: it may create immutable authority/state refs in its own guarded namespace, but it does not silently rewrite or repoint `governance/CURRENT-AUTHORITY.json`. P00 therefore forbids unreviewed repointing of the canonical selector without forbidding P04's separately governed write-once authority-ref mechanism.

## 3. Egress routes

P00 is consumed read-only by downstream resolution. Its egress is the set of named pointers and selector facts exposed by `CURRENT-AUTHORITY.json`.

A selector change becomes visible on the next read; P00 defines no independent cache. Any consumer-side cache must invalidate when the selected authority blob/ref changes and must never fall back to a superseded selector after a current selector is readable.

## 4. Persistence and canonical writer

Persistence is the version-controlled file `governance/CURRENT-AUTHORITY.json`. Git history preserves every prior file state, while `authority_id`, `supersedes`, ratification pointers, and selected numbered artifacts preserve the governance chain.

Canonical writer for the selector file is a reviewed repository mutation with exact predecessor awareness. Automation may prepare or transport such a change only through an explicitly authorized repository-control path; no runtime process may silently repoint the selector as a side effect of ordinary execution.

P04's write-once refs under its guarded authority namespace are not P00 writes. They are durable authority records selected/consumed under their own contract and cannot substitute for changing this pointer file.

## 5. Dependencies

P00 is the resolution root and must remain parseable without first consulting another governance artifact. Its selected pointers are validation dependencies, not bootstrap prerequisites: a malformed or missing selected target must be reportable as a pointer-integrity failure rather than making the selector itself undiscoverable.

Current Foundation qualification additionally verifies that the selector resolves the current topology, owner allocation, capability crosswalk, obligation registry, and Foundation census inputs named by `CURRENT-AUTHORITY-005`.

## 6. Failure semantics

**Fail closed and preserve evidence lineage.**

- Missing or malformed `CURRENT-AUTHORITY.json` → no current-authority claim may be made; validation/brief/ingress surfaces fail rather than selecting a default.
- Missing selected pointer target → report the exact unresolved role/path; do not substitute a prior numbered artifact.
- Selector/schema disagreement → reject the changed selector.
- Current topology/allocation/crosswalk disagreement with the Foundation census → Foundation projection fails rather than mixing authority generations.
- A current receipt whose bound selector or other subject blob changes → receipt becomes non-current; historical receipt remains intact and a fresh receipt is required.
- Concurrent selector mutation based on a stale predecessor → reject or reconcile before write; never overwrite unseen current authority.

Reads are pure and idempotent. Retrying a failed read or validation cannot mutate governance state.

## 7. Evidence target

Current completion evidence is a Foundation evidence receipt registered under `FOUNDATION-CLOSURE-EVIDENCE-REGISTRY-001` and bound to:

- an exact qualification head SHA;
- the exact current `CURRENT-AUTHORITY.json` blob;
- this exact P00 contract blob;
- the current P00 qualification script/workflow blobs;
- the current selector inputs the P00 qualifier proves; and
- a successful GitHub Actions run plus immutable artifact identity/digest.

Superseded P00 evidence remains historical provenance and is never rewritten to the new subject.

## 8. Acceptance target

The current P00 qualification must run, on the exact candidate head:

```text
node .github/scripts/validate-governance.js
node .github/scripts/system-brief.js
node .github/scripts/p00-authority-pointer-foundation-qualify.js
```

**PASS** requires the qualifier to prove `CURRENT-AUTHORITY-005`, `SYSTEM-TOPOLOGY-007`, `SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006`, `SYSTEM-MASTER-CAPABILITY-CROSSWALK-003`, the current authority-selected obligation registry, and the rebased Foundation census; produce a machine-readable evidence artifact; and then admit a fresh exact-subject PASS receipt to the Foundation evidence registry.

A historical P00 PASS does not transfer across changed authority, contract, workflow, script, topology, allocation, crosswalk, or other bound subject blobs.

## 9. Authority boundary

**Lane may decide alone (`agent`):** validation implementation, evidence formatting, negative tests, and internal refactoring that preserve the selector's roles, schema, write authority, and fail-closed semantics.

**Requires the owner (`owner`):** adding/removing/repointing a canonical role; changing `authority_id`, `standing`, `supersedes`, topology, ownership allocation, capability crosswalk, completion truth, or any rule that broadens mutation authority over the selector.

P00 never creates a new peer system, transfers semantic ownership, resurrects a retired system, or broadens a historical receipt.

## 10. Open gaps

No contract-level interface gap is intentionally left open. Foundation completion is nevertheless evidence-gated: this rebased contract requires a fresh current-authority qualification receipt before P00 may be classified `COMPLETE_WITH_EVIDENCE`.
