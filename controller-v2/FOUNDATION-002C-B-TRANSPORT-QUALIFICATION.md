# CONTROLLER-FOUNDATION-002C-B — GitHub Transport Contract Qualification

Status: **TRANSPORT CONTRACT QUALIFIED / REAL REMOTE BLOCKED / NON-AUTHORITATIVE**

Parent contracts:
- `CONTROLLER-FOUNDATION-002B` — frozen deterministic transaction kernel
- `CONTROLLER-FOUNDATION-002C` — frozen GitHub durability research/threat model
- `CONTROLLER-FOUNDATION-002C-A` — simulator contract qualified

Qualified code subject: `7528228e21e0118f742d3260d27a9605638837ac`
Hosted qualification run: `34654617532`
Incubator branch: `controller-v2/foundation-002b`

## Meaning of this seal

002C-B proves the controller's GitHub REST transport contract and its boundary with the Git-data journal adapter using deterministic HTTP-response injection. It does **not** prove that a real GitHub journal repository, GitHub App installation, live branch/ruleset policy, live rate-limit behavior, live credential rotation, or real network failure semantics have been qualified.

No runtime journal data has been written to `BFochtman746/system-master`, and none is permitted there.

## Qualified denominator

The exact qualified subject executes **173/173 PASS** on both hosted Node.js 22 and Node.js 24.

This denominator includes:
- frozen Controller Foundation 002B tests;
- all 60 002C-A Git-data simulator cases `GJ-T001` through `GJ-T060`;
- 19 real-GitHub REST transport-contract cases `GH-T001` through `GH-T019`;
- 5 transport/journal boundary cases `GB-T001` through `GB-T005`;
- recovery, migration, protocol, storage, authority-port, journal-integrity and failure-injection tests.

## Real GitHub transport contract now qualified in isolation

The transport shim qualifies the following behavior without a live remote:

1. raw Git blob create/read endpoint shapes;
2. Git tree creation with deterministic non-executable blob entries;
3. recursive tree reads fail closed when GitHub reports truncation;
4. exact Git commit parent lists are preserved;
5. journal refs are created as fully qualified `refs/heads/...` names;
6. force ref updates are forbidden by the client before any request is made;
7. an optional expected-old-head pre-observation rejects a known stale writer before PATCH;
8. actual ref mutation always sends `force:false`;
9. a 401 triggers exactly one credential refresh attempt;
10. repeated 401 becomes `GITHUB_AUTHENTICATION_FAILED`;
11. 429 and rate-limit-signaled 403 responses become `GITHUB_RATE_LIMITED` and expose wait/reset metadata without blind immediate retry;
12. ordinary 403 becomes `GITHUB_PERMISSION_DENIED` and preserves GitHub's accepted-permissions hint when present;
13. mutating network failures are classified as ambiguous external state;
14. read network failures are unknown but explicitly non-mutating;
15. 409 maps to `NON_FAST_FORWARD` for journal contention handling;
16. 422 remains distinct as `GITHUB_VALIDATION_FAILED` until destructive live integration proves which concrete 422 shapes, if any, are safe to classify as contention;
17. transport errors expose the top-level `status` and `ambiguous` compatibility fields consumed by the journal adapter while retaining the named controller error/details;
18. a missing journal ref in a seeded repository is recognized as an initialization opportunity;
19. an unseeded/branchless repository fails `JOURNAL_REPOSITORY_UNSEEDED` before any Git blob/tree/commit mutation;
20. the real transport and journal initializer interoperate under the normalized missing-ref contract.

## Research-backed GitHub constraints frozen into the implementation

### Ref compare-and-swap semantics

GitHub's update-ref API accepts the new object SHA and `force`, but it does not expose an expected-old-SHA request field. Therefore the client may pre-observe the old head for diagnostics/early stale-writer rejection, while the authoritative race barrier is GitHub's own non-fast-forward enforcement with `force:false`.

The real integration gate must deliberately race two live writers and record the exact GitHub status/body returned to the loser. In particular, HTTP 422 must not be globally reclassified as contention merely because the update-ref documentation lists 422; 422 is also used for validation/abuse conditions.

### Repository bootstrap

GitHub does not permit creating a reference in a completely empty repository, even when the target commit object already exists. The dedicated journal repository therefore must contain at least one seed commit/branch before journal initialization. The controller preflights this condition and fails before creating unreachable Git objects.

### Credentials

The intended production credential is a GitHub App installation token scoped to the dedicated journal repository. Installation tokens are short-lived and must be refreshable; the transport never stores a permanent personal token as part of journal state.

Minimum mutation permission expected by the raw Git database endpoints is repository **Contents: write**. Broader administration permissions are not runtime journal requirements.

### Rate limits and abuse controls

The transport surfaces `Retry-After`, primary rate-limit reset metadata, and permission/rate-limit distinctions. Scheduling/backoff policy remains above the raw transport so it can serialize mutation work and avoid hidden automatic replays of ambiguous mutations.

### Branch/ruleset protection

The dedicated journal branch should be configured to reject force pushes and deletion. Where the account/repository supports it, the controller GitHub App should be the narrow update/bypass principal rather than human users or broad workflow tokens.

## Real-remote infrastructure prerequisite

A dedicated repository does not currently exist in the connected account. The current user-owned repositories visible to the connector are unrelated product/development repositories plus `BFochtman746/system-master`; none may be repurposed as the journal.

Before destructive 002C-C qualification can run, provision a new dedicated repository, for example `BFochtman746/controller-journal`, with:

1. one seed commit/branch so the repository is not branchless;
2. the controller GitHub App/credential installed with the minimum required repository permissions, including Contents write;
3. no use as a System Master subject/code repository;
4. a dedicated `journal` branch created by controller initialization;
5. branch/ruleset protection preventing force-push/deletion where available;
6. an explicit test-only qualification window in which destructive rollback/deletion/fork scenarios may be exercised safely.

The currently connected GitHub toolset can inspect and mutate existing repositories but does not expose repository creation, so this prerequisite cannot be completed from the current connection without a separately provisioned repository.

## Exact next operation

`CONTROLLER-FOUNDATION-002C-C — LIVE DEDICATED-REPOSITORY DESTRUCTIVE QUALIFICATION`

Required live cases include at minimum:

- repository identity and seeded-repository preflight;
- initialize `heads/journal` against real GitHub;
- first and multi-segment append;
- exact duplicate append;
- same-ID/different-digest conflict;
- two real concurrent writers to one head;
- observe exact 409/422 contention behavior;
- lost/ambiguous acknowledgement reconciliation using controlled transport interruption where practicable;
- token expiry/refresh;
- real permission denial and accepted-permissions diagnostics;
- rate-limit/backoff observation without abusive load generation;
- branch/ruleset force-push/deletion protection;
- local witness detects rollback/fork;
- deleted/moved journal ref fails closed;
- remote checkpoint/segment corruption detection using a qualification-only mutation path;
- complete disaster rebuild from the live journal into a fresh local controller store;
- prove recovery cannot become READY until remote checkpoint/journal validation has completed.

002C remains non-authoritative until this live gate passes.
