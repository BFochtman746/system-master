from __future__ import annotations

import os
import tempfile
import unittest

from learning_lab.adaptive_mastery_binding import _s03_bound_compute_projection
from learning_lab.adaptive_policy import (
    ADAPTIVE_POLICY_VERSION,
    AdaptivePolicyError,
    candidate_from_next_action,
    evaluate_adaptive_candidates,
    record_adaptive_decision,
)
from learning_lab.instructional_policy import (
    INSTRUCTIONAL_POLICY_VERSION,
    SUPPORT_LADDER,
    InstructionalPolicyError,
    choose_instructional_strategy,
    validate_tutor_move_against_policy,
)
from learning_lab.repository import Repository


def candidate(cid, reason, *, eligible=True, blockers=None, order=0):
    return {
        "candidate_id": cid,
        "action_type": cid,
        "reason_codes": [reason],
        "eligible": eligible,
        "blocker_reason_codes": list(blockers or []),
        "curriculum_order": order,
    }


class InstructionalPolicyS04Tests(unittest.TestCase):
    def test_policy_version_is_exact_and_pinned(self):
        out = choose_instructional_strategy()
        self.assertEqual(out["policy_version"], INSTRUCTIONAL_POLICY_VERSION)

    def test_support_ladder_contains_required_distinct_levels(self):
        required = {"QUESTION_PROMPT", "NUDGE", "HINT", "CLUE", "PARTIAL_STEP", "WORKED_EXAMPLE", "DIRECT_EXPLANATION", "DIRECT_ANSWER"}
        self.assertTrue(required.issubset(set(SUPPORT_LADDER)))
        self.assertEqual(len(SUPPORT_LADDER), len(set(SUPPORT_LADDER)))

    def test_least_help_first_default(self):
        out = choose_instructional_strategy()
        self.assertEqual(out["strategy"], "QUESTION_PROMPT")
        self.assertIn("LEAST_HELP_FIRST_POLICY", out["reason_codes"])

    def test_requested_stronger_help_stays_policy_bounded(self):
        self.assertEqual(choose_instructional_strategy(requested_help_level=5)["strategy"], "WORKED_EXAMPLE")
        self.assertEqual(choose_instructional_strategy(requested_help_level=99)["strategy"], "DIRECT_EXPLANATION")

    def test_correct_with_support_fades_scaffold(self):
        out = choose_instructional_strategy(learner_correct=True, prior_support_level=5)
        self.assertEqual(out["strategy"], "QUESTION_PROMPT")
        self.assertIn("SCAFFOLD_FADE", out["reason_codes"])

    def test_learner_can_request_independent_attempt(self):
        out = choose_instructional_strategy(learner_requests_independent=True, prior_support_level=7)
        self.assertEqual(out["assistance_condition"], "INDEPENDENT")
        self.assertIn("LEARNER_REQUESTED_INDEPENDENT_ATTEMPT", out["reason_codes"])

    def test_assessment_blocks_direct_answer_and_steps(self):
        out = choose_instructional_strategy(requested_strategy="DIRECT_ANSWER", assessment_active=True, direct_answer_allowed_by_curriculum=True)
        self.assertEqual(out["strategy"], "QUESTION_PROMPT")
        self.assertFalse(out["direct_answer_permitted"])
        self.assertIn("HINTS_AND_STEPS_WITHHELD", out["reason_codes"])

    def test_independent_evidence_blocks_direct_answer(self):
        out = choose_instructional_strategy(requested_strategy="DIRECT_ANSWER", independent_evidence_active=True, direct_answer_allowed_by_curriculum=True)
        self.assertFalse(out["direct_answer_permitted"])
        self.assertIn("INDEPENDENT_EVIDENCE_BOUNDARY", out["reason_codes"])

    def test_accommodation_is_distinct_from_scaffold(self):
        out = choose_instructional_strategy(requested_help_level=4, accommodation_active=True)
        self.assertEqual(out["assistance_condition"], "AUTHORIZED_ACCOMMODATION")
        self.assertTrue(out["accommodation_preserved"])

    def test_required_accommodation_is_not_faded(self):
        out = choose_instructional_strategy(learner_correct=True, prior_support_level=5, accommodation_active=True)
        self.assertTrue(out["accommodation_preserved"])
        self.assertEqual(out["assistance_condition"], "AUTHORIZED_ACCOMMODATION")

    def test_self_explanation_is_selectable(self):
        out = choose_instructional_strategy(requested_strategy="SELF_EXPLANATION")
        self.assertEqual(out["strategy"], "SELF_EXPLANATION")
        self.assertIn("SELF_EXPLANATION_POLICY_STRATEGY", out["reason_codes"])

    def test_direct_answer_requires_curriculum_permission(self):
        blocked = choose_instructional_strategy(requested_strategy="DIRECT_ANSWER")
        allowed = choose_instructional_strategy(requested_strategy="DIRECT_ANSWER", direct_answer_allowed_by_curriculum=True)
        self.assertEqual(blocked["strategy"], "DIRECT_EXPLANATION")
        self.assertFalse(blocked["direct_answer_permitted"])
        self.assertTrue(allowed["direct_answer_permitted"])

    def test_model_outage_uses_deterministic_policy_fallback(self):
        out = choose_instructional_strategy(requested_help_level=2, model_available=False)
        self.assertEqual(out["strategy"], "HINT")
        self.assertFalse(out["model_used"])
        self.assertIn("MODEL_UNAVAILABLE_DETERMINISTIC_FALLBACK", out["reason_codes"])

    def test_unapproved_model_cannot_change_policy(self):
        out = choose_instructional_strategy(requested_strategy="DIRECT_ANSWER", direct_answer_allowed_by_curriculum=False, model_approved=False)
        self.assertEqual(out["strategy"], "DIRECT_EXPLANATION")
        self.assertFalse(out["model_used"])

    def test_tutor_move_preserves_assistance_standing(self):
        out = validate_tutor_move_against_policy({"move":"TARGETED_HINT", "content":"Try the next clue."})
        self.assertEqual(out["instructional_strategy"], "HINT")
        self.assertEqual(out["assistance_condition"], "INSTRUCTIONAL_SCAFFOLD")
        self.assertEqual(out["instructional_policy_version"], INSTRUCTIONAL_POLICY_VERSION)

    def test_tutor_direct_answer_text_blocked_in_assessment(self):
        with self.assertRaisesRegex(InstructionalPolicyError, "ASSESSMENT_DIRECT_ANSWER_BLOCKED"):
            validate_tutor_move_against_policy({"move":"CLARIFYING_PROBE", "content":"The answer is X"}, assessment_active=True)


