from __future__ import annotations

import datetime as dt
import json
import math
import os
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

QUALIFICATION_ID = "SECOND-SHIFT-PRODUCTION-MASTER-COMPLETION-001E-SHADOW-CALIBRATION"
WORKSTREAM_ID = "SECOND-SHIFT-PRODUCTION-MASTER-COMPLETION"
REGISTERED_TASK_QUALIFICATION_ID = "A01-AGENT-REGISTERED-TASK-PRODUCTION-BINDING-001"
REGISTERED_TASK_WORKSTREAM_ID = "SYSTEM-MASTER"
MODEL = "gpt-oss-20b-NPU"
TASK_TYPE = "TEXT_RESPONSE_V1"
EXPECTED_RESPONSE = "A01_REGISTERED_TASK_OK"
CYCLE_COUNT = 3


def build_registered_task_payload(subject: str, cycle: int) -> dict[str, Any]:
    return {
        "qualification_id": REGISTERED_TASK_QUALIFICATION_ID,
        "workstream_id": REGISTERED_TASK_WORKSTREAM_ID,
        "subject_sha": subject,
        "control_plane_sha": subject,
        "task_id": f"SECOND-SHIFT-001E-SHADOW-TASK-{cycle:03d}",
        "task_type": TASK_TYPE,
        "instruction": f"Reply with exactly: {EXPECTED_RESPONSE}",
        "model": MODEL,
        "max_output_tokens": 256,
        "temperature": 0,
    }


def calibrated_max_task_ms(observed_ms: list[int]) -> int:
    if not observed_ms or any(type(value) is not int or value <= 0 for value in observed_ms):
        raise ValueError("positive integer observations are required")
    return max(60000, int(math.ceil((max(observed_ms) * 1.5) / 1000.0) * 1000))


def _is_sha(value: str) -> bool:
    return len(value) == 40 and all(ch in "0123456789abcdef" for ch in value)


