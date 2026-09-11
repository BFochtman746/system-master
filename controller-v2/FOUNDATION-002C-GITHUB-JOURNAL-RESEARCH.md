# CONTROLLER-FOUNDATION-002C — GitHub Durable Journal / Checkpoint Anchor Research

Status: **RESEARCH + THREAT MODEL FROZEN FOR IMPLEMENTATION DESIGN / NOT YET AUTHORITATIVE**

Parent contract: `CONTROLLER-FOUNDATION-002B`
Qualified parent code subject: `f15a5e7bfd910ed2239af954ee29ad42e9b866d7`
Incubator branch: `controller-v2/foundation-002b`

## 1. Objective

Choose and qualify a GitHub-backed remote durability mechanism that satisfies Foundation 002B without writing evidence, receipts, journal entries, or checkpoints into the System Master subject repository.

The remote mechanism must preserve:

- immutable event identity
- per-stream semantic ordering/integrity
- one global journal order
- compare-and-swap head advancement
- idempotent recovery after lost acknowledgements
- a recoverable whole-history checkpoint
- no subject mutation as a side effect of qualification/evidence recording
- least-privilege credentials
- fail-closed behavior during GitHub/API failure

## 2. Hard separation rule

The journal MUST NOT live in `BFochtman746/system-master`, on any branch, tag, Actions artifact, release, issue, or workflow-generated file.

Reason: a subject repository that also carries its own qualification/evidence authority recreates the original self-invalidating architecture. A subject SHA and its evidence history must be independently versioned.

A dedicated Controller/journal repository is required before the real adapter may become authoritative.

Current repository inventory does not contain a dedicated controller/journal repository. Therefore 002C implementation can be developed against a transport contract and simulated Git data API, but real remote qualification is blocked until the dedicated repository exists and is configured.

## 3. GitHub primitives evaluated

### 3.1 GitHub Actions artifacts — REJECTED as semantic authority

Advantages:
- easy upload/download from workflows
- useful for temporary diagnostics or bulky build evidence

Fatal problems:
- artifacts/logs are retention-bound rather than permanent authority
- default retention is 90 days; public repository maximum is 90 days; private repository maximum is 400 days
- deleting a workflow run can delete associated artifacts
- workflow execution becomes part of the durability path even though the controller must operate independently of one-shot workflows

Decision: Actions artifacts may later carry non-authoritative large evidence bundles, never the transaction/event journal or only copy of a checkpoint.

### 3.2 Issues/comments/releases — REJECTED

Advantages:
- durable-looking user-visible objects
- APIs exist

Fatal problems:
- no natural Git parent-chain CAS publication primitive
- editing/deletion semantics are application objects, not immutable content-addressed history
- poor fit for deterministic replay and atomic segment+checkpoint publication

Decision: not used for controller authority.

### 3.3 Repository Contents API — REJECTED for journal publication

Advantages:
- simple file create/update interface
- existing-file update accepts its prior blob SHA and can conflict on stale updates

Fatal problem:
- one request creates/replaces one path. A controller append needs a new immutable segment and an updated checkpoint to become visible atomically.
- serial Contents API writes create an avoidable state where one path exists without the other.

Decision: may be used for ordinary configuration in later layers, not the authoritative journal append transaction.

### 3.4 Raw Git database API — SELECTED

GitHub exposes raw Git blobs, trees, commits and refs. Creating a tree does not publish it; a new tree is committed and the branch ref is then updated. Updating a ref with `force:false` requires a fast-forward and is specifically intended to avoid overwriting work.

This gives the controller the exact publication model required by 002B:

1. observe current journal branch HEAD `H`
2. verify current `checkpoint.json`
3. construct an immutable segment from the pending event batch
4. construct new checkpoint from 002B global journal chain
5. create segment blob
6. create checkpoint blob
7. create tree based on `H`'s tree with both paths changed in the same tree
8. create commit `C` with exactly one parent: `H`
9. update the journal ref from `H` to `C` using `force:false`
10. only the successful ref advancement is authoritative publication

Objects created before step 9 are harmless if the ref CAS fails: unreachable Git blobs/trees/commits are not journal history.

## 4. Selected repository model

### 4.1 Dedicated repository

Preferred deployment topology:

- separate repository owned by the user
- private by default because semantic events may reveal project names, operations, paths, failures, evidence references or other operational metadata
- dedicated journal branch, recommended logical name `journal`
- Controller runtime does not write System Master subject branches as part of journal persistence

Repository name is deliberately not frozen in 002C research. Configuration addresses the repository by immutable/validated owner+repository identity supplied at deployment.

### 4.2 Plan-aware protection

GitHub's current protection/ruleset features differ by repository visibility and account plan.

- public repositories can use rulesets/protected branches on Free
- private repository rulesets/protected branches require a qualifying paid GitHub plan according to current GitHub documentation

