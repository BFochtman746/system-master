# CONTROLLER-FOUNDATION-002C — GitHub Durable Journal + Checkpoint Anchor

Status: **REFERENCE IMPLEMENTATION QUALIFIED / FROZEN / PRODUCTION ACTIVATION BLOCKED_EXTERNAL_SETUP**

Parent contract: `CONTROLLER-FOUNDATION-002B` qualified subject `f15a5e7bfd910ed2239af954ee29ad42e9b866d7`.

Qualified 002C code subject: `8b0f9517570fa29f3f09bc7f1db38c34fcbe84fa`.

Hosted qualification run: `34654594735`.

- Node 22: **157/157 PASS**
- Node 24: **157/157 PASS**
- workflow permissions during qualification: `contents: read`, `metadata: read`

This document-only freeze commit is not a replacement qualification subject; the exact code subject above is the qualified implementation.

## Objective

Provide Controller 2.0 with a low-cost GitHub-backed durable semantic journal and independent checkpoint-anchor path without turning the System Master subject repository into controller state. Preserve the frozen 002B semantics for exact event identity, per-stream continuity, controller-wide journal positions/digests, compare-and-swap heads, lost-ack recovery, disaster replay, and durability barriers.

## Frozen architecture

Production requires a dedicated repository, tentatively:

`BFochtman746/system-master-control-state`

Authoritative refs:

- `controller-journal/v1`
- `controller-anchor/v1`

The System Master repository is not a valid production control-state repository.

### Journal

Logical semantic events retain their 002B bytes and event digests. Git commits are transport containers only and may batch multiple logical events.

Stored material includes:

- immutable event objects: `journal/events/<2>/<2>/<event-id>.json`
- content-addressed batch manifests: `journal/batches/<2>/<2>/<batch-id>.json`
- per-stream heads: `journal/streams/<2>/<2>/<sha256(stream-id)>.json`
- current checkpoint: `journal/state/checkpoint.json`

The checkpoint binds at least `{size, head_digest, last_batch_path, last_batch_digest, protocol_version}`.

Append authority requires both:

1. semantic checkpoint compare-and-swap, and
2. Git transport compare-and-swap through a non-forced fast-forward ref update.

A competing sibling commit loses. Unreachable Git objects from a failed race are not authority.

### Batching

Physical Git commits may batch bounded ordered semantic events to remain well below GitHub push-frequency limits. Batching may never alter local outbox order, semantic event bytes/digests, stream order, global journal positions, global predecessor digests, or durability-barrier semantics.

The SQLite publisher seals a confirmed batch atomically. A failed batch remains pending and later outbox rows cannot bypass it.

### Checkpoint anchor

The anchor is a second append-only hash-linked chain. An anchor record binds:

- control-state repository identity
- journal ref
- exact journal commit SHA
- exact `{size, head_digest}`
- previous anchor identity/digest
- timestamp
- anchor digest

Before writing an anchor, the anchor authority reads the checkpoint from the exact journal commit SHA and requires an exact match. The journal must continue to extend the latest anchor.

### Runtime credentials

Production uses two distinct GitHub Apps:

- Journal App
- Anchor App

Each receives a short-lived installation token scoped to the single control-state repository with only `contents: write`. The reference implementation creates RS256 App JWTs, uses short JWT lifetime, requests one-repository installation-token scope, caches only until the safety refresh window, and never stores the App private key in Git or journal state.

Journal and anchor runtime transports are bound to:

- configured repository `owner/name`
- immutable numeric repository ID
- expected GitHub App ID
- expected authoritative branch

Runtime authority is update-only. It may not create either authority ref.

### Provisioning/runtime split

Production setup order is:

1. create dedicated control-state repository and initial Git object
2. privileged provisioner creates explicit empty journal and anchor refs
3. configure and activate layered branch rulesets
4. install/configure two separate GitHub Apps
5. privileged authority inspector resolves effective rulesets including bypass actors
6. authoritative preflight verifies repository name/ID, branches, apps, protections, and actual bytes
7. only then construct writable runtime journal/anchor authority

Bootstrap is idempotent and never rewrites an existing authority ref.

## Ruleset topology — frozen

A single ruleset with a writer bypass is insufficient because bypass applies to every rule in that ruleset.

Each authoritative branch therefore requires layered protection:

### Writer-authorization ruleset

- branch-targeted `update` restriction
- active enforcement
- exactly the designated GitHub App as the sole `always` bypass actor

### Integrity ruleset

