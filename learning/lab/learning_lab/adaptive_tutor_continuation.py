from __future__ import annotations

import copy
from typing import Any, Dict, Optional

from .adaptive import MultiSessionDirector
from .adaptive_entry import AdaptiveEntryJourneyDirector
from .adaptive_journey_continuation import _runtime_components
from .baseline_diagnostic import BaselineDiagnosticDirector
from .repository import Repository, digest


ADAPTIVE_TUTOR_CONTINUATION_VERSION = "ADAPTIVE-TUTOR-CONTINUATION-V2"
TUTOR_INTERACTION_KIND = "adaptive_tutor_interaction"
TUTOR_HANDOFF_KIND = "adaptive_tutor_formative_handoff"
TUTOR_HANDOFF_STANDING = "FORMATIVE_RECHECK_PASSED_REQUIRES_INDEPENDENT_VERIFICATION"


class AdaptiveTutorContinuationError(ValueError):
    pass


class AdaptiveTutorJourneyDirector(AdaptiveEntryJourneyDirector):
    """Additive tutor-routing layer over the qualified adaptive-entry journey.

    Tutor turns remain formative only. A successful fresh unaided tutor recheck may
    create a routing handoff to an existing independent mastery item, but never an
    attempt or mastery projection. Once that independent item is attempted, the
    handoff is consumed and the Learning engine again determines the route.

    Runtime LESSON/REMEDIATION actions are also normalized through the tutor after
    diagnostic entry is complete. This removes a legacy caller-side special case
    without moving mastery authority out of the Learning engine.
    """

    def _mastery_target(self, course_id: str, skill_id: str) -> str:
        course = self.repo.get_object("course", course_id, 1)
        if course is None:
            raise AdaptiveTutorContinuationError("COURSE_NOT_FOUND")
        criterion_ids = {
            criterion["criterion_id"]
            for criterion in course["criteria"]
            if criterion["skill_id"] == skill_id
        }
        item = next(
            (
                item
                for item in course["items"]
                if item["criterion_id"] in criterion_ids and item["mode"] == "MASTERY_CHECK"
            ),
            None,
        )
        if item is None:
            raise AdaptiveTutorContinuationError("NO_INDEPENDENT_VERIFICATION_ITEM")
        return item["item_id"]

    def _latest_handoff(self, journey_id: str, skill_id: str) -> Optional[Dict[str, Any]]:
        return self.repo.get_latest_object(TUTOR_HANDOFF_KIND, f"{journey_id}:{skill_id}")

    def _handoff_consumed(self, handoff: Dict[str, Any], learner_id: str, course_id: str) -> bool:
        for attempt in self.repo.attempts_for_skill(learner_id, course_id, handoff["skill_id"]):
            if (
                attempt.get("item_id") == handoff["independent_verification_item_id"]
                and int(attempt.get("submitted_at", -1)) >= int(handoff["recorded_at"])
            ):
                return True
        return False

    def _compose_action(self, *, journey: Dict[str, Any], now: int) -> Dict[str, Any]:
        composed = super()._compose_action(journey=journey, now=now)
        selected = dict(composed["selected"])

        # Diagnostic LESSON/TARGETED_REMEDIATION is already normalized by the base
        # journey. Post-entry/revalidation runtime LESSON/REMEDIATION was the last
        # legacy escape hatch, so normalize it through the same formative tutor.
        if selected["action_type"] in {"LESSON", "REMEDIATION"}:
            selected = self._map_diagnostic_action(selected)
            selected["reason_codes"] = list(selected.get("reason_codes", [])) + [
                "POST_ENTRY_TUTOR_ROUTE_UNIFIED"
            ]
            composed = {
                **composed,
                "selected": selected,
                "authority": f"{composed['authority']}_TUTOR_ROUTE",
            }

        selected = composed["selected"]
        if selected["action_type"] not in {"TUTOR_INSTRUCTION", "TUTOR_REMEDIATION"}:
            return composed
        skill_id = selected.get("skill_id")
        if not skill_id:
            return composed
        handoff = self._latest_handoff(journey["journey_id"], skill_id)
        if handoff is None or handoff.get("standing") != TUTOR_HANDOFF_STANDING:
            return composed
        if self._handoff_consumed(handoff, journey["learner_id"], journey["course_id"]):
            return composed
        return {
            **composed,
            "selected": {
                "action_type": "INDEPENDENT_VERIFICATION",
                "target_id": handoff["independent_verification_item_id"],
                "skill_id": skill_id,
                "reason_codes": [
                    "TUTOR_FORMATIVE_RECHECK_PASSED",
                    "TUTOR_IS_NOT_MASTERY",
                    "INDEPENDENT_EVIDENCE_REQUIRED",
                ],
            },
            "authority": "TUTOR_FORMATIVE_ROUTING_HANDOFF",
        }

    def ensure_formative_handoff(
        self,
        *,
        journey_id: str,
        turn_result: Dict[str, Any],
        recorded_at: int,
    ) -> Optional[Dict[str, Any]]:
        move = turn_result.get("teaching_move", {})
        if move.get("move") != "INDEPENDENT_RECHECK_PASSED":
            return None
        journey = self._journey(journey_id)
        skill_id = turn_result.get("next_action", {}).get("skill_id")
        if not skill_id:
            # The tutor result's next action may not carry the skill in every domain;
            # recover it from the completed turn identity instead.
            turn_id = turn_result["turn_id"]
            rows = self.repo.completed_tutor_turns(
                turn_result["session_id"], journey["course_id"],
                next(
                    skill["skill_id"]
                    for skill in self.repo.get_object("course", journey["course_id"], 1)["skills"]
                    if any(
                        probe.get("probe_id") == turn_result.get("probe_id")
                        for probe in self.tutor._spec(journey["course_id"]).tutor_probes.values()
                        if probe.get("skill_id") == skill["skill_id"]
                    )
                ),
            )
            if not rows:
                raise AdaptiveTutorContinuationError("TUTOR_TURN_SCOPE_NOT_RECOVERABLE:" + turn_id)
            skill_id = next(
                probe["skill_id"]
                for probe in self.tutor._spec(journey["course_id"]).tutor_probes.values()
                if probe.get("probe_id") == turn_result.get("probe_id")
            )
        target = self._mastery_target(journey["course_id"], skill_id)
        object_id = f"{journey_id}:{skill_id}"
        latest = self.repo.get_latest_object(TUTOR_HANDOFF_KIND, object_id)
        if latest and latest.get("turn_id") == turn_result["turn_id"]:
            return latest
        body = {
            "handoff_version": ADAPTIVE_TUTOR_CONTINUATION_VERSION,
            "journey_id": journey_id,
            "learner_id": journey["learner_id"],
            "course_id": journey["course_id"],
            "skill_id": skill_id,
            "turn_id": turn_result["turn_id"],
            "probe_id": turn_result.get("probe_id"),
            "probe_family_id": turn_result.get("probe_family_id"),
            "recorded_at": recorded_at,
            "independent_verification_item_id": target,
            "standing": TUTOR_HANDOFF_STANDING,
            "routing_only": True,
            "qualifies_mastery": False,
            "mastery_attempt_written": False,
            "mastery_projection_written": False,
            "authority_boundary": {
                "tutor_is_formative_only": True,
                "handoff_can_route_to_independent_verification": True,
                "handoff_can_mint_mastery": False,
                "mastery_authority": "LEARNING_ENGINE",
            },
        }
        expected = None if latest is None else int(latest["_object_version"])
        version = self.repo.append_object_version_checked(TUTOR_HANDOFF_KIND, object_id, body, expected)
        out = dict(body)
        out["_object_version"] = version
        self.repo.emit("AdaptiveTutorFormativeHandoffRecorded", object_id, {
            "journey_id": journey_id,
            "skill_id": skill_id,
            "turn_id": turn_result["turn_id"],
            "independent_verification_item_id": target,
            "routing_only": True,
        })
        return out


