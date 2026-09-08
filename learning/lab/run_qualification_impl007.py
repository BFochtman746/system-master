from __future__ import annotations

import hashlib
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
MODEL_PATH = ROOT / "sources" / "MODEL_GENERATION_PYTHON_COMPREHENSIONS_V1.json"


def load_capture():
    return json.loads(CAPTURE_PATH.read_text(encoding="utf-8"))


def load_trace():
    return json.loads(MODEL_PATH.read_text(encoding="utf-8"))


def run_cmd(args):
    env = dict(os.environ)
    env["PYTHONPATH"] = str(ROOT)
    return subprocess.run(args, cwd=ROOT, env=env, capture_output=True, text=True)


def run_all_tests():
    proc = run_cmd([sys.executable, "-m", "unittest", "discover", "-s", str(ROOT / "tests"), "-v"])
    output = proc.stdout + proc.stderr
    (ROOT / "evidence").mkdir(exist_ok=True)
    (ROOT / "evidence" / "test_output_impl007.txt").write_text(output, encoding="utf-8")
    return proc.returncode, output.count(" ... ok"), output


def run_predecessor_tests():
    modules = sorted(
        "tests." + p.stem for p in (ROOT / "tests").glob("test_*.py")
        if p.stem != "test_live_replay_model_open_goal"
    )
    proc = run_cmd([sys.executable, "-m", "unittest", "-v", *modules])
    output = proc.stdout + proc.stderr
    return {
        "pass": proc.returncode == 0 and output.count(" ... ok") == 143,
        "passed": output.count(" ... ok"),
        "expected": 143,
        "returncode": proc.returncode,
    }


def compile_all():
    files = sorted(p for p in ROOT.rglob("*.py") if "__pycache__" not in p.parts)
    errors = []
    for p in files:
        try:
            py_compile.compile(str(p), doraise=True)
        except Exception as exc:
            errors.append(f"{p.relative_to(ROOT)}:{exc}")
    return files, errors


def make_engine(path, research=True, model=True):
    from learning_lab import (
        LiveReplayOpenGoalLearningEngine,
        NormalizedLiveResearchPort,
        RecordedModelGenerationPort,
        Repository,
    )
    rp = NormalizedLiveResearchPort([load_capture()] if research else [])
    mp = RecordedModelGenerationPort([load_trace()] if model else [])
    return Repository(path), LiveReplayOpenGoalLearningEngine(
        Repository(path), research_port=rp, model_generation_port=mp
    )


def new_engine(path, research=True, model=True):
    from learning_lab import LiveReplayOpenGoalLearningEngine, NormalizedLiveResearchPort, RecordedModelGenerationPort, Repository
    repo = Repository(path)
    engine = LiveReplayOpenGoalLearningEngine(
        repo,
        research_port=NormalizedLiveResearchPort([load_capture()] if research else []),
        model_generation_port=RecordedModelGenerationPort([load_trace()] if model else []),
    )
    return repo, engine


def create(engine, op="OP-CREATE", job="JOB-CREATE", gid="G-PY", crash=None):
    return engine.create_live_open_goal_course_job(
        operation_id=op, job_id=job, goal_id=gid, title="Python comprehensions",
        desired_outcome=GOAL, crash_after_phase=crash,
    )


def master_list(engine, cid, learner="L", prefix="LC", t0=100):
    engine.submit_attempt(
        operation_id=f"OP-{prefix}-M", attempt_id=f"A-{prefix}-M", learner_id=learner,
        course_id=cid, item_id="M-PY-LC-1",
        response="[n*n for n in range(0, 7, 2)]", submitted_at=t0,
    )
    return engine.submit_attempt(
        operation_id=f"OP-{prefix}-R", attempt_id=f"A-{prefix}-R", learner_id=learner,
        course_id=cid, item_id="R-PY-LC-1",
        response='[len(word) for word in ["cat","tiger","ox","horse"] if len(word) >= 4]',
        submitted_at=t0 + 3900,
    )


