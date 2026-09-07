from __future__ import annotations

import ast
import copy
import json
import re
import urllib.request
from dataclasses import asdict
from hashlib import sha256
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Set, Tuple

from .domain_general import DomainRegistry, default_domain_registry
from .engine import InjectedCrash
from .open_goal import (
    OpenGoalLearningEngine,
    OpenGoalTutorDirector,
    OracleProviderRegistry,
    default_open_goal_oracle_registry,
    domain_spec_from_dossier,
)
from .repository import Repository, canonical_json, digest


LIVE_OPEN_GOAL_VERSION = "LIVE-REPLAY-OPEN-GOAL-V1"
RESEARCH_PORT_VERSION = "LIVE-REPLAY-RESEARCH-PORT-V1"
MODEL_PORT_VERSION = "RECORDED-MODEL-PORT-V1"
PYTHON_ORACLE_TYPE = "PYTHON_COMPREHENSION_EXPRESSION"

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


def _stable_id(prefix: str, value: Any, size: int = 12) -> str:
    return f"{prefix}-{sha256(canonical_json(value).encode('utf-8')).hexdigest()[:size].upper()}"


def _normalized_evidence_digest(capture: Dict[str, Any]) -> str:
    return digest({"sources": capture["sources"], "claims": capture["claims"]})


