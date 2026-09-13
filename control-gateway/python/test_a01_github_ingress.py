"""Offline tests for the A-01 GitHub ingress.

No network and no SQLite. GitHub is replaced by a fake source and the scheduler by
a recording double, so these run anywhere and gate on real contract validity: every
handoff built here is checked by the same validate_gateway_handoff the supervisor uses.

    cd control-gateway/python && python -m unittest test_a01_github_ingress -v
"""

from __future__ import annotations

import datetime as dt
import os
import tempfile
import unittest

from a01_github_ingress import (
    Ingress,
    IngressError,
    KillSwitch,
    NightBudget,
    build_contract,
    build_handoff,
)
from a01_supervisor_adapter import validate_gateway_handoff
from a01_supervisor_coordination_strict import validate_coordination_contract

HEAD = "a" * 40
NOT_BEFORE = "2026-09-14T22:00:00Z"
NOT_AFTER = "2026-09-15T06:00:00Z"
SESSION = "2026-09-14"


def obligation(oid="FOUNDATION-1-0-CLOSURE-001", owner="SYSTEM_MASTER/CORE", state="READY"):
    return {
        "obligation_id": oid,
        "owner_path": owner,
        "state": state,
        "title": "Close Foundation Closure Census 001.",
        "objective": "Author the capability crosswalk and per-module foundation contracts.",
        "acceptance_target": "foundation-closure-matrix --summary reports zero ACTIVE_GAP.",
        "evidence_target": "governance/census/DISPOSITION-MATRIX.md",
    }


class FakeSource:
    ref = "main"

    def __init__(self, obligations, registry_id="WORK-OBLIGATION-REGISTRY-013"):
        self.obligations = obligations
        self.registry_id = registry_id
        self.reads = []

    def read_json(self, path):
        self.reads.append(path)
        if path == "governance/CURRENT-AUTHORITY.json":
            return {"authority_id": "CURRENT-AUTHORITY-004", "obligation_registry": "governance/REG.json"}
        if path == "governance/REG.json":
            return {"registry_id": self.registry_id, "obligations": self.obligations}
        raise IngressError(f"unexpected read {path}")

    def head_sha(self, path="governance/CURRENT-AUTHORITY.json"):
        return HEAD


class FailingSource(FakeSource):
    def read_json(self, path):
        raise IngressError("github unreachable")


class RecordingScheduler:
    def __init__(self, refuse=False):
        self.calls = []
        self.refuse = refuse

    def enqueue(self, handoff, contract, now=None):
        if self.refuse:
            raise RuntimeError("night scheduler delegation identity collision")
        validate_gateway_handoff(handoff)
        validate_coordination_contract(handoff, contract)
        self.calls.append(handoff["delegation_id"])
        return {"state": "QUEUED"}


def make(obligations, *, scheduler=None, max_delegations=8, max_minutes=420, state_dir=None):
    return Ingress(
        FakeSource(obligations),
        KillSwitch(state_dir or tempfile.mkdtemp()),
        NightBudget(max_delegations=max_delegations, max_minutes=max_minutes),
        scheduler=scheduler,
    )


