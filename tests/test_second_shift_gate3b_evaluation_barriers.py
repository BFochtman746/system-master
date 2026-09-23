from __future__ import annotations

import datetime as dt
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "control-gateway" / "python"))

from a01_supervisor_adapter import SupervisorGatewayAdapter
from a01_supervisor_coordination import CoordinationError, SupervisorCoordinationAdapter
from tools.second_shift_supervisor_v2 import Conflict, SupervisorStore

HELPERS_PATH = ROOT / "tests" / "test_control_gateway_a01_supervisor_coordination.py"
spec = importlib.util.spec_from_file_location("gate3b_helpers", HELPERS_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError("unable to load coordination helpers")
helpers = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = helpers
spec.loader.exec_module(helpers)

UTC = dt.timezone.utc
NOW = dt.datetime(2026, 9, 12, 12, 0, tzinfo=UTC)


def require_evaluation(handoff):
    handoff["payload"]["independent_evaluation_required"] = True
    payload_digest = helpers.digest(handoff["payload"])
    handoff["payload_digest"] = payload_digest
    handoff["admission_receipt"]["payload_digest"] = payload_digest
    receipt = dict(handoff["admission_receipt"])
    receipt.pop("admission_digest")
    handoff["admission_receipt"]["admission_digest"] = helpers.digest(receipt)
    body = dict(handoff)
    body.pop("handoff_digest")
    handoff["handoff_digest"] = helpers.digest(body)
    return handoff


class Gate3BEvaluationBarrierTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = SupervisorStore(Path(self.tmp.name) / "gate3b.db")

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def test_cg008_propagates_requirement_into_supervisor_completion_guard(self):
        handoff = require_evaluation(helpers.make_handoff("ADAPTER", "LANE-A"))
        adapter = SupervisorGatewayAdapter(self.store)
        adapter.bind(handoff, now=NOW)
        row = self.store.conn.execute(
            "SELECT payload_json FROM delegations WHERE delegation_id=?",
            (handoff["delegation_id"],),
        ).fetchone()
        self.assertTrue(json.loads(row["payload_json"])["independent_evaluation_required"])
        claim = adapter.claim(handoff, now=NOW)
        with self.assertRaisesRegex(Conflict, "independent evaluation required"):
            self.store.terminal(
                claim.lease_id, claim.fencing_token, "COMPLETED",
                now=NOW + dt.timedelta(seconds=1),
            )

    def test_cg009_validating_blocks_same_lane_but_independent_lane_binds(self):
        coordinator = SupervisorCoordinationAdapter(self.store)
        first = require_evaluation(helpers.make_handoff("A1", "LANE-A"))
        first_contract = helpers.make_coord(first, graph="GATE3B")
        coordinator.bind(first, first_contract, now=NOW)
        claim = coordinator.claim(first, first_contract, now=NOW)
        row = self.store.conn.execute(
            "SELECT payload_json FROM delegations WHERE delegation_id=?",
            (first["delegation_id"],),
        ).fetchone()
        self.assertTrue(json.loads(row["payload_json"])["independent_evaluation_required"])
        with self.assertRaisesRegex(Conflict, "independent evaluation required"):
            self.store.terminal(
                claim.lease_id, claim.fencing_token, "COMPLETED",
                now=NOW + dt.timedelta(seconds=1),
            )
        self.store.mark_dispatched(claim.dispatch_id, "worker-A1", NOW + dt.timedelta(seconds=2))
        self.store.await_evaluation(
            claim.lease_id, claim.fencing_token, "a" * 64, {"candidate": "A1"},
            evaluation_timeout_seconds=120, now=NOW + dt.timedelta(seconds=3),
        )

        same = helpers.make_handoff("A2", "LANE-A")
        same_contract = helpers.make_coord(same, graph="GATE3B")
        with self.assertRaisesRegex(CoordinationError, "awaits independent evaluation"):
            coordinator.bind(same, same_contract, now=NOW + dt.timedelta(seconds=4))

        other = helpers.make_handoff("B1", "LANE-B")
        other_contract = helpers.make_coord(other, graph="GATE3B")
        coordinator.bind(other, other_contract, now=NOW + dt.timedelta(seconds=4))
        self.assertEqual(coordinator.coordination_status(other["delegation_id"])["state"], "READY")


if __name__ == "__main__":
    unittest.main(verbosity=2)
