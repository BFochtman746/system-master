-- Controller 2.0 Foundation-002 proof-boundary hardening
-- Applied after 002_hardening.sql. Historical migrations are immutable.

-- Execution attempts must begin as STARTED and can terminate only once.
CREATE TRIGGER execution_attempt_initial_state_guard_v3
BEFORE INSERT ON execution_attempts
WHEN NEW.state <> 'STARTED' OR NEW.finished_at_ms IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'EXECUTION_ATTEMPT_MUST_BEGIN_STARTED'); END;

CREATE TRIGGER execution_attempt_state_guard_v3
BEFORE UPDATE OF state ON execution_attempts
WHEN NEW.state <> OLD.state AND NOT (
    OLD.state='STARTED' AND NEW.state IN ('SUCCEEDED','FAILED','BLOCKED','INTERRUPTED','REJECTED_STALE_FENCE')
)
BEGIN SELECT RAISE(ABORT, 'INVALID_EXECUTION_ATTEMPT_TRANSITION'); END;

CREATE TRIGGER execution_attempt_terminal_guard_v3
BEFORE UPDATE OF state ON execution_attempts
WHEN NEW.state IN ('SUCCEEDED','FAILED','BLOCKED','INTERRUPTED','REJECTED_STALE_FENCE')
 AND NEW.finished_at_ms IS NULL
BEGIN SELECT RAISE(ABORT, 'EXECUTION_ATTEMPT_TERMINAL_REQUIRES_FINISH_TIME'); END;

-- A successful attempt requires a CANDIDATE_READY result from that exact attempt,
-- lease and fencing token. A state setter alone can never manufacture success.
CREATE TRIGGER execution_attempt_success_proof_guard_v3
BEFORE UPDATE OF state ON execution_attempts
WHEN NEW.state='SUCCEEDED' AND (
    NEW.result_digest_sha256 IS NULL OR
    NOT EXISTS (
        SELECT 1 FROM worker_results r
        WHERE r.transaction_id=NEW.transaction_id
          AND r.attempt_id=NEW.attempt_id
          AND r.lease_id=NEW.lease_id
          AND r.fencing_token=NEW.fencing_token
          AND r.result_type='CANDIDATE_READY'
          AND r.payload_digest_sha256=NEW.result_digest_sha256
    )
)
BEGIN SELECT RAISE(ABORT, 'EXECUTION_SUCCESS_REQUIRES_CANDIDATE_READY_PROOF'); END;

-- Worker result acceptance is based on controller time and the current resource
-- fence, never on a worker-supplied historical timestamp.
CREATE TRIGGER worker_result_current_fence_guard_v3
BEFORE INSERT ON worker_results
WHEN NOT EXISTS (
    SELECT 1
    FROM leases l
    JOIN protected_resources p ON p.resource_key=l.resource_key
    WHERE l.lease_id=NEW.lease_id
      AND l.transaction_id=NEW.transaction_id
      AND l.fencing_token=NEW.fencing_token
      AND l.state='ACTIVE'
      AND p.last_fencing_token=NEW.fencing_token
      AND l.expires_at_ms > CAST(unixepoch('subsec')*1000 AS INTEGER)
)
BEGIN SELECT RAISE(ABORT, 'WORKER_RESULT_REQUIRES_CURRENT_LIVE_FENCE'); END;

-- An expired or superseded lease cannot be revived by heartbeat/renewal.
CREATE TRIGGER lease_renewal_current_guard_v3
BEFORE UPDATE OF last_heartbeat_at_ms, expires_at_ms ON leases
WHEN OLD.state <> 'ACTIVE'
 OR OLD.expires_at_ms <= CAST(unixepoch('subsec')*1000 AS INTEGER)
 OR NOT EXISTS (
      SELECT 1 FROM protected_resources p
      WHERE p.resource_key=OLD.resource_key
        AND p.last_fencing_token=OLD.fencing_token
 )
BEGIN SELECT RAISE(ABORT, 'EXPIRED_OR_STALE_LEASE_CANNOT_RENEW'); END;

-- Transaction execution success is a projection of a successful proof-bearing
-- attempt, not an independently writable assertion.
CREATE TRIGGER transaction_execution_success_proof_guard_v3
BEFORE UPDATE OF execution_state ON transactions
WHEN NEW.execution_state='SUCCEEDED' AND (
    NEW.candidate_subject_id IS NULL OR
    NOT EXISTS (
        SELECT 1
        FROM execution_attempts a
        JOIN worker_results r ON r.attempt_id=a.attempt_id
        WHERE a.transaction_id=NEW.transaction_id
          AND a.state='SUCCEEDED'
          AND r.transaction_id=NEW.transaction_id
          AND r.lease_id=a.lease_id
          AND r.fencing_token=a.fencing_token
          AND r.result_type='CANDIDATE_READY'
          AND r.payload_digest_sha256=a.result_digest_sha256
    )
)
BEGIN SELECT RAISE(ABORT, 'TRANSACTION_SUCCESS_REQUIRES_EXECUTION_PROOF'); END;

