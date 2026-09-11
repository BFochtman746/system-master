-- Controller 2.0 Foundation-003 reliability hardening
-- Applied after 003_proof_boundaries.sql. Historical migrations are immutable.

-- Projection identity is fixed. A cursor may point only at a real controller
-- event, preventing fabricated or cross-event freshness claims.
CREATE TRIGGER projection_identity_immutable_v4
BEFORE UPDATE ON projection_state
WHEN NEW.projection_name <> OLD.projection_name OR NEW.destination <> OLD.destination
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_PROJECTION_IDENTITY'); END;

CREATE TRIGGER projection_event_binding_insert_guard_v4
BEFORE INSERT ON projection_state
WHEN (NEW.last_event_seq = 0 AND NEW.last_event_id IS NOT NULL)
 OR (NEW.last_event_seq > 0 AND (
      NEW.last_event_id IS NULL OR
      NOT EXISTS (
          SELECT 1 FROM controller_events e
          WHERE e.event_seq=NEW.last_event_seq AND e.event_id=NEW.last_event_id
      )
 ))
BEGIN SELECT RAISE(ABORT, 'PROJECTION_CURSOR_MUST_REFERENCE_REAL_EVENT'); END;

CREATE TRIGGER projection_event_binding_update_guard_v4
BEFORE UPDATE OF last_event_seq,last_event_id ON projection_state
WHEN (NEW.last_event_seq = 0 AND NEW.last_event_id IS NOT NULL)
 OR (NEW.last_event_seq > 0 AND (
      NEW.last_event_id IS NULL OR
      NOT EXISTS (
          SELECT 1 FROM controller_events e
          WHERE e.event_seq=NEW.last_event_seq AND e.event_id=NEW.last_event_id
      )
 ))
BEGIN SELECT RAISE(ABORT, 'PROJECTION_CURSOR_MUST_REFERENCE_REAL_EVENT'); END;

-- External effects are deliberately conservative: every remote attempt increments
-- exactly once; ambiguous outcomes carry a reason and cannot jump back to PREPARED;
-- a claimed success must carry a remote result reference that reconciliation can audit.
CREATE TRIGGER external_effect_attempt_count_monotonic_v4
BEFORE UPDATE OF attempt_count ON external_effects
WHEN NEW.attempt_count < OLD.attempt_count
BEGIN SELECT RAISE(ABORT, 'EXTERNAL_EFFECT_ATTEMPT_COUNT_REGRESSION'); END;

CREATE TRIGGER external_effect_inflight_attempt_guard_v4
BEFORE UPDATE OF state ON external_effects
WHEN NEW.state='INFLIGHT' AND OLD.state='PREPARED'
 AND NEW.attempt_count <> OLD.attempt_count + 1
BEGIN SELECT RAISE(ABORT, 'EXTERNAL_EFFECT_ATTEMPT_MUST_INCREMENT_ON_SEND'); END;

CREATE TRIGGER external_effect_outcome_evidence_guard_v4
BEFORE UPDATE OF state ON external_effects
WHEN NEW.state <> OLD.state AND (
    (NEW.state='SUCCEEDED' AND NEW.remote_result_ref IS NULL) OR
    (NEW.state IN ('FAILED','UNKNOWN') AND NEW.last_error_code IS NULL)
)
BEGIN SELECT RAISE(ABORT, 'EXTERNAL_EFFECT_OUTCOME_REQUIRES_EVIDENCE'); END;

CREATE TRIGGER external_effect_success_immutable_v4
BEFORE UPDATE ON external_effects
WHEN OLD.state='SUCCEEDED' AND (
    NEW.state <> OLD.state OR
    IFNULL(NEW.remote_result_ref,'') <> IFNULL(OLD.remote_result_ref,'') OR
    IFNULL(NEW.last_error_code,'') <> IFNULL(OLD.last_error_code,'') OR
    NEW.attempt_count <> OLD.attempt_count
)
BEGIN SELECT RAISE(ABORT, 'SUCCEEDED_EXTERNAL_EFFECT_IS_IMMUTABLE'); END;

PRAGMA user_version = 4;
