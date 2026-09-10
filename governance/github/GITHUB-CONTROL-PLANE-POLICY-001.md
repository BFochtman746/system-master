# GITHUB-CONTROL-PLANE-POLICY-001

Status: PROPOSED_FOR_ADMISSION
Owner: SYSTEM_MASTER
Scope: repository-wide GitHub source custody, workflow execution, exact-subject qualification, promotion, evidence, runner trust and unattended-control integration.

## Purpose

System Master already has canonical product authority, owner boundaries, obligation selection, repair controls, Second Shift execution controls and exact-SHA evidence rules. GitHub is the execution and custody substrate for those controls; it must not become a second authority system.

This policy adds the GitHub-native enforcement layer needed so repository state cannot silently bypass System Master governance.

## Authority order

1. `governance/CURRENT-AUTHORITY.json` remains the canonical startup selector.
2. Topology and owner controls determine semantic ownership.
3. The current obligation registry determines open work.
4. Second Shift registry/delegations determine unattended owner-lane routing.
5. This policy governs GitHub transport, workflow, runner, evidence and promotion mechanics only.
6. A GitHub workflow, branch, commit message, Actions result or chat assertion never overrides a newer canonical authority record.

## Non-negotiable invariants

### 1. Protected canonical branch

`main` must be protected by GitHub server-side policy when the account plan permits it. Target controls are:

- pull request required for normal mutation;
- required System Master control checks before merge;
- block force pushes and deletion;
- require linear history unless a documented merge exception is admitted;
- require verified/signed commits where operationally compatible;
- no routine administrator bypass;
- unique required-check job names.

Workflow-side checks are defense in depth and are not a substitute for server-side branch protection.

### 2. Least privilege

Every workflow declares permissions explicitly. Read-only workflows use `contents: read`. Write authority is scoped to the smallest job/workflow and must not be present on pull-request execution paths. `write-all` is forbidden.

Read-only checkout must use `persist-credentials: false`. A write-capable workflow may persist credentials only when the same job is the admitted promotion/mutation boundary.

### 3. Immutable workflow dependencies

External actions are pinned to a full 40-character commit SHA. Container actions are pinned by digest. Same-repository composition should use GitHub's exact-commit self-repository `$/` syntax when all relevant runners are version 2.336.0 or newer; `./` remains acceptable where checkout compatibility is intentionally required.

Dependabot maintains pinned action dependencies so immutability does not become patch stagnation.

### 4. Untrusted-trigger isolation

`pull_request_target` is denied by default. Self-hosted/A-01 runners must not execute untrusted pull-request code. Event-derived values are treated as untrusted input and are routed through environment variables/validated data rather than directly interpolated into shell commands.

### 5. Bounded execution and mutation serialization

Every job has an explicit timeout. Mutation-capable workflows have concurrency/lease protection. A stale branch/ref or changed authority at promotion time is classified and fails closed; it is not force-pushed over newer work.

### 6. One reusable exact-subject admission lifecycle

Recovered/imported tool source follows:

`STAGE -> FREEZE/READY -> VERIFY CARRIER -> MATERIALIZE -> VERIFY MANIFEST -> CREATE IMMUTABLE SUBJECT SHA -> QUALIFY READ-ONLY -> SEAL PROVENANCE -> PROMOTE`

Staging/chunk arrival does not run expensive qualification. Qualification is triggered only after a complete frozen carrier/manifest or an explicit dispatch bound to that frozen input.

Historical PASS never transfers to a different Git SHA.

### 7. Promotion separated from qualification

Qualification is read-only against an immutable subject. Promotion is a narrow, separately authorized mutation after the exact subject and receipt are known. A workflow must not obtain write authority merely because it performs tests.

### 8. SLSA-style evidence minimum

Every authoritative qualification receipt records at least:

- exact subject Git SHA;
- source/carrier/manifest digests where applicable;
- workflow path and workflow-file digest;
- GitHub run id and attempt;
- triggering event/ref/actor classification;
- runner class and relevant runner image/version;
- toolchain/runtime versions actually used;
- external parameters and resolved dependencies needed to reproduce the run;
- test/gate results;
- produced artifact digests;
- authority boundaries, including explicit false claims for A-01/native/production when not proven.

Native GitHub artifact attestations may supplement this receipt when the repository plan supports private-repository attestations; they do not replace System Master authority classification.

### 9. A-01 runner trust boundary

A-01 is an authoritative native-evidence lane only for claims actually executed there. It is not a general CI runner.

Preferred design is one-job ephemeral/JIT registration plus environment cleanup. If persistent hardware is retained, each admitted job must pass a pre-job integrity/reset guard and preserve runner logs outside the working directory. No untrusted PR code may execute on A-01.

### 10. Second Shift inheritance is automatic

There is one reusable root owner lane for SYSTEM_MASTER-owned headless portfolios: `governance/second-shift/SYSTEM-MASTER-DELEGATIONS.json`.

Documents, Spreadsheet/Math/Data, Software Engineering/Local Model, Research/Knowledge, Connected Actions, Media and future SYSTEM_MASTER-owned headless capabilities inherit that lane. A per-tool Second Shift owner file is forbidden unless the tool is deliberately promoted to a first-class owner system through topology/registry admission.

Every READY/ACTIVE obligation must route to a valid current owner lane. The central root objective must have a valid current root delegation or a valid all-eight-rungs-exhausted proof. Owner coverage is machine-enforced.

### 11. Durable evidence, not green-screen evidence

A green Actions badge is not enough. Control/qualification workflows publish durable machine-readable reports. Completion claims cite exact receipts/subjects, not workflow color alone.

### 12. Run-volume control

Workflow fan-out is a control defect when staging events repeatedly invoke expensive work. Transport uploads, chunk commits and bookkeeping changes use cheap preflight checks. Heavy qualification runs once per frozen exact subject unless a classified retry is admitted.

## System-wide enforcement

`.github/scripts/github-control-plane-audit.js` scans all workflow definitions and required Second Shift root controls. `.github/workflows/github-control-plane-enforcement.yml` runs the scanner, existing Second Shift owner coverage and durable evidence publication.

Blocker classes fail immediately. Error classes are migration-blocking under strict mode. Warnings require review but do not create authority by themselves.

## Current known external gap

On 2026-09-10 the live `main` branch reports `protected: false`, and the repository rulesets API reports that private-repository rulesets are not enabled for the current plan. The repository must not be made public to solve this. Server-side protection is an external/account entitlement/configuration action and must be revalidated after any plan/settings change.

Until server-side protection is enabled, this policy improves workflow safety and evidence but cannot truthfully claim that `main` is non-bypassable.

## Change rule

A change to GitHub control mechanics must preserve canonical owner authority, exact-subject evidence and Second Shift coverage. If it changes CURRENT-AUTHORITY or the current root authority binding, the SYSTEM_MASTER Second Shift delegation must be reconciled in the same working session before the state is declared ready.
