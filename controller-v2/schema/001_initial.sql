-- Controller 2.0 Foundation-002 initial schema
-- Target: SQLite >= 3.37 (STRICT tables); validated against SQLite 3.46.1.

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA busy_timeout = 5000;

CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    checksum_sha256 TEXT NOT NULL,
    applied_at_ms INTEGER NOT NULL CHECK (applied_at_ms > 0)
) STRICT;

CREATE TABLE repositories (
    repository_id TEXT PRIMARY KEY,
    provider TEXT NOT NULL CHECK (provider IN ('github')),
    owner TEXT NOT NULL,
    name TEXT NOT NULL,
    canonical_url TEXT NOT NULL UNIQUE,
    object_format TEXT NOT NULL CHECK (object_format IN ('sha1','sha256')),
    created_at_ms INTEGER NOT NULL CHECK (created_at_ms > 0),
    UNIQUE(provider, owner, name)
) STRICT;

CREATE TABLE subjects (
    subject_id TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL REFERENCES repositories(repository_id) ON DELETE RESTRICT,
    object_format TEXT NOT NULL CHECK (object_format IN ('sha1','sha256')),
    object_oid TEXT NOT NULL,
    parent_subject_id TEXT REFERENCES subjects(subject_id) ON DELETE RESTRICT,
    lineage_kind TEXT NOT NULL CHECK (lineage_kind IN ('BASE','CANDIDATE','REPAIR','PROMOTED')),
    created_by_transaction_id TEXT,
    created_at_ms INTEGER NOT NULL CHECK (created_at_ms > 0),
    CHECK (
      (object_format = 'sha1' AND length(object_oid) = 40 AND object_oid NOT GLOB '*[^0-9a-f]*') OR
      (object_format = 'sha256' AND length(object_oid) = 64 AND object_oid NOT GLOB '*[^0-9a-f]*')
    ),
    UNIQUE(repository_id, object_format, object_oid)
) STRICT;

CREATE TABLE commands (
    command_id TEXT PRIMARY KEY,
    caller_type TEXT NOT NULL CHECK (caller_type IN ('USER','CHAT','AUTOMATION','CONTROLLER','ADMIN')),
    caller_id TEXT NOT NULL,
    command_type TEXT NOT NULL,
    command_schema_version INTEGER NOT NULL CHECK (command_schema_version >= 1),
    canonical_payload_json TEXT NOT NULL,
    fingerprint_sha256 TEXT NOT NULL CHECK (length(fingerprint_sha256) = 64 AND fingerprint_sha256 NOT GLOB '*[^0-9a-f]*'),
    disposition TEXT NOT NULL CHECK (disposition IN ('ACCEPTED','REJECTED')),
    rejection_code TEXT,
    received_at_ms INTEGER NOT NULL CHECK (received_at_ms > 0),
    CHECK ((disposition = 'REJECTED' AND rejection_code IS NOT NULL) OR (disposition = 'ACCEPTED' AND rejection_code IS NULL))
) STRICT;

CREATE TABLE transactions (
    transaction_id TEXT PRIMARY KEY,
    command_id TEXT NOT NULL UNIQUE REFERENCES commands(command_id) ON DELETE RESTRICT,
    repository_id TEXT NOT NULL REFERENCES repositories(repository_id) ON DELETE RESTRICT,
    base_subject_id TEXT NOT NULL REFERENCES subjects(subject_id) ON DELETE RESTRICT,
    candidate_subject_id TEXT REFERENCES subjects(subject_id) ON DELETE RESTRICT,
    parent_transaction_id TEXT REFERENCES transactions(transaction_id) ON DELETE RESTRICT,
    relation_to_parent TEXT CHECK (relation_to_parent IN ('REPAIR','RETRY_NEW_INTENT','REBASE','SUCCESSOR')),
    controller_version TEXT NOT NULL,
    controller_commit_oid TEXT NOT NULL,
    policy_version TEXT NOT NULL,
    policy_digest_sha256 TEXT NOT NULL CHECK (length(policy_digest_sha256) = 64 AND policy_digest_sha256 NOT GLOB '*[^0-9a-f]*'),
    execution_state TEXT NOT NULL CHECK (execution_state IN ('ADMITTED','PLANNED','CLAIMABLE','CLAIMED','RUNNING','VERIFYING','RECOVERING','SUCCEEDED','FAILED','BLOCKED','CANCELLED')),
    qualification_state TEXT NOT NULL CHECK (qualification_state IN ('NOT_REQUESTED','PENDING','RUNNING','QUALIFIED','REJECTED','INDETERMINATE')),
    promotion_state TEXT NOT NULL CHECK (promotion_state IN ('NOT_ELIGIBLE','ELIGIBLE','PROMOTING','PROMOTED','FAILED','CONFLICT')),
    terminal_code TEXT,
    row_version INTEGER NOT NULL DEFAULT 0 CHECK (row_version >= 0),
    created_at_ms INTEGER NOT NULL CHECK (created_at_ms > 0),
    updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms),
    CHECK ((parent_transaction_id IS NULL AND relation_to_parent IS NULL) OR (parent_transaction_id IS NOT NULL AND relation_to_parent IS NOT NULL))
) STRICT;

