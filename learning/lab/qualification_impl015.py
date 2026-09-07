from __future__ import annotations

import json
import os
import tempfile
from typing import Any, Dict, Tuple

from learning_lab import LearningEngine, Repository
from learning_lab.baseline_diagnostic import BaselineDiagnosticDirector, DiagnosticPolicyError
from learning_lab.engine import InjectedCrash
from learning_lab.repository import digest

OUTCOME = "Classify token stability and select the correct route independently."


def _engine_repo(td: str) -> Tuple[Repository, LearningEngine, BaselineDiagnosticDirector, str]:
    repo = Repository(os.path.join(td, "lab.sqlite3"))
    eng = LearningEngine(repo)
    cid = eng.create_course_job(
        operation_id="OP-CREATE", job_id="JOB-CREATE", goal_id="G1",
        title="Synthetic routing basics", desired_outcome=OUTCOME,
    )["course_id"]
    return repo, eng, BaselineDiagnosticDirector(repo), cid


def _raises(fn, needle: str) -> bool:
    try:
        fn()
    except Exception as exc:
        return needle in str(exc)
    return False


def demo() -> Dict[str, Any]:
    with tempfile.TemporaryDirectory() as td:
        repo, eng, diag, cid = _engine_repo(td)
        created = diag.create_diagnostic(
            operation_id="D", diagnostic_id="D1", learner_id="L1", course_id=cid,
            claimed_skill_ids=["S-ROUTE"], created_at=100,
        )
        observed = diag.record_probe(
            operation_id="P", probe_id="P1", diagnostic_id="D1",
            item_id=created["next_action"]["target_id"], response="STABLE", submitted_at=110,
        )
        return {
            "advanced_claim": "S-ROUTE",
            "first_action": created["next_action"],
            "probe_standing": observed["probe"]["standing"],
            "after_probe_action": observed["next_action"],
            "mastery_attempt_count": repo.count_attempts(),
            "mastery_projection_count": len(repo.projection_history("L1", cid, "S-STABILITY")),
            "diagnostic_digest": digest(repo.get_object("baseline_diagnostic", "D1", 1)),
            "probe_digest": digest(repo.get_object("diagnostic_probe", "P1", 1)),
        }


