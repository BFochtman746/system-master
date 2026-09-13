import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.browser_action_plan import PLAN_NAME, BrowserActionPlanError, build, verify

ROOT = Path(__file__).resolve().parents[1]


class BrowserActionPlanTests(unittest.TestCase):
    def _spec(self, root: Path) -> Path:
        spec = root / "browser.json"
        spec.write_text(json.dumps({
            "schema_version": "BROWSER-ACTION-SPEC-1.0",
            "intent_id": "foundation-browser",
            "name": "Foundation Browser",
            "target_url": "https://example.com/reference?mode=test",
            "actions": [
                {"id": "navigate", "type": "NAVIGATE"},
                {"id": "extract", "type": "EXTRACT_TEXT", "selector": "main h1"},
                {"id": "click", "type": "CLICK", "selector": "a[data-action='details']"},
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

    def test_plan_binds_c02_current_owner(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); plan = build(self._spec(root), root / "out", repo_root=ROOT)
            self.assertEqual(plan["owner"], "SYSTEM_MASTER/CONNECTED_ACTIONS")
            self.assertEqual(plan["authority_binding"]["owner_path"], "SYSTEM_MASTER/CONNECTED_ACTIONS")
            verify(root / "out", repo_root=ROOT)

    def test_click_requires_separate_runtime_and_user_authority(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); plan = build(self._spec(root), root / "out", repo_root=ROOT)
            click = next(action for action in plan["actions"] if action["type"] == "CLICK")
            self.assertFalse(click["execution_permitted_by_foundation"])
            self.assertEqual(click["authority_requirement"], "SEPARATE_BROWSER_RUNTIME_AND_USER_AUTHORITY_REQUIRED")

    def test_non_https_and_embedded_credentials_fail_closed(self):
        for url in ("http://example.com/", "file:///tmp/x", "https://user:pass@example.com/"):
            with self.subTest(url=url), tempfile.TemporaryDirectory() as td:
                root = Path(td); spec = self._spec(root); obj = json.loads(spec.read_text())
                obj["target_url"] = url; spec.write_text(json.dumps(obj))
                with self.assertRaises(BrowserActionPlanError):
                    build(spec, root / "out", repo_root=ROOT)

    def test_unknown_action_payload_fields_fail_closed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); spec = self._spec(root); obj = json.loads(spec.read_text())
            obj["actions"][2]["value"] = "secret"; spec.write_text(json.dumps(obj))
            with self.assertRaisesRegex(BrowserActionPlanError, "unknown fields"):
                build(spec, root / "out", repo_root=ROOT)

    def test_duplicate_action_id_fails_closed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); spec = self._spec(root); obj = json.loads(spec.read_text())
            obj["actions"][1]["id"] = "navigate"; spec.write_text(json.dumps(obj))
            with self.assertRaisesRegex(BrowserActionPlanError, "duplicate action id"):
                build(spec, root / "out", repo_root=ROOT)

    def test_tampered_plan_fails_verification(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); out = root / "out"; build(self._spec(root), out, repo_root=ROOT)
            path = out / PLAN_NAME; obj = json.loads(path.read_text()); obj["name"] = "tampered"; path.write_text(json.dumps(obj))
            with self.assertRaisesRegex(BrowserActionPlanError, "plan_sha256"):
                verify(out, repo_root=ROOT)

    def test_rehashed_click_authority_escalation_still_fails(self):
        from tools.browser_action_plan import _canonical, _sha
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); out = root / "out"; build(self._spec(root), out, repo_root=ROOT)
            path = out / PLAN_NAME; obj = json.loads(path.read_text())
            click = next(action for action in obj["actions"] if action["type"] == "CLICK")
            click["authority_requirement"] = "SEPARATE_BROWSER_RUNTIME_ADMISSION_REQUIRED"
            body = dict(obj); body.pop("plan_sha256")
            obj["plan_sha256"] = _sha(_canonical(body)); path.write_text(json.dumps(obj))
            with self.assertRaisesRegex(BrowserActionPlanError, "authority requirement"):
                verify(out, repo_root=ROOT)

    def test_existing_output_is_not_destroyed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); spec = self._spec(root); out = root / "out"; out.mkdir(); marker = out / "keep"; marker.write_text("yes")
            with self.assertRaisesRegex(BrowserActionPlanError, "already exists"):
                build(spec, out, repo_root=ROOT)
            self.assertEqual(marker.read_text(), "yes")

    def test_manifest_denies_runtime_network_and_credentials(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); plan = build(self._spec(root), root / "out", repo_root=ROOT)
            boundary = plan["authority_boundary"]
            self.assertEqual(boundary["browser_execution_authority"], "NOT_GRANTED")
            self.assertFalse(boundary["network_access"])
            self.assertEqual(boundary["credentials_authority"], "NOT_GRANTED")
            self.assertEqual(boundary["cookies_or_session_authority"], "NOT_GRANTED")
            self.assertEqual(boundary["form_submission_authority"], "NOT_GRANTED")

    def test_cli_exposes_no_browser_execution_commands(self):
        script = ROOT / "tools" / "browser_action_plan.py"
        for command in ("run", "open", "click", "execute", "browser", "launch", "navigate"):
            result = subprocess.run([sys.executable, str(script), command], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("invalid choice", result.stderr)


if __name__ == "__main__":
    unittest.main()
