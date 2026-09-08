from __future__ import annotations

import copy
import json
import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from learning_lab.configured_fresh_evidence_provider import acquire_configured_fresh_evidence
from learning_lab.fraction_domain import REAL_FRACTION_OUTCOME
from learning_lab.fresh_evidence import FreshEvidenceDomainGeneralLearningEngine
from learning_lab.repository import Repository, canonical_json

MODEL_ID = "LOCAL-FRESH-IMPL032"
MODEL_PROVIDER = "LOCAL-MODEL-IMPL032"
RESEARCH_PROVIDER = "LOCAL-RESEARCH-IMPL032"
MODEL_CREDENTIAL = "test-only-model-credential"
RESEARCH_CREDENTIAL = "test-only-research-credential"

FRESH_LCD = {
    "item_id": "MN-FRAC-LCD-IMPL032",
    "family_id": "F-FRAC-LCD-IMPL032",
    "criterion_id": "C-FRAC-EQUIV-LCD",
    "skill_id": "S-FRAC-EQUIV-LCD",
    "mode": "RETENTION_CHECK",
    "prompt": "For 11/18 and 5/12, give the LCD and rewrite both fractions using it. Format: LCD=...; 11/18=...; 5/12=...",
    "answer": "LCD=36; 11/18=22/36; 5/12=15/36",
    "scoring_type": "LCD_EQUIV",
    "claim_refs": ["CL-FRAC-001", "CL-FRAC-002"],
    "fresh_family": True,
}


class _Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):
        return

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw_request = self.rfile.read(length)
        self.server.requests.append({"authorization": self.headers.get("Authorization"), "body": raw_request})
        script = self.server.script[min(len(self.server.requests) - 1, len(self.server.script) - 1)]
        raw = json.dumps(script["body"], sort_keys=True, separators=(",", ":")).encode("utf-8")
        self.send_response(int(script.get("status", 200)))
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


class ConfiguredFreshEvidenceHTTPTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.repo = Repository(os.path.join(self.td.name, "learning.sqlite3"))
        self.engine = FreshEvidenceDomainGeneralLearningEngine(self.repo)
        created = self.engine.create_research_grounded_course_job(
            operation_id="OP-CREATE-IMPL032",
            job_id="JOB-CREATE-IMPL032",
            goal_id="G-FRAC-IMPL032",
            title="Fractions unlike denominators",
            desired_outcome=REAL_FRACTION_OUTCOME,
        )
        self.course_id = created["course_id"]
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        self.server.daemon_threads = True
        self.server.requests = []
        self.server.script = [self.response(FRESH_LCD)]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        host, port = self.server.server_address
        self.endpoint = f"http://{host}:{port}/v1/generate"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.td.cleanup()

    def response(self, candidate):
        return {"status": 200, "body": {"model": MODEL_ID, "output": {"candidate": copy.deepcopy(candidate)}}}

    def env(self):
        return {
            "SYSTEM_MASTER_LEARNING_PROVIDER_MODE": "QUALIFICATION_LOCAL",
            "SYSTEM_MASTER_LEARNING_RESEARCH_ENDPOINT": self.endpoint,
            "SYSTEM_MASTER_LEARNING_MODEL_ENDPOINT": self.endpoint,
            "SYSTEM_MASTER_LEARNING_RESEARCH_PROVIDER_ID": RESEARCH_PROVIDER,
            "SYSTEM_MASTER_LEARNING_MODEL_PROVIDER_ID": MODEL_PROVIDER,
            "SYSTEM_MASTER_LEARNING_MODEL_ID": MODEL_ID,
            "SYSTEM_MASTER_LEARNING_SAMPLE_COUNT": "2",
            "SYSTEM_MASTER_LEARNING_ALLOWED_RESEARCH_AUTHORITIES": "OFFICIAL-FRACTIONS",
            "SYSTEM_MASTER_LEARNING_RESEARCH_BEARER_TOKEN": RESEARCH_CREDENTIAL,
            "SYSTEM_MASTER_LEARNING_MODEL_BEARER_TOKEN": MODEL_CREDENTIAL,
        }

    def acquire(self, *, operation_id="OP-FRESH", request_id="REQ-FRESH", crash=None, env=None):
        return acquire_configured_fresh_evidence(
            repo=self.repo,
            operation_id=operation_id,
            request_id=request_id,
            course_id=self.course_id,
            kind="maintenance",
            skill_id="S-FRAC-EQUIV-LCD",
            criterion_id="C-FRAC-EQUIV-LCD",
            requested_at=200000,
            admitted_at=200001,
            env=self.env() if env is None else env,
            crash_after_phase=crash,
        )

    def test_real_http_candidate_is_unverified_capture_then_impl031_admission(self):
        out = self.acquire()
        self.assertEqual(out["status"], "PASS")
        self.assertEqual(out["capture_standing"], "SEALED_PROVIDER_FRESH_EVIDENCE_CANDIDATE_UNVERIFIED")
        self.assertEqual(out["admission"]["standing"], "INDEPENDENT_ORACLE_VALIDATED_FRESH_EVIDENCE_TASK")
        self.assertEqual(len(self.server.requests), 1)
        self.assertEqual(self.server.requests[0]["authorization"], "Bearer " + MODEL_CREDENTIAL)
        self.assertNotIn(MODEL_CREDENTIAL, canonical_json(out))
        self.assertNotIn(RESEARCH_CREDENTIAL, canonical_json(out))

    def test_success_replay_makes_zero_additional_http_calls(self):
        first = self.acquire()
        before = len(self.server.requests)
        self.server.script = [{"status": 500, "body": {"error": "must-not-call"}}]
        replay = self.acquire()
        self.assertEqual(replay, first)
        self.assertEqual(len(self.server.requests), before)

    def test_request_freeze_crash_happens_before_http(self):
        with self.assertRaisesRegex(RuntimeError, "REQUEST_FROZEN"):
            self.acquire(operation_id="OP-FREEZE", request_id="REQ-FREEZE", crash="REQUEST_FROZEN")
        self.assertEqual(len(self.server.requests), 0)
        self.acquire(operation_id="OP-FREEZE", request_id="REQ-FREEZE")
        self.assertEqual(len(self.server.requests), 1)

    def test_capture_crash_replay_does_not_resample_http(self):
        with self.assertRaisesRegex(RuntimeError, "CAPTURE_STORED"):
            self.acquire(operation_id="OP-CAPTURE", request_id="REQ-CAPTURE", crash="CAPTURE_STORED")
        self.assertEqual(len(self.server.requests), 1)
        before = len(self.server.requests)
        self.server.script = [{"status": 500, "body": {"error": "must-not-call"}}]
        out = self.acquire(operation_id="OP-CAPTURE", request_id="REQ-CAPTURE")
        self.assertEqual(out["status"], "PASS")
        self.assertEqual(len(self.server.requests), before)

    def test_wrong_reference_answer_remains_rejected_by_impl031_without_resample(self):
        bad = copy.deepcopy(FRESH_LCD)
        bad["item_id"] = "MN-FRAC-LCD-IMPL032-BAD"
        bad["family_id"] = "F-FRAC-LCD-IMPL032-BAD"
        bad["answer"] = "LCD=18; 11/18=11/18; 5/12=5/18"
        self.server.script = [self.response(bad)]
        with self.assertRaisesRegex(ValueError, "ORACLE_REJECTED_REFERENCE_ANSWER"):
            self.acquire(operation_id="OP-BAD", request_id="REQ-BAD")
        before = len(self.server.requests)
        self.server.script = [{"status": 500, "body": {"error": "must-not-call"}}]
        with self.assertRaisesRegex(ValueError, "ORACLE_REJECTED_REFERENCE_ANSWER"):
            self.acquire(operation_id="OP-BAD", request_id="REQ-BAD")
        self.assertEqual(len(self.server.requests), before)

    def test_configuration_drift_fails_before_new_provider_call(self):
        self.acquire(operation_id="OP-CONFIG", request_id="REQ-CONFIG")
        before = len(self.server.requests)
        changed = dict(self.env())
        changed["SYSTEM_MASTER_LEARNING_MODEL_ID"] = "DIFFERENT-MODEL-IMPL032"
        with self.assertRaisesRegex(ValueError, "PROVIDER_CONFIGURATION_DRIFT"):
            self.acquire(operation_id="OP-CONFIG", request_id="REQ-CONFIG", env=changed)
        self.assertEqual(len(self.server.requests), before)


if __name__ == "__main__":
    unittest.main()