class NormalizedLiveResearchPort:
    """Portable adapter over an externally acquired live web research capture.

    The external web retrieval is normalized into source metadata + bounded claims
    and then replayed deterministically. This avoids pretending the portable
    container has direct internet access while preserving the exact evidence used.
    """

    MIN_SCORE = 2

    def __init__(self, captures: Sequence[Dict[str, Any]]):
        self._captures: Dict[str, Dict[str, Any]] = {}
        for raw in captures:
            cap = copy.deepcopy(raw)
            required = {"capture_id", "capture_version", "domain_key", "goal_terms", "sources", "claims", "normalized_evidence_digest"}
            missing = sorted(required - set(cap))
            if missing:
                raise ValueError("LIVE_RESEARCH_CAPTURE_INCOMPLETE:" + ",".join(missing))
            if _normalized_evidence_digest(cap) != cap["normalized_evidence_digest"]:
                raise ValueError("LIVE_RESEARCH_CAPTURE_DIGEST_MISMATCH")
            if any(s.get("standing") != "ADMITTED" for s in cap["sources"]):
                raise ValueError("LIVE_RESEARCH_UNADMITTED_SOURCE")
            source_ids = {s["source_id"] for s in cap["sources"]}
            if any(c.get("source_id") not in source_ids for c in cap["claims"]):
                raise ValueError("LIVE_RESEARCH_CLAIM_SOURCE_MISSING")
            existing = self._captures.get(cap["capture_id"])
            if existing is not None and digest(existing) != digest(cap):
                raise ValueError("LIVE_RESEARCH_CAPTURE_ID_COLLISION")
            self._captures[cap["capture_id"]] = cap

    def interpret(self, goal: str) -> Dict[str, Any]:
        gt = _tokens(goal)
        candidates: List[Tuple[int, str, Dict[str, Any], List[str]]] = []
        for cid, cap in self._captures.items():
            terms = set(cap.get("goal_terms", [])) | _tokens(cap.get("domain_key", ""))
            overlap = sorted(gt & terms)
            candidates.append((len(overlap), cid, cap, overlap))
        candidates.sort(key=lambda x: (-x[0], x[1]))
        if not candidates or candidates[0][0] < self.MIN_SCORE:
            raise ValueError("LIVE_OPEN_GOAL_UNSUPPORTED_OR_INSUFFICIENT_RESEARCH")
        if len(candidates) > 1 and candidates[1][0] == candidates[0][0]:
            raise ValueError("LIVE_OPEN_GOAL_AMBIGUOUS_RESEARCH_MATCH")
        score, cid, cap, overlap = candidates[0]
        return {
            "interpreter_version": RESEARCH_PORT_VERSION,
            "goal": goal,
            "goal_tokens": sorted(gt),
            "capture_id": cid,
            "capture_version": cap["capture_version"],
            "capture_digest": digest(cap),
            "normalized_evidence_digest": cap["normalized_evidence_digest"],
            "domain_key": cap["domain_key"],
            "matched_terms": overlap,
            "match_score": score,
            "standing": "LIVE_RESEARCH_CAPTURE_SUPPORTED",
        }

    def plan(self, interpretation: Dict[str, Any]) -> Dict[str, Any]:
        cap = self._capture_for(interpretation)
        return {
            "plan_id": _stable_id("LIVE-RPLAN", {"i": interpretation, "sources": [s["source_id"] for s in cap["sources"]]}),
            "planner_version": RESEARCH_PORT_VERSION,
            "capture_id": cap["capture_id"],
            "capture_version": cap["capture_version"],
            "capture_digest": digest(cap),
            "normalized_evidence_digest": cap["normalized_evidence_digest"],
            "domain_key": cap["domain_key"],
            "queries": [interpretation["goal"]],
            "required_authority_classes": sorted({s["authority"] for s in cap["sources"]}),
            "source_ids": [s["source_id"] for s in cap["sources"]],
            "claim_ids": [c["claim_id"] for c in cap["claims"]],
        }

    def acquire(self, goal: str, plan: Dict[str, Any]) -> Dict[str, Any]:
        cap = self._captures.get(plan["capture_id"])
        if cap is None:
            raise ValueError("LIVE_RESEARCH_CAPTURE_NOT_AVAILABLE")
        if digest(cap) != plan["capture_digest"]:
            raise ValueError("LIVE_RESEARCH_CAPTURE_DRIFT")
        if cap["normalized_evidence_digest"] != plan["normalized_evidence_digest"]:
            raise ValueError("LIVE_RESEARCH_EVIDENCE_DRIFT")
        return {
            "dossier_id": _stable_id("LIVE-DOSSIER", {"goal": goal, "capture": cap["capture_id"], "evidence": cap["normalized_evidence_digest"]}),
            "retrieved_date": cap.get("captured_at", "UNKNOWN")[:10],
            "source_policy": cap.get("source_policy", "OFFICIAL_PRIMARY_CURRENT"),
            "domain_key": cap["domain_key"],
            "goal": goal,
            "research_plan": copy.deepcopy(plan),
            "research_capture": {
                "capture_id": cap["capture_id"],
                "capture_version": cap["capture_version"],
                "capture_mode": cap.get("capture_mode", "UNKNOWN"),
                "captured_at": cap.get("captured_at"),
                "capture_digest": digest(cap),
                "normalized_evidence_digest": cap["normalized_evidence_digest"],
                "research_limits": copy.deepcopy(cap.get("research_limits", [])),
            },
            "sources": copy.deepcopy(cap["sources"]),
            "claims": copy.deepcopy(cap["claims"]),
        }

    def _capture_for(self, interpretation: Dict[str, Any]) -> Dict[str, Any]:
        cap = self._captures.get(interpretation["capture_id"])
        if cap is None:
            raise ValueError("LIVE_RESEARCH_CAPTURE_NOT_AVAILABLE")
        if cap["capture_version"] != interpretation["capture_version"]:
            raise ValueError("LIVE_RESEARCH_CAPTURE_VERSION_DRIFT")
        if digest(cap) != interpretation["capture_digest"]:
            raise ValueError("LIVE_RESEARCH_CAPTURE_DRIFT")
        return cap


