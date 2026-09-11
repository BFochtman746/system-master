# CONTROLLER-FOUNDATION-003 — Reliability Research Decisions

Status: TEST-FIRST IMPLEMENTATION
Predecessor: Foundation-002 frozen at `773dca335a606f4e8d675f1f7fddd5ca36b1b5bb`

## Purpose

Make controller recovery and remote-side-effect handling deterministic before any real GitHub mutation adapter or Second Shift scheduler is built.

## Accepted decisions

1. Live SQLite databases are backed up through SQLite's online backup API, not by copying the database/WAL files while live.
2. Every completed backup is integrity-checked and foreign-key-checked before atomic publication to its destination path.
3. Remote mutations use durable external-effect records with provider-wide idempotency keys and immutable request digests.
4. A remote request that may have executed but whose response was lost becomes `UNKNOWN`; it is reconciled against remote truth before retry or success is asserted.
5. Controller restart never blindly retries an `INFLIGHT` remote mutation. It changes it to `UNKNOWN` and creates reconciliation work.
6. In-flight outbox publication is safe to return to `RETRY` after restart because publication consumers must deduplicate by immutable event ID.
7. Expired leases are finalized on restart; STARTED attempts behind a dead lease become INTERRUPTED and active transactions without a live fence enter RECOVERING.
8. Published state projections are monotonic cursors over real controller events. Their bookkeeping is deliberately not itself a controller event, preventing self-referential projection lag.
9. Webhooks may later reduce latency but are never correctness authority; periodic/read reconciliation is mandatory because failed webhook delivery is not guaranteed to be redelivered.
10. A GitHub ref GET followed by PATCH is not modeled as an atomic compare-and-swap. `force=false` protects against non-fast-forward movement but the REST update-ref request does not carry an expected-old-SHA precondition. Stronger promotion authority therefore belongs in the later repository-control layer.
11. Foundation-003 remains provider-independent. No production GitHub write occurs in this layer.
12. Provider rate limits and retry headers are adapter concerns, but the external-effect state model preserves typed failure/UNKNOWN state needed to handle them safely.

## Explicit non-goals

No scheduling, no lane ownership, no product semantics, no live Second Shift dispatch, no branch promotion, no main writes, and no replacement of the legacy controller.