CREATE TABLE workers (
    worker_id TEXT PRIMARY KEY,
    worker_kind TEXT NOT NULL CHECK (worker_kind IN ('SECOND_SHIFT','QUALIFIER','PROMOTER','PUBLISHER','RECONCILER')),
    trust_class TEXT NOT NULL CHECK (trust_class IN ('BOUNDED_MUTATOR','READ_ONLY_QUALIFIER','PROMOTION_AUTHORITY','CONTROL_PLANE')),
    instance_nonce TEXT NOT NULL,
    capabilities_json TEXT NOT NULL,
    registered_at_ms INTEGER NOT NULL CHECK (registered_at_ms > 0),
    last_seen_at_ms INTEGER NOT NULL CHECK (last_seen_at_ms >= registered_at_ms),
    status TEXT NOT NULL CHECK (status IN ('ONLINE','DRAINING','OFFLINE','REVOKED'))
) STRICT;

CREATE TABLE protected_resources (
    resource_key TEXT PRIMARY KEY,
    resource_type TEXT NOT NULL CHECK (resource_type IN ('REPOSITORY_REF','TRANSACTION','SUBJECT','EVIDENCE_PROJECTION')),
    last_fencing_token INTEGER NOT NULL DEFAULT 0 CHECK (last_fencing_token >= 0),
    created_at_ms INTEGER NOT NULL CHECK (created_at_ms > 0)
) STRICT;

CREATE TABLE leases (
    lease_id TEXT PRIMARY KEY,
    resource_key TEXT NOT NULL REFERENCES protected_resources(resource_key) ON DELETE RESTRICT,
    transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id) ON DELETE RESTRICT,
    worker_id TEXT NOT NULL REFERENCES workers(worker_id) ON DELETE RESTRICT,
    fencing_token INTEGER NOT NULL CHECK (fencing_token > 0),
    state TEXT NOT NULL CHECK (state IN ('ACTIVE','RELEASED','EXPIRED','REVOKED')),
    acquired_at_ms INTEGER NOT NULL CHECK (acquired_at_ms > 0),
    expires_at_ms INTEGER NOT NULL CHECK (expires_at_ms > acquired_at_ms),
    last_heartbeat_at_ms INTEGER NOT NULL CHECK (last_heartbeat_at_ms >= acquired_at_ms),
    released_at_ms INTEGER,
    release_reason TEXT,
    CHECK ((state = 'ACTIVE' AND released_at_ms IS NULL) OR (state <> 'ACTIVE' AND released_at_ms IS NOT NULL)),
    UNIQUE(resource_key, fencing_token)
) STRICT;

CREATE UNIQUE INDEX one_active_lease_per_resource
ON leases(resource_key)
WHERE state = 'ACTIVE';

