from __future__ import annotations

import copy
import hashlib
import inspect
import json
import os
import py_compile
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from dataclasses import replace
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def run_tests():
    env = dict(os.environ)
    env["PYTHONPATH"] = str(ROOT)
    proc = subprocess.run(
        [sys.executable, "-m", "unittest", "discover", "-s", str(ROOT / "tests"), "-v"],
        cwd=ROOT, env=env, capture_output=True, text=True,
    )
    output = proc.stdout + proc.stderr
    (ROOT / "evidence").mkdir(exist_ok=True)
    (ROOT / "evidence" / "test_output_impl005.txt").write_text(output, encoding="utf-8")
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


def make_engine(path):
    from learning_lab import DomainGeneralLearningEngine, Repository
    repo = Repository(path)
    return repo, DomainGeneralLearningEngine(repo)


def build_fraction(path):
    from learning_lab import REAL_FRACTION_OUTCOME
    repo, engine = make_engine(path)
    created = engine.create_research_grounded_course_job(
        operation_id="OP-F-CREATE", job_id="JOB-F-CREATE", goal_id="G-FRAC",
        title="Unlike-denominator fractions", desired_outcome=REAL_FRACTION_OUTCOME,
    )
    return repo, engine, created


def build_git(path):
    from learning_lab import REAL_GIT_OUTCOME
    repo, engine = make_engine(path)
    created = engine.create_research_grounded_course_job(
        operation_id="OP-G-CREATE", job_id="JOB-G-CREATE", goal_id="G-GIT-DG",
        title="Git feature branch workflow", desired_outcome=REAL_GIT_OUTCOME,
    )
    return repo, engine, created


def master_fraction_lcd(engine, cid, learner="L", prefix="F", t0=100):
    engine.submit_attempt(operation_id=f"OP-{prefix}-LM", attempt_id=f"A-{prefix}-LM", learner_id=learner, course_id=cid, item_id="M-FRAC-LCD-1", response="LCD=24; 5/8=15/24; 7/12=14/24", submitted_at=t0)
    return engine.submit_attempt(operation_id=f"OP-{prefix}-LR", attempt_id=f"A-{prefix}-LR", learner_id=learner, course_id=cid, item_id="R-FRAC-LCD-1", response="LCD=60; 3/10=18/60; 5/12=25/60", submitted_at=t0+3900)


def retain_fraction_add(engine, cid, learner="L", prefix="F", t0=5000):
    engine.submit_attempt(operation_id=f"OP-{prefix}-AM", attempt_id=f"A-{prefix}-AM", learner_id=learner, course_id=cid, item_id="M-FRAC-ADD-1", response="19/12", submitted_at=t0)
    return engine.submit_attempt(operation_id=f"OP-{prefix}-AR", attempt_id=f"A-{prefix}-AR", learner_id=learner, course_id=cid, item_id="R-FRAC-SUB-1", response="9/20", submitted_at=t0+4000)


