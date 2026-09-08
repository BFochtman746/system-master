from pathlib import Path
import json

ROOT = Path(__file__).resolve().parent

required = [
    "LITERARY-PROSE-ENGINE-MASTER-PLAN-v1.md",
    "VOICE-EVOLUTION-AND-DEVELOPMENT-CONTRACT-v1.json",
    "BUILD-AND-QUALIFICATION-ROADMAP-v1.json",
    "MASTER-001-QUALIFICATION-CONTRACT-v1.json",
    "MASTER-001-CLOSURE.md",
]

for name in required:
    if not (ROOT / name).exists():
        raise AssertionError(f"missing required artifact: {name}")

voice = json.loads((ROOT / "VOICE-EVOLUTION-AND-DEVELOPMENT-CONTRACT-v1.json").read_text())
roadmap = json.loads((ROOT / "BUILD-AND-QUALIFICATION-ROADMAP-v1.json").read_text())
qual = json.loads((ROOT / "MASTER-001-QUALIFICATION-CONTRACT-v1.json").read_text())
plan = (ROOT / "LITERARY-PROSE-ENGINE-MASTER-PLAN-v1.md").read_text()

assert voice["voice_hierarchy"] == [
    "AUTHOR_FINGERPRINT", "PROJECT_VOICE", "BOOK_VOICE", "POV_CHARACTER_VOICE", "LOCAL_PASSAGE_STATE"
]
assert set(voice["trait_dispositions"]) == {"PROTECT", "RANGE", "CHALLENGE", "SUPPRESS"}
assert voice["trait_protection_rules"]["frequency_alone_can_protect"] is False
assert "VOICE_EVOLUTION" in voice["voice_change_classes"]
assert "VOICE_DEGRADATION" in voice["voice_change_classes"]
assert voice["uncertainty_policy"] == "RETAIN_ORIGINAL"
assert voice["author_imitation"]["named_author_target"] is False
assert voice["author_imitation"]["nearest_author_target"] is False
assert set(voice["learning_stores"]) == {"STABLE_IDENTITY", "CURRENT_PREFERENCE", "DEVELOPMENT_FRONTIER", "REJECTED_DIRECTION"}

steps = [x["id"] for x in roadmap["steps"]]
assert steps == ["MASTER-001", "STEP-B", "STEP-C", "STEP-D", "STEP-E", "STEP-F", "STEP-G", "STEP-H", "STEP-I", "STEP-J", "STEP-K", "STEP-L", "REAL-BOOK-QUALIFICATION"]
assert roadmap["global_invariants"]["universal_great_prose_score"] is False
assert roadmap["global_invariants"]["retain_original_on_uncertainty"] is True
assert roadmap["global_invariants"]["writer_evaluator_separation"] is True
assert roadmap["global_invariants"]["named_author_imitation_allowed"] is False
assert roadmap["global_invariants"]["unauthorized_full_text_persistence_allowed"] is False
assert roadmap["steps"][1]["bulk_acquisition_allowed"] is False

inherited = qual["inherited_step_a_invariants"]
assert inherited["unauthorized_full_text_persistence_allowed"] is False
assert inherited["author_imitation_objective_allowed"] is False
assert inherited["writer_evaluator_separation"] is True
assert inherited["universal_great_prose_score"] is False
assert inherited["bulk_download_allowed"] is False

required_tokens = [
    "PROTECT", "RANGE", "CHALLENGE", "SUPPRESS",
    "VOICE_DEGRADATION", "VOICE_EVOLUTION",
    "Literary Craft Academy", "Contrastive Craft Foundry",
    "Passage Intelligence Engine", "Independent literary evaluator",
    "Homogenization", "STEP-B", "STEP-L", "RETAIN_ORIGINAL"
]
for token in required_tokens:
    assert token.lower() in plan.lower(), f"master plan missing token: {token}"

assert qual["closure_standing"] == "PASS_STATIC_CONTRACT_QUALIFICATION__NO_CORPUS_INGESTION_STARTED"

print("MASTER-001 VALIDATION: PASS")
print("Validated canonical master plan, voice evolution contract, roadmap, and inherited STEP-A invariants.")