CREATE TABLE execution_attempts (
    attempt_id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id) ON DELETE RESTRICT,
    attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
    worker_id TEXT NOT NULL REFERENCES workers(worker_id) ON DELETE RESTRICT,
    lease_id TEXT NOT NULL REFERENCES leases(lease_id) ON DELETE RESTRICT,
    fencing_token INTEGER NOT NULL CHECK (fencing_token > 0),
    state TEXT NOT NULL CHECK (state IN ('STARTED','SUCCEEDED','FAILED','BLOCKED','INTERRUPTED','REJECTED_STALE_FENCE')),
    started_at_ms INTEGER NOT NULL CHECK (started_at_ms > 0),
    finished_at_ms INTEGER,
    result_digest_sha256 TEXT,
    error_code TEXT,
    CHECK ((state = 'STARTED' AND finished_at_ms IS NULL) OR (state <> 'STARTED' AND finished_at_ms IS NOT NULL)),
    UNIQUE(transaction_id, attempt_number)
) STRICT;

CREATE TABLE worker_results (
    result_id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id) ON DELETE RESTRICT,
    attempt_id TEXT NOT NULL REFERENCES execution_attempts(attempt_id) ON DELETE RESTRICT,
    lease_id TEXT NOT NULL REFERENCES leases(lease_id) ON DELETE RESTRICT,
    fencing_token INTEGER NOT NULL CHECK (fencing_token > 0),
    result_type TEXT NOT NULL CHECK (result_type IN ('PROGRESS','CANDIDATE_READY','EXECUTION_FAILED','BLOCKED','CHECKPOINT')),
    payload_json TEXT NOT NULL,
    payload_digest_sha256 TEXT NOT NULL CHECK (length(payload_digest_sha256) = 64 AND payload_digest_sha256 NOT GLOB '*[^0-9a-f]*'),
    accepted_at_ms INTEGER NOT NULL CHECK (accepted_at_ms > 0)
) STRICT;

CREATE TABLE qualification_attempts (
    qualification_id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id) ON DELETE RESTRICT,
    subject_id TEXT NOT NULL REFERENCES subjects(subject_id) ON DELETE RESTRICT,
    qualifier_worker_id TEXT NOT NULL REFERENCES workers(worker_id) ON DELETE RESTRICT,
    policy_version TEXT NOT NULL,
    policy_digest_sha256 TEXT NOT NULL CHECK (length(policy_digest_sha256) = 64 AND policy_digest_sha256 NOT GLOB '*[^0-9a-f]*'),
    state TEXT NOT NULL CHECK (state IN ('RUNNING','QUALIFIED','REJECTED','INDETERMINATE')),
    started_at_ms INTEGER NOT NULL CHECK (started_at_ms > 0),
    finished_at_ms INTEGER,
    receipt_id TEXT,
    CHECK ((state = 'RUNNING' AND finished_at_ms IS NULL) OR (state <> 'RUNNING' AND finished_at_ms IS NOT NULL))
) STRICT;

CREATE TABLE promotion_attempts (
    promotion_id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id) ON DELETE RESTRICT,
    subject_id TEXT NOT NULL REFERENCES subjects(subject_id) ON DELETE RESTRICT,
    promoter_worker_id TEXT NOT NULL REFERENCES workers(worker_id) ON DELETE RESTRICT,
    target_ref TEXT NOT NULL,
    expected_target_oid TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('PREPARED','RUNNING','PROMOTED','FAILED','CONFLICT','UNKNOWN')),
    started_at_ms INTEGER NOT NULL CHECK (started_at_ms > 0),
    finished_at_ms INTEGER,
    resulting_target_oid TEXT,
    error_code TEXT,
    CHECK ((state IN ('PREPARED','RUNNING') AND finished_at_ms IS NULL) OR (state NOT IN ('PREPARED','RUNNING') AND finished_at_ms IS NOT NULL))
) STRICT;