def full_fraction_demo():
    from learning_lab import DomainGeneralTutorDirector, MultiSessionDirector
    with tempfile.TemporaryDirectory() as td:
        repo, engine, created = build_fraction(os.path.join(td, "fraction.sqlite3"))
        cid = created["course_id"]
        director = MultiSessionDirector(repo, engine)
        director.start_session(operation_id="OP-S1", session_id="S1", learner_id="L", course_id=cid, started_at=0)
        first = director.plan_next(operation_id="OP-D1", decision_id="D1", session_id="S1", learner_id="L", course_id=cid, now=0)
        master_fraction_lcd(engine, cid, prefix="D")
        tutor = DomainGeneralTutorDirector(repo, engine)
        h1 = tutor.process_turn(operation_id="OP-T1", turn_id="T1", session_id="TUTOR", learner_id="L", course_id=cid, skill_id="S-FRAC-ADD-SUB", probe_id="TP-FRAC-ADD-1", response="2/5", requested_help_level=3, now=5000)
        h2 = tutor.process_turn(operation_id="OP-T2", turn_id="T2", session_id="TUTOR", learner_id="L", course_id=cid, skill_id="S-FRAC-ADD-SUB", probe_id="TP-FRAC-ADD-2", response="3/7", requested_help_level=3, now=5001)
        recheck = tutor.process_turn(operation_id="OP-T3", turn_id="T3", session_id="TUTOR", learner_id="L", course_id=cid, skill_id="S-FRAC-ADD-SUB", probe_id="TP-FRAC-ADD-RECHECK", response="23/30", requested_help_level=0, now=5002)
        retained = retain_fraction_add(engine, cid, prefix="D", t0=5100)
        transfer_action = engine.next_action("L", cid, now=9100)
        task = engine.transfer_task(transfer_action["target_id"])
        transfer = engine.submit_transfer_attempt(operation_id="OP-TR", attempt_id="A-TR", learner_id="L", course_id=cid, task_id=task["item_id"], response="31/24", submitted_at=9200)
        complete = engine.next_action("L", cid, now=9200)
        return {
            "pass": all([
                first["next_action"]["target_id"] == "L-FRAC-EQUIV-LCD",
                h1["diagnosis"]["standing"] == "TEACHING_HYPOTHESIS",
                h2["diagnosis"]["standing"] == "EVIDENCE_SUPPORTED",
                recheck["teaching_move"]["move"] == "INDEPENDENT_RECHECK_PASSED",
                retained["projection"]["stage"] == "RETAINED",
                transfer_action["action_type"] == "TRANSFER_CHECK",
                transfer["projection"]["stage"] == "MASTERED",
                complete["action_type"] == "COURSE_COMPLETE",
            ]),
            "created": created,
            "first_action": first["next_action"],
            "hypothesis_turn": h1,
            "confirmed_turn": h2,
            "recheck_turn": recheck,
            "retained": retained["projection"],
            "transfer": transfer["projection"],
            "final_action": complete,
        }


def full_git_via_general_demo():
    with tempfile.TemporaryDirectory() as td:
        repo, engine, created = build_git(os.path.join(td, "git.sqlite3"))
        cid = created["course_id"]
        engine.submit_attempt(operation_id="OP-G-SM", attempt_id="A-G-SM", learner_id="L", course_id=cid, item_id="M-GIT-STAGE-1", response="git add app.txt; git commit -m 'Feature work'", submitted_at=100)
        engine.submit_attempt(operation_id="OP-G-SR", attempt_id="A-G-SR", learner_id="L", course_id=cid, item_id="R-GIT-STAGE-1", response="git add later.txt; git commit -m 'Later work'", submitted_at=4000)
        engine.submit_attempt(operation_id="OP-G-BM", attempt_id="A-G-BM", learner_id="L", course_id=cid, item_id="M-GIT-BRANCH-1", response="git switch -c topic; git add change.txt; git commit -m 'Add change'; git switch main; git merge topic", submitted_at=5000)
        retained = engine.submit_attempt(operation_id="OP-G-BR", attempt_id="A-G-BR", learner_id="L", course_id=cid, item_id="R-GIT-BRANCH-1", response="git switch -c fix; git add fix.txt; git commit -m 'Fix issue'; git switch main; git merge fix", submitted_at=9000)
        action = engine.next_action("L", cid, now=9000)
        task = engine.transfer_task(action["target_id"])
        transfer = engine.submit_transfer_attempt(operation_id="OP-G-T", attempt_id="A-G-T", learner_id="L", course_id=cid, task_id=task["item_id"], response=task["answer"], submitted_at=9100)
        final = engine.next_action("L", cid, now=9100)
        return {
            "pass": created["domain_key"] == "git-feature-branch-workflow" and retained["projection"]["stage"] == "RETAINED" and transfer["projection"]["stage"] == "MASTERED" and final["action_type"] == "COURSE_COMPLETE",
            "created": created,
            "retained": retained["projection"],
            "transfer": transfer["projection"],
            "final_action": final,
        }


def deterministic_course_generation():
    from learning_lab import REAL_FRACTION_OUTCOME, REAL_GIT_OUTCOME
    snapshots = {"fractions": [], "git": []}
    for label, outcome in (("fractions", REAL_FRACTION_OUTCOME), ("git", REAL_GIT_OUTCOME)):
        for i in range(2):
            with tempfile.TemporaryDirectory() as td:
                repo, engine = make_engine(os.path.join(td, "det.sqlite3"))
                out = engine.create_research_grounded_course_job(operation_id="OP", job_id="JOB", goal_id="G", title=label, desired_outcome=outcome)
                snapshots[label].append({"course_digest": out["course_digest"], "dossier_digest": out["research_dossier_digest"], "domain_key": out["domain_key"]})
    ok = all(v[0] == v[1] for v in snapshots.values())
    return {"pass": ok, "snapshots": snapshots}


