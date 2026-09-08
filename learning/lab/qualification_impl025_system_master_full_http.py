from __future__ import annotations

import argparse
import copy
import json
import os
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CAPTURE_PATH = ROOT / "sources" / "LIVE_RESEARCH_PYTHON_COMPREHENSIONS_V1.json"
MULTI_PATH = ROOT / "sources" / "MODEL_GENERATION_PYTHON_COMPREHENSIONS_MULTI_CANDIDATE_V1.json"
GOAL = "Use Python list and dictionary comprehensions to transform and filter data."
MODEL_ID = "LOCAL-FULL-HTTP-PROVIDER-IMPL024"
A = "MODEL-GEN-PY-COMP-MC-A-20260907"
B = "MODEL-GEN-PY-COMP-MC-B-20260907"
C = "MODEL-GEN-PY-COMP-MC-C-20260907"
D = "MODEL-GEN-PY-COMP-MC-D-20260907"
RESEARCH_SECRET = "IMPL025-RESEARCH-SECRET-MUST-NOT-PERSIST"
MODEL_SECRET = "IMPL025-MODEL-SECRET-MUST-NOT-PERSIST"


class Handler(BaseHTTPRequestHandler):
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
        scripts = self.server.scripts.get(self.path, [])
        index = len(rows) - 1
        if index >= len(scripts):
            payload = {"error": "unexpected-extra-request", "index": index}
            status = 500
            request_id = None
        else:
            script = scripts[index]
            payload = script["body"]
            status = int(script.get("status", 200))
            request_id = script.get("request_id")
        raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        if request_id:
            self.send_header("X-Request-Id", request_id)
        self.end_headers()
        self.wfile.write(raw)


def research_response(capture: dict, request_id: str) -> dict:
    return {
        "status": 200,
        "request_id": request_id,
        "body": {"request_id": request_id, "capture": copy.deepcopy(capture)},
    }