Therefore the controller must not make correctness depend solely on optional administrative protections.

Baseline correctness uses:
- a dedicated repository
- non-force ref CAS (`force:false`)
- exactly-one-parent append commits
- Foundation 002B event/global digest verification
- last-seen checkpoint pinning outside the local transaction database

Hardening, when the plan supports it, additionally requires:
- block force pushes
- block deletion
- restrict updates to the dedicated Controller GitHub App
- linear history
- minimize or eliminate bypass actors

Administrative bypass/repository-owner compromise remains an explicit trust boundary unless an independent witness is added.

## 5. GitHub App credential model

Use a dedicated GitHub App installation credential for the journal repository.

Runtime journal token requirements:
- repository scope: journal repository only
- repository permission: Contents read/write
- no Actions permission
- no Workflows permission
- no Administration permission
- no ability to write the System Master subject repository

GitHub installation tokens expire after one hour. The adapter must acquire/refresh them on demand and must not assume a fixed token string length or format.

A separate credential/installation boundary will later be used for read-only subject observation and any explicitly authorized promotion adapter. One broad token must not combine journal authority and subject mutation authority.

## 6. Journal repository format

Proposed journal branch tree:

```text
/controller-journal-v1.json
/checkpoint.json
/segments/
  00000000000000000001-00000000000000000128-<segment_digest>.jsonl
  00000000000000000129-00000000000000000256-<segment_digest>.jsonl
  ...
```

### 6.1 Protocol descriptor

`controller-journal-v1.json` is immutable after initialization for protocol v1 and identifies:
- journal protocol version
- event schema family
- digest algorithm
- segment encoding
- checkpoint schema

Changing these semantics requires a versioned protocol migration, not an in-place reinterpretation.

### 6.2 Segment

A segment is immutable after publication.

It contains an ordered batch of the exact 002B durable-journal entries, including:
- journal_position
- event_id
- event_digest
- semantic stream fields
- prev_journal_digest
- journal_digest

Segment bytes are deterministic. Segment digest is SHA-256 over the exact segment bytes and appears in the path and checkpoint metadata.

### 6.3 Checkpoint

`checkpoint.json` is the branch-head projection of the journal and contains at minimum:

```json
{
  "schema": "controller.journal.checkpoint.v1",
  "size": 256,
  "head_digest": "...",
  "last_segment": {
    "start": 129,
    "end": 256,
    "sha256": "...",
    "path": "segments/...jsonl"
  },
  "previous_git_commit_oid": "...",
  "protocol_version": "1"
}
```

The Git commit itself is also a checkpoint coordinate. Local last-seen witness state is therefore:

```text
journal_repository_identity
journal_ref
size
head_digest
git_commit_oid
```

## 7. Atomic append algorithm

### Preconditions

- local 002B outbox entries already validated
- remote repo/ref identity validated
- local last-seen checkpoint, if present, reconciled with remote history

### Algorithm

1. GET journal ref -> observed head `H`.
2. GET commit/tree/checkpoint for `H`.
3. Verify `checkpoint.json` schema and internal values.
4. If a local last-seen witness exists, prove the remote head extends or equals it; otherwise stop with `REMOTE_JOURNAL_ROLLBACK_OR_FORK`.
5. Select a bounded contiguous local outbox batch in 002B local append order.
6. Starting at the remote checkpoint, verify every event is the exact next 002B global journal position and semantic-stream successor.
7. Build deterministic segment bytes.
8. Build next checkpoint bytes.
9. POST segment blob.
10. POST checkpoint blob.
11. POST tree with base tree from `H`, adding the segment and replacing `checkpoint.json` in one tree.
12. POST commit with parent exactly `[H]`.
13. PATCH journal ref to candidate commit with `force:false`.
14. If ref update succeeds, re-read ref/checkpoint when needed, atomically persist local last-seen witness, then mark matching local outbox entries durably sealed.
15. If ref update conflicts, do not force. Re-read remote head and reconcile by event IDs/digests; retry from the new head only for events not already durably included.

## 8. Lost-ack algorithm

Failures are classified by publication point.

### Before ref update

Blob/tree/commit creation may have succeeded but the journal ref did not move. No authoritative append occurred. Unreferenced objects are harmless.

### Ref update response lost/timeout

Never resend the mutation blindly.

1. GET current ref.
2. If current ref equals candidate commit -> append succeeded.
3. If current ref is a descendant that already includes the candidate batch/events -> append succeeded and another writer advanced later.
4. If current ref does not include the batch -> original append did not become authoritative; reconcile and retry from current head.
5. If ancestry/history cannot be established -> fail closed `REMOTE_STATE_UNKNOWN`.

This is the GitHub equivalent of 002B's external-mutation observation-before-retry rule.

## 9. Concurrency model

