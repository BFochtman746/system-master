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
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    (ROOT / "evidence").mkdir(exist_ok=True)
    env = dict(os.environ)
    env["PYTHONPATH"] = str(ROOT)
    proc = subprocess.run(
        [sys.executable, "-m", "unittest", "discover", "-s", str(ROOT / "tests"), "-v"],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
    )
    test_output = proc.stdout + proc.stderr
    (ROOT / "evidence" / "test_output.txt").write_text(test_output, encoding="utf-8")
    test_count = test_output.count(" ... ok")

    compile_errors = []
    py_files = sorted(p for p in ROOT.rglob("*.py") if "__pycache__" not in p.parts)
    for p in py_files:
        try:
            py_compile.compile(str(p), doraise=True)
        except Exception as exc:
            compile_errors.append(f"{p.relative_to(ROOT)}:{exc}")

    from learning_lab import GroundedLearningEngine, InjectedCrash, REAL_GIT_OUTCOME, Repository

    # Generate the real course twice in independent stores and require exact semantic reproducibility.
    demos = []
    for _ in range(2):
        with tempfile.TemporaryDirectory() as td:
            repo = Repository(os.path.join(td, "demo.sqlite3"))
            engine = GroundedLearningEngine(repo)
            c = engine.create_research_grounded_course_job(
                operation_id="OP-CREATE", job_id="JOB-CREATE", goal_id="G-GIT", title="Git feature branch workflow", desired_outcome=REAL_GIT_OUTCOME
            )
            course = engine.course(c["course_id"])
            validation = repo.get_object("course_validation", c["validation_id"], 1)
            demos.append({"create": c, "course": course, "validation": validation})
    deterministic_generation = demos[0] == demos[1]

    # Execute the full two-skill learner path with real Git command scoring.
    with tempfile.TemporaryDirectory() as td:
        repo = Repository(os.path.join(td, "journey.sqlite3"))
        engine = GroundedLearningEngine(repo)
        c = engine.create_research_grounded_course_job(
            operation_id="OP-CREATE", job_id="JOB-CREATE", goal_id="G-GIT", title="Git feature branch workflow", desired_outcome=REAL_GIT_OUTCOME
        )
        cid = c["course_id"]
        learner = "QUAL-LEARNER"
        journey = []
        journey.append(engine.next_action(learner, cid, now=0))
        journey.append(engine.submit_attempt(operation_id="OP-P1", attempt_id="A-P1", learner_id=learner, course_id=cid, item_id="P-GIT-STAGE-1", response="git add notes.txt", submitted_at=100)["projection"])
        journey.append(engine.submit_attempt(operation_id="OP-M1", attempt_id="A-M1", learner_id=learner, course_id=cid, item_id="M-GIT-STAGE-1", response="git add app.txt; git commit -m 'Feature work'", submitted_at=200)["projection"])
        journey.append(engine.submit_attempt(operation_id="OP-R1", attempt_id="A-R1", learner_id=learner, course_id=cid, item_id="R-GIT-STAGE-1", response="git add later.txt; git commit -m 'Later work'", submitted_at=4000)["projection"])
        journey.append(engine.submit_attempt(operation_id="OP-P2", attempt_id="A-P2", learner_id=learner, course_id=cid, item_id="P-GIT-BRANCH-1", response="git switch -c feature", submitted_at=4100)["projection"])
        journey.append(engine.submit_attempt(operation_id="OP-M2", attempt_id="A-M2", learner_id=learner, course_id=cid, item_id="M-GIT-BRANCH-1", response="git switch -c topic; git add change.txt; git commit -m 'Add change'; git switch main; git merge topic", submitted_at=4200)["projection"])
        journey.append(engine.submit_attempt(operation_id="OP-R2", attempt_id="A-R2", learner_id=learner, course_id=cid, item_id="R-GIT-BRANCH-1", response="git switch -c fix; git add fix.txt; git commit -m 'Fix issue'; git switch main; git merge fix", submitted_at=8000)["projection"])
        journey.append(engine.next_action(learner, cid, now=8000))
        journey_pass = (
            journey[0]["action_type"] == "LESSON"
            and journey[1]["stage"] != "MASTERED"
            and journey[2]["stage"] == "RETENTION_DUE"
            and journey[3]["stage"] == "MASTERED"
            and journey[5]["stage"] == "RETENTION_DUE"
            and journey[6]["stage"] == "MASTERED"
            and journey[7]["action_type"] == "COURSE_COMPLETE"
        )

    # 100 unattended crash/recovery campaigns. Alternate crash boundary so both
    # research and generated/validated checkpoint restoration are exercised.
    stress = {
        "runs": 100,
        "research_checkpoint_recovery_passes": 0,
        "generation_checkpoint_recovery_passes": 0,
        "idempotent_create_replay_passes": 0,
        "unique_course_digests": 0,
        "unique_dossier_digests": 0,
    }
    course_digests = set()
    dossier_digests = set()
    for i in range(stress["runs"]):
        with tempfile.TemporaryDirectory() as td:
            path = os.path.join(td, "stress.sqlite3")
            engine = GroundedLearningEngine(Repository(path))
            phase = "RESEARCH_FROZEN" if i % 2 == 0 else "COURSE_GENERATED_VALIDATED"
            try:
                engine.create_research_grounded_course_job(
                    operation_id="OP", job_id="JOB", goal_id="G", title="Git", desired_outcome=REAL_GIT_OUTCOME, crash_after_phase=phase
                )
                raise AssertionError("crash was not injected")
            except InjectedCrash:
                pass
            restarted = GroundedLearningEngine(Repository(path))
            out = restarted.create_research_grounded_course_job(
                operation_id="OP", job_id="JOB", goal_id="G", title="Git", desired_outcome=REAL_GIT_OUTCOME
            )
            course_digests.add(out["course_digest"])
            dossier_digests.add(out["research_dossier_digest"])
            if Repository(path).count_objects("course") == 1 and Repository(path).count_objects("research_dossier") == 1:
                if phase == "RESEARCH_FROZEN":
                    stress["research_checkpoint_recovery_passes"] += 1
                else:
                    stress["generation_checkpoint_recovery_passes"] += 1
            replay = restarted.create_research_grounded_course_job(
                operation_id="OP", job_id="JOB", goal_id="G", title="Git", desired_outcome=REAL_GIT_OUTCOME
            )
            if replay == out and Repository(path).count_objects("course") == 1:
                stress["idempotent_create_replay_passes"] += 1
    stress["unique_course_digests"] = len(course_digests)
    stress["unique_dossier_digests"] = len(dossier_digests)
    stress_pass = (
        stress["research_checkpoint_recovery_passes"] == 50
        and stress["generation_checkpoint_recovery_passes"] == 50
        and stress["idempotent_create_replay_passes"] == 100
        and stress["unique_course_digests"] == 1
        and stress["unique_dossier_digests"] == 1
    )

    # Persist representative exact outputs for inspection.
    (ROOT / "evidence" / "generated_course.json").write_text(json.dumps(demos[0]["course"], indent=2, sort_keys=True), encoding="utf-8")
    (ROOT / "evidence" / "course_validation.json").write_text(json.dumps(demos[0]["validation"], indent=2, sort_keys=True), encoding="utf-8")
    (ROOT / "evidence" / "learner_journey.json").write_text(json.dumps(journey, indent=2, sort_keys=True), encoding="utf-8")

    git_version = subprocess.run(["git", "--version"], capture_output=True, text=True, check=True).stdout.strip()
    files = sorted(
        p for p in ROOT.rglob("*")
        if p.is_file() and "__pycache__" not in p.parts and "evidence" not in p.parts and p.name not in {"SHA256SUMS.txt", "MANIFEST.json"}
    )
    source_dossier_path = ROOT / "sources" / "RESEARCH_DOSSIER_GIT_FEATURE_WORKFLOW_V1.json"
    status_ok = proc.returncode == 0 and not compile_errors and deterministic_generation and journey_pass and stress_pass
    receipt = {
        "packet_id": "LEARNING-LAB-IMPL-002",
        "status": "PASS_PORTABLE_IMPLEMENTATION" if status_ok else "FAIL",
        "generated_course_standing": demos[0]["validation"]["status"],
        "tests": {"exit_code": proc.returncode, "passed_count": test_count},
        "python_compile": {"files": len(py_files), "errors": compile_errors, "status": "PASS" if not compile_errors else "FAIL"},
        "real_goal": REAL_GIT_OUTCOME,
        "research": {
            "dossier_id": demos[0]["create"]["research_dossier_id"],
            "dossier_digest": demos[0]["create"]["research_dossier_digest"],
            "frozen_dossier_file_sha256": sha256(source_dossier_path),
            "source_count": 6,
            "claim_count": 7,
            "source_policy": "OFFICIAL_PRIMARY_ONLY",
        },
        "generation": {
            "adapter": demos[0]["create"]["generation_adapter"],
            "deterministic_two_fresh_store_runs": deterministic_generation,
            "course_digest": demos[0]["create"]["course_digest"],
            "course_state": demos[0]["create"]["state"],
        },
        "validation": demos[0]["validation"],
        "git_runtime": git_version,
        "full_real_learner_journey_pass": journey_pass,
        "stress_campaign": stress,
        "stress_campaign_pass": stress_pass,
        "source_hashes": {str(p.relative_to(ROOT)): sha256(p) for p in files},
        "claims_not_made": [
            "general arbitrary-goal course generation implemented",
            "live nondeterministic LLM/provider generation qualified",
            "human pedagogical review completed",
            "real learner efficacy proven",
            "retention interval scientifically calibrated",
            "far transfer proven",
            "target iPhone/native behavior proven",
            "production System Master integration completed",
        ],
    }
    (ROOT / "evidence" / "qualification_receipt.json").write_text(json.dumps(receipt, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(receipt, indent=2, sort_keys=True))
    return 0 if status_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
