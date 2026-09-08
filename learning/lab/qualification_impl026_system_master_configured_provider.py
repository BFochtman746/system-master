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
RESEARCH_SECRET = "IMPL026-RESEARCH-SECRET-MUST-NOT-PERSIST"
MODEL_SECRET = "IMPL026-MODEL-SECRET-MUST-NOT-PERSIST"


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


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def configured_env(base: dict[str, str], research_endpoint: str, model_endpoint: str) -> dict[str, str]:
    env = dict(base)
    env.update({
        "SYSTEM_MASTER_LEARNING_PROVIDER_MODE": "QUALIFICATION_LOCAL",
        "SYSTEM_MASTER_LEARNING_RESEARCH_ENDPOINT": research_endpoint,
        "SYSTEM_MASTER_LEARNING_MODEL_ENDPOINT": model_endpoint,
        "SYSTEM_MASTER_LEARNING_RESEARCH_PROVIDER_ID": "LOCAL-RESEARCH-QUALIFIER",
        "SYSTEM_MASTER_LEARNING_MODEL_PROVIDER_ID": "LOCAL-MODEL-QUALIFIER",
        "SYSTEM_MASTER_LEARNING_MODEL_ID": MODEL_ID,
        "SYSTEM_MASTER_LEARNING_SAMPLE_COUNT": "3",
        "SYSTEM_MASTER_LEARNING_ALLOWED_RESEARCH_AUTHORITIES": "OFFICIAL_PYTHON_DOCUMENTATION",
        "SYSTEM_MASTER_LEARNING_RESEARCH_BEARER_TOKEN": RESEARCH_SECRET,
        "SYSTEM_MASTER_LEARNING_MODEL_BEARER_TOKEN": MODEL_SECRET,
    })
    return env


def run_runtime_override_gate(repo_root: Path, env: dict[str, str], request_counts: tuple[int, int]) -> None:
    request = {
        "operation": "START_CONFIGURED_FULL_HTTP_PROVIDER_ADAPTIVE_ENTRY",
        "operation_id": "OP-IMPL026-OVERRIDE",
        "batch_id": "BATCH-IMPL026-OVERRIDE",
        "request_id": "REQ-IMPL026-OVERRIDE",
        "state_key": "impl026-override",
        "learner_id": "LRN-IMPL026",
        "desired_outcome": GOAL,
        "claimed_skill_ids": [],
        "now": 0,
        "model_id": "RUNTIME-OVERRIDE-FORBIDDEN",
    }
    with tempfile.TemporaryDirectory(prefix="impl026-override-state-") as state_root:
        gate_env = dict(env)
        gate_env["SYSTEM_MASTER_LEARNING_STATE_ROOT"] = state_root
        result = subprocess.run(
            ["python", "learning/lab/system_master_bridge.py"],
            cwd=repo_root,
            input=json.dumps(request, sort_keys=True, separators=(",", ":")),
            text=True,
            capture_output=True,
            env=gate_env,
            timeout=30,
            check=False,
        )
    require(result.returncode == 2, "runtime provider override must fail bridge closed")
    require("CONFIGURED_PROVIDER_RUNTIME_OVERRIDE_FORBIDDEN:model_id" in result.stdout,
            "runtime override rejection must identify the forbidden model_id field")
    require(RESEARCH_SECRET not in result.stdout and MODEL_SECRET not in result.stdout,
            "override failure must not disclose provider credentials")
    require(request_counts == CURRENT_COUNTS(), "runtime override must fail before any HTTP call")


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
        "/v1/research": [{
            "request_id": "RSCH-IMPL026-SELECT",
            "body": {"request_id": "RSCH-IMPL026-SELECT", "capture": copy.deepcopy(capture)},
        }],
        "/v1/model": [
            {
                "request_id": f"MODEL-IMPL026-{index}",
                "body": {
                    "request_id": f"MODEL-IMPL026-{index}",
                    "model": MODEL_ID,
                    "output": copy.deepcopy(traces[trace_id]["output"]),
                },
            }
            for index, trace_id in enumerate((A, B, C))
        ],
    }
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address
    research_endpoint = f"http://{host}:{port}/v1/research"
    model_endpoint = f"http://{host}:{port}/v1/model"

    def counts() -> tuple[int, int]:
        return (len(server.requests.get("/v1/research", [])), len(server.requests.get("/v1/model", [])))

    global CURRENT_COUNTS
    CURRENT_COUNTS = counts

    try:
        env = configured_env(os.environ.copy(), research_endpoint, model_endpoint)
        result = subprocess.run(
            ["java", "-cp", str(class_dir), "org.systemmaster.learning.Impl026ConfiguredProviderQualification"],
            cwd=repo_root,
            text=True,
            capture_output=True,
            env=env,
            timeout=120,
            check=False,
        )
        combined = (result.stdout or "") + (result.stderr or "")
        print(combined, end="" if combined.endswith("\n") else "\n")
        require(result.returncode == 0, f"Java configured-provider qualification failed with rc={result.returncode}")
        require("IMPL026_STATUS=PASS" in result.stdout, "Java qualification did not report PASS")
        require("IMPL026_RUNTIME_CONFIG_FIELDS_IN_COMMAND=NONE" in result.stdout,
                "Java qualification did not prove configuration-free command schema")
        require(RESEARCH_SECRET not in combined and MODEL_SECRET not in combined,
                "provider secret leaked to qualification output")

        research_rows = server.requests.get("/v1/research", [])
        model_rows = server.requests.get("/v1/model", [])
        require(len(research_rows) == 1,
                f"select + exact replay must make one research HTTP call, got {len(research_rows)}")
        require(len(model_rows) == 3,
                f"select + exact replay must make three model HTTP calls, got {len(model_rows)}")
        require(all(row["authorization"] == "Bearer " + RESEARCH_SECRET for row in research_rows),
                "research HTTP request must use configured inherited credential")
        require(all(row["authorization"] == "Bearer " + MODEL_SECRET for row in model_rows),
                "model HTTP requests must use configured inherited credential")
        require(all(RESEARCH_SECRET.encode("utf-8") not in row["body"] for row in research_rows),
                "research credential must not enter request body")
        require(all(MODEL_SECRET.encode("utf-8") not in row["body"] for row in model_rows),
                "model credential must not enter request body")

        before_override = counts()
        run_runtime_override_gate(repo_root, env, before_override)

        print("IMPL026_ORCHESTRATOR_STATUS=PASS")
        print(f"IMPL026_RESEARCH_HTTP_CALLS={len(research_rows)}")
        print(f"IMPL026_MODEL_HTTP_CALLS={len(model_rows)}")
        print("IMPL026_REPLAY_ADDITIONAL_HTTP_CALLS=0")
        print("IMPL026_RUNTIME_OVERRIDE_HTTP_CALLS=0")
        print("IMPL026_CONFIG_SOURCE=ENVIRONMENT_ONLY")
        print("IMPL026_HTTP_TRANSPORT=REAL_LOCAL_SOCKET")
        print("IMPL026_PRODUCTION_EXTERNAL_PROVIDER=NOT_PROVEN")
        return 0
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


CURRENT_COUNTS = lambda: (0, 0)


if __name__ == "__main__":
    raise SystemExit(main())
