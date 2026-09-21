from __future__ import annotations

import hashlib
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from a01_repair_closure_evidence import GENESIS, MANIFEST_NAME, check_database, collect_wave1, verify_manifest


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


class ClosureEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.db = self.root / "supervisor.sqlite"
        self.evidence = self.root / "evidence"
        self.evidence.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def write_manifest(self, mutate=False):
        body = {
            "event": "INDEXED",
            "relpath": "qualification/example.json",
            "content_digest": "a" * 64,
            "size_bytes": 12,
            "modified_at": "2026-09-21T12:00:00Z",
            "protected": True,
            "previous_entry_digest": GENESIS,
            "recorded_at": "2026-09-21T12:00:01Z",
        }
        row = dict(body)
        row["entry_digest"] = digest(body)
        if mutate:
            row["size_bytes"] = 13
        (self.evidence / MANIFEST_NAME).write_text(canonical(row) + "\n", encoding="utf-8")

    def test_valid_database_and_manifest_components_pass_but_wave1_never_claims_ready(self):
        conn = sqlite3.connect(self.db)
        conn.execute("CREATE TABLE parent(id INTEGER PRIMARY KEY)")
        conn.execute("CREATE TABLE child(id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id))")
        conn.commit(); conn.close()
        self.write_manifest()
        report = collect_wave1(self.db, self.evidence)
        self.assertEqual(report["database_integrity"]["state"], "PASS")
        self.assertEqual(report["foreign_key_integrity"]["state"], "PASS")
        self.assertEqual(report["evidence_manifest_integrity"]["state"], "PASS")
        self.assertEqual(report["standing"], "NEXT_REPAIR_CYCLE_BLOCKED")
        self.assertEqual(report["authority_coherence"]["state"], "NOT_EVALUATED")

    def test_tampered_manifest_fails_closed(self):
        conn = sqlite3.connect(self.db); conn.execute("CREATE TABLE x(id INTEGER PRIMARY KEY)"); conn.commit(); conn.close()
        self.write_manifest(mutate=True)
        self.assertEqual(verify_manifest(self.evidence)["state"], "FAIL")
        self.assertEqual(collect_wave1(self.db, self.evidence)["standing"], "NEXT_REPAIR_CYCLE_BLOCKED")

    def test_foreign_key_violation_fails_closed(self):
        conn = sqlite3.connect(self.db)
        conn.execute("PRAGMA foreign_keys=OFF")
        conn.execute("CREATE TABLE parent(id INTEGER PRIMARY KEY)")
        conn.execute("CREATE TABLE child(id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id))")
        conn.execute("INSERT INTO child(id,parent_id) VALUES(1,999)")
        conn.commit(); conn.close()
        integrity, foreign = check_database(self.db)
        self.assertEqual(integrity["state"], "PASS")
        self.assertEqual(foreign["state"], "FAIL")

    def test_database_corruption_fails_closed(self):
        conn = sqlite3.connect(self.db); conn.execute("CREATE TABLE x(id INTEGER PRIMARY KEY, value TEXT)"); conn.execute("INSERT INTO x(value) VALUES('ok')"); conn.commit(); conn.close()
        data = bytearray(self.db.read_bytes())
        for index in range(min(100, len(data))):
            data[index] ^= 0xFF
        self.db.write_bytes(data)
        integrity, foreign = check_database(self.db)
        self.assertEqual(integrity["state"], "FAIL")
        self.assertEqual(foreign["state"], "FAIL")


if __name__ == "__main__":
    unittest.main(verbosity=2)
