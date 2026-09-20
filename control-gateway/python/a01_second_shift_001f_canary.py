from __future__ import annotations

import datetime as dt
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

QUALIFICATION_ID = "SECOND-SHIFT-PRODUCTION-MASTER-COMPLETION-001F-CANARY"
WORKSTREAM_ID = "SYSTEM-MASTER"
REGISTERED_TASK_QUALIFICATION_ID = "A01-AGENT-REGISTERED-TASK-PRODUCTION-BINDING-001"
REGISTERED_TASK_WORKSTREAM_ID = "SYSTEM-MASTER"
MODEL = "gpt-oss-20b-NPU"
TASK_TYPE = "TEXT_RESPONSE_V1"
EXPECTED_RESPONSE = "A01_REGISTERED_TASK_OK"
CANARY_TASK_COUNT = 3
CALIBRATED_MAX_TASK_MS = 60000
CANARY_DB_NAME = "second-shift-001f-canary.db"


def _is_sha(value: str) -> bool:
    return len(value) == 40 and all(ch in "0123456789abcdef" for ch in value)


def build_registered_task_payload(subject: str, index: int) -> dict[str, Any]:
    return {
        "qualification_id": REGISTERED_TASK_QUALIFICATION_ID,
        "workstream_id": REGISTERED_TASK_WORKSTREAM_ID,
        "subject_sha": subject,
        "control_plane_sha": subject,
        "task_id": f"SECOND-SHIFT-001F-CANARY-TASK-{index:03d}",
        "task_type": TASK_TYPE,
        "instruction": f"Reply with exactly: {EXPECTED_RESPONSE}",
        "model": MODEL,
        "max_output_tokens": 256,
        "temperature": 0,
    }


