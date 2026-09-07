from __future__ import annotations

import copy
import json
import re
import sqlite3
from dataclasses import asdict
from hashlib import sha256
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

from .domain_general import (
    DomainGeneralLearningEngine,
    DomainGeneralTutorDirector,
    DomainRegistry,
    DomainSpec,
    default_domain_registry,
)
from .engine import InjectedCrash
from .models import Course, Criterion, Item, Lesson, Skill
from .real_course import validate_grounding, validate_instructional_design
from .repository import Repository, canonical_json, digest


OPEN_GOAL_COMPILER_VERSION = "OPEN-GOAL-COMPILER-V1"
OPEN_GOAL_RESEARCH_VERSION = "OPEN-GOAL-RESEARCH-V1"

_STOPWORDS = {
    "a", "an", "and", "as", "at", "be", "by", "can", "for", "from", "how", "i", "in",
    "into", "it", "learn", "me", "of", "on", "or", "the", "to", "use", "using", "with",
    "want", "able", "then", "that", "this", "write", "create", "make",
}


def _tokens(text: str) -> Set[str]:
    return {
        t for t in re.findall(r"[a-z0-9_]+", text.lower())
        if len(t) > 1 and t not in _STOPWORDS
    }


def _stable_id(prefix: str, text: str, size: int = 12) -> str:
    return f"{prefix}-{sha256(text.encode('utf-8')).hexdigest()[:size].upper()}"


class RuntimeResearchCorpus:
    """Runtime-addable research corpus.

    Bundles are data, not registered Learning domains. Adding a bundle does not
    mutate the DomainRegistry. The open-goal compiler may later interpret a goal,
    acquire a bounded subset of sources, and create a domain spec from that data.
    """

    def __init__(self, bundles: Optional[Sequence[Dict[str, Any]]] = None):
        self._bundles: Dict[str, Dict[str, Any]] = {}
        for bundle in bundles or []:
            self.add_bundle(bundle)

    def add_bundle(self, bundle: Dict[str, Any]) -> None:
        b = copy.deepcopy(bundle)
        required = {
            "bundle_id", "version", "domain_key", "goal_terms", "sources", "claims",
            "course_blueprint", "oracle_descriptor", "maintenance_tasks", "transfer_tasks",
            "transfer_required_skills", "tutor_probes", "tutor_remediation",
        }
        missing = sorted(required - set(b))
        if missing:
            raise ValueError("OPEN_GOAL_BUNDLE_INCOMPLETE:" + ",".join(missing))
        if not b["sources"] or not b["claims"]:
            raise ValueError("OPEN_GOAL_BUNDLE_EMPTY_RESEARCH")
        if b["bundle_id"] in self._bundles and digest(self._bundles[b["bundle_id"]]) != digest(b):
            raise ValueError("OPEN_GOAL_BUNDLE_VERSION_COLLISION")
        self._bundles[b["bundle_id"]] = b

    def get(self, bundle_id: str) -> Dict[str, Any]:
        if bundle_id not in self._bundles:
            raise ValueError("OPEN_GOAL_BUNDLE_NOT_AVAILABLE")
        return copy.deepcopy(self._bundles[bundle_id])

    def bundles(self) -> List[Dict[str, Any]]:
        return [copy.deepcopy(self._bundles[k]) for k in sorted(self._bundles)]


class BoundedGoalInterpreter:
    """Generic lexical interpreter for bounded portable qualification.

    It intentionally abstains when the runtime corpus does not support the goal
    or when two bundles are tied. No domain keyword table lives in engine code.
    """

    MIN_SCORE = 2

    def interpret(self, goal: str, corpus: RuntimeResearchCorpus) -> Dict[str, Any]:
        gt = _tokens(goal)
        candidates = []
        for bundle in corpus.bundles():
            bt = set(bundle.get("goal_terms", [])) | _tokens(bundle.get("domain_key", ""))
            overlap = sorted(gt & bt)
            score = len(overlap)
            candidates.append((score, bundle["bundle_id"], overlap, bundle))
        candidates.sort(key=lambda x: (-x[0], x[1]))
        if not candidates or candidates[0][0] < self.MIN_SCORE:
            raise ValueError("OPEN_GOAL_UNSUPPORTED_OR_INSUFFICIENT_RESEARCH")
        if len(candidates) > 1 and candidates[1][0] == candidates[0][0]:
            raise ValueError("OPEN_GOAL_AMBIGUOUS_RESEARCH_MATCH")
        score, bundle_id, overlap, bundle = candidates[0]
        return {
            "interpreter_version": OPEN_GOAL_RESEARCH_VERSION,
            "goal": goal,
            "goal_tokens": sorted(gt),
            "bundle_id": bundle_id,
            "bundle_version": bundle["version"],
            "bundle_digest": digest(bundle),
            "domain_key": bundle["domain_key"],
            "matched_terms": overlap,
            "match_score": score,
            "standing": "BOUNDED_SUPPORTED",
        }


