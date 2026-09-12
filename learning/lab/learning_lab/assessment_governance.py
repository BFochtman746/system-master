from __future__ import annotations

import json
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

from .mastery_conditions import ASSISTANCE_INDEPENDENT
from .repository import Repository, canonical_json, digest


ASSESSMENT_GOVERNANCE_VERSION = "001M-S05-v1"
ASSESSMENT_ATTEMPT_KIND = "assessment_attempt_s05"
ASSESSMENT_SUBMISSION_KIND = "assessment_submission_s05"
ASSESSMENT_SCORE_OBSERVATION_KIND = "assessment_score_observation_s05"
ASSESSMENT_REVIEW_KIND = "assessment_human_review_s05"
ASSESSMENT_RESULT_KIND = "assessment_result_s05"
ASSESSMENT_CHALLENGE_KIND = "assessment_challenge_s05"
ASSESSMENT_EXTERNAL_DELIVERY_KIND = "assessment_external_delivery_s05"

AI_ROLE_DISALLOWED = "DISALLOWED"
AI_ROLE_ADVISORY = "ADVISORY_ONLY"
AI_ROLE_FINALIZATION = "FINALIZATION_ELIGIBLE_WITH_ASSURANCE"

OBSERVATION_ELIGIBLE = "ELIGIBLE_FOR_FINALIZATION"
OBSERVATION_ADVISORY = "ADVISORY_ONLY"
OBSERVATION_REVIEW = "REVIEW_REQUIRED"
OBSERVATION_BLOCKED = "BLOCKED"

REVIEW_APPROVE = "APPROVE_FINALIZATION"
REVIEW_REGRADE = "AUTHORIZE_REGRADE"
REVIEW_REJECT = "REJECT_SCORE"
REVIEW_RESCORING = "REQUIRE_RESCORING"


class AssessmentGovernanceError(ValueError):
    pass


def build_scoring_policy(
    *,
    policy_version: str,
    rubric_version: str,
    ai_scoring_role: str = AI_ROLE_DISALLOWED,
    require_assurance_for_ai: bool = True,
    require_human_review: bool = False,
    high_consequence: bool = False,
    permitted_assistance_conditions: Optional[Sequence[str]] = None,
    supported_response_types: Optional[Sequence[str]] = None,
    supported_languages: Optional[Sequence[str]] = None,
    supported_domain_keys: Optional[Sequence[str]] = None,
) -> Dict[str, Any]:
    role = str(ai_scoring_role).upper()
    if role not in {AI_ROLE_DISALLOWED, AI_ROLE_ADVISORY, AI_ROLE_FINALIZATION}:
        raise AssessmentGovernanceError("AI_SCORING_ROLE_INVALID")
    return {
        "policy_version": str(policy_version),
        "rubric_version": str(rubric_version),
        "ai_scoring_role": role,
        "require_assurance_for_ai": bool(require_assurance_for_ai),
        "require_human_review": bool(require_human_review),
        "high_consequence": bool(high_consequence),
        "permitted_assistance_conditions": sorted(
            {str(x).upper() for x in (permitted_assistance_conditions or [ASSISTANCE_INDEPENDENT])}
        ),
        "supported_response_types": sorted(
            {str(x).upper() for x in (supported_response_types or ["TEXT"])}
        ),
        "supported_languages": sorted(
            {str(x).lower() for x in (supported_languages or ["en"])}
        ),
        "supported_domain_keys": sorted(
            {str(x) for x in (supported_domain_keys or [])}
        ),
        "external_score_ingress": "FAIL_CLOSED",
        "model_confidence_can_finalize": False,
        "ai_detector_can_invalidate": False,
        "provider_metadata_is_assurance": False,
    }


