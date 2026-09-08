from __future__ import annotations

import copy
import json
import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from learning_lab.production_provider_config import (
    MODEL_TOKEN_ENV,
    PRODUCTION_MODE,
    PRODUCTION_PROVIDER_BINDING_KIND,
    QUALIFICATION_LOCAL_MODE,
    RESEARCH_TOKEN_ENV,
    acquire_configured_and_start_full_http_adaptive_entry,
    load_production_provider_config,
)
from learning_lab.repository import Repository


ROOT = Path(__file__).resolve().parents[1]
CAPTURE_PATH = ROOT / "sources" / "LIVE_RESEARCH_PYTHON_COMPREHENSIONS_V1.json"
MULTI_PATH = ROOT / "sources" / "MODEL_GENERATION_PYTHON_COMPREHENSIONS_MULTI_CANDIDATE_V1.json"
GOAL = "Use Python list and dictionary comprehensions to transform and filter data."
MODEL_ID = "LOCAL-FULL-HTTP-PROVIDER-IMPL024"
A = "MODEL-GEN-PY-COMP-MC-A-20260907"
B = "MODEL-GEN-PY-COMP-MC-B-20260907"
C = "MODEL-GEN-PY-COMP-MC-C-20260907"
RESEARCH_SECRET = "CONFIG-RESEARCH-SECRET"
MODEL_SECRET = "CONFIG-MODEL-SECRET"


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):
        return

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        rows = self.server.requests.setdefault(self.path, [])
        rows.append({"authorization": self.headers.get("Authorization"), "body": body})
        scripts = self.server.scripts.get(self.path, [])
        index = len(rows) - 1
        if index >= len(scripts):
            status, payload, request_id = 500, {"error": "unexpected-extra-request"}, None
        else:
            script = scripts[index]
            status = int(script.get("status", 200))
            payload = script["body"]
            request_id = script.get("request_id")
        raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        if request_id:
            self.send_header("X-Request-Id", request_id)
        self.end_headers()
        self.wfile.write(raw)


class ProductionProviderConfigTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.repo = Repository(os.path.join(self.td.name, "learning.sqlite3"))
        self.capture = json.loads(CAPTURE_PATH.read_text(encoding="utf-8"))
        fixture = json.loads(MULTI_PATH.read_text(encoding="utf-8"))
        self.traces = {trace["generation_trace_id"]: trace for trace in fixture["traces"]}
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.server.daemon_threads = True
        self.server.requests = {}
        self.server.scripts = {"/research": [], "/model": [], "/model-drift": []}
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        host, port = self.server.server_address
        self.research_endpoint = f"http://{host}:{port}/research"
        self.model_endpoint = f"http://{host}:{port}/model"
        self.model_drift_endpoint = f"http://{host}:{port}/model-drift"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.td.cleanup()

    def env(self, **updates):
        out = {
            "SYSTEM_MASTER_LEARNING_PROVIDER_MODE": QUALIFICATION_LOCAL_MODE,
            "SYSTEM_MASTER_LEARNING_RESEARCH_ENDPOINT": self.research_endpoint,
            "SYSTEM_MASTER_LEARNING_MODEL_ENDPOINT": self.model_endpoint,
            "SYSTEM_MASTER_LEARNING_RESEARCH_PROVIDER_ID": "LOCAL-RESEARCH-QUALIFIER",
            "SYSTEM_MASTER_LEARNING_MODEL_PROVIDER_ID": "LOCAL-MODEL-QUALIFIER",
            "SYSTEM_MASTER_LEARNING_MODEL_ID": MODEL_ID,
            "SYSTEM_MASTER_LEARNING_SAMPLE_COUNT": "3",
            "SYSTEM_MASTER_LEARNING_ALLOWED_RESEARCH_AUTHORITIES": "OFFICIAL_PYTHON_DOCUMENTATION",
            RESEARCH_TOKEN_ENV: RESEARCH_SECRET,
            MODEL_TOKEN_ENV: MODEL_SECRET,
        }
        out.update(updates)
        return out

    def script_select(self):
        self.server.scripts["/research"] = [{
            "request_id": "R-CONFIG-1",
            "body": {"request_id": "R-CONFIG-1", "capture": copy.deepcopy(self.capture)},
        }]
        self.server.scripts["/model"] = []
        for index, trace_id in enumerate((A, B, C)):
            self.server.scripts["/model"].append({
                "request_id": f"M-CONFIG-{index}",
                "body": {
                    "request_id": f"M-CONFIG-{index}",
                    "model": MODEL_ID,
                    "output": copy.deepcopy(self.traces[trace_id]["output"]),
                },
            })

    def acquire(self, env=None):
        return acquire_configured_and_start_full_http_adaptive_entry(
            repo=self.repo,
            operation_id="OP-CONFIG-026",
            batch_id="BATCH-CONFIG-026",
            request_id="REQ-CONFIG-026",
            learner_id="LRN-CONFIG-026",
            desired_outcome=GOAL,
            claimed_skill_ids=[],
            now=0,
            env=self.env() if env is None else env,
        )

    def test_local_qualification_config_is_fingerprinted_without_secret(self):
        config = load_production_provider_config(self.env())
        self.assertEqual(config["mode"], QUALIFICATION_LOCAL_MODE)
        self.assertEqual(config["sample_count"], 3)
        self.assertEqual(config["research_endpoint_identity"]["host"], "127.0.0.1")
        self.assertTrue(config["config_fingerprint"])
        encoded = json.dumps(config, sort_keys=True)
        self.assertNotIn(RESEARCH_SECRET, encoded)
        self.assertNotIn(MODEL_SECRET, encoded)

    def test_production_requires_https_and_nonlocal_endpoint(self):
        base = self.env(
            SYSTEM_MASTER_LEARNING_PROVIDER_MODE=PRODUCTION_MODE,
            SYSTEM_MASTER_LEARNING_RESEARCH_ENDPOINT="https://research.example.com/v1/research",
            SYSTEM_MASTER_LEARNING_MODEL_ENDPOINT="https://model.example.com/v1/generate",
        )
        config = load_production_provider_config(base)
        self.assertEqual(config["mode"], PRODUCTION_MODE)
        self.assertEqual(config["research_endpoint_identity"]["scheme"], "https")

        bad_http = dict(base)
        bad_http["SYSTEM_MASTER_LEARNING_MODEL_ENDPOINT"] = "http://model.example.com/v1/generate"
        with self.assertRaisesRegex(ValueError, "PRODUCTION_HTTPS_REQUIRED:MODEL"):
            load_production_provider_config(bad_http)

        bad_local = dict(base)
        bad_local["SYSTEM_MASTER_LEARNING_RESEARCH_ENDPOINT"] = "https://127.0.0.1/research"
        with self.assertRaisesRegex(ValueError, "PRODUCTION_NONPUBLIC_IP_FORBIDDEN:RESEARCH"):
            load_production_provider_config(bad_local)

    def test_local_mode_rejects_nonloopback_even_with_https(self):
        env = self.env(SYSTEM_MASTER_LEARNING_MODEL_ENDPOINT="https://model.example.com/v1/generate")
        with self.assertRaisesRegex(ValueError, "QUALIFICATION_ENDPOINT_NOT_LOOPBACK:MODEL"):
            load_production_provider_config(env)

    def test_missing_credentials_and_invalid_sample_count_fail_closed(self):
        missing = self.env()
        del missing[RESEARCH_TOKEN_ENV]
        with self.assertRaisesRegex(ValueError, "PROVIDER_CONFIG_REQUIRED:" + RESEARCH_TOKEN_ENV):
            load_production_provider_config(missing)
        for count in ("1", "5", "03", "x"):
            env = self.env(SYSTEM_MASTER_LEARNING_SAMPLE_COUNT=count)
            with self.assertRaises(ValueError):
                load_production_provider_config(env)

    def test_configured_full_path_selects_and_exact_replay_makes_zero_new_http_calls(self):
        self.script_select()
        first = self.acquire()
        self.assertEqual(first["status"], "PASS")
        self.assertEqual(first["selection_decision"], "SELECT")
        self.assertTrue(first["journey_created"])
        self.assertEqual(first["provider_mode"], QUALIFICATION_LOCAL_MODE)
        self.assertEqual(first["configured_sample_count"], 3)
        self.assertEqual(len(self.server.requests["/research"]), 1)
        self.assertEqual(len(self.server.requests["/model"]), 3)

        before = (len(self.server.requests["/research"]), len(self.server.requests["/model"]))
        replay = self.acquire()
        after = (len(self.server.requests["/research"]), len(self.server.requests["/model"]))
        self.assertEqual(first, replay)
        self.assertEqual(before, after)

    def test_configuration_binding_is_durable_and_contains_no_secret(self):
        self.script_select()
        self.acquire()
        binding = self.repo.get_object(PRODUCTION_PROVIDER_BINDING_KIND, "BATCH-CONFIG-026", 1)
        self.assertIsNotNone(binding)
        self.assertEqual(binding["standing"], "CONFIGURATION_PINNED_BEFORE_PROVIDER_EXECUTION")
        encoded = json.dumps(binding, sort_keys=True)
        self.assertNotIn(RESEARCH_SECRET, encoded)
        self.assertNotIn(MODEL_SECRET, encoded)
        self.assertNotIn(self.research_endpoint, encoded)
        self.assertNotIn(self.model_endpoint, encoded)

    def test_configuration_drift_fails_before_any_new_provider_call(self):
        self.script_select()
        self.acquire()
        before = sum(len(rows) for rows in self.server.requests.values())
        drifted = self.env(SYSTEM_MASTER_LEARNING_MODEL_ENDPOINT=self.model_drift_endpoint)
        with self.assertRaisesRegex(ValueError, "PROVIDER_CONFIGURATION_DRIFT"):
            self.acquire(drifted)
        after = sum(len(rows) for rows in self.server.requests.values())
        self.assertEqual(before, after)
        self.assertEqual(self.server.requests["/model-drift"], [])

    def test_allowed_research_authority_is_enforced_before_model_calls(self):
        self.server.scripts["/research"] = [{
            "request_id": "R-CONFIG-AUTH",
            "body": {"request_id": "R-CONFIG-AUTH", "capture": copy.deepcopy(self.capture)},
        }]
        env = self.env(SYSTEM_MASTER_LEARNING_ALLOWED_RESEARCH_AUTHORITIES="SOME_OTHER_AUTHORITY")
        with self.assertRaisesRegex(ValueError, "HTTP_RESEARCH_SOURCE_AUTHORITY_REJECTED"):
            self.acquire(env)
        self.assertEqual(len(self.server.requests["/research"]), 1)
        self.assertEqual(self.server.requests["/model"], [])


if __name__ == "__main__":
    unittest.main()