def model_response(traces: dict[str, dict], trace_id: str, request_id: str) -> dict:
    return {
        "status": 200,
        "request_id": request_id,
        "body": {
            "request_id": request_id,
            "model": MODEL_ID,
            "output": copy.deepcopy(traces[trace_id]["output"]),
        },
    }


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def run_missing_credential_gate(repo_root: Path, research_endpoint: str, model_endpoint: str) -> None:
    request = {
        "operation": "START_FULL_HTTP_PROVIDER_ADAPTIVE_ENTRY",
        "operation_id": "OP-IMPL025-MISSING-CREDENTIAL",
        "batch_id": "BATCH-IMPL025-MISSING-CREDENTIAL",
        "request_id": "REQ-IMPL025-MISSING-CREDENTIAL",
        "state_key": "impl025-missing-credential",
        "learner_id": "LRN-IMPL025",
        "desired_outcome": GOAL,
        "sample_count": 2,
        "model_id": MODEL_ID,
        "research_endpoint": research_endpoint,
        "model_endpoint": model_endpoint,
        "claimed_skill_ids": [],
        "now": 0,
    }
    env = os.environ.copy()
    env.pop("SYSTEM_MASTER_LEARNING_RESEARCH_BEARER_TOKEN", None)
    env.pop("SYSTEM_MASTER_LEARNING_MODEL_BEARER_TOKEN", None)
    with tempfile.TemporaryDirectory(prefix="impl025-missing-credential-") as state_root:
        env["SYSTEM_MASTER_LEARNING_STATE_ROOT"] = state_root
        result = subprocess.run(
            ["python", "learning/lab/system_master_bridge.py"],
            cwd=repo_root,
            input=json.dumps(request, sort_keys=True, separators=(",", ":")),
            text=True,
            capture_output=True,
            env=env,
            timeout=30,
            check=False,
        )
    require(result.returncode == 2, f"missing credential must fail bridge closed: rc={result.returncode}")
    require("PROVIDER_CREDENTIAL_REQUIRED:SYSTEM_MASTER_LEARNING_RESEARCH_BEARER_TOKEN" in result.stdout,
            "bridge must explicitly reject missing research credential before provider execution")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--class-dir", required=True)
    args = parser.parse_args()

    repo_root = Path(os.environ.get("GITHUB_WORKSPACE", ROOT.parents[1])).resolve()
    class_dir = Path(args.class_dir).resolve()
    capture = json.loads(CAPTURE_PATH.read_text(encoding="utf-8"))
    fixture = json.loads(MULTI_PATH.read_text(encoding="utf-8"))
    traces = {trace["generation_trace_id"]: trace for trace in fixture["traces"]}

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    server.requests = {}
    server.scripts = {
        "/v1/research": [
            research_response(capture, "RSCH-IMPL025-SELECT"),
            research_response(capture, "RSCH-IMPL025-ABSTAIN"),
        ],
        "/v1/model": [
            model_response(traces, A, "MODEL-IMPL025-A"),
            model_response(traces, B, "MODEL-IMPL025-B"),
            model_response(traces, C, "MODEL-IMPL025-C"),
            model_response(traces, A, "MODEL-IMPL025-A2"),
            model_response(traces, D, "MODEL-IMPL025-D"),
        ],
    }
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address
    research_endpoint = f"http://{host}:{port}/v1/research"
    model_endpoint = f"http://{host}:{port}/v1/model"

    try:
        env = os.environ.copy()
        env["IMPL025_RESEARCH_ENDPOINT"] = research_endpoint
        env["IMPL025_MODEL_ENDPOINT"] = model_endpoint
        env["SYSTEM_MASTER_LEARNING_RESEARCH_BEARER_TOKEN"] = RESEARCH_SECRET
        env["SYSTEM_MASTER_LEARNING_MODEL_BEARER_TOKEN"] = MODEL_SECRET
        result = subprocess.run(
            ["java", "-cp", str(class_dir), "org.systemmaster.learning.Impl025FullHttpProviderIntegrationQualification"],
            cwd=repo_root,
            text=True,
            capture_output=True,
            env=env,
            timeout=120,
            check=False,
        )
        combined = (result.stdout or "") + (result.stderr or "")
        print(combined, end="" if combined.endswith("\n") else "\n")
        require(result.returncode == 0, f"Java qualification failed with rc={result.returncode}")
        require("IMPL025_STATUS=PASS" in result.stdout, "Java qualification did not report PASS")
        require(RESEARCH_SECRET not in combined, "research secret leaked to Java qualification output")
        require(MODEL_SECRET not in combined, "model secret leaked to Java qualification output")

        research_rows = server.requests.get("/v1/research", [])
        model_rows = server.requests.get("/v1/model", [])
        require(len(research_rows) == 2,
                f"select + replay + abstain must make exactly two research HTTP calls, got {len(research_rows)}")
        require(len(model_rows) == 5,
                f"select + replay + abstain must make exactly five model HTTP calls, got {len(model_rows)}")
        require(all(row["authorization"] == "Bearer " + RESEARCH_SECRET for row in research_rows),
                "every research HTTP call must receive the inherited research credential")
        require(all(row["authorization"] == "Bearer " + MODEL_SECRET for row in model_rows),
                "every model HTTP call must receive the inherited model credential")
        require(all(RESEARCH_SECRET.encode("utf-8") not in row["body"] for row in research_rows),
                "research credential must not enter HTTP JSON request bodies")
        require(all(MODEL_SECRET.encode("utf-8") not in row["body"] for row in model_rows),
                "model credential must not enter HTTP JSON request bodies")

        calls_before_missing = (len(research_rows), len(model_rows))
        run_missing_credential_gate(repo_root, research_endpoint, model_endpoint)
        require((len(server.requests.get("/v1/research", [])), len(server.requests.get("/v1/model", []))) == calls_before_missing,
                "missing credential must fail before any HTTP provider call")

        print("IMPL025_ORCHESTRATOR_STATUS=PASS")
        print(f"IMPL025_RESEARCH_HTTP_CALLS={len(research_rows)}")
        print(f"IMPL025_MODEL_HTTP_CALLS={len(model_rows)}")
        print("IMPL025_REPLAY_ADDITIONAL_HTTP_CALLS=0")
        print("IMPL025_MISSING_CREDENTIAL_HTTP_CALLS=0")
        print("IMPL025_HTTP_TRANSPORT=REAL_LOCAL_SOCKET")
        return 0
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


if __name__ == "__main__":
    raise SystemExit(main())