class TestHandoffConstruction(unittest.TestCase):
    def build(self, **kw):
        return build_handoff(
            obligation(), control_head=HEAD, control_ref="main",
            not_before=NOT_BEFORE, not_after=NOT_AFTER, execution_order=0,
            session_date=SESSION, **kw
        )

    def test_handoff_satisfies_the_frozen_supervisor_contract(self):
        validate_gateway_handoff(self.build())  # raises on any deviation

    def test_contract_binds_to_its_exact_handoff(self):
        handoff = self.build()
        validate_coordination_contract(handoff, build_contract(handoff, graph_id="G"))

    def test_contract_rejects_a_different_handoff(self):
        a = self.build()
        b = build_handoff(
            obligation(oid="OTHER-001"), control_head=HEAD, control_ref="main",
            not_before=NOT_BEFORE, not_after=NOT_AFTER, execution_order=1, session_date=SESSION,
        )
        with self.assertRaises(Exception):
            validate_coordination_contract(b, build_contract(a, graph_id="G"))

    def test_delegation_id_is_deterministic_for_unchanged_state(self):
        self.assertEqual(self.build()["delegation_id"], self.build()["delegation_id"])

    def test_delegation_id_changes_when_control_head_moves(self):
        other = build_handoff(
            obligation(), control_head="b" * 40, control_ref="main",
            not_before=NOT_BEFORE, not_after=NOT_AFTER, execution_order=0, session_date=SESSION,
        )
        self.assertNotEqual(self.build()["delegation_id"], other["delegation_id"])

    def test_execution_class_is_always_overnight(self):
        self.assertEqual(self.build()["execution_class"], "OVERNIGHT")

    def test_github_role_is_never_elevated(self):
        handoff = self.build()
        self.assertEqual(handoff["scheduling_owner"], "A01_SUPERVISOR")
        self.assertEqual(handoff["github_role"], "ADMISSION_TRANSPORT_EVIDENCE_ONLY")

    def test_unowned_obligation_is_refused(self):
        with self.assertRaises(IngressError):
            build_handoff(
                obligation(owner=""), control_head=HEAD, control_ref="main",
                not_before=NOT_BEFORE, not_after=NOT_AFTER, execution_order=0, session_date=SESSION,
            )


class TestBudget(unittest.TestCase):
    def test_delegation_ceiling_is_enforced(self):
        obligations = [obligation(oid=f"OB-{i:03}") for i in range(10)]
        ingress = make(obligations, max_delegations=3)
        result = ingress.run_once(dry_run=True)
        self.assertEqual(len(result.built), 3)
        self.assertTrue(any(s["reason"] == "NIGHT_BUDGET_EXHAUSTED" for s in result.skipped))

    def test_minute_ceiling_is_enforced(self):
        obligations = [obligation(oid=f"OB-{i:03}") for i in range(10)]
        ingress = make(obligations, max_delegations=99, max_minutes=90)
        self.assertEqual(len(ingress.run_once(dry_run=True).built), 2)  # 45 minutes each

    def test_zero_budget_admits_nothing(self):
        self.assertEqual(len(make([obligation()], max_delegations=0).run_once(dry_run=True).built), 0)

    def test_commit_beyond_budget_raises(self):
        budget = NightBudget(max_delegations=1, max_minutes=45)
        budget.commit(45)
        with self.assertRaises(IngressError):
            budget.commit(45)