def _build_delegation(subject: str, index: int, not_before: str, not_after: str, digest: Any, protocol: str) -> tuple[dict[str, Any], dict[str, Any]]:
    payload = build_registered_task_payload(subject, index)
    task_id = payload["task_id"]
    delegation_id = f"SECOND-SHIFT-001F-CANARY-DELEGATION-{index:03d}"
    idempotency_key = f"SECOND-SHIFT-001F-CANARY-IDEMPOTENCY-{index:03d}"
    lane = "CORE"
    owner_path = "SYSTEM_MASTER/CORE"
    control_ref = "second-shift-production-master-completion-001"

    receipt = {
        "protocol_version": "control-gateway.a01-admission-receipt.v1",
        "decision": "GRANTED",
        "admission_id": "ADMIT-" + task_id,
        "request_digest": digest({"task_id": task_id, "subject_sha": subject}),
        "mission_version": "SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v1.0",
        "workstream_id": WORKSTREAM_ID,
        "authority_epoch": 19,
        "authority_publication_commit_sha": subject,
        "authority_packet_digest": digest({"subject_sha": subject, "qualification_id": QUALIFICATION_ID}),
        "authoritative_subject": {"algorithm": "sha1", "oid": subject},
        "repository": "BFochtman746/system-master",
        "authority_ref": control_ref,
        "authority_ref_head_sha": subject,
        "operation_id": REGISTERED_TASK_QUALIFICATION_ID,
        "predecessor_receipt_id": "SECOND-SHIFT-PRODUCTION-MASTER-COMPLETION-001E-RECEIPT",
        "command_id": "CMD-" + task_id,
        "task_id": task_id,
        "idempotency_key": idempotency_key,
        "execution_class": "OVERNIGHT",
        "execution_order": index,
        "priority": 100,
        "not_before": not_before,
        "not_after": not_after,
        "lane": lane,
        "owner_path": owner_path,
        "delegation_id": delegation_id,
        "objective_id": QUALIFICATION_ID,
        "control_ref": control_ref,
        "control_head": subject,
        "executor_kind": "A01_REGISTERED_TASK",
        "payload_digest": digest(payload),
        "dependency_receipt_ids": [],
        "scheduling_owner": "A01_SUPERVISOR",
        "github_role": "ADMISSION_TRANSPORT_EVIDENCE_ONLY",
        "admission_digest": "",
    }
    receipt_body = dict(receipt)
    receipt_body.pop("admission_digest")
    receipt["admission_digest"] = digest(receipt_body)

    handoff = {
        "protocol_version": "control-gateway.a01-supervisor-handoff.v1",
        "admission_receipt": receipt,
        "scheduling_owner": "A01_SUPERVISOR",
        "github_role": "ADMISSION_TRANSPORT_EVIDENCE_ONLY",
        "lane": lane,
        "owner_path": owner_path,
        "delegation_id": delegation_id,
        "objective_id": QUALIFICATION_ID,
        "control_ref": control_ref,
        "control_head": subject,
        "idempotency_key": idempotency_key,
        "executor_kind": "A01_REGISTERED_TASK",
        "execution_class": "OVERNIGHT",
        "execution_order": index,
        "priority": 100,
        "not_before": not_before,
        "not_after": not_after,
        "payload_digest": digest(payload),
        "payload": payload,
        "handoff_digest": "",
    }
    handoff_body = dict(handoff)
    handoff_body.pop("handoff_digest")
    handoff["handoff_digest"] = digest(handoff_body)

    contract = {
        "protocol_version": protocol,
        "handoff_digest": handoff["handoff_digest"],
        "graph_id": "SECOND-SHIFT-001F-CANARY-GRAPH",
        "graph_version": 1,
        "delegation_id": delegation_id,
        "dependency_ids": [],
        "resource_key": "OWNER-LANE:CORE",
        "max_concurrency": 1,
        "cancellation_policy": "NO_CASCADE",
        "coordination_digest": "",
    }
    contract_body = dict(contract)
    contract_body.pop("coordination_digest")
    contract["coordination_digest"] = digest(contract_body)

    delegation = {
        "delegation_id": delegation_id,
        "objective_id": QUALIFICATION_ID,
        "obligation_id": task_id,
        "owner_path": owner_path,
        "state": "READY",
        "valid_for_control_ref": control_ref,
        "valid_for_control_head": subject,
        "a01_execution": {
            "protocol_version": "control-gateway.a01-github-ingress-execution.v1",
            "qualification_id": REGISTERED_TASK_QUALIFICATION_ID,
            "subject_sha": subject,
            "handoff": handoff,
            "coordination_contract": contract,
        },
    }
    return delegation, payload


