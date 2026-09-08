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


def run_tests():
    env = dict(os.environ)
    env["PYTHONPATH"] = str(ROOT)
    proc = subprocess.run([sys.executable, "-m", "unittest", "discover", "-s", str(ROOT / "tests"), "-v"], cwd=ROOT, env=env, capture_output=True, text=True)
    output = proc.stdout + proc.stderr
    (ROOT / "evidence").mkdir(exist_ok=True)
    (ROOT / "evidence" / "test_output_impl004.txt").write_text(output, encoding="utf-8")
    return proc.returncode, output.count(" ... ok"), output


def compile_all():
    files = sorted(p for p in ROOT.rglob("*.py") if "__pycache__" not in p.parts)
    errors = []
    for p in files:
        try:
            py_compile.compile(str(p), doraise=True)
        except Exception as exc:
            errors.append(f"{p.relative_to(ROOT)}:{exc}")
    return files, errors


def build(path: str):
    from learning_lab import AdaptiveLearningEngine, MultiSessionDirector, REAL_GIT_OUTCOME, Repository
    repo = Repository(path)
    engine = AdaptiveLearningEngine(repo)
    created = engine.create_research_grounded_course_job(
        operation_id="OP-CREATE", job_id="JOB-CREATE", goal_id="G-GIT",
        title="Git feature branch workflow", desired_outcome=REAL_GIT_OUTCOME,
    )
    return repo, engine, MultiSessionDirector(repo, engine), created


def stage_mastered(engine, course_id, learner="L", prefix="X", t0=100):
    engine.submit_attempt(operation_id=f"OP-{prefix}-SM", attempt_id=f"A-{prefix}-SM", learner_id=learner, course_id=course_id, item_id="M-GIT-STAGE-1", response="git add app.txt; git commit -m 'Feature work'", submitted_at=t0)
    return engine.submit_attempt(operation_id=f"OP-{prefix}-SR", attempt_id=f"A-{prefix}-SR", learner_id=learner, course_id=course_id, item_id="R-GIT-STAGE-1", response="git add later.txt; git commit -m 'Later work'", submitted_at=t0 + 3900)


def branch_retained(engine, course_id, learner="L", prefix="X", t0=5000):
    engine.submit_attempt(operation_id=f"OP-{prefix}-BM", attempt_id=f"A-{prefix}-BM", learner_id=learner, course_id=course_id, item_id="M-GIT-BRANCH-1", response="git switch -c topic; git add change.txt; git commit -m 'Add change'; git switch main; git merge topic", submitted_at=t0)
    return engine.submit_attempt(operation_id=f"OP-{prefix}-BR", attempt_id=f"A-{prefix}-BR", learner_id=learner, course_id=course_id, item_id="R-GIT-BRANCH-1", response="git switch -c fix; git add fix.txt; git commit -m 'Fix issue'; git switch main; git merge fix", submitted_at=t0 + 4000)


def full_retained(engine, course_id, learner="L", prefix="X"):
    stage_mastered(engine, course_id, learner, prefix)
    return branch_retained(engine, course_id, learner, prefix)


