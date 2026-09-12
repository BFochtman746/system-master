# CONTROLLER-FOUNDATION-005-C1 — Forensic Recovery / Requirement Rebind 001

Status: RECOVERED / INVENTORIED / ANALYZED / TARGETED-RESEARCH-COMPLETE / DESIGN-LOCK-PENDING
Canonical working branch: `controller-v2/foundation-005-c1-rebind`
Qualified predecessor source: `controller-v2/foundation-004-c1-rebind@2b87514935948603f3fd6e322852038aa56ea12c`
Predecessor qualification receipt commit: `0a4f26145a358d045508cd5b4ef46d6b9e0b9e9a`
Historical Foundation-005 archaeology only: `controller-v2/foundation-005@5dc4b83811d8a1af1c48d7cdbab71e22e7863fc5`
Production Controller activation standing: `BLOCKED_EXTERNAL_SETUP`

## 1. Purpose and authority fence

Foundation-005 adds an authenticated **local live command-intake adapter** to the current C1-derived Node Controller. It does not replace the protected immutable Git command inbox frozen by Foundation-002D and must not weaken its restart/offline rediscovery, create-once command authority, wakeup-as-hint, or idempotency properties.

The historical Python Foundation-005 implementation is recovered as requirements/evidence only. It is not implementation authority because it predates the current C1-derived Node line and its storage/lifecycle contracts.

No CORE, LEARNING, BOOK or DOCUMENTS owner control or specialist semantic is owned here.

## 2. Recovered historical requirement set

The historical acceptance contract contained 20 explicit acceptance requirements. All 20 are retained as requirement intent and rebound below; Python-specific mechanisms are not automatically retained.

| Historical ID | Requirement intent | C1 rebind disposition |
| --- | --- | --- |
| F005-001 | authenticated local client can submit one valid command | RETAIN; Node IPC + application HMAC |
| F005-002 | wrong authentication key cannot mutate durable command state | RETAIN |
| F005-003 | missing/short auth key rejected before service use | RETAIN |
| F005-004 | raw auth material absent from DB/protocol/endpoint/logs | RETAIN + expand to status/evidence |
| F005-005 | protocol must not use unsafe serialization | RETAIN; no pickle equivalent; bounded UTF-8 JSON only |
| F005-006 | invalid UTF-8 rejected without mutation | RETAIN |
| F005-007 | malformed JSON rejected without mutation | RETAIN |
| F005-008 | duplicate JSON object keys rejected | RETAIN; requires strict parser because `JSON.parse` is insufficient |
| F005-009 | oversized input rejected before mutation | RETAIN; bound re-adjudicated to current command envelope |
| F005-010 | spoofable identity/policy fields rejected | RETAIN |
| F005-011 | server binds authoritative transport provenance and runtime Controller/policy identity | RETAIN with transport-vs-semantic-auth clarification |
| F005-012 | Controller not READY rejects without durable command mutation | RETAIN |
| F005-013 | valid request creates exactly one command and transaction | RETAIN; reuse frozen 002B kernel |
| F005-014 | exact replay returns original transaction as duplicate | RETAIN |
| F005-015 | same command ID with changed semantics hard-conflicts | RETAIN |
| F005-016 | request relationships are validated before mutation | REPAIR; historical parent/relation fields have no current 002B authority and may not be silently recreated |
| F005-017 | endpoint identity deterministic for exact DB identity + Controller instance | RETAIN + shorten/hash for Unix path bounds |
| F005-018 | protocol errors expose bounded stable codes, never internal exception text | RETAIN |
| F005-019 | intake contains no provider mutation/scheduler/lane/worker/qualification/promotion execution | RETAIN |
| F005-020 | exact subject must pass inherited + intake tests cross-platform | RETAIN; current hosted matrix is Ubuntu/Windows × Node 22/24 |

Unaccounted historical requirements: **0/20**.

## 3. Current C1-derived substrate inventory

### 3.1 Durable semantic authority already exists

`ControllerKernel.acceptCommand()` is already the semantic create-once/idempotency authority. It:

- validates the frozen command envelope;
- computes a canonical SHA-256 semantic fingerprint;
- inserts one `commands` row and one `transactions` row atomically;
- returns the existing transaction for same command ID + same semantic fingerprint;
- raises `IDEMPOTENCY_CONFLICT` for same command ID + different semantic contents;
- appends durable `command.accepted` evidence;
- leaves the new transaction `OPEN` rather than admitted/active.