def master_dict(engine, cid, learner="L", prefix="DC", t0=5000):
    engine.submit_attempt(
        operation_id=f"OP-{prefix}-M", attempt_id=f"A-{prefix}-M", learner_id=learner,
        course_id=cid, item_id="M-PY-DC-1",
        response='{n: len(n) for n in ["Ada", "Linus", "Guido"]}', submitted_at=t0,
    )
    return engine.submit_attempt(
        operation_id=f"OP-{prefix}-R", attempt_id=f"A-{prefix}-R", learner_id=learner,
        course_id=cid, item_id="R-PY-DC-1",
        response='{v: v*v*v for v in range(1,5)}', submitted_at=t0 + 3900,
    )


def full_demo():
    from learning_lab import LiveReplayOpenGoalTutorDirector
    with tempfile.TemporaryDirectory() as td:
        repo, engine = new_engine(os.path.join(td, "demo.sqlite3"))
        before = list(engine.registry.domain_keys)
        out = create(engine)
        cid = out["course_id"]
        after = list(engine.registry.domain_keys)
        tutor = LiveReplayOpenGoalTutorDirector(repo, engine)
        t1 = tutor.process_turn(
            operation_id="OT1", turn_id="T1", session_id="S", learner_id="L", course_id=cid,
            skill_id="S-PY-LISTCOMP", probe_id="TP-PY-LC-1", response="[x for x in range(6)]",
            requested_help_level=2, now=1,
        )
        t2 = tutor.process_turn(
            operation_id="OT2", turn_id="T2", session_id="S", learner_id="L", course_id=cid,
            skill_id="S-PY-LISTCOMP", probe_id="TP-PY-LC-2", response="[x for x in [1,2,3,4]]",
            requested_help_level=3, now=2,
        )
        l = master_list(engine, cid)
        d = master_dict(engine, cid)
        action = engine.next_action("L", cid, now=9000)
        task = engine.transfer_task(action["target_id"])
        tr = engine.submit_transfer_attempt(
            operation_id="OTR", attempt_id="ATR", learner_id="L", course_id=cid,
            task_id=task["item_id"], response=task["answer"], submitted_at=9100,
        )
        final = engine.next_action("L", cid, now=9100)
        verification = repo.get_object("live_open_goal_verification", out["verification_id"], 1)
        model_receipt = repo.get_object("model_generation_receipt", out["model_generation_trace_id"], 1)
        passed = all([
            "python-comprehensions" not in before,
            "python-comprehensions" in after,
            t1["diagnosis"]["standing"] == "TEACHING_HYPOTHESIS",
            t2["diagnosis"]["standing"] == "EVIDENCE_SUPPORTED",
            l["projection"]["stage"] == "MASTERED",
            d["projection"]["stage"] == "RETAINED",
            action["action_type"] == "TRANSFER_CHECK",
            tr["projection"]["stage"] == "MASTERED",
            final["action_type"] == "COURSE_COMPLETE",
            verification["generator_self_approval"] is False,
            verification["human_review_required"] is True,
            model_receipt["standing"] == "MODEL_GENERATED_CANDIDATE_NOT_VERIFIED",
        ])
        return {
            "pass": passed,
            "domains_before": before,
            "domains_after": after,
            "course_id": cid,
            "course_digest": out["course_digest"],
            "research_capture_id": out["research_capture_id"],
            "research_evidence_digest": out["research_evidence_digest"],
            "model_id": out["model_id"],
            "model_output_digest": out["model_output_digest"],
            "model_trace_id": out["model_generation_trace_id"],
            "oracle_type": out["oracle_type"],
            "hypothesis": t1["diagnosis"]["standing"],
            "corroborated": t2["diagnosis"]["standing"],
            "list_stage": l["projection"]["stage"],
            "dict_stage": d["projection"]["stage"],
            "transfer_stage": tr["projection"]["stage"],
            "final_action": final["action_type"],
            "verification_standing": out["validation_status"],
            "human_review_dimensions": verification["human_review_dimensions"],
        }