class AdaptivePolicyS04Tests(unittest.TestCase):
    def test_ineligible_candidate_cannot_win_model_ranking(self):
        values = [candidate("blocked", "RETENTION_DUE", eligible=False, blockers=["PREREQUISITE_NOT_SATISFIED"]), candidate("ok", "CURRICULUM_NEXT")]
        out = evaluate_adaptive_candidates(values, model_scores={"blocked":999, "ok":0}, model_calibrated=True, model_approved=True)
        self.assertEqual(out["selected_action"]["candidate_id"], "ok")

    def test_prerequisite_blocked_action_is_ineligible(self):
        out = candidate_from_next_action({"action_type":"PREREQUISITE_BLOCKED", "target_id":"x", "skill_id":"s"})
        self.assertFalse(out["eligible"])
        self.assertIn("PREREQUISITE_NOT_SATISFIED", out["blocker_reason_codes"])

    def test_assessment_integrity_blocked_action_is_ineligible(self):
        out = candidate_from_next_action({"action_type":"ASSESSMENT_INTEGRITY_BLOCKED", "target_id":"x", "skill_id":"s"})
        self.assertFalse(out["eligible"])
        self.assertIn("ASSESSMENT_INTEGRITY_BLOCK", out["blocker_reason_codes"])

    def test_retention_due_outranks_curriculum_next_and_proxy_context_removed(self):
        out = evaluate_adaptive_candidates([candidate("next", "CURRICULUM_NEXT"), candidate("retain", "RETENTION_DUE")], ranking_context={"clicks":100, "streak":9})
        self.assertEqual(out["selected_action"]["candidate_id"], "retain")
        self.assertEqual(out["decision_trace"]["ranking_context"], {})

    def test_transfer_gap_remains_decision_relevant(self):
        out = evaluate_adaptive_candidates([candidate("next", "CURRICULUM_NEXT"), candidate("transfer", "TRANSFER_GAP")])
        self.assertEqual(out["selected_action"]["candidate_id"], "transfer")

    def test_independent_evidence_outranks_supported_remediation(self):
        out = evaluate_adaptive_candidates([candidate("remediate", "REMEDIATION"), candidate("verify", "INDEPENDENT_EVIDENCE_REQUIRED")])
        self.assertEqual(out["selected_action"]["candidate_id"], "verify")

    def test_remediation_outranks_curriculum_next(self):
        out = evaluate_adaptive_candidates([candidate("next", "CURRICULUM_NEXT"), candidate("remediate", "REMEDIATION")])
        self.assertEqual(out["selected_action"]["candidate_id"], "remediate")

    def test_deterministic_model_free_selection_is_stable(self):
        values = [candidate("b", "CURRICULUM_NEXT", order=0), candidate("a", "CURRICULUM_NEXT", order=0)]
        first = evaluate_adaptive_candidates(values)
        second = evaluate_adaptive_candidates(values)
        self.assertEqual(first, second)
        self.assertEqual(first["selected_action"]["candidate_id"], "a")

    def test_calibrated_model_only_breaks_eligible_tie(self):
        values = [candidate("a", "CURRICULUM_NEXT"), candidate("b", "CURRICULUM_NEXT")]
        out = evaluate_adaptive_candidates(values, model_scores={"a":0.1, "b":0.9}, model_calibrated=True, model_approved=True)
        self.assertEqual(out["selected_action"]["candidate_id"], "b")
        self.assertTrue(out["decision_trace"]["model_participated"])

    def test_uncalibrated_model_is_ignored(self):
        values = [candidate("a", "CURRICULUM_NEXT"), candidate("b", "CURRICULUM_NEXT")]
        out = evaluate_adaptive_candidates(values, model_scores={"a":0.1, "b":0.9}, model_calibrated=False, model_approved=True)
        self.assertEqual(out["selected_action"]["candidate_id"], "a")
        self.assertEqual(out["decision_trace"]["model_standing"], "IGNORED_NOT_CALIBRATED")

    def test_no_eligible_action_is_explicit(self):
        out = evaluate_adaptive_candidates([candidate("x", "OTHER", eligible=False, blockers=["BLOCKED"])])
        self.assertEqual(out["standing"], "NO_ELIGIBLE_ACTION")
        self.assertEqual(out["error"], "NoEligibleAction")
        self.assertIsNone(out["selected_action"])

    def test_rejected_candidate_preserves_blockers(self):
        out = evaluate_adaptive_candidates([candidate("x", "OTHER", eligible=False, blockers=["BLOCKED"]), candidate("ok", "CURRICULUM_NEXT")])
        self.assertEqual(out["rejected_candidates"][0]["blocker_reason_codes"], ["BLOCKED"])

    def test_selected_action_preserves_reason_codes(self):
        out = evaluate_adaptive_candidates([candidate("x", "RETENTION_DUE")])
        self.assertIn("RETENTION_DUE", out["selected_action"]["selection_reason_codes"])

    def test_decision_trace_pins_policy_and_source_digest(self):
        out = evaluate_adaptive_candidates([candidate("x", "CURRICULUM_NEXT")], source_state={"mastery":"CURRENT"})
        trace = out["decision_trace"]
        self.assertEqual(trace["adaptive_policy_version"], ADAPTIVE_POLICY_VERSION)
        self.assertTrue(trace["source_state_digest"])

    def test_decision_trace_lists_eligible_and_rejected(self):
        out = evaluate_adaptive_candidates([candidate("ok", "CURRICULUM_NEXT"), candidate("no", "OTHER", eligible=False, blockers=["B"])])
        self.assertEqual(out["decision_trace"]["eligible_candidate_ids"], ["ok"])
        self.assertEqual(out["decision_trace"]["rejected_candidate_ids"], ["no"])

    def test_sensitive_attributes_removed_from_ranking_context(self):
        out = evaluate_adaptive_candidates([candidate("x", "CURRICULUM_NEXT")], ranking_context={"race":"x", "health_condition":"y", "allowed":"z"})
        self.assertEqual(out["decision_trace"]["ranking_context"], {"allowed":"z"})
        self.assertEqual(set(out["decision_trace"]["sensitive_ranking_inputs_removed"]), {"race", "health_condition"})

    def test_learner_can_choose_eligible_alternative_without_minting_competence(self):
        out = evaluate_adaptive_candidates([candidate("a", "RETENTION_DUE"), candidate("b", "CURRICULUM_NEXT")], learner_choice_candidate_id="b")
        self.assertEqual(out["selected_action"]["candidate_id"], "b")
        self.assertTrue(out["selected_action"]["learner_override_used"])
        self.assertFalse(out["selected_action"]["override_is_competence_evidence"])

    def test_learner_cannot_override_hard_ineligible_action(self):
        values = [candidate("blocked", "OTHER", eligible=False, blockers=["HARD_BLOCK"]), candidate("ok", "CURRICULUM_NEXT")]
        with self.assertRaisesRegex(AdaptivePolicyError, "OVERRIDE_NOT_PERMITTED_INELIGIBLE_ACTION"):
            evaluate_adaptive_candidates(values, learner_choice_candidate_id="blocked")

    def test_explanation_is_bounded_reason_codes_not_chain_of_thought(self):
        out = evaluate_adaptive_candidates([candidate("x", "CURRICULUM_NEXT")])
        self.assertEqual(out["decision_trace"]["explanation_kind"], "BOUNDED_REASON_CODES")
        self.assertNotIn("chain_of_thought", out["decision_trace"])


