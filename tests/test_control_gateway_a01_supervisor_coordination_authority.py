from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "control-gateway" / "python"))

from a01_supervisor_coordination import CoordinationError, SupervisorCoordinationAdapter  # noqa: E402
from tools.second_shift_supervisor_v2 import SupervisorStore  # noqa: E402

helper_spec = importlib.util.spec_from_file_location(
    "cg009_existing_tests",
    ROOT / "tests" / "test_control_gateway_a01_supervisor_coordination.py",
)
if helper_spec is None or helper_spec.loader is None:
    raise RuntimeError("unable to load CG-009 test helpers")
helpers = importlib.util.module_from_spec(helper_spec)
helper_spec.loader.exec_module(helpers)

NOW = helpers.NOW
make_handoff = helpers.make_handoff
make_coord = helpers.make_coord


class CG009AuthorityClosureTests(unittest.TestCase):
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

    def test_no_cascade_policy_cannot_be_broadened_by_caller(self):
        self.bind("A", "LANE-A", policy="NO_CASCADE", graph="G-POLICY")
        with self.assertRaisesRegex(CoordinationError, "differs from durable policy"):
            self.adapter.request_cancel("D-A", "stop", now=NOW, cascade=True)
        self.assertEqual(self.adapter.coordination_status("D-A")["state"], "READY")

    def test_cascade_policy_cannot_be_suppressed_by_caller(self):
        self.bind("A", "LANE-A", policy="CASCADE_DEPENDENTS", graph="G-POLICY")
        self.bind("B", "LANE-B", deps=["D-A"], graph="G-POLICY")
        with self.assertRaisesRegex(CoordinationError, "differs from durable policy"):
            self.adapter.request_cancel("D-A", "stop", now=NOW, cascade=False)
        self.assertEqual(self.adapter.coordination_status("D-A")["state"], "READY")
        self.assertEqual(self.adapter.coordination_status("D-B")["state"], "READY")

    def test_known_cross_graph_dependency_is_rejected_transactionally(self):
        self.bind("A", "LANE-A", graph="GRAPH-A", version=1)
        child = make_handoff("B", "LANE-B")
        child_contract = make_coord(child, deps=["D-A"], graph="GRAPH-B", version=1)
        with self.assertRaisesRegex(CoordinationError, "graph identity/version mismatch"):
            self.adapter.bind(child, child_contract, now=NOW)
        self.assertIsNone(self.store.conn.execute("SELECT 1 FROM coordination_tasks WHERE delegation_id='D-B'").fetchone())
        self.assertIsNone(self.store.conn.execute("SELECT 1 FROM delegations WHERE delegation_id='D-B'").fetchone())

    def test_late_cross_graph_dependency_registration_is_rejected(self):
        child = make_handoff("B", "LANE-B")
        child_contract = make_coord(child, deps=["D-A"], graph="GRAPH-B", version=2)
        self.adapter.bind(child, child_contract, now=NOW)
        root = make_handoff("A", "LANE-A")
        root_contract = make_coord(root, graph="GRAPH-A", version=1)
        with self.assertRaisesRegex(CoordinationError, "graph identity/version mismatch"):
            self.adapter.bind(root, root_contract, now=NOW)
        self.assertIsNone(self.store.conn.execute("SELECT 1 FROM coordination_tasks WHERE delegation_id='D-A'").fetchone())
        with self.assertRaisesRegex(CoordinationError, "missing dependency"):
            self.adapter.claim(child, child_contract, now=NOW)

    def test_dispatched_cancel_retains_resource_capacity_until_external_ack(self):
        a, ca = self.bind("A", "LANE-A", resource="GPU", limit=1, graph="G-RESOURCE")
        b, cb = self.bind("B", "LANE-B", resource="GPU", limit=1, graph="G-RESOURCE")
        claim = self.adapter.claim(a, ca, now=NOW)
        self.store.mark_dispatched(claim.dispatch_id, "RUN-A", now=NOW)
        self.adapter.request_cancel("D-A", "stop", now=NOW)
        outbox = self.store.conn.execute("SELECT state FROM dispatch_outbox WHERE dispatch_id=?", (claim.dispatch_id,)).fetchone()
        self.assertEqual(outbox["state"], "CANCEL_REQUESTED")
        with self.assertRaisesRegex(CoordinationError, "concurrency limit"):
            self.adapter.claim(b, cb, now=NOW)
        self.adapter.acknowledge_cancel(claim.dispatch_id, "RUN-A", now=NOW)
        next_claim = self.adapter.claim(b, cb, now=NOW)
        self.assertEqual(next_claim.delegation_id, "D-B")

    def test_cancel_pending_resource_hold_survives_restart(self):
        a, ca = self.bind("A", "LANE-A", resource="GPU", limit=1, graph="G-RESTART")
        b, cb = self.bind("B", "LANE-B", resource="GPU", limit=1, graph="G-RESTART")
        claim = self.adapter.claim(a, ca, now=NOW)
        self.store.mark_dispatched(claim.dispatch_id, "RUN-A", now=NOW)
        self.adapter.request_cancel("D-A", "stop", now=NOW)
        self.store.close()
        self.store = SupervisorStore(self.db)
        self.adapter = SupervisorCoordinationAdapter(self.store)
        with self.assertRaisesRegex(CoordinationError, "concurrency limit"):
            self.adapter.claim(b, cb, now=NOW)
        self.adapter.acknowledge_cancel(claim.dispatch_id, "RUN-A", now=NOW)
        self.assertEqual(self.adapter.claim(b, cb, now=NOW).delegation_id, "D-B")
        self.assertEqual(self.adapter.audit_coordination_invariants(), [])

    def test_wrong_cancel_ack_cannot_release_capacity(self):
        a, ca = self.bind("A", "LANE-A", resource="GPU", limit=1, graph="G-ACK")
        b, cb = self.bind("B", "LANE-B", resource="GPU", limit=1, graph="G-ACK")
        claim = self.adapter.claim(a, ca, now=NOW)
        self.store.mark_dispatched(claim.dispatch_id, "RUN-A", now=NOW)
        self.adapter.request_cancel("D-A", "stop", now=NOW)
        with self.assertRaisesRegex(CoordinationError, "external run mismatch"):
            self.adapter.acknowledge_cancel(claim.dispatch_id, "RUN-WRONG", now=NOW)
        with self.assertRaisesRegex(CoordinationError, "concurrency limit"):
            self.adapter.claim(b, cb, now=NOW)


if __name__ == "__main__":
    unittest.main(verbosity=2)
