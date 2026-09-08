from __future__ import annotations

import copy
import hashlib
import json
import os
import py_compile
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
GOAL = "Query a SQLite tasks table with SELECT, filter rows with WHERE, and sort results with ORDER BY."
BUNDLE_PATH = ROOT / "sources" / "OPEN_GOAL_SQLITE_QUERY_FUNDAMENTALS_V1.json"


def load_bundle():
    return json.loads(BUNDLE_PATH.read_text(encoding="utf-8"))


def run_tests():
    env = dict(os.environ)
    env["PYTHONPATH"] = str(ROOT)
    proc = subprocess.run(
        [sys.executable, "-m", "unittest", "discover", "-s", str(ROOT / "tests"), "-v"],
        cwd=ROOT, env=env, capture_output=True, text=True,
    )
    output = proc.stdout + proc.stderr
    (ROOT / "evidence").mkdir(exist_ok=True)
    (ROOT / "evidence" / "test_output_impl006.txt").write_text(output, encoding="utf-8")
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


def make_engine(path, bundle=True):
    from learning_lab import OpenGoalLearningEngine, Repository, RuntimeResearchCorpus
    corpus = RuntimeResearchCorpus([load_bundle()] if bundle else [])
    repo = Repository(path)
    return repo, OpenGoalLearningEngine(repo, corpus=corpus)


def build_open(path, goal_id="G-SQL", op="OP-SQL", job="JOB-SQL"):
    repo, engine = make_engine(path)
    created = engine.create_open_goal_course_job(
        operation_id=op, job_id=job, goal_id=goal_id,
        title="SQLite query fundamentals", desired_outcome=GOAL,
    )
    return repo, engine, created


def master_where(engine, cid, learner="L", prefix="W", t0=100):
    engine.submit_attempt(
        operation_id=f"OP-{prefix}-M", attempt_id=f"A-{prefix}-M", learner_id=learner,
        course_id=cid, item_id="M-SQL-WHERE-1",
        response="SELECT title, priority FROM tasks WHERE owner = 'Ava'", submitted_at=t0,
    )
    return engine.submit_attempt(
        operation_id=f"OP-{prefix}-R", attempt_id=f"A-{prefix}-R", learner_id=learner,
        course_id=cid, item_id="R-SQL-WHERE-1",
        response="SELECT title, owner FROM tasks WHERE priority <= 1", submitted_at=t0 + 3900,
    )


def retain_order(engine, cid, learner="L", prefix="O", t0=5000):
    engine.submit_attempt(
        operation_id=f"OP-{prefix}-M", attempt_id=f"A-{prefix}-M", learner_id=learner,
        course_id=cid, item_id="M-SQL-ORDER-1",
        response="SELECT title, owner, priority FROM tasks WHERE done = 0 ORDER BY priority ASC, owner ASC, title ASC",
        submitted_at=t0,
    )
    return engine.submit_attempt(
        operation_id=f"OP-{prefix}-R", attempt_id=f"A-{prefix}-R", learner_id=learner,
        course_id=cid, item_id="R-SQL-ORDER-1",
        response="SELECT title, priority FROM tasks WHERE priority >= 2 ORDER BY priority DESC, title DESC",
        submitted_at=t0 + 4000,
    )


