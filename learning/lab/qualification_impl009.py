from __future__ import annotations

import copy
import json
import os
import py_compile
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
EVIDENCE = ROOT / "evidence"
EVIDENCE.mkdir(exist_ok=True)

from learning_lab import (
    CourseRefreshLearningEngine,
    NormalizedLiveResearchPort,
    RecordedModelGenerationPort,
    Repository,
    StochasticRecordedModelPort,
    PROFESSIONAL_QUALITY_PROFILE_VERSION,
)
from learning_lab.engine import InjectedCrash
from learning_lab.repository import digest

BASE_CAPTURE = json.loads((ROOT / "sources" / "LIVE_RESEARCH_PYTHON_COMPREHENSIONS_V1.json").read_text(encoding="utf-8"))
BASE_MULTI = json.loads((ROOT / "sources" / "MODEL_GENERATION_PYTHON_COMPREHENSIONS_MULTI_CANDIDATE_V1.json").read_text(encoding="utf-8"))
REFRESH_CAPTURE = json.loads((ROOT / "sources" / "LIVE_RESEARCH_PYTHON_COMPREHENSIONS_V2_REFRESH.json").read_text(encoding="utf-8"))
REFRESH_TRACE = json.loads((ROOT / "sources" / "MODEL_GENERATION_PYTHON_COMPREHENSIONS_REFRESH_V2.json").read_text(encoding="utf-8"))
GOAL = BASE_MULTI["goal"]
A = "MODEL-GEN-PY-COMP-MC-A-20260907"
B = "MODEL-GEN-PY-COMP-MC-B-20260907"
C = "MODEL-GEN-PY-COMP-MC-C-20260907"
BASE_IDS = [A, B, C]
SERIES = "SERIES-PY-COMP"
REVIEW = {"standing": "LAB_HUMAN_REVIEW_FIXTURE_APPROVED", "reviewer": "SYNTHETIC_REVIEW_FIXTURE"}
PHASES = [
    "REFRESH_TRIGGERED",
    "REFRESH_SOURCES_ACQUIRED",
    "REFRESH_MODEL_PINNED",
    "REFRESH_CANDIDATE_GENERATED",
    "SUCCESSOR_GENERATED_VALIDATED",
    "SEMANTIC_DIFF_COMPUTED",
]


def write_json(name: str, value):
    (EVIDENCE / name).write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def run_cmd(args):
    env = dict(os.environ)
    env["PYTHONPATH"] = str(ROOT)
    return subprocess.run(args, cwd=ROOT, env=env, capture_output=True, text=True)


def run_tests(full=True):
    if full:
        args = [sys.executable, "-m", "unittest", "discover", "-s", str(ROOT / "tests"), "-v"]
        expected = 247
        outfile = "test_output_impl009.txt"
    else:
        modules = sorted(
            "tests." + p.stem for p in (ROOT / "tests").glob("test_*.py")
            if p.stem != "test_course_refresh"
        )
        args = [sys.executable, "-m", "unittest", "-v", *modules]
        expected = 220
        outfile = "predecessor_test_output_impl009.txt"
    proc = run_cmd(args)
    output = proc.stdout + proc.stderr
    (EVIDENCE / outfile).write_text(output, encoding="utf-8")
    passed = output.count(" ... ok")
    result = {"pass": proc.returncode == 0 and passed == expected, "passed": passed, "expected": expected, "returncode": proc.returncode}
    write_json("impl009_full_tests.json" if full else "impl009_predecessor_tests.json", result)
    return result


def compile_all():
    files = sorted(p for p in ROOT.rglob("*.py") if "__pycache__" not in p.parts)
    errors = []
    for path in files:
        try:
            py_compile.compile(str(path), doraise=True)
        except Exception as exc:
            errors.append(f"{path.relative_to(ROOT)}:{exc}")
    result = {"pass": not errors, "files": len(files), "errors": errors}
    write_json("impl009_compile.json", result)
    return result


def sqlite_backup(src_path: str, dst_path: str):
    src = sqlite3.connect(src_path)
    dst = sqlite3.connect(dst_path)
    src.backup(dst)
    dst.close()
    src.close()


def new_engine(path: str, *, refresh_capture=True, refresh_trace=True):
    repo = Repository(path)
    engine = CourseRefreshLearningEngine(
        repo,
        research_port=NormalizedLiveResearchPort([BASE_CAPTURE]),
        candidate_model_port=StochasticRecordedModelPort(BASE_MULTI["traces"]),
        refresh_research_port=NormalizedLiveResearchPort([REFRESH_CAPTURE] if refresh_capture else []),
        refresh_model_port=RecordedModelGenerationPort([REFRESH_TRACE] if refresh_trace else []),
    )
    return repo, engine


