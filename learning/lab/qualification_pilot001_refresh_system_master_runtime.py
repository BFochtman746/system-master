from __future__ import annotations

import argparse
import json
import os
import subprocess
import tempfile
from pathlib import Path

from learning_lab import (
    AdaptiveEntryJourneyDirector,
    BaselineDiagnosticDirector,
    DomainGeneralLearningEngine,
    DomainGeneralTutorDirector,
    GIT_DOMAIN_KEY,
    MultiSessionDirector,
    Repository,
    default_domain_registry,
)
from learning_lab.unified_turn_controller import prepare_learning_turn, submit_learning_turn


ROOT = Path(__file__).resolve().parent
DIAG_RESPONSE = "git add notes.txt"
VERIFY_RESPONSE = 'git add app.txt; git commit -m "Feature work"'


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def build_current_runtime(repo: Repository):
    registry = default_domain_registry()
    spec = registry.by_key(GIT_DOMAIN_KEY)
    engine = DomainGeneralLearningEngine(repo, registry=registry)
    created = engine.create_research_grounded_course_job(
        operation_id="OP-CREATE-PILOT-REFRESH-JAVA",
        job_id="JOB-CREATE-PILOT-REFRESH-JAVA",
        goal_id="G-PILOT-REFRESH-JAVA",
        title=spec.desired_outcome,
        desired_outcome=spec.desired_outcome,
    )
    course_id = created["course_id"]
    learner_id = "L-PILOT-REFRESH-JAVA"
    journey_id = "J-PILOT-REFRESH-JAVA"
    session_id = "S-PILOT-REFRESH-JAVA"
    diagnostic = BaselineDiagnosticDirector(repo, scorer=spec.behavior_oracle.score)
    tutor = DomainGeneralTutorDirector(repo, engine)
    sessions = MultiSessionDirector(repo, engine)
    journey = AdaptiveEntryJourneyDirector(repo, engine, diagnostic, tutor, sessions)
    journey.start_journey(
        operation_id="OP-J-PILOT-REFRESH-JAVA",
        journey_id=journey_id,
        diagnostic_id="D-PILOT-REFRESH-JAVA",
        learner_id=learner_id,
        course_id=course_id,
        claimed_skill_ids=["S-GIT-STAGE-COMMIT"],
        started_at=0,
    )
    sessions.start_session(
        operation_id="OP-S-PILOT-REFRESH-JAVA",
        session_id=session_id,
        learner_id=learner_id,
        course_id=course_id,
        started_at=0,
    )

    diag_turn_id = "TURN-PILOT-REFRESH-JAVA-DIAG"
    diag_turn = prepare_learning_turn(
        repo=repo,
        operation_id="OP-PREP-PILOT-REFRESH-JAVA-DIAG",
        turn_id=diag_turn_id,
        journey_id=journey_id,
        session_id=session_id,
        learner_id=learner_id,
        course_id=course_id,
        now=10,
    )
    require(diag_turn["action"]["action_type"] == "DIAGNOSTIC_PROBE", "qualification precondition: diagnostic turn")
    diag_submission = submit_learning_turn(
        repo=repo,
        operation_id="OP-SUBMIT-PILOT-REFRESH-JAVA-DIAG",
        turn_id=diag_turn_id,
        turn_binding_digest=diag_turn["turn_binding_digest"],
        response=DIAG_RESPONSE,
        submitted_at=10,
    )
    require(diag_submission["next_action"]["action_type"] == "INDEPENDENT_VERIFICATION",
            "qualification precondition: diagnostic routes to independent verification")

    verify_turn_id = "TURN-PILOT-REFRESH-JAVA-VERIFY"
    verify_turn = prepare_learning_turn(
        repo=repo,
        operation_id="OP-PREP-PILOT-REFRESH-JAVA-VERIFY",
        turn_id=verify_turn_id,
        journey_id=journey_id,
        session_id=session_id,
        learner_id=learner_id,
        course_id=course_id,
        now=120,
    )
    require(verify_turn["action"]["action_type"] == "INDEPENDENT_VERIFICATION",
            "qualification precondition: verification turn")
    verify_submission = submit_learning_turn(
        repo=repo,
        operation_id="OP-SUBMIT-PILOT-REFRESH-JAVA-VERIFY",
        turn_id=verify_turn_id,
        turn_binding_digest=verify_turn["turn_binding_digest"],
        response=VERIFY_RESPONSE,
        submitted_at=120,
    )
    require(verify_submission["evidence"]["correct"] is True,
            "qualification precondition: verification passes")
    require(verify_submission["response_echoed"] is False,
            "qualification precondition: response not echoed")
    return course_id, learner_id, journey_id, session_id, diag_turn_id, verify_turn_id


