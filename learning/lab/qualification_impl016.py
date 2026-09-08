from __future__ import annotations

import argparse
import json
import os
import tempfile
from collections import Counter
from typing import Any, Dict, List, Tuple

from learning_lab import (
    AdaptiveEntryJourneyDirector,
    AdaptiveLearningEngine,
    BaselineDiagnosticDirector,
    InjectedCrash,
    MultiSessionDirector,
    REAL_GIT_OUTCOME,
    Repository,
    TutorDirector,
)

OBJECTIVE = "LEARNING-LAB-IMPL-016 — ADAPTIVE ENTRY PLAN EXECUTION + PREREQUISITE REMEDIATION / SKIP-AHEAD CONTINUITY SLICE"
CRASH_PHASES = ["SESSION_BOUND", "ACTIONS_COMPOSED", "DECISION_STORED_BEFORE_RETURN"]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def make_runtime():
    td = tempfile.TemporaryDirectory()
    repo = Repository(os.path.join(td.name, "lab.sqlite3"))
    engine = AdaptiveLearningEngine(repo)
    created = engine.create_research_grounded_course_job(
        operation_id="OP-CREATE",
        job_id="JOB-CREATE",
        goal_id="G-GIT",
        title="Git feature branch workflow",
        desired_outcome=REAL_GIT_OUTCOME,
    )
    course_id = created["course_id"]
    diagnostic = BaselineDiagnosticDirector(repo, scorer=engine.git_oracle.score)
    tutor = TutorDirector(repo, engine)
    sessions = MultiSessionDirector(repo, engine)
    journey = AdaptiveEntryJourneyDirector(repo, engine, diagnostic, tutor, sessions)
    return td, repo, engine, diagnostic, tutor, sessions, journey, course_id


def normalized_decision(result: Dict[str, Any]) -> Tuple[Any, ...]:
    action = result["next_action"]
    diagnostic = result["diagnostic_action"]
    runtime = result["runtime_action"]
    return (
        result["state"],
        result["selected_authority"],
        action.get("action_type"), action.get("target_id"), action.get("skill_id"),
        diagnostic.get("action_type"), diagnostic.get("target_id"), diagnostic.get("skill_id"),
        runtime.get("action_type"), runtime.get("target_id"), runtime.get("skill_id"),
    )


def crash_replay_campaign(iterations: int = 100) -> Dict[str, Any]:
    td, repo, engine, diagnostic, tutor, sessions, journey, course_id = make_runtime()
    phase_counts: Counter[str] = Counter()
    normalized: List[Tuple[Any, ...]] = []
    try:
        for i in range(iterations):
            learner = f"L-CR-{i}"
            jid = f"J-CR-{i}"
            did = f"D-CR-{i}"
            sid = f"S-CR-{i}"
            decision_id = f"DEC-CR-{i}"
            op = f"OP-DEC-CR-{i}"
            journey.start_journey(
                operation_id=f"OP-J-CR-{i}", journey_id=jid, diagnostic_id=did,
                learner_id=learner, course_id=course_id,
                claimed_skill_ids=["S-GIT-BRANCH-MERGE"], started_at=0,
            )
            sessions.start_session(
                operation_id=f"OP-S-CR-{i}", session_id=sid, learner_id=learner,
                course_id=course_id, started_at=0,
            )
            phase = CRASH_PHASES[i % len(CRASH_PHASES)]
            phase_counts[phase] += 1
            crashed = False
            try:
                journey.plan_next(
                    operation_id=op, decision_id=decision_id, journey_id=jid,
                    session_id=sid, now=10, crash_after_phase=phase,
                )
            except InjectedCrash:
                crashed = True
            require(crashed, f"crash injection did not fire at {phase}")
            recovered = journey.plan_next(
                operation_id=op, decision_id=decision_id, journey_id=jid,
                session_id=sid, now=10,
            )
            replayed = journey.plan_next(
                operation_id=op, decision_id=decision_id, journey_id=jid,
                session_id=sid, now=10,
            )
            require(recovered == replayed, "replay changed recovered decision")
            require(recovered["next_action"]["action_type"] == "DIAGNOSTIC_PROBE", "unexpected recovered action")
            require(recovered["next_action"]["skill_id"] == "S-GIT-STAGE-COMMIT", "hidden prerequisite order changed")
            require(repo.count_attempts() == 0, "adaptive entry orchestration minted mastery evidence")
            stored = repo.get_object("adaptive_entry_decision", decision_id, 1)
            if phase == "DECISION_STORED_BEFORE_RETURN":
                require(stored is not None, "durable decision missing after store crash")
                require(stored["result"] == recovered, "stored decision differs from recovered result")
            normalized.append(normalized_decision(recovered))
        unique = sorted(set(normalized), key=repr)
        require(len(unique) == 1, "crash recovery is not deterministic")
        return {
            "iterations": iterations,
            "phase_counts": dict(sorted(phase_counts.items())),
            "unique_normalized_results": len(unique),
            "attempts_created_by_orchestration": repo.count_attempts(),
            "status": "PASS",
        }
    finally:
        td.cleanup()


