from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

QUALIFICATION_ID = "SECOND-SHIFT-PRODUCTION-MASTER-COMPLETION-001G-AI-CODING-SMOKE"
WORKSTREAM_ID = "SECOND-SHIFT-CONTROL-GATEWAY"
MODEL = "gpt-oss-20b-NPU"
TARGET = "tests/fixtures/second_shift_001g_ai_coding_smoke_target.txt"
BEFORE = "SECOND_SHIFT_001G_AI_CODING_SMOKE=BEFORE\n"
AFTER = "SECOND_SHIFT_001G_AI_CODING_SMOKE=AFTER\n"
DELEGATION_ID = "SECOND-SHIFT-001G-AI-CODING-SMOKE-DELEGATION-001"
OBJECTIVE_ID = QUALIFICATION_ID
OBLIGATION_ID = QUALIFICATION_ID
IDEMPOTENCY_KEY = "SECOND-SHIFT-001G-AI-CODING-SMOKE-IDEMPOTENCY-001"


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _digest(value: Any) -> str:
    return hashlib.sha256(_canonical(value).encode("utf-8")).hexdigest()


def _is_sha(value: str) -> bool:
    return len(value) == 40 and all(ch in "0123456789abcdef" for ch in value)


def _git(root: Path, *args: str, input_text: str | None = None) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(
        ["git", "-C", str(root), *args],
        input=input_text,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
        timeout=120,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {proc.stderr[-4000:]}")
    return proc


def build_payload(subject: str) -> dict[str, Any]:
    return {
        "protocol_version": "control-gateway.a01-model-dispatch.v1",
        "workstream_id": WORKSTREAM_ID,
        "packet_id": "SECOND-SHIFT-001G-AI-CODING-SMOKE-PACKET-001",
        "subject_sha": subject,
        "prompt": (
            f"Edit exactly {TARGET}. Replace its entire contents with exactly "
            f"{AFTER.strip()!r} followed by one newline. Do not modify any other file. "
            "Do not use shell commands. Finish immediately after the edit."
        ),
        "allowed_paths": [TARGET],
        "allowed_commands": [],
        "model": MODEL,
        "base_url": "http://127.0.0.1:13305/api/v1",
        "max_steps": 8,
        "timeout_seconds": 300,
        "evaluator_required": True,
    }


def independently_evaluate_patch(root: Path, subject: str, patch_path: Path, expected_digest: str) -> dict[str, Any]:
    patch_bytes = patch_path.read_bytes()
    actual_digest = hashlib.sha256(patch_bytes).hexdigest()
    if actual_digest != expected_digest:
        raise RuntimeError("candidate patch digest differs from worker result")
    with tempfile.TemporaryDirectory(prefix="second-shift-001g-evaluator-") as td:
        worktree = Path(td) / "worktree"
        _git(root, "worktree", "add", "--detach", str(worktree), subject)
        try:
            _git(worktree, "apply", "--check", str(patch_path))
            _git(worktree, "apply", str(patch_path))
            changed = sorted(
                line.strip().replace("\\", "/")
                for line in _git(worktree, "diff", "--name-only", "--relative", "HEAD").stdout.splitlines()
                if line.strip()
            )
            if changed != [TARGET]:
                raise RuntimeError(f"independent evaluator observed unexpected paths: {changed}")
            if (worktree / TARGET).read_text(encoding="utf-8") != AFTER:
                raise RuntimeError("independent evaluator observed incorrect target contents")
            return {
                "verdict": "PASS",
                "candidate_digest": actual_digest,
                "changed_paths": changed,
                "target_contents_sha256": hashlib.sha256(AFTER.encode("utf-8")).hexdigest(),
                "evaluation_mode": "DETACHED_EXACT_SHA_GIT_APPLY",
            }
        finally:
            subprocess.run(
                ["git", "-C", str(root), "worktree", "remove", "--force", str(worktree)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
                timeout=120,
            )


def main() -> int:
    root = Path(os.environ.get("A01_SUBJECT_ROOT", "")).resolve()
    subject = os.environ.get("A01_SUBJECT_SHA", "").strip().lower()
    evidence_root = Path(os.environ.get("A01_EVIDENCE_DIR", "")).resolve()
    if not root.is_dir():
        raise RuntimeError("A01_SUBJECT_ROOT is missing or invalid")
    if not _is_sha(subject):
        raise RuntimeError("A01_SUBJECT_SHA must be a lowercase SHA-1")
    if _git(root, "rev-parse", "HEAD").stdout.strip().lower() != subject:
        raise RuntimeError("A-01 checkout differs from exact smoke subject")
    target = root / TARGET
    if not target.is_file() or target.read_text(encoding="utf-8") != BEFORE:
        raise RuntimeError("smoke target does not match frozen BEFORE state")
    evidence_root.mkdir(parents=True, exist_ok=True)

    sys.path.insert(0, str(root))
    sys.path.insert(0, str(root / "control-gateway" / "python"))
    from a01_execution_worker import A01ExecutionWorker
    from a01_model_dispatch import DEFAULT_MODEL, validate_ai_coding_payload
    from a01_night_scheduler import A01NightScheduler
    from tools.second_shift_supervisor_v2 import SupervisorStore

    if DEFAULT_MODEL != MODEL:
        raise RuntimeError(f"AI_CODING model contract mismatch: {DEFAULT_MODEL}")
    payload = validate_ai_coding_payload(build_payload(subject))
    payload_envelope = {"payload": payload, "payload_digest": _digest(payload)}
    now = dt.datetime.now(dt.timezone.utc)

    with tempfile.TemporaryDirectory(prefix="second-shift-001g-smoke-") as td:
        temp = Path(td)
        store = SupervisorStore(temp / "supervisor.db")
        try:
            scheduler = A01NightScheduler(store)
            lane = "CORE"
            owner_path = "SYSTEM_MASTER/CORE"
            control_ref = "second-shift-production-master-completion-001"
            store.register_lane(lane, owner_path, control_ref, subject, now)
            store.bind_ready(
                lane,
                DELEGATION_ID,
                OBJECTIVE_ID,
                subject,
                OBLIGATION_ID,
                {"qualification_id": QUALIFICATION_ID, "live_ready_queue": False},
                now,
            )
            claim = store.claim_ready(
                lane,
                DELEGATION_ID,
                OBJECTIVE_ID,
                subject,
                IDEMPOTENCY_KEY,
                "AI_CODING",
                payload_envelope,
                lease_seconds=600,
                now=now,
                allow_outside_shift=True,
            )
            worker = A01ExecutionWorker(
                store,
                root=root,
                scheduler=scheduler,
                lease_seconds=600,
                renew_seconds=10,
                heartbeat_sla_seconds=120,
                evidence_root=evidence_root / "ai-coding-smoke-worker",
                worker_id="second-shift-001g-ai-coding-smoke-worker",
            )
            result_row = worker.consume_dispatch(claim.dispatch_id, now=now)
            if result_row.get("state") != "SUCCEEDED" or result_row.get("terminal_state") != "VALIDATING":
                raise RuntimeError("AI_CODING smoke did not stop at independent-evaluator barrier")
            staged = json.loads(result_row.get("result_json") or "{}")
            candidate = staged.get("result")
            if not isinstance(candidate, dict):
                raise RuntimeError("AI_CODING smoke result lacks candidate")
            if candidate.get("status") != "CANDIDATE_READY_FOR_INDEPENDENT_EVALUATION":
                raise RuntimeError("AI_CODING smoke did not produce evaluator-bound candidate")
            if candidate.get("model") != MODEL:
                raise RuntimeError("AI_CODING smoke used an unexpected model")
            if candidate.get("changed_paths") != [TARGET]:
                raise RuntimeError(f"AI_CODING smoke changed unexpected paths: {candidate.get('changed_paths')}")
            patch_digest = str(candidate.get("patch_sha256", ""))
            if len(patch_digest) != 64:
                raise RuntimeError("AI_CODING smoke candidate lacks exact patch digest")
            attempt_id = str(result_row.get("current_attempt_id") or "")
            patch_path = worker.evidence_root / claim.dispatch_id / attempt_id / "candidate.patch"
            if not patch_path.is_file():
                raise RuntimeError("AI_CODING smoke candidate.patch is missing")

            evaluator = independently_evaluate_patch(root, subject, patch_path, patch_digest)
            terminal = store.evaluator_verdict(
                claim.lease_id,
                claim.fencing_token,
                "SECOND-SHIFT-001G-AI-CODING-SMOKE-EVALUATOR-001",
                "PASS",
                patch_digest,
                evaluator,
                now=dt.datetime.now(dt.timezone.utc),
            )
            if terminal != "COMPLETED":
                raise RuntimeError("independent evaluator did not complete smoke delegation")
            final_state = store.conn.execute(
                "SELECT state FROM delegations WHERE delegation_id=?", (DELEGATION_ID,)
            ).fetchone()["state"]
            if final_state != "COMPLETED":
                raise RuntimeError("smoke delegation is not COMPLETED after evaluator PASS")
            if store.audit_invariants():
                raise RuntimeError("smoke supervisor invariants failed after evaluator PASS")
            if target.read_text(encoding="utf-8") != BEFORE:
                raise RuntimeError("root checkout was mutated by isolated AI_CODING smoke")
            if _git(root, "status", "--porcelain", "--", TARGET).stdout.strip():
                raise RuntimeError("root checkout target became dirty during AI_CODING smoke")

            summary = {
                "protocol_version": "second-shift.production-master.001g-ai-coding-smoke.v1",
                "qualification_id": QUALIFICATION_ID,
                "state": "PASS",
                "subject_sha": subject,
                "model": MODEL,
                "executor_kind": "AI_CODING",
                "candidate_status": candidate["status"],
                "candidate_patch_sha256": patch_digest,
                "changed_paths": candidate["changed_paths"],
                "independent_evaluator": evaluator,
                "delegation_final_state": final_state,
                "live_ready_queue_touched": False,
                "repository_commit_authority_granted": False,
                "root_checkout_mutated": False,
            }
            (evidence_root / "second-shift-001g-ai-coding-smoke-summary.json").write_text(
                json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8"
            )
            print(
                f"PASS {QUALIFICATION_ID} model={MODEL} patch_sha256={patch_digest} "
                f"changed_paths={','.join(candidate['changed_paths'])}"
            )
            return 0
        finally:
            store.close()


if __name__ == "__main__":
    raise SystemExit(main())
