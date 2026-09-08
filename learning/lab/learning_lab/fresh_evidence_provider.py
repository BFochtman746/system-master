from __future__ import annotations

import copy
from typing import Any, Callable, Dict, Optional

from .fresh_evidence import (
    FreshEvidenceAdmissionError,
    FreshEvidenceTaskAdmissionService,
    _KIND_CONTRACT,
    _known_families,
)
from .repository import Repository, digest


FRESH_EVIDENCE_PROVIDER_ACQUISITION_VERSION = "FRESH-EVIDENCE-PROVIDER-ACQUISITION-V1"
FRESH_EVIDENCE_PROVIDER_REQUEST_VERSION = "FRESH-EVIDENCE-PROVIDER-REQUEST-V1"
FRESH_EVIDENCE_PROVIDER_PROMPT_VERSION = "FRESH-EVIDENCE-PROVIDER-PROMPT-V1"
FRESH_EVIDENCE_PROVIDER_CAPTURE_VERSION = "FRESH-EVIDENCE-PROVIDER-CAPTURE-V1"
FRESH_EVIDENCE_PROVIDER_CAPTURE_STANDING = "SEALED_PROVIDER_FRESH_EVIDENCE_CANDIDATE_UNVERIFIED"

FRESH_EVIDENCE_PROVIDER_INTENT_KIND = "fresh_evidence_provider_request_intent"
FRESH_EVIDENCE_PROVIDER_CAPTURE_KIND = "fresh_evidence_provider_candidate_capture"

_REQUIRED_CANDIDATE_KEYS = {
    "item_id",
    "family_id",
    "criterion_id",
    "skill_id",
    "mode",
    "prompt",
    "answer",
    "scoring_type",
    "claim_refs",
}
_FORBIDDEN_PROVIDER_AUTHORITY_KEYS = {
    "admission",
    "admission_status",
    "admitted",
    "approved",
    "correctness",
    "evidence_standing",
    "is_correct",
    "mastery",
    "mastery_status",
    "passed",
    "runtime_eligible",
    "standing",
    "verification",
    "verified",
}


class FreshEvidenceProviderAcquisitionError(ValueError):
    pass


def _fail(message: str) -> None:
    raise FreshEvidenceProviderAcquisitionError(message)


def _inject(phase: Optional[str], expected: str) -> None:
    if phase == expected:
        raise RuntimeError("INJECTED_CRASH_AFTER_FRESH_PROVIDER_" + expected)


def _admitted_claims(dossier: Dict[str, Any]) -> list[Dict[str, Any]]:
    admitted_sources = {
        source.get("source_id")
        for source in dossier.get("sources", [])
        if source.get("standing") == "ADMITTED"
    }
    rows = [
        copy.deepcopy(claim)
        for claim in dossier.get("claims", [])
        if claim.get("source_id") in admitted_sources and claim.get("claim_id")
    ]
    rows.sort(key=lambda row: str(row["claim_id"]))
    return rows


def _contains_forbidden_authority_assertion(value: Any) -> bool:
    if isinstance(value, dict):
        for key, child in value.items():
            if str(key).strip().lower() in _FORBIDDEN_PROVIDER_AUTHORITY_KEYS:
                return True
            if _contains_forbidden_authority_assertion(child):
                return True
    elif isinstance(value, list):
        return any(_contains_forbidden_authority_assertion(child) for child in value)
    return False


def _course_skill_and_criterion(
    course: Dict[str, Any], skill_id: str, criterion_id: str
) -> tuple[Dict[str, Any], Dict[str, Any]]:
    skill = next((row for row in course.get("skills", []) if row.get("skill_id") == skill_id), None)
    if skill is None:
        _fail("FRESH_PROVIDER_SKILL_UNKNOWN")
    if criterion_id not in set(skill.get("criterion_ids", [])):
        _fail("FRESH_PROVIDER_CRITERION_SKILL_MISMATCH")
    criterion = next(
        (row for row in course.get("criteria", []) if row.get("criterion_id") == criterion_id),
        None,
    )
    if criterion is None:
        _fail("FRESH_PROVIDER_CRITERION_UNKNOWN")
    return copy.deepcopy(skill), copy.deepcopy(criterion)


