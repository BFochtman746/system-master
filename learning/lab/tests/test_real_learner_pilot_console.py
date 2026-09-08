from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import run_pilot001
import run_pilot001_real_participant as console
from learning_lab import GIT_DOMAIN_KEY, Repository
from learning_lab.real_learner_pilot_withdrawal import withdraw_runtime_bound_pilot


class RealLearnerPilotConsoleTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.root = Path(self.td.name).resolve()
        # Importing the participant-facing launcher must wire the safe withdrawal boundary.
        self.assertIs(run_pilot001.console.mark_runtime_bound_pilot_withdrawn, withdraw_runtime_bound_pilot)

    def tearDown(self):
        self.td.cleanup()

    def test_initialize_requires_exact_participant_consent_before_runtime_state(self):
        with patch("builtins.input", side_effect=["PARTICIPANT PRESENT", "not consent"]):
            with self.assertRaisesRegex(console.ConsoleError, "EXPLICIT_PARTICIPANT_CONSENT_NOT_PROVIDED"):
                console.initialize(self.root, GIT_DOMAIN_KEY)
        self.assertEqual(list(self.root.iterdir()), [])

    def test_initialize_uses_first_frozen_course_skill_and_pseudonymous_manifest(self):
        with patch("builtins.input", side_effect=["PARTICIPANT PRESENT", console.CONSENT_TOKEN]), \
             patch.object(console, "now_seconds", return_value=100):
            manifest = console.initialize(self.root, GIT_DOMAIN_KEY)
        repo = console.repository(self.root, manifest["state_key"])
        course = repo.get_object("course", manifest["course_id"], 1)
        self.assertEqual(manifest["baseline_selection_policy"], "FIRST_FROZEN_COURSE_SKILL")
        self.assertEqual(manifest["baseline_skill_id"], course["skills"][0]["skill_id"])
        self.assertTrue(manifest["consent_recorded"])
        self.assertFalse(manifest["raw_response_persisted_by_console"])
        rendered = json.dumps(manifest, sort_keys=True).lower()
        for forbidden in ("name", "email", "phone", "address", "raw_response", console.CONSENT_TOKEN.lower()):
            self.assertNotIn(forbidden, rendered)
        self.assertTrue(console.manifest_path(self.root, manifest["pilot_id"]).is_file())
        self.assertTrue((self.root / f"{manifest['state_key']}.sqlite3").is_file())

    def test_stage_one_does_not_query_adjudication_before_first_submitted_turn(self):
        manifest = {
            "pilot_id": "PILOT-TEST-FIRST-TURN",
            "state_key": "pilot_test_first",
            "next_turn_number": 1,
            "withdrawn": False,
            "halted_reason": None,
        }
        fake_turn = {
            "turn_id": "PILOT-TEST-FIRST-TURN-TURN-0001",
            "turn_binding_digest": "0" * 64,
            "mode": "EVIDENCE",
            "action": {"action_type": "DIAGNOSTIC_PROBE"},
            "prompt": "Qualification-only prompt",
        }
        with patch.object(console, "stage_one_status", side_effect=AssertionError("must not run before baseline receipt")), \
             patch.object(console, "prepare_human_pilot_turn", return_value=fake_turn), \
             patch.object(console, "present_turn"), \
             patch.object(console, "collect_and_submit", side_effect=console.ConsoleError("TEST_STOP")):
            with self.assertRaisesRegex(console.ConsoleError, "TEST_STOP"):
                console.run_stage_one(self.root, manifest)

    def test_contaminated_independent_item_locks_manifest_against_retry(self):
        manifest = {
            "console_version": console.CONSOLE_VERSION,
            "protocol_version": console.PROTOCOL_VERSION,
            "pilot_id": "PILOT-TEST-CONTAMINATED",
            "participant_key": "LRN-TEST-CONTAMINATED",
            "state_key": "pilot_test_contaminated",
            "next_turn_number": 1,
            "withdrawn": False,
            "halted_reason": None,
        }
        console.save_manifest(self.root, manifest)
        fake_turn = {
            "turn_id": "PILOT-TEST-CONTAMINATED-TURN-0001",
            "turn_binding_digest": "0" * 64,
            "mode": "EVIDENCE",
            "action": {"action_type": "DIAGNOSTIC_PROBE"},
            "prompt": "Qualification-only prompt",
        }
        with patch.object(console, "prepare_human_pilot_turn", return_value=fake_turn), \
             patch.object(console, "present_turn"), \
             patch.object(console, "collect_and_submit", side_effect=console.ConsoleError("INDEPENDENT_ITEM_CONTAMINATED")):
            with self.assertRaisesRegex(console.ConsoleError, "INDEPENDENT_ITEM_CONTAMINATED"):
                console.run_stage_one(self.root, manifest)
        persisted = console.load_manifest(self.root, manifest["pilot_id"])
        self.assertEqual(persisted["halted_reason"], "INDEPENDENT_ITEM_CONTAMINATED")
        with self.assertRaisesRegex(console.ConsoleError, "PILOT_REQUIRES_INVESTIGATOR_ADJUDICATION"):
            console.run_stage_one(self.root, persisted)

    def test_prebaseline_withdrawal_uses_safe_wrapper_and_marks_manifest(self):
        with patch("builtins.input", side_effect=["PARTICIPANT PRESENT", console.CONSENT_TOKEN]), \
             patch.object(console, "now_seconds", return_value=100):
            manifest = console.initialize(self.root, GIT_DOMAIN_KEY)

        # run_pilot001 import wires console withdrawal to the additive safe boundary.
        self.assertIs(console.mark_runtime_bound_pilot_withdrawn, withdraw_runtime_bound_pilot)
        with patch("builtins.input", return_value=console.WITHDRAW_TOKEN), \
             patch.object(console, "now_seconds", return_value=101):
            console.withdraw(self.root, manifest["pilot_id"])

        persisted = console.load_manifest(self.root, manifest["pilot_id"])
        self.assertTrue(persisted["withdrawn"])
        repo = Repository(str(self.root / f"{manifest['state_key']}.sqlite3"))
        latest = repo.get_latest_object("real_learner_pilot_runtime_binding", manifest["pilot_id"])
        self.assertEqual(latest["terminal"]["kind"], "WITHDRAWN")
        self.assertEqual(latest["terminal"]["stage"], "PRE_BASELINE")
        self.assertEqual(latest["turn_receipts"], [])

    def test_wrong_withdrawal_phrase_does_not_change_binding(self):
        with patch("builtins.input", side_effect=["PARTICIPANT PRESENT", console.CONSENT_TOKEN]), \
             patch.object(console, "now_seconds", return_value=100):
            manifest = console.initialize(self.root, GIT_DOMAIN_KEY)
        with patch("builtins.input", return_value="cancel"):
            with self.assertRaisesRegex(console.ConsoleError, "EXPLICIT_PARTICIPANT_WITHDRAWAL_NOT_PROVIDED"):
                console.withdraw(self.root, manifest["pilot_id"])
        repo = Repository(str(self.root / f"{manifest['state_key']}.sqlite3"))
        latest = repo.get_latest_object("real_learner_pilot_runtime_binding", manifest["pilot_id"])
        self.assertIsNone(latest["terminal"])


if __name__ == "__main__":
    unittest.main()
