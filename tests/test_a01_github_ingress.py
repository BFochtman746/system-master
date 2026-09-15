from __future__ import annotations

import copy
import datetime as dt
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "control-gateway" / "python"))

import a01_github_ingress as ingress_module  # noqa: E402
from a01_github_ingress import (  # noqa: E402
    EXECUTION_ENVELOPE_PROTOCOL,
    Ingress,
    IngressError,
    digest,
    night_window,
    validate_a01_execution_envelope,
)
from a01_supervisor_adapter import ADMISSION_PROTOCOL, HANDOFF_PROTOCOL  # noqa: E402
from a01_supervisor_coordination import COORDINATION_PROTOCOL  # noqa: E402

UTC = dt.timezone.utc
REPOSITORY = "BFochtman746/system-master"
LANE = "CORE"
OWNER_PATH = "SYSTEM_MASTER/CORE"
CONTROL_REF = "system-master/control-v2"
CONTROL_HEAD = "d" * 40
SUBJECT_SHA = "a" * 40
QUALIFICATION_ID = "P12-OVERNIGHT-TEST"
WORKSTREAM_ID = "P12-TEST"
DELEGATION_ID = "SECOND-SHIFT-P12-TEST-001"
OBJECTIVE_ID = "P12-OBJECTIVE-001"
OBLIGATION_ID = "P12-OBJECTIVE-001"
SESSION = "2026-09-16"
NOT_BEFORE, NOT_AFTER = night_window(
    SESSION,
    timezone_name="America/New_York",
    start_local="00:00",
    end_local="07:00",
)


def admission_digest(receipt):
    body = dict(receipt)
    body.pop("admission_digest", None)
    return digest(body)


def handoff_digest(handoff):
    body = dict(handoff)
    body.pop("handoff_digest", None)
    return digest(body)


def coordination_digest(contract):
    body = dict(contract)
    body.pop("coordination_digest", None)
    return digest(body)


def registry(*, qualification_id=QUALIFICATION_ID, overnight=True):
    return {
        "registry_version": 1,
        "qualifications": {
            qualification_id: {
                "workstream_id": WORKSTREAM_ID,
                "gate_class": "focused",
                "source": "subject",
                "executable": "node",
                "args": ["noop.js"],
                "evidence_artifact": "p12-test",
                "overnight_eligible": overnight,
            }
        },
    }


def make_delegation(*, qualifier=QUALIFICATION_ID, subject_sha=SUBJECT_SHA):
    payload = {
        "qualification_id": qualifier,
        "workstream_id": WORKSTREAM_ID,
        "subject_sha": subject_sha,
        "control_plane_sha": subject_sha,
        "qualifier_timeout_minutes": 28,
    }
    payload_digest = digest(payload)
    receipt = {
        "protocol_version": ADMISSION_PROTOCOL,
        "decision": "GRANTED",
        "admission_id": "ADMIT-P12-001",
        "request_digest": digest({"request": "P12"}),
        "mission_version": "P12/v1",
        "workstream_id": WORKSTREAM_ID,
        "authority_epoch": 1,
        "authority_publication_commit_sha": "b" * 40,
        "authority_packet_digest": "c" * 64,
        "authoritative_subject": {"algorithm": "sha1", "oid": subject_sha},
        "repository": REPOSITORY,
        "authority_ref": "main",
        "authority_ref_head_sha": subject_sha,
        "operation_id": "P12-INGRESS",
        "predecessor_receipt_id": "P11-RECEIPT",
        "command_id": "CMD-P12",
        "task_id": OBLIGATION_ID,
        "idempotency_key": "IDEM-P12-001",
        "execution_class": "OVERNIGHT",
        "execution_order": 1,
        "priority": 100,
        "not_before": NOT_BEFORE,
        "not_after": NOT_AFTER,
        "lane": LANE,
        "owner_path": OWNER_PATH,
        "delegation_id": DELEGATION_ID,
        "objective_id": OBJECTIVE_ID,
        "control_ref": CONTROL_REF,
        "control_head": CONTROL_HEAD,
        "executor_kind": "A01_CONTROL_PLANE_QUALIFICATION",
        "payload_digest": payload_digest,
        "dependency_receipt_ids": [],
        "scheduling_owner": "A01_SUPERVISOR",
        "github_role": "ADMISSION_TRANSPORT_EVIDENCE_ONLY",
    }
    receipt["admission_digest"] = admission_digest(receipt)
    handoff = {
        "protocol_version": HANDOFF_PROTOCOL,
        "admission_receipt": receipt,
        "scheduling_owner": "A01_SUPERVISOR",
        "github_role": "ADMISSION_TRANSPORT_EVIDENCE_ONLY",
        "lane": LANE,
        "owner_path": OWNER_PATH,
        "delegation_id": DELEGATION_ID,
        "objective_id": OBJECTIVE_ID,
        "control_ref": CONTROL_REF,
        "control_head": CONTROL_HEAD,
        "idempotency_key": receipt["idempotency_key"],
        "executor_kind": receipt["executor_kind"],
        "execution_class": receipt["execution_class"],
        "execution_order": receipt["execution_order"],
        "priority": receipt["priority"],
        "not_before": receipt["not_before"],
        "not_after": receipt["not_after"],
        "payload_digest": payload_digest,
        "payload": payload,
    }
    handoff["handoff_digest"] = handoff_digest(handoff)
    contract = {
        "protocol_version": COORDINATION_PROTOCOL,
        "handoff_digest": handoff["handoff_digest"],
        "graph_id": "P12-GRAPH",
        "graph_version": 1,
        "delegation_id": DELEGATION_ID,
        "dependency_ids": [],
        "resource_key": f"OWNER-LANE:{LANE}",
        "max_concurrency": 1,
        "cancellation_policy": "NO_CASCADE",
    }
    contract["coordination_digest"] = coordination_digest(contract)
    return {
        "delegation_id": DELEGATION_ID,
        "owner_path": OWNER_PATH,
        "objective_id": OBJECTIVE_ID,
        "obligation_id": OBLIGATION_ID,
        "state": "READY",
        "valid_for_control_ref": CONTROL_REF,
        "valid_for_control_head": CONTROL_HEAD,
        "created_at": "2026-09-15T20:00:00-04:00",
        "last_revalidated_at": "2026-09-15T20:00:00-04:00",
        "completion_delta": "Prove P12 transport.",
        "stop_condition": "Exact admitted unit is queued or refused closed.",
        "allowed_work": ["P12 qualification"],
        "forbidden_authority": ["no synthesized admission"],
        "on_pass": "Preserve evidence.",
        "on_failure": "Fail closed.",
        "a01_execution": {
            "protocol_version": EXECUTION_ENVELOPE_PROTOCOL,
            "qualification_id": qualifier,
            "subject_sha": subject_sha,
            "handoff": handoff,
            "coordination_contract": contract,
        },
    }