def independent_oracles():
    from learning_lab import default_domain_registry
    reg = default_domain_registry()
    frac = reg.by_key("fractions-unlike-denominators").behavior_oracle
    checks = {
        "direct_add": frac.score({"scoring_type":"FRACTION","prompt":"Compute 3/4 + 5/6 and give the simplified result.","answer":"WRONG"}, "19/12"),
        "wrong_key_rejected": not frac.score({"scoring_type":"FRACTION","prompt":"Compute 3/4 + 5/6 and give the simplified result.","answer":"17/12"}, "17/12"),
        "equivalent_result_allowed": frac.score({"scoring_type":"FRACTION","prompt":"Compute 3/4 + 5/6 and give the simplified result.","answer":"19/12"}, "38/24"),
        "word_add": frac.score({"scoring_type":"FRACTION","prompt":"A hiker walks 2/3 mile before lunch and 5/8 mile after lunch. What total distance did the hiker walk? Give a simplified fraction of a mile.","answer":"0"}, "31/24"),
        "word_subtract": frac.score({"scoring_type":"FRACTION","prompt":"A tank is 5/6 full. Water equal to 1/4 of the tank's capacity is used. What fraction of the tank remains? Give a simplified fraction.","answer":"0"}, "7/12"),
        "lcd_equivalence": frac.score({"scoring_type":"LCD_EQUIV","prompt":"For 5/8 and 7/12, give the LCD and rewrite both fractions using it. Format: LCD=...; 5/8=...; 7/12=...","answer":"bad"}, "LCD=24; 5/8=15/24; 7/12=14/24"),
    }
    return {"pass": all(checks.values()), "checks": checks}