def _validate_candidate_against_intent(
    candidate: Dict[str, Any], intent: Dict[str, Any]
) -> Dict[str, Any]:
    if not isinstance(candidate, dict):
        _fail("FRESH_PROVIDER_CANDIDATE_OBJECT_REQUIRED")
    if _contains_forbidden_authority_assertion(candidate):
        _fail("FRESH_PROVIDER_SELF_APPROVAL_FORBIDDEN")

    missing = sorted(_REQUIRED_CANDIDATE_KEYS - set(candidate))
    if missing:
        _fail("FRESH_PROVIDER_CANDIDATE_INCOMPLETE:" + ",".join(missing))

    expected_mode = _KIND_CONTRACT[intent["kind"]][1]
    if candidate.get("skill_id") != intent["skill_id"]:
        _fail("FRESH_PROVIDER_SKILL_SCOPE_DRIFT")
    if candidate.get("criterion_id") != intent["criterion_id"]:
        _fail("FRESH_PROVIDER_CRITERION_SCOPE_DRIFT")
    if candidate.get("mode") != expected_mode:
        _fail("FRESH_PROVIDER_MODE_SCOPE_DRIFT")
    if candidate.get("course_id") not in (None, intent["course_id"]):
        _fail("FRESH_PROVIDER_COURSE_SCOPE_DRIFT")
    if candidate.get("kind") not in (None, intent["kind"]):
        _fail("FRESH_PROVIDER_KIND_SCOPE_DRIFT")

    refs = set(candidate.get("claim_refs", []))
    admitted = set(intent["admitted_claim_ids"])
    if not refs or not refs.issubset(admitted):
        _fail("FRESH_PROVIDER_GROUNDING_SCOPE_DRIFT")
    if candidate.get("family_id") in set(intent["known_family_ids"]):
        _fail("FRESH_PROVIDER_FAMILY_ALREADY_KNOWN_AT_REQUEST")
    if not isinstance(candidate.get("prompt"), str) or not candidate["prompt"].strip():
        _fail("FRESH_PROVIDER_PROMPT_INVALID")
    if not isinstance(candidate.get("answer"), str) or not candidate["answer"].strip():
        _fail("FRESH_PROVIDER_REFERENCE_ANSWER_INVALID")
    return copy.deepcopy(candidate)


def _validate_capture(capture: Dict[str, Any], intent: Dict[str, Any]) -> Dict[str, Any]:
    required = {
        "capture_version",
        "request_id",
        "intent_digest",
        "provider_id",
        "model_id",
        "raw_output",
        "raw_output_digest",
        "candidate",
        "candidate_digest",
        "standing",
        "authority_boundary",
    }
    missing = sorted(required - set(capture))
    if missing:
        _fail("FRESH_PROVIDER_CAPTURE_INCOMPLETE:" + ",".join(missing))
    if capture["capture_version"] != FRESH_EVIDENCE_PROVIDER_CAPTURE_VERSION:
        _fail("FRESH_PROVIDER_CAPTURE_VERSION_UNSUPPORTED")
    if capture["request_id"] != intent["request_id"]:
        _fail("FRESH_PROVIDER_CAPTURE_REQUEST_DRIFT")
    if capture["intent_digest"] != digest(intent):
        _fail("FRESH_PROVIDER_CAPTURE_INTENT_DRIFT")
    if capture["provider_id"] != intent["provider_id"] or capture["model_id"] != intent["model_id"]:
        _fail("FRESH_PROVIDER_CAPTURE_PROVIDER_DRIFT")
    if capture["standing"] != FRESH_EVIDENCE_PROVIDER_CAPTURE_STANDING:
        _fail("FRESH_PROVIDER_CAPTURE_STANDING_INVALID")
    if digest(capture["raw_output"]) != capture["raw_output_digest"]:
        _fail("FRESH_PROVIDER_RAW_OUTPUT_DIGEST_MISMATCH")
    if digest(capture["candidate"]) != capture["candidate_digest"]:
        _fail("FRESH_PROVIDER_CANDIDATE_DIGEST_MISMATCH")
    boundary = capture["authority_boundary"]
    if boundary.get("provider_is_admission_authority") is not False:
        _fail("FRESH_PROVIDER_ADMISSION_AUTHORITY_ESCALATION")
    if boundary.get("provider_is_mastery_authority") is not False:
        _fail("FRESH_PROVIDER_MASTERY_AUTHORITY_ESCALATION")
    if boundary.get("independent_impl031_admission_required") is not True:
        _fail("FRESH_PROVIDER_IMPL031_ADMISSION_REQUIRED")
    _validate_candidate_against_intent(capture["candidate"], intent)
    return copy.deepcopy(capture)