Foundation-005 must call this authority and must not introduce a second command table, second fingerprint algorithm, second semantic deduplication store or second transaction identity.

### 3.2 Protected Git ingress already exists

Foundation-002D's `durable-command-ingress.js` owns protected Git tag/ref/blob intake and restart/offline rediscovery. It deliberately treats webhook/wakeup information as hints, re-reads immutable Git identity, bounds transport retries, and delegates semantic acceptance to the frozen kernel.

Foundation-005 therefore cannot become the sole ingress mechanism. A local socket/pipe is live transport, not a durable offline inbox. Commands that must survive Controller downtime without a live client retry continue to use the Foundation-002D durable inbox.

### 3.3 Lifecycle readiness and single-process authority now exist

Foundation-004 supplies exact database identity, process ownership, recovery-before-READY and fail-closed status publication. Local intake may listen only while the owning runtime is READY and must cease admission before ownership is released.

### 3.4 Missing reusable surfaces

No current C1-derived reusable implementation was found for:

- authenticated local IPC server/client;
- bounded stream framing for Node IPC;
- mutual application authentication over the exact request bytes;
- strict JSON parsing with recursive duplicate-key rejection;
- server-side local-request -> frozen 002B command-envelope projection;
- local protocol stable rejection/response taxonomy;
- endpoint derivation specialized for Node's Windows named-pipe / Unix-socket paths.

These are genuine Foundation-005 build obligations rather than reasons to revive historical Python modules.

## 4. Targeted external research and design impact

Research was limited to questions capable of changing the design.

### Node IPC

Current Node `node:net` documentation states that IPC uses Windows named pipes and Unix-domain sockets elsewhere. IPC endpoints are identified by `path`. Unix filesystem socket paths are length-bounded and can persist after a process crash; Windows named pipes disappear when the owning process exits.

Source: <https://nodejs.org/api/net.html>

**Adjudication:** use `node:net`; derive a short endpoint token from canonical database identity + current Controller instance ID. Do not reuse a prior instance endpoint and do not use stale-time/PID heuristics to decide whether to unlink another instance's socket. Instance-specific naming avoids needing a stale-socket authority algorithm.

### HMAC / comparison

Current Node `node:crypto` provides HMAC-SHA-256 and `timingSafeEqual`; the latter is suitable for fixed-length HMAC digest comparison but does not make surrounding code timing-safe by itself.

Source: <https://nodejs.org/api/crypto.html>

**Adjudication:** Foundation-005 will use a minimum 32-byte secret, HMAC-SHA-256, cryptographically random per-connection challenge material, fixed-length digest comparison and one authenticated command per connection. Authentication is application-level and does not rely on mutable pipe/socket metadata.

### JSON duplicate members

RFC 8259 says object member names SHOULD be unique and warns that behavior for duplicate names is unpredictable across implementations.

Source: <https://www.rfc-editor.org/rfc/rfc8259.html>

**Adjudication:** plain `JSON.parse()` cannot satisfy the duplicate-key requirement because duplicates have already collapsed before a reviver can reliably adjudicate them. The portable implementation needs a strict bounded parser/validator that rejects duplicate member names recursively before semantic projection.

### Windows named-pipe security

Microsoft documents that a named pipe created with the default security descriptor grants read access to Everyone and the anonymous account in addition to broader creator/system/admin rights.

Source: <https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights>

**Adjudication:** Windows default named-pipe ACLs are never the Controller authentication boundary. HMAC remains mandatory. Service-account/DACL hardening remains a deployment evidence class and is not fabricated by portable tests.

### UUIDv7 time field

RFC 9562 defines UUIDv7's most-significant 48 bits as Unix-epoch milliseconds.

Source: <https://www.rfc-editor.org/rfc/rfc9562.html>

**Adjudication:** the local adapter may deterministically derive the frozen command envelope's `created_at` millisecond from `command_id`, avoiding a server-now value that could change the semantic fingerprint across an unknown-response retry. This derived timestamp is command identity metadata, not proof of real-world submission time.

## 5. Adversarial analysis

### A. Fake local server / endpoint squatting

A pathname or pipe name is not authentication. A local process can race or squat a predictable endpoint. The client therefore must authenticate the server cryptographically before transmitting command bytes, and the server must authenticate the exact command bytes before parsing them as an admissible request.

### B. Captured command replay

