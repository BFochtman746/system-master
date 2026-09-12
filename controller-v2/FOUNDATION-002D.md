# CONTROLLER-FOUNDATION-002D — Durable Command Inbox + Chat-to-Controller Ingress

Status: **REFERENCE IMPLEMENTATION QUALIFIED / FROZEN / PRODUCTION INGRESS ACTIVATION BLOCKED_EXTERNAL_SETUP**

Parent chain:

- `CONTROLLER-FOUNDATION-002B` frozen transaction/idempotency kernel
- `CONTROLLER-FOUNDATION-002C` frozen GitHub durable journal/anchor adapter; qualified code subject `8b0f9517570fa29f3f09bc7f1db38c34fcbe84fa`
- `CONTROLLER-FOUNDATION-002C-C1` production control-state activation closure; hosted exact-subject qualification PASS at `a2ed4205cb7674b41f09db42fd9e687cdcf8eb2d`

Qualified 002D code subject: `8ba81e2fba9da87f95675dd868dd34d1d264d7a3`.

Hosted qualification run: `34660287271`.

- Node 22: **198/198 PASS**
- Node 24: **PASS**
- workflow permissions: `contents: read`, `metadata: read`

This document-only freeze commit is not a replacement qualification subject; the exact code subject above is the qualified implementation.

## Objective

Allow ChatGPT/user intent to be deposited durably while the local Controller/Second Shift machine is offline, rediscovered without chat-history guesses, authenticated at a mechanically verified GitHub trust boundary, ingested idempotently into the frozen transaction kernel, and optionally used as a wake hint without making notification delivery authoritative.

## Frozen authority model

### Immutable command authority

Each command is represented as:

1. canonical command JSON blob;
2. annotated Git tag object that points directly to that blob (`type: blob`);
3. create-once Git tag ref:

`refs/tags/controller-inbox/v1/<command-id>`

There is no shared mutable inbox head and no timestamp-derived semantic ordering requirement.

A command is accepted as a durable candidate only after re-reading and validating the full ref -> annotated tag -> blob chain.

### Exact command validation

The inbox reuses the frozen 002B `CommandEnvelope` validator and semantic fingerprint. It fails closed for:

- wrong namespace/ref identity;
- tag/ref identity mismatch;
- tag target not a blob;
- malformed JSON;
- non-canonical JSON;
- unsupported protocol/schema;
- unknown command fields;
- command ID mismatch between ref and blob;
- missing/changed semantic fingerprint;
- command above the bounded size limit.

Same command ID + same immutable bytes is idempotent. Same command ID + different bytes is a hard conflict.

Git tagger/commit metadata is transport metadata only and is never logical user identity.

### Exactly-once semantic ingestion

`DurableCommandInbox.ingest()` performs immutable-source validation before calling the frozen 002B `acceptCommand()` boundary.

Rediscovery or repeated ingestion of the exact same durable command resolves to the existing transaction. It cannot create a second semantic transaction.

Conflicting user intents remain distinct immutable commands and are adjudicated later by admission/policy semantics rather than hidden transport ordering.

### Wakeup is not authority

`resolveCommandWakeHint()` contains no ControllerKernel dependency and no transaction/admission method.

A wake hint can only cause a re-read of the durable inbox command. Missing, duplicated, delayed, or forged notifications cannot manufacture command authority.

Polling/full scan remains the correctness path.

### Rejected ingress is durable evidence

A semantically invalid command does not create a product command or transaction.

`recordDurableIngressRejection()` emits a bounded `ingress.rejected` semantic event through the existing SQLite event/outbox path and forces the 002C durability barrier before returning.

The durable rejection event contains only bounded provenance:

- source ref;
- tag object ID when known;
- blob object ID when known;
- stable bounded reason code.

Raw exception text, command secrets, or unbounded diagnostics are not written into the rejection event.

The frozen semantic reducer verifies the event chain and safely ignores `ingress.*` events for product-state reconstruction, so rejection audit cannot create or mutate a product transaction.

## Production ingress protection — frozen

Production ingress authority must be mechanically preflighted against the exact C1-activated control-state repository.

Required topology for `controller-inbox/v1/*`:

### Creation authorization

- active tag ruleset containing a creation restriction;
- exactly the configured ingress GitHub App is the sole `always` bypass actor.

### Immutability

- active update restriction with no bypass;
- active deletion restriction with no bypass;
- no always-bypass actor in any immutability rule.

### Runtime binding

The ingress runtime token/transport must bind exactly to:

- the C1-activated control-state repository name;
- its stable numeric repository ID;
- the configured ingress GitHub App principal.

A documentation-only or evaluate-only ruleset does not satisfy activation.

## Failure behavior

002D fails closed or defers explicitly for:

- command ID/bytes collision;
- malformed/corrupt tag/blob/ref chain;
- schema/protocol mismatch;
- oversized command;
- missing/hidden/incorrect protection state;
- wrong repository or numeric repository ID;
- wrong ingress App principal;
- immutable-ref conflict;
- GitHub rate limiting/outage/network ambiguity.

Recoverable transport conditions become `DEFERRED`; they are not converted into semantic rejection.

## Qualification evidence

Exact code subject: `8ba81e2fba9da87f95675dd868dd34d1d264d7a3`

Hosted run: `34660287271`

Result:

- Node 22 — 198 tests / 198 passed / 0 failed
- Node 24 — completed successfully

The denominator includes all inherited 002B/002C/C1 tests plus 002D immutable inbox, offline recovery, duplicate/conflict, schema/canonicality, size, exactly-once ingestion, authority preflight, bounded durable rejection audit, and non-authoritative wake-hint tests.

The selected GitHub transport model was also checked against current GitHub REST/ruleset behavior: annotated tag objects may point to blobs; the tag object and ref are separate Git database operations; repository tag rulesets expose creation/update/deletion restrictions and bypass actors.

## Production activation blocker

Reference implementation qualification is complete, but live production ingress activation remains blocked until the external production control-state installation exists and its tag rules are configured/observed:

1. dedicated control-state repository exists;
2. C1 journal/anchor authority is activated;
3. ingress GitHub App is installed/scoped to that repository;
4. create-only/immutable tag namespace rulesets are active;
5. privileged inspection proves exact effective rules and bypass actors;
6. authoritative ingress preflight passes against the real repository name/ID/principal;
7. live create-once tag enforcement is qualified.

Therefore:

- **002D reference implementation qualification: PASS / FROZEN**
- **002D production ingress activation: BLOCKED_EXTERNAL_SETUP**

No state inside `BFochtman746/system-master` is reclassified as production command authority by this freeze.

## Exact successor

`CONTROLLER-FOUNDATION-003 — RELIABILITY / EXTERNAL-EFFECT / RECOVERY REBIND`

The older Foundation-003 branch is preserved as evidence but is not a valid descendant of the current 002C/C1/002D authority chain. The successor must therefore adjudicate its historical 19 acceptance obligations against the current frozen kernel/journal/ingress implementation, reuse already-proven semantics where exact, repair only genuine residual gaps, and qualify a new descendant before Foundation-004 process ownership/lifecycle is rebased.