class OpenGoalResearchPlanner:
    def plan(self, interpretation: Dict[str, Any], bundle: Dict[str, Any]) -> Dict[str, Any]:
        goal_tokens = set(interpretation["goal_tokens"])
        concepts = []
        for concept in bundle.get("concepts", []):
            ct = set(concept.get("terms", [])) | _tokens(concept.get("name", ""))
            relevance = len(goal_tokens & ct)
            if relevance > 0 or concept.get("required", False):
                concepts.append({
                    "concept_id": concept["concept_id"],
                    "name": concept["name"],
                    "terms": sorted(ct),
                    "required": bool(concept.get("required", False)),
                })
        if not concepts:
            raise ValueError("OPEN_GOAL_NO_RESEARCH_CONCEPTS")
        query_terms = set(interpretation["matched_terms"])
        for c in concepts:
            query_terms.update(c["terms"])
        return {
            "plan_id": _stable_id("RPLAN", canonical_json({"i": interpretation, "c": concepts})),
            "planner_version": OPEN_GOAL_RESEARCH_VERSION,
            "bundle_id": bundle["bundle_id"],
            "bundle_version": bundle["version"],
            "bundle_digest": interpretation["bundle_digest"],
            "domain_key": bundle["domain_key"],
            "query_terms": sorted(query_terms),
            "concepts": concepts,
            "required_authority_classes": sorted(set(bundle.get("required_authority_classes", []))),
            "oracle_type": bundle["oracle_descriptor"]["type"],
        }


class OpenGoalSourceAcquirer:
    def acquire(self, goal: str, plan: Dict[str, Any], bundle: Dict[str, Any]) -> Dict[str, Any]:
        query_terms = set(plan["query_terms"])
        authority_required = set(plan.get("required_authority_classes", []))
        selected_sources = []
        for source in bundle["sources"]:
            if source.get("standing") != "ADMITTED":
                continue
            if authority_required and source.get("authority") not in authority_required:
                continue
            st = set(source.get("topics", [])) | _tokens(source.get("title", ""))
            if query_terms & st:
                selected_sources.append(copy.deepcopy(source))
        if not selected_sources:
            raise ValueError("OPEN_GOAL_NO_ADMISSIBLE_SOURCES_ACQUIRED")
        selected_ids = {s["source_id"] for s in selected_sources}
        claims = [copy.deepcopy(c) for c in bundle["claims"] if c.get("source_id") in selected_ids]
        if not claims:
            raise ValueError("OPEN_GOAL_NO_CLAIMS_ACQUIRED")
        source_ids_from_claims = {c["source_id"] for c in claims}
        if not source_ids_from_claims.issubset(selected_ids):
            raise ValueError("OPEN_GOAL_CLAIM_SOURCE_MISMATCH")
        dossier = {
            "dossier_id": _stable_id("RSCH-OPEN", canonical_json({"goal": goal, "bundle": bundle["bundle_id"], "version": bundle["version"], "sources": sorted(selected_ids)})),
            "retrieved_date": bundle.get("retrieved_date", "UNKNOWN"),
            "source_policy": "RUNTIME_CORPUS_BOUNDED_AUTHORITATIVE",
            "domain_key": bundle["domain_key"],
            "bundle_id": bundle["bundle_id"],
            "bundle_version": bundle["version"],
            "goal": goal,
            "research_plan": copy.deepcopy(plan),
            "sources": selected_sources,
            "claims": claims,
            "course_blueprint": copy.deepcopy(bundle["course_blueprint"]),
            "oracle_descriptor": copy.deepcopy(bundle["oracle_descriptor"]),
            "maintenance_tasks": copy.deepcopy(bundle["maintenance_tasks"]),
            "transfer_tasks": copy.deepcopy(bundle["transfer_tasks"]),
            "transfer_required_skills": list(bundle["transfer_required_skills"]),
            "tutor_probes": copy.deepcopy(bundle["tutor_probes"]),
            "tutor_remediation": copy.deepcopy(bundle["tutor_remediation"]),
        }
        return dossier


