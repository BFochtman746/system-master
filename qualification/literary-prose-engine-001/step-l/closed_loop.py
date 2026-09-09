import hashlib
import importlib.util
import json
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).parents[1]


def _load(name, relative_path):
    path = ROOT / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


STEP_E = _load("lpe_step_e", "step-e/passage_intelligence.py")
STEP_F = _load("lpe_step_f", "step-f/specialist_diagnostics.py")
STEP_G = _load("lpe_step_g", "step-g/contrastive_foundry.py")
STEP_H = _load("lpe_step_h", "step-h/controlled_revision.py")
STEP_I = _load("lpe_step_i", "step-i/independent_evaluator.py")
STEP_J = _load("lpe_step_j", "step-j/voice_preference_learning.py")
STEP_K = _load("lpe_step_k", "step-k/overoptimization_defense.py")

REQUIRED_CLOSURES = {
    "STEP-B": "step-b/STEP-B-CLOSURE.md",
    "STEP-C": "step-c/STEP-C-CLOSURE.md",
    "STEP-D": "step-d/STEP-D-CLOSURE.md",
    "STEP-E": "step-e/STEP-E-CLOSURE.md",
    "STEP-F": "step-f/STEP-F-CLOSURE.md",
    "STEP-G": "step-g/STEP-G-CLOSURE.md",
    "STEP-H": "step-h/STEP-H-CLOSURE.md",
    "STEP-I": "step-i/STEP-I-CLOSURE.md",
    "STEP-J": "step-j/STEP-J-CLOSURE.md",
    "STEP-K": "step-k/STEP-K-CLOSURE.md",
}


