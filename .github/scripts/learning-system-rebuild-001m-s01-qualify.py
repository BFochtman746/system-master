#!/usr/bin/env python3
import base64
import csv
import gzip
import hashlib
import io
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MAT_PATH = ROOT / "qualification/learning/rebuild/LEARNING-SYSTEM-REBUILD-001M-S01-ACTIVE-CONSTITUTION.json"
CONTRACT_PATH = ROOT / "qualification/learning/rebuild/LEARNING-SYSTEM-REBUILD-001M-S01-36CASE-QUALIFICATION-CONTRACT.json"
REQ_PATH = ROOT / "qualification/learning/ownership/LRN-OWNERSHIP-FREEZE-001B-R3B-S02-R2-REQUIREMENTS.csv.gz.b64"
IFACE_PATH = ROOT / "qualification/learning/ownership/LRN-OWNERSHIP-FREEZE-001B-R3B-S02-R2-INTERFACES.csv.gz.b64"
OBJ_MANIFEST_PATH = ROOT / "qualification/learning/ownership/LRN-OWNERSHIP-FREEZE-001B-R2-RECOVERED-AUTHORITY-MANIFEST.json"

EXPECTED_PARENT = "39786d38f2b51777a9adee26ce7e5a4bae771857"
EXPECTED_REQ_SHA = "63554c37366c2718e1453c56c4765d9a5a49621495a522ca8be26417c1d977a2"
EXPECTED_IFACE_SHA = "4f4387956bd8189b7a65f5de94ab3c722cb34f249ebe8a94ad74b4c0d0c3cbc0"
EXPECTED_OBJ_SHA = "a3cf9f19e5100bf66e45cc5a8c8e7f652a8d54c0dcae0b3adbe52a0157706120"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def decode_csv_carrier(path: Path):
    encoded = path.read_text(encoding="utf-8").strip()
    decoded = gzip.decompress(base64.b64decode(encoded))
    digest = hashlib.sha256(decoded).hexdigest()
    text = decoded.decode("utf-8")
    rows = list(csv.DictReader(io.StringIO(text)))
    return digest, rows


def find_id_column(rows, candidates):
    if not rows:
        raise AssertionError("empty CSV")
    keys = list(rows[0].keys())
    lowered = {k.lower(): k for k in keys}
    for candidate in candidates:
        if candidate.lower() in lowered:
            return lowered[candidate.lower()]
    raise AssertionError(f"no ID column found; headers={keys}")


def git_blob_sha(path: Path):
    rel = path.relative_to(ROOT)
    return subprocess.check_output(
        ["git", "hash-object", str(rel)], cwd=ROOT, text=True
    ).strip()


def contains_id(extension_rows, wanted):
    for row in extension_rows:
        if row.get("id") == wanted:
            return True
        if wanted in row.get("ids", []):
            return True
    return False


