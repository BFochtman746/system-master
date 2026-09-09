from __future__ import annotations

import io
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

import run_pilot001


class RealLearnerPilotEvidenceNoticeTests(unittest.TestCase):
    def test_default_participant_entrypoint_surfaces_local_no_upload_boundary_before_launcher(self):
        output = io.StringIO()
        with patch.object(run_pilot001.closed_loop, "main", return_value=0) as launch, redirect_stdout(output):
            result = run_pilot001.main()
        self.assertEqual(result, 0)
        launch.assert_called_once_with()
        rendered = output.getvalue()
        self.assertIn("Pilot evidence is stored locally on this machine by default", rendered)
        self.assertIn("does not automatically upload pilot evidence to GitHub", rendered)
        self.assertIn("raw participant free-text answers or direct PII", rendered)
        self.assertIn("external export or integrity anchoring is a separate controlled operation", rendered)


if __name__ == "__main__":
    unittest.main()