def run_python_injection_gate(repo_root: Path, env: dict[str, str], *, course_id: str,
                              learner_id: str, journey_id: str, session_id: str) -> None:
    request = {
        "operation": "START_REAL_LEARNER_PILOT",
        "operation_id": "OP-PILOT-INJECTION",
        "state_key": "pilot-refresh-java",
        "pilot_id": "PILOT-001-INJECTION",
        "participant_key": "LRN-INJECTION-0001",
        "journey_id": journey_id,
        "session_id": session_id,
        "learner_id": learner_id,
        "course_id": course_id,
        "started_at": 0,
        "consented_at": 1,
        "consent_recorded": True,
        "score": 1,
    }
    result = subprocess.run(
        ["python", "learning/lab/system_master_pilot_runtime_bridge.py"],
        cwd=repo_root,
        input=json.dumps(request, sort_keys=True, separators=(",", ":")),
        text=True,
        capture_output=True,
        env=env,
        timeout=30,
        check=False,
    )
    require(result.returncode == 2, "pilot evidence injection must fail closed")
    require("PILOT_RUNTIME_EVIDENCE_INJECTION_FORBIDDEN:score" in result.stdout,
            "pilot bridge must identify forbidden caller score injection")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--class-dir", required=True)
    args = parser.parse_args()
    repo_root = Path(os.environ.get("GITHUB_WORKSPACE", ROOT.parents[1])).resolve()
    class_dir = Path(args.class_dir).resolve()

    with tempfile.TemporaryDirectory(prefix="pilot001-refresh-java-state-") as state_root:
        state_key = "pilot-refresh-java"
        repo = Repository(str(Path(state_root) / f"{state_key}.sqlite3"))
        course_id, learner_id, journey_id, session_id, diag_turn_id, verify_turn_id = build_current_runtime(repo)
        env = dict(os.environ)
        env.update({
            "SYSTEM_MASTER_LEARNING_STATE_ROOT": state_root,
            "PILOT_REFRESH_COURSE_ID": course_id,
            "PILOT_REFRESH_LEARNER_ID": learner_id,
            "PILOT_REFRESH_JOURNEY_ID": journey_id,
            "PILOT_REFRESH_SESSION_ID": session_id,
            "PILOT_REFRESH_DIAG_TURN_ID": diag_turn_id,
            "PILOT_REFRESH_VERIFY_TURN_ID": verify_turn_id,
            "PILOT_REFRESH_DIAG_RAW_RESPONSE": DIAG_RESPONSE,
            "PILOT_REFRESH_VERIFY_RAW_RESPONSE": VERIFY_RESPONSE,
        })
        result = subprocess.run(
            ["java", "-cp", str(class_dir), "org.systemmaster.learning.Pilot001RefreshRuntimeBindingQualification"],
            cwd=repo_root,
            text=True,
            capture_output=True,
            env=env,
            timeout=120,
            check=False,
        )
        combined = (result.stdout or "") + (result.stderr or "")
        print(combined, end="" if combined.endswith("\n") else "\n")
        require(result.returncode == 0, f"Java PILOT-001 refresh qualification failed with rc={result.returncode}")
        require("PILOT_REFRESH_STATUS=PASS" in result.stdout, "Java pilot qualification did not report PASS")
        require("PILOT_REFRESH_CALLER_EVIDENCE_FIELDS=NONE" in result.stdout,
                "Java pilot command did not prove caller-evidence exclusion")
        require("PILOT_REFRESH_RAW_RESPONSE_EXPORT=NONE" in result.stdout,
                "Java pilot qualification did not prove raw-response exclusion")
        require("PILOT_REFRESH_HUMAN_EVIDENCE=NOT_MANUFACTURED" in result.stdout,
                "Java pilot qualification must preserve human boundary")
        require(DIAG_RESPONSE not in combined and VERIFY_RESPONSE not in combined,
                "raw learner response leaked into Java qualification output")

        run_python_injection_gate(
            repo_root,
            env,
            course_id=course_id,
            learner_id=learner_id,
            journey_id=journey_id,
            session_id=session_id,
        )

        print("PILOT_REFRESH_SYSTEM_MASTER_BINDING=PASS")
        print("PILOT_REFRESH_PYTHON_EVIDENCE_INJECTION_GATE=PASS")
        print("PILOT_REFRESH_REAL_PARTICIPANT_EVIDENCE=NOT_PROVEN")
        print("PILOT_REFRESH_A01_HUMAN_EVIDENCE_AUTHORITY=FALSE")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
