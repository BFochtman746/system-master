import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
with (HERE / "SPECIALIST-REGISTRY-v2.json").open("r", encoding="utf-8") as f:
    registry = json.load(f)
with (HERE.parent / "unification-001" / "STEP-005-DIMENSION-AUTHORITY-MAP-v1.json").open("r", encoding="utf-8") as f:
    amap = json.load(f)

items = {x["specialist_id"]: x for x in registry["specialists"]}
checks = {
    "character_current": items["CHARACTER_STATE_ARC_v2"]["dimension_count"] == 16,
    "dialogue_current": items["DIALOGUE_PRAGMATICS_CHARACTER_v2"]["dimension_count"] == 20,
    "originality_current": items["ORIGINALITY_DISTINCTIVENESS_v1"]["dimension_count"] == 15,
    "theme_current": items["THEME_SUBTEXT_MOTIF_v1"]["dimension_count"] == 18,
    "pacing_current": items["PACING_NARRATIVE_TIME_v2"]["dimension_count"] == 25,
    "packet012_federated": items["PACKET_012_PROSE_CRAFT"]["dimension_count"] == 56,
    "packet013_federated": items["PACKET_013_READER_EXPERIENCE"]["dimension_count"] == 64,
    "packet013_synthetic_not_human": items["PACKET_013_READER_EXPERIENCE"]["synthetic_not_human"] is True,
    "registry_points_to_map": registry["authority_map"].endswith("STEP-005-DIMENSION-AUTHORITY-MAP-v1.json"),
    "map_counts_align_registry": sum(amap["expected_counts"].values()) == 214,
    "level_zero_rule_present": any("LEVEL_0_NO_CHANGE" in x for x in registry["global_rules"]),
    "correlated_vote_rule_present": any("Correlated findings" in x for x in registry["global_rules"])
}
failed = [k for k,v in checks.items() if not v]
print(f"STEP-005 REGISTRY FIXTURES: {'PASS' if not failed else 'FAIL'} ({len(checks)} cases)")
if failed:
    print(failed)
    raise SystemExit(1)