Transport replay must not create a second semantic command. Per-connection server nonce/challenge prevents a captured authenticated frame from validating on a new connection; frozen 002B command ID + fingerprint remains the final semantic duplicate guard.

### C. Unknown response after durable commit

The caller may lose the response after the kernel commit. An exact semantic retry must reconstruct the same command envelope and return the existing transaction. No server-generated current timestamp, random issuer, or mutable metadata may alter the fingerprint on replay.

### D. Same command ID / changed request

Authentication does not make mutation acceptable. A changed semantic request with the same `command_id` must reach the frozen 002B conflict guard and return bounded `IDEMPOTENCY_CONFLICT` without creating another transaction.

### E. Authenticated-but-not-authorized caller

Possession of the local HMAC credential proves only transport credential possession. It does not prove human identity, delegated authority, dangerous-command approval, GitHub provider authority, qualification authority or promotion authority. Accepted commands remain `OPEN`; later identity/policy/admission gates own semantic authorization.

### F. JSON ambiguity

Duplicate object keys, invalid Unicode/UTF-8, excessive nesting/size, unknown fields, numeric edge cases and trailing bytes are rejected before kernel mutation. No implementation may rely on "last duplicate key wins" behavior.

### G. Stream confusion

`node:net` is byte-stream IPC, not message IPC. Every frame must be explicit length-prefix framed, bounded before allocation/use, and consumed exactly. Partial reads, multiple frames in one read and fragmentation cannot change semantics.

### H. Stale Unix socket

A crashed filesystem Unix socket may persist. Endpoint naming includes the current random Controller instance identity, so a new instance selects a different endpoint rather than deleting a predecessor path based on age or PID. Cleanup of its own endpoint is best-effort after close; ownership authority remains Foundation-004 SQLite ownership, not socket existence.

### I. Secret disclosure

Raw HMAC key bytes may not enter SQLite, Git, status JSON, endpoint path, protocol responses, logs, exception strings or qualification artifacts. A non-secret `key_id` may identify configured credential material.

### J. Retry stacking

The server performs no automatic command retry. Client/helper retries, when later exposed, may retry only classified transient connect/timeout failures with the exact same semantic request and bounded backoff/jitter. Semantic/schema/auth/idempotency failures are not retryable.

## 6. Ownership adjudication

| Concept | Owner | Foundation-005 rule |
| --- | --- | --- |
| local endpoint + framing + HMAC challenge | Foundation-005 | local transport only |
| local transport credential identity | Foundation-005 / runtime configuration | provenance only; not semantic authorization |
| semantic command envelope / fingerprint / create-once row | frozen Foundation-002B kernel | reuse exactly |
| durable Git inbox / offline rediscovery / wakeup tolerance | Foundation-002D | unchanged; local IPC does not replace it |
| process ownership / recovery / READY state | Foundation-004 | consume only |
| logical human/delegated identity | later identity/delegation authority | not inferred from HMAC or OS metadata |
| dangerous-command approval / admission | later policy/admission authority | transport acceptance never auto-admits |
| provider/network/GitHub execution | later effect/worker layers | prohibited in Foundation-005 |
| service-account / pipe DACL / sandbox deployment hardening | deployment environment | external evidence class |

## 7. Requirement/invariant rebind — current Foundation-005 denominator

The design-lock must account for all rows below before BUILD.

