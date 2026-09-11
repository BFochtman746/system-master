# CONTROLLER-FOUNDATION-002D — Durable Command Inbox + Chat-to-Controller Ingress

Status: **DISCOVERY / RESEARCH / PROVISIONAL DESIGN — NOT FROZEN**

Parents:

- `CONTROLLER-FOUNDATION-002B` qualified transaction kernel: `f15a5e7bfd910ed2239af954ee29ad42e9b866d7`
- `CONTROLLER-FOUNDATION-002C` qualified GitHub durability adapter: `8b0f9517570fa29f3f09bc7f1db38c34fcbe84fa`

## Objective

Allow ChatGPT/user intent to be deposited durably while the local Controller/Second Shift machine is offline, discovered later without guessing from chat history, authenticated at a GitHub trust boundary, ingested idempotently into the 002B transaction kernel, and optionally used to wake execution without making notification delivery authoritative.

## Requirements extracted so far

1. A submitted command must remain discoverable while the local controller is offline.
2. Chat memory, webhook delivery, GitHub Actions queueing, and `repository_dispatch` are not command authority.
3. Two chats must be able to submit commands concurrently without one overwriting the other.
4. A command becomes immutable at submission; correction/supersession is a new command.
5. Same command identity + same bytes is idempotent; same identity + different bytes is a hard conflict.
6. Git transport metadata such as commit author/tagger text is not treated as authenticated logical user identity.
7. Transport authorization and command semantic authorization are separate. Arrival means “candidate intent,” not “execute.”
8. Every accepted command is handed to the frozen 002B idempotency/transaction layer exactly once semantically.
9. Invalid/rejected ingress must itself be auditable without creating a product transaction.
10. Wakeup delivery may be lost indefinitely without losing the command.
11. Controller restart/local DB loss must be able to rediscover unprocessed commands from GitHub.
12. The inbox must be separate from System Master subject state and must not mutate the 002C journal/anchor refs.
13. Production ingress protections must be mechanically preflighted, not documented only.
14. Runtime ingress authority may create a command record exactly once but may not update/delete prior commands.
15. Dangerous commands remain subject to later admission/approval policy; transport acceptance is not promotion authority.

## Alternatives evaluated

### A. Shared append-only inbox branch

Pros: natural total order; compact ref set; easy projection.

Cons: every chat contends on one head; submission requires CAS/retry; writer App needs update permission to the persistent authority ref; fast-forward commits can still alter current-tree historical files unless independently verified; human command rate is low but the design reintroduces a shared mutable serialization point before controller admission.

Disposition: **REJECT for v1 ingress authority**.

### B. GitHub Issues/comments

Pros: convenient sender identity/UI; easy discovery.

Cons: mutable/editable/deletable records; not a content-addressed immutable command substrate; issue semantics become part of controller authority.

Disposition: **REJECT as command authority**. May be used later as a UI projection only.

### C. `repository_dispatch`, workflow dispatch, webhook

Pros: useful notification/wakeup mechanisms.

Cons: event delivery/Actions execution is not the durable command record. `repository_dispatch` depends on configured listeners/workflows; failed webhook deliveries are not automatically redelivered.

Disposition: **WAKEUP ONLY, NEVER AUTHORITY**.

### D. One immutable Git ref per command

Pros: no shared-head write race; create-once semantics; Git object/content identity; independently protectable namespace; controller can rediscover refs after offline periods; same command ID maps naturally to one ref.

Cons: ref count grows; discovery eventually needs sharding/index optimization; no intrinsic total order across concurrent commands.

Disposition: **SELECTED FOR v1**.

## Selected representation

Use an annotated Git tag object that points directly to the canonical command-envelope blob.

Namespace:

`refs/tags/controller-inbox/v1/<command-id>`

where `<command-id>` is the exact UUIDv7 `CommandEnvelope.command_id`.

Submission objects:

1. canonical JSON command blob
2. annotated tag object pointing to that blob (`type: blob`)
3. immutable tag ref pointing to the tag object

The tag object exists to give GitHub a typed immutable object/ref relationship. Tagger text/message are informational only and are not authorization evidence.

The controller accepts a ref only if:

- ref namespace and command ID are exact
- tag object exists and targets a blob
- tag name matches the command ref identity
- blob is valid canonical UTF-8 JSON
- 002B strict CommandEnvelope validation passes
- command ID in blob equals command ID in ref
- supplied/derived command fingerprint matches
- the observed inbox protection configuration is authoritative

## Why no global inbox order

Concurrent intent does not have a trustworthy intrinsic total order merely because timestamps or UUIDv7 values can be sorted. Controller correctness must not depend on wall-clock ordering.

The controller assigns local discovery/admission order when it ingests candidates. Semantic conflicts are resolved through preconditions, expected subject identity, policy, dependencies, and admission—not “whichever timestamp looks first.”

If two commands conflict, both source intents remain immutable evidence and one/both can become blocked/rejected/superseded according to admission policy.

## Protection topology

Target tag namespace: `controller-inbox/v1/*` (exact GitHub fnmatch expression to be qualified during implementation/provisioning).

### Creation-authorization ruleset

- `creation` restriction
- active
- exactly the authorized ingress GitHub principal(s) as bypass

### Immutability ruleset

- `update` restriction
- `deletion` restriction
- block force/non-fast-forward updates where applicable
- active
- **no always-bypass actor**

This means the ingress principal may create a new command ref but cannot alter or delete it afterward.

