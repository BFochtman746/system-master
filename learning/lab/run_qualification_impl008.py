from __future__ import annotations

import json
import os
import py_compile
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
GOAL = "Use Python list and dictionary comprehensions to transform and filter data."
CAPTURE_PATH = ROOT / "sources" / "LIVE_RESEARCH_PYTHON_COMPREHENSIONS_V1.json"
MULTI_PATH = ROOT / "sources" / "MODEL_GENERATION_PYTHON_COMPREHENSIONS_MULTI_CANDIDATE_V1.json"
A = "MODEL-GEN-PY-COMP-MC-A-20260907"
B = "MODEL-GEN-PY-COMP-MC-B-20260907"
C = "MODEL-GEN-PY-COMP-MC-C-20260907"
D = "MODEL-GEN-PY-COMP-MC-D-20260907"
SELECT_IDS = [A, B, C]


def load_capture():
    return json.loads(CAPTURE_PATH.read_text(encoding="utf-8"))


def load_fixture():
    return json.loads(MULTI_PATH.read_text(encoding="utf-8"))


def run_cmd(args):
    env = dict(os.environ)
    env["PYTHONPATH"] = str(ROOT)
    return subprocess.run(args, cwd=ROOT, env=env, capture_output=True, text=True)


def run_all_tests():
    proc = run_cmd([sys.executable, "-m", "unittest", "discover", "-s", str(ROOT / "tests"), "-v"])
    output = proc.stdout + proc.stderr
    (ROOT / "evidence").mkdir(exist_ok=True)
    (ROOT / "evidence" / "test_output_impl008.txt").write_text(output, encoding="utf-8")
    passed = output.count(" ... ok")
    return {"pass": proc.returncode == 0 and passed == 220, "passed": passed, "expected": 220, "returncode": proc.returncode}


def run_predecessor_tests():
    modules = sorted(
        "tests." + p.stem for p in (ROOT / "tests").glob("test_*.py")
        if p.stem != "test_multi_candidate_selection"
    )
    proc = run_cmd([sys.executable, "-m", "unittest", "-v", *modules])
    output = proc.stdout + proc.stderr
    (ROOT / "evidence" / "predecessor_test_output_impl008.txt").write_text(output, encoding="utf-8")
    passed = output.count(" ... ok")
    return {"pass": proc.returncode == 0 and passed == 178, "passed": passed, "expected": 178, "returncode": proc.returncode}


def compile_all():
    files = sorted(p for p in ROOT.rglob("*.py") if "__pycache__" not in p.parts)
    errors = []
    for p in files:
        try:
            py_compile.compile(str(p), doraise=True)
        except Exception as exc:
            errors.append(f"{p.relative_to(ROOT)}:{exc}")
    return {"pass": not errors, "files": len(files), "errors": errors}


def new_engine(path, *, research=True, candidates=True):
    from learning_lab import NormalizedLiveResearchPort, Repository, StochasticMultiCandidateLearningEngine, StochasticRecordedModelPort
    repo = Repository(path)
    e = StochasticMultiCandidateLearningEngine(
        repo,
        research_port=NormalizedLiveResearchPort([load_capture()] if research else []),
        candidate_model_port=StochasticRecordedModelPort(load_fixture()["traces"] if candidates else []),
    )
    return repo, e


def create(engine, *, ids=SELECT_IDS, op="OP", job="JOB", gid="G", crash=None):
    return engine.create_multi_candidate_course_job(
        operation_id=op, job_id=job, goal_id=gid, title="Python comprehensions multi-candidate",
        desired_outcome=GOAL, candidate_trace_ids=list(ids), crash_after_phase=crash,
    )