class AdaptiveDecisionPersistenceS04Tests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.td.name, "learning.sqlite3")
        self.repo = Repository(self.path)
        self.values = [candidate("a", "CURRICULUM_NEXT"), candidate("b", "RETENTION_DUE")]

    def tearDown(self):
        self.td.cleanup()

    def record(self, repo=None, **kwargs):
        return record_adaptive_decision(repo or self.repo, operation_id="OP1", decision_id="DEC1", candidates=self.values, source_state={"revision":1}, **kwargs)

    def test_same_semantic_decision_replays_exactly(self):
        first = self.record()
        second = self.record()
        self.assertEqual(first, second)
        self.assertEqual(self.repo.count_objects("adaptive_decision_trace"), 1)

    def test_changed_input_same_operation_conflicts(self):
        self.record()
        with self.assertRaisesRegex(ValueError, "IDEMPOTENCY_DIGEST_MISMATCH"):
            record_adaptive_decision(self.repo, operation_id="OP1", decision_id="DEC1", candidates=[candidate("z", "CURRICULUM_NEXT")], source_state={"revision":1})

    def test_decision_trace_is_immutable(self):
        first = self.record()
        stored = self.repo.get_object("adaptive_decision_trace", "DEC1", 1)
        self.assertTrue(stored["immutable"])
        altered = dict(stored)
        altered["selected_candidate_id"] = "other"
        with self.assertRaisesRegex(ValueError, "OBJECT_IDENTITY_COLLISION"):
            self.repo.put_object("adaptive_decision_trace", "DEC1", 1, altered)
        self.assertEqual(first["decision_trace"], stored)

    def test_restart_reconstructs_persisted_decision(self):
        first = self.record()
        reopened = Repository(self.path)
        replay = self.record(repo=reopened)
        self.assertEqual(first, replay)
        self.assertEqual(reopened.get_object("adaptive_decision_trace", "DEC1", 1), first["decision_trace"])


