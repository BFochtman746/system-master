from __future__ import annotations

import copy
import datetime as dt
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "control-gateway" / "python"))

from a01_github_ingress import (  # noqa: E402
    A01_POLICY_PATH,
    CURRENT_AUTHORITY_PATH,
    GitHubSource,
    Ingress,
    IngressError,
    KillSwitch,
    NightBudget,
    build_contract,
    build_handoff,
    night_window,
    session_date,
)
from a01_ingress_service import build_scheduler  # noqa: E402
from a01_supervisor_adapter import validate_gateway_handoff  # noqa: E402
from a01_supervisor_coordination import validate_coordination_contract  # noqa: E402

UTC = dt.timezone.utc
T_EARLY = dt.datetime(2026, 9, 15, 5, 30, tzinfo=UTC)  # 01:30 ET
T_LATE = dt.datetime(2026, 9, 15, 23, 30, tzinfo=UTC)  # 19:30 ET -> next session
HEAD = "a" * 40


class FakeSource:
    def __init__(self, files):
        self.files = copy.deepcopy(files)
        self.reads = []

    def read_json(self, path):
        self.reads.append(path)
        if path not in self.files:
            raise IngressError(f"missing fake path {path}")
        value = self.files[path]
        if isinstance(value, Exception):
            raise value
        return copy.deepcopy(value)


class RecordingScheduler:
    def __init__(self, *, error=None, after_enqueue=None):
        self.calls = []
        self.error = error
        self.after_enqueue = after_enqueue

    def enqueue(self, handoff, contract, now=None):
        validate_coordination_contract(handoff, contract)
        self.calls.append((copy.deepcopy(handoff), copy.deepcopy(contract), now))
        if self.after_enqueue:
            self.after_enqueue(len(self.calls), handoff, contract)
        if self.error:
            raise self.error
        return {"state": "QUEUED", "scheduler_digest": handoff["handoff_digest"]}


def delegation(name="A", *, state="READY", head=HEAD, owner="CORE"):
    return {
        "delegation_id": f"SECOND-SHIFT-{owner}-{name}",
        "owner_path": f"SYSTEM_MASTER/{owner}",
        "objective_id": f"OBJECTIVE-{name}",
        "obligation_id": f"OBLIGATION-{name}",
        "state": state,
        "priority": "OWNER_LANE_PRIORITY",
        "valid_for_control_ref": "system-master/control-v2",
        "valid_for_control_head": head,
        "completion_delta": f"complete {name}",
        "stop_condition": f"stop {name}",
        "allowed_work": [f"work {name}"],
        "forbidden_authority": ["do not cross lane"],
        "on_pass": f"pass {name}",
        "on_failure": f"fail {name}",
    }


def fake_files(*delegations, obligation_state="ACTIVE", head=HEAD, max_slots=8):
    owner_path = "governance/second-shift/CORE-DELEGATIONS.json"
    obligations = []
    for item in delegations:
        obligations.append({
            "obligation_id": item["obligation_id"],
            "owner_path": item["owner_path"],
            "state": obligation_state,
            "objective": item["objective_id"],
        })
    return {
        CURRENT_AUTHORITY_PATH: {
            "authority_id": "CURRENT-AUTHORITY-005",
            "second_shift_registry": "governance/second-shift/SECOND-SHIFT-REGISTRY-001.json",
            "obligation_registry": "governance/WORK-OBLIGATION-REGISTRY-017.json",
        },
        "governance/second-shift/SECOND-SHIFT-REGISTRY-001.json": {
            "owner_files": {"CORE": owner_path},
        },
        "governance/WORK-OBLIGATION-REGISTRY-017.json": {
            "owner_head_snapshot": {"CORE": head},
            "obligations": obligations,
        },
        owner_path: {
            "owner_system_id": "CORE",
            "owner_path": "SYSTEM_MASTER/CORE",
            "control_ref": "system-master/control-v2",
            "last_known_control_head": head,
            "active_delegations": list(delegations),
        },
        A01_POLICY_PATH: {
            "overnight": {
                "enabled": True,
                "timezone": "America/New_York",
                "window_start_local": "00:00",
                "window_end_local": "07:00",
                "max_slots": max_slots,
            }
        },
    }