def full_open_goal_demo():
    from learning_lab import OpenGoalTutorDirector
    with tempfile.TemporaryDirectory() as td:
        repo, engine = make_engine(os.path.join(td, "open.sqlite3"), bundle=False)
        initial_domains = list(engine.registry.domain_keys)
        engine.corpus.add_bundle(load_bundle())
        after_bundle_domains = list(engine.registry.domain_keys)
        created = engine.create_open_goal_course_job(
            operation_id="OP-CREATE", job_id="JOB-CREATE", goal_id="G-SQL-DEMO",
            title="SQLite query fundamentals", desired_outcome=GOAL,
        )
        cid = created["course_id"]
        after_compile_domains = list(engine.registry.domain_keys)
        first = engine.next_action("L", cid, now=0)
        tutor = OpenGoalTutorDirector(repo, engine)
        h1 = tutor.process_turn(
            operation_id="OP-T1", turn_id="T1", session_id="TS", learner_id="L", course_id=cid,
            skill_id="S-SQL-SELECT-WHERE", probe_id="TP-SQL-WHERE-1",
            response="SELECT title FROM tasks", requested_help_level=3, now=1,
        )
        h2 = tutor.process_turn(
            operation_id="OP-T2", turn_id="T2", session_id="TS", learner_id="L", course_id=cid,
            skill_id="S-SQL-SELECT-WHERE", probe_id="TP-SQL-WHERE-2",
            response="SELECT owner FROM tasks", requested_help_level=3, now=2,
        )
        recheck = tutor.process_turn(
            operation_id="OP-T3", turn_id="T3", session_id="TS", learner_id="L", course_id=cid,
            skill_id="S-SQL-SELECT-WHERE", probe_id="TP-SQL-WHERE-2",
            response="SELECT owner FROM tasks WHERE priority >= 2", requested_help_level=0, now=3,
        )
        master_where(engine, cid, prefix="D-W")
        retained = retain_order(engine, cid, prefix="D-O")
        action = engine.next_action("L", cid, now=9000)
        task = engine.transfer_task(action["target_id"])
        transfer = engine.submit_transfer_attempt(
            operation_id="OP-TR", attempt_id="A-TR", learner_id="L", course_id=cid,
            task_id=task["item_id"], response=task["answer"], submitted_at=9100,
        )
        final = engine.next_action("L", cid, now=9100)
        val = repo.get_object("course_validation", created["validation_id"], 1)
        dossier = repo.get_object("research_dossier", created["research_dossier_id"], 1)
        passed = all([
            initial_domains == ["fractions-unlike-denominators", "git-feature-branch-workflow"],
            after_bundle_domains == initial_domains,
            "sqlite-query-fundamentals" in after_compile_domains,
            first["action_type"] == "LESSON",
            h1["diagnosis"]["standing"] == "TEACHING_HYPOTHESIS",
            h2["diagnosis"]["standing"] == "EVIDENCE_SUPPORTED",
            recheck["teaching_move"]["move"] == "INDEPENDENT_RECHECK_PASSED",
            retained["projection"]["stage"] == "RETAINED",
            action["action_type"] == "TRANSFER_CHECK",
            transfer["projection"]["stage"] == "MASTERED",
            final["action_type"] == "COURSE_COMPLETE",
            val["grounding"]["status"] == "PASS",
            val["domain_behavior_oracle"]["status"] == "PASS",
            val["lesson_behavior_oracle"]["status"] == "PASS",
            len(dossier["sources"]) == 2 and len(dossier["claims"]) == 6,
        ])
        return {
            "pass": passed,
            "initial_domains": initial_domains,
            "after_runtime_bundle_domains": after_bundle_domains,
            "after_compile_domains": after_compile_domains,
            "created": created,
            "first_action": first,
            "hypothesis_standing": h1["diagnosis"]["standing"],
            "confirmed_standing": h2["diagnosis"]["standing"],
            "recheck_move": recheck["teaching_move"]["move"],
            "retained_stage": retained["projection"]["stage"],
            "transfer_stage": transfer["projection"]["stage"],
            "final_action": final["action_type"],
            "sources": len(dossier["sources"]),
            "claims": len(dossier["claims"]),
            "validation_status": created["validation_status"],
        }


def _expect_build_failure(bundle, contains):
    from learning_lab import OpenGoalLearningEngine, Repository, RuntimeResearchCorpus
    with tempfile.TemporaryDirectory() as td:
        e = OpenGoalLearningEngine(Repository(os.path.join(td, "x.sqlite3")), corpus=RuntimeResearchCorpus([bundle]))
        try:
            e.create_open_goal_course_job(operation_id="OP", job_id="JOB", goal_id="G", title="SQL", desired_outcome=GOAL)
            return False
        except ValueError as exc:
            return contains in str(exc)


