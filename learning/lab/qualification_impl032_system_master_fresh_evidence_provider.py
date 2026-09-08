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

from learning_lab.fraction_domain import REAL_FRACTION_OUTCOME
from learning_lab.fresh_evidence import FreshEvidenceDomainGeneralLearningEngine
from learning_lab.repository import Repository


ROOT = Path(__file__).resolve().parent
MODEL_ID = "LOCAL-FRESH-IMPL032-JAVA"
MODEL_CREDENTIAL = "test-only-model-credential-impl032"
RESEARCH_CREDENTIAL = "test-only-research-credential-impl032"
FRESH_LCD = {
    "item_id": "MN-FRAC-LCD-IMPL032-JAVA",
    "family_id": "F-FRAC-LCD-IMPL032-JAVA",
    "criterion_id": "C-FRAC-EQUIV-LCD",
    "skill_id": "S-FRAC-EQUIV-LCD",
    "mode": "RETENTION_CHECK",
    "prompt": "For 11/18 and 5/12, give the LCD and rewrite both fractions using it. Format: LCD=...; 11/18=...; 5/12=...",
    "answer": "LCD=36; 11/18=22/36; 5/12=15/36",
    "scoring_type": "LCD_EQUIV",
    "claim_refs": ["CL-FRAC-001", "CL-FRAC-002"],
    "fresh_family": True,
}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):
        return

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw_request = self.rfile.read(length)
        rows = self.server.requests.setdefault(self.path, [])
        rows.append({"authorization": self.headers.get("Authorization"), "body": raw_request})
        if self.path == "/v1/model" and len(rows) == 1:
            status = 200
            payload = {
                "model": MODEL_ID,
                "request_id": "LOCAL-IMPL032-JAVA-REQ",
                "output": {"candidate": copy.deepcopy(FRESH_LCD)},
            }
        else:
            status = 500
            payload = {"error": "unexpected-extra-request"}
        raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def configured_env(base: dict[str, str], *, state_root: str, course_id: str, endpoint: str) -> dict[str, str]:
    env = dict(base)
    env.update({
        "SYSTEM_MASTER_LEARNING_STATE_ROOT": state_root,
        "IMPL032_COURSE_ID": course_id,
        "SYSTEM_MASTER_LEARNING_PROVIDER_MODE": "QUALIFICATION_LOCAL",
        "SYSTEM_MASTER_LEARNING_RESEARCH_ENDPOINT": endpoint.replace("/v1/model", "/v1/research"),
        "SYSTEM_MASTER_LEARNING_MODEL_ENDPOINT": endpoint,
        "SYSTEM_MASTER_LEARNING_RESEARCH_PROVIDER_ID": "LOCAL-RESEARCH-IMPL032-JAVA",
        "SYSTEM_MASTER_LEARNING_MODEL_PROVIDER_ID": "LOCAL-MODEL-IMPL032-JAVA",
        "SYSTEM_MASTER_LEARNING_MODEL_ID": MODEL_ID,
        "SYSTEM_MASTER_LEARNING_SAMPLE_COUNT": "2",
        "SYSTEM_MASTER_LEARNING_ALLOWED_RESEARCH_AUTHORITIES": "OFFICIAL-FRACTIONS",
        "SYSTEM_MASTER_LEARNING_RESEARCH_BEARER_TOKEN": RESEARCH_CREDENTIAL,
        "SYSTEM_MASTER_LEARNING_MODEL_BEARER_TOKEN": MODEL_CREDENTIAL,
    })
    return env


