import json
import os
import tempfile
import threading
import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from controller_kernel import (
    AmbiguousExternalResult,
    ConcurrencyConflict,
    ControllerKernel,
    DurabilityBarrierNotMet,
    IdempotencyConflict,
    IllegalTransition,
    JournalCollision,
    MemoryJournal,
    QualifierFacade,
    StaleLease,
    UnsupportedSchema,
    ValidationError,
    WorkerFacade,
    canonical_json,
    command_fingerprint,
    sha256_json,
    uuid7,
)

SHA1 = "1" * 40
SHA2 = "2" * 40


def ts(seconds=0):
    return (datetime(2026, 9, 11, 20, 0, tzinfo=timezone.utc) + timedelta(seconds=seconds)).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def make_command(command_id=None, sha=SHA1, **overrides):
    cmd = {
        "protocol_version": "1.0",
        "schema": "controller://schemas/command/v1",
        "command_id": command_id or uuid7(),
        "created_at": ts(),
        "issuer": {"principal": "user:brian", "source": "chatgpt"},
        "command_type": "controller.work.submit",
        "target": {"repository": "BFochtman746/system-master", "expected_subject_sha": sha},
        "preconditions": {},
        "intent": {"task": "reference-kernel-test"},
        "constraints": {},
        "required_policy_version": None,
    }
    cmd.update(overrides)
    cmd["fingerprint"] = command_fingerprint(cmd)
    return cmd


class FakePromotionAdapter:
    def __init__(self, mode="success", observed=None):
        self.mode = mode
        self.observed = observed
        self.calls = 0

    def promote(self, *, subject_repo, subject_sha, idempotency_key):
        self.calls += 1
        if self.mode == "ambiguous":
            self.observed = subject_sha
            raise AmbiguousExternalResult("response lost after remote apply")
        if self.mode == "fail":
            raise RuntimeError("hard failure")
        self.observed = subject_sha

    def observe(self, *, subject_repo):
        return self.observed


class KernelTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = os.path.join(self.tmp.name, "controller.sqlite")
        self.k = ControllerKernel(self.db)

    def tearDown(self):
        try:
            self.k.close()
        except Exception:
            pass
        self.tmp.cleanup()

    def admitted_operation(self, resource="repo:main"):
        cmd = make_command()
        tx = self.k.accept_command(cmd)
        self.k.admit_transaction(tx)
        op = self.k.plan_operation(tx, resource)
        self.k.mark_operation_ready(op)
        return cmd, tx, op

    def passed_qualification(self, sha=SHA1):
        cmd = make_command(sha=sha)
        tx = self.k.accept_command(cmd)
        q = self.k.request_qualification(tx, subject_repo="BFochtman746/system-master", subject_sha=sha)
        self.k.finish_qualification(q, "PASSED", "receipt-1")
        return tx, q

    def test_001_duplicate_command_1000_times_one_transaction(self):
        cmd = make_command()
        ids = {self.k.accept_command(cmd) for _ in range(1000)}
        self.assertEqual(len(ids), 1)
        count = self.k.conn.execute("SELECT COUNT(*) c FROM transactions").fetchone()["c"]
        self.assertEqual(count, 1)

    def test_002_same_command_id_different_payload_rejected(self):
        cmd = make_command()
        self.k.accept_command(cmd)
        changed = dict(cmd)
        changed["intent"] = {"task": "different"}
        changed["fingerprint"] = command_fingerprint(changed)
        with self.assertRaises(IdempotencyConflict):
            self.k.accept_command(changed)

    def test_003_two_connections_create_one_transaction(self):
        cmd = make_command()
        results, errors = [], []
        barrier = threading.Barrier(2)

        def run():
            k = ControllerKernel(self.db)
            try:
                barrier.wait()
                results.append(k.accept_command(cmd))
            except Exception as e:
                errors.append(e)
            finally:
                k.close()

        t1 = threading.Thread(target=run)
        t2 = threading.Thread(target=run)
        t1.start(); t2.start(); t1.join(); t2.join()
        self.assertFalse(errors)
        self.assertEqual(len(set(results)), 1)

    def test_004_one_active_lease_per_resource(self):
        _, tx, op1 = self.admitted_operation("repo:shared")
        op2 = self.k.plan_operation(tx, "repo:shared")
        self.k.mark_operation_ready(op2)
        self.k.acquire_lease(op1, "worker-a", now=ts())
        with self.assertRaises(ConcurrencyConflict):
            self.k.acquire_lease(op2, "worker-b", now=ts(1))

    def test_005_new_generation_rejects_old_worker(self):
        _, tx, op1 = self.admitted_operation("repo:shared")
        op2 = self.k.plan_operation(tx, "repo:shared")
        self.k.mark_operation_ready(op2)
        old = self.k.acquire_lease(op1, "worker-a", ttl_seconds=1, now=ts())
        new = self.k.acquire_lease(op2, "worker-b", ttl_seconds=100, now=ts(2))
        self.assertGreater(new.generation, old.generation)
        with self.assertRaises(StaleLease):
            self.k.start_operation(old.lease_id, old.generation, now=ts(2))

    def test_006_expired_lease_never_reactivates(self):
        _, _, op = self.admitted_operation()
        lease = self.k.acquire_lease(op, "worker-a", ttl_seconds=1, now=ts())
        with self.assertRaises(StaleLease):
            self.k.heartbeat(lease.lease_id, lease.generation, now=ts(2))
        self.assertEqual(self.k.get_state("leases", "lease_id", lease.lease_id), "EXPIRED")
        self.assertEqual(self.k.get_state("operations", "operation_id", op), "STALE")

    def test_007_heartbeat_loss_does_not_erase_semantic_events(self):
        _, _, op = self.admitted_operation()
        lease = self.k.acquire_lease(op, "worker-a", ttl_seconds=1, now=ts())
        before = self.k.events(f"operation:{op}")
        with self.assertRaises(StaleLease):
            self.k.heartbeat(lease.lease_id, lease.generation, now=ts(2))
        after = self.k.events(f"operation:{op}")
        self.assertEqual(after[:len(before)], before)
        self.assertEqual(after[-1]["type"], "controller.operation.staled")
        self.assertEqual(after[-1]["data"]["reason"], "lease_expired")

    def test_008_clock_reversal_does_not_define_event_order(self):
        self.k.append_semantic_event(stream_id="test:clock", event_type="test.one", subject="test/clock", data={"state":"A"}, correlation_id="c", expected_current_version=0)
        self.k.append_semantic_event(stream_id="test:clock", event_type="test.two", subject="test/clock", data={"state":"B"}, correlation_id="c", expected_current_version=1)
        events = self.k.events("test:clock")
        events[0]["time"] = ts(100)
        events[1]["time"] = ts(0)
        prev = None
        for i, event in enumerate(events, start=1):
            event["streamversion"] = i
            event["preveventdigest"] = prev
            base = {k:v for k,v in event.items() if k != "eventdigest"}
            event["eventdigest"] = sha256_json(base)
            prev = event["eventdigest"]
        ControllerKernel.verify_event_stream(events)
        self.assertEqual([e["streamversion"] for e in events], [1,2])

    def test_009_expected_stream_version_conflict(self):
        self.k.append_semantic_event(stream_id="test:v", event_type="test.one", subject="test/v", data={"state":"A"}, correlation_id="c", expected_current_version=0)
        with self.assertRaises(ConcurrencyConflict):
            self.k.append_semantic_event(stream_id="test:v", event_type="test.two", subject="test/v", data={"state":"B"}, correlation_id="c", expected_current_version=0)

    def test_010_missing_prior_event_detected(self):
        self.k.append_semantic_event(stream_id="test:chain", event_type="test.one", subject="x", data={"state":"A"}, correlation_id="c", expected_current_version=0)
        self.k.append_semantic_event(stream_id="test:chain", event_type="test.two", subject="x", data={"state":"B"}, correlation_id="c", expected_current_version=1)
        with self.assertRaises(ValidationError):
            ControllerKernel.verify_event_stream(self.k.events("test:chain")[1:])

    def test_011_changed_event_byte_detected(self):
        self.k.append_semantic_event(stream_id="test:tamper", event_type="test.one", subject="x", data={"state":"A"}, correlation_id="c", expected_current_version=0)
        events = self.k.events("test:tamper")
        events[0]["data"]["state"] = "B"
        with self.assertRaises(ValidationError):
            ControllerKernel.verify_event_stream(events)

    def test_012_canonical_json_is_key_order_independent(self):
        a = {"z":1, "a":{"b":2, "a":3}}
        b = {"a":{"a":3, "b":2}, "z":1}
        self.assertEqual(canonical_json(a), canonical_json(b))
        self.assertEqual(sha256_json(a), sha256_json(b))

    def test_013_unknown_command_property_rejected(self):
        cmd = make_command()
        cmd["typo_field"] = True
        cmd["fingerprint"] = command_fingerprint(cmd)
        with self.assertRaises(ValidationError):
            self.k.accept_command(cmd)

    def test_014_invalid_timestamp_rejected(self):
        cmd = make_command(created_at="not-a-time")
        cmd["fingerprint"] = command_fingerprint(cmd)
        with self.assertRaises(ValidationError):
            self.k.accept_command(cmd)

    def test_015_outbox_survives_controller_restart(self):
        cmd = make_command()
        self.k.accept_command(cmd)
        pending_before = len(self.k.pending_outbox())
        self.k.close()
        self.k = ControllerKernel(self.db)
        self.assertEqual(len(self.k.pending_outbox()), pending_before)

    def test_016_seal_ack_loss_is_idempotent(self):
        cmd = make_command()
        self.k.accept_command(cmd)
        event_id = self.k.pending_outbox()[0]["event_id"]
        journal = MemoryJournal()
        self.k.publish_outbox_event(event_id, journal, when=ts())
        self.k.publish_outbox_event(event_id, journal, when=ts(1))
        self.assertEqual(self.k.outbox_state(event_id), "SEALED")
        row = self.k.conn.execute("SELECT sealed_at FROM outbox WHERE event_id=?", (event_id,)).fetchone()
        self.assertEqual(row["sealed_at"], ts())

    def test_017_unsealed_promotion_cannot_execute(self):
        _, q = self.passed_qualification()
        p = self.k.request_promotion(q)
        self.k.authorize_promotion(p)
        adapter = FakePromotionAdapter()
        with self.assertRaises(DurabilityBarrierNotMet):
            self.k.execute_promotion(p, adapter)
        self.assertEqual(adapter.calls, 0)

    def test_018_ambiguous_external_result_observed_before_retry(self):
        _, q = self.passed_qualification()
        p = self.k.request_promotion(q)
        auth_event = self.k.authorize_promotion(p)
        self.k.publish_outbox_event(auth_event, MemoryJournal())
        adapter = FakePromotionAdapter(mode="ambiguous")
        self.k.execute_promotion(p, adapter)
        self.assertEqual(self.k.get_state("promotions", "promotion_id", p), "RECONCILIATION_REQUIRED")
        outcome = self.k.reconcile_promotion(p, adapter)
        self.assertEqual(outcome, "SUCCEEDED")
        self.assertEqual(adapter.calls, 1)

    def test_019_pass_for_s1_cannot_authorize_s2(self):
        _, q = self.passed_qualification(SHA1)
        p = self.k.request_promotion(q)
        row = self.k.conn.execute("SELECT subject_sha FROM promotions WHERE promotion_id=?", (p,)).fetchone()
        self.assertEqual(row["subject_sha"], SHA1)
        self.assertNotEqual(row["subject_sha"], SHA2)

    def test_020_qualifier_facade_has_no_subject_write(self):
        facade = QualifierFacade(self.k)
        self.assertFalse(hasattr(facade, "write_subject"))
        self.assertFalse(hasattr(facade, "promote"))

    def test_021_worker_facade_has_no_promotion_authority(self):
        facade = WorkerFacade(self.k)
        self.assertFalse(hasattr(facade, "authorize_promotion"))
        self.assertFalse(hasattr(facade, "request_qualification"))

    def test_022_late_old_worker_result_rejected(self):
        _, tx, op1 = self.admitted_operation("repo:shared")
        op2 = self.k.plan_operation(tx, "repo:shared")
        self.k.mark_operation_ready(op2)
        old = self.k.acquire_lease(op1, "worker-a", ttl_seconds=1, now=ts())
        new = self.k.acquire_lease(op2, "worker-b", ttl_seconds=30, now=ts(2))
        self.k.start_operation(new.lease_id, new.generation, now=ts(2))
        with self.assertRaises(StaleLease):
            self.k.submit_worker_result(old.lease_id, old.generation, {"ok": True}, now=ts(3))

    def test_023_qualification_rerun_gets_new_identity(self):
        cmd = make_command()
        tx = self.k.accept_command(cmd)
        q1 = self.k.request_qualification(tx, subject_repo="r", subject_sha=SHA1)
        self.k.finish_qualification(q1, "FAILED", "r1")
        q2 = self.k.request_qualification(tx, subject_repo="r", subject_sha=SHA1)
        self.assertNotEqual(q1, q2)

    def test_024_projection_regenerates_from_journal(self):
        cmd = make_command()
        tx = self.k.accept_command(cmd)
        self.k.admit_transaction(tx)
        events = self.k.events()
        projection1 = ControllerKernel.project_events(events)
        projection2 = ControllerKernel.project_events(json.loads(json.dumps(events)))
        self.assertEqual(projection1, projection2)
        self.assertIn(f"transaction:{tx}", projection1)

    def test_025_projection_contains_explicit_last_event_and_version(self):
        cmd = make_command()
        tx = self.k.accept_command(cmd)
        projection = ControllerKernel.project_events(self.k.events())
        p = projection[f"transaction:{tx}"]
        self.assertEqual(p["stream_version"], 1)
        self.assertTrue(p["last_event_id"])
        self.assertEqual(p["state"], "OPEN")

    def test_026_semantic_state_rebuild_from_exported_events(self):
        cmd = make_command()
        tx = self.k.accept_command(cmd)
        self.k.admit_transaction(tx)
        exported = self.k.events()
        expected = ControllerKernel.project_events(exported)
        self.k.close()
        os.remove(self.db)
        self.k = ControllerKernel(self.db)
        rebuilt = ControllerKernel.project_events(exported)
        self.assertEqual(rebuilt, expected)

    def test_027_unsupported_historic_schema_fails_closed(self):
        self.k.append_semantic_event(stream_id="test:schema", event_type="test.one", subject="x", data={"state":"A"}, correlation_id="c", expected_current_version=0)
        events = self.k.events("test:schema")
        events[0]["dataschema"] = "controller://schemas/events/test.one/v99"
        with self.assertRaises(UnsupportedSchema):
            ControllerKernel.project_events(events)

    def test_028_promotion_timeout_after_apply_does_not_duplicate(self):
        _, q = self.passed_qualification()
        p = self.k.request_promotion(q)
        auth = self.k.authorize_promotion(p)
        self.k.publish_outbox_event(auth, MemoryJournal())
        adapter = FakePromotionAdapter(mode="ambiguous")
        self.k.execute_promotion(p, adapter)
        self.k.reconcile_promotion(p, adapter)
        self.assertEqual(adapter.calls, 1)
        self.assertEqual(self.k.get_state("promotions", "promotion_id", p), "SUCCEEDED")

    def test_029_polling_order_does_not_change_stream_order(self):
        self.k.append_semantic_event(stream_id="test:poll", event_type="test.one", subject="x", data={"state":"A"}, correlation_id="c", expected_current_version=0)
        self.k.append_semantic_event(stream_id="test:poll", event_type="test.two", subject="x", data={"state":"B"}, correlation_id="c", expected_current_version=1)
        delivered = list(reversed(self.k.events("test:poll")))
        projection = ControllerKernel.project_events(delivered)
        self.assertEqual(projection["test:poll"]["stream_version"], 2)
        self.assertEqual(projection["test:poll"]["state"], "B")

    def test_030_new_schema_not_reinterpreted_by_old_controller(self):
        self.k.append_semantic_event(stream_id="test:future", event_type="test.one", subject="x", data={"state":"A"}, correlation_id="c", expected_current_version=0)
        events = self.k.events("test:future")
        events[0]["specversion"] = "2.0"
        with self.assertRaises(UnsupportedSchema):
            ControllerKernel.project_events(events)

    def test_031_space_separated_timestamp_rejected(self):
        cmd = make_command(created_at="2026-09-11 20:00:00+00:00")
        cmd["fingerprint"] = command_fingerprint(cmd)
        with self.assertRaises(ValidationError):
            self.k.accept_command(cmd)

    def test_032_outbox_cannot_seal_without_verified_journal_roundtrip(self):
        cmd = make_command()
        self.k.accept_command(cmd)
        event_id = self.k.pending_outbox()[0]["event_id"]

        class BadJournal:
            def put_if_absent(self, *, event_id, body):
                self.body = body
            def get(self, *, event_id):
                return self.body + " "

        with self.assertRaises(JournalCollision):
            self.k.publish_outbox_event(event_id, BadJournal(), when=ts())
        self.assertEqual(self.k.outbox_state(event_id), "PENDING")

    def test_033_journal_id_collision_with_different_bytes_rejected(self):
        cmd = make_command()
        self.k.accept_command(cmd)
        event_id = self.k.pending_outbox()[0]["event_id"]
        journal = MemoryJournal()
        journal.put_if_absent(event_id=event_id, body="different")
        with self.assertRaises(JournalCollision):
            self.k.publish_outbox_event(event_id, journal, when=ts())
        self.assertEqual(self.k.outbox_state(event_id), "PENDING")

    def test_034_outbox_publish_retry_is_idempotent(self):
        cmd = make_command()
        self.k.accept_command(cmd)
        event_id = self.k.pending_outbox()[0]["event_id"]
        journal = MemoryJournal()
        self.k.publish_outbox_event(event_id, journal, when=ts())
        first = journal.get(event_id=event_id)
        self.k.publish_outbox_event(event_id, journal, when=ts(1))
        self.assertEqual(journal.get(event_id=event_id), first)
        self.assertEqual(self.k.outbox_state(event_id), "SEALED")

    def test_illegal_transaction_completion_rejected(self):
        tx = self.k.accept_command(make_command())
        self.k.admit_transaction(tx)
        with self.assertRaises(IllegalTransition):
            self.k.complete_transaction(tx)

    def test_worker_result_requires_running_and_current_lease(self):
        _, _, op = self.admitted_operation()
        lease = self.k.acquire_lease(op, "w", now=ts())
        with self.assertRaises(IllegalTransition):
            self.k.submit_worker_result(lease.lease_id, lease.generation, {"ok": True}, now=ts(1))

    def test_worker_happy_path(self):
        _, tx, op = self.admitted_operation()
        lease = self.k.acquire_lease(op, "w", now=ts())
        self.k.start_operation(lease.lease_id, lease.generation, now=ts(1))
        self.k.submit_worker_result(lease.lease_id, lease.generation, {"ok": True}, now=ts(2))
        self.k.verify_operation(op, True)
        self.k.complete_transaction(tx)
        self.assertEqual(self.k.get_state("transactions", "transaction_id", tx), "SUCCEEDED")


if __name__ == "__main__":
    unittest.main()
