# GITHUB-A01-CONTROLLER-FORENSIC-RECONCILIATION-001C-R01 — ADMIN HANDOFF

Status: **ADMIN BOOTSTRAP REQUIRED / PRODUCTION INACTIVE / EXECUTABLE 001C QUALIFICATION PRESERVED**

Operation: `GITHUB-A01-CONTROLLER-FORENSIC-RECONCILIATION-001C-R01`

Qualified 001C executable: `ece3a58f628236e75d5090ddf3f4d7bf4f1d836d`

Qualified evidence ref: `github-a01-controller-forensic-reconciliation-001c-qualified-frozen`

Current main at R01 start: `c41884bf9cc66c24fb7f245d68eefc6dbbd1139f`

Production activation: **false**

## Critical R01 correction

The exact 001C executable was qualified while `writer_identity.actor_id` in the enforcement policy was still `null`.

The real dedicated GitHub App Integration actor ID is an authority-bearing production configuration value. Binding that value changes the policy/configuration bytes and therefore **cannot inherit the PASS of `ece3a58f...`**.

R01 therefore inserts a mandatory fresh qualification gate after the App actor ID is bound and before `main` moves:

1. create/install the dedicated GitHub App;
2. recover its exact Integration actor ID;
3. bind that ID on a new R01 candidate;
4. hosted Node 22 + Node 24 cumulative qualification;
5. independent writer/CAS/replay/controller adversarial qualification;
6. exact-subject A-01 Windows/X64 qualification on the same SHA;
7. only then fast-forward `main` to that newly qualified R01 SHA.

No PASS transfer is permitted.

## One-time GitHub administrator actions

These actions require repository/account administration and cannot be performed by the current ChatGPT GitHub connection.

### A. Create the dedicated writer GitHub App

Create a GitHub App named:

`System Master Control Gateway Writer`

Required settings:

- owner: `BFochtman746`;
- install only on the `BFochtman746/system-master` repository;
- webhook: not required;
- Repository permissions:
  - Contents: **Read and write**;
  - Metadata: **Read-only**;
- do not grant Administration, Actions, Issues, or Pull Requests permission;
- create a private key;
- record the App Client ID;
- do not place the private key in the repository, an issue, a commit, or chat.

### B. Create the production environment

Repository → Settings → Environments → New environment.

Name:

`control-gateway-production`

Configure deployment branches/tags to **Selected branches and tags**, Branch pattern:

`main`

Add environment variable:

`CONTROL_GATEWAY_WRITER_CLIENT_ID`

Value: the dedicated App Client ID.

Add environment secret:

`CONTROL_GATEWAY_WRITER_PRIVATE_KEY`

Value: the generated dedicated App private key.

### C. Return only the non-secret binding fact

The next controller-safe input required by ChatGPT is the dedicated App's exact GitHub App/Integration actor ID (numeric). Do **not** provide the private key.

After that non-secret ID is available, R01 must bind it on a new candidate and rerun hosted + A-01 exact-SHA qualification before main cutover.

## Post-binding cutover

After the new actor-ID-bound R01 SHA passes hosted and A-01 qualification:

1. verify current `main` is still the expected predecessor or reconstruct any intervening change;
2. require the R01 candidate to be a strict fast-forward descendant of current `main`;
3. fast-forward `main` to the newly qualified R01 SHA with `force=false`;
4. create repository ruleset `System Master Control Gateway Production Mutation Boundary`;
5. target Branches;
6. enforcement Active;
7. target all branches, no exclusions;
8. enable Restrict creations;
9. enable Restrict updates;
10. enable Restrict deletions;
11. block non-fast-forward / force pushes;
12. add exactly one bypass actor: `System Master Control Gateway Writer` GitHub App, Always allow;
13. do not add repository roles, users, teams, the generic GitHub Actions app, or the ChatGPT GitHub connection to bypass;
14. read the live ruleset back through the controller and compare it to the exact intended policy.

## Mandatory live proofs after ruleset activation

### Negative bypass proof

Attempt a disposable ordinary ChatGPT GitHub branch mutation using the existing generic connection. The operation must be denied by the active ruleset. A successful ordinary mutation is a hard production blocker.

### Positive dedicated-writer proof

Using `control-gateway-production` and the dedicated App token path, execute one fully admitted disposable Control Gateway mutation whose request, predecessor, path set, effects, content digests, production grant, and exact-CAS result are all bound.

Then replay the exact same mutation. It must return the already-applied exact commit as an idempotent replay without an additional ref update.

Only after both proofs pass may R01 freeze `production_activation=true`.

## Preserved boundaries

R01 does not:

- start CG-012;
- activate Second Shift Mastery;
- move the CG-011 frozen authority ref;
- reset `main`;
- force-push any ref;
- grant the generic ChatGPT GitHub connection production bypass;
- convert GitHub Actions into scheduler authority;
- change `SecondShiftSupervisorV2` scheduling ownership;
- call production active before the live negative and positive proofs pass.

## Exact continuation trigger

Once the dedicated App is created, installed on `BFochtman746/system-master`, and the `control-gateway-production` environment is configured, continue R01 with the **non-secret numeric App/Integration actor ID only**.