def rehash(delegation):
    envelope = delegation["a01_execution"]
    handoff = envelope["handoff"]
    receipt = handoff["admission_receipt"]
    receipt["admission_digest"] = admission_digest(receipt)
    handoff["handoff_digest"] = handoff_digest(handoff)
    contract = envelope["coordination_contract"]
    contract["handoff_digest"] = handoff["handoff_digest"]
    contract["coordination_digest"] = coordination_digest(contract)
    return delegation


def validate(delegation, qualification_registry=None):
    return validate_a01_execution_envelope(
        delegation,
        delegation["a01_execution"],
        lane=LANE,
        owner_path=OWNER_PATH,
        control_ref=CONTROL_REF,
        control_head=CONTROL_HEAD,
        obligation_id=OBLIGATION_ID,
        qualification_registry=qualification_registry or registry(),
        repository_full_name=REPOSITORY,
        expected_not_before=NOT_BEFORE,
        expected_not_after=NOT_AFTER,
    )


class FakeSource:
    repository_full_name = REPOSITORY

    def __init__(self, delegation):
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
                    {"obligation_id": OBLIGATION_ID, "owner_path": OWNER_PATH, "state": "ACTIVE"},
                ],
            },
            "qualification/a01/a01-policy.json": {
                "overnight": {
                    "enabled": True,
                    "timezone": "America/New_York",
                    "max_slots": 8,
                    "window_start_local": "00:00",
                    "window_end_local": "07:00",
                }
            },
            "qualification/a01/registry.json": registry(),
            "governance/second-shift/CORE-DELEGATIONS.json": {
                "owner_system_id": LANE,
                "owner_path": OWNER_PATH,
                "control_ref": CONTROL_REF,
                "last_known_control_head": CONTROL_HEAD,
                "active_delegations": [delegation],
            },
        }
        self.live_heads = {CONTROL_REF: CONTROL_HEAD}

    def read_json(self, path):
        return copy.deepcopy(self.files[path])

    def resolve_ref_head(self, ref):
        return self.live_heads[ref]


class RecordingScheduler:
    def __init__(self):
        self.calls = []

    def enqueue(self, handoff, contract, now=None):
        self.calls.append((copy.deepcopy(handoff), copy.deepcopy(contract), now))
        return {"status": "ENQUEUED"}