class AdaptiveMasteryBindingS04Tests(unittest.TestCase):
    class FakeAdaptive:
        RETENTION_DELAY_SECONDS = 3600
        RETENTION_FRESHNESS_SECONDS = 24 * 3600
        TRANSFER_FRESHNESS_SECONDS = 24 * 3600

        def __init__(self, repo):
            self.repo = repo

        def _transfer_required(self, skill_id):
            return False

    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.repo = Repository(os.path.join(self.td.name, "learning.sqlite3"))
        self.engine = self.FakeAdaptive(self.repo)

    def tearDown(self):
        self.td.cleanup()

    def put(self, aid, mode, correct, submitted_at, family):
        body = {
            "attempt_id": aid, "learner_id":"L", "course_id":"C", "skill_id":"S",
            "mode":mode, "correct":correct, "submitted_at":submitted_at, "item_family_id":family,
            "assisted":False, "answer_revealed_before_commit":False,
            "assistance_condition":"INDEPENDENT", "accommodation_authorized":False,
            "tool_part_of_construct":False, "evidence_standing":"CURRENT",
            "transfer_novelty":None,
        }
        self.repo.put_attempt(aid, "OP-" + aid, body)

    def test_adaptive_binding_excludes_future_evidence_from_as_of_projection(self):
        self.put("future", "MASTERY_CHECK", True, 100, "F1")
        out = _s03_bound_compute_projection(self.engine, "L", "C", "S", now=50)
        self.assertEqual(out["future_attempt_ids_excluded"], ["future"])
        self.assertNotEqual(out["stage"], "MASTERED")

    def test_adaptive_binding_exposes_s03_condition_state(self):
        self.put("m", "MASTERY_CHECK", True, 0, "F1")
        out = _s03_bound_compute_projection(self.engine, "L", "C", "S", now=10)
        for key in ("evidence_coverage", "uncertainty", "assistance_conditions", "retention", "transfer", "independence"):
            self.assertIn(key, out)
        self.assertEqual(out["mastery_authority"], "S03_EVIDENCE_MASTERY_EVALUATOR")
        self.assertFalse(out["adaptive_is_mastery_authority"])

    def test_stale_retention_routes_revalidation_without_rewriting_evidence(self):
        self.put("m", "MASTERY_CHECK", True, 0, "F1")
        self.put("r", "RETENTION_CHECK", True, 3600, "F2")
        before = self.repo.count_attempts()
        out = _s03_bound_compute_projection(self.engine, "L", "C", "S", now=100000)
        self.assertTrue(out["retention_stale"])
        self.assertEqual(out["stage"], "REVALIDATION_DUE")
        self.assertEqual(self.repo.count_attempts(), before)


if __name__ == "__main__":
    unittest.main()