Controller v1 still intends one active writer, but the remote adapter must remain safe under accidental duplicate controller instances.

If two writers observe `H` and construct sibling commits `C1` and `C2`:

- one non-force ref update may advance `H -> C1`
- `H -> C2` is no longer a fast-forward and must not be forced
- the loser re-reads HEAD and reconciles

No lock service is required for correctness. Local single-owner enforcement remains desirable for efficiency and operational simplicity, but Git ref CAS is the remote safety backstop.

## 10. Batching decision

Do NOT create one Git commit per semantic event by default.

Reasons:
- each append requires multiple Git API requests
- GitHub App installations have finite primary and secondary rate limits
- event bursts would create unnecessary commit/object pressure

Use bounded contiguous batches. Exact event-count/byte/time thresholds are intentionally not frozen until benchmark/failure testing. Correctness must be independent of batch size, including batch size 1.

## 11. Rate-limit and token behavior

GitHub App installation tokens expire after one hour.

Adapter behavior:
- on 401 caused by token expiry: acquire one fresh installation token and retry the idempotent read or pre-publication object creation step
- never blindly retry an ambiguous ref mutation; observe first
- on primary rate limit exhausted: honor `x-ratelimit-reset`
- on secondary rate limit: honor `retry-after` when present; otherwise bounded exponential backoff
- controller journal outage/rate limiting leaves local outbox pending and blocks any operation that requires the durability barrier

GitHub documents a 5,000 requests/hour minimum primary rate limit for non-Enterprise GitHub App installations, scaling in some installations up to 12,500. This is ample for a batched single-controller journal, but tests must cover throttling.

## 12. Recovery design

On startup/recovery:

1. authenticate read-only/read-write to dedicated journal repo
2. resolve exact journal ref
3. read branch HEAD and `checkpoint.json`
4. compare with locally persisted last-seen witness
5. if remote is older, divergent, or cannot prove expected continuity -> stop; do not accept commands
6. enumerate required immutable segments
7. verify segment path/digest
8. verify every 002B semantic event digest/per-stream sequence
9. verify every 002B global journal position/digest
10. verify final computed checkpoint equals remote checkpoint
11. rebuild/reconcile local SQLite operational store
12. only then enter READY

A backup may accelerate startup but cannot override a conflicting remote journal.

## 13. Independent checkpoint witness

A Git branch cannot by itself defend against a sufficiently privileged repository administrator who intentionally rewrites/deletes the ref and all local last-seen state is also lost.

002C therefore distinguishes two assurance levels:

### Level A — operational integrity baseline

Protects against:
- controller bugs
- retries/timeouts
- process duplication
- stale writes
- compromised workers
- ordinary token scope mistakes
- accidental branch rewrites when protections are enabled

Uses dedicated repo + Git CAS + branch protections when available + local last-seen checkpoint.

### Level B — malicious-admin rollback detection

Requires an independent witness outside the same GitHub administrative authority. Possibilities include a second provider/repository under a separate trust domain or externally timestamped/signed checkpoints.

Level B is not silently claimed by the GitHub-only design. It will be a later optional assurance layer unless the deployment threat model explicitly requires malicious-account-owner resistance.

## 14. Threat model

| Threat | Required response |
|---|---|
| duplicate append request | same events remain one journal history |
| two writers race same head | one wins; loser reconciles; never force |
| timeout before blob/tree/commit | safe bounded retry |
| commit created, ref not advanced | unreachable object; no authority change |
| ref advanced, response lost | observe before retry |
| stale ref/checkpoint | CAS conflict / stop and reconcile |
| event byte tampering | digest validation rejects |
| semantic stream gap/fork | 002B journal admission rejects |
| omitted middle segment | global position/digest validation rejects |
| truncated remote tail vs local witness | rollback detection; stop |
| no local witness after malicious admin rewrite | GitHub-only baseline cannot prove rollback; independent witness required for Level B |
| GitHub outage | local outbox remains pending; durability-dependent mutation blocked |
| 401 expired token | refresh token; never turn into wider permissions |
| 403/429 rate limit | honor GitHub backoff/reset; fail closed |
| 404 repo/ref | stop authority; no auto-create or silent replacement |
| repository rename/transfer | repository identity must be revalidated; no guessing |
| compromised Second Shift worker | worker has no journal credential/port |
| compromised subject workflow token | cannot write dedicated journal repo |
| stolen journal token | limited to dedicated repo Contents permission; branch protections/CAS reduce destructive operations but token theft remains security event |
| controller host compromise | controller authority is compromised; detection/recovery requires checkpoint history/audit; prevent privilege expansion |
| force push/delete by admin | block where plan supports; local witness detects rollback while retained |
| Actions artifact expiry | irrelevant to journal authority |
| clock rollback | journal order derives from positions/commit chain, not timestamps |
| token string format changes | token treated as opaque string |

