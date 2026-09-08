from __future__ import annotations

import copy
from typing import Any, Dict, Iterable, List, Optional, Tuple

from .engine import InjectedCrash
from .repository import Repository, digest

ROLE_COVERAGE_VERSION = "ROLE-COMPETENCY-COVERAGE-V1"
ROLE_COVERAGE_POLICY_VERSION = "ROLE-REQUIREMENT-EVIDENCE-POLICY-V1"
ROLE_GAP_PLAN_VERSION = "ROLE-COMPETENCY-GAP-PLAN-V1"
ROLE_PORTFOLIO_HANDOFF_VERSION = "LEARNING-TO-PORTFOLIO-ROLE-EVIDENCE-HANDOFF-V1"

ALLOWED_CONSEQUENTIAL_MAPPING = {"EXACT_SHARED_REF", "OWNER_APPROVED_MAPPING_REF"}
COVERAGE_STATES = {
    "SUPPORTED", "PARTIALLY_SUPPORTED", "NOT_SUPPORTED", "STALE",
    "INADMISSIBLE_FOR_USE", "MAPPING_UNVERIFIED", "AUTHORIZATION_BLOCKED", "UNKNOWN",
}
FORBIDDEN_ROLE_CLAIMS = {
    "JOB_READY", "QUALIFIED_FOR_ROLE", "HIRED", "CERTIFIED", "LICENSED",
    "ACCREDITED", "COLLEGE_CREDIT_AWARDED", "SUBJECT_MATTER_EXPERT",
}


def _verify_dossier(dossier: Dict[str, Any]) -> Tuple[bool, List[str]]:
    failures: List[str] = []
    d = copy.deepcopy(dossier)
    stored = d.pop("dossier_digest", None)
    if not stored or stored != digest(d):
        failures.append("CAPABILITY_DOSSIER_DIGEST_MISMATCH")
    if dossier.get("external_eligibility_decision") != "NOT_MADE":
        failures.append("LEARNING_EXTERNAL_ELIGIBILITY_BOUNDARY_VIOLATED")
    return (not failures, failures)


def _scenario_meta(scenario_catalog: Dict[str, Dict[str, Any]], scenario_id: str) -> Optional[Dict[str, Any]]:
    item = scenario_catalog.get(scenario_id)
    return copy.deepcopy(item) if item else None



def _scenario_requirement_binding(scenario: Dict[str, Any], requirement_id: str) -> Optional[str]:
    for binding in scenario.get("requirement_bindings", []):
        if binding.get("requirement_id") == requirement_id:
            return binding.get("standing")
    return None


def _successful_dossier(dossier: Dict[str, Any]) -> bool:
    return dossier.get("claim_ceiling") in {
        "AUTHENTIC_WORKPLACE_ARTIFACT_MECHANICALLY_DEMONSTRATED_DEFENSE_REVIEW_PENDING",
        "AUTHENTIC_WORKPLACE_TASK_DEMONSTRATED_WITHIN_DECLARED_SCENARIO",
    }


def _skill_state(dossier: Dict[str, Any], skill_id: str) -> Optional[Dict[str, Any]]:
    for row in dossier.get("learning_skill_evidence", []):
        if row.get("skill_id") == skill_id:
            return row
    return None


def _is_stale(observed_at: int, as_of: int, max_age_seconds: Optional[int]) -> bool:
    if max_age_seconds is None:
        return False
    if not observed_at:
        return True
    return as_of - observed_at > int(max_age_seconds)


def _gap(code: str, requirement_id: str, action: str, **extra: Any) -> Dict[str, Any]:
    row = {"gap_code": code, "requirement_id": requirement_id, "recommended_action": action}
    row.update(extra)
    return row