def main():
    material = load_json(MAT_PATH)
    contract = load_json(CONTRACT_PATH)
    req_sha, req_rows = decode_csv_carrier(REQ_PATH)
    iface_sha, iface_rows = decode_csv_carrier(IFACE_PATH)
    obj_manifest = load_json(OBJ_MANIFEST_PATH)

    req_id_col = find_id_column(req_rows, ["active_requirement_id", "requirement_id", "id", "requirement"])
    iface_id_col = find_id_column(iface_rows, ["active_interface_id", "interface_id", "id", "interface"])
    req_ids = [r[req_id_col] for r in req_rows]
    iface_ids = [r[iface_id_col] for r in iface_rows]

    new_req = material["new_requirements"]
    new_ifaces = material["new_interfaces"]
    new_objs = material["new_semantic_objects"]
    new_req_ids = [r["id"] for r in new_req]
    new_iface_ids = [r["id"] for r in new_ifaces]
    new_obj_ids = [r["id"] for r in new_objs]

    recovered = obj_manifest["recovered_refreeze"]
    recovered_obj_count = recovered["active_denominator"]["semantic_objects"]
    object_file = next(
        f for f in obj_manifest["recovered_files"]
        if f["name"] == "LRN_OWNERSHIP_FREEZE_001C_OBJECTS.csv"
    )

    iface_by_id = {row["id"]: row for row in new_ifaces}
    obj_by_id = {row["id"]: row for row in new_objs}
    deferred = {row["id"]: row for row in material["deferred_authority_gaps"]}
    invariants = "\n".join(material["authority_invariants"])
    extensions = material["existing_extensions"]

    head_parent = subprocess.check_output(
        ["git", "rev-parse", "HEAD^"], cwd=ROOT, text=True
    ).strip()

    checks = {}
    checks["T01"] = head_parent == EXPECTED_PARENT
    checks["T02"] = (
        material["parent"]["operation"] == "LEARNING-SYSTEM-REBUILD-001L"
        and material["parent"]["branch"] == "learning/system-rebuild-001l-constitutional-reconciliation-20260912"
        and material["parent"]["commit"] == EXPECTED_PARENT
    )
    checks["T03"] = len(req_rows) == 116 and material["baseline"]["requirements"]["count"] == 116
    checks["T04"] = len(iface_rows) == 112 and material["baseline"]["interfaces"]["count"] == 112
    checks["T05"] = recovered_obj_count == 28 and material["baseline"]["semantic_objects"]["count"] == 28
    checks["T06"] = req_sha == EXPECTED_REQ_SHA == material["baseline"]["requirements"]["decoded_sha256"]
    checks["T07"] = iface_sha == EXPECTED_IFACE_SHA == material["baseline"]["interfaces"]["decoded_sha256"]
    checks["T08"] = object_file["sha256"] == EXPECTED_OBJ_SHA == material["baseline"]["semantic_objects"]["recovered_source_sha256"]
    checks["T09"] = len(req_ids) == len(set(req_ids))
    checks["T10"] = len(iface_ids) == len(set(iface_ids))
    checks["T11"] = new_req_ids == [f"LRN-{n}" for n in range(151, 159)]
    checks["T12"] = new_iface_ids == [f"I{n}" for n in range(111, 115)]
    checks["T13"] = new_obj_ids == [f"LRN-E{n:03d}" for n in range(27, 30)]
    checks["T14"] = not (set(new_req_ids) & set(req_ids))
    checks["T15"] = not (set(new_iface_ids) & set(iface_ids))
    checks["T16"] = (
        116 + len(new_req) == 124
        and 112 + len(new_ifaces) == 116
        and 28 + len(new_objs) == 31
        and material["active_constitution"] == {
            "requirements": 124,
            "interfaces": 116,
            "semantic_objects": 31,
            "delta": {
                "requirements_added": 8,
                "interfaces_added": 4,
                "semantic_objects_added": 3,
                "baseline_rows_deleted": 0,
                "baseline_rows_reowned": 0
            }
        }
    )
    checks["T17"] = material["active_constitution"]["delta"]["baseline_rows_deleted"] == 0
    checks["T18"] = material["active_constitution"]["delta"]["baseline_rows_reowned"] == 0
    checks["T19"] = iface_by_id["I111"]["kind"] == "QUERY" and iface_by_id["I111"]["object"] == "LRN-E027" and "Read-only" in iface_by_id["I111"]["rule"]
    checks["T20"] = iface_by_id["I112"]["kind"] == "COMMAND" and iface_by_id["I112"]["object"] == "LRN-E028" and "never direct mastery mutation" in iface_by_id["I112"]["rule"]
    checks["T21"] = iface_by_id["I113"]["kind"] == "COMMAND" and iface_by_id["I113"]["object"] == "LRN-E029" and "generic assignment/statistics remain shared" in iface_by_id["I113"]["rule"]
    checks["T22"] = iface_by_id["I114"]["kind"] == "QUERY" and iface_by_id["I114"]["object"] == "LRN-E029" and "product-wide effectiveness" in iface_by_id["I114"]["rule"]
    checks["T23"] = obj_by_id["LRN-E027"]["class"] == "VERSIONED_DERIVED_PROJECTION" and "mastery" in obj_by_id["LRN-E027"]["non_authority"]
    checks["T24"] = obj_by_id["LRN-E028"]["class"] == "APPEND_ORIENTED_OBSERVATION" and all(x in obj_by_id["LRN-E028"]["non_authority"] for x in ["mastery", "competence", "diagnosis", "psychological profile"])
    checks["T25"] = obj_by_id["LRN-E029"]["class"] == "VERSIONED_EVALUATION_DESCRIPTOR_PROJECTION" and all(x in obj_by_id["LRN-E029"]["non_authority"] for x in ["generic statistics", "assessment validity", "certification", "eligibility"])
    checks["T26"] = deferred["LRN-069 / LRN-EXT-002"]["standing"] == "UNRESOLVED_DENY_BY_DEFAULT"
    checks["T27"] = deferred["S04_EXTERNAL_ASYNC_SCORE_INGRESS"]["standing"] == "UNRESOLVED_FAIL_CLOSED" and "No callback/interface is invented" in deferred["S04_EXTERNAL_ASYNC_SCORE_INGRESS"]["rule"]
    checks["T28"] = "No AI Tutor peer authority" in invariants
    checks["T29"] = "second mastery writer" in invariants and "generic statistics platform" in invariants and "generic integration platform" in invariants

    foundation_rows = material["foundation_artifact_integrity"]
    foundation_d_to_k = [r for r in foundation_rows if r["capability"] in {"001D","001E","001F","001G","001H","001I","001J","001K"}]
    l_rows = [r for r in foundation_rows if r["capability"].startswith("001L")]
    checks["T30"] = len(foundation_d_to_k) == 8 and all(git_blob_sha(ROOT / r["path"]) == r["git_blob_sha"] for r in foundation_d_to_k)
    checks["T31"] = len(l_rows) == 3 and all(git_blob_sha(ROOT / r["path"]) == r["git_blob_sha"] for r in l_rows)
    checks["T32"] = all(contains_id(extensions, wanted) for wanted in ["LRN-E012","LRN-E013","LRN-E014","LRN-E015","LRN-E016","LRN-E017","LRN-E020-C","LRN-E020-L","LRN-E021","LRN-E026"])
    checks["T33"] = material["historical_lineage"] == {"requirements":110,"interfaces":110,"semantic_objects":26,"rule":"Historical lineage remains immutable provenance."}
    checks["T34"] = all(term in invariants for term in ["person identity", "generic artifact bytes", "generic jobs/runtime", "scheduler/delivery", "transport", "generic evidence/provenance substrate", "rights/licensing", "privacy/security authorization", "generic model assurance/statistics", "credential signing/serialization", "certification", "hiring", "licensing", "eligibility decisions"])
    checks["T35"] = material["runtime_gate"]["next_slice_allowed_only_after_s01_isolated_and_cumulative_pass"].startswith("001M-S02") and material["runtime_gate"]["no_pass_transfer"] is True
    checks["T36"] = material["runtime_gate"]["runtime_behavior_implemented_by_s01"] is False and material["status"] == "MATERIALIZED_CONSTITUTION_SUBJECT__RUNTIME_BEHAVIOR_NOT_YET_IMPLEMENTED"

    contract_ids = [c["id"] for c in contract["cases"]]
    if contract["case_count"] != 36 or contract_ids != [f"T{n:02d}" for n in range(1, 37)]:
        raise AssertionError("qualification contract IDs/count are not exact")

    results = []
    for case in contract["cases"]:
        cid = case["id"]
        passed = bool(checks.get(cid, False))
        results.append({"id": cid, "group": case["group"], "passed": passed, "obligation": case["obligation"]})

    isolated_ids = {f"T{n:02d}" for n in list(range(1, 30)) + list(range(33, 37))}
    cumulative_ids = {"T30", "T31", "T32"}
    isolated = [r for r in results if r["id"] in isolated_ids]
    cumulative = [r for r in results if r["id"] in cumulative_ids]
    failed = [r for r in results if not r["passed"]]

    report = {
        "operation": "LEARNING-SYSTEM-REBUILD-001M-S01",
        "subject": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "status": "PASS" if not failed else "FAIL",
        "isolated": {"passed": sum(r["passed"] for r in isolated), "total": len(isolated)},
        "cumulative": {"passed": sum(r["passed"] for r in cumulative), "total": len(cumulative)},
        "overall": {"passed": sum(r["passed"] for r in results), "total": len(results)},
        "baseline": {"requirements": len(req_rows), "interfaces": len(iface_rows), "semantic_objects": recovered_obj_count},
        "materialized": material["active_constitution"],
        "results": results
    }
    print(json.dumps(report, indent=2, sort_keys=True))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
