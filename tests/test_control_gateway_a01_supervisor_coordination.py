from __future__ import annotations

import concurrent.futures
import datetime as dt
import hashlib
import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "control-gateway" / "python"))

from a01_supervisor_adapter import SupervisorGatewayAdapter  # noqa: E402
from a01_supervisor_coordination import (  # noqa: E402
    COORDINATION_PROTOCOL,
    CoordinationError,
    SupervisorCoordinationAdapter,
    validate_coordination_contract,
)
from tools.second_shift_supervisor_v2 import Conflict, StaleWorker, SupervisorStore  # noqa: E402

UTC = dt.timezone.utc
NOW = dt.datetime(2026, 9, 12, 12, 0, tzinfo=UTC)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def make_handoff(name: str, lane: str, *, execution_class="IMMEDIATE"):
    payload = {"task": name}
    receipt = {
        "protocol_version": "control-gateway.a01-admission-receipt.v1",
        "decision": "GRANTED",
        "admission_id": f"ADMIT-{name}",
        "request_digest": digest({"request": name}),
        "mission_version": "SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v1.0",
        "workstream_id": "SECOND-SHIFT-CONTROL-GATEWAY",
        "authority_epoch": 10,
        "authority_publication_commit_sha": "a" * 40,
        "authority_packet_digest": "b" * 64,
        "authoritative_subject": {"algorithm": "sha1", "oid": "c" * 40},
        "repository": "BFochtman746/system-master",
        "authority_ref": "second-shift-control-gateway/cg-009-dependency-concurrency-cancellation",
        "authority_ref_head_sha": "d" * 40,
        "operation_id": "SECOND-SHIFT-CONTROL-GATEWAY-CG-009",
        "predecessor_receipt_id": "SECOND-SHIFT-CONTROL-GATEWAY-CG-008-HOST-QUALIFICATION-34671167418",
        "command_id": f"CMD-{name}",
        "task_id": f"TASK-{name}",
        "idempotency_key": f"IDEM-{name}",
        "execution_class": execution_class,
        "execution_order": 1,
        "priority": 100,
        "not_before": None,
        "not_after": None,
        "lane": lane,
        "owner_path": f"CONTROL_GATEWAY/{lane}",
        "delegation_id": f"D-{name}",
        "objective_id": f"O-{name}",
        "control_ref": "second-shift-control-gateway/cg-009-dependency-concurrency-cancellation",
        "control_head": "d" * 40,
        "executor_kind": "A01_CONTROL_PLANE_QUALIFICATION",
        "payload_digest": digest(payload),
        "dependency_receipt_ids": [],
        "scheduling_owner": "A01_SUPERVISOR",
        "github_role": "ADMISSION_TRANSPORT_EVIDENCE_ONLY",
        "admission_digest": "",
    }
    receipt_body = dict(receipt)
    receipt_body.pop("admission_digest")
    receipt["admission_digest"] = digest(receipt_body)
    value = {
        "protocol_version": "control-gateway.a01-supervisor-handoff.v1",
        "admission_receipt": receipt,
        "scheduling_owner": "A01_SUPERVISOR",
        "github_role": "ADMISSION_TRANSPORT_EVIDENCE_ONLY",
        "lane": lane,
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
    body = dict(value)
    body.pop("handoff_digest")
    value["handoff_digest"] = digest(body)
    return value


def make_coord(handoff, *, deps=None, resource="A01-DEFAULT", limit=1, policy="NO_CASCADE", graph="GRAPH-1", version=1):
    value = {
        "protocol_version": COORDINATION_PROTOCOL,
        "handoff_digest": handoff["handoff_digest"],
        "graph_id": graph,
        "graph_version": version,
        "delegation_id": handoff["delegation_id"],
        "dependency_ids": sorted(deps or []),
        "resource_key": resource,
        "max_concurrency": limit,
        "cancellation_policy": policy,
        "coordination_digest": "",
    }
    body = dict(value)
    body.pop("coordination_digest")
    value["coordination_digest"] = digest(body)
    return value


class CoordinationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "supervisor.db"
        self.store = SupervisorStore(self.db)
        self.adapter = SupervisorCoordinationAdapter(self.store)

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def bind(self, name, lane, **coord_kwargs):
        h = make_handoff(name, lane)
        c = make_coord(h, **coord_kwargs)
        self.adapter.bind(h, c, now=NOW)
        return h, c

    def test_contract_binds_exact_handoff_and_digest(self):
        h = make_handoff("A", "LANE-A")
        c = make_coord(h)
        validate_coordination_contract(h, c)
        c["coordination_digest"] = "0" * 64
        with self.assertRaisesRegex(CoordinationError, "digest"):
            validate_coordination_contract(h, c)

    def test_missing_or_incomplete_dependency_blocks_claim_until_completed(self):
        child = make_handoff("B", "LANE-B")
        child_c = make_coord(child, deps=["D-A"])
        self.adapter.bind(child, child_c, now=NOW)
        with self.assertRaisesRegex(CoordinationError, "missing dependency"):
            self.adapter.claim(child, child_c, now=NOW)

        root, root_c = self.bind("A", "LANE-A")
        with self.assertRaisesRegex(CoordinationError, "not COMPLETED"):
            self.adapter.claim(child, child_c, now=NOW)
        claim = self.adapter.claim(root, root_c, now=NOW)
        self.store.terminal(claim.lease_id, claim.fencing_token, "COMPLETED", now=NOW + dt.timedelta(seconds=1))
        child_claim = self.adapter.claim(child, child_c, now=NOW + dt.timedelta(seconds=2))
        self.assertEqual(child_claim.delegation_id, "D-B")

    def test_non_success_dependency_does_not_unlock_descendant(self):
        root, root_c = self.bind("A", "LANE-A")
        child, child_c = self.bind("B", "LANE-B", deps=["D-A"])
        claim = self.adapter.claim(root, root_c, now=NOW)
        self.store.terminal(claim.lease_id, claim.fencing_token, "BLOCKED", now=NOW + dt.timedelta(seconds=1))
        with self.assertRaisesRegex(CoordinationError, "not COMPLETED"):
            self.adapter.claim(child, child_c, now=NOW + dt.timedelta(seconds=2))

    def test_cycle_is_rejected_transactionally(self):
        a = make_handoff("A", "LANE-A")
        ca = make_coord(a, deps=["D-B"], graph="CYCLE")
        self.adapter.bind(a, ca, now=NOW)
        b = make_handoff("B", "LANE-B")
        cb = make_coord(b, deps=["D-A"], graph="CYCLE")
        with self.assertRaisesRegex(CoordinationError, "cycle"):
            self.adapter.bind(b, cb, now=NOW)
        self.assertIsNone(self.store.conn.execute("SELECT 1 FROM coordination_tasks WHERE delegation_id='D-B'").fetchone())

    def test_resource_limit_blocks_parallel_claim_across_lanes_then_releases(self):
        a, ca = self.bind("A", "LANE-A", resource="GPU", limit=1)
        b, cb = self.bind("B", "LANE-B", resource="GPU", limit=1)
        first = self.adapter.claim(a, ca, now=NOW)
        with self.assertRaisesRegex(CoordinationError, "concurrency limit"):
            self.adapter.claim(b, cb, now=NOW)
        self.store.terminal(first.lease_id, first.fencing_token, "COMPLETED", now=NOW + dt.timedelta(seconds=1))
        second = self.adapter.claim(b, cb, now=NOW + dt.timedelta(seconds=2))
        self.assertEqual(second.delegation_id, "D-B")

    def test_resource_limit_policy_cannot_drift(self):
        self.bind("A", "LANE-A", resource="GPU", limit=1)
        h = make_handoff("B", "LANE-B")
        c = make_coord(h, resource="GPU", limit=2)
        with self.assertRaisesRegex(CoordinationError, "conflicts"):
            self.adapter.bind(h, c, now=NOW)

    def test_distinct_resources_can_claim_concurrently(self):
        a, ca = self.bind("A", "LANE-A", resource="GPU-A", limit=1)
        b, cb = self.bind("B", "LANE-B", resource="GPU-B", limit=1)
        one = self.adapter.claim(a, ca, now=NOW)
        two = self.adapter.claim(b, cb, now=NOW)
        self.assertNotEqual(one.lease_id, two.lease_id)
        self.assertEqual(self.adapter.audit_coordination_invariants(), [])

    def test_eight_way_race_respects_resource_limit_two(self):
        items = []
        for i in range(8):
            h, c = self.bind(str(i), f"LANE-{i}", resource="POOL", limit=2)
            items.append((h, c))
        self.store.close()
        barrier = threading.Barrier(8)

        def worker(pair):
            h, c = pair
            with SupervisorStore(self.db) as store:
                adapter = SupervisorCoordinationAdapter(store)
                barrier.wait()
                try:
                    claim = adapter.claim(h, c, now=NOW)
                    return ("OK", claim.lease_id)
                except Conflict:
                    return ("BLOCKED", None)

        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
            results = list(ex.map(worker, items))
        self.store = SupervisorStore(self.db)
        self.adapter = SupervisorCoordinationAdapter(self.store)
        self.assertEqual(sum(1 for result in results if result[0] == "OK"), 2, results)
        self.assertEqual(self.adapter.audit_coordination_invariants(), [])

    def test_ready_cancellation_is_terminal_and_idempotent(self):
        h, c = self.bind("A", "LANE-A")
        result = self.adapter.request_cancel("D-A", "operator cancelled", now=NOW)
        self.assertEqual(result["outcomes"][0]["outcome"], "CANCELLED")
        again = self.adapter.request_cancel("D-A", "operator cancelled", now=NOW)
        self.assertEqual(again["outcomes"][0]["outcome"], "ALREADY_CANCELLED")
        self.assertEqual(self.adapter.coordination_status("D-A")["state"], "CANCELLED")
        with self.assertRaisesRegex(CoordinationError, "cancelled"):
            self.adapter.claim(h, c, now=NOW)

    def test_pending_claim_cancel_fences_worker_and_cancels_outbox(self):
        h, c = self.bind("A", "LANE-A")
        claim = self.adapter.claim(h, c, now=NOW)
        self.adapter.request_cancel("D-A", "stop", now=NOW + dt.timedelta(seconds=1))
        row = self.store.conn.execute("SELECT state FROM dispatch_outbox WHERE dispatch_id=?", (claim.dispatch_id,)).fetchone()
        self.assertEqual(row["state"], "CANCELLED")
        with self.assertRaises(StaleWorker):
            self.store.heartbeat(claim.lease_id, claim.fencing_token, "late", NOW + dt.timedelta(seconds=2))
        self.assertEqual(self.adapter.audit_coordination_invariants(), [])
        self.assertEqual(self.store.audit_invariants(), [])

    def test_dispatched_cancel_requires_external_ack_but_local_authority_is_fenced_immediately(self):
        h, c = self.bind("A", "LANE-A")
        claim = self.adapter.claim(h, c, now=NOW)
        self.store.mark_dispatched(claim.dispatch_id, "RUN-1", now=NOW + dt.timedelta(seconds=1))
        self.adapter.request_cancel("D-A", "stop", now=NOW + dt.timedelta(seconds=2))
        row = self.store.conn.execute("SELECT state FROM dispatch_outbox WHERE dispatch_id=?", (claim.dispatch_id,)).fetchone()
        self.assertEqual(row["state"], "CANCEL_REQUESTED")
        with self.assertRaises(StaleWorker):
            self.store.progress(claim.lease_id, claim.fencing_token, {"late": True}, NOW + dt.timedelta(seconds=3))
        self.adapter.acknowledge_cancel(claim.dispatch_id, "RUN-1", now=NOW + dt.timedelta(seconds=4))
        row = self.store.conn.execute("SELECT state FROM dispatch_outbox WHERE dispatch_id=?", (claim.dispatch_id,)).fetchone()
        self.assertEqual(row["state"], "CANCELLED")

    def test_cascade_policy_cancels_dependency_descendants(self):
        root, root_c = self.bind("A", "LANE-A", policy="CASCADE_DEPENDENTS", graph="G-CASCADE")
        child, child_c = self.bind("B", "LANE-B", deps=["D-A"], graph="G-CASCADE")
        result = self.adapter.request_cancel("D-A", "root cancelled", now=NOW)
        ids = [x["delegation_id"] for x in result["outcomes"]]
        self.assertEqual(ids, ["D-A", "D-B"])
        self.assertEqual(self.adapter.coordination_status("D-A")["state"], "CANCELLED")
        self.assertEqual(self.adapter.coordination_status("D-B")["state"], "CANCELLED")

    def test_cg008_direct_claim_path_cannot_bypass_coordination(self):
        h, c = self.bind("A", "LANE-A")
        legacy = SupervisorGatewayAdapter(self.store)
        with self.assertRaisesRegex(Conflict, "SupervisorCoordinationAdapter"):
            legacy.claim(h, now=NOW)

    def test_coordination_survives_restart(self):
        h, c = self.bind("A", "LANE-A", resource="GPU", limit=2)
        self.store.close()
        self.store = SupervisorStore(self.db)
        self.adapter = SupervisorCoordinationAdapter(self.store)
        status = self.adapter.coordination_status("D-A")
        self.assertEqual(status["resource_key"], "GPU")
        self.assertEqual(status["max_concurrency"], 2)
        claim = self.adapter.claim(h, c, now=NOW)
        self.assertEqual(claim.delegation_id, "D-A")


if __name__ == "__main__":
    unittest.main(verbosity=2)
