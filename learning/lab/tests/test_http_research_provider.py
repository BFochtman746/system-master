from __future__ import annotations

import copy
import json
import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from learning_lab.http_research_provider import (
    HTTP_RESEARCH_BINDING_VERSION,
    HTTP_RESEARCH_PROVIDER_VERSION,
    HTTP_RESEARCH_RECEIPT_KIND,
    HTTP_RESEARCH_RECEIPT_STANDING,
    FullHTTPProviderBindingService,
    HTTPJSONResearchProvider,
    acquire_bind_and_start_full_http_adaptive_entry,
)
from learning_lab.repository import Repository, canonical_json, digest


ROOT = Path(__file__).resolve().parents[1]
CAPTURE_PATH = ROOT / "sources" / "LIVE_RESEARCH_PYTHON_COMPREHENSIONS_V1.json"
MULTI_PATH = ROOT / "sources" / "MODEL_GENERATION_PYTHON_COMPREHENSIONS_MULTI_CANDIDATE_V1.json"
GOAL = "Use Python list and dictionary comprehensions to transform and filter data."
MODEL_ID = "LOCAL-FULL-HTTP-PROVIDER-IMPL024"
A = "MODEL-GEN-PY-COMP-MC-A-20260907"
B = "MODEL-GEN-PY-COMP-MC-B-20260907"
C = "MODEL-GEN-PY-COMP-MC-C-20260907"
D = "MODEL-GEN-PY-COMP-MC-D-20260907"
RESEARCH_SECRET = "IMPL024-RESEARCH-SECRET-MUST-NOT-PERSIST"
MODEL_SECRET = "IMPL024-MODEL-SECRET-MUST-NOT-PERSIST"