## 15. Failure/qualification denominator before real adapter can freeze

The GitHub adapter must pass at least the following cases:

1. initialize empty journal repo/ref deterministically
2. first append creates exact segment+checkpoint in one published commit
3. parent of append commit equals observed HEAD
4. adapter always requests `force:false`
5. duplicate append is idempotent
6. same event ID/different digest hard-fails
7. two appenders racing one head result in one canonical successor
8. losing race never force-updates ref
9. loser rebase/reconciliation does not duplicate events
10. timeout before blob creation
11. timeout after segment blob
12. timeout after checkpoint blob
13. timeout after tree creation
14. timeout after commit creation
15. timeout/lost response after successful ref update
16. ref reports candidate commit exactly -> success recovery
17. ref advanced past candidate containing batch -> success recovery
18. ref advanced without candidate batch -> retry from new head
19. inability to establish remote reality -> `REMOTE_STATE_UNKNOWN`
20. 401 expired token refresh path
21. repeated 401 fails closed
22. 403 permissions failure fails closed
23. primary 429/403 rate-limit reset handling
24. secondary-rate-limit retry-after handling
25. GitHub 5xx bounded retry before publication
26. GitHub 5xx after ambiguous publication -> observe before retry
27. repository 404 fails closed
28. journal ref missing fails closed except explicit initialization command
29. repository identity changed/transfer mismatch fails closed
30. remote checkpoint schema mismatch
31. checkpoint size mismatch
32. checkpoint head digest mismatch
33. checkpoint previous Git commit mismatch
34. missing referenced last segment
35. segment digest/path mismatch
36. missing middle segment
37. out-of-order segment positions
38. duplicate journal position
39. semantic event digest corruption
40. semantic stream gap/fork
41. remote tail older than local witness
42. remote divergence from local witness
43. remote extension of local witness accepted
44. total local DB loss rebuilds exact 002B semantic state from journal
45. local backup newer than remote journal does not override remote authority
46. local backup older than remote journal catches up from journal
47. crash after remote publication before local outbox seal re-observes and seals locally
48. crash after local candidate construction before ref update produces no authoritative mutation
49. batch size 1
50. batch size maximum event count
51. maximum permitted encoded byte size
52. event larger than configured batch/file limit fails explicitly before remote mutation
53. Unicode/canonical bytes stable across Node 22/24 reference tests
54. token has only intended journal repo/Contents permission in deployment verification
55. journal runtime does not require Actions or Workflows permission
56. adapter contains no force-update/delete-ref operation
57. subject repository is never accepted as journal repository identity
58. worker port has no journal adapter/credential
59. journal append never mutates System Master subject SHA
60. recovery cannot become READY until remote checkpoint validation completes

## 16. Design decision

**SELECTED:** Dedicated GitHub repository + raw Git database API + immutable batch segment + `checkpoint.json` in one Git commit + exactly-one-parent linear history + branch ref fast-forward update with `force:false` + locally persisted last-seen checkpoint witness.

**REJECTED:** System Master branch, Actions artifacts, releases/issues as authority, and multi-call Contents API publication.

## 17. What could still make this selected design fail

The design is not yet proven until implementation tests show that GitHub's real ref-update behavior, authentication refresh, error surfaces, and branch/ruleset configuration match the modeled adapter.

The largest remaining risks are:

1. deployment uses the wrong repository or a credential with excessive scope
2. branch protection/ruleset capabilities are unavailable on the user's GitHub plan
3. local checkpoint witness is stored unsafely and lost during the same incident as local SQLite
4. real GitHub error responses differ from simulator assumptions
5. batch/segment sizes create practical API limits or rate pressure
6. repository admin/account compromise can rewrite GitHub-only authority unless an independent witness is added
7. repository transfer/rename invalidates identity assumptions
8. accidental use of `force:true` or ref deletion in future code reintroduces history overwrite
9. a transport implementation marks local outbox sealed before remote ref publication is actually observed

Each risk has a named test or deployment gate. 002C will not freeze on unit tests alone.

## 18. Exact next operation

`CONTROLLER-FOUNDATION-002C-A — GITHUB GIT-DATA ADAPTER CONTRACT + FAULT-INJECTING SIMULATOR + 60-CASE QUALIFICATION HARNESS`

Only after the simulator passes will we create/configure a dedicated remote journal repository and run destructive integration qualification against it. The System Master subject repository remains untouched by runtime journal data.

## Source basis

Research was grounded in current GitHub documentation for:

- raw Git database, blobs, trees, commits and references
- non-force reference updates / fast-forward protection
- repository Contents API single-path update semantics
- GitHub App installation tokens, repository/permission scoping and one-hour expiration
- REST API primary/secondary rate limits
- repository rulesets and protected-branch behavior
- Actions artifact/log retention behavior

Research date: 2026-09-11.
