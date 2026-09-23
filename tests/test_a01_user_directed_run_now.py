from __future__ import annotations

import copy
import datetime as dt
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "control-gateway" / "python"))

from a01_ingress_service import (  # noqa: E402
    RUN_NOW_AUTH_PROTOCOL,
    RUN_NOW_PROTOCOL,
    RUN_NOW_TITLE_PREFIX,
    UserDirectedRunNowIngress,
)
from a01_supervisor_adapter import digest  # noqa: E402
from a01_supervisor_coordination import CoordinationError, SupervisorCoordinationAdapter  # noqa: E402
from tools.second_shift_supervisor_v2 import SupervisorStore  # noqa: E402

UTC = dt.timezone.utc
DAYTIME = dt.datetime(2026, 9, 23, 16, 0, tzinfo=UTC)
STATE_REF = "control-gateway-state/active-work/second-shift-production-master-completion-001h-main-reconciliation-001"
STATE_HEAD = "b" * 40
SUBJECT = "a" * 40
CONTROL_HEAD = "c" * 40
OWNER = "BFochtman746"
REPOSITORY = f"{OWNER}/system-master"
LANE = "CORE"
OWNER_PATH = "SYSTEM_MASTER/CORE"
CONTROL_REF = "system-master/control-v2"
OBLIGATION_ID = "RUN-NOW-OBLIGATION-001"
OBJECTIVE_ID = "RUN-NOW-OBJECTIVE-001"
WORKSTREAM = "SECOND-SHIFT-PRODUCTION-MASTER-COMPLETION"
OPERATION = "SECOND-SHIFT-PRODUCTION-MASTER-COMPLETION-001H"
PREDECESSOR = "SECOND-SHIFT-PRODUCTION-MASTER-COMPLETION-001G-RECEIPT"
PACKET_DIGEST = "d" * 64


def admission_digest(receipt):
    body = copy.deepcopy(receipt)
    body.pop("admission_digest", None)
    return digest(body)


def handoff_digest(handoff):
    body = copy.deepcopy(handoff)
    body.pop("handoff_digest", None)
    return digest(body)


def coordination_digest(contract):
    body = copy.deepcopy(contract)
    body.pop("coordination_digest", None)
    return digest(body)


def make_handoff(name: str, *, execution_class="IMMEDIATE", deps=None, issue_number=900):
    command_id = f"RUN-NOW-{name}"
    delegation_id = f"D-{name}"
    payload = {
        "task": name,
        "user_directed_run_now": {
            "protocol_version": RUN_NOW_AUTH_PROTOCOL,
            "command_id": command_id,
            "issue_number": issue_number,
        },
    }
    receipt = {
        "protocol_version": "control-gateway.a01-admission-receipt.v1",
        "decision": "GRANTED",
        "admission_id": f"ADMIT-{name}",
        "request_digest": digest({"request": name}),
        "mission_version": "SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v1.0",
        "workstream_id": WORKSTREAM,
        "authority_epoch": 78,
        "authority_publication_commit_sha": STATE_HEAD,
        "authority_packet_digest": PACKET_DIGEST,
        "authoritative_subject": {"algorithm": "sha1", "oid": SUBJECT},
        "repository": REPOSITORY,
        "authority_ref": "main",
        "authority_ref_head_sha": SUBJECT,
        "operation_id": OPERATION,
        "predecessor_receipt_id": PREDECESSOR,
        "command_id": command_id,
        "task_id": OBLIGATION_ID,
        "idempotency_key": f"IDEM-{name}",
        "execution_class": execution_class,
        "execution_order": 1,
        "priority": 100,
        "not_before": None,
        "not_after": None,
        "lane": LANE,
        "owner_path": OWNER_PATH,
        "delegation_id": delegation_id,
        "objective_id": OBJECTIVE_ID,
        "control_ref": CONTROL_REF,
        "control_head": CONTROL_HEAD,
        "executor_kind": "A01_CONTROL_PLANE_QUALIFICATION",
        "payload_digest": digest(payload),
        "dependency_receipt_ids": [],
        "scheduling_owner": "A01_SUPERVISOR",
        "github_role": "ADMISSION_TRANSPORT_EVIDENCE_ONLY",
    }
    receipt["admission_digest"] = admission_digest(receipt)
    handoff = {
        "protocol_version": "control-gateway.a01-supervisor-handoff.v1",
        "admission_receipt": receipt,
        "scheduling_owner": "A01_SUPERVISOR",
        "github_role": "ADMISSION_TRANSPORT_EVIDENCE_ONLY",
        "lane": LANE,
        "owner_path": OWNER_PATH,
        "delegation_id": delegation_id,
        "objective_id": OBJECTIVE_ID,
        "control_ref": CONTROL_REF,
        "control_head": CONTROL_HEAD,
        "idempotency_key": receipt["idempotency_key"],
        "executor_kind": receipt["executor_kind"],
        "execution_class": execution_class,
        "execution_order": 1,
        "priority": 100,
        "not_before": None,
        "not_after": None,
        "payload_digest": receipt["payload_digest"],
        "payload": payload,
    }
    handoff["handoff_digest"] = handoff_digest(handoff)
    contract = {
        "protocol_version": "control-gateway.a01-supervisor-coordination.v1",
        "handoff_digest": handoff["handoff_digest"],
        "graph_id": "RUN-NOW-GRAPH",
        "graph_version": 1,
        "delegation_id": delegation_id,
        "dependency_ids": sorted(deps or []),
        "resource_key": f"OWNER-LANE:{LANE}",
        "max_concurrency": 1,
        "cancellation_policy": "NO_CASCADE",
        "coordination_digest": "",
    }
    contract["coordination_digest"] = coordination_digest(contract)
    return command_id, handoff, contract


