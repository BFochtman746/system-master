from __future__ import annotations

import hashlib
import json
import tempfile
import threading
import unittest
from multiprocessing.context import AuthenticationError
from pathlib import Path

from controller_v2 import ControllerStore, new_uuid7
from controller_v2.intake import (
    MAX_FRAME_BYTES,
    CommandIntake,
    LocalCommandClient,
    LocalCommandServer,
    ProtocolError,
    local_endpoint_for_database,
)

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "schema" / "001_initial.sql"
POLICY = hashlib.sha256(b"foundation-005-policy").hexdigest()
AUTH = b"foundation-005-authentication-key-32-bytes-minimum"
BAD_AUTH = b"wrong-foundation-005-authentication-key-32-bytes"


class IntakeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "controller.db"
        self.store = ControllerStore(self.db, SCHEMA)
        self.store.initialize()
        self.store.register_repository(
            "repo-1",
            "BFochtman746",
            "system-master",
            "https://github.com/BFochtman746/system-master",
        )
        self.base = self.store.register_subject("repo-1", "a" * 40)
        self.ready = True
        self.intake = CommandIntake(
            self.store,
            caller_type="CHAT",
            caller_id="local-controller-client",
            controller_version="2.0.0-foundation-005",
            controller_commit_oid="d" * 40,
            policy_version="foundation-005-policy",
            policy_digest_sha256=POLICY,
            ready_check=lambda: self.ready,
        )
        self.instance_id = new_uuid7()

    def tearDown(self):
        self.tmp.cleanup()

    def request(self, **overrides):
        value = {
            "protocol_version": "1.0",
            "command_id": new_uuid7(),
            "command_type": "BUILD_CANDIDATE",
            "repository_id": "repo-1",
            "base_subject_id": self.base,
            "payload": {"objective": "foundation-005"},
        }
        value.update(overrides)
        return value

    @staticmethod
    def encode(value) -> bytes:
        return json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")

    @staticmethod
    def decode(frame: bytes):
        return json.loads(frame.decode("utf-8"))

    def counts(self):
        return self.store.counts()

    def test_valid_frame_creates_exactly_one_transaction_and_binds_server_identity(self):
        before = self.counts()
        response = self.decode(self.intake.handle_frame(self.encode(self.request())))
        after = self.counts()
        self.assertEqual(response["status"], "ACCEPTED")
        self.assertFalse(response["duplicate"])
        self.assertEqual(after["commands"], before["commands"] + 1)
        self.assertEqual(after["transactions"], before["transactions"] + 1)
        tx = self.store.get_transaction(response["transaction_id"])
        self.assertEqual(tx["controller_version"], "2.0.0-foundation-005")
        self.assertEqual(tx["controller_commit_oid"], "d" * 40)
        self.assertEqual(tx["policy_version"], "foundation-005-policy")
        self.assertEqual(tx["policy_digest_sha256"], POLICY)

    def test_exact_replay_returns_original_transaction(self):
        request = self.request()
        first = self.decode(self.intake.handle_frame(self.encode(request)))
        second = self.decode(self.intake.handle_frame(self.encode(request)))
        self.assertEqual(first["transaction_id"], second["transaction_id"])
        self.assertTrue(second["duplicate"])
        self.assertEqual(self.counts()["transactions"], 1)

    def test_command_id_semantic_reuse_conflicts_without_second_transaction(self):
        command_id = new_uuid7()
        first = self.request(command_id=command_id, payload={"objective": "one"})
        changed = self.request(command_id=command_id, payload={"objective": "two"})
        self.assertEqual(self.decode(self.intake.handle_frame(self.encode(first)))["status"], "ACCEPTED")
        response = self.decode(self.intake.handle_frame(self.encode(changed)))
        self.assertEqual(response, {"protocol_version": "1.0", "status": "ERROR", "error_code": "IDEMPOTENCY_CONFLICT"})
        self.assertEqual(self.counts()["transactions"], 1)

    def test_not_ready_rejects_without_mutation(self):
        self.ready = False
        before = self.counts()
        response = self.decode(self.intake.handle_frame(self.encode(self.request())))
        self.assertEqual(response["error_code"], "CONTROLLER_NOT_READY")
        self.assertEqual(self.counts(), before)

    def test_invalid_utf8_malformed_json_duplicate_keys_and_oversize_fail_closed(self):
        cases = [
            b"\xff",
            b"{not-json}",
            b'{"protocol_version":"1.0","protocol_version":"1.0"}',
            b"x" * (MAX_FRAME_BYTES + 1),
        ]
        for frame in cases:
            with self.subTest(frame_len=len(frame)):
                before = self.counts()
                response = self.decode(self.intake.handle_frame(frame))
                self.assertEqual(response["status"], "ERROR")
                self.assertEqual(self.counts(), before)

    def test_spoofable_or_unknown_fields_are_rejected(self):
        forbidden = (
            "caller_type",
            "caller_id",
            "controller_version",
            "controller_commit_oid",
            "policy_version",
            "policy_digest_sha256",
            "worker_id",
            "qualification_state",
            "promotion_state",
            "unexpected",
        )
        for field in forbidden:
            with self.subTest(field=field):
                before = self.counts()
                response = self.decode(
                    self.intake.handle_frame(self.encode(self.request(**{field: "spoof"})))
                )
                self.assertEqual(response["error_code"], "PROTOCOL_UNKNOWN_FIELD")
                self.assertEqual(self.counts(), before)

    def test_parent_relation_pairing_is_validated_before_mutation(self):
        for request in (
            self.request(parent_transaction_id=new_uuid7()),
            self.request(relation_to_parent="REPAIR"),
        ):
            before = self.counts()
            response = self.decode(self.intake.handle_frame(self.encode(request)))
            self.assertEqual(response["error_code"], "PROTOCOL_INVALID_REQUEST")
            self.assertEqual(self.counts(), before)

    def test_errors_do_not_expose_internal_exception_text(self):
        response = self.decode(self.intake.handle_frame(b"{not-json}"))
        self.assertEqual(set(response), {"protocol_version", "status", "error_code"})
        serialized = json.dumps(response).lower()
        self.assertNotIn("traceback", serialized)
        self.assertNotIn("jsondecode", serialized)

    def test_endpoint_is_stable_for_resolved_path_and_instance(self):
        alias = self.db.parent / "child" / ".." / self.db.name
        first = local_endpoint_for_database(self.db, self.instance_id)
        second = local_endpoint_for_database(alias, self.instance_id)
        self.assertEqual(first, second)
        other = local_endpoint_for_database(self.db, new_uuid7())
        self.assertNotEqual(first, other)

    def test_authkey_must_be_bytes_and_at_least_32_bytes(self):
        endpoint = local_endpoint_for_database(self.db, self.instance_id)
        for bad in (None, b"short", "not-bytes"):
            with self.subTest(bad=repr(bad)):
                with self.assertRaises((TypeError, ValueError)):
                    LocalCommandServer(self.intake, endpoint, bad)
                with self.assertRaises((TypeError, ValueError)):
                    LocalCommandClient(endpoint, bad)

    def test_authenticated_transport_submits_command(self):
        endpoint = local_endpoint_for_database(self.db, self.instance_id)
        server = LocalCommandServer(self.intake, endpoint, AUTH)
        errors = []
        thread = threading.Thread(target=lambda: self._serve_capture(server, errors), daemon=True)
        thread.start()
        try:
            response = LocalCommandClient(endpoint, AUTH).request(self.request())
        finally:
            thread.join(timeout=10)
            server.close()
        self.assertFalse(thread.is_alive())
        self.assertEqual(errors, [])
        self.assertEqual(response["status"], "ACCEPTED")
        self.assertEqual(self.counts()["transactions"], 1)

    def test_wrong_authkey_cannot_mutate_store(self):
        endpoint = local_endpoint_for_database(self.db, self.instance_id)
        server = LocalCommandServer(self.intake, endpoint, AUTH)
        errors = []
        thread = threading.Thread(target=lambda: self._serve_capture(server, errors), daemon=True)
        thread.start()
        before = self.counts()
        try:
            with self.assertRaises(AuthenticationError):
                LocalCommandClient(endpoint, BAD_AUTH).request(self.request())
        finally:
            thread.join(timeout=10)
            server.close()
        self.assertFalse(thread.is_alive())
        self.assertEqual(self.counts(), before)

    def test_authkey_is_not_persisted_or_returned(self):
        endpoint = local_endpoint_for_database(self.db, self.instance_id)
        server = LocalCommandServer(self.intake, endpoint, AUTH)
        errors = []
        thread = threading.Thread(target=lambda: self._serve_capture(server, errors), daemon=True)
        thread.start()
        try:
            response = LocalCommandClient(endpoint, AUTH).request(self.request())
        finally:
            thread.join(timeout=10)
            server.close()
        self.assertNotIn(AUTH, self.db.read_bytes())
        self.assertNotIn(AUTH.decode("utf-8"), json.dumps(response))
        self.assertNotIn(AUTH.decode("utf-8"), repr(endpoint))

    def test_intake_source_uses_byte_frames_and_has_no_provider_or_scheduler_runtime(self):
        text = (ROOT / "controller_v2" / "intake.py").read_text(encoding="utf-8")
        self.assertIn("send_bytes", text)
        self.assertIn("recv_bytes", text)
        forbidden = (
            ".send(",
            ".recv(",
            "pickle",
            "requests",
            "urllib",
            "api.github.com",
            "workflow_dispatch",
            "SECOND_SHIFT",
            "scheduler",
            "qualification_attempt",
            "promotion_attempt",
        )
        for token in forbidden:
            self.assertNotIn(token, text)

    @staticmethod
    def _serve_capture(server, errors):
        try:
            server.serve_once()
        except BaseException as exc:
            errors.append(exc)


if __name__ == "__main__":
    unittest.main()
