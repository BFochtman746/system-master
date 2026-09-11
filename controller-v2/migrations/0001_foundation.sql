CREATE TABLE commands (
  command_id TEXT PRIMARY KEY,
  caller_id TEXT NOT NULL,
  command_type TEXT NOT NULL,
  payload_canonical TEXT NOT NULL,
  fingerprint_sha256 TEXT NOT NULL CHECK(length(fingerprint_sha256)=64 AND fingerprint_sha256=lower(fingerprint_sha256) AND fingerprint_sha256 NOT GLOB '*[^0-9a-f]*'),
  received_at_ms INTEGER NOT NULL CHECK(received_at_ms >= 0)
) STRICT;

CREATE TRIGGER commands_no_update BEFORE UPDATE ON commands BEGIN
  SELECT RAISE(ABORT, 'commands are immutable');
END;
CREATE TRIGGER commands_no_delete BEFORE DELETE ON commands BEGIN
  SELECT RAISE(ABORT, 'commands are append-only');
END;

CREATE TABLE subjects (
  subject_id TEXT PRIMARY KEY,
  repository TEXT NOT NULL,
  object_algorithm TEXT NOT NULL CHECK(object_algorithm IN ('sha1','sha256')),
  object_digest TEXT NOT NULL CHECK(
    object_digest=lower(object_digest)
    AND object_digest NOT GLOB '*[^0-9a-f]*'
    AND ((object_algorithm='sha1' AND length(object_digest)=40) OR (object_algorithm='sha256' AND length(object_digest)=64))
  ),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
  UNIQUE(repository, object_algorithm, object_digest)
) STRICT;

CREATE TRIGGER subjects_no_update BEFORE UPDATE ON subjects BEGIN
  SELECT RAISE(ABORT, 'subjects are immutable');
END;
CREATE TRIGGER subjects_no_delete BEFORE DELETE ON subjects BEGIN
  SELECT RAISE(ABORT, 'subjects are append-only');
END;

CREATE TABLE transactions (
  transaction_id TEXT PRIMARY KEY,
  command_id TEXT NOT NULL UNIQUE REFERENCES commands(command_id),
  state TEXT NOT NULL CHECK(state IN ('RECEIVED','VALIDATED','ADMITTED','PLANNED','EXECUTING','SUCCEEDED','FAILED','BLOCKED','REJECTED','CANCELLED')),
  base_subject_id TEXT NOT NULL REFERENCES subjects(subject_id),
  candidate_subject_id TEXT REFERENCES subjects(subject_id),
  controller_subject_id TEXT NOT NULL REFERENCES subjects(subject_id),
  policy_subject_id TEXT NOT NULL REFERENCES subjects(subject_id),
  state_version INTEGER NOT NULL DEFAULT 0 CHECK(state_version >= 0),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= created_at_ms),
  terminal_at_ms INTEGER,
  failure_code TEXT,
  CHECK(terminal_at_ms IS NULL OR terminal_at_ms >= created_at_ms),
  CHECK((state IN ('SUCCEEDED','FAILED','REJECTED','CANCELLED') AND terminal_at_ms IS NOT NULL) OR
        (state NOT IN ('SUCCEEDED','FAILED','REJECTED','CANCELLED') AND terminal_at_ms IS NULL))
) STRICT;

CREATE TRIGGER transactions_identity_immutable
BEFORE UPDATE ON transactions
WHEN NEW.command_id IS NOT OLD.command_id
  OR NEW.base_subject_id IS NOT OLD.base_subject_id
  OR NEW.controller_subject_id IS NOT OLD.controller_subject_id
  OR NEW.policy_subject_id IS NOT OLD.policy_subject_id
  OR (OLD.candidate_subject_id IS NOT NULL AND NEW.candidate_subject_id IS NOT OLD.candidate_subject_id)
BEGIN
  SELECT RAISE(ABORT, 'transaction identity is immutable');
END;

