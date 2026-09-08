from __future__ import annotations

import argparse
import json
import os
import tempfile
import traceback
from typing import Any, Callable, Dict

from learning_lab import AdaptiveLearningEngine, LearningEngine, MultiSessionDirector, Repository
from learning_lab.baseline_diagnostic import BaselineDiagnosticDirector
from learning_lab.engine import InjectedCrash
from learning_lab.fixture import SUPPORTED_OUTCOME
from learning_lab.real_course import REAL_GIT_OUTCOME

OBJECTIVE = "LEARNING-LAB-QUAL-001 — BASELINE -> ADAPTIVE ROUTING CLOSED-LOOP QUALIFICATION"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def make_synthetic():
    td = tempfile.TemporaryDirectory()
    repo = Repository(os.path.join(td.name, "lab.sqlite3"))
    engine = LearningEngine(repo)
    created = engine.create_course_job(
        operation_id="OP-CREATE",
        job_id="JOB-CREATE",
        goal_id="G1",
        title="Synthetic routing basics",
        desired_outcome=SUPPORTED_OUTCOME,
    )
    diagnostic = BaselineDiagnosticDirector(repo)
    return td, repo, engine, diagnostic, created["course_id"]


def case_skip_ahead_closed_loop() -> Dict[str, Any]:
    td, repo, engine, diag, course_id = make_synthetic()
    try:
        created = diag.create_diagnostic(
            operation_id="OP-DIAG", diagnostic_id="D1", learner_id="L1",
            course_id=course_id, claimed_skill_ids=["S-ROUTE"], created_at=100,
        )
        require(created["next_action"]["action_type"] == "DIAGNOSTIC_PROBE", "advanced claim must probe")
        require(created["next_action"]["skill_id"] == "S-STABILITY", "hidden prerequisite must be checked first")

        observed = diag.record_probe(
            operation_id="OP-P1", probe_id="DP1", diagnostic_id="D1",
            item_id="P-STAB-1", response="STABLE", submitted_at=110,
        )
        require(observed["next_action"]["action_type"] == "INDEPENDENT_VERIFICATION", "correct diagnostic may only skip to verification")
        require(observed["next_action"]["target_id"] == "M-STAB-1", "wrong verification target")
        require(repo.count_attempts() == 0, "diagnostic minted mastery evidence")

        m1 = engine.submit_attempt(
            operation_id="OP-M1", attempt_id="A-M1", learner_id="L1", course_id=course_id,
            item_id="M-STAB-1", response="STABLE", submitted_at=120,
        )
        require(m1["projection"]["stage"] == "RETENTION_DUE", "verification must not skip retention")
        require(diag.next_action("D1")["action_type"] == "RETENTION_CHECK", "diagnostic must honor retention due")

        r1 = engine.submit_attempt(
            operation_id="OP-R1", attempt_id="A-R1", learner_id="L1", course_id=course_id,
            item_id="R-STAB-1", response="UNSTABLE", submitted_at=4000,
        )
        require(r1["projection"]["stage"] == "MASTERED", "prerequisite retention did not close")

        route_probe = diag.next_action("D1")
        require(route_probe["action_type"] == "DIAGNOSTIC_PROBE", "must continue adaptive entry after prerequisite closes")
        require(route_probe["skill_id"] == "S-ROUTE", "must return to claimed downstream skill")
        require(route_probe["target_id"] == "P-ROUTE-1", "wrong downstream diagnostic target")

        observed_route = diag.record_probe(
            operation_id="OP-P2", probe_id="DP2", diagnostic_id="D1",
            item_id="P-ROUTE-1", response="BETA", submitted_at=4010,
        )
        require(observed_route["next_action"]["action_type"] == "INDEPENDENT_VERIFICATION", "downstream skip must end at verification")
        require(observed_route["next_action"]["target_id"] == "M-ROUTE-1", "wrong downstream mastery target")

        engine.submit_attempt(
            operation_id="OP-M2", attempt_id="A-M2", learner_id="L1", course_id=course_id,
            item_id="M-ROUTE-1", response="ALPHA", submitted_at=4020,
        )
        r2 = engine.submit_attempt(
            operation_id="OP-R2", attempt_id="A-R2", learner_id="L1", course_id=course_id,
            item_id="R-ROUTE-1", response="BETA", submitted_at=8000,
        )
        require(r2["projection"]["stage"] == "MASTERED", "downstream skill did not reach mastery")
        require(diag.next_action("D1")["action_type"] == "COURSE_ENTRY_COMPLETE", "diagnostic entry did not close")
        require(engine.next_action("L1", course_id, now=8000)["action_type"] == "COURSE_COMPLETE", "runtime did not reach course complete")
        return {
            "first_probe_skill": "S-STABILITY",
            "skip_boundary": "INDEPENDENT_VERIFICATION",
            "final_runtime_action": "COURSE_COMPLETE",
            "attempt_count": repo.count_attempts(),
        }
    finally:
        td.cleanup()