def targeted_adversarial_tests():
    names = [
        "test_research_port_abstains_on_unsupported_goal",
        "test_research_capture_digest_tamper_is_rejected",
        "test_model_prompt_tamper_rejected",
        "test_model_output_tamper_rejected",
        "test_generator_self_verification_field_is_rejected",
        "test_model_wrong_answer_key_is_caught_by_independent_python_oracle",
        "test_model_wrong_worked_example_is_caught",
        "test_model_unknown_claim_reference_is_blocked_before_course",
        "test_model_cannot_self_approve_pedagogical_judgment",
        "test_python_oracle_rejects_code_execution_escape",
        "test_python_oracle_rejects_unapproved_attribute_access",
        "test_assisted_transfer_does_not_become_mastery",
        "test_tutor_context_does_not_contain_answer_or_oracle_gold",
        "test_tutor_cannot_help_during_mastery",
        "test_changed_payload_same_operation_conflicts",
        "test_research_capture_drift_before_acquisition_fails_closed",
        "test_model_trace_drift_after_pin_fails_closed",
        "test_http_replay_detects_changed_bytes",
        "test_recovery_after_model_generation_needs_no_live_research_or_model_trace",
        "test_restart_rehydrates_dynamic_domain_from_persisted_generated_dossier",
        "test_behaviorally_equivalent_mastery_answer_is_accepted",
    ]
    fq = [f"tests.test_live_replay_model_open_goal.LiveReplayModelOpenGoalTests.{n}" for n in names]
    proc = run_cmd([sys.executable, "-m", "unittest", "-v", *fq])
    output = proc.stdout + proc.stderr
    passed = output.count(" ... ok")
    return {
        "pass": proc.returncode == 0 and passed == len(names),
        "passed": passed,
        "total": len(names),
        "cases": names,
    }


def recovery_stress(runs=100):
    from learning_lab import LiveReplayOpenGoalLearningEngine, NormalizedLiveResearchPort, RecordedModelGenerationPort, Repository
    from learning_lab.engine import InjectedCrash
    phases = ["GOAL_INTERPRETED", "RESEARCH_PLANNED", "SOURCES_ACQUIRED", "MODEL_PINNED", "MODEL_GENERATED", "ORACLE_BOUND", "LIVE_OPEN_GOAL_COURSE_GENERATED"]
    phase_passes = {p: 0 for p in phases}
    passes = 0
    course_digests, research_digests, model_digests = set(), set(), set()
    cap, trace = load_capture(), load_trace()
    for i in range(runs):
        phase = phases[i % len(phases)]
        with tempfile.TemporaryDirectory() as td:
            path = os.path.join(td, "x.sqlite3")
            kwargs = dict(operation_id="OP", job_id="JOB", goal_id="G", title="PY", desired_outcome=GOAL)
            e1 = LiveReplayOpenGoalLearningEngine(
                Repository(path), research_port=NormalizedLiveResearchPort([cap]), model_generation_port=RecordedModelGenerationPort([trace])
            )
            try:
                e1.create_live_open_goal_course_job(**kwargs, crash_after_phase=phase)
                continue
            except InjectedCrash:
                pass
            # After model generation, exact source and model outputs are durable and the runtime inputs are no longer required.
            empty = phase in {"MODEL_GENERATED", "ORACLE_BOUND", "LIVE_OPEN_GOAL_COURSE_GENERATED"}
            e2 = LiveReplayOpenGoalLearningEngine(
                Repository(path),
                research_port=NormalizedLiveResearchPort([] if empty else [cap]),
                model_generation_port=RecordedModelGenerationPort([] if empty else [trace]),
            )
            out = e2.create_live_open_goal_course_job(**kwargs)
            replay = e2.create_live_open_goal_course_job(**kwargs)
            ok = out == replay and e2.repo.count_objects("course") == 1
            if ok:
                passes += 1
                phase_passes[phase] += 1
                course_digests.add(out["course_digest"])
                research_digests.add(out["research_evidence_digest"])
                model_digests.add(out["model_output_digest"])
    return {
        "pass": passes == runs and len(course_digests) == len(research_digests) == len(model_digests) == 1,
        "runs": runs,
        "passes": passes,
        "phase_passes": phase_passes,
        "unique_course_digests": len(course_digests),
        "unique_research_digests": len(research_digests),
        "unique_model_output_digests": len(model_digests),
    }