def build_seed(path: str, *, learner=True):
    repo, engine = new_engine(path)
    out = engine.create_multi_candidate_course_job(
        operation_id="BASE-OP", job_id="BASE-JOB", goal_id="G-PY-REFRESH",
        title="Python comprehensions", desired_outcome=GOAL, candidate_trace_ids=BASE_IDS,
    )
    engine.register_initial_active_course(
        operation_id="BASE-ACT", series_id=SERIES, course_id=out["course_id"],
        activated_at="2026-09-07T06:30:00-04:00", review_receipt=REVIEW,
    )
    if learner:
        engine.submit_attempt(
            operation_id="L-LC-M", attempt_id="A-LC-M", learner_id="L", course_id=out["course_id"],
            item_id="M-PY-LC-1", response="[n*n for n in range(0, 7, 2)]", submitted_at=100,
        )
        engine.submit_attempt(
            operation_id="L-LC-R", attempt_id="A-LC-R", learner_id="L", course_id=out["course_id"],
            item_id="R-PY-LC-1", response='[len(word) for word in ["cat","tiger","ox","horse"] if len(word) >= 4]', submitted_at=4000,
        )
        engine.submit_attempt(
            operation_id="L-DC-M", attempt_id="A-DC-M", learner_id="L", course_id=out["course_id"],
            item_id="M-PY-DC-1", response='{n: len(n) for n in ["Ada", "Linus", "Guido"]}', submitted_at=5000,
        )
        engine.submit_attempt(
            operation_id="L-DC-R", attempt_id="A-DC-R", learner_id="L", course_id=out["course_id"],
            item_id="R-PY-DC-1", response='{v: v*v*v for v in range(1,5)}', submitted_at=8900,
        )
        engine.submit_transfer_attempt(
            operation_id="L-DC-T", attempt_id="A-DC-T", learner_id="L", course_id=out["course_id"],
            task_id="T-PY-COMP-ODD-SQUARES", response='{k: k*k for k in range(1,8,2)}', submitted_at=9000,
        )
    return repo, engine, out


def refresh(engine, *, op="REFRESH-OP", job="REFRESH-JOB", crash=None):
    return engine.refresh_course_job(
        operation_id=op, job_id=job, series_id=SERIES, title="Python comprehensions refreshed",
        desired_outcome=GOAL, requested_at="2026-09-07T07:12:00-04:00",
        refresh_reason="SOURCE_FRESHNESS_RECHECK", crash_after_phase=crash,
    )


def demo():
    with tempfile.TemporaryDirectory() as td:
        repo, engine, base = build_seed(os.path.join(td, "demo.sqlite3"), learner=True)
        old_course = repo.get_object("course", base["course_id"], 1)
        old_digest = digest(old_course)
        attempts_before = repo.count_attempts()
        freshness = engine.assess_source_freshness(series_id=SERIES, as_of="2026-09-07T07:12:00-04:00")
        out = refresh(engine)
        diff = repo.get_object("course_semantic_diff", out["semantic_diff_id"], 1)
        validation = repo.get_object("successor_validation", f"REFRESH-VAL-{out['successor_course_id']}", 1)
        migration = repo.get_object("learner_state_migration_plan", "MIGRATION-REFRESH-JOB", 1)
        active_before = engine.active_course(SERIES)
        activation = engine.activate_successor(
            operation_id="ACT-V2", series_id=SERIES, successor_course_id=out["successor_course_id"],
            expected_active_revision=1, activated_at="2026-09-07T07:20:00-04:00", review_receipt=REVIEW,
        )
        active_after = engine.active_course(SERIES)
        old_after = repo.get_object("course", base["course_id"], 1)
        result = {
            "pass": all([
                freshness["status"] == "STALE",
                out["state"] == "READY_FOR_REVIEW",
                active_before["course"]["course_id"] == base["course_id"],
                out["successor_course_id"] != base["course_id"],
                diff["semantic_class"] == "NON_MATERIAL_SOURCE_REFRESH",
                diff["mastery_revalidation_required"] is False,
                validation["professional_quality"]["status"] == "PASS",
                validation["professional_quality"]["profile_id"] == PROFESSIONAL_QUALITY_PROFILE_VERSION,
                validation["professional_quality"]["external_recognition"] == "NOT_CLAIMED",
                digest(old_after) == old_digest,
                repo.count_attempts() == attempts_before,
                activation["activation_revision"] == 2,
                active_after["course"]["course_id"] == out["successor_course_id"],
            ]),
            "freshness_before": freshness,
            "base_course_id": base["course_id"],
            "base_course_digest": old_digest,
            "successor_course_id": out["successor_course_id"],
            "successor_course_digest": out["successor_course_digest"],
            "semantic_class": diff["semantic_class"],
            "affected_skill_ids": diff["affected_skill_ids"],
            "mastery_revalidation_required": diff["mastery_revalidation_required"],
            "professional_quality": validation["professional_quality"],
            "external_recognition": out["external_recognition"],
            "migration": migration,
            "explicit_activation_revision": activation["activation_revision"],
            "historical_course_immutable": digest(old_after) == old_digest,
            "historical_attempts_unchanged": repo.count_attempts() == attempts_before,
            "review_fixture_truth_boundary": "SYNTHETIC_TEST_FIXTURE_NOT_INDEPENDENT_HUMAN_REVIEW",
        }
        write_json("impl009_refresh_demo.json", result)
        return result