def run_demo():
    with tempfile.TemporaryDirectory() as td:
        repo, engine, director, created = build(os.path.join(td, "demo.sqlite3"))
        cid = created["course_id"]
        director.start_session(operation_id="OP-S1", session_id="S1", learner_id="L", course_id=cid, started_at=0)
        first = director.plan_next(operation_id="OP-D1", decision_id="D1", session_id="S1", learner_id="L", course_id=cid, now=0)
        director.complete_session(operation_id="OP-S1E", session_id="S1", ended_at=10)
        stage_mastered(engine, cid, prefix="D")
        branch = branch_retained(engine, cid, prefix="D")
        director.start_session(operation_id="OP-S2", session_id="S2", learner_id="L", course_id=cid, started_at=9000)
        retained = director.plan_next(operation_id="OP-D2", decision_id="D2", session_id="S2", learner_id="L", course_id=cid, now=9000)
        transfer_task = engine.transfer_task(retained["next_action"]["target_id"])
        transfer = engine.submit_transfer_attempt(operation_id="OP-T1", attempt_id="A-T1", learner_id="L", course_id=cid, task_id=transfer_task["item_id"], response=transfer_task["answer"], submitted_at=9100)
        complete = engine.next_action("L", cid, now=9100)
        stale_now = 9100 + engine.RETENTION_FRESHNESS_SECONDS + 100
        stale = engine.next_action("L", cid, now=stale_now)
        sm = engine.maintenance_task("MN-GIT-STAGE-2")
        engine.submit_maintenance_attempt(operation_id="OP-SMN", attempt_id="A-SMN", learner_id="L", course_id=cid, task_id=sm["item_id"], response=sm["answer"], submitted_at=stale_now)
        bm = engine.maintenance_task("MN-GIT-BRANCH-2")
        branch_revalidated = engine.submit_maintenance_attempt(operation_id="OP-BMN", attempt_id="A-BMN", learner_id="L", course_id=cid, task_id=bm["item_id"], response=bm["answer"], submitted_at=stale_now + 10)
        next_transfer = engine.next_action("L", cid, now=stale_now + 10)
        t2 = engine.transfer_task(next_transfer["target_id"])
        final_transfer = engine.submit_transfer_attempt(operation_id="OP-T2", attempt_id="A-T2", learner_id="L", course_id=cid, task_id=t2["item_id"], response=t2["answer"], submitted_at=stale_now + 20)
        final = engine.next_action("L", cid, now=stale_now + 20)
        passed = (
            first["next_action"]["action_type"] == "LESSON"
            and branch["projection"]["stage"] == "RETAINED"
            and retained["next_action"]["action_type"] == "TRANSFER_CHECK"
            and transfer["projection"]["stage"] == "MASTERED"
            and complete["action_type"] == "COURSE_COMPLETE"
            and stale["action_type"] == "MAINTENANCE_RECHECK"
            and branch_revalidated["projection"]["stage"] == "RETAINED"
            and next_transfer["target_id"] == "T-GIT-TRANSFER-INTEGRATION"
            and final_transfer["projection"]["stage"] == "MASTERED"
            and final["action_type"] == "COURSE_COMPLETE"
        )
        return {
            "pass": passed, "session_1": first, "retained_branch": branch,
            "session_2": retained, "first_transfer": transfer, "course_complete": complete,
            "stale_action": stale, "branch_after_revalidation": branch_revalidated,
            "fresh_transfer_action": next_transfer, "final_transfer": final_transfer, "final_action": final,
            "session_count": len(repo.sessions_for_learner("L", cid)),
        }


def deterministic_run():
    snapshots = []
    for _ in range(2):
        with tempfile.TemporaryDirectory() as td:
            repo, engine, director, created = build(os.path.join(td, "det.sqlite3"))
            cid = created["course_id"]
            stage_mastered(engine, cid, prefix="DET")
            branch_retained(engine, cid, prefix="DET")
            director.start_session(operation_id="OP-S", session_id="S", learner_id="L", course_id=cid, started_at=9000)
            d = director.plan_next(operation_id="OP-D", decision_id="D", session_id="S", learner_id="L", course_id=cid, now=9000)
            snapshots.append(d)
    raw = json.dumps(snapshots[0], sort_keys=True, separators=(",", ":"))
    return snapshots[0] == snapshots[1], hashlib.sha256(raw.encode()).hexdigest()