def _without_internal_version(value: Mapping[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in value.items() if k != "_object_version"}


def _as_upper(value: Any) -> str:
    return str(value).upper()


class AssessmentGovernanceService:
    """Learning-owned S05 assessment/result governance over frozen S03/S04 authority.

    Curriculum remains the canonical assessment-definition owner. This service only
    snapshots an exact Curriculum definition into learner-specific attempt lineage.
    Scorers produce observations. Finalized owner-valid results become evidence
    inputs; mastery is still computed only by the existing Learning engine.
    """

    def __init__(self, repo: Repository, learning_engine: Any):
        self.repo = repo
        self.engine = learning_engine

    def _course(self, course_id: str) -> Dict[str, Any]:
        course = self.repo.get_object("course", course_id, 1)
        if course is None:
            raise AssessmentGovernanceError("COURSE_NOT_FOUND")
        return course

    def _definition_snapshot(
        self,
        *,
        course_id: str,
        item_id: str,
        scoring_policy: Mapping[str, Any],
    ) -> Dict[str, Any]:
        course = self._course(course_id)
        item = next((x for x in course["items"] if x["item_id"] == item_id), None)
        if item is None:
            raise AssessmentGovernanceError("ASSESSMENT_DEFINITION_NOT_FOUND")
        criterion = next(
            (x for x in course["criteria"] if x["criterion_id"] == item["criterion_id"]),
            None,
        )
        if criterion is None:
            raise AssessmentGovernanceError("ASSESSMENT_CRITERION_NOT_FOUND")
        skill = next(
            (x for x in course["skills"] if x["skill_id"] == criterion["skill_id"]),
            None,
        )
        if skill is None:
            raise AssessmentGovernanceError("ASSESSMENT_SKILL_NOT_FOUND")
        definition_material = {
            "curriculum_owner": "CURRICULUM",
            "course_id": course_id,
            "course_version": int(course.get("version", 1)),
            "item": item,
            "criterion": criterion,
            "skill": skill,
        }
        return {
            "curriculum_owner": "CURRICULUM",
            "course_id": course_id,
            "course_version": int(course.get("version", 1)),
            "item_id": item["item_id"],
            "item_family_id": item["family_id"],
            "criterion_id": criterion["criterion_id"],
            "skill_id": skill["skill_id"],
            "mode": item["mode"],
            "prompt": item["prompt"],
            "definition_digest": digest(definition_material),
            "item_digest": digest(item),
            "criterion_digest": digest(criterion),
            "skill_digest": digest(skill),
            "rubric_version": str(scoring_policy["rubric_version"]),
            "scoring_policy_version": str(scoring_policy["policy_version"]),
        }

    @staticmethod
    def _validate_scoring_policy(scoring_policy: Mapping[str, Any]) -> Dict[str, Any]:
        required = {"policy_version", "rubric_version", "ai_scoring_role"}
        if not required.issubset(scoring_policy):
            raise AssessmentGovernanceError("SCORING_POLICY_INCOMPLETE")
        normalized = dict(scoring_policy)
        role = _as_upper(normalized["ai_scoring_role"])
        if role not in {AI_ROLE_DISALLOWED, AI_ROLE_ADVISORY, AI_ROLE_FINALIZATION}:
            raise AssessmentGovernanceError("AI_SCORING_ROLE_INVALID")
        normalized["ai_scoring_role"] = role
        normalized.setdefault("require_assurance_for_ai", True)
        normalized.setdefault("require_human_review", False)
        normalized.setdefault("high_consequence", False)
        normalized.setdefault("permitted_assistance_conditions", [ASSISTANCE_INDEPENDENT])
        normalized.setdefault("supported_response_types", ["TEXT"])
        normalized.setdefault("supported_languages", ["en"])
        normalized.setdefault("supported_domain_keys", [])
        normalized["permitted_assistance_conditions"] = sorted(
            {_as_upper(x) for x in normalized["permitted_assistance_conditions"]}
        )
        normalized["supported_response_types"] = sorted(
            {_as_upper(x) for x in normalized["supported_response_types"]}
        )
        normalized["supported_languages"] = sorted(
            {str(x).lower() for x in normalized["supported_languages"]}
        )
        normalized["supported_domain_keys"] = sorted(
            {str(x) for x in normalized["supported_domain_keys"]}
        )
        normalized["external_score_ingress"] = "FAIL_CLOSED"
        normalized["model_confidence_can_finalize"] = False
        normalized["ai_detector_can_invalidate"] = False
        normalized["provider_metadata_is_assurance"] = False
        return normalized

    def begin_attempt(
        self,
        *,
        operation_id: str,
        assessment_attempt_id: str,
        learner_id: str,
        course_id: str,
        item_id: str,
        started_at: int,
        scoring_policy: Mapping[str, Any],
        accommodation_conditions: Optional[Sequence[str]] = None,
    ) -> Dict[str, Any]:
        policy = self._validate_scoring_policy(scoring_policy)
        definition = self._definition_snapshot(
            course_id=course_id, item_id=item_id, scoring_policy=policy
        )
        payload = {
            "assessment_attempt_id": assessment_attempt_id,
            "learner_id": learner_id,
            "course_id": course_id,
            "item_id": item_id,
            "started_at": int(started_at),
            "scoring_policy": policy,
            "accommodation_conditions": sorted(str(x) for x in (accommodation_conditions or [])),
            "governance_version": ASSESSMENT_GOVERNANCE_VERSION,
        }
        prior = self.repo.operation_result(operation_id, payload)
        if prior is not None:
            return prior
        existing = self.repo.get_latest_object(ASSESSMENT_ATTEMPT_KIND, assessment_attempt_id)
        if existing is not None:
            raise AssessmentGovernanceError("ASSESSMENT_ATTEMPT_ID_REUSE")
        body = {
            "governance_version": ASSESSMENT_GOVERNANCE_VERSION,
            "owner": "LEARNING",
            "assessment_attempt_id": assessment_attempt_id,
            "learner_id": learner_id,
            "course_id": course_id,
            "definition": definition,
            "scoring_policy": policy,
            "accommodation_conditions": payload["accommodation_conditions"],
            "state": "OPEN",
            "started_at": int(started_at),
            "submission_id": None,
            "mastery_effect": "NONE",
        }
        version = self.repo.append_object_version_checked(
            ASSESSMENT_ATTEMPT_KIND, assessment_attempt_id, body, None
        )
        result = {**body, "_object_version": version}
        self.repo.record_operation(operation_id, payload, result)
        self.repo.emit(
            "AssessmentAttemptOpened",
            assessment_attempt_id,
            {
                "learner_id": learner_id,
                "course_id": course_id,
                "item_id": item_id,
                "definition_digest": definition["definition_digest"],
            },
        )
        return result

    def submit_attempt(
        self,
        *,
        operation_id: str,
        assessment_attempt_id: str,
        submission_id: str,
        response: str,
        submitted_at: int,
        assistance_condition: str = ASSISTANCE_INDEPENDENT,
        accommodation_authorized: bool = False,
        tool_part_of_construct: bool = False,
        response_type: str = "TEXT",
        language: str = "en",
        domain_key: Optional[str] = None,
        integrity_signal: Optional[str] = None,
    ) -> Dict[str, Any]:
        attempt = self.repo.get_latest_object(ASSESSMENT_ATTEMPT_KIND, assessment_attempt_id)
        if attempt is None:
            raise AssessmentGovernanceError("ASSESSMENT_ATTEMPT_NOT_FOUND")
        payload = {
            "assessment_attempt_id": assessment_attempt_id,
            "submission_id": submission_id,
            "response": response,
            "submitted_at": int(submitted_at),
            "assistance_condition": _as_upper(assistance_condition),
            "accommodation_authorized": bool(accommodation_authorized),
            "tool_part_of_construct": bool(tool_part_of_construct),
            "response_type": _as_upper(response_type),
            "language": str(language).lower(),
            "domain_key": domain_key,
            "integrity_signal": integrity_signal,
            "governance_version": ASSESSMENT_GOVERNANCE_VERSION,
        }
        prior = self.repo.operation_result(operation_id, payload)
        if prior is not None:
            return prior
        if attempt["state"] != "OPEN":
            raise AssessmentGovernanceError("ASSESSMENT_ATTEMPT_NOT_OPEN")
        if self.repo.get_latest_object(ASSESSMENT_SUBMISSION_KIND, submission_id) is not None:
            raise AssessmentGovernanceError("ASSESSMENT_SUBMISSION_ID_REUSE")
        condition = payload["assistance_condition"]
        permitted = set(attempt["scoring_policy"]["permitted_assistance_conditions"])
        integrity_reasons: List[str] = []
        if condition not in permitted:
            integrity_reasons.append("ASSISTANCE_OUTSIDE_POLICY_REQUIRES_REVIEW")
        if integrity_signal:
            # A signal is preserved for adjudication but cannot silently invalidate.
            integrity_reasons.append("INTEGRITY_SIGNAL_REQUIRES_REVIEW")
        submission = {
            "governance_version": ASSESSMENT_GOVERNANCE_VERSION,
            "owner": "LEARNING",
            "submission_id": submission_id,
            "assessment_attempt_id": assessment_attempt_id,
            "learner_id": attempt["learner_id"],
            "course_id": attempt["course_id"],
            "response": response,
            "response_digest": digest({"response": response}),
            "submitted_at": int(submitted_at),
            "assistance_condition": condition,
            "accommodation_authorized": bool(accommodation_authorized),
            "tool_part_of_construct": bool(tool_part_of_construct),
            "response_type": payload["response_type"],
            "language": payload["language"],
            "domain_key": domain_key,
            "integrity_signal": integrity_signal,
            "integrity_standing": "CLEAR" if not integrity_reasons else "REVIEW_REQUIRED",
            "integrity_reason_codes": integrity_reasons,
            "mastery_effect": "NONE",
        }
        self.repo.put_object(ASSESSMENT_SUBMISSION_KIND, submission_id, 1, submission)
        next_attempt = _without_internal_version(attempt)
        next_attempt.update(
            {
                "state": "SUBMITTED",
                "submission_id": submission_id,
                "submitted_at": int(submitted_at),
            }
        )
        version = self.repo.append_object_version_checked(
            ASSESSMENT_ATTEMPT_KIND,
            assessment_attempt_id,
            next_attempt,
            int(attempt["_object_version"]),
        )
        result = {
            "assessment_attempt_id": assessment_attempt_id,
            "attempt_version": version,
            "submission": submission,
            "state": "SUBMITTED",
            "mastery_effect": "NONE",
        }
        self.repo.record_operation(operation_id, payload, result)
        self.repo.emit(
            "AssessmentSubmissionCommitted",
            submission_id,
            {
                "assessment_attempt_id": assessment_attempt_id,
                "response_digest": submission["response_digest"],
                "integrity_standing": submission["integrity_standing"],
            },
        )
        return result

    @staticmethod
    def _assurance_evaluation(
        *,
        attempt: Mapping[str, Any],
        model_context: Mapping[str, Any],
        assurance_standing: Optional[Mapping[str, Any]],
        observed_at: int,
    ) -> Tuple[bool, List[str]]:
        reasons: List[str] = []
        if assurance_standing is None:
            return False, ["ASSURANCE_STANDING_MISSING"]
        if assurance_standing.get("owner") != "SHARED_ASSURANCE":
            reasons.append("ASSURANCE_OWNER_INVALID")
        if _as_upper(assurance_standing.get("status", "")) != "APPROVED":
            reasons.append("ASSURANCE_NOT_APPROVED")
        for key in ("calibration_status", "fairness_status", "drift_status"):
            if _as_upper(assurance_standing.get(key, "")) not in {
                "PASS",
                "CALIBRATED",
                "ACCEPTABLE",
                "STABLE",
            }:
                reasons.append(f"{key.upper()}_NOT_ACCEPTABLE")
        valid_until = assurance_standing.get("valid_until")
        if valid_until is not None and int(valid_until) < int(observed_at):
            reasons.append("ASSURANCE_STALE")
        scope = assurance_standing.get("scope") or {}
        definition = attempt["definition"]
        policy = attempt["scoring_policy"]
        expected = {
            "assessment_definition_digest": definition["definition_digest"],
            "rubric_version": definition["rubric_version"],
            "scoring_policy_version": policy["policy_version"],
            "model_id": model_context.get("model_id"),
            "model_version": model_context.get("model_version"),
        }
        for key, value in expected.items():
            if scope.get(key) != value:
                reasons.append(f"ASSURANCE_SCOPE_MISMATCH:{key}")
        return not reasons, reasons

    def record_score_observation(
        self,
        *,
        operation_id: str,
        observation_id: str,
        assessment_attempt_id: str,
        submission_id: str,
        scorer_kind: str,
        scorer_id: str,
        observed_at: int,
        correct: Optional[bool],
        score: Optional[float] = None,
        confidence: Optional[float] = None,
        model_context: Optional[Mapping[str, Any]] = None,
        assurance_standing: Optional[Mapping[str, Any]] = None,
        provider_metadata: Optional[Mapping[str, Any]] = None,
    ) -> Dict[str, Any]:
        attempt = self.repo.get_latest_object(ASSESSMENT_ATTEMPT_KIND, assessment_attempt_id)
        submission = self.repo.get_latest_object(ASSESSMENT_SUBMISSION_KIND, submission_id)
        if attempt is None or submission is None:
            raise AssessmentGovernanceError("ASSESSMENT_SUBMISSION_LINEAGE_NOT_FOUND")
        if attempt.get("submission_id") != submission_id or submission.get("assessment_attempt_id") != assessment_attempt_id:
            raise AssessmentGovernanceError("ASSESSMENT_SUBMISSION_LINEAGE_MISMATCH")
        kind = _as_upper(scorer_kind)
        model = dict(model_context or {})
        assurance = None if assurance_standing is None else dict(assurance_standing)
        payload = {
            "observation_id": observation_id,
            "assessment_attempt_id": assessment_attempt_id,
            "submission_id": submission_id,
            "scorer_kind": kind,
            "scorer_id": scorer_id,
            "observed_at": int(observed_at),
            "correct": correct,
            "score": score,
            "confidence": confidence,
            "model_context": model,
            "assurance_standing": assurance,
            "provider_metadata": dict(provider_metadata or {}),
            "governance_version": ASSESSMENT_GOVERNANCE_VERSION,
        }
        prior = self.repo.operation_result(operation_id, payload)
        if prior is not None:
            return prior
        if self.repo.get_latest_object(ASSESSMENT_SCORE_OBSERVATION_KIND, observation_id) is not None:
            raise AssessmentGovernanceError("SCORE_OBSERVATION_ID_REUSE")

        standing = OBSERVATION_ELIGIBLE
        reasons: List[str] = []
        policy = attempt["scoring_policy"]
        if kind == "AI":
            required_model_fields = {
                "model_id",
                "model_version",
                "configuration_version",
                "prompt_version",
            }
            if not required_model_fields.issubset(model) or any(not model.get(k) for k in required_model_fields):
                standing = OBSERVATION_BLOCKED
                reasons.append("MODEL_IDENTITY_INCOMPLETE")
            role = policy["ai_scoring_role"]
            if role == AI_ROLE_DISALLOWED:
                standing = OBSERVATION_BLOCKED
                reasons.append("AI_SCORING_DISALLOWED_BY_POLICY")
            elif role == AI_ROLE_ADVISORY and standing != OBSERVATION_BLOCKED:
                standing = OBSERVATION_ADVISORY
                reasons.append("AI_OUTPUT_ADVISORY_ONLY")
            if role == AI_ROLE_FINALIZATION and standing != OBSERVATION_BLOCKED:
                if bool(policy.get("require_assurance_for_ai", True)):
                    assurance_ok, assurance_reasons = self._assurance_evaluation(
                        attempt=attempt,
                        model_context=model,
                        assurance_standing=assurance,
                        observed_at=int(observed_at),
                    )
                    if not assurance_ok:
                        standing = OBSERVATION_REVIEW
                        reasons.extend(assurance_reasons)
                    else:
                        reasons.append("ASSURANCE_SCOPE_VERIFIED")
                if submission["response_type"] not in policy["supported_response_types"]:
                    standing = OBSERVATION_REVIEW
                    reasons.append("RESPONSE_TYPE_OUT_OF_SCOPE")
                if submission["language"] not in policy["supported_languages"]:
                    standing = OBSERVATION_REVIEW
                    reasons.append("LANGUAGE_OUT_OF_SCOPE")
                supported_domains = policy.get("supported_domain_keys", [])
                if supported_domains and submission.get("domain_key") not in supported_domains:
                    standing = OBSERVATION_REVIEW
                    reasons.append("DOMAIN_OUT_OF_SCOPE")
        elif kind not in {"HUMAN", "RULE", "ORACLE"}:
            standing = OBSERVATION_BLOCKED
            reasons.append("SCORER_KIND_UNSUPPORTED")

        if correct is None:
            standing = OBSERVATION_REVIEW if standing != OBSERVATION_BLOCKED else standing
            reasons.append("SCORE_OBSERVATION_INCOMPLETE")

        observation = {
            "governance_version": ASSESSMENT_GOVERNANCE_VERSION,
            "owner": "LEARNING",
            "observation_id": observation_id,
            "assessment_attempt_id": assessment_attempt_id,
            "submission_id": submission_id,
            "submission_digest": submission["response_digest"],
            "assessment_definition_digest": attempt["definition"]["definition_digest"],
            "rubric_version": attempt["definition"]["rubric_version"],
            "scoring_policy_version": policy["policy_version"],
            "scorer_kind": kind,
            "scorer_id": scorer_id,
            "observed_at": int(observed_at),
            "correct": correct,
            "score": score,
            "confidence": confidence,
            "model_context": model,
            "assurance_standing": assurance,
            "provider_metadata": dict(provider_metadata or {}),
            "standing": standing,
            "reason_codes": sorted(set(reasons)),
            "finalized": False,
            "mastery_effect": "NONE",
        }
        self.repo.put_object(ASSESSMENT_SCORE_OBSERVATION_KIND, observation_id, 1, observation)
        self.repo.record_operation(operation_id, payload, observation)
        self.repo.emit(
            "AssessmentScoreObserved",
            observation_id,
            {
                "assessment_attempt_id": assessment_attempt_id,
                "submission_id": submission_id,
                "standing": standing,
                "scorer_kind": kind,
            },
        )
        return observation

    def record_human_review(
        self,
        *,
        operation_id: str,
        review_id: str,
        assessment_attempt_id: str,
        submission_id: str,
        observation_ids: Sequence[str],
        reviewer_role: str,
        disposition: str,
        reason_codes: Sequence[str],
        reviewed_at: int,
        adjudicated_correct: Optional[bool] = None,
        adjudicated_score: Optional[float] = None,
    ) -> Dict[str, Any]:
        disposition = _as_upper(disposition)
        if disposition not in {REVIEW_APPROVE, REVIEW_REGRADE, REVIEW_REJECT, REVIEW_RESCORING}:
            raise AssessmentGovernanceError("REVIEW_DISPOSITION_INVALID")
        if not reason_codes:
            raise AssessmentGovernanceError("REVIEW_REASON_CODES_REQUIRED")
        attempt = self.repo.get_latest_object(ASSESSMENT_ATTEMPT_KIND, assessment_attempt_id)
        submission = self.repo.get_latest_object(ASSESSMENT_SUBMISSION_KIND, submission_id)
        if attempt is None or submission is None:
            raise AssessmentGovernanceError("ASSESSMENT_SUBMISSION_LINEAGE_NOT_FOUND")
        observations = [
            self.repo.get_latest_object(ASSESSMENT_SCORE_OBSERVATION_KIND, oid)
            for oid in observation_ids
        ]
        if any(x is None for x in observations):
            raise AssessmentGovernanceError("REVIEW_OBSERVATION_NOT_FOUND")
        if any(x.get("assessment_attempt_id") != assessment_attempt_id or x.get("submission_id") != submission_id for x in observations if x):
            raise AssessmentGovernanceError("REVIEW_OBSERVATION_LINEAGE_MISMATCH")
        payload = {
            "review_id": review_id,
            "assessment_attempt_id": assessment_attempt_id,
            "submission_id": submission_id,
            "observation_ids": list(observation_ids),
            "reviewer_role": reviewer_role,
            "disposition": disposition,
            "reason_codes": list(reason_codes),
            "reviewed_at": int(reviewed_at),
            "adjudicated_correct": adjudicated_correct,
            "adjudicated_score": adjudicated_score,
            "governance_version": ASSESSMENT_GOVERNANCE_VERSION,
        }
        prior = self.repo.operation_result(operation_id, payload)
        if prior is not None:
            return prior
        if self.repo.get_latest_object(ASSESSMENT_REVIEW_KIND, review_id) is not None:
            raise AssessmentGovernanceError("ASSESSMENT_REVIEW_ID_REUSE")
        review = {
            "governance_version": ASSESSMENT_GOVERNANCE_VERSION,
            "owner": "LEARNING",
            **payload,
            "observation_digests": [digest(_without_internal_version(x)) for x in observations if x],
            "preserves_original_observations": True,
            "chain_of_thought_required": False,
            "mastery_effect": "NONE",
        }
        self.repo.put_object(ASSESSMENT_REVIEW_KIND, review_id, 1, review)
        self.repo.record_operation(operation_id, payload, review)
        self.repo.emit(
            "AssessmentHumanReviewRecorded",
            review_id,
            {
                "assessment_attempt_id": assessment_attempt_id,
                "submission_id": submission_id,
                "disposition": disposition,
            },
        )
        return review

    def record_challenge(
        self,
        *,
        operation_id: str,
        challenge_id: str,
        result_id: str,
        learner_id: str,
        reason_codes: Sequence[str],
        raised_at: int,
    ) -> Dict[str, Any]:
        result = self.repo.get_latest_object(ASSESSMENT_RESULT_KIND, result_id)
        if result is None:
            raise AssessmentGovernanceError("ASSESSMENT_RESULT_NOT_FOUND")
        if result["learner_id"] != learner_id:
            raise AssessmentGovernanceError("ASSESSMENT_CHALLENGE_LEARNER_MISMATCH")
        payload = {
            "challenge_id": challenge_id,
            "result_id": result_id,
            "learner_id": learner_id,
            "reason_codes": list(reason_codes),
            "raised_at": int(raised_at),
            "governance_version": ASSESSMENT_GOVERNANCE_VERSION,
        }
        prior = self.repo.operation_result(operation_id, payload)
        if prior is not None:
            return prior
        challenge = {
            "governance_version": ASSESSMENT_GOVERNANCE_VERSION,
            "owner": "LEARNING",
            **payload,
            "state": "PENDING_REVIEW",
            "historical_result_mutated": False,
            "mastery_effect": "NONE",
        }
        self.repo.put_object(ASSESSMENT_CHALLENGE_KIND, challenge_id, 1, challenge)
        self.repo.record_operation(operation_id, payload, challenge)
        return challenge

    def record_external_score_delivery(
        self,
        *,
        operation_id: str,
        delivery_id: str,
        provider_id: str,
        assessment_attempt_id: str,
        submission_id: str,
        received_at: int,
        provider_payload: Mapping[str, Any],
    ) -> Dict[str, Any]:
        attempt = self.repo.get_latest_object(ASSESSMENT_ATTEMPT_KIND, assessment_attempt_id)
        submission = self.repo.get_latest_object(ASSESSMENT_SUBMISSION_KIND, submission_id)
        if attempt is None or submission is None:
            raise AssessmentGovernanceError("ASSESSMENT_SUBMISSION_LINEAGE_NOT_FOUND")
        payload = {
            "delivery_id": delivery_id,
            "provider_id": provider_id,
            "assessment_attempt_id": assessment_attempt_id,
            "submission_id": submission_id,
            "received_at": int(received_at),
            "provider_payload_digest": digest(provider_payload),
            "governance_version": ASSESSMENT_GOVERNANCE_VERSION,
        }
        prior = self.repo.operation_result(operation_id, payload)
        if prior is not None:
            return prior
        existing = self.repo.get_latest_object(ASSESSMENT_EXTERNAL_DELIVERY_KIND, delivery_id)
        if existing is not None:
            if existing.get("provider_payload_digest") == payload["provider_payload_digest"]:
                return existing
            raise AssessmentGovernanceError("EXTERNAL_DELIVERY_ID_REUSE")
        delivery = {
            "governance_version": ASSESSMENT_GOVERNANCE_VERSION,
            "owner": "LEARNING",
            **payload,
            "provider_payload": dict(provider_payload),
            "standing": "PENDING_REVIEW",
            "canonical_score_created": False,
            "transport_success_is_finalization": False,
            "provider_metadata_is_assurance": False,
            "mastery_effect": "NONE",
        }
        self.repo.put_object(ASSESSMENT_EXTERNAL_DELIVERY_KIND, delivery_id, 1, delivery)
        self.repo.record_operation(operation_id, payload, delivery)
        self.repo.emit(
            "ExternalAssessmentScoreDeliveryReceived",
            delivery_id,
            {
                "assessment_attempt_id": assessment_attempt_id,
                "submission_id": submission_id,
                "standing": "PENDING_REVIEW",
            },
        )
        return delivery

    def _load_observations(
        self,
        observation_ids: Sequence[str],
        *,
        assessment_attempt_id: str,
        submission_id: str,
    ) -> List[Dict[str, Any]]:
        values: List[Dict[str, Any]] = []
        for oid in observation_ids:
            observation = self.repo.get_latest_object(ASSESSMENT_SCORE_OBSERVATION_KIND, oid)
            if observation is None:
                raise AssessmentGovernanceError("SCORE_OBSERVATION_NOT_FOUND")
            if (
                observation.get("assessment_attempt_id") != assessment_attempt_id
                or observation.get("submission_id") != submission_id
            ):
                raise AssessmentGovernanceError("SCORE_OBSERVATION_LINEAGE_MISMATCH")
            values.append(observation)
        return values

    def _reproject_finalized_evidence(self, result: Mapping[str, Any]) -> None:
        if self.engine is None:
            return
        latest = self.repo.latest_projection(
            result["learner_id"], result["course_id"], result["skill_id"]
        )
        evidence_id = result["evidence_attempt_id"]
        if latest:
            visible = set(latest.get("counted_attempt_ids", []))
            visible.update((latest.get("excluded_attempts") or {}).keys())
            visible.update(latest.get("stale_attempt_ids", []))
            visible.update(latest.get("integrity_rejected_attempt_ids", []))
            if evidence_id in visible and int(latest.get("projection_as_of", -1)) >= int(result["finalized_at"]):
                return
        self.engine.reproject(
            result["learner_id"],
            result["course_id"],
            result["skill_id"],
            now=int(result["finalized_at"]),
        )

    def finalize_score(
        self,
        *,
        operation_id: str,
        result_id: str,
        assessment_attempt_id: str,
        submission_id: str,
        observation_ids: Sequence[str],
        selected_observation_id: str,
        finalized_at: int,
        review_id: Optional[str] = None,
        supersedes_result_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        attempt = self.repo.get_latest_object(ASSESSMENT_ATTEMPT_KIND, assessment_attempt_id)
        submission = self.repo.get_latest_object(ASSESSMENT_SUBMISSION_KIND, submission_id)
        if attempt is None or submission is None:
            raise AssessmentGovernanceError("ASSESSMENT_SUBMISSION_LINEAGE_NOT_FOUND")
        if attempt.get("state") != "SUBMITTED" or attempt.get("submission_id") != submission_id:
            raise AssessmentGovernanceError("ASSESSMENT_ATTEMPT_NOT_SUBMITTED")
        observations = self._load_observations(
            observation_ids,
            assessment_attempt_id=assessment_attempt_id,
            submission_id=submission_id,
        )
        by_id = {x["observation_id"]: x for x in observations}
        if selected_observation_id not in by_id:
            raise AssessmentGovernanceError("SELECTED_OBSERVATION_NOT_INCLUDED")
        selected = by_id[selected_observation_id]
        review = None
        if review_id is not None:
            review = self.repo.get_latest_object(ASSESSMENT_REVIEW_KIND, review_id)
            if review is None:
                raise AssessmentGovernanceError("ASSESSMENT_REVIEW_NOT_FOUND")
            if (
                review.get("assessment_attempt_id") != assessment_attempt_id
                or review.get("submission_id") != submission_id
            ):
                raise AssessmentGovernanceError("ASSESSMENT_REVIEW_LINEAGE_MISMATCH")

        policy = attempt["scoring_policy"]
        disagreement = len({(x.get("correct"), x.get("score")) for x in observations}) > 1
        review_required_reasons: List[str] = []
        if bool(policy.get("require_human_review")) or bool(policy.get("high_consequence")):
            review_required_reasons.append("POLICY_REQUIRES_HUMAN_REVIEW")
        if submission.get("integrity_standing") != "CLEAR":
            review_required_reasons.append("INTEGRITY_REVIEW_REQUIRED")
        if disagreement:
            review_required_reasons.append("MATERIAL_SCORER_DISAGREEMENT")
        if selected.get("standing") != OBSERVATION_ELIGIBLE:
            review_required_reasons.append("SELECTED_OBSERVATION_NOT_DIRECTLY_FINALIZABLE")
        if supersedes_result_id is not None:
            review_required_reasons.append("REGRADE_REQUIRES_GOVERNED_SUCCESSOR")

        if review_required_reasons:
            if review is None:
                raise AssessmentGovernanceError(
                    "HUMAN_REVIEW_REQUIRED:" + ",".join(sorted(set(review_required_reasons)))
                )
            if supersedes_result_id is not None:
                if review.get("disposition") != REVIEW_REGRADE:
                    raise AssessmentGovernanceError("REGRADE_NOT_AUTHORIZED")
            elif review.get("disposition") not in {REVIEW_APPROVE, REVIEW_REGRADE}:
                raise AssessmentGovernanceError("HUMAN_REVIEW_DID_NOT_APPROVE_FINALIZATION")

        if review is not None and review.get("adjudicated_correct") is not None:
            final_correct = bool(review["adjudicated_correct"])
            final_score = review.get("adjudicated_score")
            decision_source = "HUMAN_ADJUDICATION"
        else:
            if selected.get("standing") != OBSERVATION_ELIGIBLE:
                raise AssessmentGovernanceError("SELECTED_OBSERVATION_REQUIRES_ADJUDICATION")
            if selected.get("correct") is None:
                raise AssessmentGovernanceError("SELECTED_OBSERVATION_INCOMPLETE")
            final_correct = bool(selected["correct"])
            final_score = selected.get("score")
            decision_source = "SELECTED_OBSERVATION"

        prior_result = None
        supersedes_attempt_id = None
        if supersedes_result_id is not None:
            prior_result = self.repo.get_latest_object(ASSESSMENT_RESULT_KIND, supersedes_result_id)
            if prior_result is None:
                raise AssessmentGovernanceError("SUPERSEDED_RESULT_NOT_FOUND")
            if (
                prior_result.get("assessment_attempt_id") != assessment_attempt_id
                or prior_result.get("submission_id") != submission_id
            ):
                raise AssessmentGovernanceError("SUPERSEDED_RESULT_LINEAGE_MISMATCH")
            supersedes_attempt_id = prior_result.get("evidence_attempt_id")

        definition = attempt["definition"]
        evidence_attempt_id = f"S05-EVIDENCE:{result_id}"
        reason_codes = ["OWNER_VALID_FINALIZED_ASSESSMENT_EVIDENCE"]
        if review is not None:
            reason_codes.append("HUMAN_REVIEW_APPLIED")
        if selected.get("scorer_kind") == "AI":
            reason_codes.append("AI_SCORER_LINEAGE_PRESERVED")
            if "ASSURANCE_SCOPE_VERIFIED" in selected.get("reason_codes", []):
                reason_codes.append("ASSURANCE_SCOPE_VERIFIED")
        if supersedes_result_id is not None:
            reason_codes.append("SUCCESSOR_REGRADE")
        if submission.get("accommodation_authorized"):
            reason_codes.append("AUTHORIZED_ACCOMMODATION_PRESERVED")

        result_body = {
            "governance_version": ASSESSMENT_GOVERNANCE_VERSION,
            "owner": "LEARNING",
            "result_id": result_id,
            "assessment_attempt_id": assessment_attempt_id,
            "submission_id": submission_id,
            "learner_id": attempt["learner_id"],
            "course_id": attempt["course_id"],
            "skill_id": definition["skill_id"],
            "criterion_id": definition["criterion_id"],
            "item_id": definition["item_id"],
            "item_family_id": definition["item_family_id"],
            "mode": definition["mode"],
            "assessment_definition_digest": definition["definition_digest"],
            "course_version": definition["course_version"],
            "rubric_version": definition["rubric_version"],
            "scoring_policy_version": definition["scoring_policy_version"],
            "submission_digest": submission["response_digest"],
            "observation_ids": list(observation_ids),
            "selected_observation_id": selected_observation_id,
            "selected_scorer_kind": selected["scorer_kind"],
            "selected_scorer_id": selected["scorer_id"],
            "selected_model_context": selected.get("model_context") or {},
            "selected_assurance_standing": selected.get("assurance_standing"),
            "review_id": review_id,
            "review_disposition": None if review is None else review.get("disposition"),
            "decision_source": decision_source,
            "correct": final_correct,
            "score": final_score,
            "finalized_at": int(finalized_at),
            "score_status": "FINALIZED_OWNER_VALID",
            "supersedes_result_id": supersedes_result_id,
            "evidence_attempt_id": evidence_attempt_id,
            "mastery_effect": "EVIDENCE_INPUT_ONLY",
            "reason_codes": sorted(set(reason_codes)),
            "explanation": {
                "assessment_definition_digest": definition["definition_digest"],
                "rubric_version": definition["rubric_version"],
                "scoring_policy_version": definition["scoring_policy_version"],
                "selected_scorer_kind": selected["scorer_kind"],
                "selected_scorer_id": selected["scorer_id"],
                "review_id": review_id,
                "assistance_condition": submission["assistance_condition"],
                "reason_codes": sorted(set(reason_codes)),
                "chain_of_thought": None,
            },
        }
        evidence_body = {
            "attempt_id": evidence_attempt_id,
            "learner_id": attempt["learner_id"],
            "goal_id": self._course(attempt["course_id"])["goal_id"],
            "course_id": attempt["course_id"],
            "skill_id": definition["skill_id"],
            "criterion_id": definition["criterion_id"],
            "item_id": definition["item_id"],
            "item_family_id": definition["item_family_id"],
            "mode": definition["mode"],
            "response": submission["response"],
            "correct": final_correct,
            "assisted": submission["assistance_condition"] != ASSISTANCE_INDEPENDENT,
            "answer_revealed_before_commit": False,
            "submitted_at": int(finalized_at),
            "assistance_condition": submission["assistance_condition"],
            "accommodation_authorized": bool(submission["accommodation_authorized"]),
            "tool_part_of_construct": bool(submission["tool_part_of_construct"]),
            "evidence_standing": "CURRENT",
            "transfer_novelty": None,
            "transfer_context_id": None,
            "source_assessment_result_id": result_id,
            "assessment_definition_digest": definition["definition_digest"],
            "rubric_version": definition["rubric_version"],
            "scoring_policy_version": definition["scoring_policy_version"],
            "score": final_score,
            "supersedes_attempt_id": supersedes_attempt_id,
        }
        operation_payload = {
            "result_id": result_id,
            "assessment_attempt_id": assessment_attempt_id,
            "submission_id": submission_id,
            "observation_ids": list(observation_ids),
            "selected_observation_id": selected_observation_id,
            "finalized_at": int(finalized_at),
            "review_id": review_id,
            "supersedes_result_id": supersedes_result_id,
            "governance_version": ASSESSMENT_GOVERNANCE_VERSION,
        }
        operation_result = {
            "result": result_body,
            "evidence_attempt_id": evidence_attempt_id,
            "projection_triggered": True,
            "mastery_authority": "LEARNING_ENGINE_S03",
        }

        payload_digest = digest(operation_payload)
        result_json = canonical_json(operation_result)
        result_body_json = canonical_json(result_body)
        evidence_json = canonical_json(evidence_body)
        with self.repo.connect() as con:
            replay = con.execute(
                "SELECT payload_digest,result FROM operations WHERE operation_id=?",
                (operation_id,),
            ).fetchone()
            if replay is not None:
                if replay[0] != payload_digest:
                    raise AssessmentGovernanceError("IDEMPOTENCY_DIGEST_MISMATCH")
                replay_result = json.loads(replay[1])
            else:
                existing_result = con.execute(
                    "SELECT body_digest FROM objects WHERE kind=? AND object_id=? AND version=1",
                    (ASSESSMENT_RESULT_KIND, result_id),
                ).fetchone()
                if existing_result is not None and existing_result[0] != digest(result_body):
                    raise AssessmentGovernanceError("ASSESSMENT_RESULT_ID_REUSE")
                existing_evidence = con.execute(
                    "SELECT operation_id,body_digest FROM attempts WHERE attempt_id=?",
                    (evidence_attempt_id,),
                ).fetchone()
                if existing_evidence is not None and (
                    existing_evidence[0] != operation_id
                    or existing_evidence[1] != digest(evidence_body)
                ):
                    raise AssessmentGovernanceError("ASSESSMENT_EVIDENCE_ID_REUSE")
                if existing_result is None:
                    con.execute(
                        "INSERT INTO objects(kind,object_id,version,body,body_digest) VALUES(?,?,?,?,?)",
                        (
                            ASSESSMENT_RESULT_KIND,
                            result_id,
                            1,
                            result_body_json,
                            digest(result_body),
                        ),
                    )
                if existing_evidence is None:
                    con.execute(
                        "INSERT INTO attempts(attempt_id,operation_id,body,body_digest) VALUES(?,?,?,?)",
                        (evidence_attempt_id, operation_id, evidence_json, digest(evidence_body)),
                    )
                con.execute(
                    "INSERT INTO events(event_type,subject_id,body) VALUES(?,?,?)",
                    (
                        "FinalizedAssessmentEvidenceCommitted",
                        result_id,
                        canonical_json(
                            {
                                "assessment_attempt_id": assessment_attempt_id,
                                "submission_id": submission_id,
                                "evidence_attempt_id": evidence_attempt_id,
                                "mastery_effect": "EVIDENCE_INPUT_ONLY",
                            }
                        ),
                    ),
                )
                con.execute(
                    "INSERT INTO operations(operation_id,payload_digest,result) VALUES(?,?,?)",
                    (operation_id, payload_digest, result_json),
                )
                replay_result = operation_result

        self._reproject_finalized_evidence(replay_result["result"])
        return replay_result