class TestKillSwitch(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()

    def test_engaged_switch_blocks_the_whole_pass(self):
        KillSwitch(self.dir).engage("operator halt")
        result = make([obligation()], state_dir=self.dir).run_once(dry_run=True)
        self.assertTrue(result.halted)
        self.assertEqual(len(result.built), 0)
        self.assertIn("operator halt", result.halt_reason)

    def test_released_switch_allows_the_pass(self):
        switch = KillSwitch(self.dir)
        switch.engage("halt")
        switch.release()
        self.assertFalse(make([obligation()], state_dir=self.dir).run_once(dry_run=True).halted)

    def test_release_is_idempotent(self):
        KillSwitch(self.dir).release()
        KillSwitch(self.dir).release()

    def test_switch_engaged_mid_pass_stops_remaining_items(self):
        obligations = [obligation(oid=f"OB-{i:03}") for i in range(5)]
        switch = KillSwitch(self.dir)
        ingress = make(obligations, state_dir=self.dir)

        original = switch.engaged
        calls = {"n": 0}

        def engaged_after_two():
            calls["n"] += 1
            if calls["n"] > 3:  # initial check plus two items
                switch.engage("mid-night halt")
            return original()

        ingress.kill_switch.engaged = engaged_after_two
        result = ingress.run_once(dry_run=True)
        self.assertTrue(result.halted)
        self.assertLess(len(result.built), 5)


class TestEnqueue(unittest.TestCase):
    def test_only_ready_obligations_are_enqueued(self):
        obligations = [
            obligation(oid="READY-1", state="READY"),
            obligation(oid="HOLD-1", state="HOLD"),
            obligation(oid="ACTIVE-1", state="ACTIVE"),
            obligation(oid="BLOCKED-1", state="BLOCKED"),
        ]
        scheduler = RecordingScheduler()
        result = make(obligations, scheduler=scheduler).run_once()
        self.assertEqual(len(scheduler.calls), 1)
        self.assertEqual(result.considered, 1)

    def test_dry_run_never_enqueues(self):
        scheduler = RecordingScheduler()
        make([obligation()], scheduler=scheduler).run_once(dry_run=True)
        self.assertEqual(scheduler.calls, [])

    def test_scheduler_refusal_is_recorded_not_raised(self):
        result = make([obligation()], scheduler=RecordingScheduler(refuse=True)).run_once()
        self.assertEqual(result.enqueued, [])
        self.assertTrue(any("ENQUEUE_REFUSED" in s["reason"] for s in result.skipped))

    def test_one_bad_obligation_does_not_end_the_night(self):
        obligations = [obligation(oid="BAD-1", owner="not-a-path"), obligation(oid="GOOD-1")]
        scheduler = RecordingScheduler()
        result = make(obligations, scheduler=scheduler).run_once()
        self.assertEqual(len(scheduler.calls), 1)
        self.assertTrue(any("BUILD_FAILED" in s["reason"] for s in result.skipped))

    def test_repolling_unchanged_state_produces_identical_delegation_ids(self):
        obligations = [obligation()]
        first = make(obligations).run_once(dry_run=True)
        second = make(obligations).run_once(dry_run=True)
        self.assertEqual(
            [b["delegation_id"] for b in first.built],
            [b["delegation_id"] for b in second.built],
        )

    def test_identity_survives_a_moving_poll_instant(self):
        """The bug this test was written for: re-polling must not fork the delegation."""
        obligations = [obligation()]
        t1 = dt.datetime(2026, 9, 14, 22, 5, tzinfo=dt.timezone.utc)
        t2 = dt.datetime(2026, 9, 15, 1, 40, tzinfo=dt.timezone.utc)
        a = make(obligations).run_once(now=t1, dry_run=True)
        b = make(obligations).run_once(now=t2, dry_run=True)
        self.assertEqual([x["delegation_id"] for x in a.built], [x["delegation_id"] for x in b.built])

    def test_a_new_night_produces_a_new_delegation(self):
        obligations = [obligation()]
        a = make(obligations).run_once(now=dt.datetime(2026, 9, 14, 22, 0, tzinfo=dt.timezone.utc), dry_run=True)
        b = make(obligations).run_once(now=dt.datetime(2026, 9, 15, 22, 0, tzinfo=dt.timezone.utc), dry_run=True)
        self.assertNotEqual([x["delegation_id"] for x in a.built], [x["delegation_id"] for x in b.built])

    def test_unreachable_github_reports_and_enqueues_nothing(self):
        scheduler = RecordingScheduler()
        ingress = Ingress(FailingSource([]), KillSwitch(tempfile.mkdtemp()), NightBudget(), scheduler=scheduler)
        result = ingress.run_once()
        self.assertTrue(result.errors)
        self.assertEqual(scheduler.calls, [])


class TestReadOnly(unittest.TestCase):
    def test_github_source_exposes_no_write_method(self):
        from a01_github_ingress import GitHubSource
        forbidden = {"put", "post", "patch", "delete", "write", "commit", "push", "create"}
        found = {n for n in dir(GitHubSource) if not n.startswith("_")} & forbidden
        self.assertEqual(found, set(), f"read-only source grew a write surface: {found}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
