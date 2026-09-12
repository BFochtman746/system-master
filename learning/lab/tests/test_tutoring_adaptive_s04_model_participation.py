from __future__ import annotations

import unittest

from learning_lab.adaptive_policy import evaluate_adaptive_candidates


def candidate(candidate_id: str, reason_code: str):
    return {
        "candidate_id": candidate_id,
        "action_type": candidate_id,
        "reason_codes": [reason_code],
        "eligible": True,
        "blocker_reason_codes": [],
        "curriculum_order": 0,
    }


class AdaptiveModelParticipationBoundaryS04Tests(unittest.TestCase):
    def test_model_does_not_participate_when_deterministic_priority_has_winner(self):
        values = [
            candidate("retain", "RETENTION_DUE"),
            candidate("next", "CURRICULUM_NEXT"),
        ]
        out = evaluate_adaptive_candidates(
            values,
            model_scores={"retain": 0.1, "next": 0.9},
            model_calibrated=True,
            model_approved=True,
        )
        self.assertEqual(out["selected_action"]["candidate_id"], "retain")
        self.assertFalse(out["decision_trace"]["model_participated"])

    def test_model_participates_only_when_resolving_eligible_priority_tie(self):
        values = [
            candidate("a", "CURRICULUM_NEXT"),
            candidate("b", "CURRICULUM_NEXT"),
        ]
        out = evaluate_adaptive_candidates(
            values,
            model_scores={"a": 0.1, "b": 0.9},
            model_calibrated=True,
            model_approved=True,
        )
        self.assertEqual(out["selected_action"]["candidate_id"], "b")
        self.assertTrue(out["decision_trace"]["model_participated"])


if __name__ == "__main__":
    unittest.main()