def evaluate_requirement_coverage(
    *, requirement_set: Dict[str, Any], learner_id: str, dossiers: Iterable[Dict[str, Any]],
    scenario_catalog: Dict[str, Dict[str, Any]], as_of: int,
) -> Dict[str, Any]:
    evidence = [copy.deepcopy(x) for x in dossiers]
    requirements = requirement_set.get("requirements", [])
    if not requirement_set.get("owner_ref") or not requirement_set.get("owner_version"):
        raise ValueError("ROLE_REQUIREMENT_OWNER_OR_VERSION_MISSING")
    requirement_ids = [str(x.get("requirement_id", "")) for x in requirements]
    if any(not x for x in requirement_ids) or len(requirement_ids) != len(set(requirement_ids)):
        raise ValueError("ROLE_REQUIREMENT_ID_DUPLICATE_OR_MISSING")
    requirement_rows: List[Dict[str, Any]] = []
    gaps: List[Dict[str, Any]] = []

    for req in requirements:
        rid = req["requirement_id"]
        mapping = req.get("mapping", {})
        if mapping.get("standing") not in ALLOWED_CONSEQUENTIAL_MAPPING:
            status = "MAPPING_UNVERIFIED"
            reasons = ["CONSEQUENTIAL_MAPPING_NOT_APPROVED"]
            gaps.append(_gap("MAPPING_UNVERIFIED", rid, "OBTAIN_EXACT_OR_OWNER_APPROVED_COMPETENCY_MAPPING"))
            requirement_rows.append({
                "requirement_id": rid, "status": status, "reason_codes": reasons,
                "qualifying_evidence_refs": [], "distinct_scenario_families": [],
                "distinct_independence_groups": [], "stale_evidence_refs": [],
                "mapping_standing": mapping.get("standing", "UNKNOWN"),
            })
            continue

        valid: List[Tuple[Dict[str, Any], Dict[str, Any]]] = []
        stale: List[Tuple[Dict[str, Any], Dict[str, Any]]] = []
        inadmissible_refs: List[str] = []
        for dossier in evidence:
            ok, _ = _verify_dossier(dossier)
            ref = "capability_dossier:" + str(dossier.get("dossier_digest", "UNKNOWN"))
            if not ok:
                inadmissible_refs.append(ref)
                continue
            if dossier.get("learner_id") != learner_id:
                continue
            if not _successful_dossier(dossier):
                continue
            scenario = _scenario_meta(scenario_catalog, dossier.get("workplace_scenario_id", ""))
            if not scenario:
                inadmissible_refs.append(ref)
                continue
            if dossier.get("workplace_scenario_digest") != digest(scenario):
                inadmissible_refs.append(ref)
                continue
            scenario_binding = _scenario_requirement_binding(scenario, rid)
            if scenario_binding not in ALLOWED_CONSEQUENTIAL_MAPPING:
                continue
            observed_at = int(dossier.get("evidence_observed_at", 0))
            if _is_stale(observed_at, int(as_of), req.get("max_evidence_age_seconds")):
                stale.append((dossier, scenario))
            else:
                valid.append((dossier, scenario))

        required_skills = list(req.get("required_skill_refs", []))
        required_criteria = list(req.get("required_workplace_criterion_refs", []))
        required_families = int(req.get("min_distinct_scenario_families", 1))
        required_groups = int(req.get("min_distinct_independence_groups", required_families))
        require_human_defense = bool(req.get("require_independent_human_defense", False))

        qualifying: List[Tuple[Dict[str, Any], Dict[str, Any]]] = []
        reasons: List[str] = []
        for dossier, scenario in valid:
            skill_ok = all((_skill_state(dossier, sid) or {}).get("stage") == "MASTERED" for sid in required_skills)
            criterion_ok = all(dossier.get("criterion_results", {}).get(cid) == "VERIFIED" for cid in required_criteria)
            defense_ok = (not require_human_defense) or dossier.get("defense_review", {}).get("status") == "INDEPENDENT_HUMAN_DEFENSE_APPROVED"
            if skill_ok and criterion_ok and defense_ok:
                qualifying.append((dossier, scenario))

        families = sorted({s.get("scenario_family", s.get("scenario_id")) for _, s in qualifying})
        groups = sorted({s.get("independence_group", s.get("scenario_family", s.get("scenario_id"))) for _, s in qualifying})
        qualifying_refs = sorted({"capability_dossier:" + d["dossier_digest"] for d, _ in qualifying})
        stale_refs = sorted({"capability_dossier:" + d["dossier_digest"] for d, _ in stale})

        if inadmissible_refs and not valid and not stale:
            status = "INADMISSIBLE_FOR_USE"
            reasons.append("ONLY_INADMISSIBLE_EVIDENCE_AVAILABLE")
            gaps.append(_gap("INADMISSIBLE_EVIDENCE", rid, "REGENERATE_OR_REVERIFY_CAPABILITY_EVIDENCE"))
        elif not valid and stale:
            status = "STALE"
            reasons.append("ALL_RELEVANT_EVIDENCE_STALE")
            gaps.append(_gap("EVIDENCE_STALE", rid, "RUN_FRESH_WORKPLACE_REVALIDATION"))
        elif not valid:
            status = "NOT_SUPPORTED"
            reasons.append("NO_CURRENT_ADMISSIBLE_WORKPLACE_EVIDENCE")
            gaps.append(_gap("NO_EVIDENCE", rid, "ASSIGN_FIRST_AUTHENTIC_WORKPLACE_SCENARIO"))
        elif not qualifying:
            status = "PARTIALLY_SUPPORTED"
            if require_human_defense:
                reasons.append("HUMAN_DEFENSE_REVIEW_REQUIRED")
                gaps.append(_gap("HUMAN_DEFENSE_REVIEW_REQUIRED", rid, "OBTAIN_INDEPENDENT_HUMAN_DEFENSE_REVIEW"))
            else:
                reasons.append("EVIDENCE_PRESENT_BUT_REQUIREMENT_GATES_NOT_MET")
                gaps.append(_gap("REQUIREMENT_GATES_NOT_MET", rid, "REMEDIATE_AND_REASSESS_REQUIRED_SKILLS_OR_CRITERIA"))
        elif len(families) < required_families or len(groups) < required_groups:
            status = "PARTIALLY_SUPPORTED"
            reasons.append("INSUFFICIENT_SCENARIO_DIVERSITY")
            gaps.append(_gap(
                "SCENARIO_DIVERSITY_GAP", rid, "ASSIGN_DISTINCT_WORKPLACE_SCENARIO_FAMILY",
                current_families=len(families), required_families=required_families,
                current_independence_groups=len(groups), required_independence_groups=required_groups,
            ))
        else:
            status = "SUPPORTED"
            reasons.append("DECLARED_EVIDENCE_PROFILE_SATISFIED")

        requirement_rows.append({
            "requirement_id": rid,
            "title": req.get("title"),
            "status": status,
            "reason_codes": reasons,
            "qualifying_evidence_refs": qualifying_refs,
            "distinct_scenario_families": families,
            "distinct_independence_groups": groups,
            "stale_evidence_refs": stale_refs,
            "inadmissible_evidence_refs": sorted(set(inadmissible_refs)),
            "mapping_standing": mapping.get("standing"),
            "evidence_profile": {
                "required_skill_refs": required_skills,
                "required_workplace_criterion_refs": required_criteria,
                "min_distinct_scenario_families": required_families,
                "min_distinct_independence_groups": required_groups,
                "require_independent_human_defense": require_human_defense,
                "max_evidence_age_seconds": req.get("max_evidence_age_seconds"),
            },
        })

    counts = {state: 0 for state in sorted(COVERAGE_STATES)}
    for row in requirement_rows:
        counts[row["status"]] = counts.get(row["status"], 0) + 1
    supported = counts.get("SUPPORTED", 0)
    total = len(requirement_rows)
    if total == 0:
        standing = "UNKNOWN"
    elif supported == total:
        standing = "DECLARED_REQUIREMENT_SET_EVIDENCE_SUPPORTED"
    elif supported == 0 and counts.get("NOT_SUPPORTED", 0) == total:
        standing = "DECLARED_REQUIREMENT_SET_NOT_SUPPORTED"
    else:
        standing = "DECLARED_REQUIREMENT_SET_PARTIALLY_SUPPORTED"

    result = {
        "version": ROLE_COVERAGE_VERSION,
        "policy_version": ROLE_COVERAGE_POLICY_VERSION,
        "requirement_set_id": requirement_set["requirement_set_id"],
        "requirement_set_version": requirement_set["version"],
        "requirement_set_digest": digest(requirement_set),
        "learner_id": learner_id,
        "intended_use": requirement_set.get("intended_use", "EMPLOYER_CAPABILITY_PRESENTATION"),
        "as_of": int(as_of),
        "requirement_coverage": requirement_rows,
        "coverage_counts": counts,
        "coverage_standing": standing,
        "gaps": gaps,
        "external_eligibility_decision": "NOT_MADE",
        "forbidden_claims_without_external_authority": sorted(FORBIDDEN_ROLE_CLAIMS),
        "limitations": [
            "REQUIREMENT_COVERAGE_IS_NOT_JOB_QUALIFICATION",
            "EMPLOYER_OR_EXTERNAL_OWNER_DECIDES_ROLE_RELEVANCE_AND_THRESHOLD",
            "AI_INFERRED_MAPPING_NOT_ADMISSIBLE_FOR_CONSEQUENTIAL_COVERAGE",
        ],
    }
    result["coverage_digest"] = digest(result)
    return result