class P12IngressAuthorityTests(unittest.TestCase):
    def test_valid_pre_admitted_envelope_passes_without_rewriting(self):
        delegation = make_delegation()
        expected_handoff = copy.deepcopy(delegation["a01_execution"]["handoff"])
        expected_contract = copy.deepcopy(delegation["a01_execution"]["coordination_contract"])
        handoff, contract = validate(delegation)
        self.assertEqual(handoff, expected_handoff)
        self.assertEqual(contract, expected_contract)

    def test_module_has_no_local_admission_or_coordination_builder(self):
        self.assertFalse(hasattr(ingress_module, "build_handoff"))
        self.assertFalse(hasattr(ingress_module, "build_contract"))

    def test_missing_execution_envelope_never_reaches_p11(self):
        delegation = make_delegation()
        delegation.pop("a01_execution")
        scheduler = RecordingScheduler()
        with tempfile.TemporaryDirectory() as state_dir:
            result = Ingress(FakeSource(delegation), scheduler=scheduler, state_dir=state_dir).run_once(
                now=dt.datetime(2026, 9, 16, 3, 57, tzinfo=UTC)
            )
        self.assertEqual(result.status, "PASS")
        self.assertEqual(result.enqueued, 0)
        self.assertEqual(len(scheduler.calls), 0)
        self.assertEqual(result.skipped[0]["reason"], "NO_PRE_ADMITTED_A01_EXECUTION")

    def test_exact_pre_admitted_objects_are_forwarded_to_p11(self):
        delegation = make_delegation()
        expected_handoff = copy.deepcopy(delegation["a01_execution"]["handoff"])
        expected_contract = copy.deepcopy(delegation["a01_execution"]["coordination_contract"])
        scheduler = RecordingScheduler()
        with tempfile.TemporaryDirectory() as state_dir:
            result = Ingress(FakeSource(delegation), scheduler=scheduler, state_dir=state_dir).run_once(
                now=dt.datetime(2026, 9, 16, 3, 57, tzinfo=UTC)
            )
        self.assertEqual(result.status, "PASS")
        self.assertEqual(result.enqueued, 1)
        self.assertEqual(len(scheduler.calls), 1)
        self.assertEqual(scheduler.calls[0][0], expected_handoff)
        self.assertEqual(scheduler.calls[0][1], expected_contract)

    def test_unregistered_qualifier_fails_closed(self):
        delegation = make_delegation()
        delegation["a01_execution"]["qualification_id"] = "NOT-REGISTERED"
        with self.assertRaisesRegex(IngressError, "not registered"):
            validate(delegation)

    def test_registered_but_not_overnight_qualifier_fails_closed(self):
        delegation = make_delegation()
        with self.assertRaisesRegex(IngressError, "not overnight eligible"):
            validate(delegation, registry(overnight=False))

    def test_subject_sha_drift_fails_closed(self):
        delegation = make_delegation()
        delegation["a01_execution"]["subject_sha"] = "e" * 40
        with self.assertRaisesRegex(IngressError, "subject"):
            validate(delegation)

    def test_authoritative_subject_drift_fails_even_with_rehashed_receipt(self):
        delegation = make_delegation()
        delegation["a01_execution"]["handoff"]["admission_receipt"]["authoritative_subject"]["oid"] = "e" * 40
        rehash(delegation)
        with self.assertRaisesRegex(IngressError, "admission subject"):
            validate(delegation)

    def test_admission_task_id_drift_fails_even_with_valid_digests(self):
        delegation = make_delegation()
        delegation["a01_execution"]["handoff"]["admission_receipt"]["task_id"] = "OTHER-OBLIGATION"
        rehash(delegation)
        with self.assertRaisesRegex(IngressError, "task_id differs from current obligation"):
            validate(delegation)

    def test_owner_identity_drift_fails_even_with_rehashed_receipt(self):
        delegation = make_delegation()
        handoff = delegation["a01_execution"]["handoff"]
        handoff["owner_path"] = "SYSTEM_MASTER/BOOK"
        handoff["admission_receipt"]["owner_path"] = "SYSTEM_MASTER/BOOK"
        rehash(delegation)
        with self.assertRaisesRegex(IngressError, "owner_path"):
            validate(delegation)

    def test_control_head_drift_fails_even_with_rehashed_receipt(self):
        delegation = make_delegation()
        handoff = delegation["a01_execution"]["handoff"]
        handoff["control_head"] = "e" * 40
        handoff["admission_receipt"]["control_head"] = "e" * 40
        rehash(delegation)
        with self.assertRaisesRegex(IngressError, "control_head"):
            validate(delegation)

    def test_payload_digest_tamper_fails_closed(self):
        delegation = make_delegation()
        delegation["a01_execution"]["handoff"]["payload"]["subject_sha"] = "e" * 40
        with self.assertRaises(Exception):
            validate(delegation)

    def test_unsupported_executor_fails_even_with_valid_digests(self):
        delegation = make_delegation()
        handoff = delegation["a01_execution"]["handoff"]
        handoff["executor_kind"] = "LOCAL_AGENT"
        handoff["admission_receipt"]["executor_kind"] = "LOCAL_AGENT"
        rehash(delegation)
        with self.assertRaisesRegex(IngressError, "not supported"):
            validate(delegation)

    def test_coordination_resource_drift_fails_even_with_valid_digest(self):
        delegation = make_delegation()
        contract = delegation["a01_execution"]["coordination_contract"]
        contract["resource_key"] = "A01-DEFAULT"
        contract["coordination_digest"] = coordination_digest(contract)
        with self.assertRaisesRegex(IngressError, "resource_key"):
            validate(delegation)

    def test_coordination_concurrency_above_one_fails_even_with_valid_digest(self):
        delegation = make_delegation()
        contract = delegation["a01_execution"]["coordination_contract"]
        contract["max_concurrency"] = 2
        contract["coordination_digest"] = coordination_digest(contract)
        with self.assertRaisesRegex(IngressError, "max_concurrency"):
            validate(delegation)

    def test_current_night_window_drift_fails_closed(self):
        delegation = make_delegation()
        handoff = delegation["a01_execution"]["handoff"]
        handoff["not_after"] = "2026-09-16T12:00:00Z"
        handoff["admission_receipt"]["not_after"] = handoff["not_after"]
        rehash(delegation)
        with self.assertRaisesRegex(IngressError, "not_after"):
            validate(delegation)

    def test_live_owner_head_drift_blocks_entire_ingress_before_enqueue(self):
        delegation = make_delegation()
        source = FakeSource(delegation)
        source.live_heads[CONTROL_REF] = "e" * 40
        scheduler = RecordingScheduler()
        with tempfile.TemporaryDirectory() as state_dir:
            result = Ingress(source, scheduler=scheduler, state_dir=state_dir).run_once(
                now=dt.datetime(2026, 9, 16, 3, 57, tzinfo=UTC)
            )
        self.assertEqual(result.status, "ERROR")
        self.assertEqual(len(scheduler.calls), 0)
        self.assertIn("live owner control head drift", result.errors[0]["detail"])

    def test_shared_obligation_requires_matching_administrative_owner(self):
        delegation = make_delegation()
        source = FakeSource(delegation)
        source.files["governance/WORK-OBLIGATION-REGISTRY-017.json"]["obligations"] = [
            {
                "obligation_id": OBLIGATION_ID,
                "owner_path": "SYSTEM_MASTER/SHARED_INFRASTRUCTURE/A01",
                "administrative_owner": "SYSTEM_MASTER/BOOK",
                "state": "ACTIVE",
            }
        ]
        scheduler = RecordingScheduler()
        with tempfile.TemporaryDirectory() as state_dir:
            result = Ingress(source, scheduler=scheduler, state_dir=state_dir).run_once(
                now=dt.datetime(2026, 9, 16, 3, 57, tzinfo=UTC)
            )
        self.assertEqual(result.status, "PASS")
        self.assertEqual(result.enqueued, 0)
        self.assertEqual(len(scheduler.calls), 0)
        self.assertEqual(result.skipped[0]["reason"], "OBLIGATION_OWNER_MISMATCH")

    def test_shared_obligation_accepts_exact_coverage_route_and_administrator(self):
        delegation = make_delegation()
        source = FakeSource(delegation)
        source.files["governance/WORK-OBLIGATION-REGISTRY-017.json"]["obligations"] = [
            {
                "obligation_id": OBLIGATION_ID,
                "owner_path": "SYSTEM_MASTER/SHARED_INFRASTRUCTURE/A01",
                "administrative_owner": OWNER_PATH,
                "state": "ACTIVE",
            }
        ]
        scheduler = RecordingScheduler()
        with tempfile.TemporaryDirectory() as state_dir:
            result = Ingress(source, scheduler=scheduler, state_dir=state_dir).run_once(
                now=dt.datetime(2026, 9, 16, 3, 57, tzinfo=UTC)
            )
        self.assertEqual(result.status, "PASS")
        self.assertEqual(result.enqueued, 1)
        self.assertEqual(len(scheduler.calls), 1)

    def test_dry_run_validates_but_does_not_reserve_or_enqueue(self):
        delegation = make_delegation()
        scheduler = RecordingScheduler()
        with tempfile.TemporaryDirectory() as state_dir:
            result = Ingress(FakeSource(delegation), scheduler=scheduler, state_dir=state_dir).run_once(
                now=dt.datetime(2026, 9, 16, 3, 57, tzinfo=UTC), dry_run=True
            )
            budget_path = Path(state_dir) / "a01-ingress-night-budget.json"
            self.assertFalse(budget_path.exists())
        self.assertEqual(result.dry_run_built, 1)
        self.assertEqual(result.enqueued, 0)
        self.assertEqual(len(scheduler.calls), 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
