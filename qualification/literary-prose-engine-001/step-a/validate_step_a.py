#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FILES = [
    "LITERARY-SOURCE-RIGHTS-PROVENANCE-SCHEMA-v1.json",
    "WORK-EDITION-SOURCE-PASSAGE-IDENTITY-CONTRACT-v1.json",
    "CRAFT-ANNOTATION-ONTOLOGY-v1.json",
    "DERIVED-LITERARY-INTELLIGENCE-SCHEMA-v1.json",
    "PROJECT-VOICE-PROFILE-SCHEMA-v1.json",
    "PROSE-QUALITY-CONDITIONING-AND-PRESERVATION-CONTRACT-v1.json",
    "STEP-A-QUALIFICATION-CONTRACT-v1.json",
]

errors = []
data = {}
for name in FILES:
    path = ROOT / name
    if not path.exists():
        errors.append(f"missing {name}")
        continue
    try:
        data[name] = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        errors.append(f"invalid JSON {name}: {exc}")

if not errors:
    rights = data[FILES[0]]
    expected_rights = {
        "PUBLIC_DOMAIN_FULL_TEXT", "LICENSED_FULL_TEXT",
        "USER_OWNED_OR_AUTHORIZED", "ANALYSIS_ONLY_NO_FULL_TEXT"
    }
    got_rights = set(rights["properties"]["rights_class"]["enum"])
    if got_rights != expected_rights:
        errors.append(f"rights classes mismatch: {sorted(got_rights)}")

    # Rights evidence must be class-bound rather than merely present.
    rights_conditions = rights.get("allOf", [])
    cond_text = json.dumps(rights_conditions, sort_keys=True)
    for token in ["PUBLIC_DOMAIN_DETERMINATION", "LICENSE_GRANT", "OWNERSHIP_ATTESTATION", "EXPLICIT_AUTHORIZATION", "ANALYSIS_ONLY_RESTRICTION", "PERSIST_FULL_TEXT"]:
        if token not in cond_text:
            errors.append(f"rights/evidence binding missing {token}")

    policy = rights.get("policy_invariants", {})
    if "must not be persisted" not in policy.get("analysis_only", ""):
        errors.append("analysis-only persistence prohibition missing")

    identity = data[FILES[1]]
    if set(identity.get("identity_layers", {})) != {"WORK", "EDITION", "SOURCE", "PASSAGE"}:
        errors.append("identity layers must be WORK/EDITION/SOURCE/PASSAGE")
    if "same work/edition/overlap group" not in identity.get("split_integrity", {}).get("rule", ""):
        errors.append("split leakage rule missing")

    ontology = data[FILES[2]]
    all_techniques = {x for vals in ontology.get("layers", {}).values() for x in vals}
    required_techniques = {
        "sentence_rhythm", "pov_fidelity", "narrative_distance", "interiority_density",
        "dialogue_subtext", "scene_tension", "setup_payoff", "pacing", "voice_consistency",
        "rhetorical_structure", "protected_language_fidelity"
    }
    missing = sorted(required_techniques - all_techniques)
    if missing:
        errors.append(f"ontology missing required techniques: {missing}")
    if any("author" in x.lower() for x in all_techniques):
        errors.append("author identity leaked into technique labels")

    derived = data[FILES[3]]
    types = set(derived["$defs"]["base"]["properties"]["artifact_type"]["enum"])
    expected_types = {"CRAFT_PRINCIPLE", "CONTRASTIVE_PAIR", "TECHNIQUE_PROFILE", "REVISION_TRANSFORM", "HARD_NEGATIVE", "REFERENCE_STATE"}
    if types != expected_types:
        errors.append(f"derived artifact families mismatch: {sorted(types)}")
    if "must not contain source passages" not in derived.get("nonreconstructive_rule", ""):
        errors.append("derived-only nonreconstructive rule missing")
    if "named_author_target" not in derived["$defs"]["base"].get("required", []):
        errors.append("derived artifacts must require named_author_target=false")
    tp_required = derived["$defs"]["technique_profile"]["allOf"][1].get("required", [])
    if "author_identity_feature_allowed" not in tp_required:
        errors.append("technique profiles must require author_identity_feature_allowed=false")

    voice = data[FILES[4]]
    anti = voice["properties"]["anti_imitation"]["properties"]
    if anti["named_author_objective_allowed"].get("const") is not False:
        errors.append("named-author objective not hard-disabled")
    if anti["nearest_author_targeting_allowed"].get("const") is not False:
        errors.append("nearest-author targeting not hard-disabled")

    quality = data[FILES[5]]
    if quality.get("universal_great_prose_score") is not False:
        errors.append("universal prose score must be false")
    required_conditions = {"genre", "form", "audience", "project_voice_profile", "pov", "narrative_distance", "scene_or_chapter_function", "pacing_target", "canon_state", "authorial_intent", "protected_language"}
    if set(quality.get("conditioning_required", [])) != required_conditions:
        errors.append("conditioning dimensions are incomplete")
    if quality.get("revision_acceptance", {}).get("default_on_uncertainty") != "RETAIN_ORIGINAL":
        errors.append("uncertainty must retain original")

    qual = data[FILES[6]]
    if qual.get("writer_evaluator_separation") is not True:
        errors.append("writer/evaluator separation missing")
    if qual.get("evaluator_hidden_holdout_gold_access") is not False:
        errors.append("hidden-holdout gold boundary violated")
    if qual.get("author_imitation_objective_allowed") is not False:
        errors.append("author-imitation objective must be prohibited")
    if qual.get("unauthorized_full_text_persistence_allowed") is not False:
        errors.append("unauthorized full-text persistence must be prohibited")
    if qual.get("bulk_download_allowed_in_step_a") is not False:
        errors.append("bulk download must be prohibited in STEP-A")
    if "STEP-A-QUALIFICATION-CONTRACT-v1.json" not in qual.get("required_artifacts", []):
        errors.append("qualification contract must require itself in closure set")
    gate_ids = {g["gate_id"] for g in qual.get("gates", [])}
    for required_gate in {"A-RIGHTS-002", "A-IMITATION-001", "A-QUALITY-001", "A-SEPARATION-001", "A-EVAL-BRIDGE-001", "A-BULK-001"}:
        if required_gate not in gate_ids:
            errors.append(f"missing qualification gate {required_gate}")

if errors:
    print("STEP-A VALIDATION: FAIL")
    for err in errors:
        print(f"- {err}")
    raise SystemExit(1)

print("STEP-A VALIDATION: PASS")
print(f"Validated {len(FILES)} JSON artifacts and cross-contract invariants.")