def mutation_campaign():
    from learning_lab import OpenGoalLearningEngine, OpenGoalTutorDirector, Repository, RuntimeResearchCorpus
    from learning_lab.engine import InjectedCrash
    from learning_lab.open_goal import BoundedGoalInterpreter
    cases = {}
    base = load_bundle()

    with tempfile.TemporaryDirectory() as td:
        e = OpenGoalLearningEngine(Repository(os.path.join(td, "u.sqlite3")), corpus=RuntimeResearchCorpus([base]))
        try:
            e.create_open_goal_course_job(operation_id="O", job_id="J", goal_id="G", title="X", desired_outcome="Learn French pronunciation")
            cases["unsupported_goal_abstains"] = False
        except ValueError as ex:
            cases["unsupported_goal_abstains"] = "OPEN_GOAL_UNSUPPORTED" in str(ex)

    a = copy.deepcopy(base); b = copy.deepcopy(base); a["bundle_id"]="A"; b["bundle_id"]="B"; b["domain_key"]="other"
    try:
        BoundedGoalInterpreter().interpret(GOAL, RuntimeResearchCorpus([a,b])); cases["ambiguous_research_abstains"] = False
    except ValueError as ex:
        cases["ambiguous_research_abstains"] = "AMBIGUOUS" in str(ex)

    no_sources = copy.deepcopy(base)
    for s in no_sources["sources"]: s["standing"]="REJECTED"
    cases["unadmitted_sources_blocked"] = _expect_build_failure(no_sources, "NO_ADMISSIBLE_SOURCES")

    wrong_key = copy.deepcopy(base)
    next(x for x in wrong_key["course_blueprint"]["items"] if x["item_id"]=="M-SQL-WHERE-1")["answer"] = "SELECT title, priority FROM tasks WHERE owner = 'Ben'"
    cases["wrong_answer_key_blocked"] = _expect_build_failure(wrong_key, "DOMAIN_BEHAVIOR_ORACLE_FAILED")

    bad_example = copy.deepcopy(base)
    ex = bad_example["course_blueprint"]["lessons"][0]["worked_examples"][0]
    ex["text"] = "`SELECT title FROM tasks WHERE done = 1` returns the titles of incomplete tasks."
    cases["wrong_worked_example_blocked"] = _expect_build_failure(bad_example, "LESSON_BEHAVIOR_ORACLE_FAILED")

    bad_claim = copy.deepcopy(base)
    next(x for x in bad_claim["course_blueprint"]["items"] if x["item_id"]=="P-SQL-WHERE-1")["claim_refs"] = ["CL-BOGUS"]
    cases["unknown_claim_blocked"] = _expect_build_failure(bad_claim, "OPEN_GOAL_BLUEPRINT_UNKNOWN_CLAIM")

    leak = copy.deepcopy(base)
    p = next(x for x in leak["course_blueprint"]["items"] if x["item_id"]=="P-SQL-WHERE-1")
    m = next(x for x in leak["course_blueprint"]["items"] if x["item_id"]=="M-SQL-WHERE-1")
    m["family_id"] = p["family_id"]
    cases["practice_mastery_family_leak_blocked"] = _expect_build_failure(leak, "INSTRUCTIONAL_VALIDATION_FAILED")

    cycle = copy.deepcopy(base)
    cycle["course_blueprint"]["skills"][0]["hard_prerequisite_skill_ids"] = ["S-SQL-ORDER"]
    cases["hard_prerequisite_cycle_blocked"] = _expect_build_failure(cycle, "InvalidPrerequisiteGraph")

    bad_oracle = copy.deepcopy(base); bad_oracle["oracle_descriptor"]["type"] = "MAGIC"
    cases["unsupported_oracle_blocked"] = _expect_build_failure(bad_oracle, "UNSUPPORTED_OPEN_GOAL_ORACLE")

    with tempfile.TemporaryDirectory() as td:
        repo, e, created = build_open(os.path.join(td,"runtime.sqlite3")); cid=created["course_id"]
        eq = e.submit_attempt(operation_id="OE",attempt_id="AE",learner_id="L",course_id=cid,item_id="M-SQL-WHERE-1",response="select title,priority from tasks where 'Ava'=owner",submitted_at=1)
        bad = e.submit_attempt(operation_id="OB",attempt_id="AB",learner_id="L2",course_id=cid,item_id="M-SQL-WHERE-1",response="DELETE FROM tasks",submitted_at=1)
        cases["equivalent_sql_accepted"] = eq["attempt"]["correct"]
        cases["non_select_rejected"] = not bad["attempt"]["correct"]
        tutor=OpenGoalTutorDirector(repo,e)
        t1=tutor.process_turn(operation_id="OT1",turn_id="T1",session_id="S",learner_id="LT",course_id=cid,skill_id="S-SQL-SELECT-WHERE",probe_id="TP-SQL-WHERE-1",response="SELECT title FROM tasks",requested_help_level=3,now=1)
        t2=tutor.process_turn(operation_id="OT2",turn_id="T2",session_id="S",learner_id="LT",course_id=cid,skill_id="S-SQL-SELECT-WHERE",probe_id="TP-SQL-WHERE-2",response="SELECT owner FROM tasks",requested_help_level=3,now=2)
        spec=e._spec_for_course(cid); ctx=tutor._context(session_id="S",learner_id="LT",course_id=cid,skill_id="S-SQL-SELECT-WHERE",probe=spec.tutor_probes["TP-SQL-WHERE-1"],active_item=None); text=json.dumps(ctx).lower()
        cases["single_error_hypothesis"] = t1["diagnosis"]["standing"]=="TEACHING_HYPOTHESIS"
        cases["distinct_family_corroborates"] = t2["diagnosis"]["standing"]=="EVIDENCE_SUPPORTED"
        cases["overhelping_capped"] = t1["teaching_move"]["support_level_after"]<=1 and t1["teaching_move"]["overhelping_prevented"]
        cases["tutor_gold_stripped"] = all(x not in text for x in ('"answer"','oracle_spec','error_rules'))
        master_where(e,cid,learner="LX",prefix="MX")
        retain_order(e,cid,learner="LX",prefix="OX")
        task=e.transfer_task("T-SQL-TRANSFER-BACKLOG")
        assisted=e.submit_transfer_attempt(operation_id="OA",attempt_id="AA",learner_id="LX",course_id=cid,task_id=task["item_id"],response=task["answer"],submitted_at=9100,assisted=True)
        cases["assisted_transfer_not_mastery"] = assisted["projection"]["stage"]=="RETAINED"
        cases["compromised_transfer_family_not_reused"] = e.next_action("LX",cid,now=9100)["target_id"]=="T-SQL-TRANSFER-TRIAGE"

    with tempfile.TemporaryDirectory() as td:
        path=os.path.join(td,"drift.sqlite3")
        e=OpenGoalLearningEngine(Repository(path), corpus=RuntimeResearchCorpus([base]))
        try:
            e.create_open_goal_course_job(operation_id="OD",job_id="JD",goal_id="GD",title="SQL",desired_outcome=GOAL,crash_after_phase="RESEARCH_PLANNED")
        except InjectedCrash:
            pass
        changed=copy.deepcopy(base); changed["claims"][0]["text"] += " changed"
        e2=OpenGoalLearningEngine(Repository(path), corpus=RuntimeResearchCorpus([changed]))
        try:
            e2.create_open_goal_course_job(operation_id="OD",job_id="JD",goal_id="GD",title="SQL",desired_outcome=GOAL); cases["bundle_digest_drift_blocked"]=False
        except ValueError as ex:
            cases["bundle_digest_drift_blocked"]="BUNDLE_DIGEST_DRIFT" in str(ex)

    with tempfile.TemporaryDirectory() as td:
        repo,e,created=build_open(os.path.join(td,"rehydrate.sqlite3")); cid=created["course_id"]
        master_where(e,cid,prefix="RW"); retain_order(e,cid,prefix="RO")
        restarted=OpenGoalLearningEngine(Repository(os.path.join(td,"rehydrate.sqlite3")), corpus=RuntimeResearchCorpus())
        action=restarted.next_action("L",cid,now=9000)
        cases["restart_rehydrates_dynamic_domain"] = action["action_type"]=="TRANSFER_CHECK" and "sqlite-query-fundamentals" in restarted.registry.domain_keys

    with tempfile.TemporaryDirectory() as td:
        e=OpenGoalLearningEngine(Repository(os.path.join(td,"x.sqlite3")), corpus=RuntimeResearchCorpus())
        before=list(e.registry.domain_keys); e.corpus.add_bundle(base); after=list(e.registry.domain_keys)
        e.create_open_goal_course_job(operation_id="O",job_id="J",goal_id="G",title="SQL",desired_outcome=GOAL)
        cases["runtime_bundle_not_domain_until_compile"] = before==after and "sqlite-query-fundamentals" in e.registry.domain_keys

    c=RuntimeResearchCorpus([base]); changed=copy.deepcopy(base); changed["claims"][0]["text"] += "X"
    try:
        c.add_bundle(changed); cases["runtime_bundle_identity_collision_blocked"] = False
    except ValueError as ex:
        cases["runtime_bundle_identity_collision_blocked"] = "BUNDLE_VERSION_COLLISION" in str(ex)

    return {"pass": all(cases.values()), "cases": cases, "passed": sum(bool(v) for v in cases.values()), "total": len(cases)}


