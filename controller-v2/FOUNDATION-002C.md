# CONTROLLER-FOUNDATION-002C — GitHub Durable Journal + Checkpoint Anchor

Status: **RESEARCH COMPLETE / PROVISIONAL DESIGN / IMPLEMENTATION ACTIVE / NOT FROZEN**

Parent contract: `CONTROLLER-FOUNDATION-002B` qualified subject `f15a5e7bfd910ed2239af954ee29ad42e9b866d7`.

## Objective

Implement the real low-cost remote durability adapter for Controller 2.0 without turning the System Master subject repository into controller state. Preserve all frozen 002B semantics: exact event identity, per-stream continuity, controller-wide journal positions and SHA-256 chain, compare-and-swap head behavior, lost-ack recovery, disaster replay, and external checkpoint anchoring.

## Research findings

1. GitHub raw Git objects are a better authority substrate than the Contents API for this use case. GitHub exposes blobs, trees, commits, and refs directly.
2. Updating a Git ref with `force=false` requires a fast-forward and rejects competing sibling commits. This supplies the transport-level CAS/fork detector needed by the journal.
3. The Contents API is convenient but concurrent content mutations conflict and hide the exact tree/commit/ref sequence we need to reason about.
4. GitHub Actions artifacts/logs are retention-bound and therefore cannot be semantic authority.
5. Webhooks and `repository_dispatch` are notifications/wakeup mechanisms only. Failed webhook deliveries are not automatically redelivered, so command/event durability must not depend on notification delivery.
6. GitHub recommends no more than 6 pushes/minute per repository. Physical Git commits therefore cannot be assumed to equal logical semantic events. The adapter must support bounded batching while preserving one logical journal position/digest per event.
7. GitHub rulesets/branch protection can block force pushes/deletions and restrict update actors. Protection is mandatory for production but is not a substitute for the controller's cryptographic journal verification.
8. GitHub App installation tokens can be scoped to selected repositories/permissions and expire after one hour. A dedicated App is preferred to a long-lived PAT.
9. Journal and checkpoint-anchor authority should be separated. A controller bug/credential that can append the journal should not automatically be able to rewrite the independent tail anchor.
10. The connected account currently has no dedicated control-state repository and the available connector cannot create one. Therefore live qualification inside `system-master` is test-only and must never be treated as the production journal.

## Rejected authority substrates

- **Actions artifacts/logs:** expire.
- **Issues/comments:** mutable UI records, awkward ordering/CAS, not a Git append log.
- **Webhooks:** notification delivery is not durable queue storage.
- **`repository_dispatch`:** wakeup only; workflow must exist on default branch and payload limits apply.
- **Contents API as the primary journal primitive:** usable for ordinary files but weaker control over raw commit/ref CAS semantics.
- **System Master `main` or any product branch:** violates subject/control separation.

## Provisional production topology

Dedicated repository required before activation, tentatively:

`BFochtman746/system-master-control-state`

Protected refs:

- `refs/heads/controller-journal/v1` — journal writer authority
- `refs/heads/controller-anchor/v1` — independent checkpoint-anchor authority

Recommended identities:

- **Controller Journal GitHub App:** Contents write only to the control-state repository; ruleset permits journal-ref updates and denies force-push/delete.
- **Anchor authority:** separate GitHub-hosted workflow identity or second GitHub App; ruleset permits only anchor-ref updates. The journal writer must not be the anchor bypass actor.

## Journal storage model

Logical semantic events remain individually ordered and hashed exactly as Foundation 002B defines. Git is only the durable transport container.

A physical journal commit may contain a bounded ordered batch of logical events. One batch commit adds:

- immutable event files at `journal/events/<2>/<2>/<event-id>.json`
- immutable batch manifest at `journal/batches/<shard>/<batch-id>.json`
- current per-stream head files at `journal/streams/<2>/<2>/<sha256(stream-id)>.json`
- current `journal/state/checkpoint.json`

The event file contains the original semantic event plus:

- `journal_position`
- `prev_journal_digest`
- `journal_digest`

The checkpoint contains at least:

- `size`
- `head_digest`
- `last_batch_path`
- `protocol_version`

The batch manifest contains:

- batch identity
- previous batch path
- expected checkpoint
- resulting checkpoint
- ordered event IDs/paths/digests/positions

## Append algorithm

1. Read the journal branch ref and exact head commit.
2. Read and verify the head checkpoint.
3. Require the caller's expected checkpoint to equal the remote checkpoint.
4. If a transport revision was supplied, require it to equal the observed head commit SHA.
5. For every event, validate event digest and per-stream continuation against the stored stream head.
6. Assign logical journal positions and controller-wide journal digests in caller order.
7. Create event, stream-head, batch-manifest, and checkpoint blobs/tree from the exact parent tree.
8. Create one Git commit whose only parent is the observed journal head.
9. Update `controller-journal/v1` with `force=false`.
10. If the ref update conflicts, return `JOURNAL_HEAD_CONFLICT`; never force.
11. If the response is ambiguous/lost, observe the deterministic event path at the current ref before retrying. Exact matching event bytes mean the append succeeded.
12. Unreachable blobs/trees/commits from failed CAS attempts are harmless and are never authority because the protected ref did not advance to them.

## Batching rule

