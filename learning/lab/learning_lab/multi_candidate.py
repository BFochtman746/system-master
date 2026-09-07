from __future__ import annotations

import copy
from dataclasses import asdict
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from .domain_general import DomainGeneralLearningEngine, DomainRegistry, default_domain_registry
from .engine import InjectedCrash, LearningEngine
from .live_open_goal import (
    NormalizedLiveResearchPort,
    RecordedModelGenerationPort,
    LiveReplayOpenGoalLearningEngine,
    _stable_id,
    _validate_model_package,
    live_open_goal_oracle_registry,
)
from .open_goal import OracleProviderRegistry, compile_course_from_dossier, domain_spec_from_dossier
from .real_course import validate_grounding, validate_instructional_design
from .repository import Repository, digest


MULTI_CANDIDATE_VERSION = "STOCHASTIC-MULTI-CANDIDATE-V1"
MULTI_CANDIDATE_MODEL_PORT_VERSION = "RECORDED-STOCHASTIC-MODEL-PORT-V1"
SELECTION_POLICY_VERSION = "INDEPENDENT-PARETO-SELECTION-V1"

_FORBIDDEN_MODEL_SELECTION_KEYS = {
    "winner", "rank", "ranking", "quality_score", "selection_score",
    "recommended_candidate", "selected_candidate", "candidate_selection",
}