class HTTPByteFetcher:
    """Actual HTTP fetch transport. Tests use a local HTTP server for portability."""

    def fetch(self, url: str, timeout: float = 10.0) -> Dict[str, Any]:
        req = urllib.request.Request(url, headers={"User-Agent": "SystemMasterLearningLab/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
            return {
                "url": url,
                "status": int(getattr(resp, "status", 200)),
                "content_type": resp.headers.get("Content-Type"),
                "body_sha256": sha256(body).hexdigest(),
                "body_length": len(body),
                "body": body.decode("utf-8", errors="replace"),
            }


class LiveReplayHTTPProbe:
    """Transport self-test helper: capture an HTTP response and replay exact bytes."""

    def __init__(self, fetcher: Optional[HTTPByteFetcher] = None):
        self.fetcher = fetcher or HTTPByteFetcher()

    def capture(self, url: str) -> Dict[str, Any]:
        out = self.fetcher.fetch(url)
        out["capture_version"] = "HTTP-BYTE-CAPTURE-V1"
        return out

    @staticmethod
    def replay(capture: Dict[str, Any]) -> str:
        body = capture.get("body", "")
        if sha256(body.encode("utf-8")).hexdigest() != capture.get("body_sha256"):
            raise ValueError("HTTP_REPLAY_DIGEST_MISMATCH")
        return body


class RecordedModelGenerationPort:
    """Replays a real model-generated candidate with exact provenance/digests.

    The model is a candidate generator only. Independent validators/oracles run
    after generation and the generated trace cannot assert VERIFIED state.
    """

    def __init__(self, traces: Sequence[Dict[str, Any]]):
        self._traces: Dict[str, Dict[str, Any]] = {}
        for raw in traces:
            trace = copy.deepcopy(raw)
            required = {"generation_trace_id", "model_id", "prompt", "prompt_digest", "research_evidence_digest", "output", "output_digest", "trace_digest"}
            missing = sorted(required - set(trace))
            if missing:
                raise ValueError("MODEL_TRACE_INCOMPLETE:" + ",".join(missing))
            if digest(trace["prompt"]) != trace["prompt_digest"]:
                raise ValueError("MODEL_TRACE_PROMPT_DIGEST_MISMATCH")
            if digest(trace["output"]) != trace["output_digest"]:
                raise ValueError("MODEL_TRACE_OUTPUT_DIGEST_MISMATCH")
            unsigned = {k: v for k, v in trace.items() if k != "trace_digest"}
            if digest(unsigned) != trace["trace_digest"]:
                raise ValueError("MODEL_TRACE_DIGEST_MISMATCH")
            out = trace["output"]
            if "validation_status" in out or "verified" in {str(k).lower() for k in out.keys()}:
                raise ValueError("MODEL_OUTPUT_SELF_VERIFICATION_FORBIDDEN")
            existing = self._traces.get(trace["research_evidence_digest"])
            if existing is not None and digest(existing) != digest(trace):
                raise ValueError("MODEL_TRACE_RESEARCH_COLLISION")
            self._traces[trace["research_evidence_digest"]] = trace

    def pin(self, *, desired_outcome: str, dossier: Dict[str, Any]) -> Dict[str, Any]:
        evidence_digest = digest({"sources": dossier["sources"], "claims": dossier["claims"]})
        trace = self._traces.get(evidence_digest)
        if trace is None:
            raise ValueError("MODEL_TRACE_NOT_AVAILABLE_FOR_RESEARCH_EVIDENCE")
        prompt = trace["prompt"]
        if prompt.get("goal") != desired_outcome:
            raise ValueError("MODEL_TRACE_GOAL_MISMATCH")
        if prompt.get("research_dossier_digest") != evidence_digest:
            raise ValueError("MODEL_TRACE_RESEARCH_DIGEST_MISMATCH")
        return {
            "generation_trace_id": trace["generation_trace_id"],
            "trace_digest": trace["trace_digest"],
            "model_id": trace["model_id"],
            "prompt_digest": trace["prompt_digest"],
            "output_digest": trace["output_digest"],
            "research_evidence_digest": evidence_digest,
        }

    def generate(
        self, *, goal_id: str, title: str, desired_outcome: str, dossier: Dict[str, Any],
        pin: Optional[Dict[str, Any]] = None,
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        actual_pin = self.pin(desired_outcome=desired_outcome, dossier=dossier)
        if pin is not None and digest(actual_pin) != digest(pin):
            raise ValueError("MODEL_TRACE_PIN_DRIFT")
        evidence_digest = actual_pin["research_evidence_digest"]
        trace = self._traces[evidence_digest]
        output = copy.deepcopy(trace["output"])
        receipt = {
            "generation_trace_id": trace["generation_trace_id"],
            "model_id": trace["model_id"],
            "model_role": trace.get("model_role", "CANDIDATE_GENERATOR_ONLY"),
            "capture_mode": trace.get("capture_mode", "RECORDED_MODEL_OUTPUT"),
            "captured_at": trace.get("captured_at"),
            "adapter_version": MODEL_PORT_VERSION,
            "prompt_digest": trace["prompt_digest"],
            "research_evidence_digest": evidence_digest,
            "output_digest": trace["output_digest"],
            "trace_digest": trace["trace_digest"],
            "standing": "MODEL_GENERATED_CANDIDATE_NOT_VERIFIED",
        }
        return output, receipt


class CallableModelCapturePort:
    """Testable model-port shape for a future provider gateway.

    A callable stands in for the provider transport; exact prompt/output are
    captured and can then be replayed by RecordedModelGenerationPort.
    """

    def __init__(self, model_id: str, fn: Callable[[Dict[str, Any]], Dict[str, Any]]):
        self.model_id = model_id
        self.fn = fn

    def capture(self, prompt: Dict[str, Any], research_evidence_digest: str) -> Dict[str, Any]:
        output = copy.deepcopy(self.fn(copy.deepcopy(prompt)))
        trace = {
            "generation_trace_id": _stable_id("MODEL-TRACE", {"prompt": prompt, "output": output}),
            "captured_at": "PORTABLE_TEST",
            "capture_mode": "CALLABLE_MODEL_CAPTURE_TEST",
            "model_id": self.model_id,
            "model_role": "CANDIDATE_GENERATOR_ONLY",
            "prompt": copy.deepcopy(prompt),
            "prompt_digest": digest(prompt),
            "research_evidence_digest": research_evidence_digest,
            "output": output,
            "output_digest": digest(output),
        }
        trace["trace_digest"] = digest(trace)
        return trace


class PythonComprehensionOracle:
    """Independent executable oracle for bounded Python comprehension expressions."""

    _ALLOWED_NODE_TYPES = {
        ast.Expression, ast.ListComp, ast.DictComp, ast.comprehension,
        ast.Name, ast.Load, ast.Store, ast.Constant, ast.List, ast.Tuple,
        ast.BinOp, ast.UnaryOp, ast.USub, ast.UAdd, ast.Not, ast.Mult, ast.Pow, ast.Mod, ast.Add, ast.Sub,
        ast.Compare, ast.Eq, ast.NotEq, ast.Gt, ast.GtE, ast.Lt, ast.LtE,
        ast.Call, ast.Attribute,
    }
    _ALLOWED_NAMES = {"range": range, "len": len}
    _ALLOWED_METHODS = {"upper", "lower", "strip"}

    def __init__(self, descriptor: Dict[str, Any], course_blueprint: Dict[str, Any]):
        if descriptor.get("type") != PYTHON_ORACLE_TYPE:
            raise ValueError("PYTHON_ORACLE_DESCRIPTOR_TYPE_MISMATCH")
        self.descriptor = copy.deepcopy(descriptor)
        self.max_nodes = int(descriptor.get("max_ast_nodes", 120))
        self.item_specs: Dict[str, Dict[str, Any]] = {
            x["item_id"]: copy.deepcopy(x.get("oracle_spec", {})) for x in course_blueprint.get("items", [])
        }
        self.lesson_specs: Dict[str, Dict[str, Any]] = {}
        for lesson in course_blueprint.get("lessons", []):
            for ex in lesson.get("worked_examples", []):
                self.lesson_specs[ex["text"]] = copy.deepcopy(ex.get("oracle_spec", {}))
        for row in descriptor.get("additional_task_oracles", []):
            self.item_specs[row["item_id"]] = copy.deepcopy(row["oracle_spec"])

    def _safe_eval(self, expression: str, spec: Dict[str, Any]) -> Any:
        tree = ast.parse(expression.strip(), mode="eval")
        nodes = list(ast.walk(tree))
        if len(nodes) > self.max_nodes:
            raise ValueError("PYTHON_ORACLE_AST_BUDGET_EXCEEDED")
        allow_methods = set(spec.get("allow_methods", []))
        for node in nodes:
            if type(node) not in self._ALLOWED_NODE_TYPES:
                raise ValueError("PYTHON_ORACLE_NODE_FORBIDDEN:" + type(node).__name__)
            if isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name):
                    if node.func.id not in self._ALLOWED_NAMES:
                        raise ValueError("PYTHON_ORACLE_CALL_FORBIDDEN")
                elif isinstance(node.func, ast.Attribute):
                    if node.func.attr not in self._ALLOWED_METHODS or node.func.attr not in allow_methods:
                        raise ValueError("PYTHON_ORACLE_METHOD_FORBIDDEN")
                else:
                    raise ValueError("PYTHON_ORACLE_CALL_FORBIDDEN")
            if isinstance(node, ast.Attribute) and node.attr not in self._ALLOWED_METHODS:
                raise ValueError("PYTHON_ORACLE_ATTRIBUTE_FORBIDDEN")
        return eval(compile(tree, "<learning-oracle>", "eval"), {"__builtins__": {}, **self._ALLOWED_NAMES}, {})

    @staticmethod
    def _normalize(value: Any, spec: Dict[str, Any]) -> Any:
        if isinstance(value, dict) and spec.get("normalize_dict_keys") == "string":
            return {str(k): v for k, v in value.items()}
        return value

    def score(self, item: Dict[str, Any], response: str) -> bool:
        spec = self.item_specs.get(item.get("item_id")) or item.get("oracle_spec")
        if not spec:
            return False
        try:
            got = self._normalize(self._safe_eval(response, spec), spec)
        except Exception:
            return False
        return got == spec.get("expected")

    def validate_reference_items(self, course: Dict[str, Any]) -> Dict[str, Any]:
        failures = []
        checked = 0
        for item in course.get("items", []):
            spec = self.item_specs.get(item["item_id"])
            if not spec:
                failures.append({"item_id": item["item_id"], "error": "ORACLE_SPEC_MISSING"})
                continue
            checked += 1
            if not self.score(item, item["answer"]):
                failures.append({"item_id": item["item_id"], "error": "REFERENCE_ANSWER_BEHAVIOR_MISMATCH"})
        return {"status": "PASS" if not failures else "FAIL", "checked": checked, "failures": failures}

    @staticmethod
    def _expression_from_example(text: str) -> Optional[str]:
        m = re.search(r"`([^`]*)`", text)
        return m.group(1) if m else None

    def validate_lesson_examples(self, course: Dict[str, Any]) -> Dict[str, Any]:
        failures = []
        checked = 0
        for lesson in course.get("lessons", []):
            for text in lesson.get("worked_examples", []):
                spec = self.lesson_specs.get(text)
                expr = self._expression_from_example(text)
                if not spec or not expr:
                    failures.append({"lesson_id": lesson["lesson_id"], "error": "LESSON_EXAMPLE_ORACLE_MISSING", "example": text})
                    continue
                checked += 1
                try:
                    got = self._normalize(self._safe_eval(expr, spec), spec)
                    if got != spec.get("expected"):
                        failures.append({"lesson_id": lesson["lesson_id"], "error": "LESSON_EXAMPLE_BEHAVIOR_MISMATCH", "example": text})
                except Exception as exc:
                    failures.append({"lesson_id": lesson["lesson_id"], "error": type(exc).__name__, "example": text})
        return {"status": "PASS" if not failures else "FAIL", "checked": checked, "failures": failures}


def live_open_goal_oracle_registry() -> OracleProviderRegistry:
    reg = default_open_goal_oracle_registry()
    reg.register(PYTHON_ORACLE_TYPE, lambda descriptor, blueprint: PythonComprehensionOracle(descriptor, blueprint))
    return reg


def _validate_model_package(package: Dict[str, Any], dossier: Dict[str, Any], oracle_registry: OracleProviderRegistry) -> Dict[str, Any]:
    required = {
        "domain_key", "course_blueprint", "oracle_descriptor", "maintenance_tasks", "transfer_tasks",
        "transfer_required_skills", "tutor_probes", "tutor_remediation", "pedagogy_review",
    }
    missing = sorted(required - set(package))
    if missing:
        raise ValueError("MODEL_GENERATED_PACKAGE_INCOMPLETE:" + ",".join(missing))
    if package["domain_key"] != dossier["domain_key"]:
        raise ValueError("MODEL_GENERATED_DOMAIN_MISMATCH")
    if package["oracle_descriptor"].get("type") not in oracle_registry.oracle_types:
        raise ValueError("MODEL_REQUESTED_ORACLE_UNAVAILABLE")
    admitted = {c["claim_id"] for c in dossier["claims"]}
    refs: List[str] = []
    bp = package["course_blueprint"]
    for lesson in bp.get("lessons", []):
        refs += list(lesson.get("explanation_claim_refs", []))
        for ex in lesson.get("worked_examples", []):
            refs += list(ex.get("claim_refs", []))
    for item in bp.get("items", []):
        refs += list(item.get("claim_refs", []))
    for task in package.get("maintenance_tasks", []) + package.get("transfer_tasks", []):
        refs += list(task.get("claim_refs", []))
    for probe in package.get("tutor_probes", []):
        refs += list(probe.get("claim_refs", []))
    for move in package.get("tutor_remediation", {}).values():
        refs += list(move.get("claim_refs", []))
    unknown = sorted(set(refs) - admitted)
    if unknown:
        raise ValueError("MODEL_GENERATED_UNKNOWN_CLAIM_REF:" + ",".join(unknown))
    if not package.get("pedagogy_review"):
        raise ValueError("MODEL_PEDAGOGY_REVIEW_BOUNDARY_MISSING")
    if any(x.get("standing") != "MODEL_PROPOSAL_HUMAN_REVIEW_REQUIRED" for x in package["pedagogy_review"]):
        raise ValueError("MODEL_PEDAGOGY_SELF_APPROVAL_FORBIDDEN")
    # Build now to fail early if the declared independent oracle cannot initialize.
    oracle_registry.build(package["oracle_descriptor"], package["course_blueprint"])
    return {
        "status": "PASS",
        "claim_refs_checked": len(refs),
        "admitted_claims": len(admitted),
        "oracle_type": package["oracle_descriptor"]["type"],
        "human_review_dimensions": [x["dimension"] for x in package["pedagogy_review"]],
    }


class LiveReplayOpenGoalLearningEngine(OpenGoalLearningEngine):
    """IMPL-007 successor with external live-research replay + model candidate trace."""

    def __init__(
        self,
        repo: Repository,
        *,
        research_port: NormalizedLiveResearchPort,
        model_generation_port: RecordedModelGenerationPort,
        registry: Optional[DomainRegistry] = None,
        oracle_registry: Optional[OracleProviderRegistry] = None,
    ):
        self.live_research_port = research_port
        self.model_generation_port = model_generation_port
        self.live_oracle_registry = oracle_registry or live_open_goal_oracle_registry()
        super().__init__(repo, corpus=None, registry=registry or default_domain_registry(), oracle_registry=self.live_oracle_registry)

    def _register_from_dossier(self, dossier: Dict[str, Any], desired_outcome: str):
        spec = domain_spec_from_dossier(dossier, desired_outcome, oracle_registry=self.live_oracle_registry)
        self.registry.register(spec)
        return self.registry.by_key(spec.domain_key)

    def create_live_open_goal_course_job(
        self,
        *,
        operation_id: str,
        job_id: str,
        goal_id: str,
        title: str,
        desired_outcome: str,
        crash_after_phase: Optional[str] = None,
    ) -> Dict[str, Any]:
        payload = {
            "job_id": job_id,
            "goal_id": goal_id,
            "title": title,
            "desired_outcome": desired_outcome,
            "kind": "LIVE_REPLAY_MODEL_OPEN_GOAL",
            "version": LIVE_OPEN_GOAL_VERSION,
        }
        prior = self.repo.operation_result(operation_id, payload)
        if prior:
            return prior
        job = self.repo.get_job(job_id)
        checkpoint = int(job["checkpoint"]) if job else 0

        if checkpoint >= 1:
            interpretation = self.repo.get_object("live_goal_interpretation", f"INT-{goal_id}", 1)
            if interpretation is None:
                raise ValueError("CHECKPOINT_LIVE_GOAL_INTERPRETATION_MISSING")
        else:
            interpretation = self.live_research_port.interpret(desired_outcome)
            self.repo.put_object("live_goal_interpretation", f"INT-{goal_id}", 1, interpretation)
            self.repo.save_job(job_id, "RUNNING", "GOAL_INTERPRETED", 1, payload)
            if crash_after_phase == "GOAL_INTERPRETED":
                raise InjectedCrash("crash after live goal interpretation")

        if checkpoint >= 2:
            plan = self.repo.get_object("live_research_plan", f"PLAN-{goal_id}", 1)
            if plan is None:
                raise ValueError("CHECKPOINT_LIVE_RESEARCH_PLAN_MISSING")
        else:
            plan = self.live_research_port.plan(interpretation)
            self.repo.put_object("live_research_plan", f"PLAN-{goal_id}", 1, plan)
            self.repo.save_job(job_id, "RUNNING", "RESEARCH_PLANNED", 2, payload)
            if crash_after_phase == "RESEARCH_PLANNED":
                raise InjectedCrash("crash after live research planning")

        dossier_ref_id = f"LIVE-DOSSIER-REF-{goal_id}"
        if checkpoint >= 3:
            ref = self.repo.get_object("live_dossier_ref", dossier_ref_id, 1)
            if ref is None:
                raise ValueError("CHECKPOINT_LIVE_DOSSIER_REF_MISSING")
            dossier = self.repo.get_object("research_dossier", ref["dossier_id"], 1)
            if dossier is None or digest(dossier) != ref["dossier_digest"]:
                raise ValueError("CHECKPOINT_LIVE_DOSSIER_MISSING_OR_DRIFTED")
        else:
            dossier = self.live_research_port.acquire(desired_outcome, plan)
            self.repo.put_object("research_dossier", dossier["dossier_id"], 1, dossier)
            self.repo.put_object("live_dossier_ref", dossier_ref_id, 1, {"dossier_id": dossier["dossier_id"], "dossier_digest": digest(dossier)})
            self.repo.save_job(job_id, "RUNNING", "SOURCES_ACQUIRED", 3, payload)
            if crash_after_phase == "SOURCES_ACQUIRED":
                raise InjectedCrash("crash after live source acquisition")

        model_pin_id = f"MODEL-PIN-{goal_id}"
        if checkpoint >= 4:
            model_pin = self.repo.get_object("model_invocation_pin", model_pin_id, 1)
            if model_pin is None:
                raise ValueError("CHECKPOINT_MODEL_PIN_MISSING")
        else:
            model_pin = self.model_generation_port.pin(desired_outcome=desired_outcome, dossier=dossier)
            self.repo.put_object("model_invocation_pin", model_pin_id, 1, model_pin)
            self.repo.save_job(job_id, "RUNNING", "MODEL_PINNED", 4, payload)
            if crash_after_phase == "MODEL_PINNED":
                raise InjectedCrash("crash after model invocation pin")

        model_ref_id = f"MODEL-REF-{goal_id}"
        if checkpoint >= 5:
            model_ref = self.repo.get_object("model_generation_ref", model_ref_id, 1)
            if model_ref is None:
                raise ValueError("CHECKPOINT_MODEL_GENERATION_REF_MISSING")
            package = self.repo.get_object("generated_domain_candidate", model_ref["candidate_id"], 1)
            receipt = self.repo.get_object("model_generation_receipt", model_ref["receipt_id"], 1)
            if package is None or receipt is None:
                raise ValueError("CHECKPOINT_MODEL_GENERATION_MISSING")
            if digest(package) != model_ref["candidate_digest"] or digest(receipt) != model_ref["receipt_digest"]:
                raise ValueError("CHECKPOINT_MODEL_GENERATION_DRIFTED")
        else:
            package, receipt = self.model_generation_port.generate(
                goal_id=goal_id, title=title, desired_outcome=desired_outcome, dossier=dossier, pin=model_pin
            )
            candidate_validation = _validate_model_package(package, dossier, self.live_oracle_registry)
            candidate_id = _stable_id("MODEL-CANDIDATE", {"goal": goal_id, "output": package})
            receipt_id = receipt["generation_trace_id"]
            self.repo.put_object("generated_domain_candidate", candidate_id, 1, package)
            self.repo.put_object("model_generation_receipt", receipt_id, 1, receipt)
            self.repo.put_object("model_candidate_validation", candidate_id, 1, candidate_validation)
            self.repo.put_object("model_generation_ref", model_ref_id, 1, {
                "candidate_id": candidate_id,
                "candidate_digest": digest(package),
                "receipt_id": receipt_id,
                "receipt_digest": digest(receipt),
            })
            self.repo.save_job(job_id, "RUNNING", "MODEL_GENERATED", 5, payload)
            if crash_after_phase == "MODEL_GENERATED":
                raise InjectedCrash("crash after model generation")

        assembled = copy.deepcopy(dossier)
        for key in (
            "course_blueprint", "oracle_descriptor", "maintenance_tasks", "transfer_tasks",
            "transfer_required_skills", "tutor_probes", "tutor_remediation",
        ):
            assembled[key] = copy.deepcopy(package[key])
        assembled["generation_adapter_id"] = f"{MODEL_PORT_VERSION}:{receipt['model_id']}"
        assembled["model_generation"] = copy.deepcopy(receipt)
        assembled["pedagogy_review"] = copy.deepcopy(package["pedagogy_review"])
        assembled_id = dossier["dossier_id"]
        # The base course builder needs the enriched dossier under the same id. If
        # the research-only object already exists, store the enriched version as V2
        # and give the dynamically registered spec that exact V2 body. The child
        # builder later writes/reads the spec dossier as its canonical course input.
        self.repo.put_object("generated_research_dossier", assembled_id, 1, assembled)

        # Bind an independently registered oracle capability before any course can
        # be validated. This is selection of test equipment, not course approval.
        self.live_oracle_registry.build(package["oracle_descriptor"], package["course_blueprint"])
        self.repo.save_job(job_id, "RUNNING", "ORACLE_BOUND", 6, payload)
        if crash_after_phase == "ORACLE_BOUND" and checkpoint < 6:
            raise InjectedCrash("crash after pluggable oracle binding")

        # DomainGeneralLearningEngine needs the model-enriched dossier as the exact
        # immutable input to course compilation. Preserve the research-only dossier
        # separately and give this enriched derivative its own stable identity.
        enriched = copy.deepcopy(assembled)
        enriched["dossier_id"] = _stable_id("GEN-DOSSIER", {"research": dossier["dossier_id"], "model": receipt["output_digest"]})
        spec = domain_spec_from_dossier(enriched, desired_outcome, oracle_registry=self.live_oracle_registry)
        self.registry.register(spec)

        child_crash = crash_after_phase if crash_after_phase in {"GOAL_CONTRACT", "RESEARCH_FROZEN", "COURSE_GENERATED_VALIDATED"} else None
        course_result = super().create_research_grounded_course_job(
            operation_id=operation_id + ":COURSE",
            job_id=job_id + ":COURSE",
            goal_id=goal_id,
            title=title,
            desired_outcome=desired_outcome,
            crash_after_phase=child_crash,
        )
        self.repo.save_job(job_id, "RUNNING", "COURSE_GENERATED", 7, payload)
        if crash_after_phase == "LIVE_OPEN_GOAL_COURSE_GENERATED" and checkpoint < 7:
            raise InjectedCrash("crash after live open-goal course generation")

        verification = {
            "verification_id": f"LIVE-VERIFY-{course_result['course_id']}",
            "course_id": course_result["course_id"],
            "research_capture_id": interpretation["capture_id"],
            "research_capture_digest": interpretation["capture_digest"],
            "research_evidence_digest": interpretation["normalized_evidence_digest"],
            "model_generation_trace_id": receipt["generation_trace_id"],
            "model_output_digest": receipt["output_digest"],
            "oracle_type": package["oracle_descriptor"]["type"],
            "mechanical_status": course_result["validation_status"],
            "human_review_required": True,
            "human_review_dimensions": [x["dimension"] for x in package["pedagogy_review"]],
            "generator_self_approval": False,
        }
        self.repo.put_object("live_open_goal_verification", verification["verification_id"], 1, verification)

        result = dict(course_result)
        result.update({
            "job_id": job_id,
            "course_build_job_id": job_id + ":COURSE",
            "live_open_goal": True,
            "live_open_goal_version": LIVE_OPEN_GOAL_VERSION,
            "research_capture_id": interpretation["capture_id"],
            "research_capture_digest": interpretation["capture_digest"],
            "research_evidence_digest": interpretation["normalized_evidence_digest"],
            "model_generation_trace_id": receipt["generation_trace_id"],
            "model_id": receipt["model_id"],
            "model_output_digest": receipt["output_digest"],
            "oracle_type": package["oracle_descriptor"]["type"],
            "verification_id": verification["verification_id"],
        })
        self.repo.save_job(job_id, "SUCCEEDED", "COMPLETE", 8, payload)
        self.repo.record_operation(operation_id, payload, result)
        self.repo.emit("LiveReplayOpenGoalCourseGenerated", result["course_id"], {
            "domain_key": spec.domain_key,
            "research_capture_id": interpretation["capture_id"],
            "model_trace_id": receipt["generation_trace_id"],
            "oracle_type": package["oracle_descriptor"]["type"],
            "course_digest": result["course_digest"],
        })
        return result


class LiveReplayOpenGoalTutorDirector(OpenGoalTutorDirector):
    POLICY_VERSION = "LIVE-REPLAY-OPEN-GOAL-TUTOR-V1"