CREATE TABLE controller_events (
    event_seq INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    transaction_id TEXT REFERENCES transactions(transaction_id) ON DELETE RESTRICT,
    command_id TEXT REFERENCES commands(command_id) ON DELETE RESTRICT,
    source TEXT NOT NULL,
    event_type TEXT NOT NULL,
    subject TEXT,
    spec_version TEXT NOT NULL DEFAULT '1.0' CHECK (spec_version = '1.0'),
    data_schema TEXT NOT NULL,
    data_schema_version INTEGER NOT NULL CHECK (data_schema_version >= 1),
    payload_json TEXT NOT NULL,
    payload_digest_sha256 TEXT NOT NULL CHECK (length(payload_digest_sha256) = 64 AND payload_digest_sha256 NOT GLOB '*[^0-9a-f]*'),
    occurred_at_ms INTEGER NOT NULL CHECK (occurred_at_ms > 0),
    recorded_at_ms INTEGER NOT NULL CHECK (recorded_at_ms >= occurred_at_ms)
) STRICT;

CREATE TABLE outbox_deliveries (
    event_id TEXT NOT NULL REFERENCES controller_events(event_id) ON DELETE RESTRICT,
    destination TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('PENDING','INFLIGHT','RETRY','PUBLISHED','DEAD')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    next_attempt_at_ms INTEGER,
    last_attempt_at_ms INTEGER,
    published_at_ms INTEGER,
    last_error_code TEXT,
    remote_receipt TEXT,
    PRIMARY KEY(event_id, destination),
    CHECK ((state = 'PUBLISHED' AND published_at_ms IS NOT NULL) OR state <> 'PUBLISHED')
) STRICT;

CREATE TABLE external_effects (
    effect_id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id) ON DELETE RESTRICT,
    provider TEXT NOT NULL,
    effect_type TEXT NOT NULL,
    target_key TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_digest_sha256 TEXT NOT NULL CHECK (length(request_digest_sha256) = 64 AND request_digest_sha256 NOT GLOB '*[^0-9a-f]*'),
    expected_remote_version TEXT,
    state TEXT NOT NULL CHECK (state IN ('PREPARED','INFLIGHT','SUCCEEDED','FAILED','UNKNOWN','RECONCILING','RECONCILED')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    remote_result_ref TEXT,
    last_error_code TEXT,
    created_at_ms INTEGER NOT NULL CHECK (created_at_ms > 0),
    updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms),
    UNIQUE(provider, idempotency_key)
) STRICT;

CREATE TABLE evidence_receipts (
    receipt_id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id) ON DELETE RESTRICT,
    subject_id TEXT NOT NULL REFERENCES subjects(subject_id) ON DELETE RESTRICT,
    receipt_kind TEXT NOT NULL CHECK (receipt_kind IN ('EXECUTION','QUALIFICATION','PROMOTION','RECOVERY','AUDIT')),
    digest_algorithm TEXT NOT NULL CHECK (digest_algorithm IN ('sha256')),
    digest TEXT NOT NULL CHECK (length(digest) = 64 AND digest NOT GLOB '*[^0-9a-f]*'),
    storage_uri TEXT NOT NULL,
    manifest_json TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL CHECK (created_at_ms > 0),
    UNIQUE(receipt_kind, subject_id, digest)
) STRICT;

CREATE TABLE projection_state (
    projection_name TEXT PRIMARY KEY,
    destination TEXT NOT NULL,
    last_event_seq INTEGER NOT NULL DEFAULT 0 CHECK (last_event_seq >= 0),
    last_event_id TEXT,
    published_at_ms INTEGER,
    status TEXT NOT NULL CHECK (status IN ('CURRENT','STALE','ERROR','NEVER_PUBLISHED')),
    last_error_code TEXT
) STRICT;

CREATE INDEX transactions_execution_state_idx ON transactions(execution_state);
CREATE INDEX transactions_qualification_state_idx ON transactions(qualification_state);
CREATE INDEX transactions_promotion_state_idx ON transactions(promotion_state);
CREATE INDEX events_transaction_seq_idx ON controller_events(transaction_id, event_seq);
CREATE INDEX outbox_state_idx ON outbox_deliveries(state, next_attempt_at_ms);
CREATE INDEX effects_state_idx ON external_effects(state, updated_at_ms);
CREATE INDEX leases_transaction_idx ON leases(transaction_id, state);

