CREATE TRIGGER schema_migrations_no_update BEFORE UPDATE ON schema_migrations BEGIN
  SELECT RAISE(ABORT, 'applied migration records are immutable');
END;
CREATE TRIGGER schema_migrations_no_delete BEFORE DELETE ON schema_migrations BEGIN
  SELECT RAISE(ABORT, 'applied migration records are append-only');
END;

CREATE TRIGGER transactions_primary_identity_immutable
BEFORE UPDATE OF transaction_id ON transactions
WHEN NEW.transaction_id IS NOT OLD.transaction_id
BEGIN
  SELECT RAISE(ABORT, 'transaction_id is immutable');
END;

CREATE TRIGGER transactions_candidate_bind_only_while_executing
BEFORE UPDATE OF candidate_subject_id ON transactions
WHEN OLD.candidate_subject_id IS NULL AND NEW.candidate_subject_id IS NOT NULL AND OLD.state != 'EXECUTING'
BEGIN
  SELECT RAISE(ABORT, 'candidate may be bound only while transaction is EXECUTING');
END;

CREATE TRIGGER attempts_identity_immutable
BEFORE UPDATE ON execution_attempts
WHEN NEW.attempt_id IS NOT OLD.attempt_id
  OR NEW.transaction_id IS NOT OLD.transaction_id
  OR NEW.attempt_no IS NOT OLD.attempt_no
  OR NEW.created_at_ms IS NOT OLD.created_at_ms
BEGIN
  SELECT RAISE(ABORT, 'execution attempt identity is immutable');
END;

CREATE TRIGGER attempts_claim_requires_active_lease
BEFORE UPDATE OF state ON execution_attempts
WHEN NEW.state='CLAIMED'
  AND NOT EXISTS (
    SELECT 1 FROM leases
    WHERE attempt_id=NEW.attempt_id AND transaction_id=NEW.transaction_id AND state='ACTIVE'
  )
BEGIN
  SELECT RAISE(ABORT, 'CLAIMED attempt requires active lease');
END;

CREATE TRIGGER resource_fences_monotonic
BEFORE UPDATE OF current_token ON resource_fences
WHEN NEW.current_token != OLD.current_token + 1
BEGIN
  SELECT RAISE(ABORT, 'resource fencing token must increment by exactly one');
END;
CREATE TRIGGER resource_fences_no_delete BEFORE DELETE ON resource_fences BEGIN
  SELECT RAISE(ABORT, 'resource fence history cannot be deleted');
END;

CREATE TRIGGER leases_identity_immutable
BEFORE UPDATE ON leases
WHEN NEW.lease_id IS NOT OLD.lease_id
  OR NEW.resource_key IS NOT OLD.resource_key
  OR NEW.transaction_id IS NOT OLD.transaction_id
  OR NEW.attempt_id IS NOT OLD.attempt_id
  OR NEW.holder_id IS NOT OLD.holder_id
  OR NEW.fencing_token IS NOT OLD.fencing_token
  OR NEW.acquired_at_ms IS NOT OLD.acquired_at_ms
  OR NEW.authority_epoch IS NOT OLD.authority_epoch
BEGIN
  SELECT RAISE(ABORT, 'lease identity and fence are immutable');
END;

CREATE TRIGGER qualifications_identity_immutable
BEFORE UPDATE ON qualifications
WHEN NEW.qualification_id IS NOT OLD.qualification_id
  OR NEW.transaction_id IS NOT OLD.transaction_id
  OR NEW.subject_id IS NOT OLD.subject_id
  OR NEW.policy_subject_id IS NOT OLD.policy_subject_id
  OR NEW.created_at_ms IS NOT OLD.created_at_ms
BEGIN
  SELECT RAISE(ABORT, 'qualification identity and subject binding are immutable');
END;

CREATE TRIGGER promotions_identity_immutable
BEFORE UPDATE ON promotions
WHEN NEW.promotion_id IS NOT OLD.promotion_id
  OR NEW.qualification_id IS NOT OLD.qualification_id
  OR NEW.target_repository IS NOT OLD.target_repository
  OR NEW.target_ref IS NOT OLD.target_ref
  OR NEW.expected_head_digest IS NOT OLD.expected_head_digest
  OR NEW.created_at_ms IS NOT OLD.created_at_ms
BEGIN
  SELECT RAISE(ABORT, 'promotion identity and target are immutable');
END;

CREATE TRIGGER outbox_identity_immutable
BEFORE UPDATE ON outbox
WHEN NEW.event_seq IS NOT OLD.event_seq OR NEW.destination IS NOT OLD.destination
BEGIN
  SELECT RAISE(ABORT, 'outbox delivery identity is immutable');
END;
