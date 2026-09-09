from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import run_pilot001
import run_pilot001_closed_loop as app
from learning_lab.real_learner_pilot_preflight import RealLearnerPilotPreflightError
from learning_lab.real_learner_pilot_withdrawal import withdraw_runtime_bound_pilot


class RealLearnerPilotClosedLoopLauncherTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.root = Path(self.td.name).resolve()
        self.manifest = {
            "console_version": app.console.CONSOLE_VERSION,
            "protocol_version": app.console.PROTOCOL_VERSION,
            "pilot_id": "PILOT-LAUNCHER-0001",
            "participant_key": "LRN-LAUNCHER-0001",
            "state_key": "pilot_launcher_0001",
            "domain_key": "git",
            "course_id": "COURSE-LAUNCHER-0001",
            "next_turn_number": 3,
            "raw_response_persisted_by_console": False,
            "halted_reason": None,
            "withdrawn": False,
        }
        app.console.save_manifest(self.root, self.manifest)

    def tearDown(self):
        self.td.cleanup()

    def test_default_entrypoint_routes_to_closed_loop_console_and_safe_withdrawal(self):
        self.assertIs(run_pilot001.console, app.console)
        self.assertIs(app.console.mark_runtime_bound_pilot_withdrawn, withdraw_runtime_bound_pilot)

    def test_retention_wait_returns_without_preparing_or_collecting_response(self):
        wait = {
            "status": "PASS",
            "standing": "RETENTION_WAIT",
            "captured_turn_count": 2,
            "retention_not_before": 5000,
            "retention_seconds_remaining": 100,
            "participant_outcome": "INCOMPLETE",
            "eligible_for_effectiveness_review": False,
        }
        with patch.object(app, "closed_loop_status", return_value=wait), \
             patch.object(app.console, "prepare_human_pilot_turn") as prepare, \
             patch.object(app.console, "collect_and_submit") as collect, \
             patch.object(app.console, "now_seconds", return_value=4900):
            result = app.run_closed_loop(self.root, dict(self.manifest))
        self.assertEqual(result["standing"], "RETENTION_WAIT")
        prepare.assert_not_called()
        collect.assert_not_called()
        persisted = app.console.load_manifest(self.root, self.manifest["pilot_id"])
        self.assertEqual(persisted["next_turn_number"], 3)

    def test_wait_surface_never_collects_response_or_burns_turn_number(self):
        due = {
            "status": "PASS",
            "standing": "RETENTION_DUE",
            "captured_turn_count": 2,
            "participant_outcome": "INCOMPLETE",
            "eligible_for_effectiveness_review": False,
        }
        wait_after = {
            **due,
            "standing": "RETENTION_WAIT",
            "retention_not_before": 5000,
            "retention_seconds_remaining": 1,
        }
        turn = {
            "turn_id": "PILOT-LAUNCHER-0001-TURN-0003",
            "mode": "WAIT",
            "earliest_due_at": 5000,
            "response_required": False,
        }
        with patch.object(app, "closed_loop_status", side_effect=[due, wait_after]), \
             patch.object(app.console, "prepare_human_pilot_turn", return_value=turn), \
             patch.object(app.console, "collect_and_submit") as collect, \
             patch.object(app.console, "now_seconds", return_value=4999):
            result = app.run_closed_loop(self.root, dict(self.manifest))
        self.assertEqual(result["standing"], "RETENTION_WAIT")
        collect.assert_not_called()
        persisted = app.console.load_manifest(self.root, self.manifest["pilot_id"])
        self.assertEqual(persisted["next_turn_number"], 3)

    def test_completion_ready_terminalizes_and_writes_digest_only_package(self):
        ready = {
            "status": "PASS",
            "standing": "COMPLETION_READY",
            "captured_turn_count": 4,
            "participant_outcome": "INCOMPLETE",
            "eligible_for_effectiveness_review": False,
        }
        final = {
            "status": "PASS",
            "standing": "CLOSED_LOOP_COMPLETE",
            "record_digest": "a" * 64,
            "event_count": 9,
            "adjudication": {
                "participant_outcome": "CLOSED_LOOP_PASS",
                "eligible_for_effectiveness_review": True,
                "closed_loop_passed": True,
                "baseline_fraction": 0.0,
                "independent_verification_fraction": 1.0,
                "retention_fraction": 1.0,
                "transfer_fraction": 1.0,
                "observed_verification_minus_baseline": 1.0,
                "retention_delay_seconds": 3600,
            },
            "truth_boundary": {"real_learner_effectiveness": "NOT_PROVEN"},
        }
        with patch.object(app, "closed_loop_status", return_value=ready), \
             patch.object(app, "finalize_closed_loop_if_ready", return_value=final), \
             patch.object(app.console, "now_seconds", side_effect=[3800, 3801]):
            result = app.run_closed_loop(self.root, dict(self.manifest))
        self.assertEqual(result["adjudication"]["participant_outcome"], "CLOSED_LOOP_PASS")
        persisted = app.console.load_manifest(self.root, self.manifest["pilot_id"])
        self.assertTrue(persisted["completed"])
        self.assertEqual(persisted["completed_at"], 3801)
        package = json.loads(app.completion_package_path(self.root, self.manifest["pilot_id"]).read_text(encoding="utf-8"))
        self.assertEqual(package["record_digest"], "a" * 64)
        self.assertFalse(package["raw_response_included"])
        self.assertFalse(package["direct_pii_included"])
        rendered = json.dumps(package, sort_keys=True).lower()
        self.assertNotIn('"response":', rendered)
        self.assertNotIn('"raw_response":', rendered)

    def test_nonresponse_system_action_fails_closed_without_collecting_answer(self):
        status = {
            "status": "PASS",
            "standing": "TRANSFER_NONPASS_REMEDIATION_PENDING",
            "captured_turn_count": 4,
            "participant_outcome": "INCOMPLETE",
            "eligible_for_effectiveness_review": False,
        }
        turn = {
            "turn_id": "PILOT-LAUNCHER-0001-TURN-0003",
            "mode": "TRANSFER_REMEDIATION_REQUIRED",
            "response_required": False,
        }
        with patch.object(app, "closed_loop_status", return_value=status), \
             patch.object(app.console, "prepare_human_pilot_turn", return_value=turn), \
             patch.object(app.console, "collect_and_submit") as collect, \
             patch.object(app.console, "now_seconds", return_value=4000):
            with self.assertRaisesRegex(app.ClosedLoopLauncherError, "PILOT_NONRESPONSE_ACTION_REQUIRES_SYSTEM_ADJUDICATION"):
                app.run_closed_loop(self.root, dict(self.manifest))
        collect.assert_not_called()

    def test_new_participant_session_fails_before_presence_or_consent_if_preflight_fails(self):
        with patch.object(sys, "argv", ["run_pilot001.py", "--state-root", str(self.root), "--domain-key", "git"]), \
             patch.object(app, "run_real_learner_pilot_preflight", side_effect=RealLearnerPilotPreflightError("PREFLIGHT_BLOCKED")), \
             patch.object(app.console, "initialize") as initialize:
            self.assertEqual(app.main(), 2)
        initialize.assert_not_called()

    def test_preflight_only_never_initializes_participant_or_collects_response(self):
        result = {
            "standing": "READY_FOR_EXPLICIT_PARTICIPANT_CONSENT",
            "protocol_version": "PILOT-001-v1",
            "storage": {"sqlite_roundtrip": "PASS"},
        }
        with patch.object(sys, "argv", ["run_pilot001.py", "--state-root", str(self.root), "--preflight-only"]), \
             patch.object(app, "run_real_learner_pilot_preflight", return_value=result), \
             patch.object(app.console, "initialize") as initialize, \
             patch.object(app.console, "collect_and_submit") as collect:
            self.assertEqual(app.main(), 0)
        initialize.assert_not_called()
        collect.assert_not_called()

    def test_withdrawal_remains_available_without_passing_collection_preflight(self):
        with patch.object(sys, "argv", ["run_pilot001.py", "--state-root", str(self.root), "--withdraw-pilot-id", self.manifest["pilot_id"]]), \
             patch.object(app, "run_real_learner_pilot_preflight") as preflight, \
             patch.object(app.console, "withdraw") as withdraw:
            self.assertEqual(app.main(), 0)
        preflight.assert_not_called()
        withdraw.assert_called_once_with(self.root, self.manifest["pilot_id"])

    def test_status_remains_available_without_passing_collection_preflight(self):
        with patch.object(sys, "argv", ["run_pilot001.py", "--state-root", str(self.root), "--status-pilot-id", self.manifest["pilot_id"]]), \
             patch.object(app, "run_real_learner_pilot_preflight") as preflight, \
             patch.object(app, "status_only", return_value={"standing": "RETENTION_WAIT"}) as status:
            self.assertEqual(app.main(), 0)
        preflight.assert_not_called()
        status.assert_called_once_with(self.root, self.manifest["pilot_id"])


if __name__ == "__main__":
    unittest.main()