def case_prerequisite_gap_repair_and_return() -> Dict[str, Any]:
    td, repo, engine, diag, course_id = make_synthetic()
    try:
        diag.create_diagnostic(
            operation_id="OP-DIAG", diagnostic_id="D1", learner_id="L1",
            course_id=course_id, claimed_skill_ids=["S-ROUTE"], created_at=100,
        )
        failed = diag.record_probe(
            operation_id="OP-P1", probe_id="DP1", diagnostic_id="D1",
            item_id="P-STAB-1", response="UNSTABLE", submitted_at=110,
        )
        require(failed["next_action"]["action_type"] == "TARGETED_REMEDIATION", "gap must route to targeted remediation")
        require(failed["next_action"]["target_id"] == "L-STABILITY", "remediation must bind exact prerequisite")
        require(repo.count_attempts() == 0, "failed diagnostic must remain routing-only")

        runtime_before = engine.next_action("L1", course_id, now=111)
        require(runtime_before["action_type"] == "LESSON", "runtime must teach unresolved prerequisite")
        require(runtime_before["skill_id"] == "S-STABILITY", "runtime remediation lost prerequisite target")

        engine.submit_attempt(
            operation_id="OP-PRACTICE", attempt_id="A-PRACTICE", learner_id="L1", course_id=course_id,
            item_id="P-STAB-2", response="UNSTABLE", submitted_at=120,
        )
        require(engine.next_action("L1", course_id, now=121)["action_type"] == "MASTERY_CHECK", "repair must progress to independent verification")
        engine.submit_attempt(
            operation_id="OP-M1", attempt_id="A-M1", learner_id="L1", course_id=course_id,
            item_id="M-STAB-1", response="STABLE", submitted_at=130,
        )
        repaired = engine.submit_attempt(
            operation_id="OP-R1", attempt_id="A-R1", learner_id="L1", course_id=course_id,
            item_id="R-STAB-1", response="UNSTABLE", submitted_at=4000,
        )
        require(repaired["projection"]["stage"] == "MASTERED", "remediation failed to close prerequisite")

        returned = diag.next_action("D1")
        require(returned["action_type"] == "DIAGNOSTIC_PROBE", "must return to interrupted downstream target")
        require(returned["skill_id"] == "S-ROUTE", "original learning target was lost")
        return {
            "gap_skill": "S-STABILITY",
            "remediation_target": "L-STABILITY",
            "return_skill": returned["skill_id"],
            "return_action": returned["action_type"],
        }
    finally:
        td.cleanup()


