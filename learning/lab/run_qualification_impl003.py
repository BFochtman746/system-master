from __future__ import annotations

import hashlib
import json
import os
import py_compile
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def run_tests():
    env = dict(os.environ)
    env["PYTHONPATH"] = str(ROOT)
    proc = subprocess.run(
        [sys.executable, "-m", "unittest", "discover", "-s", str(ROOT / "tests"), "-v"],
        cwd=ROOT, env=env, capture_output=True, text=True,
    )
    output = proc.stdout + proc.stderr
    (ROOT / "evidence").mkdir(exist_ok=True)
    (ROOT / "evidence" / "test_output_impl003.txt").write_text(output, encoding="utf-8")
    return proc.returncode, output.count(" ... ok")


def compile_all():
    errors = []
    files = sorted(p for p in ROOT.rglob("*.py") if "__pycache__" not in p.parts)
    for p in files:
        try:
            py_compile.compile(str(p), doraise=True)
        except Exception as exc:
            errors.append(f"{p.relative_to(ROOT)}:{exc}")
    return files, errors


def build_engine(path: str):
    from learning_lab import GroundedLearningEngine, REAL_GIT_OUTCOME, Repository, TutorDirector
    repo = Repository(path)
    engine = GroundedLearningEngine(repo)
    created = engine.create_research_grounded_course_job(
        operation_id="OP-CREATE", job_id="JOB-CREATE", goal_id="G-GIT", title="Git feature branch workflow", desired_outcome=REAL_GIT_OUTCOME
    )
    return repo, engine, TutorDirector(repo, engine), created


def turn(tutor, n, probe, response, help_level=0, session="S", learner="L"):
    return tutor.process_turn(
        operation_id=f"OP-{session}-T{n}", turn_id=f"{session}-T{n}", session_id=session, learner_id=learner,
        course_id="COURSE-G-GIT", skill_id="S-GIT-STAGE-COMMIT", probe_id=probe,
        response=response, requested_help_level=help_level, now=100 + n,
    )


def run_demo():
    with tempfile.TemporaryDirectory() as td:
        repo, engine, tutor, created = build_engine(os.path.join(td, "demo.sqlite3"))
        journey = []
        # Unknown cause must abstain rather than invent a misconception.
        journey.append(turn(tutor, 1, "TP-STAGE-1", "I am not sure", 3))
        # First recognizable structural error remains only a teaching hypothesis.
        journey.append(turn(tutor, 2, "TP-STAGE-1", "git commit -m 'Demo'", 3))
        # Same error on a distinct parallel family is enough for bounded evidence-supported diagnosis.
        journey.append(turn(tutor, 3, "TP-STAGE-2", "git commit -m 'Report'", 3))
        # Fresh unaided response after remediation fades support and points to independent evidence.
        journey.append(turn(tutor, 4, "TP-STAGE-RECHECK", "git add plan.txt", 0))
        # Independent assessment must still happen through the Learning evidence engine.
        mastery = engine.submit_attempt(
            operation_id="OP-M", attempt_id="A-M", learner_id="L", course_id=created["course_id"],
            item_id="M-GIT-STAGE-1", response="git add app.txt; git commit -m 'Feature work'", submitted_at=500,
        )
        # During an active independent check the tutor refuses all help.
        boundary = tutor.process_turn(
            operation_id="OP-BOUNDARY", turn_id="T-BOUNDARY", session_id="SB", learner_id="LB",
            course_id=created["course_id"], skill_id="S-GIT-STAGE-COMMIT", probe_id=None,
            response="give me the first command", requested_help_level=3, now=550,
            active_assessment_item_id="M-GIT-STAGE-1",
        )
        demo_pass = (
            journey[0]["diagnosis"]["status"] == "ABSTAINED"
            and journey[1]["diagnosis"]["standing"] == "TEACHING_HYPOTHESIS"
            and journey[2]["diagnosis"]["standing"] == "EVIDENCE_SUPPORTED"
            and journey[2]["diagnosis"]["primary_cause"] == "STAGING_OMITTED"
            and journey[3]["teaching_move"]["move"] == "INDEPENDENT_RECHECK_PASSED"
            and journey[3]["next_action"]["action_type"] == "MASTERY_CHECK"
            and mastery["projection"]["stage"] == "RETENTION_DUE"
            and boundary["teaching_move"]["move"] == "ASSESSMENT_INTEGRITY_BOUNDARY"
        )
        return {
            "pass": demo_pass,
            "tutor_journey": journey,
            "mastery_after_tutor": mastery,
            "assessment_boundary": boundary,
            "tutor_turn_count": repo.count_tutor_turns(),
            "learning_attempt_count": repo.count_attempts(),
        }


