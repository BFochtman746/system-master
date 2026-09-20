from __future__ import annotations

import argparse
import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any

from a01_execution_worker import (
    A01ExecutionWorker,
    ExecutionContext,
    RETRY_SAFE,
    WorkExecutionFailed,
)
from tools.second_shift_supervisor_v2 import StaleWorker, SupervisorStore

REGISTERED_TASK_EXECUTOR = "A01_REGISTERED_TASK"
REGISTERED_TASK_PROTOCOL = "control-gateway.a01-registered-task-result.v1"


class A01RegisteredTaskExecutionWorker(A01ExecutionWorker):
    """Second Shift worker with the proven bounded registered-task executor attached."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.executors[REGISTERED_TASK_EXECUTOR] = self._execute_registered_task
        self.executor_retry_safety[REGISTERED_TASK_EXECUTOR] = RETRY_SAFE

    def _execute_registered_task(self, payload: dict[str, Any], context: ExecutionContext) -> dict[str, Any]:
        if not isinstance(payload, dict):
            raise WorkExecutionFailed("registered task payload must be an object")
        expected = {"qualification_id", "workstream_id", "subject_sha", "control_plane_sha", "task_id", "task_type", "instruction", "model", "max_output_tokens", "temperature"}
        if set(payload) != expected:
            raise WorkExecutionFailed("registered task payload fields differ from frozen contract")
        subject_sha = self._require_string(payload, "subject_sha")
        control_plane_sha = self._require_string(payload, "control_plane_sha")
        task_id = self._require_string(payload, "task_id")
        if self._require_string(payload, "task_type") != "TEXT_RESPONSE_V1":
            raise WorkExecutionFailed("registered task_type is not TEXT_RESPONSE_V1")
        if self._require_string(payload, "model") != "gpt-oss-20b-NPU":
            raise WorkExecutionFailed("registered task model differs from frozen local model")
        if len(self._require_string(payload, "instruction")) > 12000:
            raise WorkExecutionFailed("registered task instruction exceeds 12000 characters")
        if type(payload.get("max_output_tokens")) is not int or not 1 <= payload["max_output_tokens"] <= 1024:
            raise WorkExecutionFailed("registered task max_output_tokens must be integer 1..1024")
        if payload.get("temperature") != 0:
            raise WorkExecutionFailed("registered task temperature must be exactly 0")
        checkout = self._git_head()
        if subject_sha.lower() != checkout.lower() or control_plane_sha.lower() != checkout.lower():
            raise WorkExecutionFailed("registered task is not bound to exact local checkout")
        row = self.store.conn.execute(
            "SELECT handoff_json FROM night_scheduler_queue WHERE delegation_id=?",
            (context.delegation_id,),
        ).fetchone()
        if row is None:
            raise WorkExecutionFailed("registered task dispatch is missing its scheduler handoff")
        handoff = json.loads(row["handoff_json"])
        receipt = handoff.get("admission_receipt")
        if handoff.get("executor_kind") != REGISTERED_TASK_EXECUTOR or not isinstance(receipt, dict) or receipt.get("task_id") != task_id:
            raise WorkExecutionFailed("registered task identity differs from admitted handoff")
        evidence_dir = context.evidence_dir
        evidence_dir.mkdir(parents=True, exist_ok=False)
        input_path = evidence_dir / "registered-task-input.json"
        result_path = evidence_dir / "registered-task-result.json"
        input_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        script = self.root / ".github" / "scripts" / "a01-agent-registered-task-production-binding-001.js"
        if not script.is_file():
            raise WorkExecutionFailed("registered task executor wrapper is missing")
        env = os.environ.copy()
        env.update({
            "A01_REGISTERED_TASK_INPUT": str(input_path),
            "A01_REGISTERED_TASK_RESULT": str(result_path),
            "A01_REGISTERED_TASK_EVIDENCE_DIR": str(evidence_dir),
            "A01_REGISTERED_TASK_IDEMPOTENCY_KEY": context.idempotency_key,
            "A01_REGISTERED_TASK_ATTEMPT_ID": context.attempt_id,
            "A01_REGISTERED_TASK_EXECUTION_GENERATION": str(context.execution_generation),
            "A01_SUBJECT_ROOT": str(self.root),
            "A01_SUBJECT_SHA": subject_sha,
        })
        proc = self._spawn_managed_process(["node", str(script), "--execute-task"], cwd=self.root, env=env)
        stdout = ""
        stderr = ""
        try:
            while True:
                try:
                    stdout, stderr = proc.communicate(timeout=self.renew_seconds)
                    break
                except subprocess.TimeoutExpired:
                    context.renew(checkpoint_pointer=f"execution:{context.dispatch_id}:registered-task-running")
        except StaleWorker:
            self._terminate_process_tree(proc)
            raise
        result = json.loads(result_path.read_text(encoding="utf-8-sig")) if result_path.is_file() else None
        details = {
            "returncode": proc.returncode,
            "stdout_tail": stdout[-4000:],
            "stderr_tail": stderr[-4000:],
            "result": result,
        }
        if proc.returncode != 0 or not isinstance(result, dict):
            raise WorkExecutionFailed("registered local task executor failed", details)
        if result.get("protocol_version") != REGISTERED_TASK_PROTOCOL or not isinstance(result.get("response_text"), str) or not result["response_text"].strip():
            raise WorkExecutionFailed("registered local task result is invalid", details)
        return result


def main() -> int:
    parser = argparse.ArgumentParser(description="A-01 Second Shift worker with registered local-task execution")
    parser.add_argument("--db", required=True)
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--poll-seconds", type=int, default=5)
    parser.add_argument("--lease-seconds", type=int, default=300)
    parser.add_argument("--renew-seconds", type=int, default=30)
    parser.add_argument("--heartbeat-sla-seconds", type=int, default=300)
    parser.add_argument("--root", default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument("--evidence-root", default="")
    args = parser.parse_args()
    if args.poll_seconds < 1 or args.poll_seconds > 3600:
        parser.error("--poll-seconds must be 1..3600")
    with SupervisorStore(Path(args.db)) as store:
        worker = A01RegisteredTaskExecutionWorker(
            store,
            root=Path(args.root),
            lease_seconds=args.lease_seconds,
            renew_seconds=args.renew_seconds,
            heartbeat_sla_seconds=args.heartbeat_sla_seconds,
            evidence_root=Path(args.evidence_root) if args.evidence_root else None,
        )
        if args.once:
            print(json.dumps(worker.run_once(), sort_keys=True))
            return 0
        while True:
            result = worker.run_once()
            print(json.dumps(result, sort_keys=True), flush=True)
            if result["execution"] is None:
                time.sleep(args.poll_seconds)


if __name__ == "__main__":
    raise SystemExit(main())