class _Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):
        return

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        rows = self.server.requests.setdefault(self.path, [])
        rows.append({
            "authorization": self.headers.get("Authorization"),
            "body": body,
        })
        script_rows = self.server.scripts.get(self.path, [{"status": 404, "body": {"error": "not-found"}}])
        script = script_rows[min(len(rows) - 1, len(script_rows) - 1)]
        status = int(script.get("status", 200))
        raw = script.get("raw")
        if raw is None:
            raw = json.dumps(script.get("body", {}), sort_keys=True, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        if script.get("request_id"):
            self.send_header("X-Request-Id", script["request_id"])
        self.end_headers()
        try:
            self.wfile.write(raw)
        except (BrokenPipeError, ConnectionResetError):
            pass


class HTTPResearchProviderTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.repo = Repository(os.path.join(self.td.name, "learning.sqlite3"))
        self.capture = json.loads(CAPTURE_PATH.read_text(encoding="utf-8"))
        fixture = json.loads(MULTI_PATH.read_text(encoding="utf-8"))
        self.traces = {trace["generation_trace_id"]: trace for trace in fixture["traces"]}
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        self.server.daemon_threads = True
        self.server.scripts = {}
        self.server.requests = {}
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        host, port = self.server.server_address
        self.research_endpoint = f"http://{host}:{port}/v1/research"
        self.model_endpoint = f"http://{host}:{port}/v1/generate"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.td.cleanup()

    def research_response(self, capture=None, request_id="RSCH-REQ-1"):
        return {
            "status": 200,
            "request_id": request_id,
            "body": {
                "request_id": request_id,
                "capture": copy.deepcopy(self.capture if capture is None else capture),
            },
        }

    def model_response(self, trace_id, request_id=None):
        body = {
            "model": MODEL_ID,
            "output": copy.deepcopy(self.traces[trace_id]["output"]),
        }
        if request_id is not None:
            body["request_id"] = request_id
        return {"status": 200, "request_id": request_id, "body": body}

    def research_provider(self, request_id="BATCH-RSCH", max_attempts=2, allowed_authorities=None):
        return HTTPJSONResearchProvider(
            repo=self.repo,
            research_request_id=request_id,
            endpoint=self.research_endpoint,
            credential_provider=lambda: RESEARCH_SECRET,
            timeout_seconds=2,
            max_attempts=max_attempts,
            allowed_authorities=allowed_authorities,
        )

    def request_count(self, path):
        return len(self.server.requests.get(path, []))

    def test_successful_real_http_research_is_policy_validated_and_durable_without_secret(self):
        self.server.scripts["/v1/research"] = [self.research_response(request_id="RSCH-OK")]
        provider = self.research_provider()
        capture = provider.capture(GOAL)
        self.assertEqual(capture, self.capture)
        self.assertEqual(self.request_count("/v1/research"), 1)
        row = self.server.requests["/v1/research"][0]
        self.assertEqual(row["authorization"], "Bearer " + RESEARCH_SECRET)
        sent = json.loads(row["body"].decode("utf-8"))
        self.assertEqual(sent["goal"], GOAL)
        self.assertEqual(sent["allowed_source_policies"], ["OFFICIAL_PRIMARY_CURRENT"])
        receipt = provider.load_receipt(goal=GOAL)
        self.assertEqual(receipt["standing"], HTTP_RESEARCH_RECEIPT_STANDING)
        self.assertEqual(receipt["provider_request_id"], "RSCH-OK")
        self.assertEqual(receipt["capture_digest"], digest(self.capture))
        self.assertEqual(receipt["normalized_evidence_digest"], self.capture["normalized_evidence_digest"])
        self.assertNotIn(RESEARCH_SECRET, canonical_json(receipt))

    def test_transient_429_retries_only_within_declared_budget(self):
        self.server.scripts["/v1/research"] = [
            {"status": 429, "body": {"error": "rate"}},
            self.research_response(request_id="RSCH-AFTER-429"),
        ]
        provider = self.research_provider(max_attempts=2)
        provider.capture(GOAL)
        self.assertEqual(self.request_count("/v1/research"), 2)
        receipt = provider.load_receipt(goal=GOAL)
        self.assertEqual(receipt["attempts"], 2)
        self.assertEqual(receipt["transient_statuses_seen"], [429])

    def test_permanent_400_never_retries_or_persists(self):
        self.server.scripts["/v1/research"] = [
            {"status": 400, "body": {"error": "bad"}},
            self.research_response(),
        ]
        provider = self.research_provider(max_attempts=4)
        with self.assertRaisesRegex(ValueError, "HTTP_RESEARCH_PERMANENT_STATUS:400"):
            provider.capture(GOAL)
        self.assertEqual(self.request_count("/v1/research"), 1)
        call_id = provider.call_id(goal_digest=digest(GOAL))
        self.assertIsNone(self.repo.get_object(HTTP_RESEARCH_RECEIPT_KIND, call_id, 1))

    def test_source_policy_and_authority_rejection_happen_before_persistence(self):
        bad_policy = copy.deepcopy(self.capture)
        bad_policy["source_policy"] = "UNRESTRICTED_WEB"
        self.server.scripts["/v1/research"] = [self.research_response(bad_policy)]
        provider = self.research_provider(request_id="BAD-POLICY")
        with self.assertRaisesRegex(ValueError, "HTTP_RESEARCH_SOURCE_POLICY_REJECTED"):
            provider.capture(GOAL)
        self.assertIsNone(self.repo.get_object(HTTP_RESEARCH_RECEIPT_KIND, provider.call_id(goal_digest=digest(GOAL)), 1))

        self.server.requests["/v1/research"] = []
        self.server.scripts["/v1/research"] = [self.research_response()]
        authority_provider = self.research_provider(
            request_id="BAD-AUTHORITY",
            allowed_authorities=["SOME_OTHER_AUTHORITY"],
        )
        with self.assertRaisesRegex(ValueError, "HTTP_RESEARCH_SOURCE_AUTHORITY_REJECTED"):
            authority_provider.capture(GOAL)
        self.assertIsNone(self.repo.get_object(HTTP_RESEARCH_RECEIPT_KIND, authority_provider.call_id(goal_digest=digest(GOAL)), 1))

    def test_unadmitted_source_and_digest_drift_fail_closed(self):
        unadmitted = copy.deepcopy(self.capture)
        unadmitted["sources"][0]["standing"] = "REJECTED"
        unadmitted["normalized_evidence_digest"] = digest({"sources": unadmitted["sources"], "claims": unadmitted["claims"]})
        self.server.scripts["/v1/research"] = [self.research_response(unadmitted)]
        with self.assertRaisesRegex(ValueError, "HTTP_RESEARCH_SOURCE_NOT_ADMITTED"):
            self.research_provider(request_id="UNADMITTED").capture(GOAL)

        drift = copy.deepcopy(self.capture)
        drift["claims"][0]["text"] += " drift"
        self.server.requests["/v1/research"] = []
        self.server.scripts["/v1/research"] = [self.research_response(drift)]
        with self.assertRaisesRegex(ValueError, "LIVE_RESEARCH_CAPTURE_DIGEST_MISMATCH"):
            self.research_provider(request_id="DIGEST-DRIFT").capture(GOAL)

    def test_secret_echo_and_malformed_json_fail_before_durable_receipt(self):
        self.server.scripts["/v1/research"] = [{
            "status": 200,
            "body": {"capture": {"text": RESEARCH_SECRET}},
        }]
        provider = self.research_provider(request_id="SECRET-ECHO", max_attempts=1)
        with self.assertRaisesRegex(ValueError, "HTTP_RESEARCH_SECRET_ECHO_FORBIDDEN"):
            provider.capture(GOAL)
        self.assertIsNone(self.repo.get_object(HTTP_RESEARCH_RECEIPT_KIND, provider.call_id(goal_digest=digest(GOAL)), 1))

        self.server.requests["/v1/research"] = []
        self.server.scripts["/v1/research"] = [{"status": 200, "raw": b"not-json"}]
        malformed = self.research_provider(request_id="MALFORMED", max_attempts=1)
        with self.assertRaisesRegex(ValueError, "HTTP_RESEARCH_RESPONSE_JSON_INVALID"):
            malformed.capture(GOAL)

    def test_crash_after_research_receipt_does_not_refetch_live_research(self):
        self.server.scripts["/v1/research"] = [self.research_response(request_id="RSCH-CRASH")]
        provider = self.research_provider(request_id="CRASH-RSCH")
        with self.assertRaisesRegex(RuntimeError, "HTTP_RESEARCH_RECEIPT_STORED"):
            provider.capture(GOAL, inject_crash_after="HTTP_RESEARCH_RECEIPT_STORED")
        self.assertEqual(self.request_count("/v1/research"), 1)

        self.server.scripts["/v1/research"] = [{"status": 500, "body": {"error": "must-not-call"}}]
        replay = provider.capture(GOAL)
        self.assertEqual(replay, self.capture)
        self.assertEqual(self.request_count("/v1/research"), 1)

    def test_full_http_research_and_model_receipts_bind_to_same_packet_set(self):
        self.server.scripts["/v1/research"] = [self.research_response(request_id="RSCH-FULL")]
        self.server.scripts["/v1/generate"] = [self.model_response(A), self.model_response(B), self.model_response(C)]
        service = FullHTTPProviderBindingService(self.repo)
        out = service.acquire_and_bind(
            operation_id="OP-FULL-HTTP-BIND",
            batch_id="BATCH-FULL-HTTP-BIND",
            desired_outcome=GOAL,
            sample_count=3,
            research_endpoint=self.research_endpoint,
            model_endpoint=self.model_endpoint,
            model_id=MODEL_ID,
            research_credential_provider=lambda: RESEARCH_SECRET,
            model_credential_provider=lambda: MODEL_SECRET,
            timeout_seconds=2,
            max_attempts=2,
        )
        self.assertEqual(out["http_research_provider_version"], HTTP_RESEARCH_PROVIDER_VERSION)
        self.assertEqual(out["http_research_binding_version"], HTTP_RESEARCH_BINDING_VERSION)
        self.assertEqual(self.request_count("/v1/research"), 1)
        self.assertEqual(self.request_count("/v1/generate"), 3)
        binding = service.load_binding("BATCH-FULL-HTTP-BIND")
        self.assertEqual(len(binding["entries"]), 3)
        self.assertEqual(binding["normalized_evidence_digest"], self.capture["normalized_evidence_digest"])
        for entry in binding["entries"]:
            packet = self.repo.get_object("open_goal_input_packet", entry["packet_id"], 1)
            self.assertEqual(entry["research_capture_digest"], packet["research_capture_digest"])
            self.assertEqual(entry["research_evidence_digest"], packet["research_evidence_digest"])

        before_research = self.request_count("/v1/research")
        before_model = self.request_count("/v1/generate")
        replay = service.acquire_and_bind(
            operation_id="OP-FULL-HTTP-BIND",
            batch_id="BATCH-FULL-HTTP-BIND",
            desired_outcome=GOAL,
            sample_count=3,
            research_endpoint=self.research_endpoint,
            model_endpoint=self.model_endpoint,
            model_id=MODEL_ID,
            research_credential_provider=lambda: (_ for _ in ()).throw(AssertionError("research credential requested")),
            model_credential_provider=lambda: (_ for _ in ()).throw(AssertionError("model credential requested")),
        )
        self.assertEqual(replay["batch_digest"], out["batch_digest"])
        self.assertEqual(self.request_count("/v1/research"), before_research)
        self.assertEqual(self.request_count("/v1/generate"), before_model)

    def test_full_http_select_path_enters_existing_adaptive_journey(self):
        self.server.scripts["/v1/research"] = [self.research_response()]
        self.server.scripts["/v1/generate"] = [self.model_response(A), self.model_response(B), self.model_response(C)]
        out = acquire_bind_and_start_full_http_adaptive_entry(
            repo=self.repo,
            operation_id="OP-FULL-HTTP-SELECT",
            batch_id="BATCH-FULL-HTTP-SELECT",
            request_id="REQ-FULL-HTTP-SELECT",
            learner_id="LRN-HTTP-024",
            desired_outcome=GOAL,
            sample_count=3,
            research_endpoint=self.research_endpoint,
            model_endpoint=self.model_endpoint,
            model_id=MODEL_ID,
            claimed_skill_ids=[],
            now=0,
            research_credential_provider=lambda: RESEARCH_SECRET,
            model_credential_provider=lambda: MODEL_SECRET,
        )
        self.assertEqual(out["status"], "PASS")
        self.assertEqual(out["selection_decision"], "SELECT")
        self.assertTrue(out["journey_created"])
        self.assertIsNotNone(out["course_id"])
        self.assertEqual(self.request_count("/v1/research"), 1)
        self.assertEqual(self.request_count("/v1/generate"), 3)

    def test_full_http_tie_abstains_without_course_or_journey(self):
        self.server.scripts["/v1/research"] = [self.research_response()]
        self.server.scripts["/v1/generate"] = [self.model_response(A), self.model_response(D)]
        out = acquire_bind_and_start_full_http_adaptive_entry(
            repo=self.repo,
            operation_id="OP-FULL-HTTP-ABSTAIN",
            batch_id="BATCH-FULL-HTTP-ABSTAIN",
            request_id="REQ-FULL-HTTP-ABSTAIN",
            learner_id="LRN-HTTP-024",
            desired_outcome=GOAL,
            sample_count=2,
            research_endpoint=self.research_endpoint,
            model_endpoint=self.model_endpoint,
            model_id=MODEL_ID,
            claimed_skill_ids=[],
            now=0,
            research_credential_provider=lambda: RESEARCH_SECRET,
            model_credential_provider=lambda: MODEL_SECRET,
        )
        self.assertEqual(out["status"], "ABSTAIN")
        self.assertEqual(out["selection_decision"], "ABSTAIN")
        self.assertFalse(out["journey_created"])
        self.assertIsNone(out["course_id"])
        self.assertEqual(self.request_count("/v1/research"), 1)
        self.assertEqual(self.request_count("/v1/generate"), 2)


if __name__ == "__main__":
    unittest.main()