class DeclarativeSQLiteOracle:
    """Independent executable oracle for SELECT-only SQLite learning tasks.

    The learner/answer SQL is executed against a fixture. Expected output is
    derived independently from a declarative row-selection/order specification,
    so a corrupted generated answer key does not validate itself.
    """

    def __init__(self, descriptor: Dict[str, Any], course_blueprint: Dict[str, Any]):
        if descriptor.get("type") != "SQLITE_SELECT_QUERY":
            raise ValueError("UNSUPPORTED_OPEN_GOAL_ORACLE")
        self.descriptor = copy.deepcopy(descriptor)
        self.item_specs = {
            x["item_id"]: copy.deepcopy(x.get("oracle_spec", {}))
            for x in course_blueprint.get("items", [])
        }
        self.lesson_specs: Dict[str, Dict[str, Any]] = {}
        for lesson in course_blueprint.get("lessons", []):
            for ex in lesson.get("worked_examples", []):
                self.lesson_specs[ex["text"]] = copy.deepcopy(ex.get("oracle_spec", {}))
        for task in descriptor.get("additional_task_oracles", []):
            self.item_specs[task["item_id"]] = copy.deepcopy(task["oracle_spec"])
        self._fixture = descriptor["fixture"]

    @staticmethod
    def _compare(a: Any, op: str, b: Any) -> bool:
        if op == "=": return a == b
        if op == "!=": return a != b
        if op == ">": return a > b
        if op == ">=": return a >= b
        if op == "<": return a < b
        if op == "<=": return a <= b
        raise ValueError("UNSUPPORTED_DECLARATIVE_FILTER_OP")

    def _expected(self, spec: Dict[str, Any]) -> Tuple[List[str], List[Tuple[Any, ...]]]:
        rows = [dict(r) for r in self._fixture["rows"]]
        filt = spec.get("filter")
        if filt:
            rows = [r for r in rows if self._compare(r[filt["column"]], filt["op"], filt["value"])]
        order = spec.get("order_by", [])
        # stable sorting from least significant to most significant key
        for term in reversed(order):
            rows.sort(key=lambda r, c=term["column"]: r[c], reverse=term.get("direction", "ASC").upper() == "DESC")
        columns = list(spec["columns"])
        return columns, [tuple(r[c] for c in columns) for r in rows]

    def _execute(self, query: str) -> Tuple[List[str], List[Tuple[Any, ...]]]:
        q = query.strip()
        if not re.match(r"(?is)^select\b", q):
            raise ValueError("SQL_ORACLE_SELECT_ONLY")
        # sqlite3.execute rejects multiple statements; authorizer blocks mutation.
        con = sqlite3.connect(":memory:")
        try:
            table = self._fixture["table"]
            columns = self._fixture["columns"]
            defs = ", ".join(f'"{c["name"]}" {c["type"]}' for c in columns)
            con.execute(f'CREATE TABLE "{table}" ({defs})')
            col_names = [c["name"] for c in columns]
            marks = ",".join("?" for _ in col_names)
            con.executemany(
                f'INSERT INTO "{table}" ({",".join(chr(34)+c+chr(34) for c in col_names)}) VALUES ({marks})',
                [[row[c] for c in col_names] for row in self._fixture["rows"]],
            )
            con.set_authorizer(lambda action, a1, a2, db, trigger: sqlite3.SQLITE_OK if action in {
                sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ, sqlite3.SQLITE_FUNCTION,
            } else sqlite3.SQLITE_DENY)
            cur = con.execute(q)
            rows = cur.fetchall()
            names = [d[0] for d in (cur.description or [])]
            return names, rows
        finally:
            con.close()

    def score(self, item: Dict[str, Any], response: str) -> bool:
        spec = self.item_specs.get(item["item_id"])
        if not spec:
            return response.strip().lower() == item["answer"].strip().lower()
        try:
            got_cols, got_rows = self._execute(response)
            exp_cols, exp_rows = self._expected(spec)
        except Exception:
            return False
        if got_cols != exp_cols:
            return False
        if spec.get("order_by"):
            return got_rows == exp_rows
        return sorted(got_rows, key=repr) == sorted(exp_rows, key=repr)

    def validate_reference_items(self, course: Dict[str, Any]) -> Dict[str, Any]:
        failures = []
        checked = 0
        for item in course["items"]:
            if item["item_id"] not in self.item_specs:
                failures.append({"item_id": item["item_id"], "error": "ORACLE_SPEC_MISSING"})
                continue
            checked += 1
            if not self.score(item, item["answer"]):
                failures.append({"item_id": item["item_id"], "error": "REFERENCE_ANSWER_BEHAVIOR_MISMATCH"})
        return {"status": "PASS" if not failures else "FAIL", "checked": checked, "failures": failures}

    @staticmethod
    def _query_from_example(text: str) -> Optional[str]:
        m = re.search(r"`(SELECT\b[^`]*)`", text, flags=re.I)
        return m.group(1) if m else None

    def validate_lesson_examples(self, course: Dict[str, Any]) -> Dict[str, Any]:
        failures = []
        checked = 0
        for lesson in course["lessons"]:
            for text in lesson.get("worked_examples", []):
                spec = self.lesson_specs.get(text)
                query = self._query_from_example(text)
                if not spec or not query:
                    failures.append({"lesson_id": lesson["lesson_id"], "example": text, "error": "LESSON_EXAMPLE_ORACLE_MISSING"})
                    continue
                checked += 1
                try:
                    got_cols, got_rows = self._execute(query)
                    exp_cols, exp_rows = self._expected(spec)
                    rows_match = got_rows == exp_rows if spec.get("order_by") else sorted(got_rows, key=repr) == sorted(exp_rows, key=repr)
                    if got_cols != exp_cols or not rows_match:
                        failures.append({"lesson_id": lesson["lesson_id"], "example": text, "error": "LESSON_EXAMPLE_BEHAVIOR_MISMATCH"})
                except Exception as exc:
                    failures.append({"lesson_id": lesson["lesson_id"], "example": text, "error": type(exc).__name__})
        return {"status": "PASS" if not failures else "FAIL", "checked": checked, "failures": failures}