class FakeSource:
    owner = OWNER
    repository_full_name = REPOSITORY

    def __init__(self, commands):
        self.commands = commands
        self.refs = {
            STATE_REF: STATE_HEAD,
            "main": SUBJECT,
            CONTROL_REF: CONTROL_HEAD,
        }
        self.files = {
            "governance/CURRENT-AUTHORITY.json": {
                "authority_id": "CURRENT-AUTHORITY-005",
                "second_shift_registry": "governance/second-shift/SECOND-SHIFT-REGISTRY-001.json",
                "obligation_registry": "governance/WORK-OBLIGATION-REGISTRY-017.json",
            },
            "governance/second-shift/SECOND-SHIFT-REGISTRY-001.json": {
                "owner_files": {LANE: "governance/second-shift/CORE-DELEGATIONS.json"},
                "coverage_routes": {
                    "SYSTEM_MASTER/SHARED_INFRASTRUCTURE": LANE,
                    "SYSTEM_MASTER/SHARED_INFRASTRUCTURE/A01": LANE,
                },
            },
            "governance/WORK-OBLIGATION-REGISTRY-017.json": {
                "owner_head_snapshot": {LANE: CONTROL_HEAD},
                "obligations": [
                    {"obligation_id": OBLIGATION_ID, "owner_path": OWNER_PATH, "state": "ACTIVE"}
                ],
            },
            "governance/second-shift/CORE-DELEGATIONS.json": {
                "owner_system_id": LANE,
                "owner_path": OWNER_PATH,
                "control_ref": CONTROL_REF,
                "last_known_control_head": CONTROL_HEAD,
                "active_delegations": [],
            },
        }
        self.publication = {
            "protocol_version": "control-gateway.github-active-work-publication.v1",
            "packet_digest": PACKET_DIGEST,
            "packet": {
                "protocol_version": "control-gateway.active-work.v1",
                "mission_version": "SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v1.0",
                "workstream_id": WORKSTREAM,
                "authority_epoch": 78,
                "authoritative_subject": {"algorithm": "sha1", "oid": SUBJECT},
                "branch_or_ref": "main",
                "current_operation": {
                    "operation_id": OPERATION,
                    "predecessor_receipt_id": PREDECESSOR,
                    "state": "ACTIVE",
                },
                "github_admission_state": "ADMITTED",
                "qualification_state": "PASSED",
                "receipt_index": [],
            },
        }

    def read_json(self, path):
        return copy.deepcopy(self.files[path])

    def read_json_at(self, path, ref):
        self.assert_ref(path, ref)
        return copy.deepcopy(self.publication)

    def assert_ref(self, path, ref):
        if path != "control-gateway-state/active-work/head.json" or ref != STATE_REF:
            raise AssertionError((path, ref))

    def resolve_ref_head(self, ref):
        return self.refs[ref]

    def list_run_now_issues(self):
        return copy.deepcopy(self.commands)


