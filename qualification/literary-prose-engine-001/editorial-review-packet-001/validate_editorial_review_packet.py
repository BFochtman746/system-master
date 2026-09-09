#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FIXTURES = ROOT / "fixtures" / "EDITORIAL-REVIEW-PACKET-FIXTURES-v1.json"

STAGES = {"DEVELOPMENTAL", "LINE", "COPY", "MECHANICAL"}
REASONS = {"AUTHOR_INTENT", "CANON", "MEANING", "VOICE", "AMBIGUITY", "PRESERVATION_CONFLICT", "SUBJECTIVE_GAIN", "OTHER_NAMED_REASON"}
AUTHORITIES = {"AUTHOR", "HUMAN_EDITOR", "DELEGATED_EDITORIAL_JUDGMENT", "NONE_FOR_INFORMATIONAL_REVIEW"}
REQUIRED = {
    "packet_id", "editorial_stage", "review_scope", "decision_query",
    "escalation_reason", "authority_requirement", "original_retained_default",
    "automatic_resolution_authorized", "automatic_manuscript_mutation_authorized"
}

def validate(packet):
    errors = []
    missing = sorted(REQUIRED - set(packet))
    if missing:
        errors.append("missing:" + ",".join(missing))
    if packet.get("editorial_stage") not in STAGES:
        errors.append("editorial_stage")
    if packet.get("escalation_reason") not in REASONS:
        errors.append("escalation_reason")
    if packet.get("authority_requirement") not in AUTHORITIES:
        errors.append("authority_requirement")
    for key in ("packet_id", "review_scope", "decision_query"):
        if not isinstance(packet.get(key), str) or not packet.get(key, "").strip():
            errors.append(key)
    if packet.get("original_retained_default") is not True:
        errors.append("original_retained_default")
    if packet.get("automatic_resolution_authorized") is not False:
        errors.append("automatic_resolution_authorized")
    if packet.get("automatic_manuscript_mutation_authorized") is not False:
        errors.append("automatic_manuscript_mutation_authorized")
    if packet.get("publication_authorized") not in (None, False):
        errors.append("publication_authorized")
    if packet.get("canon_replacement_authorized") not in (None, False):
        errors.append("canon_replacement_authorized")
    return errors

def main():
    data = json.loads(FIXTURES.read_text(encoding="utf-8"))
    failures = []
    for packet in data["positive"]:
        errors = validate(packet)
        if errors:
            failures.append({"positive": packet.get("packet_id"), "errors": errors})
    for case in data["negative"]:
        errors = validate(case["packet"])
        if not errors:
            failures.append({"negative": case["name"], "errors": ["unexpected_pass"]})
    result = {
        "contract": "LITERARY-EDITORIAL-REVIEW-PACKET-HARDENING-004-v1",
        "positive_cases": len(data["positive"]),
        "negative_cases": len(data["negative"]),
        "failures": failures,
        "standing": "PASS" if not failures else "FAIL"
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    raise SystemExit(0 if not failures else 1)

if __name__ == "__main__":
    main()