def deterministic_routing_campaign(iterations: int = 100) -> Dict[str, Any]:
    td, repo, engine, diagnostic, tutor, sessions, journey, course_id = make_runtime()
    normalized: List[Tuple[Any, ...]] = []
    try:
        for i in range(iterations):
            learner = f"L-DET-{i}"
            jid = f"J-DET-{i}"
            did = f"D-DET-{i}"
            sid = f"S-DET-{i}"
            journey.start_journey(
                operation_id=f"OP-J-DET-{i}", journey_id=jid, diagnostic_id=did,
                learner_id=learner, course_id=course_id,
                claimed_skill_ids=["S-GIT-BRANCH-MERGE"], started_at=0,
            )
            sessions.start_session(
                operation_id=f"OP-S-DET-{i}", session_id=sid, learner_id=learner,
                course_id=course_id, started_at=0,
            )
            result = journey.plan_next(
                operation_id=f"OP-D-DET-{i}", decision_id=f"DEC-DET-{i}",
                journey_id=jid, session_id=sid, now=10,
            )
            normalized.append(normalized_decision(result))
        unique = sorted(set(normalized), key=repr)
        require(len(unique) == 1, "same entry state produced non-deterministic routing")
        require(repo.count_attempts() == 0, "determinism campaign minted mastery evidence")
        return {
            "iterations": iterations,
            "unique_normalized_results": len(unique),
            "attempts_created_by_orchestration": repo.count_attempts(),
            "status": "PASS",
        }
    finally:
        td.cleanup()


def stale_override_case() -> Dict[str, Any]:
    td, repo, engine, diagnostic, tutor, sessions, journey, course_id = make_runtime()
    try:
        journey.start_journey(
            operation_id="OP-J", journey_id="J", diagnostic_id="D", learner_id="L",
            course_id=course_id, claimed_skill_ids=["S-GIT-BRANCH-MERGE"], started_at=0,
        )
        sessions.start_session(
            operation_id="OP-S", session_id="S", learner_id="L", course_id=course_id, started_at=0,
        )
        journey.record_diagnostic_probe(
            journey_id="J", now=10, operation_id="OP-P", probe_id="DP", diagnostic_id="D",
            item_id="P-GIT-STAGE-1", response="git add notes.txt", submitted_at=10,
        )
        engine.submit_attempt(
            operation_id="OP-M", attempt_id="A-M", learner_id="L", course_id=course_id,
            item_id="M-GIT-STAGE-1", response="git add app.txt; git commit -m 'Feature work'", submitted_at=120,
        )
        engine.submit_attempt(
            operation_id="OP-R", attempt_id="A-R", learner_id="L", course_id=course_id,
            item_id="R-GIT-STAGE-1", response="git add later.txt; git commit -m 'Later work'", submitted_at=4000,
        )
        fresh = journey.plan_next(
            operation_id="OP-FRESH", decision_id="DEC-FRESH", journey_id="J", session_id="S", now=4100,
        )
        require(fresh["next_action"]["action_type"] == "DIAGNOSTIC_PROBE", "downstream diagnostic did not resume while prerequisite current")
        stale_now = 4000 + engine.RETENTION_FRESHNESS_SECONDS + 1
        stale = journey.plan_next(
            operation_id="OP-STALE", decision_id="DEC-STALE", journey_id="J", session_id="S", now=stale_now,
        )
        require(stale["diagnostic_action"]["action_type"] == "DIAGNOSTIC_PROBE", "case did not preserve competing downstream diagnostic route")
        require(stale["next_action"]["action_type"] == "MAINTENANCE_RECHECK", "stale prerequisite failed to override placement shortcut")
        require(stale["selected_authority"] == "LEARNING_ENGINE_CURRENT_EVIDENCE", "wrong authority won stale conflict")
        return {
            "fresh_action": fresh["next_action"]["action_type"],
            "stale_diagnostic_action": stale["diagnostic_action"]["action_type"],
            "selected_stale_action": stale["next_action"]["action_type"],
            "selected_authority": stale["selected_authority"],
            "status": "PASS",
        }
    finally:
        td.cleanup()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--iterations", type=int, default=100)
    args = parser.parse_args()
    receipt = {
        "objective": OBJECTIVE,
        "crash_replay_campaign": crash_replay_campaign(args.iterations),
        "deterministic_routing_campaign": deterministic_routing_campaign(args.iterations),
        "stale_override_case": stale_override_case(),
        "truth_boundary": {
            "portable_adaptive_entry_continuity": "PROVEN_IF_STATUS_PASS",
            "production_system_master_integration": "NOT_PROVEN",
            "target_native_iphone_behavior": "NOT_PROVEN",
            "real_learner_effectiveness": "NOT_PROVEN",
            "psychometric_validity": "NOT_PROVEN",
        },
    }
    receipt["status"] = "PASS"
    with open(args.output, "w", encoding="utf-8") as fh:
        json.dump(receipt, fh, indent=2, sort_keys=True)
    print(json.dumps(receipt, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