CREATE TRIGGER transactions_state_transition
BEFORE UPDATE OF state ON transactions
WHEN NEW.state IS NOT OLD.state
BEGIN
  SELECT CASE WHEN NOT (
    (OLD.state='RECEIVED' AND NEW.state IN ('VALIDATED','REJECTED','CANCELLED')) OR
    (OLD.state='VALIDATED' AND NEW.state IN ('ADMITTED','REJECTED','CANCELLED')) OR
    (OLD.state='ADMITTED' AND NEW.state IN ('PLANNED','BLOCKED','CANCELLED')) OR
    (OLD.state='PLANNED' AND NEW.state IN ('EXECUTING','BLOCKED','CANCELLED')) OR
    (OLD.state='EXECUTING' AND NEW.state IN ('SUCCEEDED','FAILED','BLOCKED','CANCELLED')) OR
    (OLD.state='BLOCKED' AND NEW.state IN ('PLANNED','FAILED','CANCELLED'))
  ) THEN RAISE(ABORT, 'illegal transaction state transition') END;
  SELECT CASE WHEN NEW.state_version != OLD.state_version + 1 THEN RAISE(ABORT, 'state_version must increment by one') END;
  SELECT CASE WHEN NEW.updated_at_ms < OLD.updated_at_ms THEN RAISE(ABORT, 'updated_at_ms must be monotonic') END;
END;

CREATE TABLE execution_attempts (
  attempt_id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id),
  attempt_no INTEGER NOT NULL CHECK(attempt_no >= 1),
  state TEXT NOT NULL CHECK(state IN ('CREATED','CLAIMABLE','CLAIMED','RUNNING','VERIFYING','SUCCEEDED','FAILED','ABANDONED','CANCELLED')),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
  started_at_ms INTEGER,
  completed_at_ms INTEGER,
  error_code TEXT,
  UNIQUE(transaction_id, attempt_no)
) STRICT;

CREATE UNIQUE INDEX ux_attempt_one_active_per_transaction
ON execution_attempts(transaction_id)
WHERE state IN ('CREATED','CLAIMABLE','CLAIMED','RUNNING','VERIFYING');

CREATE TRIGGER attempts_state_transition
BEFORE UPDATE OF state ON execution_attempts
WHEN NEW.state IS NOT OLD.state
BEGIN
  SELECT CASE WHEN NOT (
    (OLD.state='CREATED' AND NEW.state IN ('CLAIMABLE','CANCELLED')) OR
    (OLD.state='CLAIMABLE' AND NEW.state IN ('CLAIMED','CANCELLED')) OR
    (OLD.state='CLAIMED' AND NEW.state IN ('RUNNING','ABANDONED','CANCELLED')) OR
    (OLD.state='RUNNING' AND NEW.state IN ('VERIFYING','FAILED','ABANDONED','CANCELLED')) OR
    (OLD.state='VERIFYING' AND NEW.state IN ('SUCCEEDED','FAILED','ABANDONED','CANCELLED'))
  ) THEN RAISE(ABORT, 'illegal attempt state transition') END;
END;

CREATE TABLE resource_fences (
  resource_key TEXT PRIMARY KEY,
  current_token INTEGER NOT NULL CHECK(current_token >= 0)
) STRICT;

CREATE TABLE leases (
  lease_id TEXT PRIMARY KEY,
  resource_key TEXT NOT NULL,
  transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id),
  attempt_id TEXT NOT NULL REFERENCES execution_attempts(attempt_id),
  holder_id TEXT NOT NULL,
  fencing_token INTEGER NOT NULL CHECK(fencing_token > 0),
  state TEXT NOT NULL CHECK(state IN ('ACTIVE','RELEASED','EXPIRED','REVOKED')),
  acquired_at_ms INTEGER NOT NULL CHECK(acquired_at_ms >= 0),
  last_heartbeat_at_ms INTEGER NOT NULL CHECK(last_heartbeat_at_ms >= acquired_at_ms),
  expires_at_ms INTEGER NOT NULL CHECK(expires_at_ms > acquired_at_ms),
  released_at_ms INTEGER,
  UNIQUE(resource_key, fencing_token),
  CHECK((state='ACTIVE' AND released_at_ms IS NULL) OR (state!='ACTIVE' AND released_at_ms IS NOT NULL))
) STRICT;