def adversarial() -> Dict[str, Any]:
    cases: Dict[str, bool] = {}
    with tempfile.TemporaryDirectory() as td:
        repo, eng, diag, cid = _engine_repo(td)
        created = diag.create_diagnostic(
            operation_id="D", diagnostic_id="D1", learner_id="L1", course_id=cid,
            claimed_skill_ids=["S-ROUTE"], created_at=100,
        )
        cases["advanced_claim_checks_prerequisite_first"] = created["next_action"]["skill_id"] == "S-STABILITY"
        cases["learner_declaration_does_not_write_attempt"] = repo.count_attempts() == 0
        cases["learner_declaration_does_not_write_projection"] = repo.latest_projection("L1", cid, "S-STABILITY") is None
        cases["direct_mastery_item_as_diagnostic_blocked"] = _raises(
            lambda: diag.record_probe(operation_id="X", probe_id="PX", diagnostic_id="D1", item_id="M-STAB-1", response="STABLE", submitted_at=101),
            "UNAUTHORIZED_DIAGNOSTIC_PROBE",
        )
        cases["unknown_claim_fails_closed"] = _raises(
            lambda: diag.create_diagnostic(operation_id="DU", diagnostic_id="DU", learner_id="L1", course_id=cid,
                                           claimed_skill_ids=["S-FAKE"], created_at=1),
            "UNKNOWN_CLAIMED_SKILL",
        )

    with tempfile.TemporaryDirectory() as td:
        repo, eng, diag, cid = _engine_repo(td)
        diag.create_diagnostic(operation_id="D", diagnostic_id="D1", learner_id="L1", course_id=cid,
                               claimed_skill_ids=["S-STABILITY"], created_at=100)
        r = diag.record_probe(operation_id="P", probe_id="P1", diagnostic_id="D1", item_id="P-STAB-1", response="STABLE", submitted_at=110)
        cases["correct_probe_routes_to_verification_not_mastery"] = r["next_action"]["action_type"] == "INDEPENDENT_VERIFICATION" and not r["probe"]["qualifies_mastery"]
        cases["correct_probe_leaves_mastery_attempts_zero"] = repo.count_attempts() == 0
        cases["correct_probe_leaves_mastery_projection_absent"] = repo.latest_projection("L1", cid, "S-STABILITY") is None
        cases["probe_id_reuse_across_operation_blocked"] = _raises(
            lambda: diag.record_probe(operation_id="P2", probe_id="P1", diagnostic_id="D1", item_id="P-STAB-1", response="STABLE", submitted_at=110),
            "PROBE_ID_REUSE_ACROSS_OPERATION",
        )
        cases["changed_replay_payload_blocked"] = _raises(
            lambda: diag.record_probe(operation_id="P", probe_id="P1", diagnostic_id="D1", item_id="P-STAB-1", response="UNSTABLE", submitted_at=110),
            "IDEMPOTENCY_DIGEST_MISMATCH",
        )

    with tempfile.TemporaryDirectory() as td:
        repo, eng, diag, cid = _engine_repo(td)
        diag.create_diagnostic(operation_id="D", diagnostic_id="D1", learner_id="L1", course_id=cid,
                               claimed_skill_ids=["S-STABILITY"], created_at=100)
        r = diag.record_probe(operation_id="P", probe_id="P1", diagnostic_id="D1", item_id="P-STAB-1", response="STABLE", submitted_at=110, assisted=True)
        cases["assisted_probe_cannot_bypass_instructional_gate"] = r["next_action"]["action_type"] != "INDEPENDENT_VERIFICATION"
        cases["assisted_probe_not_counted_as_correct"] = r["probe"]["correct"] is None
        cases["assisted_probe_not_mastery"] = not r["probe"]["qualifies_mastery"]

    with tempfile.TemporaryDirectory() as td:
        repo, eng, diag, cid = _engine_repo(td)
        diag.create_diagnostic(operation_id="D", diagnostic_id="D1", learner_id="L1", course_id=cid,
                               claimed_skill_ids=["S-STABILITY"], created_at=100)
        r = diag.record_probe(operation_id="P", probe_id="P1", diagnostic_id="D1", item_id="P-STAB-1", response="STABLE", submitted_at=110, answer_revealed_before_commit=True)
        cases["answer_reveal_contaminates_diagnostic"] = r["probe"]["standing"] == "ASSISTED_NOT_INDEPENDENT"
        cases["answer_reveal_cannot_bypass"] = r["next_action"]["action_type"] != "INDEPENDENT_VERIFICATION"

    with tempfile.TemporaryDirectory() as td:
        repo, eng, diag, cid = _engine_repo(td)
        diag.create_diagnostic(operation_id="D", diagnostic_id="D1", learner_id="L1", course_id=cid,
                               claimed_skill_ids=["S-STABILITY"], created_at=100)
        first = diag.record_probe(operation_id="P1", probe_id="P1", diagnostic_id="D1", item_id="P-STAB-1", response="", submitted_at=110)
        second = diag.record_probe(operation_id="P2", probe_id="P2", diagnostic_id="D1", item_id="P-STAB-2", response="UNSTABLE", submitted_at=120)
        cases["blank_response_abstains"] = first["probe"]["standing"] == "INSUFFICIENT_EVIDENCE"
        cases["blank_response_requires_fresh_family"] = first["next_action"]["target_id"] == "P-STAB-2"
        cases["second_probe_index_is_append_only"] = repo.get_object("diagnostic_probe_index", "D1:S-STABILITY", 1)["probe_id"] == "P1" and repo.get_object("diagnostic_probe_index", "D1:S-STABILITY", 2)["probe_id"] == "P2"
        cases["fresh_probe_can_route_to_verification"] = second["next_action"]["action_type"] == "INDEPENDENT_VERIFICATION"

    with tempfile.TemporaryDirectory() as td:
        repo, eng, diag, cid = _engine_repo(td)
        diag.create_diagnostic(operation_id="D", diagnostic_id="D1", learner_id="L1", course_id=cid,
                               claimed_skill_ids=["S-ROUTE"], created_at=100)
        wrong = diag.record_probe(operation_id="P", probe_id="P1", diagnostic_id="D1", item_id="P-STAB-1", response="UNSTABLE", submitted_at=110)
        cases["wrong_prerequisite_routes_targeted_remediation"] = wrong["next_action"]["action_type"] == "TARGETED_REMEDIATION" and wrong["next_action"]["skill_id"] == "S-STABILITY"

    with tempfile.TemporaryDirectory() as td:
        repo, eng, diag, cid = _engine_repo(td)
        course = eng.course(cid)
        course["items"][0]["scoring_type"] = "CUSTOM"
        repo.put_object("course", "COURSE-CUSTOM", 1, {**course, "course_id": "COURSE-CUSTOM"})
        d = BaselineDiagnosticDirector(repo)
        d.create_diagnostic(operation_id="D", diagnostic_id="D1", learner_id="L1", course_id="COURSE-CUSTOM", claimed_skill_ids=["S-STABILITY"], created_at=1)
        cases["unsupported_scorer_fails_closed"] = _raises(
            lambda: d.record_probe(operation_id="P", probe_id="P1", diagnostic_id="D1", item_id="P-STAB-1", response="STABLE", submitted_at=2),
            "DIAGNOSTIC_SCORER_REQUIRED",
        )

    with tempfile.TemporaryDirectory() as td:
        repo, eng, diag, cid = _engine_repo(td)
        eng.submit_attempt(operation_id="M1", attempt_id="M1", learner_id="L1", course_id=cid, item_id="M-STAB-1", response="STABLE", submitted_at=100)
        created = diag.create_diagnostic(operation_id="D", diagnostic_id="D1", learner_id="L1", course_id=cid, claimed_skill_ids=["S-ROUTE"], created_at=110)
        cases["retention_due_not_bypassed_by_advanced_claim"] = created["next_action"]["action_type"] == "RETENTION_CHECK"

    return {
        "total": len(cases),
        "passed": sum(cases.values()),
        "cases": cases,
        "status": "PASS" if all(cases.values()) else "FAIL",
    }