def run_override_gate(repo_root: Path, env: dict[str, str], course_id: str, before_calls: int) -> None:
    request = {
        "operation": "ACQUIRE_CONFIGURED_FRESH_EVIDENCE",
        "operation_id": "OP-IMPL032-OVERRIDE",
        "request_id": "REQ-IMPL032-OVERRIDE",
        "state_key": "impl032-java",
        "course_id": course_id,
        "kind": "maintenance",
        "skill_id": "S-FRAC-EQUIV-LCD",
        "criterion_id": "C-FRAC-EQUIV-LCD",
        "requested_at": 200000,
        "admitted_at": 200001,
        "model_id": "FORBIDDEN-RUNTIME-OVERRIDE",
    }
    result = subprocess.run(
        ["python", "learning/lab/fresh_evidence_system_master_bridge.py"],
        cwd=repo_root,
        input=json.dumps(request, sort_keys=True, separators=(",", ":")),
        text=True,
        capture_output=True,
        env=env,
        timeout=30,
        check=False,
    )
    require(result.returncode == 2, "runtime provider override must fail closed")
    require("FRESH_EVIDENCE_RUNTIME_PROVIDER_OVERRIDE_FORBIDDEN:model_id" in result.stdout,
            "runtime override rejection must identify model_id")
    require(MODEL_CREDENTIAL not in result.stdout and RESEARCH_CREDENTIAL not in result.stdout,
            "runtime override failure must not disclose credentials")
    require(before_calls == CURRENT_MODEL_CALLS(), "runtime override must fail before HTTP")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--class-dir", required=True)
    args = parser.parse_args()
    repo_root = Path(os.environ.get("GITHUB_WORKSPACE", ROOT.parents[1])).resolve()
    class_dir = Path(args.class_dir).resolve()

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    server.requests = {}
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address
    model_endpoint = f"http://{host}:{port}/v1/model"

    def model_calls() -> int:
        return len(server.requests.get("/v1/model", []))

    global CURRENT_MODEL_CALLS
    CURRENT_MODEL_CALLS = model_calls

    try:
        with tempfile.TemporaryDirectory(prefix="impl032-java-state-") as state_root:
            state_key = "impl032-java"
            repo = Repository(str(Path(state_root) / f"{state_key}.sqlite3"))
            engine = FreshEvidenceDomainGeneralLearningEngine(repo)
            created = engine.create_research_grounded_course_job(
                operation_id="OP-CREATE-IMPL032-JAVA",
                job_id="JOB-CREATE-IMPL032-JAVA",
                goal_id="G-FRAC-IMPL032-JAVA",
                title="Fractions unlike denominators",
                desired_outcome=REAL_FRACTION_OUTCOME,
            )
            course_id = created["course_id"]
            env = configured_env(os.environ.copy(), state_root=state_root, course_id=course_id, endpoint=model_endpoint)
            result = subprocess.run(
                ["java", "-cp", str(class_dir), "org.systemmaster.learning.Impl032FreshEvidenceProviderQualification"],
                cwd=repo_root,
                text=True,
                capture_output=True,
                env=env,
                timeout=120,
                check=False,
            )
            combined = (result.stdout or "") + (result.stderr or "")
            print(combined, end="" if combined.endswith("\n") else "\n")
            require(result.returncode == 0, f"Java IMPL-032 qualification failed with rc={result.returncode}")
            require("IMPL032_STATUS=PASS" in result.stdout, "Java qualification did not report PASS")
            require("IMPL032_RUNTIME_PROVIDER_CONFIG_FIELDS_IN_COMMAND=NONE" in result.stdout,
                    "Java command did not prove provider configuration exclusion")
            require(MODEL_CREDENTIAL not in combined and RESEARCH_CREDENTIAL not in combined,
                    "credential leaked into qualification output")
            require(model_calls() == 1,
                    f"first execution + exact replay must make one model HTTP call, got {model_calls()}")
            require(len(server.requests.get("/v1/research", [])) == 0,
                    "fresh evidence acquisition must not refetch frozen research dossier")
            row = server.requests["/v1/model"][0]
            require(row["authorization"] == "Bearer " + MODEL_CREDENTIAL,
                    "model HTTP request must use inherited credential")
            require(MODEL_CREDENTIAL.encode("utf-8") not in row["body"],
                    "model credential must not enter request body")

            before_override = model_calls()
            run_override_gate(repo_root, env, course_id, before_override)

            print("IMPL032_ORCHESTRATOR_STATUS=PASS")
            print(f"IMPL032_MODEL_HTTP_CALLS={model_calls()}")
            print("IMPL032_REPLAY_ADDITIONAL_HTTP_CALLS=0")
            print("IMPL032_RUNTIME_OVERRIDE_HTTP_CALLS=0")
            print("IMPL032_RESEARCH_HTTP_CALLS=0")
            print("IMPL032_HTTP_TRANSPORT=REAL_LOCAL_SOCKET")
            print("IMPL032_EXTERNAL_PRODUCTION_PROVIDER=NOT_PROVEN")
            return 0
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


CURRENT_MODEL_CALLS = lambda: 0


if __name__ == "__main__":
    raise SystemExit(main())