def main() -> int:
    root = Path(os.environ.get("A01_SUBJECT_ROOT", "")).resolve()
    subject = os.environ.get("A01_SUBJECT_SHA", "").lower()
    evidence_root = Path(os.environ.get("A01_EVIDENCE_DIR", "")).resolve()
    if not root.is_dir():
        raise RuntimeError("A01_SUBJECT_ROOT is missing or invalid")
    if not _is_sha(subject):
        raise RuntimeError("A01_SUBJECT_SHA must be a lowercase SHA-1")
    if not os.environ.get("A01_EVIDENCE_DIR"):
        raise RuntimeError("A01_EVIDENCE_DIR is required")
    evidence_root.mkdir(parents=True, exist_ok=True)

    sys.path.insert(0, str(root))
    sys.path.insert(0, str(root / "control-gateway" / "python"))
    from a01_github_ingress import Ingress, night_window, session_date
    from a01_night_scheduler import A01NightScheduler
    from a01_registered_task_worker import A01RegisteredTaskExecutionWorker
    from a01_supervisor_adapter import digest
    from a01_supervisor_coordination import COORDINATION_PROTOCOL
    from tools.second_shift_supervisor_v2 import SupervisorStore

    policy = json.loads((root / "qualification" / "a01" / "a01-policy.json").read_text(encoding="utf-8"))
    overnight = policy["overnight"]
    now = dt.datetime(2026, 9, 20, 5, 30, tzinfo=dt.timezone.utc)
    session = session_date(now, overnight["timezone"])
    not_before, not_after = night_window(
        session,
        timezone_name=overnight["timezone"],
        start_local=overnight["window_start_local"],
        end_local=overnight["window_end_local"],
    )

    built = [_build_delegation(subject, index, not_before, not_after, digest, COORDINATION_PROTOCOL) for index in range(1, CANARY_TASK_COUNT + 1)]
    delegations = [row[0] for row in built]
    payloads = [row[1] for row in built]
    task_ids = [row["task_id"] for row in payloads]
    control_ref = "second-shift-production-master-completion-001"

    authority = {
        "authority_id": "CURRENT-AUTHORITY-005",
        "second_shift_registry": "qualification-fixture/second-shift.json",
        "obligation_registry": "qualification-fixture/obligations.json",
    }
    second_shift = {"owner_files": {"CORE": "qualification-fixture/core-owner.json"}, "coverage_routes": {}}
    obligations = {
        "owner_head_snapshot": {"CORE": subject},
        "obligations": [{"obligation_id": task_id, "owner_path": "SYSTEM_MASTER/CORE", "state": "READY"} for task_id in task_ids],
    }
    owner_file = {
        "owner_system_id": "CORE",
        "owner_path": "SYSTEM_MASTER/CORE",
        "control_ref": control_ref,
        "last_known_control_head": subject,
        "active_delegations": delegations,
    }
    qualification_registry = {
        "qualifications": {
            REGISTERED_TASK_QUALIFICATION_ID: {
                "workstream_id": REGISTERED_TASK_WORKSTREAM_ID,
                "source": "subject",
                "overnight_eligible": True,
            }
        }
    }

    class FixtureSource:
        repository_full_name = "BFochtman746/system-master"

        def read_json(self, path: str) -> dict[str, Any]:
            values = {
                "governance/CURRENT-AUTHORITY.json": authority,
                "qualification-fixture/second-shift.json": second_shift,
                "qualification-fixture/obligations.json": obligations,
                "qualification-fixture/core-owner.json": owner_file,
                "qualification/a01/a01-policy.json": policy,
                "qualification/a01/registry.json": qualification_registry,
            }
            if path not in values:
                raise RuntimeError("unexpected fixture path: " + path)
            return values[path]

        def resolve_ref_head(self, ref: str) -> str:
            if ref != control_ref:
                raise RuntimeError("unexpected control ref: " + ref)
            return subject

    db_path = evidence_root / CANARY_DB_NAME
    if db_path.exists():
        raise RuntimeError("001F canary database must start absent")
    store = SupervisorStore(db_path)
    try:
        scheduler = A01NightScheduler(store)
        ingress = Ingress(FixtureSource(), scheduler=scheduler, state_dir=evidence_root / "ingress-state")
        ingress_result = ingress.run_once(now=now, dry_run=False)
        if ingress_result.status != "PASS" or ingress_result.enqueued != CANARY_TASK_COUNT:
            raise RuntimeError("canary ingress did not enqueue all bounded tasks: " + json.dumps(ingress_result.to_dict(), sort_keys=True))
    finally:
        store.close()

    results: list[dict[str, Any]] = []
    for index in range(1, CANARY_TASK_COUNT + 1):
        store = SupervisorStore(db_path)
        try:
            scheduler = A01NightScheduler(store)
            worker = A01RegisteredTaskExecutionWorker(
                store,
                root=root,
                scheduler=scheduler,
                lease_seconds=60,
                renew_seconds=5,
                heartbeat_sla_seconds=120,
                evidence_root=evidence_root / "worker-evidence",
                clock=lambda: now,
                worker_id=f"second-shift-001f-canary-worker-{index:03d}",
            )
            started = time.monotonic()
            worker_result = worker.run_once(now=now)
            elapsed_ms = max(1, int((time.monotonic() - started) * 1000))
            execution = worker_result.get("execution")
            if not isinstance(execution, dict) or execution.get("state") != "SUCCEEDED":
                raise RuntimeError("canary worker did not succeed: " + json.dumps(worker_result, sort_keys=True))
            result_json = json.loads(execution.get("result_json") or "{}")
            task_result = result_json.get("result")
            if not isinstance(task_result, dict):
                raise RuntimeError("canary worker result lacks nested registered-task result")
            if task_result.get("response_text", "").strip() != EXPECTED_RESPONSE:
                raise RuntimeError("canary registered-task final answer mismatch")
            if execution.get("executor_kind") != "A01_REGISTERED_TASK":
                raise RuntimeError("canary worker executed an unexpected executor kind")
            if elapsed_ms > CALIBRATED_MAX_TASK_MS:
                raise RuntimeError(f"canary task exceeded calibrated 001E ceiling: {elapsed_ms} > {CALIBRATED_MAX_TASK_MS}")
            expected_task_id = f"SECOND-SHIFT-001F-CANARY-TASK-{index:03d}"
            if task_result.get("task_id") != expected_task_id:
                raise RuntimeError("canary task execution order or identity drifted")
            results.append({
                "index": index,
                "task_id": expected_task_id,
                "state": execution.get("state"),
                "executor_kind": execution.get("executor_kind"),
                "response_text": task_result.get("response_text"),
                "model": task_result.get("model"),
                "attempt_count": execution.get("attempt_count"),
                "execution_generation": execution.get("execution_generation"),
                "elapsed_ms": elapsed_ms,
            })
        finally:
            store.close()

    store = SupervisorStore(db_path)
    try:
        scheduler = A01NightScheduler(store)
        snapshot = scheduler.snapshot()
        queue_states = {row["delegation_id"]: row["state"] for row in snapshot["queue"]}
        if len(queue_states) != CANARY_TASK_COUNT or set(queue_states.values()) != {"TERMINAL"}:
            raise RuntimeError("canary queue did not reach all-terminal standing")
        if snapshot["authorization_leaks"] != 0 or snapshot["coordination_problems"] or snapshot["supervisor_problems"]:
            raise RuntimeError("canary invariant audit found scheduler/supervisor defects")
        live_claims = int(store.conn.execute("SELECT COUNT(*) n FROM claims WHERE released_at IS NULL").fetchone()["n"])
        if live_claims != 0:
            raise RuntimeError("canary left a live fenced claim")
        if len(snapshot["night_budget_usage"]) != CANARY_TASK_COUNT:
            raise RuntimeError("canary night budget usage differs from bounded task count")
    finally:
        store.close()

    summary = {
        "protocol_version": "second-shift.production-master-001f-canary.v1",
        "qualification_id": QUALIFICATION_ID,
        "state": "PASS",
        "subject_sha": subject,
        "mode": "ISOLATED_PERSISTENT_SCHEDULER_CANARY",
        "canary_database": CANARY_DB_NAME,
        "persistent_database_reopens": CANARY_TASK_COUNT,
        "canary_tasks_required": CANARY_TASK_COUNT,
        "canary_tasks_passed": len(results),
        "scheduler_max_claims_per_tick": 1,
        "model": MODEL,
        "expected_response": EXPECTED_RESPONSE,
        "calibrated_max_task_ms": CALIBRATED_MAX_TASK_MS,
        "max_observed_ms": max(int(row["elapsed_ms"]) for row in results),
        "live_ready_queue_touched": False,
        "live_scheduler_cutover_authorized": False,
        "production_freeze_authorized": False,
        "promotion_authorized": False,
        "authorization_leaks": 0,
        "queue_states": queue_states,
        "results": results,
    }
    (evidence_root / "second-shift-001f-canary-summary.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(
        f"PASS {QUALIFICATION_ID} tasks={len(results)} "
        f"max_observed_ms={summary['max_observed_ms']} calibrated_max_task_ms={CALIBRATED_MAX_TASK_MS}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