def open_goal_recovery_stress(runs=100):
    from learning_lab import OpenGoalLearningEngine, Repository, RuntimeResearchCorpus
    from learning_lab.engine import InjectedCrash
    phases=["GOAL_INTERPRETED","RESEARCH_PLANNED","SOURCES_ACQUIRED","DYNAMIC_DOMAIN_BOUND","COURSE_GENERATED_VALIDATED","OPEN_GOAL_COURSE_GENERATED"]
    passes=0; phase_passes={p:0 for p in phases}; course_digests=set(); dossier_digests=set(); plan_ids=set()
    bundle=load_bundle()
    for i in range(runs):
        phase=phases[i%len(phases)]
        with tempfile.TemporaryDirectory() as td:
            path=os.path.join(td,"x.sqlite3")
            kwargs=dict(operation_id="OP",job_id="JOB",goal_id="G",title="SQL",desired_outcome=GOAL)
            first=OpenGoalLearningEngine(Repository(path), corpus=RuntimeResearchCorpus([bundle]))
            try:
                first.create_open_goal_course_job(**kwargs,crash_after_phase=phase)
                continue
            except InjectedCrash:
                pass
            # Once sources are durable, prove restart no longer depends on the runtime corpus.
            corpus = RuntimeResearchCorpus() if phase in {"SOURCES_ACQUIRED","DYNAMIC_DOMAIN_BOUND","COURSE_GENERATED_VALIDATED","OPEN_GOAL_COURSE_GENERATED"} else RuntimeResearchCorpus([bundle])
            second=OpenGoalLearningEngine(Repository(path), corpus=corpus)
            out=second.create_open_goal_course_job(**kwargs)
            replay=second.create_open_goal_course_job(**kwargs)
            ok=out==replay and second.repo.count_objects("course")==1
            if ok:
                passes+=1; phase_passes[phase]+=1; course_digests.add(out["course_digest"]); dossier_digests.add(out["research_dossier_digest"]); plan_ids.add(out["research_plan_id"])
    return {"pass":passes==runs and len(course_digests)==1 and len(dossier_digests)==1 and len(plan_ids)==1,"runs":runs,"passes":passes,"phase_passes":phase_passes,"unique_course_digests":len(course_digests),"unique_dossier_digests":len(dossier_digests),"unique_plan_ids":len(plan_ids)}