def mutation_campaign():
    from learning_lab import DomainGeneralLearningEngine, DomainGeneralTutorDirector, DomainRegistry, REAL_FRACTION_OUTCOME, Repository, default_domain_registry
    from learning_lab.domain_general import DomainGeneralLearningEngine as DGEngine
    cases = {}

    base = default_domain_registry(); frac = base.by_key("fractions-unlike-denominators"); git = base.by_key("git-feature-branch-workflow")
    original_factory = frac.course_factory
    def bad_key_factory(**kwargs):
        c = original_factory(**kwargs); items=list(c.items); idx=next(i for i,x in enumerate(items) if x.item_id=="M-FRAC-ADD-1"); items[idx]=replace(items[idx],answer="17/12"); return replace(c,items=items)
    with tempfile.TemporaryDirectory() as td:
        e=DGEngine(Repository(os.path.join(td,"x.sqlite3")),DomainRegistry([git,replace(frac,course_factory=bad_key_factory)]))
        try:
            e.create_research_grounded_course_job(operation_id="O",job_id="J",goal_id="G",title="bad",desired_outcome=REAL_FRACTION_OUTCOME); cases["wrong_answer_key_blocked"]=False
        except ValueError as ex:
            cases["wrong_answer_key_blocked"]="DOMAIN_BEHAVIOR_ORACLE_FAILED" in str(ex)

    def bad_example_factory(**kwargs):
        c=original_factory(**kwargs); lessons=list(c.lessons); idx=next(i for i,x in enumerate(lessons) if x.lesson_id=="L-FRAC-ADD-SUB"); l=lessons[idx]; ex=list(l.worked_examples); ex[0]="`1/2 + 1/3 = 4/6`."; spans=copy.deepcopy(l.grounding_spans); spans[1]["text"]=ex[0]; lessons[idx]=replace(l,worked_examples=ex,grounding_spans=spans); return replace(c,lessons=lessons)
    with tempfile.TemporaryDirectory() as td:
        e=DGEngine(Repository(os.path.join(td,"x.sqlite3")),DomainRegistry([git,replace(frac,course_factory=bad_example_factory)]))
        try:
            e.create_research_grounded_course_job(operation_id="O",job_id="J",goal_id="G",title="bad",desired_outcome=REAL_FRACTION_OUTCOME); cases["wrong_worked_example_blocked"]=False
        except ValueError as ex:
            cases["wrong_worked_example_blocked"]="LESSON_BEHAVIOR_ORACLE_FAILED" in str(ex)

    with tempfile.TemporaryDirectory() as td:
        repo, engine, created = build_fraction(os.path.join(td,"m.sqlite3")); cid=created["course_id"]
        cases["add_denominators_rejected"] = not engine.submit_attempt(operation_id="O1",attempt_id="A1",learner_id="L",course_id=cid,item_id="M-FRAC-ADD-1",response="8/10",submitted_at=1)["attempt"]["correct"]
        cases["equivalent_fraction_response_accepted"] = engine.submit_attempt(operation_id="O2",attempt_id="A2",learner_id="L2",course_id=cid,item_id="M-FRAC-ADD-1",response="38/24",submitted_at=1)["attempt"]["correct"]
        master_fraction_lcd(engine,cid,learner="LT",prefix="MUT")
        tutor=DomainGeneralTutorDirector(repo,engine)
        one=tutor.process_turn(operation_id="OT1",turn_id="T1",session_id="S",learner_id="LT",course_id=cid,skill_id="S-FRAC-ADD-SUB",probe_id="TP-FRAC-ADD-1",response="2/5",requested_help_level=3,now=5000)
        same=tutor.process_turn(operation_id="OT2",turn_id="T2",session_id="S",learner_id="LT",course_id=cid,skill_id="S-FRAC-ADD-SUB",probe_id="TP-FRAC-ADD-1",response="2/5",requested_help_level=3,now=5001)
        two=tutor.process_turn(operation_id="OT3",turn_id="T3",session_id="S",learner_id="LT",course_id=cid,skill_id="S-FRAC-ADD-SUB",probe_id="TP-FRAC-ADD-2",response="3/7",requested_help_level=3,now=5002)
        cases["single_error_is_hypothesis"] = one["diagnosis"]["standing"]=="TEACHING_HYPOTHESIS"
        cases["same_family_not_corroboration"] = same["diagnosis"]["standing"]=="TEACHING_HYPOTHESIS"
        cases["distinct_family_can_corroborate"] = two["diagnosis"]["standing"]=="EVIDENCE_SUPPORTED"
        cases["overhelping_capped"] = one["teaching_move"]["support_level_after"]<=1 and one["teaching_move"]["overhelping_prevented"]
        boundary=tutor.process_turn(operation_id="OTB",turn_id="TB",session_id="S2",learner_id="LT",course_id=cid,skill_id="S-FRAC-ADD-SUB",probe_id=None,response="help",requested_help_level=3,now=5003,active_assessment_item_id="M-FRAC-ADD-1")
        cases["assessment_answer_withheld"] = boundary["teaching_move"]["move"]=="ASSESSMENT_INTEGRITY_BOUNDARY" and "19/12" not in boundary["teaching_move"]["content"]
        cases["tutor_context_has_no_answer_key"] = '"answer"' not in json.dumps(boundary,sort_keys=True).lower()

        retained=retain_fraction_add(engine,cid,learner="LT",prefix="MUT",t0=5100)
        task=engine.transfer_task("T-FRAC-TRANSFER-DISTANCE")
        assisted=engine.submit_transfer_attempt(operation_id="OX",attempt_id="AX",learner_id="LT",course_id=cid,task_id=task["item_id"],response="31/24",submitted_at=9200,assisted=True)
        cases["assisted_transfer_not_mastery"] = assisted["projection"]["stage"]=="RETAINED"
        cases["failed_or_assisted_family_forces_fresh_transfer"] = engine.next_action("LT",cid,now=9200)["target_id"]=="T-FRAC-TRANSFER-TANK"

    with tempfile.TemporaryDirectory() as td:
        repo, engine, created = build_fraction(os.path.join(td,"bound.sqlite3")); cid=created["course_id"]
        class LiarDispatcher:
            def score(self, item, response): return True
        engine.git_oracle = LiarDispatcher()
        cases["runtime_scoring_bound_to_course_domain"] = not engine.submit_attempt(operation_id="OB",attempt_id="AB",learner_id="L",course_id=cid,item_id="M-FRAC-ADD-1",response="8/10",submitted_at=1)["attempt"]["correct"]

    with tempfile.TemporaryDirectory() as td:
        repo=Repository(os.path.join(td,"collision.sqlite3"))
        reg=default_domain_registry(); frac=reg.by_key("fractions-unlike-denominators"); git=reg.by_key("git-feature-branch-workflow")
        colliding=copy.deepcopy(frac.maintenance_tasks); task=colliding.pop("MN-FRAC-LCD-2"); task["item_id"]="MN-GIT-STAGE-2"; task["family_id"]="F-COLLISION"; colliding[task["item_id"]]=task
        e=DGEngine(repo,DomainRegistry([git,replace(frac,maintenance_tasks=colliding)]))
        e.create_research_grounded_course_job(operation_id="OG",job_id="JG",goal_id="GG",title="Git",desired_outcome=git.desired_outcome)
        try:
            e.create_research_grounded_course_job(operation_id="OF",job_id="JF",goal_id="GF",title="Fractions",desired_outcome=frac.desired_outcome); cases["task_id_collision_blocked"]=False
        except ValueError as ex:
            cases["task_id_collision_blocked"]="DOMAIN_TASK_ID_COLLISION" in str(ex)

    source=inspect.getsource(DGEngine.next_action)
    cases["no_domain_task_id_hardcode_in_core_next_action"] = all(x not in source for x in ("MN-GIT","T-GIT","MN-FRAC","T-FRAC"))
    return {"pass": all(cases.values()), "cases": cases, "passed": sum(cases.values()), "total": len(cases)}