CREATE TRIGGER subjects_no_update BEFORE UPDATE ON subjects BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_SUBJECT'); END;
CREATE TRIGGER subjects_no_delete BEFORE DELETE ON subjects BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_SUBJECT'); END;
CREATE TRIGGER commands_no_update BEFORE UPDATE ON commands BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_COMMAND'); END;
CREATE TRIGGER commands_no_delete BEFORE DELETE ON commands BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_COMMAND'); END;
CREATE TRIGGER events_no_update BEFORE UPDATE ON controller_events BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_EVENT'); END;
CREATE TRIGGER events_no_delete BEFORE DELETE ON controller_events BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_EVENT'); END;
CREATE TRIGGER evidence_no_update BEFORE UPDATE ON evidence_receipts BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_EVIDENCE'); END;
CREATE TRIGGER evidence_no_delete BEFORE DELETE ON evidence_receipts BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_EVIDENCE'); END;

CREATE TRIGGER transactions_identity_immutable
BEFORE UPDATE ON transactions
WHEN NEW.command_id <> OLD.command_id OR NEW.repository_id <> OLD.repository_id OR NEW.base_subject_id <> OLD.base_subject_id
 OR NEW.controller_version <> OLD.controller_version OR NEW.controller_commit_oid <> OLD.controller_commit_oid
 OR NEW.policy_version <> OLD.policy_version OR NEW.policy_digest_sha256 <> OLD.policy_digest_sha256
 OR IFNULL(NEW.parent_transaction_id, '') <> IFNULL(OLD.parent_transaction_id, '')
 OR IFNULL(NEW.relation_to_parent, '') <> IFNULL(OLD.relation_to_parent, '')
 OR (OLD.candidate_subject_id IS NOT NULL AND IFNULL(NEW.candidate_subject_id, '') <> OLD.candidate_subject_id)
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_TRANSACTION_IDENTITY'); END;

CREATE TRIGGER execution_state_transition_guard
BEFORE UPDATE OF execution_state ON transactions
WHEN NEW.execution_state <> OLD.execution_state AND NOT (
 (OLD.execution_state='ADMITTED' AND NEW.execution_state IN ('PLANNED','CANCELLED')) OR
 (OLD.execution_state='PLANNED' AND NEW.execution_state IN ('CLAIMABLE','BLOCKED','CANCELLED')) OR
 (OLD.execution_state='CLAIMABLE' AND NEW.execution_state IN ('CLAIMED','BLOCKED','CANCELLED')) OR
 (OLD.execution_state='CLAIMED' AND NEW.execution_state IN ('RUNNING','RECOVERING','CANCELLED')) OR
 (OLD.execution_state='RUNNING' AND NEW.execution_state IN ('VERIFYING','FAILED','BLOCKED','RECOVERING','CANCELLED')) OR
 (OLD.execution_state='VERIFYING' AND NEW.execution_state IN ('SUCCEEDED','FAILED','BLOCKED','RECOVERING')) OR
 (OLD.execution_state='RECOVERING' AND NEW.execution_state IN ('CLAIMABLE','FAILED','BLOCKED','CANCELLED')) OR
 (OLD.execution_state='BLOCKED' AND NEW.execution_state IN ('PLANNED','CANCELLED')))
BEGIN SELECT RAISE(ABORT, 'INVALID_EXECUTION_TRANSITION'); END;

CREATE TRIGGER qualification_state_transition_guard
BEFORE UPDATE OF qualification_state ON transactions
WHEN NEW.qualification_state <> OLD.qualification_state AND NOT (
 (OLD.qualification_state='NOT_REQUESTED' AND NEW.qualification_state='PENDING') OR
 (OLD.qualification_state='PENDING' AND NEW.qualification_state IN ('RUNNING','INDETERMINATE')) OR
 (OLD.qualification_state='RUNNING' AND NEW.qualification_state IN ('QUALIFIED','REJECTED','INDETERMINATE')) OR
 (OLD.qualification_state='INDETERMINATE' AND NEW.qualification_state='PENDING'))
BEGIN SELECT RAISE(ABORT, 'INVALID_QUALIFICATION_TRANSITION'); END;

