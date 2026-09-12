# GITHUB-A01-CONTROLLER-FORENSIC-RECONCILIATION-001C-R01

Status: **EXECUTABLE REPAIR QUALIFIED / PRODUCTION ADMIN BOOTSTRAP PENDING**

Qualified executable SHA: `2222778c44dba46a56d37e3cced1e41986f9beef`  
Exact qualified ref: `github-a01-controller-forensic-reconciliation-001c-r01-runtime-binding-qualified-frozen`  
Qualification run: `34713246052`  
Production activation: **false**

## Repair closure

R01 found a fail-closed deployment-binding defect before production cutover. The prior qualified policy kept `writer_identity.actor_id=null`, which correctly prevented accidental bypass but meant the live enforcement audit could never pass. Committing the installed App's numeric actor ID into the policy after qualification would have changed the exact qualified SHA and invalidated PASS transfer.

The repaired contract keeps the repository policy as an unbound deployment template. The installed dedicated writer GitHub App Integration ID is supplied only at cutover/runtime through `CONTROL_GATEWAY_WRITER_INTEGRATION_ID`. Runtime binding rejects missing, invalid, zero, or conflicting identities. The exact live ruleset must contain that Integration as its single bypass actor.

The repair touched only five files: the enforcement core, enforcement audit script, enforcement tests, policy template, and implementation contract. Production writer, A-01 control-plane, SecondShiftSupervisorV2, scheduler, and Second Shift Mastery runtime code were not changed by the repair.

## Qualification

Exact SHA `2222778c44dba46a56d37e3cced1e41986f9beef` passed:

- hosted Node 22 cumulative qualification;
- hosted Node 24 cumulative qualification;
- independent writer/CAS/replay/restart adversarial closure;
- A-01 metadata-only admission;
- A-01 Windows/X64 exact-subject execution on runner `A-01`;
- Control Gateway Node suite: 166 tests / 155 pass / 0 fail / 11 intentional live-environment skips;
- CG-008 supervisor adapter;
- CG-009 coordination and authority;
- CG-010 night scheduler;
- CG-011 restart/idempotency and dispatch-failure replay;
- Supervisor V2: 28 tests, 0 failures, 0 errors;
- 20,000 randomized transitions, seed `0x5EC0D5`, `rigor_reduced=false`;
- independent CG-011 adversarial closure.

A-01 receipt result is PASS with `promotion_authorized=false`.

Authoritative A-01 evidence artifact:

- artifact ID `10304490707`;
- `SECOND-SHIFT-SUPERVISOR-V2-A01-STRESS-34713246052-evidence`;
- SHA-256 `4f169fa5815588bd3eddf4fbe94f3817915910f40c3f73ecc628c11aa24c977e`.

## Exact qualification boundary

Executable qualification belongs only to `2222778c44dba46a56d37e3cced1e41986f9beef`.

This freeze and the machine-readable qualification record live on a separate evidence ref. Their descendant documentation SHAs do not inherit executable qualification.

## Main ancestry

At freeze time, current `main` was `c41884bf9cc66c24fb7f245d68eefc6dbbd1139f`.

The qualified R01 candidate is 21 commits ahead and 0 behind that main SHA. Therefore the production bootstrap remains a strict fast-forward. No reset, force update, or merge is required or authorized.

## Remaining production-admin boundary

A fresh live read still shows zero repository rulesets and `main.protected=false`. `PRODUCTION-ENFORCEMENT-GAP-001` therefore remains **OPEN / CRITICAL**.

The current ChatGPT GitHub connection does not expose repository-administration mutations for GitHub App registration/installation, environment secret/variable configuration, or repository-ruleset creation. R01 must not simulate those facts using the ordinary mutation-capable GitHub connection.

The remaining ordered cutover is:

1. create the dedicated Control Gateway Writer GitHub App;
2. install it only on `BFochtman746/system-master` with `Contents: write` and `Metadata: read` only;
3. configure `control-gateway-production`, restricted to `main`, with the App client ID and private key;
4. capture the installed App Integration ID as deployment/runtime data, not a Git commit;
5. fast-forward `main` to exact qualified SHA `2222778c44dba46a56d37e3cced1e41986f9beef` as the final pre-enforcement bootstrap write;
6. create and activate `System Master Control Gateway Production Mutation Boundary` over all branches, with no exclusions, restricting creation/update/deletion and blocking non-fast-forward updates;
7. configure exactly one bypass actor: the dedicated writer GitHub App Integration, always allow;
8. live-read the ruleset and verify exact equivalence using the runtime Integration ID;
9. negatively prove the ordinary ChatGPT GitHub mutation path cannot create or update a disposable branch;
10. positively prove the dedicated receipt-consuming exact-CAS writer can apply one admitted disposable mutation and exact replay is idempotent;
11. only then set production activation true.

## Preserved boundaries

R01 does not start CG-012, does not activate Second Shift Mastery, does not change CG-011 terminal authority into a successor, and does not make GitHub Actions a competing scheduler. `SecondShiftSupervisorV2` remains the sole live scheduling owner for admitted overnight work.