CREATE UNIQUE INDEX ux_lease_one_active_per_resource
ON leases(resource_key)
WHERE state='ACTIVE';

CREATE TRIGGER leases_state_transition
BEFORE UPDATE OF state ON leases
WHEN NEW.state IS NOT OLD.state
BEGIN
  SELECT CASE WHEN NOT (OLD.state='ACTIVE' AND NEW.state IN ('RELEASED','EXPIRED','REVOKED'))
    THEN RAISE(ABORT, 'illegal lease state transition') END;
END;

CREATE TABLE controller_events (
  event_seq INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_canonical TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  correlation_id TEXT,
  causation_event_id TEXT,
  occurred_at_ms INTEGER NOT NULL CHECK(occurred_at_ms >= 0)
) STRICT;

CREATE TRIGGER events_no_update BEFORE UPDATE ON controller_events BEGIN
  SELECT RAISE(ABORT, 'events are append-only');
END;
CREATE TRIGGER events_no_delete BEFORE DELETE ON controller_events BEGIN
  SELECT RAISE(ABORT, 'events are append-only');
END;

CREATE TABLE outbox (
  event_seq INTEGER NOT NULL REFERENCES controller_events(event_seq),
  destination TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('PENDING','PUBLISHED','DEAD')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  available_at_ms INTEGER NOT NULL CHECK(available_at_ms >= 0),
  published_at_ms INTEGER,
  last_error TEXT,
  PRIMARY KEY(event_seq, destination),
  CHECK((state='PUBLISHED' AND published_at_ms IS NOT NULL) OR (state!='PUBLISHED' AND published_at_ms IS NULL))
) STRICT;

CREATE TRIGGER outbox_state_transition
BEFORE UPDATE OF state ON outbox
WHEN NEW.state IS NOT OLD.state
BEGIN
  SELECT CASE WHEN NOT (OLD.state='PENDING' AND NEW.state IN ('PUBLISHED','DEAD'))
    THEN RAISE(ABORT, 'illegal outbox state transition') END;
END;

CREATE TABLE inbox_messages (
  source TEXT NOT NULL,
  delivery_id TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256)=64 AND payload_sha256=lower(payload_sha256) AND payload_sha256 NOT GLOB '*[^0-9a-f]*'),
  state TEXT NOT NULL CHECK(state IN ('RECEIVED','PROCESSED','REJECTED')),
  received_at_ms INTEGER NOT NULL CHECK(received_at_ms >= 0),
  processed_at_ms INTEGER,
  PRIMARY KEY(source, delivery_id)
) STRICT;

CREATE TRIGGER inbox_identity_immutable
BEFORE UPDATE ON inbox_messages
WHEN NEW.source IS NOT OLD.source OR NEW.delivery_id IS NOT OLD.delivery_id OR NEW.payload_sha256 IS NOT OLD.payload_sha256
BEGIN
  SELECT RAISE(ABORT, 'inbox message identity is immutable');
END;

CREATE TABLE evidence_receipts (
  receipt_id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id),
  subject_id TEXT NOT NULL REFERENCES subjects(subject_id),
  receipt_type TEXT NOT NULL,
  digest_sha256 TEXT NOT NULL CHECK(length(digest_sha256)=64 AND digest_sha256=lower(digest_sha256) AND digest_sha256 NOT GLOB '*[^0-9a-f]*'),
  location TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0)
) STRICT;

CREATE TRIGGER receipts_no_update BEFORE UPDATE ON evidence_receipts BEGIN
  SELECT RAISE(ABORT, 'evidence receipts are immutable');
END;
CREATE TRIGGER receipts_no_delete BEFORE DELETE ON evidence_receipts BEGIN
  SELECT RAISE(ABORT, 'evidence receipts are append-only');
END;

