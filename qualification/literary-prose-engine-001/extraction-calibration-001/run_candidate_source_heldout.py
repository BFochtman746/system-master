from __future__ import annotations

import hashlib
import json
from dataclasses import replace
from pathlib import Path

from cautious_semantic_extractor import CautiousSemanticNarrativeExtractor
from extractor_provider import ExtractionRequest, validate_provider_output
from narrative_extraction_calibration import score_corpus


ROOT = Path(__file__).resolve().parent
HELDOUT_PATH = ROOT / "fixtures" / "SYNTHETIC-SOURCE-HELDOUT-GOLD-v1.json"
DEV_HARNESS_PATH = ROOT / "fixtures" / "SYNTHETIC-STRESS-GOLD-v1.json"
MANIFEST_PATH = ROOT / "SOURCE-HELDOUT-SPLIT-MANIFEST-v1.json"
PROVIDER_PATH = ROOT / "cautious_semantic_extractor.py"


def git_blob_sha(path: Path) -> str:
    data = path.read_bytes()
    header = f"blob {len(data)}\0".encode("ascii")
    return hashlib.sha1(header + data).hexdigest()


def main() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    gold = json.loads(HELDOUT_PATH.read_text(encoding="utf-8"))

    assert manifest["standing"] == "FROZEN_FOR_CANDIDATE_001"
    assert git_blob_sha(DEV_HARNESS_PATH) == manifest["development_harness"]["git_blob_sha"]
    assert git_blob_sha(HELDOUT_PATH) == manifest["source_heldout"]["git_blob_sha"]
    assert gold["contains_user_manuscript"] is False
    assert gold["contains_copyrighted_reference_body"] is False
    assert gold["named_author_target"] is False

    provider_source = PROVIDER_PATH.read_text(encoding="utf-8")
    for forbidden_token in ("gold_labels", "forbidden_labels", "SYNTHETIC-SOURCE-HELDOUT-GOLD", "heldout-"):
        assert forbidden_token not in provider_source, f"provider leaks benchmark token: {forbidden_token}"

    provider = CautiousSemanticNarrativeExtractor()
    cases = []
    abstained_case_ids = []

    for case in gold["cases"]:
        request = ExtractionRequest.from_case(case)
        output = provider.extract(request)
        validate_provider_output(request, output)
        if any(prediction["status"] == "ABSTAIN" for prediction in output["predictions"]):
            abstained_case_ids.append(case["case_id"])
        cases.append({
            "case_id": output["case_id"],
            "task": output["task"],
            "predictions": output["predictions"],
            "predicted_spans": output.get("predicted_spans", []),
        })

    receipt = score_corpus(gold, {
        "prediction_id": provider.provider_id,
        "cases": cases,
    })
    aggregate = receipt["aggregate"]

    assert receipt["case_count"] == 17
    assert receipt["task_count"] == 9
    assert aggregate["precision"] == 1.0
    assert aggregate["recall"] == 0.827586
    assert aggregate["f1"] == 0.90566
    assert aggregate["mean_coverage"] == 0.764706
    assert aggregate["false_certainty_count"] == 0
    assert aggregate["ambiguity_preservation_rate"] == 1.0
    assert aggregate["premature_resolution_rate"] == 0.0
    assert aggregate["mean_span_iou"] == 1.0
    assert receipt["canonical_state_write_authorized"] is False

    expected_abstentions = {
        "heldout-event-002",
        "heldout-causal-002",
        "heldout-epistemic-003",
        "heldout-setup-002",
    }
    assert set(abstained_case_ids) == expected_abstentions

    # Case identifiers are receipt correlation only. They must not change the
    # source-derived candidate observations.
    first = ExtractionRequest.from_case(gold["cases"][0])
    renamed = replace(first, case_id="case-id-must-not-affect-prediction")
    first_output = provider.extract(first)
    renamed_output = provider.extract(renamed)
    assert first_output["predictions"] == renamed_output["predictions"]
    assert first_output.get("predicted_spans", []) == renamed_output.get("predicted_spans", [])

    # Preserve an explicit non-promotion boundary. This first candidate proves
    # source-to-observation plumbing and selective behavior on synthetic heldout
    # evidence; it does not establish learned/general literary competence.
    promotion_authorized = False
    assert promotion_authorized is False

    print("CANDIDATE_SOURCE_HELDOUT_CALIBRATION=PASS")
    print(json.dumps({
        "provider_id": provider.provider_id,
        "source_heldout_corpus": gold["corpus_id"],
        "case_count": receipt["case_count"],
        "task_count": receipt["task_count"],
        "precision": aggregate["precision"],
        "recall": aggregate["recall"],
        "f1": aggregate["f1"],
        "mean_coverage": aggregate["mean_coverage"],
        "false_certainty_count": aggregate["false_certainty_count"],
        "ambiguity_preservation_rate": aggregate["ambiguity_preservation_rate"],
        "premature_resolution_rate": aggregate["premature_resolution_rate"],
        "mean_span_iou": aggregate["mean_span_iou"],
        "mean_brier_score": aggregate["mean_brier_score"],
        "mean_expected_calibration_error": aggregate["mean_expected_calibration_error"],
        "abstained_case_ids": sorted(abstained_case_ids),
        "case_id_independence": True,
        "gold_fixture_imported_by_provider": False,
        "canonical_state_write_authorized": receipt["canonical_state_write_authorized"],
        "promotion_authorized": promotion_authorized,
        "standing": "SYNTHETIC_SOURCE_HELDOUT_PLUMBING_QUALIFIED__NOT_PROMOTED",
    }, sort_keys=True))


if __name__ == "__main__":
    main()
