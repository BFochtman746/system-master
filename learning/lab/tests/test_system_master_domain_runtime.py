from __future__ import annotations

import os
import tempfile
import unittest

import system_master_bridge as bridge
from learning_lab import FRACTION_DOMAIN_KEY, GIT_DOMAIN_KEY


class SystemMasterDomainRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.previous = os.environ.get("SYSTEM_MASTER_LEARNING_STATE_ROOT")
        os.environ["SYSTEM_MASTER_LEARNING_STATE_ROOT"] = self.tmp.name

    def tearDown(self):
        if self.previous is None:
            os.environ.pop("SYSTEM_MASTER_LEARNING_STATE_ROOT", None)
        else:
            os.environ["SYSTEM_MASTER_LEARNING_STATE_ROOT"] = self.previous
        self.tmp.cleanup()

    def request(self, *, request_id: str, domain_key: str, claimed: list[str], state_key: str = "impl018"):
        return {
            "operation": "START_ADAPTIVE_ENTRY",
            "request_id": request_id,
            "state_key": state_key,
            "learner_id": "LRN-IMPL018",
            "domain_key": domain_key,
            "claimed_skill_ids": claimed,
            "now": 0,
        }

    def test_generic_git_entry_preserves_hidden_prerequisite_probe(self):
        out = bridge.dispatch(self.request(
            request_id="REQ-GIT",
            domain_key=GIT_DOMAIN_KEY,
            claimed=["S-GIT-BRANCH-MERGE"],
        ))
        self.assertEqual(out["status"], "PASS")
        self.assertEqual(out["domain_key"], GIT_DOMAIN_KEY)
        self.assertIn("S-GIT-BRANCH-MERGE", out["course_skill_ids"])
        self.assertEqual(out["next_action"]["action_type"], "DIAGNOSTIC_PROBE")
        self.assertEqual(out["next_action"]["skill_id"], "S-GIT-STAGE-COMMIT")

    def test_fraction_entry_uses_same_adaptive_journey(self):
        out = bridge.dispatch(self.request(
            request_id="REQ-FRAC",
            domain_key=FRACTION_DOMAIN_KEY,
            claimed=["S-FRAC-ADD-SUB"],
        ))
        self.assertEqual(out["status"], "PASS")
        self.assertEqual(out["runtime_binding_version"], bridge.RUNTIME_BINDING_VERSION)
        self.assertEqual(out["domain_key"], FRACTION_DOMAIN_KEY)
        self.assertIn("S-FRAC-EQUIV-LCD", out["course_skill_ids"])
        self.assertIn("S-FRAC-ADD-SUB", out["course_skill_ids"])
        self.assertEqual(out["next_action"]["action_type"], "DIAGNOSTIC_PROBE")
        self.assertEqual(out["next_action"]["skill_id"], "S-FRAC-EQUIV-LCD")
        self.assertEqual(out["selected_authority"], "BASELINE_DIAGNOSTIC_ROUTING")

    def test_no_claim_fraction_entry_routes_to_instruction_without_new_mastery_authority(self):
        out = bridge.dispatch(self.request(
            request_id="REQ-FRAC-NOVICE",
            domain_key=FRACTION_DOMAIN_KEY,
            claimed=[],
        ))
        self.assertEqual(out["domain_key"], FRACTION_DOMAIN_KEY)
        self.assertEqual(out["next_action"]["action_type"], "TUTOR_INSTRUCTION")
        self.assertEqual(out["selected_authority"], "BASELINE_DIAGNOSTIC_ROUTING")

    def test_unknown_domain_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "UNSUPPORTED_DOMAIN"):
            bridge.dispatch(self.request(
                request_id="REQ-BAD-DOMAIN",
                domain_key="not-a-real-domain",
                claimed=[],
            ))

    def test_claimed_skill_must_belong_to_selected_course(self):
        with self.assertRaisesRegex(ValueError, "CLAIMED_SKILL_OUTSIDE_COURSE:S-GIT-BRANCH-MERGE"):
            bridge.dispatch(self.request(
                request_id="REQ-BAD-SKILL",
                domain_key=FRACTION_DOMAIN_KEY,
                claimed=["S-GIT-BRANCH-MERGE"],
            ))

    def test_duplicate_claimed_skill_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "DUPLICATE:claimed_skill_ids"):
            bridge.dispatch(self.request(
                request_id="REQ-DUP",
                domain_key=FRACTION_DOMAIN_KEY,
                claimed=["S-FRAC-ADD-SUB", "S-FRAC-ADD-SUB"],
            ))

    def test_exact_request_replay_is_stable(self):
        request = self.request(
            request_id="REQ-REPLAY",
            domain_key=FRACTION_DOMAIN_KEY,
            claimed=["S-FRAC-ADD-SUB"],
        )
        first = bridge.dispatch(request)
        replay = bridge.dispatch(request)
        self.assertEqual(first, replay)

    def test_request_id_reuse_across_domains_is_rejected(self):
        bridge.dispatch(self.request(
            request_id="REQ-SCOPE",
            domain_key=GIT_DOMAIN_KEY,
            claimed=[],
        ))
        with self.assertRaisesRegex(ValueError, "ADAPTIVE_ENTRY_JOURNEY_ID_REUSE"):
            bridge.dispatch(self.request(
                request_id="REQ-SCOPE",
                domain_key=FRACTION_DOMAIN_KEY,
                claimed=[],
            ))

    def test_legacy_git_operation_remains_compatible(self):
        out = bridge.dispatch({
            "operation": "START_GIT_ADAPTIVE_ENTRY",
            "request_id": "REQ-LEGACY-GIT",
            "state_key": "legacy",
            "learner_id": "LRN-LEGACY",
            "claimed_skill_ids": ["S-GIT-BRANCH-MERGE"],
            "now": 0,
        })
        self.assertEqual(out["domain_key"], GIT_DOMAIN_KEY)
        self.assertEqual(out["next_action"]["skill_id"], "S-GIT-STAGE-COMMIT")

    def test_two_domains_can_coexist_in_one_runtime_state(self):
        git = bridge.dispatch(self.request(
            request_id="REQ-COEXIST-GIT",
            domain_key=GIT_DOMAIN_KEY,
            claimed=[],
            state_key="coexist",
        ))
        fraction = bridge.dispatch(self.request(
            request_id="REQ-COEXIST-FRAC",
            domain_key=FRACTION_DOMAIN_KEY,
            claimed=[],
            state_key="coexist",
        ))
        self.assertNotEqual(git["course_id"], fraction["course_id"])
        self.assertEqual(git["domain_key"], GIT_DOMAIN_KEY)
        self.assertEqual(fraction["domain_key"], FRACTION_DOMAIN_KEY)


if __name__ == "__main__":
    unittest.main()