def _claims_text(dossier: Dict[str, Any], refs: Iterable[str]) -> str:
    by_id = {c["claim_id"]: c for c in dossier["claims"]}
    missing = [r for r in refs if r not in by_id]
    if missing:
        raise ValueError("OPEN_GOAL_BLUEPRINT_UNKNOWN_CLAIM:" + ",".join(missing))
    return " ".join(by_id[r]["text"] for r in refs)


def compile_course_from_dossier(*, goal_id: str, title: str, desired_outcome: str, dossier: Dict[str, Any]) -> Course:
    bp = dossier["course_blueprint"]
    criteria = [Criterion(x["criterion_id"], x["skill_id"], x["outcome"]) for x in bp["criteria"]]
    skills = [Skill(x["skill_id"], x["title"], list(x["criterion_ids"]), list(x.get("hard_prerequisite_skill_ids", []))) for x in bp["skills"]]
    lessons = []
    for x in bp["lessons"]:
        refs = list(x["explanation_claim_refs"])
        explanation = _claims_text(dossier, refs)
        examples = [e["text"] for e in x["worked_examples"]]
        spans = [{"role": "EXPLANATION", "text": explanation, "claim_refs": refs}]
        spans.extend({"role": "WORKED_EXAMPLE", "text": e["text"], "claim_refs": list(e["claim_refs"])} for e in x["worked_examples"])
        claim_refs = sorted(set(refs + [r for e in x["worked_examples"] for r in e["claim_refs"]]))
        lessons.append(Lesson(
            x["lesson_id"], x["title"], x["skill_id"], list(x["criterion_ids"]), x["objective"],
            explanation, examples, list(x["practice_item_ids"]), claim_refs=claim_refs, grounding_spans=spans,
        ))
    items = []
    for x in bp["items"]:
        refs = list(x["claim_refs"])
        rationale = x.get("rationale") or _claims_text(dossier, refs)
        items.append(Item(
            x["item_id"], x["family_id"], x["criterion_id"], x["mode"], x["prompt"], x["answer"], rationale,
            scoring_type=x.get("scoring_type", "EXACT"), claim_refs=refs,
            grounding_spans=[{"role": "RATIONALE", "text": rationale, "claim_refs": refs}],
        ))
    return Course(
        course_id=f"COURSE-{goal_id}", version=1, goal_id=goal_id, title=title, desired_outcome=desired_outcome,
        skills=skills, criteria=criteria, lessons=lessons, items=items,
        source_ids=[s["source_id"] for s in dossier["sources"]], research_dossier_id=dossier["dossier_id"],
        generation_adapter=OPEN_GOAL_COMPILER_VERSION,
    )