def mutation_campaign():
    from learning_lab import TutorDirector
    cases = {}
    with tempfile.TemporaryDirectory() as td:
        repo, engine, director, created = build(os.path.join(td, "mut.sqlite3"))
        cid = created["course_id"]
        full_retained(engine, cid, prefix="M")
        p = engine.current_projection("L", cid, "S-GIT-BRANCH-MERGE", now=9000)
        cases["retention_not_transfer"] = p["stage"] == "RETAINED" and p["gate_states"]["TRANSFER"] == "IN_PROGRESS"
        task = engine.transfer_task("T-GIT-TRANSFER-RELEASE")
        assisted = engine.submit_transfer_attempt(operation_id="OP-AT", attempt_id="A-AT", learner_id="L", course_id=cid, task_id=task["item_id"], response=task["answer"], submitted_at=9100, assisted=True)
        cases["assisted_transfer_rejected_as_evidence"] = assisted["projection"]["stage"] == "RETAINED" and "A-AT" in assisted["projection"]["excluded_attempts"]
        cases["compromised_family_forces_new_family"] = engine.next_action("L", cid, now=9100)["target_id"] == "T-GIT-TRANSFER-INTEGRATION"

    with tempfile.TemporaryDirectory() as td:
        repo, engine, director, created = build(os.path.join(td, "mut2.sqlite3")); cid=created["course_id"]
        stage_mastered(engine, cid, prefix="N")
        now = 4000 + engine.RETENTION_FRESHNESS_SECONDS + 1
        repeated = engine.submit_attempt(operation_id="OP-RR", attempt_id="A-RR", learner_id="L", course_id=cid, item_id="R-GIT-STAGE-1", response="git add later.txt; git commit -m 'Later work'", submitted_at=now)
        cases["same_retention_family_cannot_refresh"] = repeated["projection"]["stage"] == "REVALIDATION_DUE"
        tutor = TutorDirector(repo, engine)
        stale_block = tutor.process_turn(operation_id="OP-ST", turn_id="ST", session_id="ST", learner_id="L", course_id=cid, skill_id="S-GIT-BRANCH-MERGE", probe_id="TP-BRANCH-1", response="git switch -c hotfix", requested_help_level=0, now=now)
        cases["stale_prerequisite_blocks_tutor"] = stale_block["teaching_move"]["move"] == "PREREQUISITE_BLOCKED"
        mt = engine.maintenance_task("MN-GIT-STAGE-2")
        assisted_m = engine.submit_maintenance_attempt(operation_id="OP-AM", attempt_id="A-AM", learner_id="L", course_id=cid, task_id=mt["item_id"], response=mt["answer"], submitted_at=now, assisted=True)
        cases["assisted_maintenance_cannot_refresh"] = assisted_m["projection"]["stage"] == "REVALIDATION_DUE"

    with tempfile.TemporaryDirectory() as td:
        repo, engine, director, created = build(os.path.join(td, "mut3.sqlite3")); cid=created["course_id"]
        engine.submit_attempt(operation_id="OP-M", attempt_id="A-M", learner_id="L", course_id=cid, item_id="M-GIT-STAGE-1", response="git add app.txt; git commit -m 'Feature work'", submitted_at=100)
        cases["early_retention_wait"] = engine.next_action("L", cid, now=200)["action_type"] == "RETENTION_WAIT"
        try:
            t = engine.transfer_task("T-GIT-TRANSFER-RELEASE")
            engine.submit_transfer_attempt(operation_id="OP-E", attempt_id="A-E", learner_id="L", course_id=cid, task_id=t["item_id"], response=t["answer"], submitted_at=300)
            cases["transfer_before_retention_blocked"] = False
        except ValueError:
            cases["transfer_before_retention_blocked"] = True

    with tempfile.TemporaryDirectory() as td:
        repo, engine, director, created = build(os.path.join(td, "mut4.sqlite3")); cid=created["course_id"]
        full_retained(engine, cid, prefix="Q")
        t = engine.transfer_task("T-GIT-TRANSFER-RELEASE")
        bad = engine.submit_transfer_attempt(operation_id="OP-B", attempt_id="A-B", learner_id="L", course_id=cid, task_id=t["item_id"], response="git merge urgent", submitted_at=9100)
        retry = engine.submit_transfer_attempt(operation_id="OP-B2", attempt_id="A-B2", learner_id="L", course_id=cid, task_id=t["item_id"], response=t["answer"], submitted_at=9200)
        cases["failed_transfer_family_reuse_blocked"] = bad["projection"]["stage"] == "RETAINED" and retry["projection"]["stage"] == "RETAINED"
        tutor = TutorDirector(repo, engine)
        boundary = tutor.process_turn(operation_id="OP-TB", turn_id="TB", session_id="TB", learner_id="L", course_id=cid, skill_id="S-GIT-BRANCH-MERGE", probe_id=None, response="hint", requested_help_level=3, now=9300, active_assessment_item_id="T-GIT-TRANSFER-INTEGRATION")
        cases["transfer_help_boundary"] = boundary["teaching_move"]["move"] == "ASSESSMENT_INTEGRITY_BOUNDARY"

    with tempfile.TemporaryDirectory() as td:
        repo, engine, director, created = build(os.path.join(td, "mut5.sqlite3")); cid=created["course_id"]
        try:
            director.plan_next(operation_id="OP-D", decision_id="D", session_id="MISSING", learner_id="L", course_id=cid, now=0)
            cases["director_requires_session"] = False
        except ValueError:
            cases["director_requires_session"] = True
        director.start_session(operation_id="OP-S", session_id="S", learner_id="L", course_id=cid, started_at=0)
        one = director.plan_next(operation_id="OP-D2", decision_id="D2", session_id="S", learner_id="L", course_id=cid, now=1)
        two = director.plan_next(operation_id="OP-D2", decision_id="D2", session_id="S", learner_id="L", course_id=cid, now=1)
        cases["director_idempotent_replay"] = one == two and repo.count_director_decisions() == 1
        claims = set(c["claim_id"] for c in repo.get_object("research_dossier", "RSCH-GIT-FEATURE-WORKFLOW-001", 1)["claims"])
        cases["transfer_claims_grounded"] = all(set(engine.transfer_task(t)["claim_refs"]).issubset(claims) for t in ("T-GIT-TRANSFER-RELEASE", "T-GIT-TRANSFER-INTEGRATION"))

    return {"pass": all(cases.values()), "cases": cases, "passed": sum(cases.values()), "total": len(cases)}


