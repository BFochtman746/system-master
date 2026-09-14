#!/usr/bin/env python3
import argparse
import json
import os
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
import sys
sys.path.insert(0, str(REPO_ROOT))

from tools.website_builder import MANIFEST_NAME, WebsiteBuildError, build, verify

CONTRACT_ID = "WEBSITE-BUILDING-FOUNDATION-1.0"
CORPUS = REPO_ROOT / "qualification" / "website-building" / "corpus" / "static-basic"
DEFAULT_EVIDENCE = REPO_ROOT / "qualification-output" / "website-building-foundation-1.0.json"


def qualify(source_identity: str) -> dict[str, object]:
    with tempfile.TemporaryDirectory(prefix="c40-qualification-") as td:
        root = Path(td)
        out_a, out_b = root / "build-a", root / "build-b"
        first = build(CORPUS, out_a)
        second = build(CORPUS, out_b)
        first_bytes = (out_a / MANIFEST_NAME).read_bytes()
        second_bytes = (out_b / MANIFEST_NAME).read_bytes()
        if first_bytes != second_bytes or first["artifact_sha256"] != second["artifact_sha256"]:
            raise WebsiteBuildError("representative corpus did not reproduce byte-identical manifests")
        verify(out_a)
        verify(out_b)

        tamper_target = out_b / "app.js"
        tamper_target.write_bytes(tamper_target.read_bytes() + b"// tamper\n")
        tamper_detected = False
        try:
            verify(out_b)
        except WebsiteBuildError:
            tamper_detected = True
        if not tamper_detected:
            raise WebsiteBuildError("qualification failed to detect output tampering")

        boundary = first["authority_boundary"]
        if boundary["external_side_effects"] or boundary["network_access"]:
            raise WebsiteBuildError("qualification artifact exceeded local side-effect boundary")
        if boundary["publication_authority"] != "NOT_GRANTED" or boundary["production_deployment_authority"] != "NOT_GRANTED":
            raise WebsiteBuildError("qualification artifact attempted to grant publication/deployment authority")

        return {
            "evidence_schema": "1.0",
            "contract_id": CONTRACT_ID,
            "capability_id": "C40",
            "owner": "SYSTEM_MASTER/PROGRAMMING",
            "status": "PASS",
            "source_identity": source_identity,
            "corpus": "qualification/website-building/corpus/static-basic",
            "qualification_command": "python3 .github/scripts/website-building-foundation-qualify.py",
            "artifact_sha256": first["artifact_sha256"],
            "manifest_sha256": __import__("hashlib").sha256(first_bytes).hexdigest(),
            "deterministic_repeat_build": True,
            "tamper_detection": True,
            "external_side_effects": False,
            "publication_authority": "NOT_GRANTED",
            "production_deployment_authority": "NOT_GRANTED",
        }


def main() -> int:
    parser = argparse.ArgumentParser(description="Qualify Website Building Foundation 1.0")
    parser.add_argument("--evidence", default=str(DEFAULT_EVIDENCE))
    parser.add_argument("--source-identity", default=os.environ.get("WEBSITE_BUILDING_SOURCE_ID", os.environ.get("GITHUB_SHA", "WORKTREE")))
    args = parser.parse_args()
    try:
        evidence = qualify(args.source_identity)
    except WebsiteBuildError as exc:
        print(json.dumps({"status": "FAIL", "contract_id": CONTRACT_ID, "error": str(exc)}, sort_keys=True))
        return 2
    path = Path(args.evidence)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(evidence, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(evidence, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