-- Qualification attempts always start RUNNING and terminal verdicts are immutable.
CREATE TRIGGER qualification_attempt_initial_state_guard_v3
BEFORE INSERT ON qualification_attempts
WHEN NEW.state <> 'RUNNING' OR NEW.finished_at_ms IS NOT NULL OR NEW.receipt_id IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'QUALIFICATION_ATTEMPT_MUST_BEGIN_RUNNING'); END;

CREATE TRIGGER qualification_attempt_state_guard_v3
BEFORE UPDATE OF state ON qualification_attempts
WHEN NEW.state <> OLD.state AND NOT (
    OLD.state='RUNNING' AND NEW.state IN ('QUALIFIED','REJECTED','INDETERMINATE')
)
BEGIN SELECT RAISE(ABORT, 'INVALID_QUALIFICATION_ATTEMPT_TRANSITION'); END;

CREATE TRIGGER qualification_attempt_receipt_guard_v3
BEFORE UPDATE OF state ON qualification_attempts
WHEN NEW.state IN ('QUALIFIED','REJECTED','INDETERMINATE') AND (
    NEW.finished_at_ms IS NULL OR NEW.receipt_id IS NULL OR
    NOT EXISTS (
        SELECT 1 FROM evidence_receipts e
        WHERE e.receipt_id=NEW.receipt_id
          AND e.transaction_id=NEW.transaction_id
          AND e.subject_id=NEW.subject_id
          AND e.receipt_kind='QUALIFICATION'
    )
)
BEGIN SELECT RAISE(ABORT, 'QUALIFICATION_VERDICT_REQUIRES_MATCHING_RECEIPT'); END;

-- A transaction qualification verdict must be backed by the exact candidate,
-- policy and a matching terminal qualification attempt with evidence.
CREATE TRIGGER transaction_qualification_proof_guard_v3
BEFORE UPDATE OF qualification_state ON transactions
WHEN NEW.qualification_state IN ('QUALIFIED','REJECTED','INDETERMINATE') AND NOT EXISTS (
    SELECT 1
    FROM qualification_attempts q
    JOIN evidence_receipts e ON e.receipt_id=q.receipt_id
    WHERE q.transaction_id=NEW.transaction_id
      AND q.subject_id=NEW.candidate_subject_id
      AND q.policy_version=NEW.policy_version
      AND q.policy_digest_sha256=NEW.policy_digest_sha256
      AND q.state=NEW.qualification_state
      AND e.transaction_id=NEW.transaction_id
      AND e.subject_id=NEW.candidate_subject_id
      AND e.receipt_kind='QUALIFICATION'
)
BEGIN SELECT RAISE(ABORT, 'TRANSACTION_QUALIFICATION_REQUIRES_PROOF'); END;

-- Promotion attempts must also follow a proof-bearing lifecycle. Foundation-002
-- does not perform GitHub promotion yet; these guards prevent fabricated state.
CREATE TRIGGER promotion_attempt_initial_state_guard_v3
BEFORE INSERT ON promotion_attempts
WHEN NEW.state <> 'PREPARED' OR NEW.finished_at_ms IS NOT NULL OR NEW.resulting_target_oid IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'PROMOTION_ATTEMPT_MUST_BEGIN_PREPARED'); END;

CREATE TRIGGER promotion_attempt_state_guard_v3
BEFORE UPDATE OF state ON promotion_attempts
WHEN NEW.state <> OLD.state AND NOT (
    (OLD.state='PREPARED' AND NEW.state='RUNNING') OR
    (OLD.state='RUNNING' AND NEW.state IN ('PROMOTED','FAILED','CONFLICT','UNKNOWN')) OR
    (OLD.state='UNKNOWN' AND NEW.state IN ('RUNNING','PROMOTED','FAILED','CONFLICT'))
)
BEGIN SELECT RAISE(ABORT, 'INVALID_PROMOTION_ATTEMPT_TRANSITION'); END;

CREATE TRIGGER promotion_attempt_promoted_guard_v3
BEFORE UPDATE OF state ON promotion_attempts
WHEN NEW.state='PROMOTED' AND (
    NEW.finished_at_ms IS NULL OR NEW.resulting_target_oid IS NULL OR
    NOT EXISTS (
        SELECT 1 FROM subjects s
        WHERE s.subject_id=NEW.subject_id
          AND s.object_oid=NEW.resulting_target_oid
    )
)
BEGIN SELECT RAISE(ABORT, 'PROMOTION_RESULT_MUST_EQUAL_QUALIFIED_SUBJECT'); END;

CREATE TRIGGER transaction_promotion_proof_guard_v3
BEFORE UPDATE OF promotion_state ON transactions
WHEN NEW.promotion_state='PROMOTED' AND NOT EXISTS (
    SELECT 1 FROM promotion_attempts p
    WHERE p.transaction_id=NEW.transaction_id
      AND p.subject_id=NEW.candidate_subject_id
      AND p.state='PROMOTED'
)
BEGIN SELECT RAISE(ABORT, 'TRANSACTION_PROMOTION_REQUIRES_PROMOTION_PROOF'); END;

PRAGMA user_version = 3;