def open_goal_tutor_recovery_stress(runs=100):
    from learning_lab import OpenGoalLearningEngine, OpenGoalTutorDirector, Repository, RuntimeResearchCorpus
    from learning_lab.engine import InjectedCrash
    phases=["OBSERVED","DIAGNOSED","MOVE_SELECTED"]
    passes=0; phase_passes={p:0 for p in phases}; digests=set(); bundle=load_bundle()
    with tempfile.TemporaryDirectory() as seed_td:
        seed=os.path.join(seed_td,"seed.sqlite3")
        repo,e,created=build_open(seed); cid=created["course_id"]
        for i in range(runs):
            phase=phases[i%len(phases)]
            with tempfile.TemporaryDirectory() as td:
                path=os.path.join(td,"x.sqlite3")
                src=sqlite3.connect(seed); dst=sqlite3.connect(path); src.backup(dst); dst.close(); src.close()
                e1=OpenGoalLearningEngine(Repository(path), corpus=RuntimeResearchCorpus())
                tutor=OpenGoalTutorDirector(e1.repo,e1)
                kwargs=dict(operation_id="OP-T",turn_id="T",session_id="S",learner_id="L",course_id=cid,skill_id="S-SQL-SELECT-WHERE",probe_id="TP-SQL-WHERE-1",response="SELECT title FROM tasks",requested_help_level=3,now=1)
                try:
                    tutor.process_turn(**kwargs,crash_after_phase=phase)
                    continue
                except InjectedCrash:
                    pass
                e2=OpenGoalLearningEngine(Repository(path), corpus=RuntimeResearchCorpus())
                t2=OpenGoalTutorDirector(e2.repo,e2); out=t2.process_turn(**kwargs); replay=t2.process_turn(**kwargs)
                d=hashlib.sha256(json.dumps(out,sort_keys=True,separators=(",",":")).encode()).hexdigest()
                if out==replay and e2.repo.count_tutor_turns("S")==1:
                    passes+=1; phase_passes[phase]+=1; digests.add(d)
    return {"pass":passes==runs and len(digests)==1,"runs":runs,"passes":passes,"phase_passes":phase_passes,"unique_result_digests":len(digests)}