class P12IngressTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.state = Path(self.tmp.name) / "state"

    def tearDown(self):
        self.tmp.cleanup()

    def test_session_date_before_local_noon_is_current_date(self):
        self.assertEqual(session_date(T_EARLY), "2026-09-15")

    def test_session_date_after_local_noon_rolls_to_next_date(self):
        self.assertEqual(session_date(T_LATE), "2026-09-16")

    def test_session_date_rejects_naive_datetime(self):
        with self.assertRaises(IngressError):
            session_date(dt.datetime(2026, 9, 15, 1, 0))

    def test_night_window_is_exact_new_york_window(self):
        start, end = night_window(
            "2026-09-15",
            timezone_name="America/New_York",
            start_local="00:00",
            end_local="07:00",
        )
        self.assertEqual(start, "2026-09-15T04:00:00Z")
        self.assertEqual(end, "2026-09-15T11:00:00Z")

    def test_identity_survives_a_moving_poll_instant(self):
        item = delegation()
        h1 = build_handoff(item, control_head=HEAD, control_ref="system-master/control-v2", session="2026-09-15", not_before="2026-09-15T04:00:00Z", not_after="2026-09-15T11:00:00Z")
        h2 = build_handoff(item, control_head=HEAD, control_ref="system-master/control-v2", session="2026-09-15", not_before="2026-09-15T04:00:00Z", not_after="2026-09-15T11:00:00Z")
        self.assertEqual(h1["delegation_id"], h2["delegation_id"])
        self.assertEqual(h1["idempotency_key"], h2["idempotency_key"])

    def test_identity_changes_with_session_date(self):
        item = delegation()
        h1 = build_handoff(item, control_head=HEAD, control_ref="system-master/control-v2", session="2026-09-15", not_before=None, not_after=None)
        h2 = build_handoff(item, control_head=HEAD, control_ref="system-master/control-v2", session="2026-09-16", not_before=None, not_after=None)
        self.assertNotEqual(h1["delegation_id"], h2["delegation_id"])

    def test_build_handoff_satisfies_frozen_gateway_contract(self):
        handoff = build_handoff(delegation(), control_head=HEAD, control_ref="system-master/control-v2", session="2026-09-15", not_before=None, not_after=None)
        validate_gateway_handoff(handoff)
        self.assertEqual(handoff["scheduling_owner"], "A01_SUPERVISOR")
        self.assertEqual(handoff["github_role"], "ADMISSION_TRANSPORT_EVIDENCE_ONLY")
        self.assertEqual(handoff["execution_class"], "OVERNIGHT")

    def test_build_handoff_uses_neutral_scheduler_values(self):
        handoff = build_handoff(delegation(), control_head=HEAD, control_ref="system-master/control-v2", session="2026-09-15", not_before=None, not_after=None)
        self.assertEqual(handoff["execution_order"], 0)
        self.assertEqual(handoff["priority"], 100)
        self.assertEqual(handoff["payload"]["semantic_priority"], "OWNER_LANE_PRIORITY")

    def test_build_handoff_rejects_nested_non_peer_owner(self):
        item = delegation()
        item["owner_path"] = "SYSTEM_MASTER/SHARED_INFRASTRUCTURE/A01"
        with self.assertRaises(IngressError):
            build_handoff(item, control_head=HEAD, control_ref="system-master/control-v2", session="2026-09-15", not_before=None, not_after=None)

    def test_build_contract_satisfies_frozen_coordination_contract(self):
        handoff = build_handoff(delegation(), control_head=HEAD, control_ref="system-master/control-v2", session="2026-09-15", not_before=None, not_after=None)
        contract = build_contract(handoff, graph_id="SECOND-SHIFT:2026-09-15:CORE")
        validate_coordination_contract(handoff, contract)
        self.assertEqual(contract["resource_key"], "OWNER-LANE:CORE")
        self.assertEqual(contract["max_concurrency"], 1)

    def test_github_source_exposes_no_write_method(self):
        source = GitHubSource("owner", "repo")
        self.assertFalse(hasattr(source, "write"))
        self.assertFalse(hasattr(source, "write_json"))
        self.assertFalse(hasattr(source, "put"))

    def test_kill_switch_engage_and_release(self):
        switch = KillSwitch(self.state)
        self.assertFalse(switch.engaged())
        switch.engage("operator halt")
        self.assertTrue(switch.engaged())
        self.assertEqual(switch.reason(), "operator halt")
        switch.release()
        self.assertFalse(switch.engaged())

    def test_night_budget_caps_distinct_transport_identities(self):
        budget = NightBudget(self.state, max_slots=2, timezone_name="America/New_York")
        self.assertTrue(budget.reserve("A", T_EARLY))
        self.assertTrue(budget.reserve("B", T_EARLY))
        self.assertFalse(budget.reserve("C", T_EARLY))
        self.assertEqual(budget.snapshot(T_EARLY)["used_slots"], 2)

    def test_night_budget_duplicate_is_idempotent(self):
        budget = NightBudget(self.state, max_slots=1, timezone_name="America/New_York")
        self.assertTrue(budget.reserve("A", T_EARLY))
        self.assertTrue(budget.reserve("A", T_EARLY))
        self.assertEqual(budget.snapshot(T_EARLY)["used_slots"], 1)

    def test_night_budget_survives_restart(self):
        first = NightBudget(self.state, max_slots=2, timezone_name="America/New_York")
        first.reserve("A", T_EARLY)
        second = NightBudget(self.state, max_slots=2, timezone_name="America/New_York")
        self.assertEqual(second.snapshot(T_EARLY)["reserved_delegation_ids"], ["A"])

    def test_night_budget_resets_on_next_session(self):
        budget = NightBudget(self.state, max_slots=1, timezone_name="America/New_York")
        budget.reserve("A", T_EARLY)
        next_night = dt.datetime(2026, 9, 16, 5, 30, tzinfo=UTC)
        self.assertEqual(budget.snapshot(next_night)["used_slots"], 0)
        self.assertTrue(budget.reserve("B", next_night))

    def test_night_budget_fails_closed_on_active_limit_drift(self):
        first = NightBudget(self.state, max_slots=2, timezone_name="America/New_York")
        first.reserve("A", T_EARLY)
        changed = NightBudget(self.state, max_slots=3, timezone_name="America/New_York")
        with self.assertRaises(IngressError):
            changed.snapshot(T_EARLY)

    def test_run_once_enqueues_ready_delegation(self):
        item = delegation()
        scheduler = RecordingScheduler()
        ingress = Ingress(FakeSource(fake_files(item)), scheduler=scheduler, state_dir=self.state)
        result = ingress.run_once(T_EARLY)
        self.assertEqual(result.status, "PASS")
        self.assertEqual(result.considered, 1)
        self.assertEqual(result.enqueued, 1)
        self.assertEqual(len(scheduler.calls), 1)
        self.assertEqual(result.budget["used_slots"], 1)

    def test_run_once_skips_candidate_without_inventing_readiness(self):
        item = delegation(state="CANDIDATE")
        scheduler = RecordingScheduler()
        result = Ingress(FakeSource(fake_files(item)), scheduler=scheduler, state_dir=self.state).run_once(T_EARLY)
        self.assertEqual(result.enqueued, 0)
        self.assertEqual(result.considered, 0)
        self.assertTrue(any(x["reason"] == "NOT_READY" for x in result.skipped))

    def test_dry_run_builds_without_scheduler_or_budget_consumption(self):
        item = delegation()
        ingress = Ingress(FakeSource(fake_files(item)), scheduler=None, state_dir=self.state)
        result = ingress.run_once(T_EARLY, dry_run=True)
        self.assertEqual(result.dry_run_built, 1)
        self.assertEqual(result.enqueued, 0)
        self.assertEqual(result.budget["used_slots"], 0)

    def test_repeated_poll_preserves_same_transport_identity_and_budget_slot(self):
        item = delegation()
        scheduler = RecordingScheduler()
        ingress = Ingress(FakeSource(fake_files(item)), scheduler=scheduler, state_dir=self.state)
        first = ingress.run_once(T_EARLY)
        second = ingress.run_once(T_EARLY + dt.timedelta(minutes=10))
        self.assertEqual(first.enqueued, 1)
        self.assertEqual(second.enqueued, 1)
        self.assertEqual(scheduler.calls[0][0]["delegation_id"], scheduler.calls[1][0]["delegation_id"])
        self.assertEqual(second.budget["used_slots"], 1)

    def test_stale_control_binding_is_skipped(self):
        item = delegation(head="b" * 40)
        files = fake_files(item, head=HEAD)
        scheduler = RecordingScheduler()
        result = Ingress(FakeSource(files), scheduler=scheduler, state_dir=self.state).run_once(T_EARLY)
        self.assertEqual(result.enqueued, 0)
        self.assertTrue(any(x["reason"] == "STALE_CONTROL_BINDING" for x in result.skipped))

    def test_missing_current_obligation_is_skipped(self):
        item = delegation()
        files = fake_files(item)
        files["governance/WORK-OBLIGATION-REGISTRY-017.json"]["obligations"] = []
        result = Ingress(FakeSource(files), scheduler=RecordingScheduler(), state_dir=self.state).run_once(T_EARLY)
        self.assertTrue(any(x["reason"] == "MISSING_CURRENT_OBLIGATION" for x in result.skipped))

    def test_blocked_obligation_is_skipped(self):
        item = delegation()
        result = Ingress(FakeSource(fake_files(item, obligation_state="BLOCKED")), scheduler=RecordingScheduler(), state_dir=self.state).run_once(T_EARLY)
        self.assertTrue(any(x["reason"] == "OBLIGATION_NOT_EXECUTABLE" for x in result.skipped))

    def test_scheduler_refusal_is_recorded_and_slot_is_not_refunded(self):
        item = delegation()
        scheduler = RecordingScheduler(error=RuntimeError("refused"))
        result = Ingress(FakeSource(fake_files(item)), scheduler=scheduler, state_dir=self.state).run_once(T_EARLY)
        self.assertEqual(result.enqueued, 0)
        self.assertTrue(any(x["reason"] == "ENQUEUE_REFUSED" for x in result.skipped))
        self.assertEqual(result.budget["used_slots"], 1)

    def test_preexisting_kill_switch_halts_without_reads(self):
        item = delegation()
        source = FakeSource(fake_files(item))
        ingress = Ingress(source, scheduler=RecordingScheduler(), state_dir=self.state)
        ingress.kill_switch.engage("maintenance")
        result = ingress.run_once(T_EARLY)
        self.assertEqual(result.status, "HALTED")
        self.assertEqual(source.reads, [])

    def test_kill_switch_is_rechecked_before_every_item(self):
        a = delegation("A")
        b = delegation("B")
        ingress = None

        def halt_after_first(_count, _handoff, _contract):
            ingress.kill_switch.engage("operator stop")

        scheduler = RecordingScheduler(after_enqueue=halt_after_first)
        ingress = Ingress(FakeSource(fake_files(a, b)), scheduler=scheduler, state_dir=self.state)
        result = ingress.run_once(T_EARLY)
        self.assertEqual(result.status, "HALTED")
        self.assertEqual(result.enqueued, 1)
        self.assertEqual(len(scheduler.calls), 1)

    def test_source_failure_returns_error_and_enqueues_nothing(self):
        files = fake_files(delegation())
        files[CURRENT_AUTHORITY_PATH] = IngressError("offline")
        scheduler = RecordingScheduler()
        result = Ingress(FakeSource(files), scheduler=scheduler, state_dir=self.state).run_once(T_EARLY)
        self.assertEqual(result.status, "ERROR")
        self.assertEqual(scheduler.calls, [])
        self.assertTrue(result.errors)

    def test_owner_head_snapshot_mismatch_fails_closed(self):
        item = delegation()
        files = fake_files(item)
        files["governance/WORK-OBLIGATION-REGISTRY-017.json"]["owner_head_snapshot"]["CORE"] = "b" * 40
        result = Ingress(FakeSource(files), scheduler=RecordingScheduler(), state_dir=self.state).run_once(T_EARLY)
        self.assertEqual(result.status, "ERROR")
        self.assertIn("owner head snapshot mismatch", result.errors[0]["detail"])

    def test_owner_coverage_set_mismatch_fails_closed(self):
        item = delegation()
        files = fake_files(item)
        files["governance/WORK-OBLIGATION-REGISTRY-017.json"]["owner_head_snapshot"]["BOOK"] = "c" * 40
        result = Ingress(FakeSource(files), scheduler=RecordingScheduler(), state_dir=self.state).run_once(T_EARLY)
        self.assertEqual(result.status, "ERROR")
        self.assertIn("owner coverage differs", result.errors[0]["detail"])

    def test_invalid_policy_limit_fails_closed(self):
        item = delegation()
        files = fake_files(item, max_slots=0)
        result = Ingress(FakeSource(files), scheduler=RecordingScheduler(), state_dir=self.state).run_once(T_EARLY)
        self.assertEqual(result.status, "ERROR")
        self.assertIn("max_slots", result.errors[0]["detail"])

    def test_missing_scheduler_is_error_when_not_dry_run(self):
        item = delegation()
        result = Ingress(FakeSource(fake_files(item)), scheduler=None, state_dir=self.state).run_once(T_EARLY)
        self.assertEqual(result.status, "PASS_WITH_ERRORS")
        self.assertTrue(any(x["reason"] == "SCHEDULER_NOT_BOUND" for x in result.errors))

    def test_budget_exhaustion_skips_remaining_ready_work(self):
        a = delegation("A")
        b = delegation("B")
        scheduler = RecordingScheduler()
        result = Ingress(FakeSource(fake_files(a, b, max_slots=1)), scheduler=scheduler, state_dir=self.state).run_once(T_EARLY)
        self.assertEqual(result.enqueued, 1)
        self.assertEqual(len(scheduler.calls), 1)
        self.assertTrue(any(x["reason"] == "NIGHT_BUDGET_EXHAUSTED" for x in result.skipped))

    def test_payload_preserves_owner_semantics_as_evidence_not_scheduler_authority(self):
        item = delegation()
        scheduler = RecordingScheduler()
        Ingress(FakeSource(fake_files(item)), scheduler=scheduler, state_dir=self.state).run_once(T_EARLY)
        payload = scheduler.calls[0][0]["payload"]
        self.assertEqual(payload["source_delegation_id"], item["delegation_id"])
        self.assertEqual(payload["completion_delta"], item["completion_delta"])
        self.assertEqual(payload["semantic_priority"], item["priority"])

    def test_real_service_builder_binds_a01_night_scheduler(self):
        db = Path(self.tmp.name) / "supervisor.db"
        store, scheduler = build_scheduler(db)
        try:
            self.assertEqual(type(scheduler).__name__, "A01NightScheduler")
            self.assertEqual(scheduler.store, store)
        finally:
            store.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