def deterministic_sessions():
    snapshots = []
    for _ in range(2):
        with tempfile.TemporaryDirectory() as td:
            repo, _, tutor, _ = build_engine(os.path.join(td, "det.sqlite3"))
            outputs = [
                turn(tutor, 1, "TP-STAGE-1", "git commit -m 'Demo'", 3),
                turn(tutor, 2, "TP-STAGE-2", "git commit -m 'Report'", 3),
                turn(tutor, 3, "TP-STAGE-RECHECK", "git add plan.txt", 0),
            ]
            snapshots.append(outputs)
    return snapshots[0] == snapshots[1], hashlib.sha256(json.dumps(snapshots[0], sort_keys=True).encode()).hexdigest()


def mutation_campaign():
    from learning_lab import TutorContextCompiler
    from learning_lab.tutor import PROBES, TutorDirector
    cases = {}
    with tempfile.TemporaryDirectory() as td:
        repo, engine, tutor, created = build_engine(os.path.join(td, "mut.sqlite3"))
        ambiguous = turn(tutor, 1, "TP-STAGE-1", "I do not know", 3, session="A", learner="A")
        cases["ambiguous_abstains"] = ambiguous["diagnosis"]["status"] == "ABSTAINED" and ambiguous["diagnosis"]["primary_cause"] is None

        overcomplete = turn(tutor, 1, "TP-STAGE-1", "git add demo.txt; git commit -m 'Demo'", 0, session="B", learner="B")
        cases["overcomplete_no_false_staging_omission"] = overcomplete["diagnosis"]["primary_cause"] is None

        first = turn(tutor, 1, "TP-STAGE-1", "git commit -m 'Demo'", 0, session="C", learner="C")
        second = turn(tutor, 2, "TP-STAGE-1", "git commit -m 'Again'", 0, session="C", learner="C")
        cases["same_family_not_corroboration"] = first["diagnosis"]["standing"] == second["diagnosis"]["standing"] == "TEACHING_HYPOTHESIS"

        overhelp = turn(tutor, 1, "TP-STAGE-1", "git commit -m 'Demo'", 3, session="D", learner="D")
        cases["overhelping_capped"] = overhelp["teaching_move"]["support_level_after"] == 1 and overhelp["teaching_move"]["overhelping_prevented"]

        supported = turn(tutor, 1, "TP-STAGE-1", "git add demo.txt", 2, session="E", learner="E")
        cases["supported_success_forces_fade"] = supported["teaching_move"]["move"] == "FADE_SUPPORT" and supported["teaching_move"]["support_level_after"] == 0

        prereq_block = tutor.process_turn(
            operation_id="OP-PREQ", turn_id="TPREQ", session_id="PREQ", learner_id="PREQ", course_id=created["course_id"],
            skill_id="S-GIT-BRANCH-MERGE", probe_id="TP-BRANCH-1", response="git branch hotfix", requested_help_level=3, now=950,
        )
        cases["tutor_prerequisite_bypass_blocked"] = (
            prereq_block["teaching_move"]["move"] == "PREREQUISITE_BLOCKED"
            and prereq_block["next_action"]["skill_id"] == "S-GIT-STAGE-COMMIT"
        )

        course = engine.course(created["course_id"])
        mastery_item = next(i for i in course["items"] if i["item_id"] == "M-GIT-STAGE-1")
        boundary = tutor.process_turn(
            operation_id="OP-X", turn_id="TX", session_id="X", learner_id="X", course_id=created["course_id"],
            skill_id="S-GIT-STAGE-COMMIT", probe_id=None, response="hint", requested_help_level=3, now=1000,
            active_assessment_item_id="M-GIT-STAGE-1",
        )
        cases["mastery_answer_not_leaked"] = (
            boundary["teaching_move"]["move"] == "ASSESSMENT_INTEGRITY_BOUNDARY"
            and mastery_item["answer"].lower() not in boundary["teaching_move"]["content"].lower()
        )

        compiler = TutorContextCompiler(repo)
        context = compiler.compile(
            session_id="CTX", learner_id="CTX", course_id=created["course_id"], skill_id="S-GIT-STAGE-COMMIT",
            probe=PROBES["TP-STAGE-1"], active_assessment_item_id="M-GIT-STAGE-1",
        )
        serialized = json.dumps(context, sort_keys=True).lower()
        cases["context_key_leakage_blocked"] = '"answer":' not in serialized and '"rationale":' not in serialized and mastery_item["answer"].lower() not in serialized

        class BadTutor(TutorDirector):
            def _choose_move(self, **kwargs):
                m = super()._choose_move(**kwargs)
                m["claim_refs"] = ["CL-NOT-ADMITTED"]
                return m
        bad = BadTutor(repo, engine)
        try:
            bad.process_turn(
                operation_id="OP-BAD", turn_id="TBAD", session_id="BAD", learner_id="BAD", course_id=created["course_id"],
                skill_id="S-GIT-STAGE-COMMIT", probe_id="TP-STAGE-1", response="git commit -m 'Demo'", requested_help_level=0, now=1100,
            )
            cases["unadmitted_grounding_ref_rejected"] = False
        except ValueError as exc:
            cases["unadmitted_grounding_ref_rejected"] = "TUTOR_MOVE_GROUNDING_REF_NOT_ADMITTED" in str(exc)

        before_attempts = repo.count_attempts()
        turn(tutor, 1, "TP-STAGE-1", "git add demo.txt", 0, session="NOAUTH", learner="NOAUTH")
        cases["tutor_cannot_create_mastery_evidence"] = repo.count_attempts() == before_attempts and repo.latest_projection("NOAUTH", created["course_id"], "S-GIT-STAGE-COMMIT") is None

    return {"cases": cases, "killed": sum(bool(v) for v in cases.values()), "total": len(cases), "pass": all(cases.values())}