CREATE TRIGGER promotion_eligibility_guard
BEFORE UPDATE OF promotion_state ON transactions
WHEN NEW.promotion_state='ELIGIBLE' AND NOT (NEW.execution_state='SUCCEEDED' AND NEW.qualification_state='QUALIFIED' AND NEW.candidate_subject_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'PROMOTION_NOT_ELIGIBLE'); END;

CREATE TRIGGER promotion_state_transition_guard
BEFORE UPDATE OF promotion_state ON transactions
WHEN NEW.promotion_state <> OLD.promotion_state AND NOT (
 (OLD.promotion_state='NOT_ELIGIBLE' AND NEW.promotion_state='ELIGIBLE') OR
 (OLD.promotion_state='ELIGIBLE' AND NEW.promotion_state='PROMOTING') OR
 (OLD.promotion_state='PROMOTING' AND NEW.promotion_state IN ('PROMOTED','FAILED','CONFLICT')) OR
 (OLD.promotion_state='FAILED' AND NEW.promotion_state='ELIGIBLE'))
BEGIN SELECT RAISE(ABORT, 'INVALID_PROMOTION_TRANSITION'); END;

CREATE TRIGGER lease_identity_immutable
BEFORE UPDATE ON leases
WHEN NEW.resource_key <> OLD.resource_key OR NEW.transaction_id <> OLD.transaction_id OR NEW.worker_id <> OLD.worker_id
 OR NEW.fencing_token <> OLD.fencing_token OR NEW.acquired_at_ms <> OLD.acquired_at_ms
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_LEASE_IDENTITY'); END;

CREATE TRIGGER lease_state_transition_guard
BEFORE UPDATE OF state ON leases
WHEN NEW.state <> OLD.state AND NOT (OLD.state='ACTIVE' AND NEW.state IN ('RELEASED','EXPIRED','REVOKED'))
BEGIN SELECT RAISE(ABORT, 'INVALID_LEASE_TRANSITION'); END;

CREATE TRIGGER lease_monotonic_time_guard
BEFORE UPDATE ON leases
WHEN NEW.last_heartbeat_at_ms < OLD.last_heartbeat_at_ms OR NEW.expires_at_ms < OLD.expires_at_ms
BEGIN SELECT RAISE(ABORT, 'LEASE_TIME_REGRESSION'); END;

CREATE TRIGGER worker_result_live_fence_guard
BEFORE INSERT ON worker_results
WHEN NOT EXISTS (SELECT 1 FROM leases l WHERE l.lease_id=NEW.lease_id AND l.transaction_id=NEW.transaction_id AND l.fencing_token=NEW.fencing_token AND l.state='ACTIVE' AND l.expires_at_ms >= NEW.accepted_at_ms)
BEGIN SELECT RAISE(ABORT, 'STALE_OR_INVALID_FENCE'); END;

CREATE TRIGGER lease_current_fence_guard
BEFORE INSERT ON leases
WHEN NOT EXISTS (SELECT 1 FROM protected_resources r WHERE r.resource_key=NEW.resource_key AND r.last_fencing_token=NEW.fencing_token)
BEGIN SELECT RAISE(ABORT, 'FENCING_TOKEN_NOT_CURRENT'); END;

CREATE TRIGGER transaction_insert_guard
BEFORE INSERT ON transactions
WHEN NEW.execution_state <> 'ADMITTED' OR NEW.qualification_state <> 'NOT_REQUESTED' OR NEW.promotion_state <> 'NOT_ELIGIBLE'
 OR NOT EXISTS (SELECT 1 FROM commands c WHERE c.command_id=NEW.command_id AND c.disposition='ACCEPTED')
 OR NOT EXISTS (SELECT 1 FROM subjects s WHERE s.subject_id=NEW.base_subject_id AND s.repository_id=NEW.repository_id)
BEGIN SELECT RAISE(ABORT, 'INVALID_TRANSACTION_INITIAL_STATE_OR_BINDING'); END;

CREATE TRIGGER transaction_version_guard
BEFORE UPDATE ON transactions
WHEN NEW.row_version <> OLD.row_version + 1 OR NEW.updated_at_ms < OLD.updated_at_ms
BEGIN SELECT RAISE(ABORT, 'INVALID_TRANSACTION_VERSION'); END;

