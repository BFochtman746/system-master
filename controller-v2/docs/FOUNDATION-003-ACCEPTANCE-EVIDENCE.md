# CONTROLLER-FOUNDATION-003 — Acceptance Evidence Matrix

Status: CANDIDATE — freeze only after exact-head hosted CI PASS

| AC | Executable / structural evidence |
|---|---|
| 01 | Entire predecessor suite runs in the same hosted job; only fixtures invalidated by migration 004 were strengthened, not weakened. |
| 02 | `test_online_backup_is_integrity_checked_and_restorable` plus `create_verified_backup` uses `sqlite3.Connection.backup`. |
| 03 | `test_backup_publish_failure_preserves_prior_destination_and_cleans_temp` plus temp-file `fsync` and `os.replace`. |
| 04 | `test_effect_prepare_is_idempotent_but_semantic_reuse_conflicts`; DB unique `(provider,idempotency_key)`. |
| 05-06 | `test_effect_send_increments_once_and_outcomes_require_evidence`; migration 004 attempt/outcome triggers. |
| 07 | `test_unknown_effect_must_reconcile_before_resolution`; state-transition trigger blocks UNKNOWN -> PREPARED/SUCCEEDED. |
| 08-11 | `test_restart_converts_ambiguous_and_abandoned_work_to_recovery`. |
| 12 | predecessor projection regression test plus `test_projection_cursor_requires_real_event_and_does_not_self_generate_event`; migration 004 cursor binding guards. |
| 13 | `test_projection_destination_is_immutable`; predecessor explicit STALE test; migration 004 identity trigger. |
| 14 | `test_projection_cursor_requires_real_event_and_does_not_self_generate_event`. |
| 15 | `test_reliability_kernel_has_no_provider_network_client`; reliability layer records provider-neutral effects only. |
| 16 | No scheduler/webhook import in controller kernel; recovery derives correctness from durable local state. |
| 17 | migration ledger now verifies `[1,2,3,4]`; checksum mutation test remains green. |
| 18 | `WORK-AUTHORITY.json` selects only `controller-v2/foundation-003`; frozen Foundation-002 SHA is explicit. |
| 19 | hosted workflow has `contents: read`, verifies authority-selected branch, and checks out the exact pushed SHA. |

## Freeze rule

The exact candidate SHA that contains this matrix must pass hosted CI. No later receipt/documentation commit inherits that PASS. CI evidence is external to the qualified subject so recording the PASS cannot change the tested SHA.