def stress_campaign(runs=100):
    import sqlite3
    from learning_lab import InjectedCrash, Repository, AdaptiveLearningEngine, MultiSessionDirector
    phases = ["SESSION_BOUND", "PROJECTION_SNAPSHOTTED", "ACTION_SELECTED", "DECISION_COMPLETED_BEFORE_RETURN"]
    passes = 0
    phase_counts = {p: 0 for p in phases}
    result_digests = set()
    with tempfile.TemporaryDirectory() as seed_td:
        seed_path = os.path.join(seed_td, "seed.sqlite3")
        seed_repo, seed_engine, seed_director, seed_created = build(seed_path)
        seed_director.start_session(operation_id="OP-S", session_id="S", learner_id="L", course_id=seed_created["course_id"], started_at=0)
        for i in range(runs):
            phase = phases[i % len(phases)]
            with tempfile.TemporaryDirectory() as td:
                path = os.path.join(td, "stress.sqlite3")
                src = sqlite3.connect(seed_path)
                dst = sqlite3.connect(path)
                src.backup(dst)
                dst.close(); src.close()
                repo = Repository(path)
                engine = AdaptiveLearningEngine(repo)
                director = MultiSessionDirector(repo, engine)
                kwargs = dict(operation_id="OP-D", decision_id="D", session_id="S", learner_id="L", course_id=seed_created["course_id"], now=1)
                try:
                    director.plan_next(**kwargs, crash_after_phase=phase)
                    continue
                except InjectedCrash:
                    pass
                repo2 = Repository(path)
                engine2 = AdaptiveLearningEngine(repo2)
                director2 = MultiSessionDirector(repo2, engine2)
                out = director2.plan_next(**kwargs)
                replay = director2.plan_next(**kwargs)
                ok = out == replay and repo2.count_director_decisions() == 1
                if ok:
                    passes += 1
                    phase_counts[phase] += 1
                    result_digests.add(hashlib.sha256(json.dumps(out, sort_keys=True).encode()).hexdigest())
    return {"pass": passes == runs and len(result_digests) == 1, "runs": runs, "passes": passes, "phase_passes": phase_counts, "unique_result_digests": len(result_digests), "result_digest": next(iter(result_digests)) if result_digests else None}

def task_oracles():
    with tempfile.TemporaryDirectory() as td:
        _, engine, _, _ = build(os.path.join(td, "oracle.sqlite3"))
        transfer = {tid: engine.git_oracle.score(engine.transfer_task(tid), engine.transfer_task(tid)["answer"]) for tid in ("T-GIT-TRANSFER-RELEASE", "T-GIT-TRANSFER-INTEGRATION")}
        maintenance = {tid: engine.git_oracle.score(engine.maintenance_task(tid), engine.maintenance_task(tid)["answer"]) for tid in ("MN-GIT-STAGE-2", "MN-GIT-BRANCH-2")}
        return {"pass": all(transfer.values()) and all(maintenance.values()), "transfer": transfer, "maintenance": maintenance}


def main():
    rc, passed_tests, test_output = run_tests()
    pyfiles, compile_errors = compile_all()
    demo = run_demo()
    deterministic, det_digest = deterministic_run()
    mutations = mutation_campaign()
    oracles = task_oracles()
    stress = stress_campaign(100)
    receipt = {
        "objective": "LEARNING-LAB-IMPL-004",
        "status": "PASS_PORTABLE_IMPLEMENTATION" if all([rc == 0, not compile_errors, demo["pass"], deterministic, mutations["pass"], oracles["pass"], stress["pass"]]) else "FAIL",
        "tests": {"passed": passed_tests, "expected": 79, "returncode": rc},
        "python_compile": {"files": len(pyfiles), "errors": compile_errors},
        "demo": demo,
        "determinism": {"pass": deterministic, "digest": det_digest},
        "mutation_campaign": mutations,
        "task_oracles": oracles,
        "stress": stress,
        "truth_boundary": {
            "retention_delay_and_freshness": "LAB_POLICY_FIXTURE_NOT_SCIENTIFICALLY_CALIBRATED",
            "transfer": "BOUNDED_GIT_NEAR_TRANSFER_EXECUTABLE_PROOF_ONLY",
            "real_learner_effectiveness": "NOT_PROVEN",
            "native_iphone": "NOT_RUN",
            "production_integration": "NOT_RUN",
        },
    }
    (ROOT / "evidence" / "qualification_receipt_impl004.json").write_text(json.dumps(receipt, indent=2, sort_keys=True), encoding="utf-8")
    (ROOT / "evidence" / "multisession_demo.json").write_text(json.dumps(demo, indent=2, sort_keys=True), encoding="utf-8")
    (ROOT / "evidence" / "multisession_mutation_campaign.json").write_text(json.dumps(mutations, indent=2, sort_keys=True), encoding="utf-8")
    (ROOT / "evidence" / "multisession_stress_campaign.json").write_text(json.dumps(stress, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(receipt, indent=2, sort_keys=True))
    return 0 if receipt["status"].startswith("PASS") else 1


if __name__ == "__main__":
    raise SystemExit(main())