def full_demo():
    with tempfile.TemporaryDirectory() as td:
        repo, e = new_engine(os.path.join(td, "demo.sqlite3"))
        before = list(e.registry.domain_keys)
        out = create(e)
        decision = repo.get_object("candidate_selection_decision", out["selection_decision_id"], 1)
        eval_set = repo.get_object("candidate_evaluation_set", "MC-EVAL-SET-G", 1)
        reports = [repo.get_object("candidate_evaluation", rid, 1) for rid in eval_set["report_ids"]]
        by_trace = {r["model_trace_id"]: r for r in reports}
        tie = create(e, ids=[A, D], op="OP-TIE", job="JOB-TIE", gid="G-TIE")
        weak = create(e, ids=[B, C], op="OP-WEAK", job="JOB-WEAK", gid="G-WEAK")
        passed = all([
            "python-comprehensions" not in before,
            out["selection_decision"] == "SELECT",
            out["selected_model_trace_id"] == A,
            by_trace[A]["hard_gate_status"] == "PASS",
            by_trace[A]["mechanical_target_attainment"]["validated_transfer_task_diversity"] is True,
            by_trace[B]["hard_gate_status"] == "PASS",
            by_trace[B]["mechanical_target_attainment"]["validated_transfer_task_diversity"] is False,
            by_trace[C]["hard_gate_status"] == "REJECTED",
            decision["model_ranking_used"] is False,
            decision["scalar_ranking_used"] is False,
            tie["selection_decision"] == "ABSTAIN",
            tie["selection_reason_codes"] == ["NO_UNIQUE_EVIDENCE_DOMINANT_CANDIDATE"],
            weak["selection_decision"] == "ABSTAIN",
            weak["selection_reason_codes"] == ["NO_SELECTION_ELIGIBLE_CANDIDATES"],
            out["validation_status"] == "MECHANICALLY_VERIFIED_HUMAN_REVIEW_REQUIRED",
        ])
        return {
            "pass": passed,
            "selected_trace_id": out["selected_model_trace_id"],
            "selection_reason_codes": out["selection_reason_codes"],
            "candidate_set_digest": out["candidate_set_digest"],
            "course_digest": out["course_digest"],
            "candidate_a": {"hard_gate": by_trace[A]["hard_gate_status"], "metrics": by_trace[A]["mechanical_metrics"]},
            "candidate_b": {"hard_gate": by_trace[B]["hard_gate_status"], "metrics": by_trace[B]["mechanical_metrics"], "target_attainment": by_trace[B]["mechanical_target_attainment"]},
            "candidate_c": {"hard_gate": by_trace[C]["hard_gate_status"], "failures": by_trace[C]["hard_gate_failures"]},
            "tie_case": {"decision": tie["selection_decision"], "reason_codes": tie["selection_reason_codes"]},
            "weak_survivor_case": {"decision": weak["selection_decision"], "reason_codes": weak["selection_reason_codes"]},
            "validation_status": out["validation_status"],
        }


def targeted_adversarial_tests():
    names = [
        "test_candidate_set_requires_at_least_two_candidates",
        "test_candidate_set_rejects_duplicate_trace_ids",
        "test_candidate_set_rejects_prompt_mismatch",
        "test_candidate_set_rejects_mixed_model_ids_for_stochastic_same_model_slice",
        "test_candidate_trace_output_tamper_is_rejected",
        "test_model_candidate_self_ranking_field_is_forbidden",
        "test_duplicate_stochastic_outputs_do_not_count_as_two_candidates",
        "test_candidate_set_drift_after_pin_fails_closed",
        "test_invalid_candidate_is_rejected_without_poisoning_valid_set",
        "test_renamed_duplicate_tasks_do_not_inflate_diversity",
        "test_mechanically_tied_candidates_abstain_instead_of_digest_tiebreak",
        "test_all_invalid_candidates_abstain",
        "test_valid_but_below_target_candidate_cannot_win_by_default",
        "test_selection_decision_contains_no_scalar_score",
        "test_selected_candidate_is_never_hard_gate_rejected",
        "test_same_operation_changed_candidate_set_conflicts",
        "test_same_goal_new_job_with_different_candidate_set_fails_identity_collision",
        "test_persisted_candidate_evaluation_body_tamper_is_detected",
        "test_defective_candidate_can_have_high_coverage_but_still_cannot_win",
        "test_restart_rehydrates_selected_domain_from_persisted_selected_dossier",
        "test_crash_after_selected_course_build_does_not_duplicate_course",
        "test_candidate_order_does_not_change_selection",
        "test_tie_abstention_is_order_invariant",
    ]
    fq = [f"tests.test_multi_candidate_selection.MultiCandidateSelectionTests.{n}" for n in names]
    proc = run_cmd([sys.executable, "-m", "unittest", "-v", *fq])
    output = proc.stdout + proc.stderr
    passed = output.count(" ... ok")
    return {"pass": proc.returncode == 0 and passed == len(names), "passed": passed, "total": len(names), "cases": names}


