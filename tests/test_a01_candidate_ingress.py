from __future__ import annotations

import hashlib
import io
import json
import os
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "control-gateway" / "python"))

from a01_candidate_ingress import (  # noqa: E402
    MANIFEST_NAME,
    MANIFEST_PROTOCOL,
    CandidateIngressError,
    receive_candidate_package,
)

FIXTURE = ROOT / "qualification" / "a01" / "engineering" / "A01-ENGINEERING-CANDIDATE-INGRESS-001" / "fixture.json"
FIXED_ZIP_TIME = (1980, 1, 1, 0, 0, 0)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical_json(value) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode("utf-8")


def zip_info(path: str) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(path, date_time=FIXED_ZIP_TIME)
    info.compress_type = zipfile.ZIP_STORED
    info.create_system = 3
    info.external_attr = 0o100600 << 16
    return info


def build_package(payloads: list[tuple[str, bytes]], package_id: str = "A01-CANDIDATE-INGRESS-TEST-001") -> bytes:
    payloads = sorted(payloads, key=lambda item: item[0])
    manifest = {
        "protocol_version": MANIFEST_PROTOCOL,
        "package_id": package_id,
        "entries": [
            {"path": path, "sha256": sha256(content), "size_bytes": len(content)}
            for path, content in payloads
        ],
    }
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_STORED, strict_timestamps=True) as archive:
        archive.writestr(zip_info(MANIFEST_NAME), canonical_json(manifest))
        for path, content in payloads:
            archive.writestr(zip_info(path), content)
    return out.getvalue()


def fixture_package() -> bytes:
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    payloads = [(item["path"], item["content_utf8"].encode("utf-8")) for item in fixture["payloads"]]
    return build_package(payloads, package_id=fixture["package_id"])


def write_package(root: Path, data: bytes, name: str = "candidate.zip") -> Path:
    path = root / name
    path.write_bytes(data)
    return path