def run_cycle(root: Path, evidence_root: Path, subject: str, cycle: int, now: dt.datetime) -> dict[str, Any]:
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
    session = session_date(now, overnight["timezone"])
    not_before, not_after = night_window(
        session,
        timezone_name=overnight["timezone"],
        start_local=overnight["window_start_local"],
        end_local=overnight["window_end_local"],
    )

    payload = build_registered_task_payload(subject, cycle)
    task_id = payload["task_id"]
    lane = "CORE"
    owner_path = "SYSTEM_MASTER/CORE"
    control_ref = "second-shift-production-master-completion-001"
    delegation_id = f"SECOND-SHIFT-001E-SHADOW-DELEGATION-{cycle:03d}"
    objective_id = QUALIFICATION_ID
    idempotency_key = f"SECOND-SHIFT-001E-SHADOW-IDEMPOTENCY-{cycle:03d}"

    receipt = {
        "protocol_version": "control-gateway.a01-admission-receipt.v1",
        "decision": "GRANTED",
        "admission_id": "ADMIT-" + task_id,
        "request_digest": digest({"task_id": task_id, "subject_sha": subject}),
        "mission_version": "SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v1.0",
        "workstream_id": WORKSTREAM_ID,
        "authority_epoch": 10,
        "authority_publication_commit_sha": subject,
        "authority_packet_digest": digest({"subject_sha": subject, "qualification_id": QUALIFICATION_ID}),
        "authoritative_subject": {"algorithm": "sha1", "oid": subject},
        "repository": "BFochtman746/system-master",
        "authority_ref": control_ref,
        "authority_ref_head_sha": subject,
        "operation_id": REGISTERED_TASK_QUALIFICATION_ID,
        "predecessor_receipt_id": "SECOND-SHIFT-PRODUCTION-MASTER-COMPLETION-001D-RECEIPT",
        "command_id": "CMD-" + task_id,
        "task_id": task_id,
        "idempotency_key": idempotency_key,
        "execution_class": "OVERNIGHT",
        "execution_order": cycle,
        "priority": 100,
        "not_before": not_before,
        "not_after": not_after,
        "lane": lane,
        "owner_path": owner_path,
        "delegation_id": delegation_id,
        "objective_id": objective_id,
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
        "objective_id": objective_id,
        "control_ref": control_ref,
        "control_head": subject,
        "idempotency_key": idempotency_key,
        "executor_kind": "A01_REGISTERED_TASK",
        "execution_class": "OVERNIGHT",
        "execution_order": cycle,
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
        "protocol_version": COORDINATION_PROTOCOL,
        "handoff_digest": handoff["handoff_digest"],
        "graph_id": f"SECOND-SHIFT-001E-SHADOW-GRAPH-{cycle:03d}",
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
        "objective_id": objective_id,
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

    authority = {
        "authority_id": "CURRENT-AUTHORITY-005",
        "second_shift_registry": "qualification-fixture/second-shift.json",
        "obligation_registry": "qualification-fixture/obligations.json",
    }
    second_shift = {
        "owner_files": {"CORE": "qualification-fixture/core-owner.json"},
        "coverage_routes": {},
    }
    obligations = {
        "owner_head_snapshot": {"CORE": subject},
        "obligations": [{"obligation_id": task_id, "owner_path": owner_path, "state": "READY"}],
    }
    owner_file = {
        "owner_system_id": lane,
        "owner_path": owner_path,
        "control_ref": control_ref,
        "last_known_control_head": subject,
        "active_delegations": [delegation],
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
            if path == "governance/CURRENT-AUTHORITY.json":
                return authority
            if path == "qualification-fixture/second-shift.json":
                return second_shift
            if path == "qualification-fixture/obligations.json":
                return obligations
            if path == "qualification-fixture/core-owner.json":
                return owner_file
            if path == "qualification/a01/a01-policy.json":
                return policy
            if path == "qualification/a01/registry.json":
                return qualification_registry
            raise RuntimeError("unexpected fixture path: " + path)

        def resolve_ref_head(self, ref: str) -> str:
            if ref != control_ref:
                raise RuntimeError("unexpected control ref: " + ref)
            return subject

    cycle_evidence = evidence_root / f"cycle-{cycle:03d}"
    cycle_evidence.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=f"second-shift-001e-shadow-{cycle:03d}-") as temp_dir:
        temp = Path(temp_dir)
        store = SupervisorStore(temp / "supervisor.db")
        try:
            scheduler = A01NightScheduler(store)
            ingress = Ingress(FixtureSource(), scheduler=scheduler, state_dir=temp / "ingress")
            ingress_result = ingress.run_once(now=now, dry_run=False)
            if ingress_result.status != "PASS" or ingress_result.enqueued != 1:
                raise RuntimeError("shadow ingress did not enqueue exactly one registered task: " + json.dumps(ingress_result.to_dict(), sort_keys=True))

            worker = A01RegisteredTaskExecutionWorker(
                store,
                root=root,
                scheduler=scheduler,
                lease_seconds=60,
                renew_seconds=5,
                heartbeat_sla_seconds=120,
                evidence_root=cycle_evidence / "worker",
                clock=lambda: now,
                worker_id=f"second-shift-001e-shadow-worker-{cycle:03d}",
            )
            started = time.monotonic()
            worker_result = worker.run_once(now=now)
            elapsed_ms = max(1, int((time.monotonic() - started) * 1000))
            execution = worker_result.get("execution")
            if not isinstance(execution, dict) or execution.get("state") != "SUCCEEDED":
                raise RuntimeError("shadow registered-task worker did not succeed: " + json.dumps(worker_result, sort_keys=True))
            result_json = json.loads(execution.get("result_json") or "{}")
            task_result = result_json.get("result")
            if not isinstance(task_result, dict):
                raise RuntimeError("shadow worker result lacks nested registered-task result")
            if task_result.get("response_text", "").strip() != EXPECTED_RESPONSE:
                raise RuntimeError("shadow registered-task final answer mismatch: " + repr(task_result.get("response_text")))
            if execution.get("executor_kind") != "A01_REGISTERED_TASK":
                raise RuntimeError("shadow worker executed an unexpected executor kind")

            cycle_summary = {
                "cycle": cycle,
                "state": "PASS",
                "subject_sha": subject,
                "task_id": task_id,
                "ingress_status": ingress_result.status,
                "ingress_enqueued": ingress_result.enqueued,
                "worker_state": execution.get("state"),
                "executor_kind": execution.get("executor_kind"),
                "model": task_result.get("model"),
                "response_text": task_result.get("response_text"),
                "attempt_count": execution.get("attempt_count"),
                "execution_generation": execution.get("execution_generation"),
                "elapsed_ms": elapsed_ms,
            }
            (cycle_evidence / "shadow-cycle-summary.json").write_text(
                json.dumps(cycle_summary, indent=2, sort_keys=True) + "\n",
                encoding="utf-8",
            )
            return cycle_summary
        finally:
            store.close()


def main() -> int:
    root = Path(os.environ.get("A01_SUBJECT_ROOT", "")).resolve()
    subject = os.environ.get("A01_SUBJECT_SHA", "").lower()
    evidence_root = Path(os.environ.get("A01_EVIDENCE_DIR", "")).resolve()
    if not root.is_dir():
        raise RuntimeError("A01_SUBJECT_ROOT is missing or invalid")
    if not _is_sha(subject):
        raise RuntimeError("A01_SUBJECT_SHA must be a lowercase SHA-1")
    if not str(evidence_root):
        raise RuntimeError("A01_EVIDENCE_DIR is required")
    evidence_root.mkdir(parents=True, exist_ok=True)

    now = dt.datetime(2026, 9, 20, 5, 30, tzinfo=dt.timezone.utc)
    cycles = [run_cycle(root, evidence_root, subject, cycle, now) for cycle in range(1, CYCLE_COUNT + 1)]
    observations = [int(row["elapsed_ms"]) for row in cycles]
    threshold_ms = calibrated_max_task_ms(observations)
    summary = {
        "protocol_version": "second-shift.production-master-001e-shadow-calibration.v1",
        "qualification_id": QUALIFICATION_ID,
        "state": "PASS",
        "subject_sha": subject,
        "mode": "NON_MUTATING_TEMP_DB_SHADOW",
        "live_ready_queue_touched": False,
        "cycles_required": CYCLE_COUNT,
        "cycles_passed": len(cycles),
        "model": MODEL,
        "expected_response": EXPECTED_RESPONSE,
        "observed_task_ms": observations,
        "calibrated_max_task_ms": threshold_ms,
        "calibration_rule": "max(60000, ceil(max_observed_ms * 1.5 / 1000) * 1000)",
        "cycles": cycles,
    }
    (evidence_root / "second-shift-001e-shadow-calibration-summary.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(
        f"PASS {QUALIFICATION_ID} cycles={len(cycles)} "
        f"max_observed_ms={max(observations)} calibrated_max_task_ms={threshold_ms}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
