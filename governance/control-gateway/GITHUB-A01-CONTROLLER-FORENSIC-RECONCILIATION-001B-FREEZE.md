# GITHUB-A01-CONTROLLER-FORENSIC-RECONCILIATION-001B

Status: **FROZEN — MAIN-DERIVED CONTROLLER CANONICALIZATION CANDIDATE / HOSTED + A-01 EXACT-SHA PASS / NOT PRODUCTION ACTIVE**

Operation: `GITHUB-A01-CONTROLLER-FORENSIC-RECONCILIATION-001B`  
Work branch: `github-a01-controller-forensic-reconciliation-001b-20260912`  
Qualified executable subject: `65a661dde54149a6892574bc892fbb107022db00`  
Qualified executable tree: `9d1f5ab45f72e00064722b148614c6ac6d1b4f2e`  
Qualified frozen evidence ref: `github-a01-controller-forensic-reconciliation-001b-qualified-frozen`  
Exact current-main base: `c41884bf9cc66c24fb7f245d68eefc6dbbd1139f`  
001A predecessor head: `bbf1e4a82036bd69ce4de5e5e098af5ae41eab7e`

## 1. Result

001B constructed the first executable controller candidate from current `main` without resetting `main`, without wholesale merging the historical controller branch, and without force-updating any ref.

The candidate selectively preserves the exact qualified controller runtime/test/evidence mechanics from `bad4708ba91b533c333ba2659ab99bf071710ba6` while retaining the newer product and qualification state already present on current `main`.

The exact executable candidate `65a661dde54149a6892574bc892fbb107022db00` passed the complete 001B proving workflow, run `34711132143`.

## 2. Lossless source port

The controller runtime, supervisor, tests, CG authority/evidence records, and qualification harnesses were selectively ported according to the 001A canonical port manifest.

Three authority-sensitive files were reconciled rather than treated as an uncontrolled branch merge:

- `.github/scripts/validate-system-topology.js` preserves current repository topology facts while adding the qualified external-infrastructure workstream validation needed by the Control Gateway.
- `.github/workflows/a01-overnight-night-shift.yml` is the qualified retired GitHub scheduler surface: no cron, no slot chain, no A-01 dispatch. A-01 `SecondShiftSupervisorV2` remains the scheduler authority.
- `qualification/a01/registry.json` advances the current A-01 tree to registry v31 with the registered `SECOND-SHIFT-SUPERVISOR-V2-A01-STRESS` qualification while preserving the rest of the current A-01 control-plane tree.

The candidate is four commits ahead and zero behind the exact current-main base. The delta contains the 001A governance records, the declared controller surfaces, the three reconciled files, and the 001B proving workflow. No unrelated Book, Learning, Documents, Foundation Planning/Orchestration, or other product rollback was admitted.

## 3. Hosted proof

Workflow run `34711132143` proved the exact executable subject before A-01 execution:

- Node 22 portable cumulative controller gate: PASS — job `103600014872`.
- Node 24 portable cumulative controller gate: PASS — job `103600015054`.
- Independent controller adversarial closure: PASS — job `103600075096`.
- exact bootstrap contract parsing and current topology validation: PASS.

## 4. A-01 exact-subject proof

The same workflow routed the exact candidate through the trusted A-01 metadata-only admission path before subject acquisition.

- Metadata admission job `103600090489`: PASS.
- A-01 execution job `103600126590`: PASS.
- runner: `A-01` / Windows / X64.
- policy version: 8.
- registry version: 31.
- qualification: `SECOND-SHIFT-SUPERVISOR-V2-A01-STRESS`.
- subject SHA = checkout SHA = control-plane SHA = `65a661dde54149a6892574bc892fbb107022db00`.
- controller Node suite: 152 tests / 141 pass / 0 fail / 11 intentional skips.
- CG-008 supervisor adapter: PASS.
- CG-009 coordination + authority: PASS.
- CG-010 night scheduler: PASS.
- CG-011 restart/idempotency + dispatch-failure replay: PASS.
- Supervisor V2 stress: 28 tests / 0 failures / 0 errors.
- randomized invariant stress: 20,000 transitions, seed `0x5EC0D5`, `rigor_reduced=false`.
- independent CG-011 adversarial closure: PASS.
- cumulative qualifier: PASS.
- authoritative receipt result: PASS with `promotion_authorized=false`.

Authoritative A-01 evidence artifact:

- artifact ID: `10303392150`
- name: `SECOND-SHIFT-SUPERVISOR-V2-A01-STRESS-34711132143-evidence`
- SHA-256: `cced158f3688e7afb48fb9f3f7b15b5505f175cadd950abf16f57a356be614c9`

## 5. Exact qualification boundary

The qualified executable authority is **exactly** `65a661dde54149a6892574bc892fbb107022db00`.

This freeze file and the machine-readable qualification evidence are documentation-only closure records on a separate frozen evidence ref. They do not pretend that a documentation SHA inherited executable qualification, and they do not modify the qualified candidate branch.

Any later executable controller, GitHub mutation, A-01, or supervisor byte change requires fresh exact-subject proving under the 001A proof-as-we-go rule.

## 6. What 001B does not authorize

001B does not:

- update `main`;
- production-activate the controller;
- make Control Gateway GitHub mutation admission technically unavoidable;
- add repository rulesets or branch protection;
- grant ChatGPT direct production write authority;
- activate Second Shift Mastery;
- change the CG-011 terminal locator into a successor;
- start `CG-012`;
- transfer qualification to future changed executable SHAs.

The critical production-enforcement gap therefore remains open even though the main-derived controller candidate is now technically qualified.

## 7. Exact successor

`GITHUB-A01-CONTROLLER-FORENSIC-RECONCILIATION-001C — GITHUB MUTATION PRODUCTION-ENFORCEMENT CLOSURE / RECEIPT-CONSUMING EXACT-CAS WRITER + BYPASS ELIMINATION`

001C must preserve the exact 001B qualified controller behavior while closing the gap that currently allows GitHub mutation outside the Control Gateway. It must not weaken the metadata-only A-01 admission boundary, exact-predecessor/CAS semantics, A-01 sole scheduler authority, or the no-PASS-transfer rule.