def _director(repo: Repository, *, course_id: str, learner_id: str, now: int):
    engine, scorer, tutor = _runtime_components(
        repo, course_id=course_id, learner_id=learner_id, now=now
    )
    diagnostic = BaselineDiagnosticDirector(repo, scorer=scorer)
    sessions = MultiSessionDirector(repo, engine)
    return AdaptiveTutorJourneyDirector(repo, engine, diagnostic, tutor, sessions), tutor


def _select_probe(repo: Repository, tutor: Any, *, session_id: str, course_id: str, skill_id: str) -> Dict[str, Any]:
    spec = tutor._spec(course_id)
    probes = [copy.deepcopy(p) for p in spec.tutor_probes.values() if p.get("skill_id") == skill_id]
    if not probes:
        raise AdaptiveTutorContinuationError("TUTOR_PROBE_NOT_AVAILABLE")
    by_id = {p["probe_id"]: p for p in probes}
    prior = repo.completed_tutor_turns(session_id, course_id, skill_id)
    if prior:
        last = prior[-1].get("result", {})
        requested_next = last.get("teaching_move", {}).get("next_probe_id")
        if requested_next:
            probe = by_id.get(requested_next)
            if probe is None:
                raise AdaptiveTutorContinuationError("TUTOR_NEXT_PROBE_NOT_AVAILABLE")
            return probe
        used_families = {x.get("result", {}).get("probe_family_id") for x in prior}
        fresh = [p for p in probes if p.get("family_id") not in used_families]
        if not fresh:
            raise AdaptiveTutorContinuationError("TUTOR_FRESH_PROBE_NOT_AVAILABLE")
        return sorted(fresh, key=lambda p: p["probe_id"])[0]
    return sorted(probes, key=lambda p: p["probe_id"])[0]


