from __future__ import annotations

import datetime as dt
import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tools.second_shift_supervisor_v2 import Conflict, SupervisorStore  # noqa: E402

spec = importlib.util.spec_from_file_location(
    "cg_a01_supervisor_adapter",
    ROOT / "control-gateway" / "python" / "a01_supervisor_adapter.py",
)
if spec is None or spec.loader is None:
    raise RuntimeError("unable to load A-01 supervisor adapter")
adapter_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter_module)
GatewayHandoffError = adapter_module.GatewayHandoffError
SupervisorGatewayAdapter = adapter_module.SupervisorGatewayAdapter
validate_gateway_handoff = adapter_module.validate_gateway_handoff

UTC = dt.timezone.utc


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def admission_receipt():
    receipt = {
        "protocol_version": "control-gateway.a01-admission-receipt.v1",
        "decision": "GRANTED",
        "admission_id": "A01-ADMISSION-001",
        "request_digest": "a" * 64,
        "mission_version": "SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v1.0",
        "workstream_id": "SECOND-SHIFT-CONTROL-GATEWAY",
        "authority_epoch": 9,
        "authority_publication_commit_sha": "b" * 40,
        "authority_packet_digest": "c" * 64,
        "authoritative_subject": {"algorithm": "sha1", "oid": "d" * 40},
        "repository": "BFochtman746/system-master",
        "authority_ref": "second-shift-control-gateway/cg-009-dependency-ordering",
        "authority_ref_head_sha": "e" * 40,
        "operation_id": "SECOND-SHIFT-CONTROL-GATEWAY-CG-009",
        "predecessor_receipt_id": "RECEIPT-CG008",
        "command_id": "CMD-001",
        "task_id": "TASK-001",
        "idempotency_key": "IDEM-001",
        "execution_class": "IMMEDIATE",
        "execution_order": 3,
        "priority": 100,
        "not_before": None,
        "not_after": None,
        "lane": "CONTROL_GATEWAY",
        "owner_path": "CONTROL_GATEWAY/A01",
        "delegation_id": "DELEGATION-001",
        "objective_id": "OBJECTIVE-001",
        "control_ref": "second-shift-control-gateway/cg-009-dependency-ordering",
        "control_head": "e" * 40,
        "executor_kind": "A01_CONTROL_PLANE_QUALIFICATION",
        "payload_digest": digest({"qualification_id": "SECOND-SHIFT-SUPERVISOR-V2-A01-STRESS"}),
        "dependency_receipt_ids": ["DEP-001"],
        "scheduling_owner": "A01_SUPERVISOR",
        "github_role": "ADMISSION_TRANSPORT_EVIDENCE_ONLY",
        "admission_digest": "",
    }
    base = dict(receipt)
    base.pop("admission_digest")
    receipt["admission_digest"] = digest(base)
    return receipt


def handoff(**overrides):
    receipt = admission_receipt()
    for key in (
        "execution_class", "execution_order", "priority", "not_before", "not_after",
        "lane", "owner_path", "delegation_id", "objective_id", "control_ref", "control_head",
        "idempotency_key", "executor_kind",
    ):
        if key in overrides:
            receipt[key] = overrides[key]
    base_receipt = dict(receipt)
    base_receipt.pop("admission_digest")
    receipt["admission_digest"] = digest(base_receipt)
    payload = {"qualification_id": "SECOND-SHIFT-SUPERVISOR-V2-A01-STRESS"}
    value = {
        "protocol_version": "control-gateway.a01-supervisor-handoff.v1",
        "admission_receipt": receipt,
        "scheduling_owner": "A01_SUPERVISOR",
        "github_role": "ADMISSION_TRANSPORT_EVIDENCE_ONLY",
        "lane": receipt["lane"],
        "owner_path": receipt["owner_path"],
        "delegation_id": receipt["delegation_id"],
        "objective_id": receipt["objective_id"],
        "control_ref": receipt["control_ref"],
        "control_head": receipt["control_head"],
        "idempotency_key": receipt["idempotency_key"],
        "executor_kind": receipt["executor_kind"],
        "execution_class": receipt["execution_class"],
        "execution_order": receipt["execution_order"],
        "priority": receipt["priority"],
        "not_before": receipt["not_before"],
        "not_after": receipt["not_after"],
        "payload_digest": receipt["payload_digest"],
        "payload": payload,
        "handoff_digest": "",
    }
    value.update({k: v for k, v in overrides.items() if k not in value})
    base = dict(value)
    base.pop("handoff_digest")
    value["handoff_digest"] = digest(base)
    return value


class SupervisorGatewayAdapterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = SupervisorStore(Path(self.temp.name) / "supervisor.db")
        self.adapter = SupervisorGatewayAdapter(self.store)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def test_bind_makes_exact_admitted_unit_ready_without_dispatching(self):
        value = handoff()
        self.adapter.bind(value, now=dt.datetime(2026, 9, 12, 12, 0, tzinfo=UTC))
        lane = self.store.conn.execute("SELECT * FROM lanes WHERE lane='CONTROL_GATEWAY'").fetchone()
        delegation = self.store.conn.execute("SELECT * FROM delegations WHERE delegation_id='DELEGATION-001'").fetchone()
        outbox = self.store.conn.execute("SELECT COUNT(*) FROM dispatch_outbox").fetchone()[0]
        self.assertEqual(lane["state"], "READY")
        self.assertEqual(delegation["state"], "READY")
        self.assertEqual(outbox, 0)

    def test_duplicate_bind_is_idempotent_for_same_exact_identity(self):
        value = handoff()
        now = dt.datetime(2026, 9, 12, 12, 0, tzinfo=UTC)
        self.adapter.bind(value, now=now)
        self.adapter.bind(value, now=now)
        self.assertEqual(self.store.conn.execute("SELECT COUNT(*) FROM delegations").fetchone()[0], 1)

    def test_immediate_claim_uses_supervisor_lease_fence_and_outbox(self):
        value = handoff()
        now = dt.datetime(2026, 9, 12, 12, 0, tzinfo=UTC)
        self.adapter.bind(value, now=now)
        claim = self.adapter.claim(value, now=now)
        self.assertEqual(claim.idempotency_key, "IDEM-001")
        self.assertEqual(claim.fencing_token, 1)
        row = self.store.conn.execute("SELECT * FROM dispatch_outbox WHERE dispatch_id=?", (claim.dispatch_id,)).fetchone()
        self.assertEqual(row["state"], "PENDING")
        self.assertEqual(row["executor_kind"], "A01_CONTROL_PLANE_QUALIFICATION")

    def test_duplicate_claim_reuses_same_semantic_claim(self):
        value = handoff()
        now = dt.datetime(2026, 9, 12, 12, 0, tzinfo=UTC)
        self.adapter.bind(value, now=now)
        first = self.adapter.claim(value, now=now)
        second = self.adapter.claim(value, now=now)
        self.assertEqual(first.lease_id, second.lease_id)
        self.assertEqual(first.dispatch_id, second.dispatch_id)

    def test_not_before_is_enforced_by_supervisor_adapter(self):
        value = handoff(not_before="2026-09-12T13:00:00Z")
        now = dt.datetime(2026, 9, 12, 12, 0, tzinfo=UTC)
        self.adapter.bind(value, now=now)
        with self.assertRaisesRegex(Conflict, "not_before"):
            self.adapter.claim(value, now=now)

    def test_expired_window_is_rejected(self):
        value = handoff(not_after="2026-09-12T11:00:00Z")
        now = dt.datetime(2026, 9, 12, 12, 0, tzinfo=UTC)
        self.adapter.bind(value, now=now)
        with self.assertRaisesRegex(Conflict, "window expired"):
            self.adapter.claim(value, now=now)

    def test_overnight_class_preserves_second_shift_window_as_scheduler_authority(self):
        value = handoff(execution_class="OVERNIGHT")
        noon = dt.datetime(2026, 9, 12, 16, 0, tzinfo=UTC)  # noon New York
        self.adapter.bind(value, now=noon)
        with self.assertRaisesRegex(Conflict, "outside Second Shift window"):
            self.adapter.claim(value, now=noon)

    def test_overnight_claim_inside_shift_succeeds(self):
        value = handoff(execution_class="OVERNIGHT")
        one_am_ny = dt.datetime(2026, 9, 12, 5, 0, tzinfo=UTC)
        self.adapter.bind(value, now=one_am_ny)
        claim = self.adapter.claim(value, now=one_am_ny)
        self.assertEqual(claim.fencing_token, 1)

    def test_tampered_admission_receipt_fails_closed(self):
        value = handoff()
        value["admission_receipt"]["execution_order"] = 99
        base = dict(value)
        base.pop("handoff_digest")
        value["handoff_digest"] = digest(base)
        with self.assertRaisesRegex(GatewayHandoffError, "admission receipt digest"):
            validate_gateway_handoff(value)

    def test_tampered_handoff_digest_fails_closed(self):
        value = handoff()
        value["handoff_digest"] = "0" * 64
        with self.assertRaisesRegex(GatewayHandoffError, "handoff digest"):
            validate_gateway_handoff(value)

    def test_github_cannot_become_scheduler_owner(self):
        value = handoff()
        value["scheduling_owner"] = "GITHUB_ACTIONS"
        base = dict(value)
        base.pop("handoff_digest")
        value["handoff_digest"] = digest(base)
        with self.assertRaisesRegex(GatewayHandoffError, "sole scheduling owner"):
            validate_gateway_handoff(value)


if __name__ == "__main__":
    unittest.main(verbosity=2)