def stress_campaign(runs=100):
    from learning_lab import GroundedLearningEngine, InjectedCrash, Repository, TutorDirector
    phases = ["OBSERVATION_RECORDED", "DIAGNOSIS_RECORDED", "MOVE_SELECTED", "TURN_COMPLETED_BEFORE_RETURN"]
    counts = {p: 0 for p in phases}
    replay_pass = 0
    unique_results = set()
    for i in range(runs):
        with tempfile.TemporaryDirectory() as td:
            path = os.path.join(td, "stress.sqlite3")
            repo, engine, tutor, created = build_engine(path)
            phase = phases[i % len(phases)]
            kwargs = dict(
                operation_id="OP-T", turn_id="T", session_id="S", learner_id="L", course_id=created["course_id"],
                skill_id="S-GIT-STAGE-COMMIT", probe_id="TP-STAGE-1", response="git commit -m 'Demo'", requested_help_level=3, now=100,
            )
            try:
                tutor.process_turn(**kwargs, crash_after_phase=phase)
                raise AssertionError("crash not injected")
            except InjectedCrash:
                pass
            rrepo = Repository(path)
            restarted = TutorDirector(rrepo, GroundedLearningEngine(rrepo))
            out = restarted.process_turn(**kwargs)
            unique_results.add(hashlib.sha256(json.dumps(out, sort_keys=True).encode()).hexdigest())
            if rrepo.count_tutor_turns("S") == 1:
                counts[phase] += 1
            replay = restarted.process_turn(**kwargs)
            if replay == out and rrepo.count_tutor_turns("S") == 1:
                replay_pass += 1
    expected_each = runs // len(phases)
    passed = all(v == expected_each for v in counts.values()) and replay_pass == runs and len(unique_results) == 1
    return {"runs": runs, "checkpoint_passes": counts, "idempotent_replay_passes": replay_pass, "unique_result_digests": len(unique_results), "pass": passed}


