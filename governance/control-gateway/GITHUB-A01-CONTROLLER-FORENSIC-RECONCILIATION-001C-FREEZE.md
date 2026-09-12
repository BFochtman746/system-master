# GITHUB-A01-CONTROLLER-FORENSIC-RECONCILIATION-001C

Status: **EXECUTABLE QUALIFIED / PRODUCTION ENFORCEMENT BLOCKED — DEDICATED WRITER APP + LIVE RULESET BOOTSTRAP REQUIRED**

Operation: `GITHUB-A01-CONTROLLER-FORENSIC-RECONCILIATION-001C`  
Qualified executable subject: `ece3a58f628236e75d5090ddf3f4d7bf4f1d836d`  
Qualified executable tree: `a25d1339edee6dca7a906a4bc2bd0031d288c25a`  
Work branch: `github-a01-controller-forensic-reconciliation-001c-20260912`  
Qualified evidence ref: `github-a01-controller-forensic-reconciliation-001c-qualified-frozen`  
001B qualified predecessor: `65a661dde54149a6892574bc892fbb107022db00`

## 1. Executable result

001C implements and qualifies the executable GitHub production-mutation boundary.

The production path now requires:

1. fresh reconstruction of durable Control Gateway authority;
2. CG-005 exact operation/path/effect/predecessor admission;
3. fresh admission verification;
4. an exact byte-bound production mutation plan;
5. a second production grant bound to the admission and plan digests;
6. an exact tree and single-parent commit rooted at the admitted predecessor;
7. a final predecessor check immediately before ref mutation;
8. a `force=false` ref update;
9. post-write exact-ref verification;
10. a digest-bound execution receipt with exact replay idempotency.

The production writer workflow uses a repository-scoped dedicated GitHub App token and leaves the ordinary workflow `GITHUB_TOKEN` read-only. It refuses to execute unless the workflow is running from `refs/heads/main` and the protected `control-gateway-production` environment is available.

## 2. Exact-SHA proof

Workflow run `34712308641` completed successfully against exact subject `ece3a58f628236e75d5090ddf3f4d7bf4f1d836d`.

Hosted gates:

- Node 22 cumulative controller + writer: PASS — job `103603157970`.
- Node 24 cumulative controller + writer: PASS — job `103603157996`.
- independent writer/CAS/replay/restart adversarial closure: PASS — job `103603235802`.
- complete Control Gateway regression including 001C production mutation and enforcement contracts: PASS.
- cumulative CG-008 through CG-011 hosted qualification: PASS.

A-01 gates:

- metadata-only admission: PASS — job `103603251431`.
- exact-subject A-01 Windows execution: PASS — job `103603280227`.
- runner: `A-01` / Windows / X64.
- policy version: 8.
- registry version: 31.
- subject SHA = checkout SHA = control-plane SHA = `ece3a58f628236e75d5090ddf3f4d7bf4f1d836d`.
- Control Gateway Node suite: 164 tests / 153 pass / 0 fail / 11 intentional live-environment skips.
- CG-008 supervisor adapter: PASS.
- CG-009 coordination + authority: PASS.
- CG-010 night scheduler: PASS.
- CG-011 restart/idempotency + dispatch-failure replay: PASS.
- Supervisor V2 stress: 28 tests / 0 failures / 0 errors.
- randomized invariant stress: 20,000 transitions / seed `0x5EC0D5` / `rigor_reduced=false`.
- independent CG-011 adversarial closure: PASS.
- cumulative qualifier: PASS.
- authoritative A-01 receipt: PASS.
- `promotion_authorized=false`.

Authoritative A-01 evidence:

- artifact ID `10303229190`;
- `SECOND-SHIFT-SUPERVISOR-V2-A01-STRESS-34712308641-evidence`;
- SHA-256 `6cd946c566e97314f6ab3532a5b558b104708b0fdc7dd5b805ed4b49632247fe`.

## 3. Exact qualification boundary

The qualified executable authority is exactly `ece3a58f628236e75d5090ddf3f4d7bf4f1d836d`.

This freeze record and its machine-readable qualification record are documentation-only descendants on a separate evidence ref. They do not change the qualified executable candidate and do not inherit or transfer executable qualification to their documentation SHAs.

Any later executable controller, production writer, A-01, supervisor, or enforcement-code change requires fresh hosted and exact-subject A-01 qualification.

## 4. Production enforcement remains blocked

Writer correctness and production enforcement are separate facts.

A fresh live repository read-back after qualification still shows:

- repository rulesets: `0`;
- `main` head: `c41884bf9cc66c24fb7f245d68eefc6dbbd1139f`;
- `main.protected=false`;
- dedicated production-writer Integration actor ID: not yet bound;
- ordinary mutation-capable identities are therefore not yet technically excluded from controlled refs.

Therefore `PRODUCTION-ENFORCEMENT-GAP-001` remains **OPEN / CRITICAL** and production activation remains false.

The qualified writer is not sufficient by itself. Production closure requires GitHub-side enforcement that makes bypass technically unavailable.

## 5. Required one-time bootstrap

The remaining cutover must occur in this order:

1. create a dedicated GitHub App for the production writer and install it only on `BFochtman746/system-master`;
2. grant the App only `Contents: write` and `Metadata: read`; do not grant Administration, Actions, Issues, or Pull Requests permissions;
3. bind the installed App's Integration actor ID into the 001C enforcement policy;
4. configure the `control-gateway-production` GitHub Environment, restricted to `main`, with the writer App client ID and private key;
5. fast-forward `main` to the exact qualified main-derived 001C candidate as the final pre-enforcement bootstrap write;
6. using separate one-time repository administration authority, create and activate `System Master Control Gateway Production Mutation Boundary` over `~ALL` branches with no exclusions;
7. require `creation`, `update`, `deletion`, and `non_fast_forward`, with `update_allows_fetch_and_merge=false`;
8. configure exactly one bypass actor: the dedicated writer GitHub App Integration, `bypass_mode=always`;
9. read the live ruleset back and verify exact policy equivalence;
10. negatively prove the ordinary ChatGPT GitHub mutation path cannot create or update a branch;
11. positively prove the dedicated receipt-consuming writer can apply one admitted disposable mutation and exact replay is idempotent;
12. only then mark 001C production active.

The current ChatGPT GitHub connection does not expose repository-administration mutation actions required to create a GitHub App, configure its installation/environment credentials, or create the repository ruleset. Those administrative facts must not be invented or bypassed with the existing generic write connection.

## 6. Preserved authority boundaries

001C does not:

- reset or rewrite `main`;
- start CG-012;
- change the CG-011 terminal locator into a successor;
- activate Second Shift Mastery;
- make GitHub Actions a competing scheduler;
- weaken A-01 metadata-only admission;
- authorize force pushes;
- transfer PASS to a changed SHA;
- call production enforcement closed before live negative/positive proof.

`SecondShiftSupervisorV2` remains the sole live scheduling owner for admitted overnight work. GitHub remains durable authority/admission/evidence infrastructure, not a competing scheduler.

## 7. Exact next operation

`GITHUB-A01-CONTROLLER-FORENSIC-RECONCILIATION-001C-R01 — DEDICATED WRITER APP BINDING + ONE-TIME ADMIN RULESET BOOTSTRAP / LIVE NEGATIVE-BYPASS + POSITIVE-WRITER PROOF`

R01 is an administrative production-cutover sub-operation of 001C, not CG-012 and not Second Shift Mastery activation.
