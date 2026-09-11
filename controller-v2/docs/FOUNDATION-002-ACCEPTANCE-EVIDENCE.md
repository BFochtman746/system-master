# CONTROLLER-FOUNDATION-002 — Acceptance Evidence Matrix

Status: MUST BE GREEN ON THE EXACT CANDIDATE BEFORE FREEZE

This matrix prevents a green but incomplete test suite. Every Foundation-002 acceptance criterion is bound to executable or hosted evidence. Documentation alone is not sufficient for a state-integrity claim.

| AC | Evidence |
|---|---|
| 01-02 | `test_runtime_sqlite_durability_pragmas_are_active`; migration initialization/integrity tests |
| 03-04 | command idempotency, semantic-change rejection, concurrent duplicate command tests |
| 05 | `test_repository_identity_collision_is_rejected` |
| 06 | immutable subject and write-once candidate tests |
| 07 | `test_repair_lineage_is_explicit_and_bound_to_parent_transaction` |
| 08 | SQL state-machine guards plus independent execution/qualification/promotion tests |
| 09-10 | execution proof-boundary tests |
| 11-12 | qualification proof/receipt tests and direct-verdict rejection |
| 13 | promotion eligibility/proof tests |
| 14-16 | concurrent lease winner, fence, true expiry and non-revival tests |
| 17 | released-worker and expired-worker result rejection tests |
| 18 | atomic event/outbox state-change and rollback tests |
| 19 | immutable subject/event plus `test_command_and_evidence_records_are_immutable` |
| 20 | outbox transition guard and published-outbox non-reopen test; `(event_id,destination)` primary key provides delivery-intent deduplication |
| 21 | `test_external_effects_fail_closed_and_require_reconciliation_after_unknown` |
| 22 | `test_projection_sequence_cannot_regress_and_stale_is_explicit` |
| 23 | `test_transaction_row_version_cannot_skip_or_regress` plus SQL transition guards |
| 24 | concurrent duplicate-command and concurrent lease-contention tests |
| 25 | subprocess crash-recovery test plus explicit transaction rollback test |
| 26 | migration ledger/checksum/integrity tests |
| 27 | worker kind/trust-class database guard test |
| 28-29 | `test_kernel_has_no_legacy_controller_or_scheduler_runtime_dependency`; Controller 2.0 kernel has no legacy registry or GitHub scheduling dependency |
| 30-31 | workflow verifies `WORK-AUTHORITY.json::canonical_branch`; GitHub hosted CI checks out and tests the exact commit with `contents: read` |
| 32 | true expiration tests remain separate from graceful release/fencing tests |

## Freeze rule

Foundation-002 is frozen only when the canonical branch head itself is the exact SHA tested by the hosted `Controller V2 Foundation CI` run and that run passes. A later documentation, receipt, workflow, or cleanup commit is a new candidate and does not inherit the earlier PASS.

The Foundation-002 PASS proves the transactional kernel only. It does not authorize production GitHub writes, Second Shift production execution, qualification of System Master, promotion to `main`, or replacement of the legacy controller.
