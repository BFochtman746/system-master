# GITHUB-A01-CONTROLLER-FORENSIC-RECONCILIATION-001C

Status: **FROZEN — RECEIPT-CONSUMING EXACT-CAS WRITER EXACT-SHA QUALIFIED / PRODUCTION-ENFORCEMENT CUTOVER BLOCKED / NOT PRODUCTION ACTIVE**

Operation: `GITHUB-A01-CONTROLLER-FORENSIC-RECONCILIATION-001C`  
Work branch: `github-a01-controller-forensic-reconciliation-001c-20260912`  
Qualified executable subject: `ece3a58f628236e75d5090ddf3f4d7bf4f1d836d`  
Qualified predecessor: `65a661dde54149a6892574bc892fbb107022db00`  
Qualified evidence ref: `github-a01-controller-forensic-reconciliation-001c-qualified-blocked`

## 1. Executable closure achieved

001C adds a production mutation layer above the existing CG-005 admission protocol without weakening or silently redefining CG-005 v1.

The new production grant consumes a fresh CG-005 admission receipt and additionally binds an exact mutation-plan digest. Each written UTF-8 payload is SHA-256 bound. The mutation plan path set must exactly equal the admitted path set.

The receipt-consuming writer constructs the exact Git tree, creates a single-parent commit from the admitted predecessor, binds mutation/admission/plan/grant digests into the commit message, rechecks the exact predecessor immediately before ref movement, updates with `force=false`, verifies the written ref, rejects arbitrary moved descendants, and permits idempotent replay only for the exact previously created parent/tree/message identity.

A dedicated production workflow exists with ordinary `GITHUB_TOKEN` read-only. It is designed to mint an ephemeral repository-scoped GitHub App installation token and refuses production execution unless the workflow itself is running from `refs/heads/main` in the protected `control-gateway-production` environment.

## 2. Exact-SHA proof

Workflow run `34712308641` completed successfully on exact executable SHA `ece3a58f628236e75d5090ddf3f4d7bf4f1d836d`.

Hosted proof:

- Node 22 cumulative controller + writer gate: PASS — job `103603157970`.
- Node 24 cumulative controller + writer gate: PASS — job `103603157996`.
- Independent writer/controller adversarial closure: PASS — job `103603235802`.

A-01 proof:

- trusted metadata-only admission: PASS — job `103603251431`.
- A-01 registered execution: PASS — job `103603280227`.
- runner: A-01 / Windows / X64.
- policy v8 / registry v31.
- subject SHA = checkout SHA = control-plane SHA = `ece3a58f628236e75d5090ddf3f4d7bf4f1d836d`.
- Control Gateway Node suite: 164 tests / 153 pass / 0 fail / 11 intentional skips.
- the 001C production-enforcement and receipt-CAS writer tests are included in that Node suite and passed.
- CG-008 through CG-011 cumulative qualification: PASS.
- Supervisor V2 stress: 28 tests / 0 failures / 0 errors.
- randomized invariant stress: 20,000 transitions, seed `0x5EC0D5`, `rigor_reduced=false`.
- cumulative qualifier: PASS.
- A-01 receipt result: PASS with `promotion_authorized=false`.

A-01 evidence artifact:

- ID: `10303229190`
- name: `SECOND-SHIFT-SUPERVISOR-V2-A01-STRESS-34712308641-evidence`
- SHA-256: `6cd946c566e97314f6ab3532a5b558b104708b0fdc7dd5b805ed4b49632247fe`

## 3. Production enforcement is not closed

Fresh live repository read-back after exact-SHA qualification still reports:

- repository rulesets: zero;
- `main` head: `c41884bf9cc66c24fb7f245d68eefc6dbbd1139f`;
- `main` protected: false;
- required status checks enforcement: off.

Therefore a correct/qualified writer does not yet make the Control Gateway unavoidable. Direct GitHub mutation remains technically possible for another mutation-capable identity.

This environment exposes repository-content/ref mutation and ruleset reads but does not expose repository-administration writes required to create the production ruleset or configure a GitHub App/environment. 001C therefore fails closed at the infrastructure-administration boundary rather than inventing production activation.

## 4. Required production cutover facts

Production enforcement may become true only after all of the following are durably proven:

1. A dedicated GitHub App exists and is installed only on `BFochtman746/system-master` with `Contents: write` and `Metadata: read`, and no Administration permission.
2. Its Integration actor ID is bound into the frozen 001C enforcement policy.
3. GitHub Environment `control-gateway-production` exists, is restricted to `main`, and holds `CONTROL_GATEWAY_WRITER_CLIENT_ID` plus `CONTROL_GATEWAY_WRITER_PRIVATE_KEY`.
4. `main` is fast-forwarded to the selected qualified main-derived controller candidate as the final bootstrap write without reset or force.
5. An ACTIVE branch ruleset targets `~ALL`, has no exclusions, restricts creation/update/deletion, blocks non-fast-forward changes, and has exactly one bypass actor: the dedicated writer App Integration.
6. Authenticated live read-back exactly matches the frozen policy.
7. A negative proof shows the ordinary ChatGPT GitHub mutation identity cannot create or update a branch.
8. A positive proof shows the dedicated receipt-consuming exact-CAS writer can apply one admitted disposable mutation and exact replay is idempotent.

## 5. Authority boundary

The exact qualified executable subject is `ece3a58f628236e75d5090ddf3f4d7bf4f1d836d` only. These freeze/evidence commits are documentation-only descendants and do not inherit executable qualification.

001C does not update `main`, does not production-activate the controller, does not start CG-012, and does not activate Second Shift Mastery.

## 6. Exact continuation

`GITHUB-A01-CONTROLLER-FORENSIC-RECONCILIATION-001C-A — DEDICATED GITHUB APP + PROTECTED PRODUCTION ENVIRONMENT + ALL-BRANCH RULESET ADMIN CUTOVER / NEGATIVE-BYPASS + POSITIVE-WRITER LIVE PROOF`

This is an infrastructure-administration continuation of 001C, not a new controller feature operation. It must preserve the exact qualified writer semantics and requires fresh exact-SHA proving only if executable bytes change while binding the production identity/cutover.
