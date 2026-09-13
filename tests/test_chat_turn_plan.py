import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.chat_turn_plan import PLAN_NAME, ChatTurnPlanError, build, verify

ROOT = Path(__file__).resolve().parents[1]


class ChatTurnPlanTests(unittest.TestCase):
    def _spec(self, root: Path) -> Path:
        spec = root / "chat.json"
        spec.write_text(json.dumps({
            "schema_version": "CHAT-TURN-SPEC-1.0",
            "turn_id": "turn-001",
            "conversation_ref": "conversation-001",
            "messages": [
                {"id": "m1", "role": "system", "content": "Operate within admitted System Master authority."},
                {"id": "m2", "role": "assistant", "content": "Prior local response context."},
                {"id": "m3", "role": "user", "content": "Continue the current Foundation repair."}
            ]
        }, indent=2) + "\n", encoding="utf-8")
        return spec

    def test_repeat_build_is_deterministic(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); spec = self._spec(root)
            first = build(spec, root / "a", repo_root=ROOT)
            second = build(spec, root / "b", repo_root=ROOT)
            self.assertEqual(first["plan_sha256"], second["plan_sha256"])
            self.assertEqual((root / "a" / PLAN_NAME).read_bytes(), (root / "b" / PLAN_NAME).read_bytes())

    def test_plan_binds_c04_current_owner(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); plan = build(self._spec(root), root / "out", repo_root=ROOT)
            self.assertEqual(plan["owner"], "SYSTEM_MASTER/CORE")
            self.assertEqual(plan["authority_binding"]["owner_path"], "SYSTEM_MASTER/CORE")
            verify(root / "out", repo_root=ROOT)

    def test_message_order_and_content_are_preserved(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); plan = build(self._spec(root), root / "out", repo_root=ROOT)
            self.assertEqual([m["sequence"] for m in plan["messages"]], [1, 2, 3])
            self.assertEqual([m["role"] for m in plan["messages"]], ["system", "assistant", "user"])
            self.assertEqual(plan["messages"][-1]["content"], "Continue the current Foundation repair.")

    def test_final_message_must_be_user_request(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); spec = self._spec(root); obj = json.loads(spec.read_text())
            obj["messages"][-1]["role"] = "assistant"; spec.write_text(json.dumps(obj))
            with self.assertRaisesRegex(ChatTurnPlanError, "final message"):
                build(spec, root / "out", repo_root=ROOT)

    def test_duplicate_message_id_fails_closed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); spec = self._spec(root); obj = json.loads(spec.read_text())
            obj["messages"][1]["id"] = "m1"; spec.write_text(json.dumps(obj))
            with self.assertRaisesRegex(ChatTurnPlanError, "duplicate message id"):
                build(spec, root / "out", repo_root=ROOT)

    def test_unknown_fields_fail_closed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); spec = self._spec(root); obj = json.loads(spec.read_text())
            obj["messages"][0]["tool_call"] = {"name": "forbidden"}; spec.write_text(json.dumps(obj))
            with self.assertRaisesRegex(ChatTurnPlanError, "fields must be exactly"):
                build(spec, root / "out", repo_root=ROOT)

    def test_invalid_role_fails_closed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); spec = self._spec(root); obj = json.loads(spec.read_text())
            obj["messages"][0]["role"] = "tool"; spec.write_text(json.dumps(obj))
            with self.assertRaisesRegex(ChatTurnPlanError, "role is not admitted"):
                build(spec, root / "out", repo_root=ROOT)

    def test_symlinked_spec_parent_fails_closed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); real = root / "real"; real.mkdir(); spec = self._spec(real); linked = root / "linked"
            try:
                os.symlink(real, linked, target_is_directory=True)
            except (OSError, NotImplementedError):
                self.skipTest("directory symlinks unavailable on this platform")
            with self.assertRaisesRegex(ChatTurnPlanError, "may not traverse symlinks"):
                build(linked / spec.name, root / "out", repo_root=ROOT)

    def test_symlinked_output_parent_fails_closed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); spec = self._spec(root); real = root / "real-output"; real.mkdir(); linked = root / "linked-output"
            try:
                os.symlink(real, linked, target_is_directory=True)
            except (OSError, NotImplementedError):
                self.skipTest("directory symlinks unavailable on this platform")
            with self.assertRaisesRegex(ChatTurnPlanError, "may not traverse symlinks"):
                build(spec, linked / "out", repo_root=ROOT)

    def test_tampered_plan_fails_verification(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); out = root / "out"; build(self._spec(root), out, repo_root=ROOT)
            path = out / PLAN_NAME; obj = json.loads(path.read_text()); obj["turn_id"] = "tampered"; path.write_text(json.dumps(obj))
            with self.assertRaisesRegex(ChatTurnPlanError, "plan_sha256"):
                verify(out, repo_root=ROOT)

    def test_rehashed_authority_escalation_still_fails(self):
        from tools.chat_turn_plan import _canonical, _sha
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); out = root / "out"; build(self._spec(root), out, repo_root=ROOT)
            path = out / PLAN_NAME; obj = json.loads(path.read_text())
            obj["authority_boundary"]["tool_execution_authority"] = "GRANTED"
            body = dict(obj); body.pop("plan_sha256")
            obj["plan_sha256"] = _sha(_canonical(body)); path.write_text(json.dumps(obj))
            with self.assertRaisesRegex(ChatTurnPlanError, "authority boundary"):
                verify(out, repo_root=ROOT)

    def test_existing_output_is_not_destroyed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); spec = self._spec(root); out = root / "out"; out.mkdir(); marker = out / "keep"; marker.write_text("yes")
            with self.assertRaisesRegex(ChatTurnPlanError, "already exists"):
                build(spec, out, repo_root=ROOT)
            self.assertEqual(marker.read_text(), "yes")

    def test_boundary_denies_runtime_and_side_effect_authority(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); plan = build(self._spec(root), root / "out", repo_root=ROOT); boundary = plan["authority_boundary"]
            self.assertEqual(boundary["model_execution_authority"], "NOT_GRANTED")
            self.assertFalse(boundary["provider_api_access"])
            self.assertFalse(boundary["network_access"])
            self.assertEqual(boundary["credentials_authority"], "NOT_GRANTED")
            self.assertEqual(boundary["tool_execution_authority"], "NOT_GRANTED")
            self.assertEqual(boundary["connector_execution_authority"], "NOT_GRANTED")
            self.assertEqual(boundary["memory_write_authority"], "NOT_GRANTED")
            self.assertEqual(boundary["conversation_persistence_authority"], "NOT_GRANTED")
            self.assertEqual(boundary["autonomous_send_authority"], "NOT_GRANTED")
            self.assertFalse(boundary["external_side_effects"])

    def test_cli_exposes_no_runtime_or_side_effect_commands(self):
        script = ROOT / "tools" / "chat_turn_plan.py"
        for command in ("run", "execute", "send", "connect", "login", "tool", "memory", "persist", "publish"):
            result = subprocess.run([sys.executable, str(script), command], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("invalid choice", result.stderr)


if __name__ == "__main__":
    unittest.main()
