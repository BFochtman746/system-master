import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.calendar_action_plan import PLAN_NAME, CalendarActionPlanError, build, verify

ROOT = Path(__file__).resolve().parents[1]


class CalendarActionPlanTests(unittest.TestCase):
    def _spec(self, root: Path) -> Path:
        spec = root / "calendar.json"
        spec.write_text(json.dumps({
            "schema_version": "CALENDAR-ACTION-SPEC-1.0",
            "intent_id": "foundation-calendar",
            "name": "Foundation Calendar",
            "calendar_ref": "primary",
            "actions": [
                {"id": "create", "type": "CREATE_EVENT", "event": {"title": "Design review", "start": "2026-09-14T13:00:00-04:00", "end": "2026-09-14T14:00:00-04:00", "location": "Conference room"}},
                {"id": "update", "type": "UPDATE_EVENT", "event_id": "evt-001", "changes": {"title": "Design review - revised"}},
                {"id": "delete", "type": "DELETE_EVENT", "event_id": "evt-002", "reason": "Duplicate"},
            ],
        }, indent=2) + "\n", encoding="utf-8")
        return spec

    def test_repeat_build_is_deterministic(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); spec = self._spec(root)
            first = build(spec, root / "a", repo_root=ROOT)
            second = build(spec, root / "b", repo_root=ROOT)
            self.assertEqual(first["plan_sha256"], second["plan_sha256"])
            self.assertEqual((root / "a" / PLAN_NAME).read_bytes(), (root / "b" / PLAN_NAME).read_bytes())

    def test_plan_binds_c03_current_owner(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); plan = build(self._spec(root), root / "out", repo_root=ROOT)
            self.assertEqual(plan["owner"], "SYSTEM_MASTER/CONNECTED_ACTIONS")
            self.assertEqual(plan["authority_binding"]["owner_path"], "SYSTEM_MASTER/CONNECTED_ACTIONS")
            verify(root / "out", repo_root=ROOT)

    def test_all_calendar_writes_require_runtime_and_user_authority(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); plan = build(self._spec(root), root / "out", repo_root=ROOT)
            for action in plan["actions"]:
                self.assertFalse(action["execution_permitted_by_foundation"])
                self.assertEqual(action["authority_requirement"], "SEPARATE_CALENDAR_RUNTIME_AND_USER_AUTHORITY_REQUIRED")

    def test_create_requires_offset_timestamps_and_positive_duration(self):
        bad_pairs = [
            ("2026-09-14T13:00:00", "2026-09-14T14:00:00"),
            ("2026-09-14T14:00:00-04:00", "2026-09-14T13:00:00-04:00"),
        ]
        for start, end in bad_pairs:
            with self.subTest(start=start, end=end), tempfile.TemporaryDirectory() as td:
                root = Path(td); spec = self._spec(root); obj = json.loads(spec.read_text())
                obj["actions"] = [{"id": "create", "type": "CREATE_EVENT", "event": {"title": "Bad", "start": start, "end": end}}]
                spec.write_text(json.dumps(obj))
                with self.assertRaises(CalendarActionPlanError):
                    build(spec, root / "out", repo_root=ROOT)

    def test_update_time_requires_start_and_end_together(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); spec = self._spec(root); obj = json.loads(spec.read_text())
            obj["actions"] = [{"id": "update", "type": "UPDATE_EVENT", "event_id": "evt-001", "changes": {"start": "2026-09-14T13:00:00-04:00"}}]
            spec.write_text(json.dumps(obj))
            with self.assertRaisesRegex(CalendarActionPlanError, "start and end together"):
                build(spec, root / "out", repo_root=ROOT)

    def test_symlinked_spec_parent_fails_closed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            real = root / "real"
            real.mkdir()
            spec = self._spec(real)
            linked = root / "linked"
            try:
                os.symlink(real, linked, target_is_directory=True)
            except (OSError, NotImplementedError):
                self.skipTest("directory symlinks unavailable on this platform")
            with self.assertRaisesRegex(CalendarActionPlanError, "may not traverse symlinks"):
                build(linked / spec.name, root / "out", repo_root=ROOT)

    def test_symlinked_output_parent_fails_closed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            spec = self._spec(root)
            real = root / "real-output-parent"
            real.mkdir()
            linked = root / "linked-output-parent"
            try:
                os.symlink(real, linked, target_is_directory=True)
            except (OSError, NotImplementedError):
                self.skipTest("directory symlinks unavailable on this platform")
            with self.assertRaisesRegex(CalendarActionPlanError, "may not traverse symlinks"):
                build(spec, linked / "out", repo_root=ROOT)

    def test_unknown_action_fields_fail_closed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); spec = self._spec(root); obj = json.loads(spec.read_text())
            obj["actions"][0]["send_invites"] = True; spec.write_text(json.dumps(obj))
            with self.assertRaisesRegex(CalendarActionPlanError, "unknown fields"):
                build(spec, root / "out", repo_root=ROOT)

    def test_duplicate_action_id_fails_closed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); spec = self._spec(root); obj = json.loads(spec.read_text())
            obj["actions"][1]["id"] = "create"; spec.write_text(json.dumps(obj))
            with self.assertRaisesRegex(CalendarActionPlanError, "duplicate action id"):
                build(spec, root / "out", repo_root=ROOT)

    def test_tampered_plan_fails_verification(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); out = root / "out"; build(self._spec(root), out, repo_root=ROOT)
            path = out / PLAN_NAME; obj = json.loads(path.read_text()); obj["name"] = "tampered"; path.write_text(json.dumps(obj))
            with self.assertRaisesRegex(CalendarActionPlanError, "plan_sha256"):
                verify(out, repo_root=ROOT)

    def test_rehashed_authority_escalation_still_fails(self):
        from tools.calendar_action_plan import _canonical, _sha
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); out = root / "out"; build(self._spec(root), out, repo_root=ROOT)
            path = out / PLAN_NAME; obj = json.loads(path.read_text())
            obj["actions"][0]["authority_requirement"] = "NONE"
            body = dict(obj); body.pop("plan_sha256")
            obj["plan_sha256"] = _sha(_canonical(body)); path.write_text(json.dumps(obj))
            with self.assertRaisesRegex(CalendarActionPlanError, "authority requirement"):
                verify(out, repo_root=ROOT)

    def test_existing_output_is_not_destroyed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); spec = self._spec(root); out = root / "out"; out.mkdir(); marker = out / "keep"; marker.write_text("yes")
            with self.assertRaisesRegex(CalendarActionPlanError, "already exists"):
                build(spec, out, repo_root=ROOT)
            self.assertEqual(marker.read_text(), "yes")

    def test_boundary_denies_provider_network_credentials_and_writes(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); plan = build(self._spec(root), root / "out", repo_root=ROOT)
            boundary = plan["authority_boundary"]
            self.assertEqual(boundary["calendar_execution_authority"], "NOT_GRANTED")
            self.assertFalse(boundary["provider_api_access"])
            self.assertFalse(boundary["network_access"])
            self.assertEqual(boundary["credentials_authority"], "NOT_GRANTED")
            self.assertEqual(boundary["account_authority"], "NOT_GRANTED")
            self.assertEqual(boundary["calendar_write_authority"], "NOT_GRANTED")
            self.assertEqual(boundary["invitation_send_authority"], "NOT_GRANTED")
            self.assertEqual(boundary["notification_authority"], "NOT_GRANTED")

    def test_cli_exposes_no_calendar_execution_commands(self):
        script = ROOT / "tools" / "calendar_action_plan.py"
        for command in ("run", "execute", "create", "update", "delete", "sync", "connect", "login"):
            result = subprocess.run([sys.executable, str(script), command], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("invalid choice", result.stderr)


if __name__ == "__main__":
    unittest.main()