def targeted_adversarial():
    names = [
        "test_quality_regression_blocks_factually_refreshed_successor",
        "test_professional_quality_gate_does_not_claim_college_credit_or_accreditation",
        "test_historical_course_bytes_remain_immutable_after_refresh",
        "test_historical_attempts_are_not_copied_or_rewritten_by_refresh",
        "test_material_assessment_change_requires_revalidation_only_for_affected_skill",
        "test_material_change_records_exact_assessment_and_source_basis_reasons",
        "test_successor_is_not_activated_automatically",
        "test_activation_requires_explicit_human_review_gate",
        "test_activation_stale_base_is_blocked",
        "test_activation_same_operation_changed_payload_conflicts",
        "test_refresh_same_operation_changed_payload_conflicts",
        "test_refresh_capture_drift_after_trigger_fails_closed",
        "test_refresh_model_drift_after_pin_fails_closed",
        "test_recovery_after_candidate_generation_needs_no_research_or_model_provider",
        "test_all_refresh_crash_boundaries_recover_without_duplicate_successors",
        "test_unknown_learner_does_not_receive_invented_mastery",
        "test_refresh_diff_preserves_historical_interpretability",
    ]
    fq = [f"tests.test_course_refresh.CourseRefreshTests.{n}" for n in names]
    proc = run_cmd([sys.executable, "-m", "unittest", "-v", *fq])
    output = proc.stdout + proc.stderr
    (EVIDENCE / "adversarial_output_impl009.txt").write_text(output, encoding="utf-8")
    passed = output.count(" ... ok")
    result = {"pass": proc.returncode == 0 and passed == len(names), "passed": passed, "total": len(names), "cases": names}
    write_json("impl009_adversarial.json", result)
    return result


def recovery_stress(runs=100):
    phase_passes = {p: 0 for p in PHASES}
    crash_seed_ok = {p: False for p in PHASES}
    course_digests, diff_digests, readiness_digests = set(), set(), set()
    passes = 0
    with tempfile.TemporaryDirectory() as td:
        base_seed = os.path.join(td, "base.sqlite3")
        build_seed(base_seed, learner=True)
        crash_paths = {}
        for phase in PHASES:
            p = os.path.join(td, f"seed-{phase}.sqlite3")
            sqlite_backup(base_seed, p)
            repo, engine = new_engine(p)
            try:
                refresh(engine, crash=phase)
            except InjectedCrash:
                crash_seed_ok[phase] = True
                crash_paths[phase] = p
        for i in range(runs):
            phase = PHASES[i % len(PHASES)]
            if not crash_seed_ok[phase]:
                continue
            p = os.path.join(td, f"run-{i}.sqlite3")
            sqlite_backup(crash_paths[phase], p)
            # Later checkpoints must recover without needing live providers.
            need_research = phase == "REFRESH_TRIGGERED"
            need_model = phase in {"REFRESH_TRIGGERED", "REFRESH_SOURCES_ACQUIRED", "REFRESH_MODEL_PINNED"}
            repo, engine = new_engine(p, refresh_capture=need_research, refresh_trace=need_model)
            try:
                out = refresh(engine)
                replay = refresh(engine)
                diff = repo.get_object("course_semantic_diff", out["semantic_diff_id"], 1)
                readiness = repo.get_object("successor_readiness", "READINESS-REFRESH-JOB", 1)
                if (
                    out == replay
                    and repo.count_objects("course") == 2
                    and out["state"] == "READY_FOR_REVIEW"
                    and engine.active_course(SERIES)["activation"]["activation_revision"] == 1
                ):
                    passes += 1
                    phase_passes[phase] += 1
                    course_digests.add(out["successor_course_digest"])
                    diff_digests.add(digest(diff))
                    readiness_digests.add(digest(readiness))
            finally:
                try:
                    os.remove(p)
                except FileNotFoundError:
                    pass
    result = {
        "pass": all(crash_seed_ok.values()) and passes == runs and len(course_digests) == len(diff_digests) == len(readiness_digests) == 1,
        "runs": runs,
        "passes": passes,
        "crash_injection_seeds": crash_seed_ok,
        "phase_passes": phase_passes,
        "unique_successor_course_digests": len(course_digests),
        "unique_semantic_diff_digests": len(diff_digests),
        "unique_readiness_digests": len(readiness_digests),
    }
    write_json("impl009_recovery_stress.json", result)
    return result