def _build_tutor_policy(dossier: Dict[str, Any], oracle: Any):
    remediation = copy.deepcopy(dossier["tutor_remediation"])

    def observer(probe: Dict[str, Any], response: str) -> Tuple[bool, Optional[str]]:
        item = {"item_id": probe["oracle_item_id"], "answer": probe.get("answer", "")}
        correct = oracle.score(item, response)
        if correct:
            return True, None
        for rule in probe.get("error_rules", []):
            lower = response.lower()
            if all(x.lower() in lower for x in rule.get("must_contain", [])) and all(x.lower() not in lower for x in rule.get("must_not_contain", [])):
                return False, rule["signature"]
        return False, None

    def move(signature: Optional[str], confirmed: bool, abstained: bool) -> Dict[str, Any]:
        if abstained:
            return copy.deepcopy(remediation["ABSTAINED"])
        if signature and signature in remediation:
            candidate = copy.deepcopy(remediation[signature])
            if not confirmed and candidate.get("hypothesis_content"):
                candidate["content"] = candidate["hypothesis_content"]
            candidate.pop("hypothesis_content", None)
            return candidate
        return copy.deepcopy(remediation["DEFAULT"])

    return observer, move


class OracleProviderRegistry:
    """Maps a declared oracle type to an independent verifier factory.

    Learning selects an oracle by capability/type. The course generator cannot
    inject an arbitrary executable verifier and cannot mark its own output valid.
    """

    def __init__(self):
        self._factories: Dict[str, Any] = {}

    def register(self, oracle_type: str, factory: Any) -> None:
        if not oracle_type or not callable(factory):
            raise ValueError("ORACLE_PROVIDER_INVALID")
        existing = self._factories.get(oracle_type)
        if existing is not None and existing is not factory:
            raise ValueError("ORACLE_PROVIDER_COLLISION")
        self._factories[oracle_type] = factory

    def build(self, descriptor: Dict[str, Any], course_blueprint: Dict[str, Any]):
        oracle_type = descriptor.get("type")
        if oracle_type not in self._factories:
            raise ValueError("ORACLE_PROVIDER_UNAVAILABLE:" + str(oracle_type))
        return self._factories[oracle_type](copy.deepcopy(descriptor), copy.deepcopy(course_blueprint))

    @property
    def oracle_types(self) -> List[str]:
        return sorted(self._factories)


def default_open_goal_oracle_registry() -> OracleProviderRegistry:
    reg = OracleProviderRegistry()
    reg.register("SQLITE_SELECT_QUERY", lambda descriptor, blueprint: DeclarativeSQLiteOracle(descriptor, blueprint))
    return reg


def domain_spec_from_dossier(
    dossier: Dict[str, Any], desired_outcome: str, oracle_registry: Optional[OracleProviderRegistry] = None
) -> DomainSpec:
    oracle_registry = oracle_registry or default_open_goal_oracle_registry()
    oracle = oracle_registry.build(dossier["oracle_descriptor"], dossier["course_blueprint"])
    observer, move = _build_tutor_policy(dossier, oracle)

    def factory(*, goal_id: str, title: str, desired_outcome: str, dossier: Dict[str, Any]):
        return compile_course_from_dossier(goal_id=goal_id, title=title, desired_outcome=desired_outcome, dossier=dossier)

    return DomainSpec(
        domain_key=dossier["domain_key"],
        desired_outcome=desired_outcome,
        dossier=copy.deepcopy(dossier),
        course_factory=factory,
        behavior_oracle=oracle,
        generation_adapter_id=dossier.get("generation_adapter_id", OPEN_GOAL_COMPILER_VERSION),
        maintenance_tasks={x["item_id"]: copy.deepcopy(x) for x in dossier["maintenance_tasks"]},
        transfer_tasks={x["item_id"]: copy.deepcopy(x) for x in dossier["transfer_tasks"]},
        transfer_required_skills=set(dossier["transfer_required_skills"]),
        tutor_probes={x["probe_id"]: copy.deepcopy(x) for x in dossier["tutor_probes"]},
        tutor_observer=observer,
        tutor_move=move,
    )