CREATE TRIGGER transaction_candidate_repository_guard
BEFORE UPDATE OF candidate_subject_id ON transactions
WHEN NEW.candidate_subject_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM subjects s WHERE s.subject_id=NEW.candidate_subject_id AND s.repository_id=NEW.repository_id)
BEGIN SELECT RAISE(ABORT, 'CANDIDATE_REPOSITORY_MISMATCH'); END;

CREATE TRIGGER qualification_start_guard
BEFORE UPDATE OF qualification_state ON transactions
WHEN NEW.qualification_state='PENDING' AND NOT (NEW.execution_state='SUCCEEDED' AND NEW.candidate_subject_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'QUALIFICATION_NOT_READY'); END;

CREATE TRIGGER qualification_attempt_binding_guard
BEFORE INSERT ON qualification_attempts
WHEN NOT EXISTS (SELECT 1 FROM transactions t WHERE t.transaction_id=NEW.transaction_id AND t.candidate_subject_id=NEW.subject_id AND t.execution_state='SUCCEEDED' AND t.policy_version=NEW.policy_version AND t.policy_digest_sha256=NEW.policy_digest_sha256)
BEGIN SELECT RAISE(ABORT, 'INVALID_QUALIFICATION_BINDING'); END;

CREATE TRIGGER promotion_attempt_binding_guard
BEFORE INSERT ON promotion_attempts
WHEN NOT EXISTS (SELECT 1 FROM transactions t WHERE t.transaction_id=NEW.transaction_id AND t.candidate_subject_id=NEW.subject_id AND t.execution_state='SUCCEEDED' AND t.qualification_state='QUALIFIED' AND t.promotion_state IN ('ELIGIBLE','PROMOTING'))
BEGIN SELECT RAISE(ABORT, 'INVALID_PROMOTION_BINDING'); END;

CREATE TRIGGER lease_active_mutation_guard
BEFORE UPDATE ON leases
WHEN OLD.state <> 'ACTIVE' AND (NEW.last_heartbeat_at_ms <> OLD.last_heartbeat_at_ms OR NEW.expires_at_ms <> OLD.expires_at_ms)
BEGIN SELECT RAISE(ABORT, 'INACTIVE_LEASE_CANNOT_RENEW'); END;

CREATE TRIGGER outbox_state_transition_guard
BEFORE UPDATE OF state ON outbox_deliveries
WHEN NEW.state <> OLD.state AND NOT (
 (OLD.state='PENDING' AND NEW.state IN ('INFLIGHT','DEAD')) OR
 (OLD.state='INFLIGHT' AND NEW.state IN ('PUBLISHED','RETRY','DEAD')) OR
 (OLD.state='RETRY' AND NEW.state IN ('INFLIGHT','DEAD')))
BEGIN SELECT RAISE(ABORT, 'INVALID_OUTBOX_TRANSITION'); END;

CREATE TRIGGER external_effect_state_transition_guard
BEFORE UPDATE OF state ON external_effects
WHEN NEW.state <> OLD.state AND NOT (
 (OLD.state='PREPARED' AND NEW.state='INFLIGHT') OR
 (OLD.state='INFLIGHT' AND NEW.state IN ('SUCCEEDED','FAILED','UNKNOWN')) OR
 (OLD.state='UNKNOWN' AND NEW.state='RECONCILING') OR
 (OLD.state='RECONCILING' AND NEW.state IN ('SUCCEEDED','FAILED','UNKNOWN')) OR
 (OLD.state='FAILED' AND NEW.state='PREPARED'))
BEGIN SELECT RAISE(ABORT, 'INVALID_EXTERNAL_EFFECT_TRANSITION'); END;

CREATE TRIGGER execution_claim_requires_lease
BEFORE UPDATE OF execution_state ON transactions
WHEN NEW.execution_state='CLAIMED' AND NOT EXISTS (SELECT 1 FROM leases l WHERE l.transaction_id=NEW.transaction_id AND l.state='ACTIVE' AND l.expires_at_ms >= NEW.updated_at_ms)
BEGIN SELECT RAISE(ABORT, 'CLAIM_REQUIRES_ACTIVE_LEASE'); END;