def activation_stress(runs=100):
    results = []
    with tempfile.TemporaryDirectory() as td:
        ready_seed = os.path.join(td, "ready.sqlite3")
        repo, engine, _ = build_seed(ready_seed, learner=True)
        out = refresh(engine)
        successor = out["successor_course_id"]
        for i in range(runs):
            p = os.path.join(td, f"act-{i}.sqlite3")
            sqlite_backup(ready_seed, p)
            repo2, engine2 = new_engine(p, refresh_capture=False, refresh_trace=False)
            act = engine2.activate_successor(
                operation_id="ACT-V2", series_id=SERIES, successor_course_id=successor,
                expected_active_revision=1, activated_at="2026-09-07T07:20:00-04:00", review_receipt=REVIEW,
            )
            replay = engine2.activate_successor(
                operation_id="ACT-V2", series_id=SERIES, successor_course_id=successor,
                expected_active_revision=1, activated_at="2026-09-07T07:20:00-04:00", review_receipt=REVIEW,
            )
            stale_blocked = False
            try:
                engine2.activate_successor(
                    operation_id=f"STALE-{i}", series_id=SERIES, successor_course_id=successor,
                    expected_active_revision=1, activated_at="2026-09-07T07:21:00-04:00", review_receipt=REVIEW,
                )
            except ValueError as exc:
                stale_blocked = "STALE_BASE" in str(exc)
            current = engine2.active_course(SERIES)["activation"]
            results.append((act == replay, stale_blocked, current["activation_revision"], current["course_id"], digest(current)))
            os.remove(p)
    unique = set(results)
    result = {
        "pass": len(results) == runs and all(r[0] and r[1] and r[2] == 2 for r in results) and len(unique) == 1,
        "runs": runs,
        "passes": sum(1 for r in results if r[0] and r[1] and r[2] == 2),
        "unique_activation_results": len(unique),
    }
    write_json("impl009_activation_stress.json", result)
    return result


def diff_determinism(runs=100):
    # Use the persisted diff because this also validates that replay identity remains stable.
    digests = []
    with tempfile.TemporaryDirectory() as td:
        seed = os.path.join(td, "ready.sqlite3")
        repo, engine, _ = build_seed(seed, learner=True)
        out = refresh(engine)
        expected = digest(repo.get_object("course_semantic_diff", out["semantic_diff_id"], 1))
        for i in range(runs):
            p = os.path.join(td, f"d-{i}.sqlite3")
            sqlite_backup(seed, p)
            repo2, engine2 = new_engine(p, refresh_capture=False, refresh_trace=False)
            replay = refresh(engine2)
            digests.append(digest(repo2.get_object("course_semantic_diff", replay["semantic_diff_id"], 1)))
            os.remove(p)
    result = {"pass": len(digests) == runs and set(digests) == {expected}, "runs": runs, "unique_semantic_diff_digests": len(set(digests))}
    write_json("impl009_diff_determinism.json", result)
    return result


def mode_main(mode: str):
    if mode == "full-tests": return run_tests(True)
    if mode == "predecessor-tests": return run_tests(False)
    if mode == "compile": return compile_all()
    if mode == "demo": return demo()
    if mode == "adversarial": return targeted_adversarial()
    if mode == "recovery": return recovery_stress(100)
    if mode == "activation": return activation_stress(100)
    if mode == "diff": return diff_determinism(100)
    raise SystemExit(f"unknown mode: {mode}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: qualification_impl009.py MODE")
    value = mode_main(sys.argv[1])
    print(json.dumps(value, indent=2, sort_keys=True))
    raise SystemExit(0 if value.get("pass") else 1)