def recovery_stress(runs=100):
    from learning_lab import NormalizedLiveResearchPort, Repository, StochasticMultiCandidateLearningEngine, StochasticRecordedModelPort
    from learning_lab.engine import InjectedCrash
    from learning_lab.repository import digest
    phases = [
        "GOAL_INTERPRETED", "RESEARCH_PLANNED", "SOURCES_ACQUIRED", "CANDIDATE_SET_PINNED",
        "CANDIDATES_GENERATED", "CANDIDATES_EVALUATED", "SELECTION_DECIDED", "SELECTED_COURSE_BUILT",
    ]
    phase_passes = {p: 0 for p in phases}
    crash_seeds = {p: False for p in phases}
    passes = 0
    course_digests, set_digests, decision_digests = set(), set(), set()
    cap, traces = load_capture(), load_fixture()["traces"]
    with tempfile.TemporaryDirectory() as seed_root:
        seed_paths = {}
        kwargs = dict(operation_id="OP", job_id="JOB", goal_id="G", title="PY", desired_outcome=GOAL, candidate_trace_ids=SELECT_IDS)
        for phase in phases:
            path = os.path.join(seed_root, phase + ".sqlite3")
            e = StochasticMultiCandidateLearningEngine(
                Repository(path), research_port=NormalizedLiveResearchPort([cap]), candidate_model_port=StochasticRecordedModelPort(traces)
            )
            try:
                e.create_multi_candidate_course_job(**kwargs, crash_after_phase=phase)
            except InjectedCrash:
                crash_seeds[phase] = True
                seed_paths[phase] = path
        for i in range(runs):
            phase = phases[i % len(phases)]
            if not crash_seeds[phase]:
                continue
            with tempfile.TemporaryDirectory() as td:
                path = os.path.join(td, "x.sqlite3")
                src = sqlite3.connect(seed_paths[phase]); dst = sqlite3.connect(path); src.backup(dst); dst.close(); src.close()
                need_research = phase in {"GOAL_INTERPRETED", "RESEARCH_PLANNED"}
                need_candidates = phase in {"GOAL_INTERPRETED", "RESEARCH_PLANNED", "SOURCES_ACQUIRED", "CANDIDATE_SET_PINNED"}
                repo = Repository(path)
                e = StochasticMultiCandidateLearningEngine(
                    repo,
                    research_port=NormalizedLiveResearchPort([cap] if need_research else []),
                    candidate_model_port=StochasticRecordedModelPort(traces if need_candidates else []),
                )
                out = e.create_multi_candidate_course_job(**kwargs)
                replay = e.create_multi_candidate_course_job(**kwargs)
                dec = repo.get_object("candidate_selection_decision", "MC-SELECT-G", 1)
                if out == replay and out.get("selected_model_trace_id") == A and repo.count_objects("course") == 1:
                    passes += 1
                    phase_passes[phase] += 1
                    course_digests.add(out["course_digest"])
                    set_digests.add(out["candidate_set_digest"])
                    decision_digests.add(digest(dec))
    return {
        "pass": all(crash_seeds.values()) and passes == runs and len(course_digests) == len(set_digests) == len(decision_digests) == 1,
        "crash_injection_seeds": crash_seeds,
        "runs": runs,
        "passes": passes,
        "phase_passes": phase_passes,
        "unique_course_digests": len(course_digests),
        "unique_candidate_set_digests": len(set_digests),
        "unique_selection_decision_digests": len(decision_digests),
    }


def _selector_seed_reports():
    """Build candidate evaluation reports once so determinism stress isolates selection logic."""
    with tempfile.TemporaryDirectory() as td:
        repo, e = new_engine(os.path.join(td, "selector-seed.sqlite3"))
        create(e, ids=[A, B, C], op="O-ABC", job="J-ABC", gid="G-ABC")
        create(e, ids=[A, D], op="O-AD", job="J-AD", gid="G-AD")

        def reports(gid):
            es = repo.get_object("candidate_evaluation_set", f"MC-EVAL-SET-{gid}", 1)
            return [repo.get_object("candidate_evaluation", rid, 1) for rid in es["report_ids"]]

        merged = reports("G-ABC") + reports("G-AD")
        by_trace = {r["model_trace_id"]: r for r in merged}
        # Copy out because the temporary DB closes when this function returns.
        return e.selector, {k: json.loads(json.dumps(v)) for k, v in by_trace.items()}