- active `deletion` restriction
- active `non_fast_forward` / block-force-push rule
- **no always-bypass actors**

All applicable rulesets remain enforced together. This allows the designated App to append while preventing that same runtime credential from deleting or rewriting the authoritative ref.

Protection inspection is a privileged provisioning/audit operation. Runtime App tokens do not gain Administration permission merely to inspect rulesets.

## Live GitHub CAS proof

A non-authoritative disposable test ref `controller-v2/journal-transport-test` was created from parent `36ef2009cf2e44000becd4f66954a1121bbf2857`.

Two sibling commits were created from that same parent:

- candidate A: `b3d6b5f74634cf95280329a23405c8ffaabcbf1e`
- candidate B: `d35066c7bd4bc1b8aa6ef2107cd5023b8632e145`

Candidate A advanced the ref with `force:false`. The subsequent attempt to update the same ref to sibling candidate B with `force:false` was rejected by GitHub with HTTP 422 `Update is not a fast forward`.

This verifies the core transport CAS assumption against live GitHub. The test ref is explicitly non-authoritative evidence and is not a production journal.

## Failure behavior — frozen

002C fails closed for, among other cases:

- stale semantic checkpoint
- stale Git transport revision
- sibling/non-fast-forward race
- duplicate event ID with changed bytes
- partial duplicate batch
- stream gap/fork
- semantic event tamper
- missing event/batch
- batch content-address mismatch
- checkpoint/tail mismatch
- anchor chain gap/tamper
- journal rollback against anchor
- deleted authority refs after preflight
- GitHub outage
- ambiguous network response
- primary/secondary GitHub rate limiting
- true permission denial
- lost acknowledgement after successful ref update
- token permission mismatch
- token repository-scope mismatch
- runtime App identity mismatch
- runtime repository name or numeric-ID mismatch
- hidden/incomplete ruleset bypass data
- missing or evaluate-only protection

Lost acknowledgement is resolved by observation before retry. Consequential controller operations still require the 002B durability barrier.

## Threat boundary

The journal/anchor separation, distinct Apps, cryptographic chains, CAS, and layered rulesets are designed to contain controller bugs, stale writers, worker compromise, and compromise of one runtime App credential.

They do **not** claim to defeat a malicious or compromised GitHub repository administrator who can edit/delete the rulesets themselves. GitHub repository administrators can manage repository rulesets. Defending against that higher threat requires a checkpoint witness outside that administrator's authority (for example, an external append-only/transparency witness or separately administered authority). That is a future hardening option, not silently claimed by 002C.

## Production activation blocker

The connected GitHub account currently has no dedicated `system-master-control-state` repository, and the available connector cannot create repositories or install/configure the required GitHub Apps/rulesets.

Therefore:

- **002C reference implementation qualification: PASS / FROZEN**
- **002C production activation qualification: BLOCKED_EXTERNAL_SETUP**

No state inside `system-master`, including the test transport branch, is to be interpreted as production Controller 2.0 authority.

## Qualification evidence

Exact code subject: `8b0f9517570fa29f3f09bc7f1db38c34fcbe84fa`

Hosted run: `34654594735`

Result:

- Node 22 — 157 tests / 157 passed / 0 failed
- Node 24 — 157 tests / 157 passed / 0 failed

The denominator includes all frozen 002B kernel tests plus 002C journal, raw REST transport, rate-limit, anchor, batching, preflight, ruleset inspection, GitHub App token, authoritative-construction, and bootstrap tests.

## Gate status

- 01 Discovery: PASS
- 02 Legacy forensics: PASS
- 03 External research: PASS
- 04 Requirement extraction: PASS
- 05 Design alternatives: PASS
- 06 Provisional design: PASS
- 07 Adversarial analysis: PASS
- 08 Design repair: PASS
- 09 Formal specification: PASS
- 10 Test design: PASS
- 11 Implementation: PASS
- 12 Verification: PASS
- 13 Failure injection: PASS
- 14 Integration with frozen 002B kernel: PASS
- 15 Reference qualification: PASS
- 16 Reference freeze: PASS
- Production activation: BLOCKED_EXTERNAL_SETUP

## Exact successor

`CONTROLLER-FOUNDATION-002D — DURABLE COMMAND INBOX + CHAT-TO-CONTROLLER INGRESS`

002D must design how ChatGPT/user intent is durably deposited while the local controller is offline, authenticated/admitted exactly once when it comes online, and separated from notification/wakeup delivery. It must consume 002B transaction/idempotency semantics and 002C durable Git transport without making GitHub notification delivery authoritative.