class OpenGoalLearningEngine(DomainGeneralLearningEngine):
    """IMPL-006 bounded open-goal successor.

    Starts with the IMPL-005 registry only. New domains are compiled from runtime
    research bundles and can be reconstructed from persisted dossiers after a
    process restart.
    """

    def __init__(
        self, repo: Repository, corpus: Optional[RuntimeResearchCorpus] = None,
        registry: Optional[DomainRegistry] = None, oracle_registry: Optional[OracleProviderRegistry] = None,
    ):
        self.corpus = corpus or RuntimeResearchCorpus()
        self.goal_interpreter = BoundedGoalInterpreter()
        self.research_planner = OpenGoalResearchPlanner()
        self.source_acquirer = OpenGoalSourceAcquirer()
        self.oracle_registry = oracle_registry or default_open_goal_oracle_registry()
        super().__init__(repo, registry=registry or default_domain_registry())

    def _register_from_dossier(self, dossier: Dict[str, Any], desired_outcome: str) -> DomainSpec:
        spec = domain_spec_from_dossier(dossier, desired_outcome, oracle_registry=self.oracle_registry)
        self.registry.register(spec)
        return self.registry.by_key(spec.domain_key)

    def _spec_for_course(self, course_id: str) -> DomainSpec:
        course = self.course(course_id)
        domain_key = course.get("domain_key")
        if domain_key and not self.registry.has_key(domain_key):
            dossier = self.repo.get_object("research_dossier", course["research_dossier_id"], 1)
            if dossier and dossier.get("course_blueprint") and dossier.get("oracle_descriptor"):
                self._register_from_dossier(dossier, course["desired_outcome"])
        return super()._spec_for_course(course_id)

    def current_projection(self, learner_id: str, course_id: str, skill_id: str, *, now: int) -> Dict[str, Any]:
        self._spec_for_course(course_id)
        return super().current_projection(learner_id, course_id, skill_id, now=now)

    def reproject(self, learner_id: str, course_id: str, skill_id: str, *, now: int) -> Dict[str, Any]:
        self._spec_for_course(course_id)
        return super().reproject(learner_id, course_id, skill_id, now=now)

    def next_action(self, learner_id: str, course_id: str, *, now: int) -> Dict[str, Any]:
        self._spec_for_course(course_id)
        return super().next_action(learner_id, course_id, now=now)

    def create_open_goal_course_job(
        self, *, operation_id: str, job_id: str, goal_id: str, title: str, desired_outcome: str,
        crash_after_phase: Optional[str] = None,
    ) -> Dict[str, Any]:
        payload = {
            "job_id": job_id, "goal_id": goal_id, "title": title, "desired_outcome": desired_outcome,
            "kind": "BOUNDED_OPEN_GOAL", "compiler_version": OPEN_GOAL_COMPILER_VERSION,
        }
        prior = self.repo.operation_result(operation_id, payload)
        if prior:
            return prior
        job = self.repo.get_job(job_id)
        checkpoint = int(job["checkpoint"]) if job else 0

        if checkpoint >= 1:
            interpretation = self.repo.get_object("goal_interpretation", f"INT-{goal_id}", 1)
            if interpretation is None:
                raise ValueError("CHECKPOINT_GOAL_INTERPRETATION_MISSING")
        else:
            interpretation = self.goal_interpreter.interpret(desired_outcome, self.corpus)
            self.repo.put_object("goal_interpretation", f"INT-{goal_id}", 1, interpretation)
            self.repo.save_job(job_id, "RUNNING", "GOAL_INTERPRETED", 1, payload)
            if crash_after_phase == "GOAL_INTERPRETED":
                raise InjectedCrash("crash after open-goal interpretation")

        if checkpoint >= 2:
            plan = self.repo.get_object("research_plan", f"PLAN-{goal_id}", 1)
            if plan is None:
                raise ValueError("CHECKPOINT_RESEARCH_PLAN_MISSING")
        else:
            bundle = self.corpus.get(interpretation["bundle_id"])
            if bundle["version"] != interpretation["bundle_version"]:
                raise ValueError("OPEN_GOAL_BUNDLE_VERSION_DRIFT")
            if digest(bundle) != interpretation["bundle_digest"]:
                raise ValueError("OPEN_GOAL_BUNDLE_DIGEST_DRIFT")
            plan = self.research_planner.plan(interpretation, bundle)
            self.repo.put_object("research_plan", f"PLAN-{goal_id}", 1, plan)
            self.repo.save_job(job_id, "RUNNING", "RESEARCH_PLANNED", 2, payload)
            if crash_after_phase == "RESEARCH_PLANNED":
                raise InjectedCrash("crash after research planning")

        dossier_ref = f"DOSSIER-REF-{goal_id}"
        if checkpoint >= 3:
            ref = self.repo.get_object("open_goal_dossier_ref", dossier_ref, 1)
            if ref is None:
                raise ValueError("CHECKPOINT_OPEN_GOAL_DOSSIER_REF_MISSING")
            dossier = self.repo.get_object("research_dossier", ref["dossier_id"], 1)
            if dossier is None:
                raise ValueError("CHECKPOINT_OPEN_GOAL_DOSSIER_MISSING")
        else:
            bundle = self.corpus.get(interpretation["bundle_id"])
            if bundle["version"] != plan["bundle_version"]:
                raise ValueError("OPEN_GOAL_BUNDLE_VERSION_DRIFT")
            if digest(bundle) != plan["bundle_digest"]:
                raise ValueError("OPEN_GOAL_BUNDLE_DIGEST_DRIFT")
            dossier = self.source_acquirer.acquire(desired_outcome, plan, bundle)
            self.repo.put_object("research_dossier", dossier["dossier_id"], 1, dossier)
            self.repo.put_object("open_goal_dossier_ref", dossier_ref, 1, {"dossier_id": dossier["dossier_id"], "dossier_digest": digest(dossier)})
            self.repo.save_job(job_id, "RUNNING", "SOURCES_ACQUIRED", 3, payload)
            if crash_after_phase == "SOURCES_ACQUIRED":
                raise InjectedCrash("crash after source acquisition")

        spec = self._register_from_dossier(dossier, desired_outcome)
        self.repo.save_job(job_id, "RUNNING", "DYNAMIC_DOMAIN_BOUND", max(checkpoint, 4), payload)
        if crash_after_phase == "DYNAMIC_DOMAIN_BOUND" and checkpoint < 4:
            raise InjectedCrash("crash after dynamic domain binding")

        child_crash = crash_after_phase if crash_after_phase in {"GOAL_CONTRACT", "RESEARCH_FROZEN", "COURSE_GENERATED_VALIDATED"} else None
        course_result = super().create_research_grounded_course_job(
            operation_id=operation_id + ":COURSE",
            job_id=job_id + ":COURSE",
            goal_id=goal_id,
            title=title,
            desired_outcome=desired_outcome,
            crash_after_phase=child_crash,
        )
        self.repo.save_job(job_id, "RUNNING", "COURSE_GENERATED", 5, payload)
        if crash_after_phase == "OPEN_GOAL_COURSE_GENERATED" and checkpoint < 5:
            raise InjectedCrash("crash after open-goal course generation")

        result = dict(course_result)
        result.update({
            "job_id": job_id,
            "course_build_job_id": job_id + ":COURSE",
            "open_goal": True,
            "interpreter_version": interpretation["interpreter_version"],
            "research_plan_id": plan["plan_id"],
            "runtime_bundle_id": interpretation["bundle_id"],
            "runtime_bundle_version": interpretation["bundle_version"],
            "open_goal_compiler_version": OPEN_GOAL_COMPILER_VERSION,
        })
        self.repo.save_job(job_id, "SUCCEEDED", "COMPLETE", 6, payload)
        self.repo.record_operation(operation_id, payload, result)
        self.repo.emit("OpenGoalCurriculumGenerated", result["course_id"], {
            "domain_key": spec.domain_key,
            "bundle_id": interpretation["bundle_id"],
            "dossier_id": dossier["dossier_id"],
            "course_digest": result["course_digest"],
        })
        return result


class OpenGoalTutorDirector(DomainGeneralTutorDirector):
    POLICY_VERSION = "OPEN-GOAL-TUTOR-DIRECTOR-V1"