def _find_forbidden_selection_keys(value: Any, path: str = "$") -> List[str]:
    found: List[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            key_l = str(key).lower()
            if key_l in _FORBIDDEN_MODEL_SELECTION_KEYS:
                found.append(f"{path}.{key}")
            found.extend(_find_forbidden_selection_keys(child, f"{path}.{key}"))
    elif isinstance(value, list):
        for i, child in enumerate(value):
            found.extend(_find_forbidden_selection_keys(child, f"{path}[{i}]"))
    return found


class StochasticRecordedModelPort:
    """Multiple recorded outputs for one frozen prompt/research evidence identity.

    This adapter models stochastic candidate generation with multiple same-prompt
    recorded outputs. It deliberately does not rank candidates. Exact candidate-set
    identity is pinned before generation so crash recovery cannot silently sample a
    different set.
    """

    def __init__(self, traces: Sequence[Dict[str, Any]]):
        self._by_id: Dict[str, Dict[str, Any]] = {}
        for raw in traces:
            trace = copy.deepcopy(raw)
            required = {
                "generation_trace_id", "model_id", "prompt", "prompt_digest",
                "research_evidence_digest", "output", "output_digest", "trace_digest",
            }
            missing = sorted(required - set(trace))
            if missing:
                raise ValueError("STOCHASTIC_MODEL_TRACE_INCOMPLETE:" + ",".join(missing))
            if digest(trace["prompt"]) != trace["prompt_digest"]:
                raise ValueError("STOCHASTIC_MODEL_PROMPT_DIGEST_MISMATCH")
            if digest(trace["output"]) != trace["output_digest"]:
                raise ValueError("STOCHASTIC_MODEL_OUTPUT_DIGEST_MISMATCH")
            unsigned = {k: v for k, v in trace.items() if k != "trace_digest"}
            if digest(unsigned) != trace["trace_digest"]:
                raise ValueError("STOCHASTIC_MODEL_TRACE_DIGEST_MISMATCH")
            forbidden = _find_forbidden_selection_keys(trace["output"])
            if forbidden:
                raise ValueError("MODEL_CANDIDATE_SELF_RANKING_FORBIDDEN:" + ",".join(forbidden))
            tid = trace["generation_trace_id"]
            prior = self._by_id.get(tid)
            if prior is not None and digest(prior) != digest(trace):
                raise ValueError("STOCHASTIC_MODEL_TRACE_ID_COLLISION")
            self._by_id[tid] = trace

    @property
    def trace_ids(self) -> List[str]:
        return sorted(self._by_id)

    def pin_set(
        self,
        *,
        desired_outcome: str,
        dossier: Dict[str, Any],
        candidate_trace_ids: Optional[Sequence[str]] = None,
    ) -> Dict[str, Any]:
        evidence_digest = digest({"sources": dossier["sources"], "claims": dossier["claims"]})
        traces = [t for t in self._by_id.values() if t["research_evidence_digest"] == evidence_digest]
        if candidate_trace_ids is not None:
            wanted = list(candidate_trace_ids)
            if len(set(wanted)) != len(wanted):
                raise ValueError("STOCHASTIC_CANDIDATE_TRACE_ID_DUPLICATE")
            missing = sorted(set(wanted) - self._by_id.keys())
            if missing:
                raise ValueError("STOCHASTIC_CANDIDATE_TRACE_NOT_AVAILABLE:" + ",".join(missing))
            traces = [self._by_id[x] for x in wanted]
            for t in traces:
                if t["research_evidence_digest"] != evidence_digest:
                    raise ValueError("STOCHASTIC_CANDIDATE_RESEARCH_EVIDENCE_MISMATCH")
        if len(traces) < 2:
            raise ValueError("STOCHASTIC_CANDIDATE_SET_TOO_SMALL")
        output_digests = [t["output_digest"] for t in traces]
        if len(set(output_digests)) != len(output_digests):
            raise ValueError("STOCHASTIC_CANDIDATE_DUPLICATE_OUTPUT")

        prompt_digests = {t["prompt_digest"] for t in traces}
        model_ids = {t["model_id"] for t in traces}
        goals = {t["prompt"].get("goal") for t in traces}
        research_prompt_digests = {t["prompt"].get("research_dossier_digest") for t in traces}
        if len(prompt_digests) != 1:
            raise ValueError("STOCHASTIC_CANDIDATE_PROMPT_MISMATCH")
        if len(model_ids) != 1:
            raise ValueError("STOCHASTIC_CANDIDATE_MODEL_ID_MISMATCH")
        if goals != {desired_outcome}:
            raise ValueError("STOCHASTIC_CANDIDATE_GOAL_MISMATCH")
        if research_prompt_digests != {evidence_digest}:
            raise ValueError("STOCHASTIC_CANDIDATE_PROMPT_RESEARCH_MISMATCH")

        manifest = [
            {
                "generation_trace_id": t["generation_trace_id"],
                "trace_digest": t["trace_digest"],
                "output_digest": t["output_digest"],
                "prompt_digest": t["prompt_digest"],
                "model_id": t["model_id"],
            }
            for t in sorted(traces, key=lambda x: x["generation_trace_id"])
        ]
        pin = {
            "candidate_set_version": MULTI_CANDIDATE_MODEL_PORT_VERSION,
            "research_evidence_digest": evidence_digest,
            "prompt_digest": next(iter(prompt_digests)),
            "model_id": next(iter(model_ids)),
            "candidate_count": len(manifest),
            "manifest": manifest,
        }
        pin["candidate_set_digest"] = digest(pin)
        return pin

    def generate_candidates(
        self, *, desired_outcome: str, dossier: Dict[str, Any], pin: Dict[str, Any]
    ) -> List[Tuple[Dict[str, Any], Dict[str, Any]]]:
        evidence_digest = digest({"sources": dossier["sources"], "claims": dossier["claims"]})
        if evidence_digest != pin.get("research_evidence_digest"):
            raise ValueError("STOCHASTIC_CANDIDATE_PIN_RESEARCH_DRIFT")
        unsigned = {k: v for k, v in pin.items() if k != "candidate_set_digest"}
        if digest(unsigned) != pin.get("candidate_set_digest"):
            raise ValueError("STOCHASTIC_CANDIDATE_SET_PIN_DIGEST_MISMATCH")

        out: List[Tuple[Dict[str, Any], Dict[str, Any]]] = []
        for entry in pin["manifest"]:
            tid = entry["generation_trace_id"]
            trace = self._by_id.get(tid)
            if trace is None:
                raise ValueError("STOCHASTIC_CANDIDATE_TRACE_DRIFT_AFTER_PIN")
            actual_entry = {
                "generation_trace_id": tid,
                "trace_digest": trace["trace_digest"],
                "output_digest": trace["output_digest"],
                "prompt_digest": trace["prompt_digest"],
                "model_id": trace["model_id"],
            }
            if digest(actual_entry) != digest(entry):
                raise ValueError("STOCHASTIC_CANDIDATE_TRACE_DRIFT_AFTER_PIN")
            if trace["prompt"].get("goal") != desired_outcome:
                raise ValueError("STOCHASTIC_CANDIDATE_GOAL_DRIFT_AFTER_PIN")
            package = copy.deepcopy(trace["output"])
            receipt = {
                "generation_trace_id": tid,
                "model_id": trace["model_id"],
                "model_role": trace.get("model_role", "CANDIDATE_GENERATOR_ONLY"),
                "capture_mode": trace.get("capture_mode", "RECORDED_STOCHASTIC_CANDIDATE"),
                "captured_at": trace.get("captured_at"),
                "adapter_version": MULTI_CANDIDATE_MODEL_PORT_VERSION,
                "prompt_digest": trace["prompt_digest"],
                "research_evidence_digest": evidence_digest,
                "output_digest": trace["output_digest"],
                "trace_digest": trace["trace_digest"],
                "standing": "MODEL_GENERATED_CANDIDATE_NOT_VERIFIED_OR_RANKED",
            }
            out.append((package, receipt))
        return out


class CallableStochasticModelCapturePort:
    """Provider-shaped capture adapter for repeated same-prompt generation.

    The callable is invoked once per requested sample. Tests use controlled callables;
    a production model gateway can implement the same boundary. Every invocation is
    captured separately and remains an unverified candidate.
    """

    def __init__(self, model_id: str, fn: Any):
        if not model_id or not callable(fn):
            raise ValueError("STOCHASTIC_CAPTURE_PORT_INVALID")
        self.model_id = model_id
        self.fn = fn

    def capture_candidates(
        self, *, prompt: Dict[str, Any], research_evidence_digest: str, count: int
    ) -> List[Dict[str, Any]]:
        if count < 2:
            raise ValueError("STOCHASTIC_CAPTURE_COUNT_TOO_SMALL")
        traces = []
        for i in range(count):
            output = copy.deepcopy(self.fn(copy.deepcopy(prompt), i))
            if _find_forbidden_selection_keys(output):
                raise ValueError("MODEL_CANDIDATE_SELF_RANKING_FORBIDDEN")
            trace = {
                "generation_trace_id": _stable_id(
                    "STOCH-TRACE", {"model": self.model_id, "prompt": prompt, "index": i, "output": output}
                ),
                "captured_at": "PORTABLE_TEST",
                "capture_mode": "CALLABLE_STOCHASTIC_MODEL_CAPTURE_TEST",
                "model_id": self.model_id,
                "model_role": "CANDIDATE_GENERATOR_ONLY",
                "prompt": copy.deepcopy(prompt),
                "prompt_digest": digest(prompt),
                "research_evidence_digest": research_evidence_digest,
                "sample_index": i,
                "output": output,
                "output_digest": digest(output),
            }
            trace["trace_digest"] = digest(trace)
            traces.append(trace)
        return traces


class IndependentCandidateSelector:
    """Hard-gate each candidate, then use a non-compensatory Pareto rule.

    The policy intentionally has no scalar quality score. A mechanically strong
    candidate is selected only when it uniquely dominates the other qualified
    candidates on predeclared bounded coverage metrics. Ties/incomparability are
    successful abstention outcomes, not arbitrary tie-breaks.
    """

    TRANSFER_DIVERSITY_TARGET = 2

    def __init__(self, oracle_registry: OracleProviderRegistry):
        self.oracle_registry = oracle_registry

    @staticmethod
    def _support_task_oracle(oracle: Any, package: Dict[str, Any]) -> Dict[str, Any]:
        failures: List[str] = []
        checked = 0
        for task in package.get("maintenance_tasks", []) + package.get("transfer_tasks", []):
            checked += 1
            if not oracle.score(task, task.get("answer", "")):
                failures.append(task["item_id"])
        return {"status": "PASS" if not failures else "FAIL", "checked": checked, "failures": failures}

    def evaluate(
        self, *, candidate_id: str, package: Dict[str, Any], receipt: Dict[str, Any], dossier: Dict[str, Any]
    ) -> Dict[str, Any]:
        failures: List[str] = []
        evidence: Dict[str, Any] = {}
        forbidden = _find_forbidden_selection_keys(package)
        if forbidden:
            failures.append("MODEL_SELF_RANKING_PRESENT")
            evidence["forbidden_selection_paths"] = forbidden

        try:
            package_shape = _validate_model_package(package, dossier, self.oracle_registry)
            evidence["package_validation"] = package_shape
        except Exception as exc:
            failures.append("PACKAGE_GATE:" + str(exc))

        course_body: Optional[Dict[str, Any]] = None
        oracle = None
        if not failures:
            assembled = copy.deepcopy(dossier)
            for key in (
                "course_blueprint", "oracle_descriptor", "maintenance_tasks", "transfer_tasks",
                "transfer_required_skills", "tutor_probes", "tutor_remediation",
            ):
                assembled[key] = copy.deepcopy(package[key])
            assembled["generation_adapter_id"] = f"{MULTI_CANDIDATE_MODEL_PORT_VERSION}:{receipt['model_id']}"
            assembled["model_generation"] = copy.deepcopy(receipt)
            assembled["pedagogy_review"] = copy.deepcopy(package["pedagogy_review"])
            assembled["dossier_id"] = _stable_id(
                "MC-EVAL-DOSSIER", {"research": dossier["dossier_id"], "candidate": receipt["output_digest"]}
            )
            try:
                course = compile_course_from_dossier(
                    goal_id="MC-EVAL", title="Candidate evaluation", desired_outcome=dossier["goal"], dossier=assembled
                )
                course_body = asdict(course)
                course_body["domain_key"] = package["domain_key"]
                LearningEngine._validate_course(None, course_body)
                evidence["structure"] = {"status": "PASS"}
            except Exception as exc:
                failures.append("STRUCTURE_GATE:" + str(exc))

            if course_body is not None:
                grounding = validate_grounding(course_body, assembled)
                instructional = validate_instructional_design(course_body)
                evidence["grounding"] = grounding
                evidence["instructional_design"] = instructional
                if grounding["status"] != "PASS":
                    failures.append("GROUNDING_GATE:" + ",".join(grounding["errors"]))
                if instructional["status"] != "PASS":
                    failures.append("INSTRUCTIONAL_GATE:" + ",".join(instructional["errors"]))
                try:
                    oracle = self.oracle_registry.build(package["oracle_descriptor"], package["course_blueprint"])
                    reference = oracle.validate_reference_items(course_body)
                    lessons = oracle.validate_lesson_examples(course_body)
                    support = self._support_task_oracle(oracle, package)
                    evidence["reference_item_oracle"] = reference
                    evidence["lesson_example_oracle"] = lessons
                    evidence["support_task_oracle"] = support
                    if reference["status"] != "PASS":
                        failures.append("REFERENCE_ORACLE_GATE")
                    if lessons["status"] != "PASS":
                        failures.append("LESSON_ORACLE_GATE")
                    if support["status"] != "PASS":
                        failures.append("SUPPORT_TASK_ORACLE_GATE")
                except Exception as exc:
                    failures.append("ORACLE_GATE:" + str(exc))

        # Diversity is based on task semantics, not IDs. This prevents a generator
        # from inflating its selection evidence by cloning one task under new family
        # labels. The target is capped, so extra volume beyond the declared need
        # cannot buy a higher selection standing.
        transfer_signatures = {
            digest({"prompt": x.get("prompt"), "oracle_spec": x.get("oracle_spec")})
            for x in package.get("transfer_tasks", [])
        }
        probe_signatures = {
            digest({"prompt": x.get("prompt"), "oracle_spec": x.get("oracle_spec")})
            for x in package.get("tutor_probes", [])
        }
        # Only independently executable evidence participates in selection. Tutor
        # probe diversity is reported for review but is not a ranking signal because
        # the current probe objects do not carry an independent reference response.
        metrics = {
            "validated_transfer_task_diversity": min(len(transfer_signatures), self.TRANSFER_DIVERSITY_TARGET),
        }
        targets = {
            "validated_transfer_task_diversity": self.TRANSFER_DIVERSITY_TARGET,
        }
        evidence["declared_diagnostic_probe_task_diversity"] = len(probe_signatures)
        return {
            "candidate_id": candidate_id,
            "model_trace_id": receipt["generation_trace_id"],
            "model_output_digest": receipt["output_digest"],
            "policy_version": SELECTION_POLICY_VERSION,
            "hard_gate_status": "PASS" if not failures else "REJECTED",
            "hard_gate_failures": failures,
            "mechanical_metrics": metrics,
            "mechanical_targets": targets,
            "mechanical_target_attainment": {k: metrics[k] >= v for k, v in targets.items()},
            "evidence": evidence,
            "model_rank_used": False,
            "scalar_quality_score": None,
        }

    @staticmethod
    def _dominates(a: Dict[str, int], b: Dict[str, int]) -> bool:
        keys = sorted(a)
        return all(a[k] >= b[k] for k in keys) and any(a[k] > b[k] for k in keys)

    def select(self, reports: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
        qualified = [r for r in reports if r["hard_gate_status"] == "PASS"]
        rejected = [r["candidate_id"] for r in reports if r["hard_gate_status"] != "PASS"]
        if not qualified:
            return {
                "policy_version": SELECTION_POLICY_VERSION,
                "decision": "ABSTAIN",
                "selected_candidate_id": None,
                "reason_codes": ["NO_QUALIFIED_CANDIDATES"],
                "qualified_candidate_ids": [],
                "selection_eligible_candidate_ids": [],
                "rejected_candidate_ids": sorted(rejected),
                "undominated_candidate_ids": [],
                "scalar_ranking_used": False,
                "model_ranking_used": False,
            }

        # Passing correctness/safety gates does not automatically make a candidate
        # selectable. Every predeclared selection-evidence target must also be met.
        # This prevents a merely-valid weak survivor from winning by default after
        # stronger candidates are rejected.
        eligible = [
            r for r in qualified
            if r.get("mechanical_target_attainment")
            and all(r["mechanical_target_attainment"].values())
        ]
        if not eligible:
            return {
                "policy_version": SELECTION_POLICY_VERSION,
                "decision": "ABSTAIN",
                "selected_candidate_id": None,
                "reason_codes": ["NO_SELECTION_ELIGIBLE_CANDIDATES"],
                "qualified_candidate_ids": sorted(r["candidate_id"] for r in qualified),
                "selection_eligible_candidate_ids": [],
                "rejected_candidate_ids": sorted(rejected),
                "undominated_candidate_ids": [],
                "scalar_ranking_used": False,
                "model_ranking_used": False,
            }

        if len(eligible) == 1:
            winner = eligible[0]
            return {
                "policy_version": SELECTION_POLICY_VERSION,
                "decision": "SELECT",
                "selected_candidate_id": winner["candidate_id"],
                "reason_codes": ["ONLY_CANDIDATE_CLEARING_PREDECLARED_SELECTION_EVIDENCE_TARGETS"],
                "qualified_candidate_ids": sorted(r["candidate_id"] for r in qualified),
                "selection_eligible_candidate_ids": [winner["candidate_id"]],
                "rejected_candidate_ids": sorted(rejected),
                "undominated_candidate_ids": [winner["candidate_id"]],
                "winning_metrics": copy.deepcopy(winner["mechanical_metrics"]),
                "scalar_ranking_used": False,
                "model_ranking_used": False,
            }

        undominated: List[Dict[str, Any]] = []
        for candidate in eligible:
            if not any(
                other["candidate_id"] != candidate["candidate_id"]
                and self._dominates(other["mechanical_metrics"], candidate["mechanical_metrics"])
                for other in eligible
            ):
                undominated.append(candidate)
        undominated = sorted(undominated, key=lambda x: x["candidate_id"])
        if len(undominated) != 1:
            return {
                "policy_version": SELECTION_POLICY_VERSION,
                "decision": "ABSTAIN",
                "selected_candidate_id": None,
                "reason_codes": ["NO_UNIQUE_EVIDENCE_DOMINANT_CANDIDATE"],
                "qualified_candidate_ids": sorted(r["candidate_id"] for r in qualified),
                "selection_eligible_candidate_ids": sorted(r["candidate_id"] for r in eligible),
                "rejected_candidate_ids": sorted(rejected),
                "undominated_candidate_ids": [r["candidate_id"] for r in undominated],
                "scalar_ranking_used": False,
                "model_ranking_used": False,
            }
        winner = undominated[0]
        return {
            "policy_version": SELECTION_POLICY_VERSION,
            "decision": "SELECT",
            "selected_candidate_id": winner["candidate_id"],
            "reason_codes": ["UNIQUE_PARETO_DOMINANT_ON_PREDECLARED_MECHANICAL_COVERAGE"],
            "qualified_candidate_ids": sorted(r["candidate_id"] for r in qualified),
            "selection_eligible_candidate_ids": sorted(r["candidate_id"] for r in eligible),
            "rejected_candidate_ids": sorted(rejected),
            "undominated_candidate_ids": [winner["candidate_id"]],
            "winning_metrics": copy.deepcopy(winner["mechanical_metrics"]),
            "scalar_ranking_used": False,
            "model_ranking_used": False,
        }


class StochasticMultiCandidateLearningEngine(LiveReplayOpenGoalLearningEngine):
    """IMPL-008 successor: multiple model candidates + independent select/abstain."""

    def __init__(
        self,
        repo: Repository,
        *,
        research_port: NormalizedLiveResearchPort,
        candidate_model_port: StochasticRecordedModelPort,
        registry: Optional[DomainRegistry] = None,
        oracle_registry: Optional[OracleProviderRegistry] = None,
    ):
        self.candidate_model_port = candidate_model_port
        live_registry = oracle_registry or live_open_goal_oracle_registry()
        # Parent still provides all open-goal runtime/Tutor/domain recovery behavior.
        # Its single-candidate model port is intentionally empty because IMPL-008
        # selects before any course build is authorized.
        super().__init__(
            repo,
            research_port=research_port,
            model_generation_port=RecordedModelGenerationPort([]),
            registry=registry or default_domain_registry(),
            oracle_registry=live_registry,
        )
        self.selector = IndependentCandidateSelector(self.live_oracle_registry)

    def create_multi_candidate_course_job(
        self,
        *,
        operation_id: str,
        job_id: str,
        goal_id: str,
        title: str,
        desired_outcome: str,
        candidate_trace_ids: Sequence[str],
        crash_after_phase: Optional[str] = None,
    ) -> Dict[str, Any]:
        candidate_trace_ids = list(candidate_trace_ids)
        payload = {
            "job_id": job_id,
            "goal_id": goal_id,
            "title": title,
            "desired_outcome": desired_outcome,
            "candidate_trace_ids": sorted(candidate_trace_ids),
            "kind": "STOCHASTIC_MULTI_CANDIDATE_OPEN_GOAL",
            "version": MULTI_CANDIDATE_VERSION,
            "selection_policy_version": SELECTION_POLICY_VERSION,
        }
        prior = self.repo.operation_result(operation_id, payload)
        if prior:
            return prior
        job = self.repo.get_job(job_id)
        checkpoint = int(job["checkpoint"]) if job else 0

        # 1-3: same frozen research path as IMPL-007.
        if checkpoint >= 1:
            interpretation = self.repo.get_object("multi_goal_interpretation", f"MC-INT-{goal_id}", 1)
            if interpretation is None:
                raise ValueError("CHECKPOINT_MULTI_GOAL_INTERPRETATION_MISSING")
        else:
            interpretation = self.live_research_port.interpret(desired_outcome)
            self.repo.put_object("multi_goal_interpretation", f"MC-INT-{goal_id}", 1, interpretation)
            self.repo.save_job(job_id, "RUNNING", "GOAL_INTERPRETED", 1, payload)
            if crash_after_phase == "GOAL_INTERPRETED":
                raise InjectedCrash("crash after multi-candidate goal interpretation")

        if checkpoint >= 2:
            plan = self.repo.get_object("multi_research_plan", f"MC-PLAN-{goal_id}", 1)
            if plan is None:
                raise ValueError("CHECKPOINT_MULTI_RESEARCH_PLAN_MISSING")
        else:
            plan = self.live_research_port.plan(interpretation)
            self.repo.put_object("multi_research_plan", f"MC-PLAN-{goal_id}", 1, plan)
            self.repo.save_job(job_id, "RUNNING", "RESEARCH_PLANNED", 2, payload)
            if crash_after_phase == "RESEARCH_PLANNED":
                raise InjectedCrash("crash after multi-candidate research planning")

        dossier_ref_id = f"MC-DOSSIER-REF-{goal_id}"
        if checkpoint >= 3:
            ref = self.repo.get_object("multi_dossier_ref", dossier_ref_id, 1)
            if ref is None:
                raise ValueError("CHECKPOINT_MULTI_DOSSIER_REF_MISSING")
            dossier = self.repo.get_object("research_dossier", ref["dossier_id"], 1)
            if dossier is None or digest(dossier) != ref["dossier_digest"]:
                raise ValueError("CHECKPOINT_MULTI_DOSSIER_MISSING_OR_DRIFTED")
        else:
            dossier = self.live_research_port.acquire(desired_outcome, plan)
            self.repo.put_object("research_dossier", dossier["dossier_id"], 1, dossier)
            self.repo.put_object("multi_dossier_ref", dossier_ref_id, 1, {
                "dossier_id": dossier["dossier_id"], "dossier_digest": digest(dossier)
            })
            self.repo.save_job(job_id, "RUNNING", "SOURCES_ACQUIRED", 3, payload)
            if crash_after_phase == "SOURCES_ACQUIRED":
                raise InjectedCrash("crash after multi-candidate source acquisition")

        # 4: pin the exact stochastic candidate set before any output is trusted.
        pin_id = f"MC-PIN-{goal_id}"
        if checkpoint >= 4:
            candidate_pin = self.repo.get_object("candidate_set_pin", pin_id, 1)
            if candidate_pin is None:
                raise ValueError("CHECKPOINT_CANDIDATE_SET_PIN_MISSING")
        else:
            candidate_pin = self.candidate_model_port.pin_set(
                desired_outcome=desired_outcome, dossier=dossier, candidate_trace_ids=candidate_trace_ids
            )
            self.repo.put_object("candidate_set_pin", pin_id, 1, candidate_pin)
            self.repo.save_job(job_id, "RUNNING", "CANDIDATE_SET_PINNED", 4, payload)
            if crash_after_phase == "CANDIDATE_SET_PINNED":
                raise InjectedCrash("crash after candidate-set pin")

        # 5: persist all generated candidates. After this checkpoint the model port
        # may disappear and exact recovery is still possible.
        set_ref_id = f"MC-SET-REF-{goal_id}"
        if checkpoint >= 5:
            candidate_set_ref = self.repo.get_object("candidate_set_ref", set_ref_id, 1)
            if candidate_set_ref is None:
                raise ValueError("CHECKPOINT_CANDIDATE_SET_REF_MISSING")
        else:
            generated = self.candidate_model_port.generate_candidates(
                desired_outcome=desired_outcome, dossier=dossier, pin=candidate_pin
            )
            entries = []
            for package, receipt in generated:
                candidate_id = _stable_id("MC-CANDIDATE", {"goal": goal_id, "output": package})
                receipt_id = receipt["generation_trace_id"]
                self.repo.put_object("multi_generated_candidate", candidate_id, 1, package)
                self.repo.put_object("multi_model_generation_receipt", receipt_id, 1, receipt)
                entries.append({
                    "candidate_id": candidate_id,
                    "candidate_digest": digest(package),
                    "receipt_id": receipt_id,
                    "receipt_digest": digest(receipt),
                })
            candidate_set_ref = {
                "candidate_set_digest": candidate_pin["candidate_set_digest"],
                "entries": sorted(entries, key=lambda x: x["candidate_id"]),
            }
            self.repo.put_object("candidate_set_ref", set_ref_id, 1, candidate_set_ref)
            self.repo.save_job(job_id, "RUNNING", "CANDIDATES_GENERATED", 5, payload)
            if crash_after_phase == "CANDIDATES_GENERATED":
                raise InjectedCrash("crash after stochastic candidate generation")

        def load_candidates() -> List[Tuple[str, Dict[str, Any], Dict[str, Any]]]:
            loaded = []
            for entry in candidate_set_ref["entries"]:
                package = self.repo.get_object("multi_generated_candidate", entry["candidate_id"], 1)
                receipt = self.repo.get_object("multi_model_generation_receipt", entry["receipt_id"], 1)
                if package is None or receipt is None:
                    raise ValueError("CHECKPOINT_CANDIDATE_BODY_MISSING")
                if digest(package) != entry["candidate_digest"] or digest(receipt) != entry["receipt_digest"]:
                    raise ValueError("CHECKPOINT_CANDIDATE_BODY_DRIFTED")
                loaded.append((entry["candidate_id"], package, receipt))
            return loaded

        candidates = load_candidates()

        # 6: evaluate every candidate using independent validators/oracles.
        eval_set_id = f"MC-EVAL-SET-{goal_id}"
        if checkpoint >= 6:
            eval_set = self.repo.get_object("candidate_evaluation_set", eval_set_id, 1)
            if eval_set is None:
                raise ValueError("CHECKPOINT_CANDIDATE_EVALUATION_SET_MISSING")
            reports = []
            for rid in eval_set["report_ids"]:
                report = self.repo.get_object("candidate_evaluation", rid, 1)
                if report is None:
                    raise ValueError("CHECKPOINT_CANDIDATE_EVALUATION_MISSING")
                reports.append(report)
        else:
            reports = []
            report_ids = []
            for candidate_id, package, receipt in candidates:
                report = self.selector.evaluate(
                    candidate_id=candidate_id, package=package, receipt=receipt, dossier=dossier
                )
                report_id = f"MC-EVAL-{candidate_id}"
                report["report_id"] = report_id
                self.repo.put_object("candidate_evaluation", report_id, 1, report)
                reports.append(report)
                report_ids.append(report_id)
            eval_set = {
                "evaluation_set_id": eval_set_id,
                "candidate_set_digest": candidate_pin["candidate_set_digest"],
                "policy_version": SELECTION_POLICY_VERSION,
                "report_ids": sorted(report_ids),
                "report_digest": digest(sorted(reports, key=lambda x: x["candidate_id"])),
            }
            self.repo.put_object("candidate_evaluation_set", eval_set_id, 1, eval_set)
            self.repo.save_job(job_id, "RUNNING", "CANDIDATES_EVALUATED", 6, payload)
            if crash_after_phase == "CANDIDATES_EVALUATED":
                raise InjectedCrash("crash after independent candidate evaluation")

        # 7: independent selection or successful abstention.
        decision_id = f"MC-SELECT-{goal_id}"
        if checkpoint >= 7:
            decision = self.repo.get_object("candidate_selection_decision", decision_id, 1)
            if decision is None:
                raise ValueError("CHECKPOINT_CANDIDATE_SELECTION_MISSING")
        else:
            decision = self.selector.select(reports)
            decision["decision_id"] = decision_id
            decision["candidate_set_digest"] = candidate_pin["candidate_set_digest"]
            decision["evaluation_set_digest"] = eval_set["report_digest"]
            decision["research_evidence_digest"] = candidate_pin["research_evidence_digest"]
            self.repo.put_object("candidate_selection_decision", decision_id, 1, decision)
            self.repo.save_job(job_id, "RUNNING", "SELECTION_DECIDED", 7, payload)
            if crash_after_phase == "SELECTION_DECIDED":
                raise InjectedCrash("crash after independent selection decision")

        if decision["decision"] == "ABSTAIN":
            result = {
                "job_id": job_id,
                "course_id": None,
                "state": "ABSTAINED",
                "multi_candidate": True,
                "multi_candidate_version": MULTI_CANDIDATE_VERSION,
                "selection_decision_id": decision_id,
                "selection_decision": "ABSTAIN",
                "selection_reason_codes": decision["reason_codes"],
                "candidate_count": candidate_pin["candidate_count"],
                "qualified_candidate_ids": decision["qualified_candidate_ids"],
                "rejected_candidate_ids": decision["rejected_candidate_ids"],
                "research_evidence_digest": candidate_pin["research_evidence_digest"],
            }
            self.repo.save_job(job_id, "SUCCEEDED", "ABSTAINED", 8, payload)
            self.repo.record_operation(operation_id, payload, result)
            self.repo.emit("MultiCandidateSelectionAbstained", goal_id, result)
            return result

        selected_id = decision["selected_candidate_id"]
        selected = next((x for x in candidates if x[0] == selected_id), None)
        if selected is None:
            raise ValueError("SELECTED_CANDIDATE_BODY_MISSING")
        _, package, receipt = selected
        selected_report = next(r for r in reports if r["candidate_id"] == selected_id)
        if selected_report["hard_gate_status"] != "PASS":
            raise ValueError("SELECTED_CANDIDATE_NOT_QUALIFIED")

        # 8: only the independently selected candidate is allowed into the existing
        # course-build authority path.
        assembled = copy.deepcopy(dossier)
        for key in (
            "course_blueprint", "oracle_descriptor", "maintenance_tasks", "transfer_tasks",
            "transfer_required_skills", "tutor_probes", "tutor_remediation",
        ):
            assembled[key] = copy.deepcopy(package[key])
        assembled["generation_adapter_id"] = f"{MULTI_CANDIDATE_MODEL_PORT_VERSION}:{receipt['model_id']}"
        assembled["model_generation"] = copy.deepcopy(receipt)
        assembled["pedagogy_review"] = copy.deepcopy(package["pedagogy_review"])
        assembled["candidate_selection"] = {
            "decision_id": decision_id,
            "policy_version": SELECTION_POLICY_VERSION,
            "selected_candidate_id": selected_id,
            "candidate_set_digest": candidate_pin["candidate_set_digest"],
            "evaluation_set_digest": eval_set["report_digest"],
        }
        assembled["dossier_id"] = _stable_id(
            "MC-SELECTED-DOSSIER", {
                "research": dossier["dossier_id"], "candidate": receipt["output_digest"], "decision": decision_id
            }
        )
        self.repo.put_object("selected_candidate_dossier", assembled["dossier_id"], 1, assembled)
        spec = domain_spec_from_dossier(assembled, desired_outcome, oracle_registry=self.live_oracle_registry)
        self.registry.register(spec)

        course_result = DomainGeneralLearningEngine.create_research_grounded_course_job(
            self,
            operation_id=operation_id + ":COURSE",
            job_id=job_id + ":COURSE",
            goal_id=goal_id,
            title=title,
            desired_outcome=desired_outcome,
        )
        self.repo.save_job(job_id, "RUNNING", "SELECTED_COURSE_BUILT", 8, payload)
        if crash_after_phase == "SELECTED_COURSE_BUILT" and checkpoint < 8:
            raise InjectedCrash("crash after selected course build")

        verification_id = f"MC-VERIFY-{course_result['course_id']}"
        verification = {
            "verification_id": verification_id,
            "course_id": course_result["course_id"],
            "candidate_set_digest": candidate_pin["candidate_set_digest"],
            "selection_decision_id": decision_id,
            "selected_candidate_id": selected_id,
            "selected_candidate_report_id": selected_report["report_id"],
            "selected_candidate_metrics": selected_report["mechanical_metrics"],
            "rejected_candidate_ids": decision["rejected_candidate_ids"],
            "qualified_candidate_ids": decision["qualified_candidate_ids"],
            "scalar_ranking_used": False,
            "model_ranking_used": False,
            "human_review_required": True,
            "standing": course_result["validation_status"],
        }
        self.repo.put_object("multi_candidate_verification", verification_id, 1, verification)

        result = dict(course_result)
        result.update({
            "job_id": job_id,
            "course_build_job_id": job_id + ":COURSE",
            "multi_candidate": True,
            "multi_candidate_version": MULTI_CANDIDATE_VERSION,
            "candidate_count": candidate_pin["candidate_count"],
            "candidate_set_digest": candidate_pin["candidate_set_digest"],
            "selection_decision_id": decision_id,
            "selection_decision": "SELECT",
            "selection_reason_codes": decision["reason_codes"],
            "selected_candidate_id": selected_id,
            "selected_model_trace_id": receipt["generation_trace_id"],
            "selected_model_output_digest": receipt["output_digest"],
            "verification_id": verification_id,
        })
        self.repo.save_job(job_id, "SUCCEEDED", "COMPLETE", 9, payload)
        self.repo.record_operation(operation_id, payload, result)
        self.repo.emit("StochasticCandidateSelectedAndCourseGenerated", result["course_id"], {
            "selection_decision_id": decision_id,
            "selected_candidate_id": selected_id,
            "candidate_set_digest": candidate_pin["candidate_set_digest"],
            "course_digest": result["course_digest"],
        })
        return result
