CREATE TRIGGER transactions_initial_state
BEFORE INSERT ON transactions
WHEN NEW.state != 'RECEIVED' OR NEW.candidate_subject_id IS NOT NULL OR NEW.state_version != 0 OR NEW.terminal_at_ms IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'transactions must begin RECEIVED with no candidate and state_version zero');
END;

CREATE TRIGGER attempts_initial_state
BEFORE INSERT ON execution_attempts
WHEN NEW.state != 'CREATED' OR NEW.started_at_ms IS NOT NULL OR NEW.completed_at_ms IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'execution attempts must begin CREATED');
END;

CREATE TRIGGER attempts_require_active_lease
BEFORE UPDATE OF state ON execution_attempts
WHEN NEW.state IN ('RUNNING','VERIFYING','SUCCEEDED','FAILED')
  AND NOT EXISTS (
    SELECT 1 FROM leases
    WHERE attempt_id=NEW.attempt_id AND transaction_id=NEW.transaction_id AND state='ACTIVE'
  )
BEGIN
  SELECT RAISE(ABORT, 'active execution state requires active lease');
END;

CREATE TRIGGER leases_initial_state
BEFORE INSERT ON leases
WHEN NEW.state != 'ACTIVE' OR NEW.released_at_ms IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'leases must begin ACTIVE');
END;

CREATE TRIGGER resource_fences_initial_token
BEFORE INSERT ON resource_fences
WHEN NEW.current_token != 1
BEGIN
  SELECT RAISE(ABORT, 'resource fence must begin at token one');
END;

CREATE TRIGGER inbox_initial_state
BEFORE INSERT ON inbox_messages
WHEN NEW.state != 'RECEIVED' OR NEW.processed_at_ms IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'inbox messages must begin RECEIVED');
END;

CREATE TRIGGER inbox_state_transition
BEFORE UPDATE OF state ON inbox_messages
WHEN NEW.state IS NOT OLD.state
BEGIN
  SELECT CASE WHEN NOT (OLD.state='RECEIVED' AND NEW.state IN ('PROCESSED','REJECTED'))
    THEN RAISE(ABORT, 'illegal inbox state transition') END;
  SELECT CASE WHEN NEW.processed_at_ms IS NULL
    THEN RAISE(ABORT, 'terminal inbox state requires processed_at_ms') END;
END;

CREATE TRIGGER inbox_terminal_immutable
BEFORE UPDATE ON inbox_messages
WHEN OLD.state IN ('PROCESSED','REJECTED')
BEGIN
  SELECT RAISE(ABORT, 'terminal inbox message is immutable');
END;

CREATE TRIGGER outbox_initial_state
BEFORE INSERT ON outbox
WHEN NEW.state != 'PENDING' OR NEW.attempts != 0 OR NEW.published_at_ms IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'outbox item must begin PENDING');
END;

CREATE TRIGGER qualifications_initial_state
BEFORE INSERT ON qualifications
WHEN NEW.state != 'PENDING' OR NEW.evidence_receipt_id IS NOT NULL OR NEW.completed_at_ms IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'qualification must begin PENDING without verdict evidence');
END;

CREATE TRIGGER promotions_initial_state
BEFORE INSERT ON promotions
WHEN NEW.state != 'NOT_ELIGIBLE' OR NEW.promoted_digest IS NOT NULL OR NEW.completed_at_ms IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'promotion must begin NOT_ELIGIBLE');
END;

CREATE TRIGGER controller_events_epoch_current
BEFORE INSERT ON controller_events
WHEN NEW.authority_epoch != (SELECT authority_epoch FROM controller_meta WHERE singleton=1)
BEGIN
  SELECT RAISE(ABORT, 'event authority epoch must equal current controller epoch');
END;