def deterministic_open_goal_generation():
    outputs=[]
    bundle=load_bundle()
    for i in range(3):
        with tempfile.TemporaryDirectory() as td:
            from learning_lab import OpenGoalLearningEngine, Repository, RuntimeResearchCorpus
            e=OpenGoalLearningEngine(Repository(os.path.join(td,"d.sqlite3")), corpus=RuntimeResearchCorpus([bundle]))
            out=e.create_open_goal_course_job(operation_id="O",job_id="J",goal_id="GDET",title="SQL",desired_outcome=GOAL)
            outputs.append({"course_digest":out["course_digest"],"dossier_digest":out["research_dossier_digest"],"plan_id":out["research_plan_id"]})
    return {"pass": all(x==outputs[0] for x in outputs[1:]), "runs":len(outputs), "outputs":outputs}


def main():
    rc, passed, output = run_tests()
    files, compile_errors = compile_all()
    demo = full_open_goal_demo()
    mutations = mutation_campaign()
    recovery = open_goal_recovery_stress(100)
    tutor_recovery = open_goal_tutor_recovery_stress(100)
    deterministic = deterministic_open_goal_generation()
    predecessor_path = ROOT / "evidence" / "predecessor_impl005_requalification.json"
    predecessor_ok = False
    if predecessor_path.exists():
        text=predecessor_path.read_text(encoding="utf-8", errors="replace")
        predecessor_ok='"status": "PASS_PORTABLE_IMPLEMENTATION"' in text and '"passed": 108' in text
    receipt = {
        "objective":"LEARNING-LAB-IMPL-006",
        "status":"PASS_PORTABLE_IMPLEMENTATION" if all([rc==0,passed==143,not compile_errors,demo["pass"],mutations["pass"],recovery["pass"],tutor_recovery["pass"],deterministic["pass"],predecessor_ok]) else "FAIL",
        "tests":{"passed":passed,"expected":143,"prior_regressions":108,"new_open_goal_tests":35,"returncode":rc},
        "python_compile":{"files":len(files),"errors":compile_errors},
        "open_goal_demo":demo,
        "mutation_campaign":mutations,
        "open_goal_recovery_stress":recovery,
        "open_goal_tutor_recovery_stress":tutor_recovery,
        "deterministic_open_goal_generation":deterministic,
        "predecessor_impl005_requalification_pass":predecessor_ok,
        "truth_boundary":{
            "open_goal":"BOUNDED_RUNTIME_RESEARCH_CORPUS_ONLY",
            "live_web_research_at_runtime":"NOT_IMPLEMENTED",
            "arbitrary_domain_oracle_generation":"NOT_IMPLEMENTED",
            "live_nondeterministic_llm":"NOT_QUALIFIED",
            "pedagogical_human_review":"REQUIRED_BEFORE_FULL_PEDAGOGICAL_VERIFICATION",
            "real_learner_effectiveness":"NOT_PROVEN",
            "far_transfer":"NOT_PROVEN",
            "native_iphone":"NOT_RUN",
            "production_integration":"NOT_RUN"
        }
    }
    (ROOT/"evidence"/"qualification_receipt_impl006.json").write_text(json.dumps(receipt,indent=2,sort_keys=True)+"\n",encoding="utf-8")
    print(json.dumps(receipt,indent=2,sort_keys=True))
    return 0 if receipt["status"].startswith("PASS") else 1


if __name__ == "__main__":
    raise SystemExit(main())