def begin_current_tutor_interaction(
    *,
    repo: Repository,
    operation_id: str,
    tutor_interaction_id: str,
    journey_id: str,
    session_id: str,
    learner_id: str,
    course_id: str,
    now: int,
) -> Dict[str, Any]:
    payload = {
        "tutor_interaction_id": tutor_interaction_id,
        "journey_id": journey_id,
        "session_id": session_id,
        "learner_id": learner_id,
        "course_id": course_id,
        "now": now,
        "version": ADAPTIVE_TUTOR_CONTINUATION_VERSION,
    }
    prior = repo.operation_result(operation_id, payload)
    if prior:
        return prior
    existing = repo.get_object(TUTOR_INTERACTION_KIND, tutor_interaction_id, 1)
    if existing:
        if existing.get("payload_digest") != digest(payload):
            raise AdaptiveTutorContinuationError("TUTOR_INTERACTION_ID_REUSE")
        result = existing["begin_result"]
        repo.record_operation(operation_id, payload, result)
        return result

    journey, tutor = _director(repo, course_id=course_id, learner_id=learner_id, now=now)
    before = journey.plan_next(
        operation_id=f"{operation_id}:plan",
        decision_id=f"DEC-TUTOR-{tutor_interaction_id}",
        journey_id=journey_id,
        session_id=session_id,
        now=now,
    )
    if before["learner_id"] != learner_id or before["course_id"] != course_id:
        raise AdaptiveTutorContinuationError("JOURNEY_SCOPE_MISMATCH")
    action = before["next_action"]
    if action["action_type"] not in {"TUTOR_INSTRUCTION", "TUTOR_REMEDIATION"}:
        raise AdaptiveTutorContinuationError("CURRENT_ACTION_IS_NOT_TUTOR_INTERACTION:" + action["action_type"])
    skill_id = action.get("skill_id")
    if not skill_id:
        raise AdaptiveTutorContinuationError("TUTOR_ACTION_SKILL_MISSING")
    probe = _select_probe(repo, tutor, session_id=session_id, course_id=course_id, skill_id=skill_id)
    result = {
        "status": "PASS",
        "tutor_continuation_version": ADAPTIVE_TUTOR_CONTINUATION_VERSION,
        "tutor_interaction_id": tutor_interaction_id,
        "journey_id": journey_id,
        "session_id": session_id,
        "learner_id": learner_id,
        "course_id": course_id,
        "action_type": action["action_type"],
        "selected_authority": before["selected_authority"],
        "skill_id": skill_id,
        "lesson_id": action.get("target_id"),
        "probe_id": probe["probe_id"],
        "probe_family_id": probe["family_id"],
        "prompt": probe["prompt"],
        "answer_withheld": True,
        "qualifies_mastery": False,
    }
    body = {
        "payload_digest": digest(payload),
        "payload": payload,
        "probe_id": probe["probe_id"],
        "probe_family_id": probe["family_id"],
        "skill_id": skill_id,
        "begin_result": result,
    }
    repo.put_object(TUTOR_INTERACTION_KIND, tutor_interaction_id, 1, body)
    repo.record_operation(operation_id, payload, result)
    repo.emit("AdaptiveTutorInteractionBegun", tutor_interaction_id, {
        "journey_id": journey_id,
        "session_id": session_id,
        "skill_id": skill_id,
        "probe_id": probe["probe_id"],
    })
    return result


