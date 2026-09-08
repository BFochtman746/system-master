from __future__ import annotations

from typing import Any, Dict, List, Optional

from .engine import InjectedCrash
from .repository import Repository, digest


ADAPTIVE_ENTRY_JOURNEY_VERSION = "LEARNING-ADAPTIVE-ENTRY-JOURNEY-V1"

# These runtime actions represent current evidence obligations. They must take
# precedence over placement shortcuts derived from older diagnostic state.
RUNTIME_EVIDENCE_PRECEDENCE = {
    "RETENTION_WAIT",
    "RETENTION_CHECK",
    "MAINTENANCE_RECHECK",
    "MAINTENANCE_RESEARCH_REQUIRED",
    "TRANSFER_CHECK",
    "TRANSFER_REMEDIATION",
}


class AdaptiveEntryJourneyDirector:
    """Durable orchestration for diagnostic entry into the existing Learning runtime.

    This director owns no mastery state. BaselineDiagnosticDirector remains routing-only;
    the Learning engine remains the authority for attempts/projections/retention/transfer;
    TutorDirector remains formative; MultiSessionDirector remains the session authority.
    """

    POLICY_VERSION = ADAPTIVE_ENTRY_JOURNEY_VERSION

    def __init__(self, repo: Repository, engine, diagnostic_director, tutor_director, session_director):
        self.repo = repo
        self.engine = engine
        self.diagnostic = diagnostic_director
        self.tutor = tutor_director
        self.sessions = session_director

    def _journey(self, journey_id: str) -> Dict[str, Any]:
        body = self.repo.get_object("adaptive_entry_journey", journey_id, 1)
        if not body:
            raise KeyError(journey_id)
        return body

    def _validate_session(self, *, session_id: str, learner_id: str, course_id: str) -> Dict[str, Any]:
        session = self.repo.get_learning_session(session_id)
        if not session:
            raise ValueError("LEARNING_SESSION_REQUIRED")
        if session["state"] != "ACTIVE":
            raise ValueError("LEARNING_SESSION_NOT_ACTIVE")
        if (session["learner_id"], session["course_id"]) != (learner_id, course_id):
            raise ValueError("LEARNING_SESSION_SCOPE_MISMATCH")
        return session

    def start_journey(
        self,
        *,
        operation_id: str,
        journey_id: str,
        diagnostic_id: str,
        learner_id: str,
        course_id: str,
        claimed_skill_ids: List[str],
        started_at: int,
        course_version: int = 1,
        crash_after_phase: Optional[str] = None,
    ) -> Dict[str, Any]:
        payload = {
            "journey_id": journey_id,
            "diagnostic_id": diagnostic_id,
            "learner_id": learner_id,
            "course_id": course_id,
            "claimed_skill_ids": sorted(set(claimed_skill_ids)),
            "started_at": started_at,
            "course_version": course_version,
        }
        prior = self.repo.operation_result(operation_id, payload)
        if prior:
            return prior

        existing = self.repo.get_object("adaptive_entry_journey", journey_id, 1)
        if existing:
            if existing.get("start_payload_digest") != digest(payload):
                raise ValueError("ADAPTIVE_ENTRY_JOURNEY_ID_REUSE")
            result = existing["start_result"]
            self.repo.record_operation(operation_id, payload, result)
            return result

        diagnostic = self.diagnostic.create_diagnostic(
            operation_id=f"{operation_id}:diagnostic",
            diagnostic_id=diagnostic_id,
            learner_id=learner_id,
            course_id=course_id,
            claimed_skill_ids=claimed_skill_ids,
            created_at=started_at,
            course_version=course_version,
        )
        if crash_after_phase == "DIAGNOSTIC_CREATED":
            raise InjectedCrash("crash after adaptive-entry diagnostic creation")

        result = {
            "journey_id": journey_id,
            "diagnostic_id": diagnostic_id,
            "learner_id": learner_id,
            "course_id": course_id,
            "claimed_skill_ids": sorted(set(claimed_skill_ids)),
            "state": "ENTRY_ACTIVE",
            "next_action": diagnostic["next_action"],
            "policy_version": self.POLICY_VERSION,
        }
        body = {
            **result,
            "course_version": course_version,
            "started_at": started_at,
            "start_payload_digest": digest(payload),
            "start_result": result,
            "authority_boundary": {
                "diagnostic_routing_only": True,
                "tutor_formative_only": True,
                "mastery_authority": "LEARNING_ENGINE",
                "session_authority": "MULTI_SESSION_DIRECTOR",
            },
        }
        self.repo.put_object("adaptive_entry_journey", journey_id, 1, body)
        if crash_after_phase == "JOURNEY_STORED":
            raise InjectedCrash("crash after adaptive-entry journey stored")
        self.repo.record_operation(operation_id, payload, result)
        self.repo.emit("AdaptiveEntryJourneyStarted", journey_id, {
            "diagnostic_id": diagnostic_id,
            "learner_id": learner_id,
            "course_id": course_id,
        })
        return result

    @staticmethod
    def _map_diagnostic_action(action: Dict[str, Any]) -> Dict[str, Any]:
        action_type = action["action_type"]
        if action_type == "TARGETED_REMEDIATION":
            return {
                **action,
                "action_type": "TUTOR_REMEDIATION",
                "reason_codes": list(action.get("reason_codes", [])) + ["TUTOR_OWNS_FORMATIVE_REMEDIATION"],
            }
        if action_type == "LESSON":
            return {
                **action,
                "action_type": "TUTOR_INSTRUCTION",
                "reason_codes": list(action.get("reason_codes", [])) + ["TUTOR_OWNS_FORMATIVE_INSTRUCTION"],
            }
        return dict(action)

    def _compose_action(self, *, journey: Dict[str, Any], now: int) -> Dict[str, Any]:
        learner_id = journey["learner_id"]
        course_id = journey["course_id"]
        diagnostic_action = self.diagnostic.next_action(journey["diagnostic_id"])
        runtime_action = self.engine.next_action(learner_id, course_id, now=now)

        if runtime_action["action_type"] in RUNTIME_EVIDENCE_PRECEDENCE:
            selected = dict(runtime_action)
            authority = "LEARNING_ENGINE_CURRENT_EVIDENCE"
        elif diagnostic_action["action_type"] == "ADAPTIVE_REVALIDATION":
            selected = dict(runtime_action)
            authority = "LEARNING_ENGINE_REVALIDATION"
        elif diagnostic_action["action_type"] == "COURSE_ENTRY_COMPLETE":
            selected = dict(runtime_action)
            authority = "LEARNING_ENGINE_POST_ENTRY"
        else:
            selected = self._map_diagnostic_action(diagnostic_action)
            authority = "BASELINE_DIAGNOSTIC_ROUTING"

        return {
            "selected": selected,
            "authority": authority,
            "diagnostic_action": diagnostic_action,
            "runtime_action": runtime_action,
        }

    def plan_next(
        self,
        *,
        operation_id: str,
        decision_id: str,
        journey_id: str,
        session_id: str,
        now: int,
        crash_after_phase: Optional[str] = None,
    ) -> Dict[str, Any]:
        journey = self._journey(journey_id)
        payload = {
            "decision_id": decision_id,
            "journey_id": journey_id,
            "session_id": session_id,
            "now": now,
        }
        prior = self.repo.operation_result(operation_id, payload)
        if prior:
            return prior

        existing = self.repo.get_object("adaptive_entry_decision", decision_id, 1)
        if existing:
            if existing.get("operation_id") != operation_id or existing.get("payload_digest") != digest(payload):
                raise ValueError("ADAPTIVE_ENTRY_DECISION_ID_REUSE")
            result = existing["result"]
            self.repo.record_operation(operation_id, payload, result)
            return result

        session = self._validate_session(
            session_id=session_id,
            learner_id=journey["learner_id"],
            course_id=journey["course_id"],
        )
        if crash_after_phase == "SESSION_BOUND":
            raise InjectedCrash("crash after adaptive-entry session binding")

        composition = self._compose_action(journey=journey, now=now)
        if crash_after_phase == "ACTIONS_COMPOSED":
            raise InjectedCrash("crash after adaptive-entry action composition")

        entry_complete = composition["diagnostic_action"]["action_type"] == "COURSE_ENTRY_COMPLETE"
        result = {
            "decision_id": decision_id,
            "journey_id": journey_id,
            "diagnostic_id": journey["diagnostic_id"],
            "session_id": session_id,
            "session_started_at": session["started_at"],
            "session_count": len(self.repo.sessions_for_learner(journey["learner_id"], journey["course_id"])),
            "learner_id": journey["learner_id"],
            "course_id": journey["course_id"],
            "as_of": now,
            "state": "RUNTIME_CONTINUATION" if entry_complete else "ENTRY_ACTIVE",
            "next_action": composition["selected"],
            "selected_authority": composition["authority"],
            "diagnostic_action": composition["diagnostic_action"],
            "runtime_action": composition["runtime_action"],
            "policy_version": self.POLICY_VERSION,
        }
        body = {
            "operation_id": operation_id,
            "payload_digest": digest(payload),
            "result": result,
        }
        self.repo.put_object("adaptive_entry_decision", decision_id, 1, body)
        if crash_after_phase == "DECISION_STORED_BEFORE_RETURN":
            raise InjectedCrash("crash after durable adaptive-entry decision")
        self.repo.record_operation(operation_id, payload, result)
        self.repo.emit("AdaptiveEntryNextActionSelected", decision_id, {
            "journey_id": journey_id,
            "session_id": session_id,
            "action": result["next_action"],
            "authority": result["selected_authority"],
        })
        return result

    def record_diagnostic_probe(self, *, journey_id: str, now: int, **kwargs) -> Dict[str, Any]:
        journey = self._journey(journey_id)
        composed = self._compose_action(journey=journey, now=now)
        selected = composed["selected"]
        if selected["action_type"] != "DIAGNOSTIC_PROBE":
            raise ValueError("ADAPTIVE_ENTRY_DIAGNOSTIC_PROBE_NOT_CURRENT")
        if kwargs.get("diagnostic_id") != journey["diagnostic_id"]:
            raise ValueError("ADAPTIVE_ENTRY_DIAGNOSTIC_SCOPE_MISMATCH")
        if kwargs.get("item_id") != selected["target_id"]:
            raise ValueError("ADAPTIVE_ENTRY_DIAGNOSTIC_TARGET_MISMATCH")
        return self.diagnostic.record_probe(**kwargs)

    def process_tutor_turn(
        self,
        *,
        journey_id: str,
        session_id: str,
        operation_id: str,
        turn_id: str,
        probe_id: str,
        response: str,
        requested_help_level: int,
        now: int,
        crash_after_phase: Optional[str] = None,
    ) -> Dict[str, Any]:
        journey = self._journey(journey_id)
        self._validate_session(
            session_id=session_id,
            learner_id=journey["learner_id"],
            course_id=journey["course_id"],
        )
        composed = self._compose_action(journey=journey, now=now)
        selected = composed["selected"]
        if selected["action_type"] not in {"TUTOR_REMEDIATION", "TUTOR_INSTRUCTION"}:
            raise ValueError("ADAPTIVE_ENTRY_TUTOR_TURN_NOT_CURRENT")
        return self.tutor.process_turn(
            operation_id=operation_id,
            turn_id=turn_id,
            session_id=session_id,
            learner_id=journey["learner_id"],
            course_id=journey["course_id"],
            skill_id=selected["skill_id"],
            probe_id=probe_id,
            response=response,
            requested_help_level=requested_help_level,
            now=now,
            crash_after_phase=crash_after_phase,
        )
