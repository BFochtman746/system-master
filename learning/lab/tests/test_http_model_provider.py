from __future__ import annotations

import copy
import json
import os
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from learning_lab.http_model_provider import (
    HTTP_MODEL_BINDING_VERSION,
    HTTP_MODEL_PROVIDER_VERSION,
    HTTP_MODEL_RECEIPT_KIND,
    HTTP_MODEL_RECEIPT_STANDING,
    HTTPJSONModelProvider,
    HTTPProviderMultiSampleBindingService,
    acquire_bind_and_start_http_multi_sample_adaptive_entry,
)
from learning_lab.repository import Repository, canonical_json, digest


ROOT = Path(__file__).resolve().parents[1]
CAPTURE_PATH = ROOT / "sources" / "LIVE_RESEARCH_PYTHON_COMPREHENSIONS_V1.json"
MULTI_PATH = ROOT / "sources" / "MODEL_GENERATION_PYTHON_COMPREHENSIONS_MULTI_CANDIDATE_V1.json"
GOAL = "Use Python list and dictionary comprehensions to transform and filter data."
MODEL_ID = "LOCAL-HTTP-PROVIDER-IMPL023"
A = "MODEL-GEN-PY-COMP-MC-A-20260907"
B = "MODEL-GEN-PY-COMP-MC-B-20260907"
C = "MODEL-GEN-PY-COMP-MC-C-20260907"
D = "MODEL-GEN-PY-COMP-MC-D-20260907"
SECRET = "IMPL023-TEST-SECRET-MUST-NOT-PERSIST"