def case_novice_and_idempotent_replay() -> Dict[str, Any]:
    td, repo, engine, diag, course_id = make_synthetic()
    try:
        novice = diag.create_diagnostic(
            operation_id="OP-DIAG-N", diagnostic_id="DN", learner_id="LN",
            course_id=course_id, claimed_skill_ids=[], created_at=100,
        )
        require(novice["next_action"]["action_type"] == "LESSON", "novice must start with instruction")
        require(novice["next_action"]["skill_id"] == "S-STABILITY", "novice entry skill wrong")

        diag.create_diagnostic(
            operation_id="OP-DIAG-R", diagnostic_id="DR", learner_id="LR",
            course_id=course_id, claimed_skill_ids=["S-STABILITY"], created_at=100,
        )
        kwargs = dict(
            operation_id="OP-PROBE-R", probe_id="DPR", diagnostic_id="DR",
            item_id="P-STAB-1", response="STABLE", submitted_at=110,
        )
        first = diag.record_probe(**kwargs)
        second = diag.record_probe(**kwargs)
        require(first == second, "diagnostic replay is not idempotent")
        require(repo.count_attempts() == 0, "diagnostic replay duplicated mastery evidence")

        attempt_kwargs = dict(
            operation_id="OP-M-R", attempt_id="A-M-R", learner_id="LR", course_id=course_id,
            item_id="M-STAB-1", response="STABLE", submitted_at=120,
        )
        a = engine.submit_attempt(**attempt_kwargs)
        b = engine.submit_attempt(**attempt_kwargs)
        require(a == b, "runtime evidence replay is not idempotent")
        require(repo.count_attempts() == 1, "runtime replay duplicated attempt")
        return {"novice_action": "LESSON", "diagnostic_replay_equal": True, "attempt_count_after_runtime_replay": 1}
    finally:
        td.cleanup()


def case_multisession_challenge_revalidation_and_recovery() -> Dict[str, Any]:
    td = tempfile.TemporaryDirectory()
    repo = Repository(os.path.join(td.name, "lab.sqlite3"))
    engine = AdaptiveLearningEngine(repo)
    try:
        created = engine.create_research_grounded_course_job(
            operation_id="OP-CREATE", job_id="JOB-CREATE", goal_id="G-GIT",
            title="Git feature branch workflow", desired_outcome=REAL_GIT_OUTCOME,
        )
        course_id = created["course_id"]
        director = MultiSessionDirector(repo, engine)

        director.start_session(operation_id="OP-S1", session_id="S1", learner_id="L", course_id=course_id, started_at=0)
        d1 = director.plan_next(operation_id="OP-D1", decision_id="D1", session_id="S1", learner_id="L", course_id=course_id, now=0)
        require(d1["next_action"]["action_type"] == "LESSON", "first session should begin with lesson")
        director.complete_session(operation_id="OP-S1-END", session_id="S1", ended_at=10)

        engine.submit_attempt(
            operation_id="OP-SM", attempt_id="A-SM", learner_id="L", course_id=course_id,
            item_id="M-GIT-STAGE-1", response="git add app.txt; git commit -m 'Feature work'", submitted_at=100,
        )
        engine.submit_attempt(
            operation_id="OP-SR", attempt_id="A-SR", learner_id="L", course_id=course_id,
            item_id="R-GIT-STAGE-1", response="git add later.txt; git commit -m 'Later work'", submitted_at=4000,
        )

        director.start_session(operation_id="OP-S2", session_id="S2", learner_id="L", course_id=course_id, started_at=4100)
        d2 = director.plan_next(operation_id="OP-D2", decision_id="D2", session_id="S2", learner_id="L", course_id=course_id, now=4100)
        require(d2["session_count"] == 2, "cross-session history was not durable")
        require(d2["next_action"]["skill_id"] == "S-GIT-BRANCH-MERGE", "second session did not continue at next competency")

        engine.submit_attempt(
            operation_id="OP-BM", attempt_id="A-BM", learner_id="L", course_id=course_id,
            item_id="M-GIT-BRANCH-1",
            response="git switch -c topic; git add change.txt; git commit -m 'Add change'; git switch main; git merge topic",
            submitted_at=5000,
        )
        engine.submit_attempt(
            operation_id="OP-BR", attempt_id="A-BR", learner_id="L", course_id=course_id,
            item_id="R-GIT-BRANCH-1",
            response="git switch -c fix; git add fix.txt; git commit -m 'Fix issue'; git switch main; git merge fix",
            submitted_at=9000,
        )
        challenge = engine.next_action("L", course_id, now=9000)
        require(challenge["action_type"] == "TRANSFER_CHECK", "retained learner must receive novel transfer challenge")
        task = engine.transfer_task(challenge["target_id"])
        transfer = engine.submit_transfer_attempt(
            operation_id="OP-T", attempt_id="A-T", learner_id="L", course_id=course_id,
            task_id=task["item_id"], response=task["answer"], submitted_at=9100,
        )
        require(transfer["projection"]["stage"] == "MASTERED", "transfer challenge did not close mastery")
        require(engine.next_action("L", course_id, now=9100)["action_type"] == "COURSE_COMPLETE", "challenge path did not return to progression")

        engine.submit_attempt(
            operation_id="OP-ST-M", attempt_id="A-ST-M", learner_id="L-ST", course_id=course_id,
            item_id="M-GIT-STAGE-1", response="git add app.txt; git commit -m 'Feature work'", submitted_at=100,
        )
        engine.submit_attempt(
            operation_id="OP-ST-R", attempt_id="A-ST-R", learner_id="L-ST", course_id=course_id,
            item_id="R-GIT-STAGE-1", response="git add later.txt; git commit -m 'Later work'", submitted_at=4000,
        )
        stale_now = 4000 + engine.RETENTION_FRESHNESS_SECONDS + 1
        stale = engine.next_action("L-ST", course_id, now=stale_now)
        require(stale["action_type"] == "MAINTENANCE_RECHECK", "stale evidence did not re-enter revalidation")

        director.start_session(operation_id="OP-SC", session_id="SC", learner_id="L-CR", course_id=course_id, started_at=0)
        crashed = False
        try:
            director.plan_next(
                operation_id="OP-DC", decision_id="DC", session_id="SC", learner_id="L-CR",
                course_id=course_id, now=0, crash_after_phase="ACTION_SELECTED",
            )
        except InjectedCrash:
            crashed = True
        require(crashed, "crash injection did not fire")
        recovered = director.plan_next(
            operation_id="OP-DC", decision_id="DC", session_id="SC", learner_id="L-CR",
            course_id=course_id, now=0,
        )
        require(recovered["next_action"]["action_type"] == "LESSON", "director did not recover deterministic action")

        return {
            "session_count": d2["session_count"],
            "continued_skill": d2["next_action"]["skill_id"],
            "challenge_action": challenge["action_type"],
            "post_challenge_action": "COURSE_COMPLETE",
            "stale_action": stale["action_type"],
            "crash_recovery_action": recovered["next_action"]["action_type"],
        }
    finally:
        td.cleanup()


