#!/usr/bin/env python3
"""Independent synthetic/nonblind qualification for blind prediction-seal integrity."""
from __future__ import annotations

import copy
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
VALIDATOR = HERE / "validate_blind_prediction_seal.py"


def digest(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def contract():
    return {
        "contract_id": "SYNTHETIC-BLIND-CONTRACT",
        "objective": "SYNTHETIC-BLIND-SCORING",
        "blind_branch": "synthetic-blind-branch",
        "cases": [
            {"case_id": f"SYNTH-CASE-{i:03d}", "passage_sha256": digest(f"synthetic-passage-{i}")}
            for i in range(1, 7)
        ],
    }


def seal(c):
    values = [
        ("REAL_LIMITATION", "LIMITATION", 0.91, None, True),
        ("WORKING_AS_INTENDED", "STRENGTH", 0.88, None, True),
        ("NEUTRAL_OBSERVATION", "NO_FINDING", 0.76, None, True),
        ("UNCERTAIN", "BLOCKED", 0.45, "insufficient independent evidence", False),
        ("WORKING_AS_INTENDED", "RISK", 0.67, None, True),
        ("NEUTRAL_OBSERVATION", "OPPORTUNITY_SUPPORT", 0.64, None, True),
    ]
    return {
        "seal_id": "SYNTHETIC-PREDICTION-SEAL",
        "contract_id": c["contract_id"],
        "objective": c["objective"],
        "evaluation_branch": c["blind_branch"],
        "prediction_records": [
            {
                "case_id": case["case_id"],
                "passage_sha256": case["passage_sha256"],
                "semantic_disposition": values[i][0],
                "step_f_finding_class": values[i][1],
                "confidence": values[i][2],
                "abstention_or_downgrade_reason": values[i][3],
                "diagnosis_allowed": values[i][4],
                "revision_allowed": False,
            }
            for i, case in enumerate(c["cases"])
        ],
        "raw_prose_present": False,
        "candidate_prose_present": False,
        "manuscript_mutated": False,
        "revision_authority": False,
        "author_labels_accessed_before_seal": False,
    }


def validate(c, s):
    import importlib.util
    spec = importlib.util.spec_from_file_location("seal_validator", VALIDATOR)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module, module.validate(c, s)


def rejected(c, s, token):
    _, result = validate(c, s)
    assert result["standing"] == "REJECT", result
    assert any(token in error for error in result["errors"]), result


def main():
    c = contract()
    base = seal(c)
    module, result = validate(c, base)
    assert result["standing"] == "PASS", result
    assert len(result["normalized"]["prediction_records"]) == 6

    shuffled = copy.deepcopy(base)
    shuffled["prediction_records"].reverse()
    _, shuffled_result = validate(c, shuffled)
    assert shuffled_result["standing"] == "PASS"
    assert module.canonical_bytes(result["normalized"]) == module.canonical_bytes(shuffled_result["normalized"])

    bad = copy.deepcopy(base); bad["prediction_records"].pop()
    rejected(c, bad, "PREDICTION_CASES_MISSING")
    bad = copy.deepcopy(base); bad["prediction_records"][1] = copy.deepcopy(bad["prediction_records"][0])
    rejected(c, bad, "RECORD_CASE_DUPLICATE")
    bad = copy.deepcopy(base); bad["prediction_records"][0]["case_id"] = "SYNTH-UNEXPECTED"
    rejected(c, bad, "RECORD_CASE_UNEXPECTED")
    bad = copy.deepcopy(base); bad["prediction_records"][0]["passage_sha256"] = "0" * 64
    rejected(c, bad, "RECORD_DIGEST_MISMATCH")
    bad = copy.deepcopy(base); bad["prediction_records"][0]["semantic_disposition"] = "BETTER_PROSE"
    rejected(c, bad, "RECORD_SEMANTIC_DISPOSITION_INVALID")
    bad = copy.deepcopy(base); bad["prediction_records"][0]["step_f_finding_class"] = "AUTHOR_ERROR"
    rejected(c, bad, "RECORD_FINDING_CLASS_INVALID")
    bad = copy.deepcopy(base); bad["prediction_records"][0]["confidence"] = True
    rejected(c, bad, "RECORD_CONFIDENCE_INVALID")
    bad = copy.deepcopy(base); bad["prediction_records"][0]["confidence"] = 1.01
    rejected(c, bad, "RECORD_CONFIDENCE_INVALID")
    bad = copy.deepcopy(base); bad["prediction_records"][0]["revision_allowed"] = True
    rejected(c, bad, "RECORD_REVISION_AUTHORITY_FORBIDDEN")
    bad = copy.deepcopy(base); bad["prediction_records"][0]["diagnosis_allowed"] = "yes"
    rejected(c, bad, "RECORD_DIAGNOSIS_ALLOWED_BOOL_REQUIRED")
    bad = copy.deepcopy(base); bad["prediction_records"][3]["abstention_or_downgrade_reason"] = None
    rejected(c, bad, "RECORD_REASON_REQUIRED")
    bad = copy.deepcopy(base); bad["raw_prose_present"] = True
    rejected(c, bad, "FIXED_VALUE_MISMATCH:raw_prose_present")
    bad = copy.deepcopy(base); bad["candidate_prose_present"] = True
    rejected(c, bad, "FIXED_VALUE_MISMATCH:candidate_prose_present")
    bad = copy.deepcopy(base); bad["manuscript_mutated"] = True
    rejected(c, bad, "FIXED_VALUE_MISMATCH:manuscript_mutated")
    bad = copy.deepcopy(base); bad["author_labels_accessed_before_seal"] = True
    rejected(c, bad, "FIXED_VALUE_MISMATCH:author_labels_accessed_before_seal")
    bad = copy.deepcopy(base); bad["ground_truth"] = []
    rejected(c, bad, "PROHIBITED_FIELD")
    bad = copy.deepcopy(base); bad["prediction_records"][0]["candidate_text"] = "synthetic"
    rejected(c, bad, "PROHIBITED_FIELD")
    bad = copy.deepcopy(base); bad["unexpected"] = False
    rejected(c, bad, "TOP_FIELDS_EXTRA")
    bad = copy.deepcopy(base); bad["prediction_records"][0]["unexpected"] = False
    rejected(c, bad, "FIELDS_EXTRA")

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        cpath, spath, target, rpath = tmp/"contract.json", tmp/"seal.json", tmp/"created.json", tmp/"result.json"
        cpath.write_text(json.dumps(c), encoding="utf-8")
        spath.write_text(json.dumps(base), encoding="utf-8")
        first = subprocess.run(
            [sys.executable, str(VALIDATOR), "--contract", str(cpath), "--candidate", str(spath),
             "--create-target", str(target), "--result", str(rpath)],
            capture_output=True, text=True
        )
        assert first.returncode == 0, first.stdout + first.stderr
        assert json.loads(rpath.read_text())["create_result"] == "CREATED"
        assert target.read_bytes() == module.canonical_bytes(result["normalized"])
        second = subprocess.run(
            [sys.executable, str(VALIDATOR), "--contract", str(cpath), "--candidate", str(spath),
             "--create-target", str(target), "--result", str(rpath)],
            capture_output=True, text=True
        )
        assert second.returncode == 2, second.stdout + second.stderr
        second_result = json.loads(rpath.read_text())
        assert second_result["create_result"] == "REFUSED"
        assert "SEAL_ALREADY_EXISTS" in second_result["errors"]

    print("PROSE BLIND PREDICTION SEAL VALIDATOR FIXTURES: PASS (23 cases)")
    print("FROZEN CASE IDS OR DIGESTS USED: false")
    print("AUTHOR LABELS OR PRIVATE MANUSCRIPT BYTES USED: false")
    print("PREDICTIONS CREATED: 0")
    print("REVISION AUTHORITY: false")


if __name__ == "__main__":
    main()
