# A01-CODE-QUAL-001 Candidate Assignment

You have 30 measured minutes. Human assistance is prohibited.

Repair and complete the supplied Java/Python/JavaScript durable-request pipeline.
The code is intentionally incomplete and contains concurrency, idempotency,
validation, stale-writer, recovery, and cross-language identity defects.

## Required behavior

### Python durable store (`python/store.py`)
Preserve the public API and implement these semantics:

- `Store(db, clock=None, lease_seconds=30)` persists claims in SQLite.
- `claim(request_id, owner, payload) -> (Claim, acquired_new)` is atomic across
  concurrent Store instances/process-like callers. Exactly one caller creates a
  new durable row and reports `acquired_new=True`. Same request + same payload is
  idempotent replay and returns the existing durable claim with `False`. Same
  request + different payload must raise `Conflict` without changing durable state.
- `renew(request_id, owner, generation) -> bool` extends only the exact current
  live owner/generation and never revives DONE state.
- `complete(request_id, owner, generation) -> bool` transitions only the exact
  current live owner/generation from CLAIMED to DONE. Stale writers return False.
  Repeating an already-applied completion must not create a second effect.
- `recover(request_id, new_owner) -> (Claim, acquired_new)` may take over only an
  expired CLAIMED claim. One successful takeover increments generation exactly
  once and renews the lease. Competing recovery callers must not both report a
  new acquisition. Before expiry, recovery returns the current claim with False.
- `get(request_id) -> Claim | None` returns durable state.
- Reopening the database must preserve all state. Do not hide races with global
  process locks; use durable SQLite transaction semantics.

`Claim` fields are `request_id`, `owner`, `generation`, `payload`, `status`, and
`expires_at` (Unix seconds as float).

### Canonical identity (`python/canonical.py`, `javascript/canonical.js`, Java `RequestKey`)
All three languages must produce exactly the same canonical request identity:

1. request id is trimmed;
2. payload normalizes CRLF/CR to LF;
3. every run of ASCII whitespace (`space`, tab, CR, LF, form-feed) becomes one
   ASCII space;
4. leading/trailing whitespace is removed;
5. canonical string is `<trimmed-request-id>:<normalized-payload>`;
6. SHA-256 is lowercase 64-hex over UTF-8 canonical bytes.

### JavaScript request validation (`javascript/validate.js`)
`validateRequest(input)` must fail closed. It must accept only a plain object with
exactly `requestId`, `owner`, and `payload`. `requestId` and `owner` must be
trimmed non-empty strings of at most 64 characters matching `[A-Za-z0-9._:-]+`.
`payload` must be a string of at most 1024 characters and must not contain NUL.
Do not coerce nulls, objects, arrays, numbers, booleans, or unknown fields.
Return `{ok:false,error:<stable-code>}` on invalid input. On success return
`{ok:true, requestId:<trimmed>, owner:<trimmed>, payload:<original-string>}`.

## Engineering expectations

- Add useful candidate-created tests under `tests-visible/added/**` if time permits.
- Preserve public APIs and keep changes inside the writable paths from
  `benchmark-manifest.json`.
- Do not weaken or delete baseline tests.
- Prefer small coherent code over test-specific patches.
- Hidden evaluation occurs only after the measured artifact is frozen.