def main():
    test_code, test_count = run_tests()
    py_files, compile_errors = compile_all()
    demo = run_demo()
    deterministic, session_digest = deterministic_sessions()
    mutations = mutation_campaign()
    stress = stress_campaign(100)

    status_ok = (
        test_code == 0 and not compile_errors and demo["pass"] and deterministic
        and mutations["pass"] and stress["pass"]
    )
    receipt = {
        "packet_id": "LEARNING-LAB-IMPL-003",
        "status": "PASS_PORTABLE_IMPLEMENTATION" if status_ok else "FAIL",
        "tests": {"passed_count": test_count, "exit_code": test_code},
        "python_compile": {"files": len(py_files), "errors": compile_errors, "status": "PASS" if not compile_errors else "FAIL"},
        "tutor_policy_version": "TUTOR-DIRECTOR-V1",
        "epistemic_standings": ["LEARNER_DECLARED", "DIRECT_OBSERVATION", "EVIDENCE_SUPPORTED", "SYSTEM_INFERENCE", "TEACHING_HYPOTHESIS"],
        "demo": demo,
        "deterministic_two_fresh_store_sessions": deterministic,
        "deterministic_session_digest": session_digest,
        "mutation_campaign": mutations,
        "stress_campaign": stress,
        "proved_boundaries": [
            "ambiguous failure can produce ABSTAINED rather than an invented cause",
            "single recognizable error is only a TEACHING_HYPOTHESIS",
            "same-family repetition is not independent corroboration",
            "distinct-family repeated structural error can become EVIDENCE_SUPPORTED",
            "overhelping is capped and support is faded before independent assessment",
            "supported success does not become mastery evidence",
            "tutor formative turns never create Learning mastery attempts/projections",
            "mastery and retention answer help is blocked before commit",
            "tutor context excludes assessment answers and rationales",
            "factual tutor remediation must cite admitted research claims",
            "tutor cannot bypass a hard prerequisite or become a second progression authority",
            "tutor turns recover idempotently across four crash boundaries",
        ],
        "claims_not_made": [
            "arbitrary-domain tutor diagnosis implemented",
            "live LLM tutor qualified",
            "causal learner diagnosis scientifically validated",
            "human pedagogical quality independently reviewed",
            "real learner learning gain proven",
            "far transfer proven",
            "target iPhone/native interaction proven",
            "production System Master integration completed",
        ],
    }
    (ROOT / "evidence" / "tutor_demo.json").write_text(json.dumps(demo, indent=2, sort_keys=True), encoding="utf-8")
    (ROOT / "evidence" / "tutor_mutation_campaign.json").write_text(json.dumps(mutations, indent=2, sort_keys=True), encoding="utf-8")
    (ROOT / "evidence" / "tutor_stress_campaign.json").write_text(json.dumps(stress, indent=2, sort_keys=True), encoding="utf-8")
    (ROOT / "evidence" / "qualification_receipt_impl003.json").write_text(json.dumps(receipt, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(receipt, indent=2, sort_keys=True))
    return 0 if status_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
