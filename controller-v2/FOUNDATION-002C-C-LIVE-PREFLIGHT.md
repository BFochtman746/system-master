# CONTROLLER-FOUNDATION-002C-C — Live Dedicated-Repository Qualification Preflight

Status: **SOFTWARE PREFLIGHT QUALIFIED / LIVE REMOTE BLOCKED / NON-AUTHORITATIVE**

Parent contracts:
- `CONTROLLER-FOUNDATION-002B` — deterministic kernel qualified
- `CONTROLLER-FOUNDATION-002C` — GitHub durability research/threat model frozen
- `CONTROLLER-FOUNDATION-002C-A` — Git-data simulator qualified
- `CONTROLLER-FOUNDATION-002C-B` — GitHub REST transport contract qualified

Qualified preflight subject: `799351d4057c5e52d611b52d257b69761f0ca7b6`
Hosted qualification run: `34654759904`
Incubator branch: `controller-v2/foundation-002b`

## Qualification result

The exact preflight subject executes **184/184 PASS** on hosted Node.js 22 and Node.js 24 with zero failures/skips/todos.

The added `LQ-T001` through `LQ-T011` denominator proves that the live destructive qualification cannot begin unless all of the following are true:

1. the journal repository is explicitly configured as `owner/name`;
2. the subject repository is explicitly configured;
3. journal and subject repositories are different;
4. `BFochtman746/system-master` is unconditionally forbidden as the journal even if another repository is supplied as the subject;
5. destructive qualification is explicitly opted into with boolean `true`;
6. a stable qualification identity is supplied;
7. an expected owner can be pinned and mismatches fail before repository access;
8. the resolved GitHub repository identity exactly matches the configured journal identity;
9. archived repositories are rejected;
10. branchless/unseeded repositories are rejected before journal-ref mutation/read progression;
11. known lack of write permission is rejected;
12. an existing `heads/journal` ref is rejected for the fresh destructive qualification protocol;
13. a seeded, writable, dedicated repository with no journal ref passes preflight without mutating it.

## Current hard blocker

No dedicated controller/journal repository exists in the connected GitHub account. The connected account currently exposes only existing product/development repositories, none of which satisfy the frozen separation contract.

The current GitHub connector exposes operations on existing repositories but does not expose repository creation. Therefore the live remote cannot be provisioned by this controller session.

## Required infrastructure provisioning

Create a new dedicated repository under the intended owner, recommended name:

`BFochtman746/controller-journal`

Provision it with:

- private visibility if available/appropriate;
- one harmless seed commit on its default branch, such as a README, because GitHub does not permit creation of the first ref in a branchless repository;
- no System Master source code or subject artifacts;
- access for the controller GitHub App/qualification credential;
- minimum runtime Git-data mutation permission including repository Contents write;
- branch/ruleset policy, where supported, that prevents deletion and force-push of `journal` while permitting the narrow controller principal to perform ordinary fast-forward updates;
- no pre-created `journal` branch: qualification initialization owns creation of `heads/journal` after preflight.

## Exact operation after provisioning

`CONTROLLER-FOUNDATION-002C-C1 — LIVE REMOTE IDENTITY + PERMISSION + SEED + EMPTY-JOURNAL PREFLIGHT`

Then, only if C1 passes:

`CONTROLLER-FOUNDATION-002C-C2 — LIVE JOURNAL INITIALIZATION + FIRST APPEND + READBACK + WITNESS SEAL`

Then:

`CONTROLLER-FOUNDATION-002C-C3 — LIVE CONCURRENCY / IDEMPOTENCY / ACK-LOSS / RATE-LIMIT / CREDENTIAL-ROTATION QUALIFICATION`

Then:

`CONTROLLER-FOUNDATION-002C-C4 — LIVE ROLLBACK / FORK / REF-DELETION / CORRUPTION / DISASTER-REBUILD QUALIFICATION`

No subsequent controller layer may treat GitHub durability as authoritative until C1-C4 pass and a final 002C closure receipt is sealed.