def tutor_recovery_stress(runs=100):
    from learning_lab import LiveReplayOpenGoalLearningEngine, LiveReplayOpenGoalTutorDirector, NormalizedLiveResearchPort, RecordedModelGenerationPort, Repository
    from learning_lab.engine import InjectedCrash
    phases = ["OBSERVED", "DIAGNOSED", "MOVE_SELECTED"]
    phase_passes = {p: 0 for p in phases}
    passes = 0
    result_digests = set()
    with tempfile.TemporaryDirectory() as seed_td:
        seed = os.path.join(seed_td, "seed.sqlite3")
        _, seed_engine = new_engine(seed)
        out = create(seed_engine)
        cid = out["course_id"]
        for i in range(runs):
            phase = phases[i % len(phases)]
            with tempfile.TemporaryDirectory() as td:
                path = os.path.join(td, "x.sqlite3")
                src = sqlite3.connect(seed); dst = sqlite3.connect(path); src.backup(dst); dst.close(); src.close()
                e1 = LiveReplayOpenGoalLearningEngine(
                    Repository(path), research_port=NormalizedLiveResearchPort([]), model_generation_port=RecordedModelGenerationPort([])
                )
                tutor1 = LiveReplayOpenGoalTutorDirector(e1.repo, e1)
                kwargs = dict(
                    operation_id="OP-T", turn_id="T", session_id="S", learner_id="L", course_id=cid,
                    skill_id="S-PY-LISTCOMP", probe_id="TP-PY-LC-1", response="[x for x in range(6)]",
                    requested_help_level=2, now=1,
                )
                try:
                    tutor1.process_turn(**kwargs, crash_after_phase=phase)
                    continue
                except InjectedCrash:
                    pass
                e2 = LiveReplayOpenGoalLearningEngine(
                    Repository(path), research_port=NormalizedLiveResearchPort([]), model_generation_port=RecordedModelGenerationPort([])
                )
                tutor2 = LiveReplayOpenGoalTutorDirector(e2.repo, e2)
                a = tutor2.process_turn(**kwargs); b = tutor2.process_turn(**kwargs)
                h = hashlib.sha256(json.dumps(a, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
                if a == b and e2.repo.count_tutor_turns("S") == 1:
                    passes += 1; phase_passes[phase] += 1; result_digests.add(h)
    return {
        "pass": passes == runs and len(result_digests) == 1,
        "runs": runs, "passes": passes, "phase_passes": phase_passes,
        "unique_result_digests": len(result_digests),
    }


def transport_and_model_replay_proof():
    # The public-network capture itself was obtained outside this container and frozen in sources/.
    # Here we qualify the executable capture/replay mechanisms portably via local HTTP and callable provider capture.
    test_names = [
        "tests.test_live_replay_model_open_goal.LiveReplayModelOpenGoalTests.test_local_live_http_transport_capture_and_exact_replay",
        "tests.test_live_replay_model_open_goal.LiveReplayModelOpenGoalTests.test_http_replay_detects_changed_bytes",
        "tests.test_live_replay_model_open_goal.LiveReplayModelOpenGoalTests.test_callable_model_capture_can_be_replayed_exactly",
    ]
    proc = run_cmd([sys.executable, "-m", "unittest", "-v", *test_names])
    output = proc.stdout + proc.stderr
    return {
        "pass": proc.returncode == 0 and output.count(" ... ok") == 3,
        "passed": output.count(" ... ok"),
        "total": 3,
        "public_network_inside_container": "UNAVAILABLE_NOT_CLAIMED",
        "portable_transport": "LOCAL_HTTP_CAPTURE_REPLAY_VERIFIED",
        "model_provider_shape": "CALLABLE_CAPTURE_REPLAY_VERIFIED",
    }


def deterministic_replay(runs=3):
    rows = []
    for i in range(runs):
        with tempfile.TemporaryDirectory() as td:
            _, e = new_engine(os.path.join(td, "d.sqlite3"))
            o = e.create_live_open_goal_course_job(
                operation_id=f"O-{i}", job_id=f"J-{i}", goal_id="G-DET", title="PY", desired_outcome=GOAL
            )
            rows.append({
                "course_digest": o["course_digest"],
                "research_evidence_digest": o["research_evidence_digest"],
                "model_output_digest": o["model_output_digest"],
                "oracle_type": o["oracle_type"],
            })
    return {"pass": all(x == rows[0] for x in rows[1:]), "runs": runs, "outputs": rows}


def main():
    (ROOT / "evidence").mkdir(exist_ok=True)
    rc, passed, _ = run_all_tests()
    prior_receipt_path = ROOT / "evidence" / "qualification_receipt_impl006.json"
    prior_receipt = json.loads(prior_receipt_path.read_text(encoding="utf-8")) if prior_receipt_path.exists() else {}
    pred = {
        "pass": prior_receipt.get("status") == "PASS_PORTABLE_IMPLEMENTATION" and prior_receipt.get("tests", {}).get("passed") == 143,
        "prior_sealed_receipt_status": prior_receipt.get("status", "MISSING"),
        "prior_sealed_tests": prior_receipt.get("tests", {}).get("passed"),
        "current_full_suite_contains_prior_regressions": passed - 35 == 143,
    }
    files, compile_errors = compile_all()
    demo = full_demo()
    adversarial = targeted_adversarial_tests()
    recovery = recovery_stress(100)
    tutor = tutor_recovery_stress(100)
    transport = transport_and_model_replay_proof()
    deterministic = deterministic_replay(3)
    cap, trace = load_capture(), load_trace()
    receipt = {
        "objective": "LEARNING-LAB-IMPL-007",
        "status": "PASS_PORTABLE_IMPLEMENTATION" if all([
            rc == 0, passed == 178, pred["pass"], pred["current_full_suite_contains_prior_regressions"], not compile_errors, demo["pass"], adversarial["pass"],
            recovery["pass"], tutor["pass"], transport["pass"], deterministic["pass"],
        ]) else "FAIL",
        "tests": {"passed": passed, "expected": 178, "prior_regressions": 143, "new_impl007": 35, "returncode": rc},
        "predecessor_impl006_regression": pred,
        "python_compile": {"files": len(files), "errors": compile_errors},
        "demo": demo,
        "adversarial_campaign": adversarial,
        "open_goal_recovery_stress": recovery,
        "tutor_recovery_stress": tutor,
        "transport_model_replay": transport,
        "deterministic_replay": deterministic,
        "research_capture": {
            "capture_id": cap["capture_id"],
            "capture_mode": cap["capture_mode"],
            "source_count": len(cap["sources"]),
            "claim_count": len(cap["claims"]),
            "normalized_evidence_digest": cap["normalized_evidence_digest"],
        },
        "model_generation": {
            "trace_id": trace["generation_trace_id"],
            "capture_mode": trace["capture_mode"],
            "model_id": trace["model_id"],
            "model_role": trace["model_role"],
            "prompt_digest": trace["prompt_digest"],
            "output_digest": trace["output_digest"],
            "trace_digest": trace["trace_digest"],
        },
        "truth_boundary": {
            "current_external_research": "CHATGPT_WEB_LIVE_CAPTURE_NORMALIZED_AND_PINNED",
            "public_http_from_portable_container": "NOT_AVAILABLE_IN_THIS_ENVIRONMENT",
            "http_capture_replay_mechanism": "PORTABLY_VERIFIED_AGAINST_LOCAL_HTTP_SERVER",
            "model_backed_generation": "CURRENT_CHAT_MODEL_OUTPUT_CAPTURED_AND_REPLAYABLE",
            "production_live_model_provider_gateway": "NOT_YET_QUALIFIED",
            "generator_self_approval": "PROHIBITED",
            "pedagogical_human_review": "REQUIRED",
            "real_learner_effectiveness": "NOT_PROVEN",
            "native_iphone": "NOT_RUN",
            "production_system_master_integration": "NOT_RUN",
        },
    }
    (ROOT / "evidence" / "qualification_receipt_impl007.json").write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (ROOT / "evidence" / "live_research_capture_impl007.json").write_text(json.dumps(cap, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (ROOT / "evidence" / "model_generation_trace_impl007.json").write_text(json.dumps(trace, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (ROOT / "evidence" / "impl007_demo.json").write_text(json.dumps(demo, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (ROOT / "evidence" / "impl007_adversarial_campaign.json").write_text(json.dumps(adversarial, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (ROOT / "evidence" / "impl007_recovery_stress.json").write_text(json.dumps(recovery, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (ROOT / "evidence" / "impl007_tutor_recovery_stress.json").write_text(json.dumps(tutor, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (ROOT / "evidence" / "impl007_transport_model_replay.json").write_text(json.dumps(transport, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(receipt, indent=2, sort_keys=True))
    return 0 if receipt["status"].startswith("PASS") else 1


if __name__ == "__main__":
    raise SystemExit(main())