def submit_current_tutor_interaction(
    *,
    repo: Repository,
    operation_id: str,
    tutor_interaction_id: str,
    turn_id: str,
    response: str,
    requested_help_level: int,
    submitted_at: int,
) -> Dict[str, Any]:
    interaction = repo.get_object(TUTOR_INTERACTION_KIND, tutor_interaction_id, 1)
    if interaction is None:
        raise AdaptiveTutorContinuationError("TUTOR_INTERACTION_NOT_FOUND")
    payload = interaction["payload"]
    journey_id = payload["journey_id"]
    session_id = payload["session_id"]
    learner_id = payload["learner_id"]
    course_id = payload["course_id"]
    skill_id = interaction["skill_id"]
    probe_id = interaction["probe_id"]
    if not isinstance(response, str) or len(response) > 8192:
        raise AdaptiveTutorContinuationError("TUTOR_RESPONSE_INVALID")
    if not isinstance(requested_help_level, int) or isinstance(requested_help_level, bool):
        raise AdaptiveTutorContinuationError("TUTOR_HELP_LEVEL_INVALID")
    if not isinstance(submitted_at, int) or isinstance(submitted_at, bool) or submitted_at < 0:
        raise AdaptiveTutorContinuationError("TUTOR_SUBMITTED_AT_INVALID")

    journey, tutor = _director(repo, course_id=course_id, learner_id=learner_id, now=submitted_at)
    tutor_payload = {
        "turn_id": turn_id,
        "session_id": session_id,
        "learner_id": learner_id,
        "course_id": course_id,
        "skill_id": skill_id,
        "probe_id": probe_id,
        "response": response,
        "requested_help_level": requested_help_level,
        "now": submitted_at,
        "active_assessment_item_id": None,
        "policy": tutor.POLICY_VERSION,
    }
    prior_turn = repo.get_tutor_turn(operation_id, tutor_payload)
    if prior_turn and prior_turn["state"] == "COMPLETE":
        tutor_result = prior_turn["body"]["result"]
    else:
        # A new or crash-resumed tutor write still requires this bound interaction's
        # skill to be the current tutor route. Exact completed replay is handled above.
        current = journey.plan_next(
            operation_id=f"{operation_id}:current",
            decision_id=f"DEC-TUTOR-SUBMIT-{turn_id}",
            journey_id=journey_id,
            session_id=session_id,
            now=submitted_at,
        )
        action = current["next_action"]
        if action["action_type"] not in {"TUTOR_INSTRUCTION", "TUTOR_REMEDIATION"}:
            raise AdaptiveTutorContinuationError("TUTOR_INTERACTION_NO_LONGER_CURRENT:" + action["action_type"])
        if action.get("skill_id") != skill_id:
            raise AdaptiveTutorContinuationError("TUTOR_INTERACTION_SKILL_DRIFT")
        tutor_result = journey.process_tutor_turn(
            journey_id=journey_id,
            session_id=session_id,
            operation_id=operation_id,
            turn_id=turn_id,
            probe_id=probe_id,
            response=response,
            requested_help_level=requested_help_level,
            now=submitted_at,
        )

    handoff = journey.ensure_formative_handoff(
        journey_id=journey_id,
        turn_result=tutor_result,
        recorded_at=submitted_at,
    )
    after = journey.plan_next(
        operation_id=f"{operation_id}:after",
        decision_id=f"DEC-TUTOR-AFTER-{turn_id}",
        journey_id=journey_id,
        session_id=session_id,
        now=submitted_at,
    )
    teaching_move = copy.deepcopy(tutor_result["teaching_move"])
    result = {
        "status": "PASS",
        "tutor_continuation_version": ADAPTIVE_TUTOR_CONTINUATION_VERSION,
        "tutor_interaction_id": tutor_interaction_id,
        "turn_id": turn_id,
        "journey_id": journey_id,
        "session_id": session_id,
        "learner_id": learner_id,
        "course_id": course_id,
        "skill_id": skill_id,
        "probe_id": tutor_result.get("probe_id"),
        "probe_family_id": tutor_result.get("probe_family_id"),
        "observation": copy.deepcopy(tutor_result["observation"]),
        "diagnosis": copy.deepcopy(tutor_result["diagnosis"]),
        "teaching_move": teaching_move,
        "response_echoed": False,
        "tutor_formative_only": True,
        "mastery_attempt_written": False,
        "formative_handoff": None if handoff is None else {
            "standing": handoff["standing"],
            "independent_verification_item_id": handoff["independent_verification_item_id"],
            "qualifies_mastery": False,
        },
        "next_action": copy.deepcopy(after["next_action"]),
        "next_authority": after["selected_authority"],
    }
    return result