def _digest(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _stable_event_id(payload):
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return "LPE-EVT-" + hashlib.sha256(raw).hexdigest()[:20]


def validate_dependency_closures():
    standing = {}
    for step, relative in REQUIRED_CLOSURES.items():
        path = ROOT / relative
        if not path.exists():
            raise ValueError(f"DEPENDENCY_CLOSURE_MISSING:{step}")
        text = path.read_text(encoding="utf-8")
        passed = "Standing: **PASS" in text
        standing[step] = passed
        if not passed:
            raise ValueError(f"DEPENDENCY_NOT_PASS:{step}")
    return standing


def _retrieve_qualified_transforms(catalog, admitted_opportunity_ids):
    qualified = []
    rejected = []
    admitted_opportunity_ids = set(admitted_opportunity_ids)
    for item in catalog:
        transform_id = item.get("transform_id")
        applicable = set(item.get("applicable_opportunity_ids", []))
        if not applicable or not (applicable & admitted_opportunity_ids):
            rejected.append({"transform_id": transform_id, "reason": "TRANSFORM_NOT_BOUND_TO_ADMITTED_OPPORTUNITY"})
            continue
        pair_record = item.get("foundry_pair")
        if not isinstance(pair_record, dict):
            rejected.append({"transform_id": transform_id, "reason": "STEP_G_PAIR_EVIDENCE_REQUIRED"})
            continue
        pair = STEP_G.build_pair(pair_record)
        if pair["qualification"]["outcome"] != "QUALIFIED_CONTRAST":
            rejected.append({
                "transform_id": transform_id,
                "reason": "STEP_G_TRANSFORM_NOT_QUALIFIED",
                "pair_outcome": pair["qualification"]["outcome"],
            })
            continue
        transform = {k: deepcopy(v) for k, v in item.items() if k != "foundry_pair"}
        transform["qualified"] = True
        transform["step_g_pair_id"] = pair["pair_id"]
        qualified.append(transform)
    return qualified, rejected


def _evaluation_case(control, challenger, cfg):
    preference = cfg.get("preference", "CHALLENGER")
    confidence = cfg.get("confidence", "HIGH")
    orientation_confidence = cfg.get("orientation_confidence", confidence)
    labels = {control["candidate_id"]: "A", challenger["candidate_id"]: "B"}
    if cfg.get("break_blinding"):
        labels = {control["candidate_id"]: "ORIGINAL", challenger["candidate_id"]: "B"}

    if preference == "ORIGINAL":
        p1, p2 = "LEFT", "RIGHT"
    elif preference == "TIE":
        p1 = p2 = "TIE"
    elif preference == "POSITION_BIAS":
        p1 = p2 = "LEFT"
    else:
        p1, p2 = "RIGHT", "LEFT"

    o1 = {
        "left_id": control["candidate_id"],
        "right_id": challenger["candidate_id"],
        "preferred": p1,
        "confidence": orientation_confidence,
    }
    o2 = None
    if not cfg.get("omit_swap"):
        o2 = {
            "left_id": challenger["candidate_id"],
            "right_id": control["candidate_id"],
            "preferred": p2,
            "confidence": cfg.get("orientation_two_confidence", orientation_confidence),
        }

    dimensions = deepcopy(cfg.get("dimension_results"))
    if dimensions is None:
        target = (challenger.get("target_dimensions") or ["target_improvement"])[0]
        dimensions = {target: "CHALLENGER_BETTER" if preference not in {"ORIGINAL", "TIE"} else ("ORIGINAL_BETTER" if preference == "ORIGINAL" else "TIE")}
    relevant = deepcopy(cfg.get("purpose_relevant_dimensions")) or list(dimensions.keys())

    case = {
        "original_id": control["candidate_id"],
        "challenger_id": challenger["candidate_id"],
        "blind_labels": labels,
        "orientation_one": o1,
        "regressions": deepcopy(cfg.get("regressions", [])),
        "dimension_results": dimensions,
        "purpose_relevant_dimensions": relevant,
        "critical_comparative_dimensions": deepcopy(cfg.get("critical_comparative_dimensions", [])),
        "confidence": confidence,
        "applicable_constraints": deepcopy(cfg.get("applicable_constraints", [])),
        "named_author_target": cfg.get("named_author_target"),
    }
    if o2 is not None:
        case["orientation_two"] = o2
    if cfg.get("inject_writer_rationale"):
        case["writer_rationale"] = "generator-side claim"
    return case


def _next_sequence(ledger):
    return ledger[-1]["sequence"] + 1 if ledger else 1


def _make_learning_event(project_id, event_type, dimension, direction, subject_digest, evidence_refs, context, sequence, occurred_at, extra=None):
    payload = {
        "project_id": project_id,
        "sequence": sequence,
        "event_type": event_type,
        "dimension": dimension,
        "direction": direction,
        "subject_digest": subject_digest,
        "evidence_refs": list(evidence_refs),
        "context": deepcopy(context or {}),
    }
    event = {
        "event_id": _stable_event_id(payload),
        "project_id": project_id,
        "sequence": sequence,
        "occurred_at": occurred_at,
        "event_type": event_type,
        "authority": STEP_J.EVENT_AUTHORITIES[event_type],
        "dimension": dimension,
        "direction": direction,
        "context": deepcopy(context or {}),
        "subject_digest": subject_digest,
        "evidence_refs": list(evidence_refs),
    }
    if extra:
        event.update(deepcopy(extra))
    return event


def apply_user_learning_event(ledger, event_spec, default_timestamp="2026-01-01T00:00:00+00:00"):
    existing = list(ledger)
    event_type = event_spec["event_type"]
    project_id = event_spec.get("project_id") or (existing[0]["project_id"] if existing else None)
    if not project_id:
        raise ValueError("PROJECT_ID_REQUIRED")
    event = _make_learning_event(
        project_id=project_id,
        event_type=event_type,
        dimension=event_spec.get("dimension", "revision_preference"),
        direction=event_spec.get("direction", "UNSPECIFIED"),
        subject_digest=event_spec.get("subject_digest", "00000000"),
        evidence_refs=event_spec.get("evidence_refs", []),
        context=event_spec.get("context", {}),
        sequence=_next_sequence(existing),
        occurred_at=event_spec.get("occurred_at", default_timestamp),
        extra={k: v for k, v in event_spec.items() if k in {"revoked_event_id", "supersedes_event_id", "named_author_target"}},
    )
    updated = STEP_J.append_event(existing, event)
    return updated, STEP_J.derive_state(updated), event


def run_closed_loop(spec):
    dependency_standing = validate_dependency_closures()
    trace = [{"stage": "DEPENDENCY_AUTHORITY", "status": "PASS", "steps": sorted(dependency_standing)}]
    original_text = spec["original_text"]

    state = STEP_E.construct_passage_state(deepcopy(spec["passage_payload"]))
    trace.append({"stage": "ANALYZE", "status": state["readiness"]["status"]})
    if state["readiness"].get("revision_allowed") is not True:
        return {"disposition": "NO_ACTION", "stop_stage": "ANALYZE", "trace": trace, "original_unchanged": True, "ledger": list(spec.get("ledger", []))}

    selected_ids = {
        row.get("opportunity_id")
        for row in state.get("craft_state", {}).get("opportunity_priority", {}).get("selected", [])
        if row.get("opportunity_id")
    }
    diagnostic_case = {"passage_state": state, "signals": deepcopy(spec.get("diagnostic_signals", []))}
    findings = STEP_F.emit(diagnostic_case)
    adjudication = STEP_F.adjudicate(diagnostic_case, findings)
    admitted_all = [x for x in adjudication.get("opportunities", []) if x.get("status") == "ADMIT"]
    admitted = [x for x in admitted_all if x.get("opportunity_id") in selected_ids]
    bypassed = sorted(x.get("opportunity_id") for x in admitted_all if x.get("opportunity_id") not in selected_ids)
    trace.append({"stage": "DIAGNOSE", "status": adjudication["status"], "upstream_unselected_rejected": bypassed})
    if not admitted:
        return {"disposition": "NO_ACTION", "stop_stage": "DIAGNOSE", "trace": trace, "original_unchanged": True, "ledger": list(spec.get("ledger", []))}

    admitted_ids = {x["opportunity_id"] for x in admitted}
    transforms, retrieval_rejections = _retrieve_qualified_transforms(deepcopy(spec.get("transform_catalog", [])), admitted_ids)
    trace.append({"stage": "RETRIEVE", "status": "QUALIFIED" if transforms else "BLOCKED", "rejections": retrieval_rejections})
    if not transforms:
        return {"disposition": "NO_ACTION", "stop_stage": "RETRIEVE", "trace": trace, "original_unchanged": True, "ledger": list(spec.get("ledger", []))}

    generated = STEP_H.generate_candidate_set(
        state,
        original_text,
        admitted,
        transforms,
        deepcopy(spec.get("revision_requests", [])),
    )
    trace.append({"stage": "REVISE", "status": generated["status"], "rejections": generated.get("rejections", [])})
    candidates = generated.get("candidates", [])
    nonzero = [c for c in candidates if c.get("ambition_level") != "LEVEL_0_NO_CHANGE"]
    if not nonzero:
        return {"disposition": "NO_ACTION", "stop_stage": "REVISE", "trace": trace, "original_unchanged": candidates[0]["candidate_text"] == original_text, "ledger": list(spec.get("ledger", []))}

    control = candidates[0]
    challenger = nonzero[0]
    evaluation = STEP_I.evaluate(_evaluation_case(control, challenger, deepcopy(spec.get("evaluation", {}))))
    trace.append({"stage": "INDEPENDENT_EVALUATE", "status": evaluation["disposition"], "reason": evaluation.get("reason")})

    ledger = list(spec.get("ledger", []))
    project_id = state["identity"]["project_id"]
    learning_dimension = spec.get("learning_dimension") or ((challenger.get("target_dimensions") or ["revision_preference"])[0])
    learning_context = deepcopy(spec.get("learning_context", {}))
    timestamp = spec.get("learning_timestamp", "2026-01-01T00:00:00+00:00")

    if evaluation["disposition"] == "RETAIN_ORIGINAL":
        event = _make_learning_event(
            project_id, "STEP_I_RETAIN_ORIGINAL", learning_dimension, "RETAIN_ORIGINAL",
            _digest(original_text), [evaluation.get("evaluation_id", "STEP-I")], learning_context,
            _next_sequence(ledger), timestamp,
        )
        ledger = STEP_J.append_event(ledger, event)
        learning_state = STEP_J.derive_state(ledger)
        trace.append({"stage": "LEARN", "status": "STEP_I_RETAIN_ORIGINAL_RECORDED", "event_id": event["event_id"]})
        return {"disposition": "RETAIN_ORIGINAL", "stop_stage": "INDEPENDENT_EVALUATE", "trace": trace, "original_unchanged": control["candidate_text"] == original_text, "ledger": ledger, "learning_state": learning_state}

    if evaluation["disposition"] != "ACCEPT_CANDIDATE":
        return {"disposition": evaluation["disposition"], "stop_stage": "INDEPENDENT_EVALUATE", "trace": trace, "original_unchanged": control["candidate_text"] == original_text, "ledger": ledger}

    defense_case = deepcopy(spec.get("defense_case", {}))
    defense_case["project_id"] = project_id
    try:
        defense = STEP_K.assess(defense_case)
    except ValueError as exc:
        trace.append({"stage": "HOMOGENIZATION_DEFENSE", "status": "EVIDENCE_INVALID", "reason": str(exc)})
        return {"disposition": "RETAIN_ORIGINAL", "stop_stage": "HOMOGENIZATION_DEFENSE", "trace": trace, "original_unchanged": control["candidate_text"] == original_text, "ledger": ledger}
    trace.append({"stage": "HOMOGENIZATION_DEFENSE", "status": defense["disposition"], "reason": defense.get("reason")})
    if defense["disposition"] != "PASS_DEFENSE_GATE":
        final = "RETAIN_ORIGINAL" if defense["disposition"] in {"RETAIN_ORIGINAL", "REJECT_OVEROPTIMIZATION"} else "ABSTAIN_HUMAN_REVIEW"
        return {"disposition": final, "stop_stage": "HOMOGENIZATION_DEFENSE", "trace": trace, "original_unchanged": control["candidate_text"] == original_text, "ledger": ledger}

    machine_event = _make_learning_event(
        project_id, "STEP_I_ACCEPT_CANDIDATE", learning_dimension, "ACCEPT_CANDIDATE",
        _digest(challenger["candidate_text"]), [evaluation["evaluation_id"], defense["assessment_id"]], learning_context,
        _next_sequence(ledger), timestamp,
    )
    ledger = STEP_J.append_event(ledger, machine_event)
    trace.append({"stage": "LEARN", "status": "STEP_I_ACCEPT_CANDIDATE_RECORDED", "event_id": machine_event["event_id"]})

    final_disposition = "ACCEPT_CANDIDATE"
    if spec.get("user_learning_event"):
        ledger, learning_state, user_event = apply_user_learning_event(ledger, spec["user_learning_event"], timestamp)
        trace.append({"stage": "LEARN_USER_AUTHORITY", "status": user_event["event_type"], "event_id": user_event["event_id"]})
        if user_event["event_type"] in {"USER_REJECT_CANDIDATE", "USER_RETAIN_ORIGINAL"}:
            final_disposition = "RETAIN_ORIGINAL"
        elif user_event["event_type"] == "USER_MODIFIED_CANDIDATE":
            final_disposition = "USER_MODIFIED_CANDIDATE"
    else:
        learning_state = STEP_J.derive_state(ledger)

    return {
        "disposition": final_disposition,
        "stop_stage": None,
        "trace": trace,
        "original_unchanged": control["candidate_text"] == original_text,
        "accepted_candidate_digest": _digest(challenger["candidate_text"]),
        "ledger": ledger,
        "learning_state": learning_state,
    }