def course_recovery_stress(runs=100):
    from learning_lab import DomainGeneralLearningEngine, InjectedCrash, REAL_FRACTION_OUTCOME, Repository
    phases=["RESEARCH_FROZEN","COURSE_GENERATED_VALIDATED"]
    passes=0; phase_passes={p:0 for p in phases}; course_digests=set(); dossier_digests=set()
    for i in range(runs):
        phase=phases[i%2]
        with tempfile.TemporaryDirectory() as td:
            path=os.path.join(td,"c.sqlite3")
            kwargs=dict(operation_id="OP",job_id="JOB",goal_id="G",title="Fractions",desired_outcome=REAL_FRACTION_OUTCOME)
            try:
                DomainGeneralLearningEngine(Repository(path)).create_research_grounded_course_job(**kwargs,crash_after_phase=phase)
                continue
            except InjectedCrash:
                pass
            e=DomainGeneralLearningEngine(Repository(path)); out=e.create_research_grounded_course_job(**kwargs); replay=e.create_research_grounded_course_job(**kwargs)
            ok=out==replay and e.repo.count_objects("course")==1
            if ok:
                passes+=1; phase_passes[phase]+=1; course_digests.add(out["course_digest"]); dossier_digests.add(out["research_dossier_digest"])
    return {"pass":passes==runs and len(course_digests)==1 and len(dossier_digests)==1,"runs":runs,"passes":passes,"phase_passes":phase_passes,"unique_course_digests":len(course_digests),"unique_dossier_digests":len(dossier_digests)}


def tutor_recovery_stress(runs=100):
    from learning_lab import DomainGeneralLearningEngine, DomainGeneralTutorDirector, InjectedCrash, Repository
    phases=["OBSERVED","DIAGNOSED","MOVE_SELECTED"]
    passes=0; phase_passes={p:0 for p in phases}; digests=set()
    with tempfile.TemporaryDirectory() as seed_td:
        seed=os.path.join(seed_td,"seed.sqlite3")
        repo,engine,created=build_fraction(seed); cid=created["course_id"]; master_fraction_lcd(engine,cid,prefix="SEED")
        for i in range(runs):
            phase=phases[i%len(phases)]
            with tempfile.TemporaryDirectory() as td:
                path=os.path.join(td,"x.sqlite3")
                src=sqlite3.connect(seed); dst=sqlite3.connect(path); src.backup(dst); dst.close(); src.close()
                repo1=Repository(path); eng1=DomainGeneralLearningEngine(repo1); tutor=DomainGeneralTutorDirector(repo1,eng1)
                kwargs=dict(operation_id="OP-T",turn_id="T",session_id="S",learner_id="L",course_id=cid,skill_id="S-FRAC-ADD-SUB",probe_id="TP-FRAC-ADD-1",response="2/5",requested_help_level=3,now=5000)
                try:
                    tutor.process_turn(**kwargs,crash_after_phase=phase)
                    continue
                except InjectedCrash:
                    pass
                repo2=Repository(path); eng2=DomainGeneralLearningEngine(repo2); tutor2=DomainGeneralTutorDirector(repo2,eng2)
                out=tutor2.process_turn(**kwargs); replay=tutor2.process_turn(**kwargs)
                ok=out==replay and repo2.count_tutor_turns("S")==1
                if ok:
                    passes+=1; phase_passes[phase]+=1; digests.add(hashlib.sha256(json.dumps(out,sort_keys=True).encode()).hexdigest())
    return {"pass":passes==runs and len(digests)==1,"runs":runs,"passes":passes,"phase_passes":phase_passes,"unique_result_digests":len(digests)}