class CandidateIngressTests(unittest.TestCase):
    def test_deterministic_fixture_is_byte_stable(self):
        self.assertEqual(fixture_package(), fixture_package())

    def test_valid_package_persists_exact_bytes_and_receipt_proves_digest_equality_without_execution(self):
        package = fixture_package()
        expected = sha256(package)
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            marker = root / "EXECUTED-MARKER"
            package_path = write_package(root, package)
            receipt = receive_candidate_package(package_path, expected_sha256=expected, store_dir=root / "store")
            stored = root / "store" / receipt["stored_filename"]

            self.assertEqual(stored.read_bytes(), package)
            self.assertEqual(receipt["received_sha256"], expected)
            self.assertEqual(receipt["stored_sha256"], expected)
            self.assertTrue(receipt["digest_match"])
            self.assertFalse(receipt["executed"])
            self.assertEqual(receipt["execution_authority"], "NONE")
            self.assertFalse(marker.exists())

    def test_idempotent_replay_preserves_same_bytes(self):
        package = fixture_package()
        expected = sha256(package)
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            package_path = write_package(root, package)
            first = receive_candidate_package(package_path, expected_sha256=expected, store_dir=root / "store")
            second = receive_candidate_package(package_path, expected_sha256=expected, store_dir=root / "store")
            self.assertFalse(first["idempotent_replay"])
            self.assertTrue(second["idempotent_replay"])
            self.assertEqual(first["stored_sha256"], second["stored_sha256"])

    def test_malformed_package_rejected(self):
        data = b"not-a-zip"
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            path = write_package(root, data)
            with self.assertRaisesRegex(CandidateIngressError, "readable ZIP"):
                receive_candidate_package(path, expected_sha256=sha256(data), store_dir=root / "store")

    def test_path_escape_rejected(self):
        data = build_package([("../escape.txt", b"escape")])
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            path = write_package(root, data)
            with self.assertRaisesRegex(CandidateIngressError, "path traversal|safe relative"):
                receive_candidate_package(path, expected_sha256=sha256(data), store_dir=root / "store")
            self.assertFalse((root / "escape.txt").exists())

    def test_backslash_path_rejected(self):
        data = build_package([("..\\escape.txt", b"escape")])
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            path = write_package(root, data)
            with self.assertRaisesRegex(CandidateIngressError, "safe relative"):
                receive_candidate_package(path, expected_sha256=sha256(data), store_dir=root / "store")

    def test_oversized_package_rejected_before_persistence(self):
        data = fixture_package()
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            path = write_package(root, data)
            with self.assertRaisesRegex(CandidateIngressError, "exceeds the allowed byte bound"):
                receive_candidate_package(path, expected_sha256=sha256(data), store_dir=root / "store", max_package_bytes=len(data) - 1)
            self.assertFalse((root / "store").exists())

    def test_tampered_outer_package_rejected_by_expected_digest(self):
        original = fixture_package()
        tampered = bytearray(original)
        tampered[-1] ^= 0x01
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            path = write_package(root, bytes(tampered))
            with self.assertRaisesRegex(CandidateIngressError, "differs from the expected digest"):
                receive_candidate_package(path, expected_sha256=sha256(original), store_dir=root / "store")

    def test_payload_tamper_rejected_even_when_outer_digest_matches_tampered_archive(self):
        fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
        payloads = [(item["path"], item["content_utf8"].encode("utf-8")) for item in fixture["payloads"]]
        valid = build_package(payloads, package_id=fixture["package_id"])

        with zipfile.ZipFile(io.BytesIO(valid), "r") as archive:
            manifest = json.loads(archive.read(MANIFEST_NAME).decode("utf-8"))
        changed = [(path, (b"tampered\n" if path == "payload/candidate.txt" else content)) for path, content in payloads]
        out = io.BytesIO()
        with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_STORED) as archive:
            archive.writestr(zip_info(MANIFEST_NAME), canonical_json(manifest))
            for path, content in sorted(changed):
                archive.writestr(zip_info(path), content)
        tampered = out.getvalue()

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            path = write_package(root, tampered)
            with self.assertRaisesRegex(CandidateIngressError, "payload (digest|size) mismatch"):
                receive_candidate_package(path, expected_sha256=sha256(tampered), store_dir=root / "store")

    def test_uncompressed_size_limit_rejected(self):
        data = build_package([("payload/large.bin", b"x" * 4096)])
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            path = write_package(root, data)
            with self.assertRaisesRegex(CandidateIngressError, "uncompressed size"):
                receive_candidate_package(
                    path,
                    expected_sha256=sha256(data),
                    store_dir=root / "store",
                    max_uncompressed_bytes=1024,
                )

    def test_archive_with_extra_unmanifested_entry_rejected(self):
        payload = b"ok\n"
        manifest = {
            "protocol_version": MANIFEST_PROTOCOL,
            "package_id": "A01-CANDIDATE-INGRESS-TEST-001",
            "entries": [{"path": "payload/a.txt", "sha256": sha256(payload), "size_bytes": len(payload)}],
        }
        out = io.BytesIO()
        with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_STORED) as archive:
            archive.writestr(zip_info(MANIFEST_NAME), canonical_json(manifest))
            archive.writestr(zip_info("payload/a.txt"), payload)
            archive.writestr(zip_info("payload/unlisted.txt"), b"nope\n")
        data = out.getvalue()
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            path = write_package(root, data)
            with self.assertRaisesRegex(CandidateIngressError, "exactly match"):
                receive_candidate_package(path, expected_sha256=sha256(data), store_dir=root / "store")

    def test_receipt_digest_is_stable_and_nonempty(self):
        package = fixture_package()
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            path = write_package(root, package)
            receipt = receive_candidate_package(path, expected_sha256=sha256(package), store_dir=root / "store")
            self.assertRegex(receipt["receipt_digest"], r"^[0-9a-f]{64}$")


if __name__ == "__main__":
    unittest.main(verbosity=2)