def run_case(name: str, fn: Callable[[], Dict[str, Any]]) -> Dict[str, Any]:
    try:
        return {"status": "PASS", "details": fn()}
    except Exception as exc:
        return {
            "status": "FAIL",
            "error_type": type(exc).__name__,
            "error": str(exc),
            "traceback": traceback.format_exc(),
        }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output")
    args = parser.parse_args()

    cases = {
        "skip_ahead_closed_loop": run_case("skip_ahead_closed_loop", case_skip_ahead_closed_loop),
        "prerequisite_gap_repair_and_return": run_case("prerequisite_gap_repair_and_return", case_prerequisite_gap_repair_and_return),
        "novice_and_idempotent_replay": run_case("novice_and_idempotent_replay", case_novice_and_idempotent_replay),
        "multisession_challenge_revalidation_and_recovery": run_case(
            "multisession_challenge_revalidation_and_recovery",
            case_multisession_challenge_revalidation_and_recovery,
        ),
    }
    passed = sum(1 for value in cases.values() if value["status"] == "PASS")
    receipt = {
        "objective": OBJECTIVE,
        "status": "PASS" if passed == len(cases) else "FAIL",
        "passed_cases": passed,
        "total_cases": len(cases),
        "source_commit": os.environ.get("GITHUB_SHA"),
        "workflow_run_id": os.environ.get("GITHUB_RUN_ID"),
        "cases": cases,
        "truth_boundary": {
            "portable_closed_loop_behavior": "PROVEN" if passed == len(cases) else "NOT_PROVEN",
            "real_learner_effectiveness": "NOT_PROVEN",
            "psychometric_validity": "NOT_PROVEN",
            "production_system_master_integration": "NOT_PROVEN",
            "target_native_iphone_behavior": "NOT_PROVEN",
        },
    }
    rendered = json.dumps(receipt, indent=2, sort_keys=True)
    print(rendered)
    if args.output:
        os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as handle:
            handle.write(rendered + "\n")
    return 0 if receipt["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