def build_gap_plan(*, coverage: Dict[str, Any]) -> Dict[str, Any]:
    rows = []
    for gap in coverage.get("gaps", []):
        rows.append(copy.deepcopy(gap))
    plan = {
        "version": ROLE_GAP_PLAN_VERSION,
        "coverage_digest": coverage["coverage_digest"],
        "learner_id": coverage.get("learner_id"),
        "requirement_set_id": coverage["requirement_set_id"],
        "actions": rows,
        "complete": len(rows) == 0,
        "planning_only": True,
        "does_not_create_competence": True,
    }
    plan["gap_plan_digest"] = digest(plan)
    return plan


def build_role_portfolio_handoff(*, coverage: Dict[str, Any], gap_plan: Dict[str, Any]) -> Dict[str, Any]:
    evidence_refs = sorted({
        ref
        for row in coverage.get("requirement_coverage", [])
        for ref in row.get("qualifying_evidence_refs", [])
    })
    handoff = {
        "version": ROLE_PORTFOLIO_HANDOFF_VERSION,
        "read_only": True,
        "portfolio_owner": "MOD-PORTFOLIO-001",
        "source_owner": "LEARNING_COMPETENCE_EVIDENCE_SEMANTICS",
        "requirement_set_id": coverage["requirement_set_id"],
        "requirement_set_version": coverage["requirement_set_version"],
        "coverage_digest": coverage["coverage_digest"],
        "gap_plan_digest": gap_plan["gap_plan_digest"],
        "learner_id": coverage.get("learner_id"),
        "coverage_standing": coverage["coverage_standing"],
        "requirement_coverage": [
            {
                "requirement_id": r["requirement_id"],
                "status": r["status"],
                "qualifying_evidence_refs": list(r.get("qualifying_evidence_refs", [])),
            }
            for r in coverage.get("requirement_coverage", [])
        ],
        "canonical_capability_evidence_refs": evidence_refs,
        "allowed_presentation": [
            "DISPLAY_REQUIREMENT_COVERAGE_WITH_EXACT_STATUS",
            "DISPLAY_GAPS_AND_LIMITATIONS",
            "LINK_TO_LEARNING_OWNED_CAPABILITY_EVIDENCE",
        ],
        "forbidden_without_external_authority": sorted(FORBIDDEN_ROLE_CLAIMS),
        "portfolio_may_rewrite_competence_truth": False,
        "external_eligibility_decision": "NOT_MADE",
    }
    handoff["handoff_digest"] = digest(handoff)
    return handoff


