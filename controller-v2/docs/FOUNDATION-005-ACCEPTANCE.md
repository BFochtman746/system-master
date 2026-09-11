# Controller Foundation-005 — Authenticated Local Command Intake

Status: ACTIVE / TEST-FIRST
Predecessor: Foundation-004 frozen externally at `bfbe868d46ed4b2c59b57fbfef11b3ab0a2ddd59` after exact-SHA 60/60 qualification on Ubuntu and Windows.

## Purpose

Foundation-005 creates the only local IPC admission boundary for Controller commands. A client may express intent and identify the target subject, but it may not choose its authoritative caller identity, Controller code identity, policy identity, execution authority, worker identity, or promotion authority.

This stage does not add scheduling, GitHub mutation, worker dispatch, qualification execution, promotion, or Second Shift behavior.

## Transport

Use Python `multiprocessing.connection` local transports with a mandatory shared authentication key:

- Windows: `AF_PIPE` named pipe.
- POSIX: `AF_UNIX` Unix-domain socket.
- The endpoint is instance-specific and derived from the resolved controller database path plus the Controller instance id. A new Controller instance therefore does not reuse an abandoned Unix socket name after abnormal termination.
- Only `send_bytes` / `recv_bytes(maxlength=...)` are permitted for protocol frames. Pickle-based `send` / `recv` are forbidden for command protocol data.
- Authentication is mandatory. `authkey=None` is forbidden and the configured key must contain at least 32 bytes.
- Raw authentication material must never be written to SQLite, Git, runtime status JSON, protocol responses, or logs.

Python documents that `multiprocessing.connection` supports sockets or Windows named pipes and performs an HMAC-based authentication challenge when `authkey` is supplied; authentication failure raises `AuthenticationError`. Python also warns that ordinary `recv()` unpickles data. Foundation-005 therefore uses byte frames only.

Windows named-pipe ACL defaults are not treated as the security boundary. Microsoft documents that default named-pipe descriptors can grant read access to Everyone/anonymous users. HMAC authentication remains mandatory, while explicit OS account/ACL isolation belongs to deployment hardening.

## Protocol 1.0 request

Allowed top-level fields only:

- `protocol_version` — exactly `1.0`.
- `command_id` — caller-generated idempotency identifier.
- `command_type` — non-empty command type string.
- `repository_id` — registered repository id.
- `base_subject_id` — immutable registered base subject id.
- `payload` — JSON object.
- `parent_transaction_id` — optional; must be paired with `relation_to_parent`.
- `relation_to_parent` — optional; must be paired with `parent_transaction_id`.

Unknown fields are rejected. In particular, a client may not submit `caller_type`, `caller_id`, `controller_version`, `controller_commit_oid`, `policy_version`, `policy_digest_sha256`, worker identity, qualification state, or promotion state.

The server injects the authoritative caller, Controller, and policy identities into `ControllerStore.submit_command(...)`.

## Protocol response

Successful admission returns only stable protocol fields including `status=ACCEPTED`, `command_id`, `transaction_id`, and `duplicate`.

Failures return `status=ERROR` and a stable `error_code`. Internal exception text and tracebacks are not protocol data.

## Parsing

- Maximum protocol frame: 1 MiB.
- Input must be valid UTF-8.
- Input must be one JSON object.
- Duplicate JSON object keys are rejected.
- Unknown top-level fields are rejected.
- Missing or wrong-typed required fields are rejected.
- Parent transaction and relation fields are both present or both absent.

## Readiness

No command may be admitted until the Controller runtime is READY. A not-ready Controller returns `CONTROLLER_NOT_READY` without creating a command or transaction.

## Acceptance denominator

- F005-001 — A correctly authenticated local client can submit one valid command.
- F005-002 — A wrong authentication key cannot create a command or transaction.
- F005-003 — Missing/short authentication keys are rejected before listening/connecting.
- F005-004 — Raw authentication material is absent from database bytes, protocol response, and endpoint metadata.
- F005-005 — Command protocol code uses byte frames only and contains no pickle-based `send()`/`recv()` calls.
- F005-006 — Invalid UTF-8 is rejected without database mutation.
- F005-007 — Malformed JSON is rejected without database mutation.
- F005-008 — Duplicate JSON object keys are rejected without database mutation.
- F005-009 — Oversized frames are rejected without database mutation.
- F005-010 — Unknown/spoofable identity and policy fields are rejected.
- F005-011 — The server, not the client, binds caller, Controller, and policy identity.
- F005-012 — Not-ready runtime state rejects admission without database mutation.
- F005-013 — A valid request creates exactly one command and transaction.
- F005-014 — Exact command replay returns the original transaction with `duplicate=true`.
- F005-015 — Reuse of a command id with changed semantics returns `IDEMPOTENCY_CONFLICT` and creates no second transaction.
- F005-016 — Parent/relation pairing is validated before store mutation.
- F005-017 — Endpoint identity is deterministic for the same resolved database path + Controller instance id, and path aliases produce the same endpoint.
- F005-018 — Protocol failures expose stable codes rather than tracebacks/internal exception text.
- F005-019 — Intake contains no provider network/GitHub mutation, scheduler, lane, shift, worker-dispatch, qualification, or promotion execution semantics.
- F005-020 — The exact candidate SHA passes inherited + intake tests on Ubuntu and Windows under Python 3.14.

## Threat boundary

Foundation-005 proves shared-secret possession and prevents unauthenticated or malformed local command admission through the Controller IPC boundary. It does not claim to isolate mutually hostile processes running as the same operating-system user or to prevent a process with direct write access from modifying the SQLite database. Those require service-account/ACL/sandbox deployment hardening.