Batching is a transport optimization only. It may not alter:

- semantic event bytes/digest
- local outbox order
- per-stream order
- global journal position
- global predecessor digest
- durability-barrier semantics

Production publisher will flush at a durability barrier even if the current batch is below its normal size/time threshold.

## Recovery/read model

- `get(eventId)` uses the deterministic sharded event path at the selected journal head.
- `list()/verify()` walks the immutable batch-manifest chain from `checkpoint.last_batch_path`, loads referenced event files, and runs the frozen 002B whole-journal verifier.
- Recovery never treats an unreferenced Git object as durable authority.
- A current tree that deletes/modifies a historical journal object is invalid even if the Git update was a fast-forward.

## Independent checkpoint anchor

The journal ref alone cannot prove that its tail was not removed if a privileged actor later rewrites/deletes the ref. A second append-only anchor ref stores checkpoints independently.

An anchor record binds:

- journal repository identity
- journal ref name
- exact journal commit SHA
- `{size, head_digest}`
- previous anchor digest
- anchor digest
- controller/policy identity where applicable
- creation time

Before anchoring, the anchor authority reads `journal/state/checkpoint.json` at the exact journal commit SHA and requires an exact match.

Anchor policy:

- periodic anchors for ordinary progress
- mandatory anchor before any irreversible/high-impact external effect such as canonical promotion
- force-push/delete prohibited on both refs
- anchor authority distinct from journal writer authority in production

## Failure model

The implementation must fail closed for:

- stale expected checkpoint
- stale Git head/competing writer
- non-fast-forward update
- duplicate event ID with altered digest
- duplicate exact event after lost acknowledgement
- missing/mutated prior stream head
- invalid semantic event digest
- branch ref deletion
- branch rewind/truncation against anchor
- batch-manifest gap/loop
- event file missing from a referenced batch
- event path collision
- current checkpoint inconsistent with batch tail
- GitHub outage/rate limiting
- partial object creation before ref update
- response loss after successful ref update
- anchor referencing the wrong journal commit/checkpoint
- anchor ref fork/update/delete

## Production protection requirements

The control-state repository is not authoritative until protections are configured and verified:

- block force pushes
- block deletion of journal and anchor refs
- restrict updates to intended app/authority identity
- no broad human/admin bypass for normal operation
- controller token scoped only to the control-state repository and minimum Contents permission
- anchor identity separated from journal writer identity
- no secrets in journal event payloads

## Capacity/retention constraints

GitHub recommends keeping individual objects below 1 MB and repository on-disk size below 10 GB, and recommends no more than 6 pushes/minute per repository. 002C therefore uses small canonical JSON objects, sharded paths, batching, and an explicit future archive/compaction design. Compaction may create a new journal epoch only; it may never rewrite an already anchored epoch.

## 002C initial qualification denominator

- GHJ-T001 genesis checkpoint is exact and non-authoritative until remote ref exists
- GHJ-T002 one event appends with exact logical journal digest
- GHJ-T003 ordered batch preserves local event order
- GHJ-T004 same-stream events within one batch chain correctly
- GHJ-T005 two writers from one parent: exactly one ref update wins
- GHJ-T006 stale semantic checkpoint rejected
- GHJ-T007 stale transport revision rejected
- GHJ-T008 failed ref CAS leaves unreachable objects but no durable event
- GHJ-T009 lost ref-update acknowledgement is recovered by observation
- GHJ-T010 exact duplicate is idempotent
- GHJ-T011 duplicate event ID with changed digest fails closed
- GHJ-T012 stream predecessor/version fork fails closed
- GHJ-T013 tampered event file detected
- GHJ-T014 missing event file referenced by batch detected
- GHJ-T015 altered batch manifest detected
- GHJ-T016 checkpoint/batch-tail mismatch detected
- GHJ-T017 batch-chain loop/gap detected
- GHJ-T018 whole journal recreates exact 002B checkpoint
- GHJ-T019 GitHub 409/422 non-fast-forward maps to head conflict, never force retry
- GHJ-T020 403/429/5xx/network outage leaves local outbox unsealed
- GHA-T001 anchor verifies checkpoint at exact journal commit before append
- GHA-T002 exact duplicate anchor idempotent
- GHA-T003 anchor with changed bytes at same identity conflicts
- GHA-T004 anchor stale-parent race fails without force
- GHA-T005 journal rollback below anchored checkpoint detected
- GHA-T006 anchor-chain deletion/tamper detected

## Gate status

- 01 Discovery: PASS
- 02 Legacy forensics: PASS
- 03 External research: PASS first full pass
- 04 Requirement extraction: PASS
- 05 Design alternatives: PASS
- 06 Provisional design: PASS
- 07 Adversarial analysis: PASS first pass
- 08 Design repair: PASS first pass
- 09 Formal specification: IN PROGRESS
- 10 Test design: initial 26-test denominator defined
- 11 Implementation: ACTIVE
- 12 Verification: PENDING
- 13 Failure injection: PENDING
- 14 Integration: PENDING
- 15 Qualification: PENDING
- 16 Freeze: PENDING

**Activation blocker:** create a dedicated control-state repository and configure the required protections/credentials. Until then, any live GitHub transport test inside `system-master` is explicitly non-authoritative test evidence only.