def recovery_campaign(runs: int = 100) -> Dict[str, Any]:
    phases = ["DIAGNOSTIC_PINNED", "PROBE_STORED", "PROBE_INDEXED"]
    phase_counts = {p: 0 for p in phases}
    tuples = []
    for i in range(runs):
        phase = phases[i % len(phases)]
        phase_counts[phase] += 1
        with tempfile.TemporaryDirectory() as td:
            repo, eng, diag, cid = _engine_repo(td)
            if phase == "DIAGNOSTIC_PINNED":
                try:
                    diag.create_diagnostic(operation_id="D", diagnostic_id="D1", learner_id="L1", course_id=cid,
                                           claimed_skill_ids=["S-ROUTE"], created_at=100, crash_after_phase=phase)
                except InjectedCrash:
                    pass
                created = diag.create_diagnostic(operation_id="D", diagnostic_id="D1", learner_id="L1", course_id=cid,
                                                 claimed_skill_ids=["S-ROUTE"], created_at=100)
                observed = diag.record_probe(operation_id="P", probe_id="P1", diagnostic_id="D1",
                                             item_id=created["next_action"]["target_id"], response="STABLE", submitted_at=110)
            else:
                created = diag.create_diagnostic(operation_id="D", diagnostic_id="D1", learner_id="L1", course_id=cid,
                                                 claimed_skill_ids=["S-ROUTE"], created_at=100)
                try:
                    diag.record_probe(operation_id="P", probe_id="P1", diagnostic_id="D1",
                                      item_id=created["next_action"]["target_id"], response="STABLE", submitted_at=110,
                                      crash_after_phase=phase)
                except InjectedCrash:
                    pass
                observed = diag.record_probe(operation_id="P", probe_id="P1", diagnostic_id="D1",
                                             item_id=created["next_action"]["target_id"], response="STABLE", submitted_at=110)
            tuples.append((
                observed["next_action"]["action_type"],
                observed["next_action"]["target_id"],
                repo.count_attempts(),
                len(repo.projection_history("L1", cid, "S-STABILITY")),
                digest(repo.get_object("baseline_diagnostic", "D1", 1)),
                digest(repo.get_object("diagnostic_probe", "P1", 1)),
                repo.get_object("diagnostic_probe_index", "D1:S-STABILITY", 2) is None,
            ))
    return {
        "runs": runs,
        "phase_counts": phase_counts,
        "unique_result_tuples": len(set(tuples)),
        "all_mastery_attempt_counts_zero": all(t[2] == 0 for t in tuples),
        "all_mastery_projection_counts_zero": all(t[3] == 0 for t in tuples),
        "all_single_index_entries": all(t[6] for t in tuples),
        "status": "PASS" if len(set(tuples)) == 1 and all(t[2] == 0 and t[3] == 0 and t[6] for t in tuples) else "FAIL",
    }


def deterministic_campaign(runs: int = 100) -> Dict[str, Any]:
    tuples = []
    for _ in range(runs):
        with tempfile.TemporaryDirectory() as td:
            repo, eng, diag, cid = _engine_repo(td)
            created = diag.create_diagnostic(operation_id="D", diagnostic_id="D1", learner_id="L1", course_id=cid,
                                             claimed_skill_ids=["S-ROUTE"], created_at=100)
            observed = diag.record_probe(operation_id="P", probe_id="P1", diagnostic_id="D1",
                                         item_id=created["next_action"]["target_id"], response="STABLE", submitted_at=110)
            tuples.append((
                digest(repo.get_object("baseline_diagnostic", "D1", 1)),
                digest(repo.get_object("diagnostic_probe", "P1", 1)),
                digest(created["next_action"]),
                digest(observed["next_action"]),
            ))
    return {
        "runs": runs,
        "unique_result_tuples": len(set(tuples)),
        "status": "PASS" if len(set(tuples)) == 1 else "FAIL",
    }


if __name__ == "__main__":
    print(json.dumps({
        "demo": demo(),
        "adversarial": adversarial(),
        "recovery": recovery_campaign(),
        "determinism": deterministic_campaign(),
    }, indent=2, sort_keys=True))