def order_determinism(runs=100):
    from learning_lab.repository import digest
    selector, by_trace = _selector_seed_reports()
    orders = [
        [A, B, C], [C, A, B], [B, C, A], [C, B, A], [A, C, B], [B, A, C]
    ]
    rows = []
    for i in range(runs):
        reports = [by_trace[x] for x in orders[i % len(orders)]]
        decision = selector.select(reports)
        rows.append((decision["decision"], decision["selected_candidate_id"], digest(decision)))
    return {
        "pass": len(set(rows)) == 1 and rows[0][0] == "SELECT",
        "runs": runs,
        "unique_results": len(set(rows)),
        "selected_candidate_id": rows[0][1] if rows else None,
    }


def abstention_determinism(runs=100):
    from learning_lab.repository import digest
    selector, by_trace = _selector_seed_reports()
    rows = []
    for i in range(runs):
        reports = [by_trace[A], by_trace[D]] if i % 2 == 0 else [by_trace[D], by_trace[A]]
        decision = selector.select(reports)
        rows.append((decision["decision"], tuple(decision["reason_codes"]), digest(decision)))
    return {
        "pass": len(set(rows)) == 1 and rows[0][0] == "ABSTAIN",
        "runs": runs,
        "unique_results": len(set(rows)),
        "reason_codes": list(rows[0][1]) if rows else [],
    }


def main():
    (ROOT / "evidence").mkdir(exist_ok=True)
    tests = run_all_tests()
    predecessor = run_predecessor_tests()
    compile_result = compile_all()
    demo = full_demo()
    adversarial = targeted_adversarial_tests()
    recovery = recovery_stress(100)
    order = order_determinism(100)
    abstain = abstention_determinism(100)
    fixture = load_fixture()
    receipt = {
        "objective": "LEARNING-LAB-IMPL-008",
        "status": "PASS_PORTABLE_IMPLEMENTATION" if all([
            tests["pass"], predecessor["pass"], compile_result["pass"], demo["pass"], adversarial["pass"],
            recovery["pass"], order["pass"], abstain["pass"],
        ]) else "FAIL",
        "tests": {**tests, "prior_regressions": 178, "new_impl008": 42},
        "predecessor_impl007_regression": predecessor,
        "python_compile": compile_result,
        "selection_demo": demo,
        "adversarial_campaign": adversarial,
        "multi_candidate_recovery_stress": recovery,
        "candidate_order_determinism": order,
        "abstention_determinism": abstain,
        "candidate_fixture": {
            "fixture_version": fixture["fixture_version"],
            "candidate_count": len(fixture["traces"]),
            "shared_prompt_digest": fixture["shared_prompt_digest"],
            "shared_research_evidence_digest": fixture["shared_research_evidence_digest"],
            "model_id": fixture["model_id"],
            "truth_boundary": fixture["truth_boundary"],
        },
        "selection_semantics": {
            "hard_gates_before_selection": True,
            "selection_target_attainment_required": True,
            "model_self_ranking_allowed": False,
            "scalar_quality_score_used": False,
            "selection_rule": "HARD_GATES_THEN_SELECTION_TARGET_ELIGIBILITY_THEN_PARETO_OR_ABSTAIN",
            "current_ranking_metric": "validated_transfer_task_diversity",
            "current_metric_target": 2,
            "id_only_duplicate_inflation_blocked": True,
            "below_target_survivor": "ABSTAIN",
            "tie_or_incomparability": "ABSTAIN",
            "pedagogical_superiority_claim": "NOT_AUTHORIZED",
        },
        "truth_boundary": {
            "stochastic_provider_sampling": "MULTIPLE_SAME_PROMPT_RECORDED_CANDIDATE_OUTPUTS_PLUS_CALLABLE_MULTI_SAMPLE_PORT; LIVE_PROVIDER_MULTI_SAMPLE_NOT_CLAIMED",
            "candidate_selection": "MECHANICAL_SELECTION_WITH_EXPLICIT_ABSTENTION_ONLY",
            "pedagogical_human_review": "REQUIRED",
            "real_learner_effectiveness": "NOT_PROVEN",
            "native_iphone": "NOT_RUN",
            "production_system_master_integration": "NOT_RUN",
        },
    }
    for name, value in [
        ("qualification_receipt_impl008.json", receipt),
        ("impl008_selection_demo.json", demo),
        ("impl008_adversarial_campaign.json", adversarial),
        ("impl008_recovery_stress.json", recovery),
        ("impl008_order_determinism.json", order),
        ("impl008_abstention_determinism.json", abstain),
    ]:
        (ROOT / "evidence" / name).write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(receipt, indent=2, sort_keys=True))
    return 0 if receipt["status"].startswith("PASS") else 1


if __name__ == "__main__":
    raise SystemExit(main())
