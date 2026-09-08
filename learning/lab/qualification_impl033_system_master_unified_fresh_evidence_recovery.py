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

from learning_lab.adaptive import MultiSessionDirector
from learning_lab.adaptive_entry import AdaptiveEntryJourneyDirector
from learning_lab.baseline_diagnostic import BaselineDiagnosticDirector
from learning_lab.domain_general import DomainGeneralTutorDirector
from learning_lab.fraction_domain import REAL_FRACTION_OUTCOME
from learning_lab.fresh_evidence import FreshEvidenceDomainGeneralLearningEngine
from learning_lab.repository import Repository


ROOT = Path(__file__).resolve().parent
MODEL_ID = "LOCAL-FRESH-IMPL033-JAVA"
MODEL_CREDENTIAL = "test-only-model-credential-impl033"
RESEARCH_CREDENTIAL = "test-only-research-credential-impl033"
FRESH_LCD = {
    "item_id": "MN-FRAC-LCD-IMPL033-JAVA",
    "family_id": "F-FRAC-LCD-IMPL033-JAVA",
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
                "request_id": "LOCAL-IMPL033-JAVA-REQ",
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


def create_blocked_runtime(repo: Repository):
    engine = FreshEvidenceDomainGeneralLearningEngine(repo)
    created = engine.create_research_grounded_course_job(
        operation_id="OP-CREATE-IMPL033-JAVA",
        job_id="JOB-CREATE-IMPL033-JAVA",
        goal_id="G-FRAC-IMPL033-JAVA",
        title="Fractions unlike denominators",
        desired_outcome=REAL_FRACTION_OUTCOME,
    )
    course_id = created["course_id"]
    learner_id = "L-IMPL033-JAVA"
    engine.submit_attempt(
        operation_id="OP-M-IMPL033-JAVA",
        attempt_id="ATT-M-IMPL033-JAVA",
        learner_id=learner_id,
        course_id=course_id,
        item_id="M-FRAC-LCD-1",
        response="LCD=24; 5/8=15/24; 7/12=14/24",
        submitted_at=0,
    )
    engine.submit_attempt(
        operation_id="OP-R-IMPL033-JAVA",
        attempt_id="ATT-R-IMPL033-JAVA",
        learner_id=learner_id,
        course_id=course_id,
        item_id="R-FRAC-LCD-1",
        response="LCD=60; 3/10=18/60; 5/12=25/60",
        submitted_at=3600,
    )
    stale_at = 3600 + engine.RETENTION_FRESHNESS_SECONDS + 1
    engine.submit_maintenance_attempt(
        operation_id="OP-MN-IMPL033-JAVA",
        attempt_id="ATT-MN-IMPL033-JAVA",
        learner_id=learner_id,
        course_id=course_id,
        task_id="MN-FRAC-LCD-2",
        response="LCD=90; 7/15=42/90; 5/18=25/90",
        submitted_at=stale_at,
    )
    recovery_at = stale_at + engine.RETENTION_FRESHNESS_SECONDS + 1
    require(
        engine.next_action(learner_id, course_id, now=recovery_at)["action_type"] == "MAINTENANCE_RESEARCH_REQUIRED",
        "precondition must be real maintenance-family exhaustion",
    )

    scorer = engine._spec_for_course(course_id).behavior_oracle.score
    diagnostic = BaselineDiagnosticDirector(repo, scorer=scorer)
    tutor = DomainGeneralTutorDirector(repo, engine)
    sessions = MultiSessionDirector(repo, engine)
    journey = AdaptiveEntryJourneyDirector(repo, engine, diagnostic, tutor, sessions)
    journey_id = "J-IMPL033-JAVA"
    session_id = "S-IMPL033-JAVA"
    journey.start_journey(
        operation_id="OP-J-IMPL033-JAVA",
        journey_id=journey_id,
        diagnostic_id="D-IMPL033-JAVA",
        learner_id=learner_id,
        course_id=course_id,
        claimed_skill_ids=[],
        started_at=recovery_at,
    )
    sessions.start_session(
        operation_id="OP-S-IMPL033-JAVA",
        session_id=session_id,
        learner_id=learner_id,
        course_id=course_id,
        started_at=recovery_at,
    )
    return course_id, learner_id, journey_id, session_id, recovery_at


def configured_env(base: dict[str, str], *, state_root: str, endpoint: str,
                   course_id: str, learner_id: str, journey_id: str,
                   session_id: str, recovery_at: int) -> dict[str, str]:
    env = dict(base)
    env.update({
        "SYSTEM_MASTER_LEARNING_STATE_ROOT": state_root,
        "IMPL033_COURSE_ID": course_id,
        "IMPL033_LEARNER_ID": learner_id,
        "IMPL033_JOURNEY_ID": journey_id,
        "IMPL033_SESSION_ID": session_id,
        "IMPL033_RECOVERY_AT": str(recovery_at),
        "SYSTEM_MASTER_LEARNING_PROVIDER_MODE": "QUALIFICATION_LOCAL",
        "SYSTEM_MASTER_LEARNING_RESEARCH_ENDPOINT": endpoint.replace("/v1/model", "/v1/research"),
        "SYSTEM_MASTER_LEARNING_MODEL_ENDPOINT": endpoint,
        "SYSTEM_MASTER_LEARNING_RESEARCH_PROVIDER_ID": "LOCAL-RESEARCH-IMPL033-JAVA",
        "SYSTEM_MASTER_LEARNING_MODEL_PROVIDER_ID": "LOCAL-MODEL-IMPL033-JAVA",
        "SYSTEM_MASTER_LEARNING_MODEL_ID": MODEL_ID,
        "SYSTEM_MASTER_LEARNING_SAMPLE_COUNT": "2",
        "SYSTEM_MASTER_LEARNING_ALLOWED_RESEARCH_AUTHORITIES": "OFFICIAL-FRACTIONS",
        "SYSTEM_MASTER_LEARNING_RESEARCH_BEARER_TOKEN": RESEARCH_CREDENTIAL,
        "SYSTEM_MASTER_LEARNING_MODEL_BEARER_TOKEN": MODEL_CREDENTIAL,
    })
    return env


def run_override_gate(repo_root: Path, env: dict[str, str], *, course_id: str,
                      learner_id: str, journey_id: str, session_id: str, recovery_at: int,
                      before_calls: int, model_calls) -> None:
    request = {
        "operation": "PREPARE_LEARNING_TURN_WITH_FRESH_EVIDENCE_RECOVERY",
        "operation_id": "OP-IMPL033-OVERRIDE",
        "recovery_id": "REC-IMPL033-OVERRIDE",
        "turn_id": "TURN-IMPL033-OVERRIDE",
        "state_key": "impl033-java",
        "journey_id": journey_id,
        "session_id": session_id,
        "learner_id": learner_id,
        "course_id": course_id,
        "now": recovery_at,
        "kind": "maintenance",
    }
    result = subprocess.run(
        ["python", "learning/lab/system_master_recovery_turn_bridge.py"],
        cwd=repo_root,
        input=json.dumps(request, sort_keys=True, separators=(",", ":")),
        text=True,
        capture_output=True,
        env=env,
        timeout=30,
        check=False,
    )
    require(result.returncode == 2, "caller recovery-scope override must fail closed")
    require("FRESH_RECOVERY_RUNTIME_OVERRIDE_FORBIDDEN:kind" in result.stdout,
            "runtime override rejection must identify kind")
    require(MODEL_CREDENTIAL not in result.stdout and RESEARCH_CREDENTIAL not in result.stdout,
            "runtime override failure must not disclose credentials")
    require(before_calls == model_calls(), "runtime override must fail before HTTP")


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

    try:
        with tempfile.TemporaryDirectory(prefix="impl033-java-state-") as state_root:
            state_key = "impl033-java"
            repo = Repository(str(Path(state_root) / f"{state_key}.sqlite3"))
            course_id, learner_id, journey_id, session_id, recovery_at = create_blocked_runtime(repo)
            env = configured_env(
                os.environ.copy(),
                state_root=state_root,
                endpoint=model_endpoint,
                course_id=course_id,
                learner_id=learner_id,
                journey_id=journey_id,
                session_id=session_id,
                recovery_at=recovery_at,
            )
            result = subprocess.run(
                ["java", "-cp", str(class_dir), "org.systemmaster.learning.Impl033UnifiedFreshEvidenceRecoveryQualification"],
                cwd=repo_root,
                text=True,
                capture_output=True,
                env=env,
                timeout=120,
                check=False,
            )
            combined = (result.stdout or "") + (result.stderr or "")
            print(combined, end="" if combined.endswith("\n") else "\n")
            require(result.returncode == 0, f"Java IMPL-033 qualification failed with rc={result.returncode}")
            require("IMPL033_STATUS=PASS" in result.stdout, "Java qualification did not report PASS")
            require("IMPL033_CALLER_RECOVERY_SCOPE_FIELDS=NONE" in result.stdout,
                    "Java command did not prove recovery-scope exclusion")
            require(MODEL_CREDENTIAL not in combined and RESEARCH_CREDENTIAL not in combined,
                    "credential leaked into qualification output")
            require(model_calls() == 1,
                    f"first recovery + exact replay must make one model HTTP call, got {model_calls()}")
            require(len(server.requests.get("/v1/research", [])) == 0,
                    "fresh recovery must not refetch frozen research dossier")
            row = server.requests["/v1/model"][0]
            require(row["authorization"] == "Bearer " + MODEL_CREDENTIAL,
                    "model HTTP request must use inherited credential")
            require(MODEL_CREDENTIAL.encode("utf-8") not in row["body"],
                    "model credential must not enter request body")

            before_override = model_calls()
            run_override_gate(
                repo_root,
                env,
                course_id=course_id,
                learner_id=learner_id,
                journey_id=journey_id,
                session_id=session_id,
                recovery_at=recovery_at,
                before_calls=before_override,
                model_calls=model_calls,
            )

            print("IMPL033_ORCHESTRATOR_STATUS=PASS")
            print(f"IMPL033_MODEL_HTTP_CALLS={model_calls()}")
            print("IMPL033_REPLAY_ADDITIONAL_HTTP_CALLS=0")
            print("IMPL033_RUNTIME_OVERRIDE_HTTP_CALLS=0")
            print("IMPL033_RESEARCH_HTTP_CALLS=0")
            print("IMPL033_HTTP_TRANSPORT=REAL_LOCAL_SOCKET")
            print("IMPL033_EXTERNAL_PRODUCTION_PROVIDER=NOT_PROVEN")
            return 0
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


if __name__ == "__main__":
    raise SystemExit(main())
