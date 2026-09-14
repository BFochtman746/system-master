#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import shutil
import struct
import sys
import tempfile
import wave
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from tools.audiobook_builder import BUILD_MANIFEST_NAME, AudiobookBuildError, build, verify

CONTRACT_ID = "AUDIOBOOK-FOUNDATION-1.0"
CORPUS = REPO_ROOT / "qualification" / "audiobook" / "corpus" / "local-basic"
DEFAULT_EVIDENCE = REPO_ROOT / "qualification-output" / "audiobook-foundation-1.0.json"


def _stage_corpus(root: Path) -> Path:
    project = root / "project"
    shutil.copytree(CORPUS, project)
    audio = project / "audio" / "chapter-01.wav"
    audio.parent.mkdir(parents=True, exist_ok=True)
    sample_rate = 8000
    frames = 800
    with wave.open(str(audio), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        payload = bytearray()
        for index in range(frames):
            sample = ((index % 32) - 16) * 100
            payload.extend(struct.pack("<h", sample))
        handle.writeframes(bytes(payload))
    return project


def qualify(source_identity: str) -> dict[str, object]:
    with tempfile.TemporaryDirectory(prefix="c00-qualification-") as td:
        root = Path(td)
        project = _stage_corpus(root)
        out_a, out_b = root / "build-a", root / "build-b"
        first = build(project, out_a)
        second = build(project, out_b)
        first_bytes = (out_a / BUILD_MANIFEST_NAME).read_bytes()
        second_bytes = (out_b / BUILD_MANIFEST_NAME).read_bytes()
        if first_bytes != second_bytes or first["artifact_sha256"] != second["artifact_sha256"]:
            raise AudiobookBuildError("representative corpus did not reproduce byte-identical manifests")
        verify(out_a)
        verify(out_b)

        tamper_target = out_b / "audio" / "chapter-01.wav"
        tamper_target.write_bytes(tamper_target.read_bytes() + b"tamper")
        tamper_detected = False
        try:
            verify(out_b)
        except AudiobookBuildError:
            tamper_detected = True
        if not tamper_detected:
            raise AudiobookBuildError("qualification failed to detect narration-audio tampering")

        boundary = first["authority_boundary"]
        required_denials = (
            boundary["external_side_effects"] is False,
            boundary["network_access"] is False,
            boundary["speech_synthesis_authority"] == "NOT_GRANTED",
            boundary["playback_authority"] == "NOT_GRANTED",
            boundary["credentials_authority"] == "NOT_GRANTED",
            boundary["publication_authority"] == "NOT_GRANTED",
            boundary["distribution_authority"] == "NOT_GRANTED",
            boundary["production_promotion_authority"] == "NOT_GRANTED",
        )
        if not all(required_denials):
            raise AudiobookBuildError("qualification artifact exceeded C00 local-only authority boundary")

        return {
            "evidence_schema": "1.0",
            "contract_id": CONTRACT_ID,
            "capability_id": "C00",
            "owner": "SYSTEM_MASTER/MEDIA",
            "status": "PASS",
            "source_identity": source_identity,
            "corpus": "qualification/audiobook/corpus/local-basic",
            "qualification_command": "python3 .github/scripts/audiobook-foundation-qualify.py",
            "artifact_sha256": first["artifact_sha256"],
            "manifest_sha256": hashlib.sha256(first_bytes).hexdigest(),
            "chapter_count": first["chapter_count"],
            "narration_input": "CALLER_SUPPLIED_AUDIO_ONLY",
            "deterministic_repeat_build": True,
            "tamper_detection": True,
            "external_side_effects": False,
            "network_access": False,
            "speech_synthesis_authority": "NOT_GRANTED",
            "playback_authority": "NOT_GRANTED",
            "publication_authority": "NOT_GRANTED",
            "distribution_authority": "NOT_GRANTED",
            "production_promotion_authority": "NOT_GRANTED",
        }


def main() -> int:
    parser = argparse.ArgumentParser(description="Qualify C00 Audiobook Foundation 1.0")
    parser.add_argument("--evidence", default=str(DEFAULT_EVIDENCE))
    parser.add_argument("--source-identity", default=os.environ.get("AUDIOBOOK_SOURCE_ID", os.environ.get("GITHUB_SHA", "WORKTREE")))
    args = parser.parse_args()
    try:
        evidence = qualify(args.source_identity)
    except AudiobookBuildError as exc:
        print(json.dumps({"status": "FAIL", "contract_id": CONTRACT_ID, "error": str(exc)}, sort_keys=True))
        return 2
    path = Path(args.evidence)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(evidence, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(evidence, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