class _Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):
        return

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        request_body = self.rfile.read(length)
        self.server.requests.append({
            "path": self.path,
            "authorization": self.headers.get("Authorization"),
            "body": request_body,
        })
        index = len(self.server.requests) - 1
        script = self.server.script[min(index, len(self.server.script) - 1)]
        delay = float(script.get("delay", 0.0))
        if delay:
            time.sleep(delay)
        status = int(script.get("status", 200))
        if "raw" in script:
            raw = script["raw"]
        else:
            raw = json.dumps(script.get("body", {}), sort_keys=True, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", script.get("content_type", "application/json"))
        self.send_header("Content-Length", str(len(raw)))
        if script.get("request_id"):
            self.send_header("X-Request-Id", script["request_id"])
        self.end_headers()
        try:
            self.wfile.write(raw)
        except (BrokenPipeError, ConnectionResetError):
            pass


class HTTPModelProviderTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.td.name, "learning.sqlite3")
        self.repo = Repository(self.db_path)
        self.capture = json.loads(CAPTURE_PATH.read_text(encoding="utf-8"))
        fixture = json.loads(MULTI_PATH.read_text(encoding="utf-8"))
        self.traces = {trace["generation_trace_id"]: trace for trace in fixture["traces"]}
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        self.server.daemon_threads = True
        self.server.script = [{"status": 500, "body": {"error": "unconfigured"}}]
        self.server.requests = []
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        host, port = self.server.server_address
        self.endpoint = f"http://{host}:{port}/v1/generate"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.td.cleanup()

    def response(self, trace_id, request_id=None):
        body = {
            "model": MODEL_ID,
            "output": copy.deepcopy(self.traces[trace_id]["output"]),
        }
        if request_id is not None:
            body["request_id"] = request_id
        return {"status": 200, "body": body, "request_id": request_id}

    def provider(self, batch_id="BATCH-HTTP", max_attempts=2, timeout_seconds=2.0):
        return HTTPJSONModelProvider(
            repo=self.repo,
            batch_id=batch_id,
            endpoint=self.endpoint,
            model_id=MODEL_ID,
            credential_provider=lambda: SECRET,
            timeout_seconds=timeout_seconds,
            max_attempts=max_attempts,
        )

    def research_provider(self, goal):
        return copy.deepcopy(self.capture)

    def test_successful_real_http_post_is_durably_receipted_without_secret(self):
        self.server.script = [self.response(A, "REQ-A")]
        provider = self.provider()
        prompt = {"goal": GOAL, "x": 1}
        output = provider.generate(prompt, 0)
        self.assertEqual(output, self.traces[A]["output"])
        self.assertEqual(len(self.server.requests), 1)
        self.assertEqual(self.server.requests[0]["authorization"], "Bearer " + SECRET)
        sent = json.loads(self.server.requests[0]["body"].decode("utf-8"))
        self.assertEqual(sent["model"], MODEL_ID)
        self.assertEqual(sent["sample_index"], 0)
        self.assertEqual(sent["prompt"], prompt)
        call_id = provider.call_id(prompt_digest=digest(prompt), sample_index=0)
        receipt = self.repo.get_object(HTTP_MODEL_RECEIPT_KIND, call_id, 1)
        self.assertEqual(receipt["standing"], HTTP_MODEL_RECEIPT_STANDING)
        self.assertEqual(receipt["provider_request_id"], "REQ-A")
        self.assertEqual(receipt["attempts"], 1)
        self.assertEqual(receipt["output_digest"], digest(output))
        self.assertNotIn(SECRET, canonical_json(receipt))

    def test_transient_429_retries_only_to_finite_success(self):
        self.server.script = [
            {"status": 429, "body": {"error": "rate"}},
            self.response(A, "REQ-AFTER-429"),
        ]
        provider = self.provider(max_attempts=2)
        prompt = {"goal": GOAL}
        output = provider.generate(prompt, 0)
        self.assertEqual(output, self.traces[A]["output"])
        self.assertEqual(len(self.server.requests), 2)
        receipt = provider.load_receipt(prompt_digest=digest(prompt), sample_index=0)
        self.assertEqual(receipt["attempts"], 2)
        self.assertEqual(receipt["transient_statuses_seen"], [429])

    def test_transient_failure_exhausts_declared_budget(self):
        self.server.script = [
            {"status": 503, "body": {"error": "down-1"}},
            {"status": 503, "body": {"error": "down-2"}},
        ]
        provider = self.provider(max_attempts=2)
        prompt = {"goal": GOAL}
        with self.assertRaisesRegex(ValueError, "HTTP_MODEL_TRANSIENT_RETRIES_EXHAUSTED:503"):
            provider.generate(prompt, 0)
        self.assertEqual(len(self.server.requests), 2)
        call_id = provider.call_id(prompt_digest=digest(prompt), sample_index=0)
        self.assertIsNone(self.repo.get_object(HTTP_MODEL_RECEIPT_KIND, call_id, 1))

    def test_permanent_400_never_retries(self):
        self.server.script = [
            {"status": 400, "body": {"error": "bad"}},
            self.response(A),
        ]
        provider = self.provider(max_attempts=4)
        with self.assertRaisesRegex(ValueError, "HTTP_MODEL_PERMANENT_STATUS:400"):
            provider.generate({"goal": GOAL}, 0)
        self.assertEqual(len(self.server.requests), 1)

    def test_malformed_json_and_model_drift_fail_closed(self):
        provider = self.provider(max_attempts=1)
        self.server.script = [{"status": 200, "raw": b"not-json"}]
        with self.assertRaisesRegex(ValueError, "HTTP_MODEL_RESPONSE_JSON_INVALID"):
            provider.generate({"goal": GOAL, "case": "json"}, 0)
        self.assertEqual(len(self.server.requests), 1)

        self.server.requests.clear()
        self.server.script = [{"status": 200, "body": {"model": "WRONG-MODEL", "output": {"x": 1}}}]
        with self.assertRaisesRegex(ValueError, "HTTP_MODEL_RESPONSE_MODEL_MISMATCH"):
            provider.generate({"goal": GOAL, "case": "model"}, 1)
        self.assertEqual(len(self.server.requests), 1)

    def test_secret_echo_is_rejected_before_durable_receipt(self):
        provider = self.provider(max_attempts=1)
        prompt = {"goal": GOAL, "case": "secret"}
        self.server.script = [{"status": 200, "body": {"model": MODEL_ID, "output": {"text": SECRET}}}]
        with self.assertRaisesRegex(ValueError, "HTTP_MODEL_SECRET_ECHO_FORBIDDEN"):
            provider.generate(prompt, 0)
        call_id = provider.call_id(prompt_digest=digest(prompt), sample_index=0)
        self.assertIsNone(self.repo.get_object(HTTP_MODEL_RECEIPT_KIND, call_id, 1))

    def test_crash_after_receipt_does_not_repeat_stochastic_http_call(self):
        self.server.script = [self.response(A, "REQ-CRASH")]
        provider = self.provider(batch_id="BATCH-CRASH")
        prompt = {"goal": GOAL, "case": "crash"}
        with self.assertRaisesRegex(RuntimeError, "HTTP_RESPONSE_RECEIPT_STORED"):
            provider.generate(prompt, 0, inject_crash_after="HTTP_RESPONSE_RECEIPT_STORED")
        self.assertEqual(len(self.server.requests), 1)

        self.server.script = [{"status": 500, "body": {"error": "must-not-call"}}]
        replay = provider.generate(prompt, 0)
        self.assertEqual(replay, self.traces[A]["output"])
        self.assertEqual(len(self.server.requests), 1)

    def test_http_receipts_bind_exactly_to_impl022_packets_and_replay_without_http(self):
        self.server.script = [self.response(A, "REQ-A"), self.response(B, "REQ-B"), self.response(C, "REQ-C")]
        service = HTTPProviderMultiSampleBindingService(self.repo)
        out = service.acquire_and_bind(
            operation_id="OP-HTTP-BIND",
            batch_id="BATCH-HTTP-BIND",
            desired_outcome=GOAL,
            sample_count=3,
            endpoint=self.endpoint,
            model_id=MODEL_ID,
            research_capture_provider=self.research_provider,
            credential_provider=lambda: SECRET,
            timeout_seconds=2,
            max_attempts=2,
        )
        self.assertEqual(out["http_model_provider_version"], HTTP_MODEL_PROVIDER_VERSION)
        self.assertEqual(out["http_model_binding_version"], HTTP_MODEL_BINDING_VERSION)
        self.assertEqual(len(self.server.requests), 3)
        binding = service.load_binding("BATCH-HTTP-BIND")
        self.assertEqual(binding["sample_count"], 3)
        self.assertEqual(len(binding["entries"]), 3)
        for entry in binding["entries"]:
            receipt = self.repo.get_object(HTTP_MODEL_RECEIPT_KIND, entry["call_id"], 1)
            packet = self.repo.get_object("open_goal_input_packet", entry["packet_id"], 1)
            self.assertEqual(receipt["receipt_digest"], entry["receipt_digest"])
            self.assertEqual(receipt["output_digest"], packet["model_output_digest"])
            self.assertEqual(entry["packet_digest"], packet["packet_digest"])
            self.assertNotIn(SECRET, canonical_json(receipt))

        before = len(self.server.requests)
        replay = service.acquire_and_bind(
            operation_id="OP-HTTP-BIND",
            batch_id="BATCH-HTTP-BIND",
            desired_outcome=GOAL,
            sample_count=3,
            endpoint=self.endpoint,
            model_id=MODEL_ID,
            research_capture_provider=lambda goal: (_ for _ in ()).throw(AssertionError("research replayed")),
            credential_provider=lambda: (_ for _ in ()).throw(AssertionError("credential requested on replay")),
        )
        self.assertEqual(replay["batch_digest"], out["batch_digest"])
        self.assertEqual(len(self.server.requests), before)

    def test_full_http_select_path_enters_existing_adaptive_journey(self):
        self.server.script = [self.response(A), self.response(B), self.response(C)]
        out = acquire_bind_and_start_http_multi_sample_adaptive_entry(
            repo=self.repo,
            operation_id="OP-HTTP-SELECT",
            batch_id="BATCH-HTTP-SELECT",
            request_id="REQ-HTTP-SELECT",
            learner_id="LRN-HTTP-023",
            desired_outcome=GOAL,
            sample_count=3,
            endpoint=self.endpoint,
            model_id=MODEL_ID,
            research_capture_provider=self.research_provider,
            claimed_skill_ids=[],
            now=0,
            credential_provider=lambda: SECRET,
        )
        self.assertEqual(out["status"], "PASS")
        self.assertEqual(out["selection_decision"], "SELECT")
        self.assertTrue(out["journey_created"])
        self.assertIsNotNone(out["course_id"])
        self.assertEqual(out["http_model_provider_version"], HTTP_MODEL_PROVIDER_VERSION)
        self.assertEqual(len(self.server.requests), 3)

    def test_full_http_tie_abstains_without_course_or_journey(self):
        self.server.script = [self.response(A), self.response(D)]
        out = acquire_bind_and_start_http_multi_sample_adaptive_entry(
            repo=self.repo,
            operation_id="OP-HTTP-ABSTAIN",
            batch_id="BATCH-HTTP-ABSTAIN",
            request_id="REQ-HTTP-ABSTAIN",
            learner_id="LRN-HTTP-023",
            desired_outcome=GOAL,
            sample_count=2,
            endpoint=self.endpoint,
            model_id=MODEL_ID,
            research_capture_provider=self.research_provider,
            claimed_skill_ids=[],
            now=0,
            credential_provider=lambda: SECRET,
        )
        self.assertEqual(out["status"], "ABSTAIN")
        self.assertEqual(out["selection_decision"], "ABSTAIN")
        self.assertFalse(out["journey_created"])
        self.assertIsNone(out["course_id"])
        self.assertEqual(len(self.server.requests), 2)


if __name__ == "__main__":
    unittest.main()