class FreshEvidenceProviderAcquisitionService:
    """Acquire one fresh evidence candidate without giving the provider admission authority.

    Request intent is frozen before the first stochastic provider call. The first
    structurally acceptable provider result is durably sealed as an *unverified*
    candidate before IMPL-031 is invoked. Exact replay therefore reuses the durable
    capture rather than silently resampling the provider.
    """

    def __init__(self, repo: Repository):
        self.repo = repo

    def acquire_and_admit(
        self,
        *,
        operation_id: str,
        request_id: str,
        course_id: str,
        kind: str,
        skill_id: str,
        criterion_id: str,
        provider_id: str,
        model_id: str,
        candidate_provider: Callable[[Dict[str, Any]], Dict[str, Any]],
        requested_at: int,
        admitted_at: int,
        oracle_spec: Optional[Dict[str, Any]] = None,
        crash_after_phase: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not operation_id:
            _fail("FRESH_PROVIDER_OPERATION_ID_REQUIRED")
        if not request_id:
            _fail("FRESH_PROVIDER_REQUEST_ID_REQUIRED")
        if kind not in _KIND_CONTRACT:
            _fail("FRESH_PROVIDER_KIND_INVALID")
        if not provider_id or not provider_id.strip():
            _fail("FRESH_PROVIDER_ID_REQUIRED")
        if not model_id or not model_id.strip():
            _fail("FRESH_PROVIDER_MODEL_ID_REQUIRED")
        if not callable(candidate_provider):
            _fail("FRESH_PROVIDER_CALLABLE_REQUIRED")
        for label, value in (("REQUESTED_AT", requested_at), ("ADMITTED_AT", admitted_at)):
            if not isinstance(value, int) or isinstance(value, bool) or value < 0:
                _fail("FRESH_PROVIDER_" + label + "_INVALID")

        course = self.repo.get_object("course", course_id, 1)
        if course is None:
            _fail("FRESH_PROVIDER_COURSE_NOT_FOUND")
        skill, criterion = _course_skill_and_criterion(course, skill_id, criterion_id)
        dossier_id = course.get("research_dossier_id", "")
        dossier = self.repo.get_object("research_dossier", dossier_id, 1)
        if dossier is None:
            _fail("FRESH_PROVIDER_RESEARCH_DOSSIER_NOT_FOUND")
        claims = _admitted_claims(dossier)
        if not claims:
            _fail("FRESH_PROVIDER_ADMITTED_RESEARCH_REQUIRED")

        course_digest = digest(course)
        dossier_digest = digest(dossier)
        known_family_ids = sorted(_known_families(self.repo, course, skill_id))
        intent = {
            "acquisition_version": FRESH_EVIDENCE_PROVIDER_ACQUISITION_VERSION,
            "request_version": FRESH_EVIDENCE_PROVIDER_REQUEST_VERSION,
            "prompt_version": FRESH_EVIDENCE_PROVIDER_PROMPT_VERSION,
            "request_id": request_id,
            "course_id": course_id,
            "kind": kind,
            "skill_id": skill_id,
            "criterion_id": criterion_id,
            "provider_id": provider_id,
            "model_id": model_id,
            "requested_at": requested_at,
            "admitted_at": admitted_at,
            "course_digest": course_digest,
            "research_dossier_id": dossier_id,
            "research_dossier_digest": dossier_digest,
            "admitted_claim_ids": sorted(claim["claim_id"] for claim in claims),
            "known_family_ids": known_family_ids,
            "oracle_spec_digest": None if oracle_spec is None else digest(oracle_spec),
        }
        operation_payload = {
            "request_id": request_id,
            "intent_digest": digest(intent),
            "version": FRESH_EVIDENCE_PROVIDER_ACQUISITION_VERSION,
        }
        prior = self.repo.operation_result(operation_id, operation_payload)
        if prior is not None:
            return prior

        existing_intent = self.repo.get_object(FRESH_EVIDENCE_PROVIDER_INTENT_KIND, request_id, 1)
        if existing_intent is not None:
            if digest(existing_intent) != digest(intent):
                _fail("FRESH_PROVIDER_REQUEST_ID_REUSE_WITH_DIFFERENT_INTENT")
        else:
            self.repo.put_object(FRESH_EVIDENCE_PROVIDER_INTENT_KIND, request_id, 1, intent)
            self.repo.emit("FreshEvidenceProviderRequestFrozen", request_id, {
                "course_id": course_id,
                "kind": kind,
                "skill_id": skill_id,
                "criterion_id": criterion_id,
                "provider_id": provider_id,
                "model_id": model_id,
                "intent_digest": digest(intent),
            })
        _inject(crash_after_phase, "REQUEST_FROZEN")

        # Re-read immutable authorities after intent freeze. A course/dossier mutation
        # cannot silently alter the request that the provider or admission sees.
        current_course = self.repo.get_object("course", course_id, 1)
        current_dossier = self.repo.get_object("research_dossier", dossier_id, 1)
        if current_course is None or digest(current_course) != course_digest:
            _fail("FRESH_PROVIDER_FROZEN_COURSE_DRIFT")
        if current_dossier is None or digest(current_dossier) != dossier_digest:
            _fail("FRESH_PROVIDER_FROZEN_DOSSIER_DRIFT")

        capture = self.repo.get_object(FRESH_EVIDENCE_PROVIDER_CAPTURE_KIND, request_id, 1)
        if capture is None:
            provider_request = {
                "request_version": FRESH_EVIDENCE_PROVIDER_REQUEST_VERSION,
                "prompt_version": FRESH_EVIDENCE_PROVIDER_PROMPT_VERSION,
                "request_id": request_id,
                "course_id": course_id,
                "desired_outcome": course.get("desired_outcome"),
                "kind": kind,
                "required_mode": _KIND_CONTRACT[kind][1],
                "skill": skill,
                "criterion": criterion,
                "admitted_claims": copy.deepcopy(claims),
                "banned_family_ids": list(known_family_ids),
                "constraints": {
                    "provider_must_not_assert_admission_or_mastery": True,
                    "reference_answer_will_be_checked_by_independent_domain_oracle": True,
                    "claim_refs_must_be_subset_of_admitted_claim_ids": True,
                    "family_id_must_not_be_in_banned_family_ids": True,
                    "frozen_course_and_dossier_are_not_mutable": True,
                },
            }
            raw_output = copy.deepcopy(candidate_provider(copy.deepcopy(provider_request)))
            if not isinstance(raw_output, dict):
                _fail("FRESH_PROVIDER_OUTPUT_OBJECT_REQUIRED")
            if set(raw_output) != {"candidate"}:
                if _contains_forbidden_authority_assertion(raw_output):
                    _fail("FRESH_PROVIDER_SELF_APPROVAL_FORBIDDEN")
                _fail("FRESH_PROVIDER_OUTPUT_ENVELOPE_INVALID")
            candidate = _validate_candidate_against_intent(raw_output["candidate"], intent)
            capture = {
                "capture_version": FRESH_EVIDENCE_PROVIDER_CAPTURE_VERSION,
                "request_id": request_id,
                "intent_digest": digest(intent),
                "provider_id": provider_id,
                "model_id": model_id,
                "raw_output": raw_output,
                "raw_output_digest": digest(raw_output),
                "candidate": candidate,
                "candidate_digest": digest(candidate),
                "standing": FRESH_EVIDENCE_PROVIDER_CAPTURE_STANDING,
                "authority_boundary": {
                    "provider_is_candidate_generation_authority_only": True,
                    "provider_is_admission_authority": False,
                    "provider_is_mastery_authority": False,
                    "provider_output_is_admission_receipt": False,
                    "provider_output_is_runtime_eligible": False,
                    "independent_impl031_admission_required": True,
                    "learning_engine_remains_mastery_authority": True,
                },
            }
            self.repo.put_object(FRESH_EVIDENCE_PROVIDER_CAPTURE_KIND, request_id, 1, capture)
            self.repo.emit("FreshEvidenceProviderCandidateCaptured", request_id, {
                "provider_id": provider_id,
                "model_id": model_id,
                "candidate_digest": capture["candidate_digest"],
                "raw_output_digest": capture["raw_output_digest"],
                "standing": FRESH_EVIDENCE_PROVIDER_CAPTURE_STANDING,
            })
        else:
            capture = _validate_capture(capture, intent)
        _inject(crash_after_phase, "CAPTURE_STORED")

        capture = _validate_capture(capture, intent)
        admission_id = "FEP-ADM-" + digest({"request_id": request_id, "intent_digest": digest(intent)})[:24].upper()
        admission_operation_id = "FEP-ADMIT-" + digest({"request_id": request_id})[:24].upper()
        try:
            admission = FreshEvidenceTaskAdmissionService(self.repo).admit(
                operation_id=admission_operation_id,
                admission_id=admission_id,
                course_id=course_id,
                kind=kind,
                candidate=copy.deepcopy(capture["candidate"]),
                admitted_at=admitted_at,
                oracle_spec=copy.deepcopy(oracle_spec),
            )
        except FreshEvidenceAdmissionError:
            raise
        _inject(crash_after_phase, "ADMISSION_COMPLETED")

        # Admission must not mutate the frozen source authorities.
        final_course = self.repo.get_object("course", course_id, 1)
        final_dossier = self.repo.get_object("research_dossier", dossier_id, 1)
        if final_course is None or digest(final_course) != course_digest:
            _fail("FRESH_PROVIDER_COURSE_MUTATED_DURING_ADMISSION")
        if final_dossier is None or digest(final_dossier) != dossier_digest:
            _fail("FRESH_PROVIDER_DOSSIER_MUTATED_DURING_ADMISSION")

        result = {
            "status": "PASS",
            "acquisition_version": FRESH_EVIDENCE_PROVIDER_ACQUISITION_VERSION,
            "request_id": request_id,
            "request_intent_digest": digest(intent),
            "provider_id": provider_id,
            "model_id": model_id,
            "capture_standing": FRESH_EVIDENCE_PROVIDER_CAPTURE_STANDING,
            "raw_output_digest": capture["raw_output_digest"],
            "candidate_digest": capture["candidate_digest"],
            "admission": copy.deepcopy(admission),
            "provider_called_on_replay": False,
            "frozen_course_mutated": False,
            "frozen_dossier_mutated": False,
            "authority_boundary": {
                "provider_is_candidate_generation_authority_only": True,
                "impl031_is_admission_authority": True,
                "learning_engine_remains_mastery_authority": True,
            },
        }
        self.repo.record_operation(operation_id, operation_payload, result)
        self.repo.emit("FreshEvidenceProviderAcquisitionCompleted", request_id, {
            "capture_standing": FRESH_EVIDENCE_PROVIDER_CAPTURE_STANDING,
            "admission_id": admission["admission_id"],
            "admission_standing": admission["standing"],
            "candidate_digest": capture["candidate_digest"],
        })
        return result

    def load_capture(self, request_id: str) -> Dict[str, Any]:
        intent = self.repo.get_object(FRESH_EVIDENCE_PROVIDER_INTENT_KIND, request_id, 1)
        if intent is None:
            _fail("FRESH_PROVIDER_REQUEST_NOT_FOUND")
        capture = self.repo.get_object(FRESH_EVIDENCE_PROVIDER_CAPTURE_KIND, request_id, 1)
        if capture is None:
            _fail("FRESH_PROVIDER_CAPTURE_NOT_FOUND")
        return _validate_capture(capture, intent)
