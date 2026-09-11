# CONTROLLER-FOUNDATION-003 — Acceptance Criteria

Foundation-003 can freeze only when all criteria below pass on the exact canonical branch head.

1. Every Foundation-002 behavioral guarantee remains green. Test fixtures may change only where a stronger append-only migration makes the old fixture itself illegal; the underlying guarantee may not be weakened.
2. Online backup uses SQLite backup API and produces a restorable database that passes `integrity_check` and `foreign_key_check`.
3. Backup publication is atomic from a temporary file to the requested destination and returns a SHA-256 digest and byte count.
4. External-effect preparation is idempotent for identical provider/key/semantics and rejects semantic reuse of an idempotency key.
5. Every external effect begins PREPARED; every send increments attempt count exactly once.
6. SUCCEEDED external effects require auditable remote-result evidence; FAILED/UNKNOWN outcomes require an error code.
7. UNKNOWN external effects cannot jump directly to retry or success; reconciliation is mandatory.
8. Restart changes ambiguous INFLIGHT external effects to UNKNOWN rather than re-sending them.
9. Restart finalizes expired active leases and interrupts STARTED attempts behind dead leases.
10. CLAIMED/RUNNING/VERIFYING transactions without a live current fence enter RECOVERING.
11. Outbox entries stranded INFLIGHT by a controller crash return to RETRY without changing the immutable controller event.
12. Projection cursors can reference only existing `(event_seq,event_id)` pairs and cannot regress.
13. Projection identity/destination are immutable; STALE/ERROR are explicit states.
14. Projection cursor advancement does not emit a new controller event/outbox record.
15. No Foundation-003 code performs a real GitHub mutation.
16. No webhook or GitHub Actions ordering guarantee is required for correctness.
17. Historical migration files 001-003 remain checksum-identical and append-only; Foundation-003 adds migration 004.
18. `controller-v2/foundation-003` is the only active integration branch for this stage; Foundation-002 remains frozen at `773dca335a606f4e8d675f1f7fddd5ca36b1b5bb`.
19. Hosted CI uses read-only repository permissions and tests the exact branch head.

A PASS here proves only recovery/effect/projection primitives. It does not authorize production GitHub mutation, Second Shift orchestration, qualification of System Master, or promotion to main.
