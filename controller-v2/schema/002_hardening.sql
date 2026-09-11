-- Controller 2.0 Foundation-002 hardening migration
-- Applied after 001_initial.sql.

-- Worker kind and trust class are a fixed security pairing, not descriptive metadata.
CREATE TRIGGER worker_trust_insert_guard
BEFORE INSERT ON workers
WHEN NOT (
    (NEW.worker_kind='SECOND_SHIFT' AND NEW.trust_class='BOUNDED_MUTATOR') OR
    (NEW.worker_kind='QUALIFIER' AND NEW.trust_class='READ_ONLY_QUALIFIER') OR
    (NEW.worker_kind='PROMOTER' AND NEW.trust_class='PROMOTION_AUTHORITY') OR
    (NEW.worker_kind IN ('PUBLISHER','RECONCILER') AND NEW.trust_class='CONTROL_PLANE')
)
BEGIN SELECT RAISE(ABORT, 'WORKER_TRUST_CLASS_MISMATCH'); END;

-- Execution leases are issued only to bounded Second Shift workers.
CREATE TRIGGER execution_lease_worker_guard
BEFORE INSERT ON leases
WHEN NOT EXISTS (
    SELECT 1 FROM workers w
    WHERE w.worker_id=NEW.worker_id
      AND w.worker_kind='SECOND_SHIFT'
      AND w.trust_class='BOUNDED_MUTATOR'
      AND w.status='ONLINE'
)
BEGIN SELECT RAISE(ABORT, 'LEASE_WORKER_NOT_AUTHORIZED'); END;

CREATE TRIGGER execution_attempt_worker_guard
BEFORE INSERT ON execution_attempts
WHEN NOT EXISTS (
    SELECT 1 FROM workers w
    WHERE w.worker_id=NEW.worker_id
      AND w.worker_kind='SECOND_SHIFT'
      AND w.trust_class='BOUNDED_MUTATOR'
      AND w.status='ONLINE'
)
BEGIN SELECT RAISE(ABORT, 'EXECUTION_WORKER_NOT_AUTHORIZED'); END;

CREATE TRIGGER qualification_worker_guard
BEFORE INSERT ON qualification_attempts
WHEN NOT EXISTS (
    SELECT 1 FROM workers w
    WHERE w.worker_id=NEW.qualifier_worker_id
      AND w.worker_kind='QUALIFIER'
      AND w.trust_class='READ_ONLY_QUALIFIER'
      AND w.status='ONLINE'
)
BEGIN SELECT RAISE(ABORT, 'QUALIFIER_NOT_AUTHORIZED'); END;

CREATE TRIGGER promotion_worker_guard
BEFORE INSERT ON promotion_attempts
WHEN NOT EXISTS (
    SELECT 1 FROM workers w
    WHERE w.worker_id=NEW.promoter_worker_id
      AND w.worker_kind='PROMOTER'
      AND w.trust_class='PROMOTION_AUTHORITY'
      AND w.status='ONLINE'
)
BEGIN SELECT RAISE(ABORT, 'PROMOTER_NOT_AUTHORIZED'); END;

-- External effects must always begin PREPARED. This makes the legacy-reserved
-- RECONCILED enum value unreachable in Foundation-002; it will be removed on
-- the first table-rebuild migration instead of risking an in-place bootstrap rewrite.
CREATE TRIGGER external_effect_initial_state_guard
BEFORE INSERT ON external_effects
WHEN NEW.state <> 'PREPARED'
BEGIN SELECT RAISE(ABORT, 'EXTERNAL_EFFECT_MUST_BEGIN_PREPARED'); END;

-- Controller code identity must be a valid Git object identifier. The current
-- schema stores controller object format implicitly as SHA-1; SHA-256 support
-- requires an explicit future schema migration before use.
CREATE TRIGGER transaction_controller_oid_insert_guard
BEFORE INSERT ON transactions
WHEN NOT (length(NEW.controller_commit_oid)=40 AND NEW.controller_commit_oid NOT GLOB '*[^0-9a-f]*')
BEGIN SELECT RAISE(ABORT, 'INVALID_CONTROLLER_COMMIT_OID'); END;

PRAGMA user_version = 2;
