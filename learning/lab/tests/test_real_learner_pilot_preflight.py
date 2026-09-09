from __future__ import annotations

import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from learning_lab import real_learner_pilot_preflight as preflight


def _blob_sha1(data: bytes) -> str:
    header = f"blob {len(data)}\0".encode("ascii")
    return hashlib.sha1(header + data).hexdigest()


class RealLearnerPilotPreflightTests(unittest.TestCase):
    def test_preflight_proves_environment_without_creating_participant_state(self):
        with tempfile.TemporaryDirectory() as td:
            state_root = Path(td) / "pilot-state"
            result = preflight.run_real_learner_pilot_preflight(state_root=state_root)

            self.assertEqual(result["status"], "PASS")
            self.assertEqual(result["standing"], "READY_FOR_EXPLICIT_PARTICIPANT_CONSENT")
            self.assertTrue(result["storage"]["state_root_outside_repository"])
            self.assertTrue(result["storage"]["state_root_writable"])
            self.assertEqual(result["storage"]["sqlite_roundtrip"], "PASS")
            self.assertTrue(result["storage"]["probe_files_removed"])
            self.assertFalse(result["privacy_boundary"]["participant_manifest_created"])
            self.assertFalse(result["privacy_boundary"]["participant_database_created"])
            self.assertFalse(result["privacy_boundary"]["raw_participant_response_collected"])
            self.assertFalse(result["privacy_boundary"]["participant_consent_created_or_inferred"])
            self.assertEqual(result["truth_boundary"]["human_participant_consent"], "NOT_PROVIDED")
            self.assertEqual(list(state_root.iterdir()), [])
            self.assertNotIn(str(state_root.resolve()), json.dumps(result, sort_keys=True))

    def test_preflight_rejects_state_root_inside_repository_before_writing(self):
        forbidden = preflight.repository_root() / "learning" / "lab" / "tests" / "pilot-preflight-forbidden"
        self.assertFalse(forbidden.exists())
        with self.assertRaisesRegex(
            preflight.RealLearnerPilotPreflightError,
            "PREFLIGHT_STATE_ROOT_INSIDE_REPOSITORY_FORBIDDEN",
        ):
            preflight.run_real_learner_pilot_preflight(state_root=forbidden)
        self.assertFalse(forbidden.exists())

    def test_preflight_fails_closed_on_frozen_authority_drift(self):
        with tempfile.TemporaryDirectory() as repo_td, tempfile.TemporaryDirectory() as state_td:
            fake_repo = Path(repo_td)
            subprocess.run(["git", "init"], cwd=fake_repo, capture_output=True, text=True, check=True)
            subprocess.run(["git", "config", "core.autocrlf", "true"], cwd=fake_repo, capture_output=True, text=True, check=True)

            relative = "learning/lab/LEARNING_LAB_PILOT_001_PROTOCOL.md"
            target = fake_repo / relative
            target.parent.mkdir(parents=True, exist_ok=True)

            canonical = b"frozen protocol\n"
            target.write_bytes(b"frozen protocol\r\n")
            expected = _blob_sha1(canonical)
            with patch.object(preflight, "_FROZEN_PILOT_BLOBS", {relative: expected}):
                result = preflight.run_real_learner_pilot_preflight(
                    state_root=Path(state_td) / "state-clean",
                    repo_root=fake_repo,
                )
                self.assertEqual(result["frozen_authority_blobs"][relative], expected)

                target.write_bytes(b"drifted protocol\r\n")
                with self.assertRaisesRegex(
                    preflight.RealLearnerPilotPreflightError,
                    "PREFLIGHT_FROZEN_AUTHORITY_DRIFT",
                ):
                    preflight.run_real_learner_pilot_preflight(
                        state_root=Path(state_td) / "state-drift",
                        repo_root=fake_repo,
                    )

    def test_preflight_fails_closed_on_protocol_or_retention_policy_drift(self):
        with tempfile.TemporaryDirectory() as td:
            with patch.object(preflight, "PROTOCOL_VERSION", "PILOT-001-v999"):
                with self.assertRaisesRegex(preflight.RealLearnerPilotPreflightError, "PREFLIGHT_PROTOCOL_VERSION_MISMATCH"):
                    preflight.run_real_learner_pilot_preflight(state_root=Path(td) / "state-a")
            with patch.object(preflight, "RETENTION_MINIMUM_DELAY_SECONDS", 1):
                with self.assertRaisesRegex(preflight.RealLearnerPilotPreflightError, "PREFLIGHT_RETENTION_POLICY_MISMATCH"):
                    preflight.run_real_learner_pilot_preflight(state_root=Path(td) / "state-b")


if __name__ == "__main__":
    unittest.main()