Unlike journal/anchor authority, ingress principal may eventually be a GitHub App or an explicitly configured GitHub user/OAuth actor depending on the supported ChatGPT connector identity. That actor identity must be observed and preflighted; it will not be guessed from command JSON.

## Durable discovery

Controller polling uses GitHub `GET /git/matching-refs/tags/controller-inbox/v1/` (or a qualified sharded descendant prefix) with Contents read permission.

Each discovered ref is independently read and validated. Already-observed refs are idempotent.

Initial v1 may perform prefix scans at expected low human command volume. Scaling work will introduce namespace/time sharding and a disposable index/projection without making the index authoritative. Full recovery always remains possible from protected command refs plus the accepted/rejected semantic journal.

## Ingress processing model

Provisional states:

`DISCOVERED -> VALIDATED -> ACCEPTED`

or

`DISCOVERED -> REJECTED`

or, for recoverable infrastructure conditions,

`DISCOVERED/VALIDATED -> DEFERRED -> retry`

Transport read failure is not semantic rejection.

Accepted path:

1. discover immutable command ref
2. verify tag/blob/ref and authority namespace
3. parse/strictly validate 002B CommandEnvelope
4. record ingress observation locally
5. call 002B `acceptCommand`
6. same command ID/bytes returns existing transaction on duplicate ingestion
7. bind ingress provenance (`ref`, tag object ID, blob ID, configured ingress principal) to local ingress record
8. emit/publish ingress acceptance semantics through the 002C durable journal

Crash between steps is reconciled idempotently. The frozen 002B unique command ID/fingerprint remains the semantic duplicate guard.

Rejected ingress does not create a product transaction; it records a bounded rejection reason and durable ingress-rejection event without persisting secrets/raw sensitive diagnostics.

## Wakeup model

After command ref creation, an ingress client may issue `repository_dispatch`, a webhook-triggering operation, or another future wake signal containing only a command/ref hint.

Rules:

- wake signal is best-effort
- loss or duplication is harmless
- payload is a hint, not command authority
- controller always re-reads the immutable command ref before ingestion
- controller polls on startup and periodically even if no wake arrives

GitHub documents that failed webhooks are not automatically redelivered, so polling the durable inbox is mandatory.

## Security/adversarial questions still open

1. Exact GitHub identity exposed by ChatGPT’s connected GitHub write path and whether it can be constrained to a dedicated ingress App/actor.
2. Exact tag-rule fnmatch target and effective-rules API behavior for newly-created refs.
3. Whether a command ref namespace should be date-sharded immediately or only after measured scale.
4. Maximum accepted command blob size and strict field/content limits.
5. How to represent ingress provenance in the SQLite schema without weakening frozen 002B command semantics.
6. Rejected-ingress event schema and bounded reason taxonomy.
7. Poll cadence/backoff/rate-limit behavior when PC returns after a long offline interval.
8. Recovery algorithm when local ingress-observation rows are lost but commands were already accepted into the semantic journal.
9. Whether high-impact command classes require a separate user-approval object before admission/execution (expected to belong to a later policy/approval layer).

## Initial test denominator

- IN-T001 valid immutable command tag/blob is discovered and accepted
- IN-T002 controller offline during submission; command is accepted after restart/poll
- IN-T003 two concurrent command ref creations do not contend on one mutable head
- IN-T004 same command ref rediscovered 1,000 times yields one transaction
- IN-T005 same command ID with altered bytes cannot be admitted
- IN-T006 ref command ID and blob command ID mismatch rejected
- IN-T007 tag points to wrong object type rejected
- IN-T008 invalid canonical JSON rejected
- IN-T009 unknown CommandEnvelope field rejected by frozen 002B validation
- IN-T010 malformed/unsupported command protocol rejected
- IN-T011 transport outage defers rather than semantically rejects
- IN-T012 rate limiting defers and carries retry metadata
- IN-T013 lost/duplicate wake signal does not affect durability
- IN-T014 command accepted before crash is not duplicated after ingress-row loss/recovery
- IN-T015 rejected command is durably auditable without creating a product transaction
- IN-T016 ingress principal cannot update a previously-created command ref under required ruleset topology
- IN-T017 ingress principal cannot delete a command ref
- IN-T018 unauthorized principal cannot create command ref
- IN-T019 missing/hidden protection data blocks authoritative ingress activation
- IN-T020 command commit/tag metadata is never trusted as logical issuer authentication
- IN-T021 two semantically conflicting commands remain distinct immutable intents for admission adjudication
- IN-T022 stale expected subject in command is never silently retargeted
- IN-T023 notification payload alone cannot create transaction
- IN-T024 full scan recovers an unobserved command even if every wake notification was lost
- IN-T025 command blob size/schema limits fail before admission
- IN-T026 production ingress repository must equal activated control-state repository identity

## Gate status

- 01 Discovery: PASS first pass
- 02 Legacy forensics: PASS (requirements inherited from controller failure audit)
- 03 External research: ACTIVE / strong first pass
- 04 Requirement extraction: ACTIVE
- 05 Design alternatives: PASS first pass
- 06 Provisional design: PASS first pass
- 07 Adversarial analysis: ACTIVE
- 08 Design repair: PENDING
- 09 Formal specification: PENDING
- 10 Test design: initial 26-test denominator
- 11 Implementation: PENDING
- 12 Verification: PENDING
- 13 Failure injection: PENDING
- 14 Integration: PENDING
- 15 Qualification: PENDING
- 16 Freeze: PENDING