CREATE TABLE qualifications (
  qualification_id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id),
  subject_id TEXT NOT NULL REFERENCES subjects(subject_id),
  policy_subject_id TEXT NOT NULL REFERENCES subjects(subject_id),
  state TEXT NOT NULL CHECK(state IN ('PENDING','QUALIFYING','QUALIFIED','REJECTED','INDETERMINATE','CANCELLED')),
  evidence_receipt_id TEXT REFERENCES evidence_receipts(receipt_id),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
  completed_at_ms INTEGER,
  UNIQUE(transaction_id, subject_id, policy_subject_id)
) STRICT;

CREATE TRIGGER qualifications_terminal_immutable
BEFORE UPDATE ON qualifications
WHEN OLD.state IN ('QUALIFIED','REJECTED','CANCELLED')
BEGIN
  SELECT RAISE(ABORT, 'terminal qualification is immutable');
END;

CREATE TRIGGER qualifications_state_transition
BEFORE UPDATE OF state ON qualifications
WHEN NEW.state IS NOT OLD.state
BEGIN
  SELECT CASE WHEN NOT (
    (OLD.state='PENDING' AND NEW.state IN ('QUALIFYING','CANCELLED')) OR
    (OLD.state='QUALIFYING' AND NEW.state IN ('QUALIFIED','REJECTED','INDETERMINATE')) OR
    (OLD.state='INDETERMINATE' AND NEW.state IN ('QUALIFYING','CANCELLED'))
  ) THEN RAISE(ABORT, 'illegal qualification state transition') END;
  SELECT CASE WHEN NEW.state IN ('QUALIFIED','REJECTED','INDETERMINATE') AND
    (NEW.evidence_receipt_id IS NULL OR NEW.completed_at_ms IS NULL)
    THEN RAISE(ABORT, 'qualification verdict requires evidence and completion time') END;
END;

CREATE TABLE promotions (
  promotion_id TEXT PRIMARY KEY,
  qualification_id TEXT NOT NULL UNIQUE REFERENCES qualifications(qualification_id),
  target_repository TEXT NOT NULL,
  target_ref TEXT NOT NULL,
  expected_head_digest TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('NOT_ELIGIBLE','ELIGIBLE','PROMOTING','PROMOTED','FAILED','CANCELLED')),
  promoted_digest TEXT,
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
  completed_at_ms INTEGER
) STRICT;

CREATE TRIGGER promotions_terminal_immutable
BEFORE UPDATE ON promotions
WHEN OLD.state IN ('PROMOTED','CANCELLED')
BEGIN
  SELECT RAISE(ABORT, 'terminal promotion is immutable');
END;

CREATE TRIGGER promotions_state_transition
BEFORE UPDATE OF state ON promotions
WHEN NEW.state IS NOT OLD.state
BEGIN
  SELECT CASE WHEN NOT (
    (OLD.state='NOT_ELIGIBLE' AND NEW.state IN ('ELIGIBLE','CANCELLED')) OR
    (OLD.state='ELIGIBLE' AND NEW.state IN ('PROMOTING','CANCELLED')) OR
    (OLD.state='PROMOTING' AND NEW.state IN ('PROMOTED','FAILED')) OR
    (OLD.state='FAILED' AND NEW.state IN ('ELIGIBLE','CANCELLED'))
  ) THEN RAISE(ABORT, 'illegal promotion state transition') END;
  SELECT CASE WHEN NEW.state='ELIGIBLE' AND
    COALESCE((SELECT state FROM qualifications WHERE qualification_id=NEW.qualification_id),'')!='QUALIFIED'
    THEN RAISE(ABORT, 'promotion requires qualified subject') END;
  SELECT CASE WHEN NEW.state='PROMOTED' AND (NEW.promoted_digest IS NULL OR NEW.completed_at_ms IS NULL)
    THEN RAISE(ABORT, 'promoted state requires digest and completion time') END;
END;

CREATE TABLE projection_state (
  destination TEXT PRIMARY KEY,
  last_published_event_seq INTEGER NOT NULL DEFAULT 0 CHECK(last_published_event_seq >= 0),
  projection_sha256 TEXT,
  published_at_ms INTEGER
) STRICT;