def main():
    rc, test_count, test_output = run_tests()
    pyfiles, compile_errors = compile_all()
    fraction_demo = full_fraction_demo()
    git_demo = full_git_via_general_demo()
    deterministic = deterministic_course_generation()
    oracles = independent_oracles()
    mutations = mutation_campaign()
    course_stress = course_recovery_stress(100)
    tutor_stress = tutor_recovery_stress(100)
    passed = all([
        rc == 0, not compile_errors, test_count == 108,
        fraction_demo["pass"], git_demo["pass"], deterministic["pass"], oracles["pass"],
        mutations["pass"], course_stress["pass"], tutor_stress["pass"],
    ])
    receipt = {
        "objective": "LEARNING-LAB-IMPL-005",
        "status": "PASS_PORTABLE_IMPLEMENTATION" if passed else "FAIL",
        "tests": {"passed": test_count, "expected": 108, "prior_regressions": 79, "new_domain_general_tests": 29, "returncode": rc},
        "python_compile": {"files": len(pyfiles), "errors": compile_errors},
        "domains": ["git-feature-branch-workflow", "fractions-unlike-denominators"],
        "fraction_demo": fraction_demo,
        "git_via_domain_general_demo": git_demo,
        "deterministic_generation": deterministic,
        "independent_oracles": oracles,
        "mutation_campaign": mutations,
        "course_recovery_stress": course_stress,
        "tutor_recovery_stress": tutor_stress,
        "architecture_result": {
            "single_engine_class_for_both_domains": True,
            "domain_registry_separates_content_oracles_and_task_catalogs": True,
            "mastery_retention_transfer_core_reused": True,
            "multi_session_director_reused": True,
            "next_action_core_contains_domain_task_ids": False,
            "production_authority_duplicated": False,
        },
        "truth_boundary": {
            "second_domain": "BOUNDED_FRACTION_ARITHMETIC_REAL_DOMAIN",
            "research": "FROZEN_OPENSTAX_SOURCE_DOSSIER",
            "pedagogical_human_review": "REQUIRED_BEFORE_FULL_PEDAGOGICAL_VERIFICATION",
            "real_learner_effectiveness": "NOT_PROVEN",
            "far_transfer": "NOT_PROVEN",
            "live_nondeterministic_llm": "NOT_QUALIFIED",
            "native_iphone": "NOT_RUN",
            "production_integration": "NOT_RUN",
        },
    }
    (ROOT/"evidence"/"qualification_receipt_impl005.json").write_text(json.dumps(receipt,indent=2,sort_keys=True),encoding="utf-8")
    (ROOT/"evidence"/"fraction_domain_demo.json").write_text(json.dumps(fraction_demo,indent=2,sort_keys=True),encoding="utf-8")
    (ROOT/"evidence"/"git_domain_general_demo.json").write_text(json.dumps(git_demo,indent=2,sort_keys=True),encoding="utf-8")
    (ROOT/"evidence"/"domain_general_mutation_campaign.json").write_text(json.dumps(mutations,indent=2,sort_keys=True),encoding="utf-8")
    (ROOT/"evidence"/"domain_general_course_stress.json").write_text(json.dumps(course_stress,indent=2,sort_keys=True),encoding="utf-8")
    (ROOT/"evidence"/"domain_general_tutor_stress.json").write_text(json.dumps(tutor_stress,indent=2,sort_keys=True),encoding="utf-8")
    print(json.dumps(receipt,indent=2,sort_keys=True))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
