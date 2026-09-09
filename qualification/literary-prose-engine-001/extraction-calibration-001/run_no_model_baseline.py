from __future__ import annotations

import json
from pathlib import Path

from extractor_provider import ExtractionRequest, NoModelAbstentionBaseline, validate_provider_output
from narrative_extraction_calibration import score_corpus


ROOT = Path(__file__).resolve().parent
GOLD_PATH = ROOT / "fixtures" / "SYNTHETIC-STRESS-GOLD-v1.json"


def main() -> None:
    gold = json.loads(GOLD_PATH.read_text(encoding="utf-8"))
    provider = NoModelAbstentionBaseline()
    cases = []
    for case in gold["cases"]:
        request = ExtractionRequest.from_case(case)
        output = provider.extract(request)
        validate_provider_output(request, output)
        cases.append({
            "case_id": output["case_id"],
            "task": output["task"],
            "predictions": output["predictions"],
        })

    receipt = score_corpus(gold, {"prediction_id": provider.provider_id, "cases": cases})
    aggregate = receipt["aggregate"]
    assert receipt["case_count"] == 12
    assert receipt["task_count"] == 9
    assert aggregate["precision"] == 0.0
    assert aggregate["recall"] == 0.0
    assert aggregate["f1"] == 0.0
    assert aggregate["mean_coverage"] == 0.0
    assert aggregate["false_certainty_count"] == 0
    assert aggregate["ambiguity_preservation_rate"] == 1.0
    assert receipt["canonical_state_write_authorized"] is False

    first_case = gold["cases"][0]
    request = ExtractionRequest.from_case(first_case)
    tampered = provider.extract(request)
    tampered["source_sha256"] = "0" * 64
    try:
        validate_provider_output(request, tampered)
        raise AssertionError("tampered source digest should fail")
    except ValueError as exc:
        assert "source digest mismatch" in str(exc)

    authority_tamper = provider.extract(request)
    authority_tamper["canonical_state_write_authorized"] = True
    try:
        validate_provider_output(request, authority_tamper)
        raise AssertionError("provider authority escalation should fail")
    except ValueError as exc:
        assert "cannot authorize canonical state write" in str(exc)

    print("NO_MODEL_EXTRACTION_BASELINE=PASS")
    print(json.dumps({
        "provider_id": provider.provider_id,
        "case_count": receipt["case_count"],
        "task_count": receipt["task_count"],
        "f1": aggregate["f1"],
        "coverage": aggregate["mean_coverage"],
        "false_certainty_count": aggregate["false_certainty_count"],
        "ambiguity_preservation_rate": aggregate["ambiguity_preservation_rate"],
        "source_digest_tamper_rejected": True,
        "canonical_authority_escalation_rejected": True,
        "interpretation": "A perfectly cautious extractor with zero coverage is still a failed extractor; abstention safety cannot substitute for evidence acquisition.",
    }, sort_keys=True))


if __name__ == "__main__":
    main()