def verify_role_portfolio_handoff(*, coverage: Dict[str, Any], gap_plan: Dict[str, Any], handoff: Dict[str, Any]) -> Dict[str, Any]:
    failures: List[str] = []
    c = copy.deepcopy(coverage); c_digest = c.pop("coverage_digest", None)
    if c_digest != digest(c):
        failures.append("ROLE_COVERAGE_DIGEST_MISMATCH")
    g = copy.deepcopy(gap_plan); g_digest = g.pop("gap_plan_digest", None)
    if g_digest != digest(g):
        failures.append("ROLE_GAP_PLAN_DIGEST_MISMATCH")
    h = copy.deepcopy(handoff); h_digest = h.pop("handoff_digest", None)
    if h_digest != digest(h):
        failures.append("ROLE_PORTFOLIO_HANDOFF_DIGEST_MISMATCH")
    if handoff.get("coverage_digest") != coverage.get("coverage_digest"):
        failures.append("ROLE_HANDOFF_WRONG_COVERAGE")
    if handoff.get("gap_plan_digest") != gap_plan.get("gap_plan_digest"):
        failures.append("ROLE_HANDOFF_WRONG_GAP_PLAN")
    if handoff.get("coverage_standing") != coverage.get("coverage_standing"):
        failures.append("ROLE_COVERAGE_STANDING_CHANGED")
    if handoff.get("read_only") is not True or handoff.get("portfolio_may_rewrite_competence_truth") is not False:
        failures.append("ROLE_PORTFOLIO_MUTABILITY_BOUNDARY_VIOLATED")
    if handoff.get("external_eligibility_decision") != "NOT_MADE":
        failures.append("ROLE_EXTERNAL_ELIGIBILITY_CLAIM_FORBIDDEN")
    return {"status": "PASS" if not failures else "FAIL", "failures": failures}