def make_issue(name: str, *, execution_class="IMMEDIATE", deps=None, issue_number=900, author="OWNER"):
    command_id, handoff, contract = make_handoff(
        name,
        execution_class=execution_class,
        deps=deps,
        issue_number=issue_number,
    )
    body = {
        "protocol_version": RUN_NOW_PROTOCOL,
        "command_id": command_id,
        "state_ref": STATE_REF,
        "handoff": handoff,
        "coordination_contract": contract,
    }
    return {
        "number": issue_number,
        "title": f"{RUN_NOW_TITLE_PREFIX}{command_id}",
        "body": json.dumps(body, sort_keys=True),
        "author_association": author,
        "user": {"login": OWNER},
    }


class UserDirectedRunNowTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = SupervisorStore(Path(self.tmp.name) / "supervisor.db")
        self.coordination = SupervisorCoordinationAdapter(self.store)

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def test_overnight_still_refuses_daytime_claim(self):
        _command_id, handoff, contract = make_handoff("OVERNIGHT", execution_class="OVERNIGHT")
        self.coordination.bind(handoff, contract, now=DAYTIME)
        with self.assertRaisesRegex(CoordinationError, "outside Second Shift window"):
            self.coordination.claim(handoff, contract, now=DAYTIME)
        self.assertIsNone(self.store.conn.execute("SELECT 1 FROM claims").fetchone())

    def test_owner_authenticated_immediate_claim_succeeds_outside_window(self):
        issue = make_issue("DAYTIME")
        result = UserDirectedRunNowIngress(FakeSource([issue]), self.coordination).run_once(now=DAYTIME)
        self.assertEqual(len(result["claimed"]), 1, result)
        row = self.store.conn.execute("SELECT * FROM claims WHERE released_at IS NULL").fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(row["delegation_id"], "D-DAYTIME")
        self.assertEqual(self.store.audit_invariants(), [])

    def test_non_owner_issue_cannot_obtain_daytime_claim(self):
        issue = make_issue("NOT-OWNER", author="MEMBER")
        result = UserDirectedRunNowIngress(FakeSource([issue]), self.coordination).run_once(now=DAYTIME)
        self.assertEqual(result["claimed"], [])
        self.assertIn("owner-authenticated", result["skipped"][0]["detail"])
        self.assertIsNone(self.store.conn.execute("SELECT 1 FROM claims").fetchone())

    def test_immediate_claim_preserves_dependency_validation(self):
        issue = make_issue("DEPENDENCY", deps=["D-MISSING"])
        result = UserDirectedRunNowIngress(FakeSource([issue]), self.coordination).run_once(now=DAYTIME)
        self.assertEqual(result["claimed"], [])
        self.assertIn("dependency", result["skipped"][0]["detail"])
        self.assertIsNone(self.store.conn.execute("SELECT 1 FROM claims").fetchone())

    def test_exact_main_head_drift_refuses_run_now(self):
        issue = make_issue("STALE")
        source = FakeSource([issue])
        source.refs["main"] = "e" * 40
        result = UserDirectedRunNowIngress(source, self.coordination).run_once(now=DAYTIME)
        self.assertEqual(result["claimed"], [])
        self.assertIn("exact subject", result["skipped"][0]["detail"])
        self.assertIsNone(self.store.conn.execute("SELECT 1 FROM claims").fetchone())

    def test_two_daytime_commands_same_lane_create_only_one_live_claim(self):
        issues = [make_issue("FIRST", issue_number=901), make_issue("SECOND", issue_number=902)]
        result = UserDirectedRunNowIngress(FakeSource(issues), self.coordination).run_once(now=DAYTIME)
        self.assertEqual(len(result["claimed"]), 1, result)
        live = self.store.conn.execute("SELECT COUNT(*) n FROM claims WHERE released_at IS NULL").fetchone()["n"]
        self.assertEqual(live, 1)
        self.assertTrue(any("live claim" in row["detail"] for row in result["skipped"]), result)
        self.assertEqual(self.store.audit_invariants(), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