CREATE TRIGGER execution_active_requires_lease
BEFORE UPDATE OF execution_state ON transactions
WHEN NEW.execution_state IN ('RUNNING','VERIFYING') AND NOT EXISTS (SELECT 1 FROM leases l WHERE l.transaction_id=NEW.transaction_id AND l.state='ACTIVE' AND l.expires_at_ms >= NEW.updated_at_ms)
BEGIN SELECT RAISE(ABORT, 'EXECUTION_REQUIRES_ACTIVE_LEASE'); END;

CREATE TRIGGER execution_attempt_live_fence_guard
BEFORE INSERT ON execution_attempts
WHEN NOT EXISTS (SELECT 1 FROM leases l WHERE l.lease_id=NEW.lease_id AND l.transaction_id=NEW.transaction_id AND l.worker_id=NEW.worker_id AND l.fencing_token=NEW.fencing_token AND l.state='ACTIVE' AND l.expires_at_ms >= NEW.started_at_ms)
BEGIN SELECT RAISE(ABORT, 'ATTEMPT_REQUIRES_CURRENT_FENCE'); END;

CREATE TRIGGER worker_result_attempt_binding_guard
BEFORE INSERT ON worker_results
WHEN NOT EXISTS (SELECT 1 FROM execution_attempts a WHERE a.attempt_id=NEW.attempt_id AND a.transaction_id=NEW.transaction_id AND a.lease_id=NEW.lease_id AND a.fencing_token=NEW.fencing_token)
BEGIN SELECT RAISE(ABORT, 'RESULT_ATTEMPT_BINDING_MISMATCH'); END;

CREATE TRIGGER resource_fence_monotonic_guard
BEFORE UPDATE OF last_fencing_token ON protected_resources
WHEN NEW.last_fencing_token <> OLD.last_fencing_token + 1
BEGIN SELECT RAISE(ABORT, 'FENCING_TOKEN_MUST_INCREMENT_BY_ONE'); END;

CREATE TRIGGER resource_no_delete BEFORE DELETE ON protected_resources BEGIN SELECT RAISE(ABORT, 'PROTECTED_RESOURCE_IMMUTABLE_IDENTITY'); END;

CREATE TRIGGER subject_repository_format_guard
BEFORE INSERT ON subjects
WHEN NOT EXISTS (SELECT 1 FROM repositories r WHERE r.repository_id=NEW.repository_id AND r.object_format=NEW.object_format)
BEGIN SELECT RAISE(ABORT, 'SUBJECT_OBJECT_FORMAT_MISMATCH'); END;

CREATE TRIGGER worker_identity_immutable
BEFORE UPDATE ON workers
WHEN NEW.worker_id <> OLD.worker_id OR NEW.worker_kind <> OLD.worker_kind OR NEW.trust_class <> OLD.trust_class OR NEW.instance_nonce <> OLD.instance_nonce OR NEW.registered_at_ms <> OLD.registered_at_ms
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_WORKER_IDENTITY'); END;

CREATE TRIGGER projection_sequence_monotonic_guard
BEFORE UPDATE OF last_event_seq ON projection_state
WHEN NEW.last_event_seq < OLD.last_event_seq
BEGIN SELECT RAISE(ABORT, 'PROJECTION_SEQUENCE_REGRESSION'); END;

CREATE TRIGGER external_effect_identity_immutable
BEFORE UPDATE ON external_effects
WHEN NEW.transaction_id <> OLD.transaction_id OR NEW.provider <> OLD.provider OR NEW.effect_type <> OLD.effect_type OR NEW.target_key <> OLD.target_key
 OR NEW.idempotency_key <> OLD.idempotency_key OR NEW.request_digest_sha256 <> OLD.request_digest_sha256
 OR IFNULL(NEW.expected_remote_version,'') <> IFNULL(OLD.expected_remote_version,'') OR NEW.created_at_ms <> OLD.created_at_ms OR NEW.updated_at_ms < OLD.updated_at_ms
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_OR_REGRESSED_EXTERNAL_EFFECT'); END;

PRAGMA user_version = 1;