class RoleCompetencyCoverageService:
    PHASES = ("REQUIREMENT_SET_BOUND", "EVIDENCE_BOUND", "COVERAGE_COMPUTED", "GAP_PLAN_BUILT", "HANDOFF_BUILT")

    def __init__(self, repo: Repository, requirement_set: Dict[str, Any], scenario_catalog: Dict[str, Dict[str, Any]]):
        self.repo = repo
        self.requirement_set = copy.deepcopy(requirement_set)
        self.scenario_catalog = copy.deepcopy(scenario_catalog)

    def execute(
        self, *, operation_id: str, job_id: str, learner_id: str, dossiers: Iterable[Dict[str, Any]], as_of: int,
        crash_after_phase: Optional[str] = None,
    ) -> Dict[str, Any]:
        dossier_rows = sorted([copy.deepcopy(x) for x in dossiers], key=lambda x: str(x.get("dossier_digest", "")))
        payload = {
            "job_id": job_id,
            "requirement_set_id": self.requirement_set["requirement_set_id"],
            "requirement_set_version": self.requirement_set["version"],
            "requirement_set_digest": digest(self.requirement_set),
            "scenario_catalog_digest": digest(self.scenario_catalog),
            "learner_id": learner_id,
            "dossier_digests": sorted(str(x.get("dossier_digest")) for x in dossier_rows),
            "as_of": int(as_of),
            "version": ROLE_COVERAGE_VERSION,
        }
        prior = self.repo.operation_result(operation_id, payload)
        if prior:
            return prior
        job = self.repo.get_job(job_id)
        if job is not None and digest(job.get("payload", {})) != digest(payload):
            raise ValueError("ROLE_COVERAGE_JOB_PAYLOAD_DRIFT")
        checkpoint = int(job["checkpoint"]) if job else 0

        rs_obj_id = self.requirement_set["requirement_set_id"]
        snapshot_suffix = digest({
            "requirement_set_digest": payload["requirement_set_digest"],
            "learner_id": learner_id,
            "as_of": int(as_of),
            "dossier_digests": payload["dossier_digests"],
        })[:20]
        evidence_set_id = "ROLEEVID-" + snapshot_suffix
        coverage_id = "ROLECOV-" + snapshot_suffix
        gap_id = "ROLEGAP-" + snapshot_suffix
        handoff_id = "ROLEPORTHANDOFF-" + snapshot_suffix

        if checkpoint < 1:
            self.repo.put_object("role_requirement_set", rs_obj_id, int(self.requirement_set["version"]), self.requirement_set)
            self.repo.save_job(job_id, "RUNNING", "REQUIREMENT_SET_BOUND", 1, payload)
            if crash_after_phase == "REQUIREMENT_SET_BOUND":
                raise InjectedCrash("crash after requirement set bound")
        else:
            persisted = self.repo.get_object("role_requirement_set", rs_obj_id, int(self.requirement_set["version"]))
            if persisted is None or digest(persisted) != digest(self.requirement_set):
                raise ValueError("ROLE_REQUIREMENT_SET_DRIFT")

        evidence_snapshot = {
            "requirement_set_id": rs_obj_id,
            "as_of": int(as_of),
            "dossiers": dossier_rows,
            "scenario_catalog": self.scenario_catalog,
        }
        if checkpoint < 2:
            self.repo.put_object("role_evidence_snapshot", evidence_set_id, 1, evidence_snapshot)
            self.repo.save_job(job_id, "RUNNING", "EVIDENCE_BOUND", 2, payload)
            if crash_after_phase == "EVIDENCE_BOUND":
                raise InjectedCrash("crash after evidence bound")
        else:
            persisted = self.repo.get_object("role_evidence_snapshot", evidence_set_id, 1)
            if persisted is None or digest(persisted) != digest(evidence_snapshot):
                raise ValueError("ROLE_EVIDENCE_SNAPSHOT_DRIFT")

        if checkpoint < 3:
            coverage = evaluate_requirement_coverage(
                requirement_set=self.requirement_set, learner_id=learner_id, dossiers=dossier_rows,
                scenario_catalog=self.scenario_catalog, as_of=as_of,
            )
            self.repo.put_object("role_requirement_coverage", coverage_id, 1, coverage)
            self.repo.save_job(job_id, "RUNNING", "COVERAGE_COMPUTED", 3, payload)
            if crash_after_phase == "COVERAGE_COMPUTED":
                raise InjectedCrash("crash after coverage computed")
        else:
            coverage = self.repo.get_object("role_requirement_coverage", coverage_id, 1)
            if coverage is None:
                raise ValueError("ROLE_COVERAGE_MISSING_AFTER_CHECKPOINT")

        if checkpoint < 4:
            gap_plan = build_gap_plan(coverage=coverage)
            self.repo.put_object("role_gap_plan", gap_id, 1, gap_plan)
            self.repo.save_job(job_id, "RUNNING", "GAP_PLAN_BUILT", 4, payload)
            if crash_after_phase == "GAP_PLAN_BUILT":
                raise InjectedCrash("crash after gap plan built")
        else:
            gap_plan = self.repo.get_object("role_gap_plan", gap_id, 1)
            if gap_plan is None:
                raise ValueError("ROLE_GAP_PLAN_MISSING_AFTER_CHECKPOINT")

        if checkpoint < 5:
            handoff = build_role_portfolio_handoff(coverage=coverage, gap_plan=gap_plan)
            self.repo.put_object("role_portfolio_handoff", handoff_id, 1, handoff)
            self.repo.save_job(job_id, "RUNNING", "HANDOFF_BUILT", 5, payload)
            if crash_after_phase == "HANDOFF_BUILT":
                raise InjectedCrash("crash after handoff built")
        else:
            handoff = self.repo.get_object("role_portfolio_handoff", handoff_id, 1)
            if handoff is None:
                raise ValueError("ROLE_PORTFOLIO_HANDOFF_MISSING_AFTER_CHECKPOINT")

        result = {
            "status": "COMPLETE",
            "coverage_id": coverage_id,
            "coverage_digest": coverage["coverage_digest"],
            "gap_plan_id": gap_id,
            "gap_plan_digest": gap_plan["gap_plan_digest"],
            "portfolio_handoff_id": handoff_id,
            "portfolio_handoff_digest": handoff["handoff_digest"],
            "coverage_standing": coverage["coverage_standing"],
        }
        self.repo.save_job(job_id, "COMPLETE", "COMPLETE", 6, payload)
        self.repo.record_operation(operation_id, payload, result)
        return result