| ID | Requirement / invariant | Current implementation | Durable state | Contract / interface | Required proof | Environment / blocker |
| --- | --- | --- | --- | --- | --- | --- |
| L005-001 | one authenticated local request can create one semantic command | MISSING | 002B commands/transactions | local adapter -> `acceptCommand` | isolated IPC + kernel | portable |
| L005-002 | wrong key cannot mutate | MISSING | none | HMAC gate | negative auth | portable |
| L005-003 | missing/short key rejected | MISSING | none | constructor/config guard | unit | portable |
| L005-004 | raw key never persisted/exposed | MISSING | prohibited | redaction/non-serialization | DB/file/response scans | portable + deployment |
| L005-005 | cross-platform local IPC | MISSING | none | `node:net` path | Ubuntu/Windows | hosted portable |
| L005-006 | bounded length-prefix framing | MISSING | none | frame codec | fragmentation/coalescing tests | portable |
| L005-007 | invalid UTF-8 rejected pre-mutation | MISSING | none | strict decoder | negative | portable |
| L005-008 | malformed JSON rejected pre-mutation | MISSING | none | strict JSON parser | negative | portable |
| L005-009 | recursive duplicate keys rejected | MISSING | none | strict JSON parser | nested duplicate tests | portable |
| L005-010 | unknown/spoofable fields rejected | MISSING | none | request schema | adversarial | portable |
| L005-011 | server binds transport provenance | MISSING | command payload via 002B | projection contract | exact row/event inspect | portable |
| L005-012 | transport provenance is not semantic authorization | DESIGN ONLY | OPEN tx | no auto-admit/activate | negative state tests | later policy dependency |
| L005-013 | not-READY rejects without mutation | partial lifecycle source | none | runtime ready check | integration | portable |
| L005-014 | valid request creates exactly one command/tx | 002B exists | SQLite | `acceptCommand` | cumulative | portable |
| L005-015 | exact replay returns same tx | 002B exists | SQLite | 002B idempotency | replay | portable |
| L005-016 | changed semantics same ID conflicts | 002B exists | SQLite | 002B idempotency | adversarial | portable |
| L005-017 | unknown response can reconcile safely | partial via 002B | SQLite | caller replay | disconnect-after-commit | portable |
| L005-018 | endpoint short/deterministic per DB+instance | MISSING | none | endpoint helper | alias/path tests | portable |
| L005-019 | endpoint never authenticates caller | MISSING | none | HMAC mandatory | endpoint spoof tests | portable |
| L005-020 | server authenticated before command bytes sent | MISSING | none | server challenge MAC | fake-server test | portable |
| L005-021 | exact command bytes authenticated | MISSING | none | request MAC | bit-flip test | portable |
| L005-022 | captured authenticated request cannot validate on new challenge | MISSING | none | per-connection nonce | replay test | portable |
| L005-023 | one authenticated command per connection | MISSING | none | protocol state machine | second-command reject | portable |
| L005-024 | stable bounded error taxonomy | MISSING | none | response contract | error snapshot tests | portable |
| L005-025 | no internal exception/traceback leakage | MISSING | none | response contract | fault injection | portable |
| L005-026 | command projection is deterministic on replay | MISSING | 002B fingerprint | local->002B projector | equality tests | portable |
| L005-027 | `created_at` does not depend on retry wall clock | MISSING | command row | UUIDv7 timestamp projection | replay-delay test | portable |
| L005-028 | current policy runtime identity not caller-controlled | MISSING adapter | tx policy_version | server option | spoof field tests | portable |
| L005-029 | no parent/relation semantics silently recreated | NONE current | none | reject unsupported fields | negative | architecture dependency |
| L005-030 | local IPC does not replace 002D offline durable inbox | 002D exists | protected Git refs | architecture fence | negative/source test | production setup blocked |
| L005-031 | no provider/scheduler/worker/qualification/promotion execution | none | none | module boundary | static/source test | portable |
| L005-032 | exact subject cumulative qualification cross-platform | workflow exists | Git evidence | Ubuntu/Windows × Node22/24 | exact-SHA CI | hosted portable |

Accounted bounded requirements: **32/32**. Unaccounted: **0**.

## 8. Historical behavior explicitly retired or repaired

- Python `multiprocessing.connection.Listener/Client`, `AF_PIPE`, `AF_UNIX`, `send_bytes/recv_bytes` are retired implementation details.
- Python's built-in HMAC challenge is replaced by an explicit Node application protocol; no weaker unauthenticated `node:net` port is acceptable.
- Historical parent/relation request fields are not transplanted because the current frozen 002B command authority has no corresponding durable lineage contract. Reintroducing them now would create hidden semantics.
- Historical 1 MiB command-frame size is not automatically carried forward. The design-lock will bind a limit consistent with the current Controller command-envelope and memory/DoS budget.
- Historical endpoint cleanup is not allowed to use stale age or PID authority. Instance-specific endpoint identity avoids deleting another process's endpoint.

## 9. Gate standing

RECOVER: PASS
INVENTORY: PASS
ANALYZE: PASS
TARGETED RESEARCH: PASS
ADJUDICATE: PASS
DESIGN-LOCK: NEXT
BUILD: NOT YET AUTHORIZED
ISOLATED QUALIFICATION: NOT YET RUN
CUMULATIVE REGRESSION: NOT YET RUN
FREEZE: NOT YET AUTHORIZED

Exact successor: `CONTROLLER-FOUNDATION-005A-C1-LOCAL-IPC-DESIGN-LOCK-001`.
