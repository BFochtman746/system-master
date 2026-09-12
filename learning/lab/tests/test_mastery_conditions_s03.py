import os
import tempfile
import unittest

from learning_lab.engine import LearningEngine
from learning_lab.fixture import SUPPORTED_OUTCOME
from learning_lab.mastery_conditions import (
    ASSISTANCE_ACCOMMODATION,
    ASSISTANCE_AI,
    ASSISTANCE_INDEPENDENT,
    ASSISTANCE_ORDINARY_SCAFFOLD,
    ASSISTANCE_TOOL,
    ASSISTANCE_UNKNOWN,
    evaluate_mastery_conditions,
)
from learning_lab.mastery_evidence_reader import validated_attempts_for_skill
from learning_lab.repository import Repository


def attempt(
    attempt_id,
    mode,
    correct=True,
    submitted_at=0,
    family=None,
    assistance=ASSISTANCE_INDEPENDENT,
    **extra,
):
    value = {
        "attempt_id": attempt_id,
        "learner_id": "L1",
        "course_id": "C1",
        "skill_id": "S1",
        "criterion_id": "CR1",
        "item_id": attempt_id,
        "item_family_id": family or f"F-{attempt_id}",
        "mode": mode,
        "correct": correct,
        "assisted": assistance != ASSISTANCE_INDEPENDENT,
        "assistance_condition": assistance,
        "answer_revealed_before_commit": False,
        "submitted_at": submitted_at,
        "evidence_standing": "CURRENT",
    }
    value.update(extra)
    return value


class MasteryConditionUnitTests(unittest.TestCase):
    def evaluate(self, values=None, **policy):
        return evaluate_mastery_conditions(values or [], **policy)

    def mastered_pair(self):
        return [
            attempt("m1", "MASTERY_CHECK", True, 100, "fm"),
            attempt("r1", "RETENTION_CHECK", True, 3800, "fr"),
        ]

    def test_no_evidence_is_insufficient_not_zero_competence(self):
        result = self.evaluate()
        self.assertEqual("INSUFFICIENT_EVIDENCE", result["stage"])
        self.assertEqual("NO_EVIDENCE", result["evidence_coverage"]["standing"])
        self.assertIn("NO_OWNER_VALID_EVIDENCE", result["uncertainty"]["reason_codes"])

    def test_required_gates_are_explicit(self):
        result = self.evaluate()
        self.assertEqual(
            ["CRITERION_PERFORMANCE", "INDEPENDENCE", "RETENTION"],
            result["evidence_coverage"]["required_gates"],
        )
        self.assertEqual("NOT_APPLICABLE", result["gate_states"]["TRANSFER"])

    def test_transfer_gate_becomes_required_only_by_policy(self):
        result = self.evaluate(transfer_required=True)
        self.assertIn("TRANSFER", result["evidence_coverage"]["required_gates"])
        self.assertEqual("UNKNOWN", result["gate_states"]["TRANSFER"])

    def test_independence_can_be_not_applicable(self):
        result = self.evaluate(
            [attempt("m1", "MASTERY_CHECK", True, 100, "fm", assistance=ASSISTANCE_TOOL, tool_part_of_construct=True)],
            independence_required=False,
            retention_required=False,
        )
        self.assertEqual("NOT_APPLICABLE", result["gate_states"]["INDEPENDENCE"])
        self.assertEqual("MASTERED", result["stage"])

    def test_retention_can_be_not_applicable_by_policy(self):
        result = self.evaluate(
            [attempt("m1", "MASTERY_CHECK", True, 100, "fm")],
            retention_required=False,
        )
        self.assertEqual("NOT_APPLICABLE", result["gate_states"]["RETENTION"])
        self.assertEqual("MASTERED", result["stage"])

    def test_practice_correctness_does_not_create_mastery(self):
        result = self.evaluate([attempt("p1", "PRACTICE", True, 100)])
        self.assertNotEqual("MASTERED", result["stage"])
        self.assertEqual("UNKNOWN", result["gate_states"]["CRITERION_PERFORMANCE"])
        self.assertIn("PRACTICE_NOT_MASTERY", result["reason_codes"])

    def test_repetition_same_family_does_not_create_diversity(self):
        values = [attempt(f"m{i}", "MASTERY_CHECK", True, 100 + i, "same") for i in range(20)]
        result = self.evaluate(values)
        self.assertEqual(["same"], result["evidence_coverage"]["distinct_item_families"])
        self.assertFalse(result["evidence_coverage"]["diversity_sufficient"])

    def test_mastery_score_cannot_bypass_retention(self):
        result = self.evaluate([attempt("m1", "MASTERY_CHECK", True, 100, "fm")])
        self.assertEqual("SATISFIED", result["gate_states"]["CRITERION_PERFORMANCE"])
        self.assertEqual("IN_PROGRESS", result["gate_states"]["RETENTION"])
        self.assertNotEqual("MASTERED", result["stage"])

    def test_no_universal_threshold_is_present(self):
        result = self.evaluate(self.mastered_pair())
        self.assertIsNone(result["universal_mastery_threshold"])

    def test_unknown_assistance_is_not_independent(self):
        result = self.evaluate([attempt("m1", "MASTERY_CHECK", True, 100, assistance=ASSISTANCE_UNKNOWN)])
        self.assertEqual("UNKNOWN", result["gate_states"]["INDEPENDENCE"])
        self.assertEqual("ASSISTANCE_BREAKS_INDEPENDENCE", result["excluded_attempts"]["m1"])
        self.assertIn("ASSISTANCE_UNKNOWN", result["uncertainty"]["reason_codes"])

    def test_ai_assistance_does_not_satisfy_independence(self):
        result = self.evaluate([attempt("m1", "MASTERY_CHECK", True, 100, assistance=ASSISTANCE_AI)])
        self.assertEqual("ASSISTANCE_BREAKS_INDEPENDENCE", result["excluded_attempts"]["m1"])
        self.assertNotEqual("MASTERED", result["stage"])

    def test_instructional_scaffold_does_not_satisfy_independence(self):
        result = self.evaluate([attempt("m1", "MASTERY_CHECK", True, 100, assistance=ASSISTANCE_ORDINARY_SCAFFOLD)])
        self.assertEqual("ASSISTANCE_BREAKS_INDEPENDENCE", result["excluded_attempts"]["m1"])

    def test_authorized_accommodation_is_not_automatic_downgrade(self):
        result = self.evaluate([
            attempt(
                "m1",
                "MASTERY_CHECK",
                True,
                100,
                assistance=ASSISTANCE_ACCOMMODATION,
                accommodation_authorized=True,
            )
        ], retention_required=False)
        self.assertEqual("SATISFIED", result["gate_states"]["INDEPENDENCE"])
        self.assertEqual("MASTERED", result["stage"])

    def test_unapproved_accommodation_label_does_not_gain_special_authority(self):
        result = self.evaluate([
            attempt("m1", "MASTERY_CHECK", True, 100, assistance=ASSISTANCE_ACCOMMODATION, accommodation_authorized=False)
        ], retention_required=False)
        self.assertEqual("SATISFIED", result["gate_states"]["CRITERION_PERFORMANCE"])
        self.assertEqual("SATISFIED", result["gate_states"]["INDEPENDENCE"])

    def test_tool_can_be_part_of_construct_when_policy_allows(self):
        result = self.evaluate([
            attempt("m1", "MASTERY_CHECK", True, 100, assistance=ASSISTANCE_TOOL, tool_part_of_construct=True)
        ], retention_required=False)
        self.assertEqual("MASTERED", result["stage"])

    def test_tool_is_not_independent_by_default(self):
        result = self.evaluate([
            attempt("m1", "MASTERY_CHECK", True, 100, assistance=ASSISTANCE_TOOL, tool_part_of_construct=False)
        ], retention_required=False)
        self.assertEqual("ASSISTANCE_BREAKS_INDEPENDENCE", result["excluded_attempts"]["m1"])

    def test_retention_requires_meaningful_delay(self):
        values = [
            attempt("m1", "MASTERY_CHECK", True, 100, "fm"),
            attempt("r1", "RETENTION_CHECK", True, 200, "fr"),
        ]
        result = self.evaluate(values, retention_delay_seconds=3600)
        self.assertEqual("IN_PROGRESS", result["gate_states"]["RETENTION"])
        self.assertIn("r1", result["retention"]["too_early_attempt_ids"])

    def test_time_passage_without_demonstration_does_not_prove_retention(self):
        result = self.evaluate([attempt("m1", "MASTERY_CHECK", True, 100, "fm")], retention_delay_seconds=1)
        self.assertEqual("IN_PROGRESS", result["gate_states"]["RETENTION"])

    def test_same_family_retention_is_excluded(self):
        values = [
            attempt("m1", "MASTERY_CHECK", True, 100, "same"),
            attempt("r1", "RETENTION_CHECK", True, 4000, "same"),
        ]
        result = self.evaluate(values)
        self.assertEqual("IN_PROGRESS", result["gate_states"]["RETENTION"])
        self.assertIn("r1", result["retention"]["same_family_attempt_ids"])

    def test_delayed_distinct_retention_satisfies_gate(self):
        result = self.evaluate(self.mastered_pair())
        self.assertEqual("SATISFIED", result["gate_states"]["RETENTION"])
        self.assertEqual("MASTERED", result["stage"])
        self.assertEqual(["r1"], result["retention"]["qualifying_attempt_ids"])

    def test_failed_current_retention_is_visible(self):
        values = [
            attempt("m1", "MASTERY_CHECK", True, 100, "fm"),
            attempt("r1", "RETENTION_CHECK", False, 3800, "fr"),
        ]
        result = self.evaluate(values)
        self.assertEqual("FAILED_CURRENTLY", result["gate_states"]["RETENTION"])
        self.assertEqual("RETENTION_DUE", result["stage"])

    def test_later_retention_failure_creates_conflict(self):
        values = self.mastered_pair() + [attempt("r2", "RETENTION_CHECK", False, 5000, "fr2")]
        result = self.evaluate(values)
        self.assertEqual("CONFLICTED", result["gate_states"]["RETENTION"])
        self.assertEqual("CONFLICTED_EVIDENCE", result["stage"])
        self.assertIn("CONTRADICTORY_EVIDENCE", result["uncertainty"]["reason_codes"])

    def test_later_mastery_failure_creates_conflict_without_deleting_success(self):
        values = [
            attempt("m1", "MASTERY_CHECK", True, 100, "fm1"),
            attempt("m2", "MASTERY_CHECK", False, 200, "fm2"),
        ]
        result = self.evaluate(values, retention_required=False)
        self.assertEqual("CONFLICTED", result["gate_states"]["CRITERION_PERFORMANCE"])
        self.assertIn("m1", result["counted_attempt_ids"])
        self.assertIn("m2", result["counted_attempt_ids"])

    def test_stale_mastery_evidence_is_excluded(self):
        result = self.evaluate([
            attempt("m1", "MASTERY_CHECK", True, 100, evidence_standing="STALE")
        ])
        self.assertEqual("EVIDENCE_STALE", result["excluded_attempts"]["m1"])
        self.assertIn("STALE_EVIDENCE_PRESENT", result["uncertainty"]["reason_codes"])

    def test_answer_reveal_is_integrity_rejected(self):
        result = self.evaluate([
            attempt("m1", "MASTERY_CHECK", True, 100, answer_revealed_before_commit=True)
        ])
        self.assertEqual("ANSWER_REVEAL_BREAKS_INTEGRITY", result["excluded_attempts"]["m1"])
        self.assertIn("m1", result["integrity_rejected_attempt_ids"])

    def test_transfer_is_not_inferred_from_retention(self):
        result = self.evaluate(self.mastered_pair(), transfer_required=True)
        self.assertNotEqual("SATISFIED", result["gate_states"]["TRANSFER"])
        self.assertEqual("RETAINED", result["stage"])

    def test_non_novel_transfer_is_excluded(self):
        values = self.mastered_pair() + [
            attempt("t1", "TRANSFER_CHECK", True, 5000, "ft", transfer_novelty="COSMETIC_REPEAT")
        ]
        result = self.evaluate(values, transfer_required=True)
        self.assertEqual("TRANSFER_NOVELTY_NOT_ESTABLISHED", result["excluded_attempts"]["t1"])

    def test_same_family_transfer_is_excluded(self):
        values = self.mastered_pair() + [
            attempt("t1", "TRANSFER_CHECK", True, 5000, "fm", transfer_novelty="MATERIALLY_NOVEL")
        ]
        result = self.evaluate(values, transfer_required=True)
        self.assertEqual("SAME_FAMILY_NOT_TRANSFER", result["excluded_attempts"]["t1"])

    def test_materially_novel_transfer_satisfies_gate(self):
        values = self.mastered_pair() + [
            attempt("t1", "TRANSFER_CHECK", True, 5000, "ft", transfer_novelty="MATERIALLY_NOVEL", transfer_context_id="CTX-NEW")
        ]
        result = self.evaluate(values, transfer_required=True)
        self.assertEqual("SATISFIED", result["gate_states"]["TRANSFER"])
        self.assertEqual("MASTERED", result["stage"])
        self.assertEqual(["t1"], result["transfer"]["qualifying_attempt_ids"])

    def test_transfer_cannot_bypass_retention(self):
        values = [
            attempt("m1", "MASTERY_CHECK", True, 100, "fm"),
            attempt("t1", "TRANSFER_CHECK", True, 200, "ft", transfer_novelty="MATERIALLY_NOVEL"),
        ]
        result = self.evaluate(values, transfer_required=True)
        self.assertEqual("IN_PROGRESS", result["gate_states"]["TRANSFER"])
        self.assertNotEqual("MASTERED", result["stage"])

    def test_failed_transfer_is_visible(self):
        values = self.mastered_pair() + [
            attempt("t1", "TRANSFER_CHECK", False, 5000, "ft", transfer_novelty="MATERIALLY_NOVEL")
        ]
        result = self.evaluate(values, transfer_required=True)
        self.assertEqual("FAILED_CURRENTLY", result["gate_states"]["TRANSFER"])
        self.assertNotEqual("MASTERED", result["stage"])

    def test_missing_gates_are_explained(self):
        result = self.evaluate([attempt("m1", "MASTERY_CHECK", True, 100, "fm")])
        self.assertIn("RETENTION", result["evidence_coverage"]["missing_gates"])
        self.assertIn("UNSATISFIED_GATE:RETENTION", result["uncertainty"]["reason_codes"])

    def test_assistance_conditions_are_preserved_by_attempt_id(self):
        values = [
            attempt("p1", "PRACTICE", True, 10, assistance=ASSISTANCE_AI),
            attempt("m1", "MASTERY_CHECK", True, 100, assistance=ASSISTANCE_INDEPENDENT),
        ]
        result = self.evaluate(values)
        self.assertEqual(ASSISTANCE_AI, result["assistance_conditions"]["p1"])
        self.assertEqual(ASSISTANCE_INDEPENDENT, result["assistance_conditions"]["m1"])

    def test_policy_version_is_preserved(self):
        result = self.evaluate(self.mastered_pair(), policy_version="policy-X")
        self.assertEqual("policy-X", result["policy_version"])
        self.assertEqual("policy-X", result["retention"]["policy_version"])

    def test_high_progress_cannot_override_missing_gate(self):
        result = self.evaluate([attempt("m1", "MASTERY_CHECK", True, 100, "fm")])
        self.assertGreater(result["mastery_progress_percent"], 0)
        self.assertNotEqual("MASTERED", result["stage"])


class MasteryConditionRuntimeIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = os.path.join(self.tmp.name, "learning.db")
        self.repo = Repository(self.db)
        self.engine = LearningEngine(self.repo)
        created = self.engine.create_course_job(
            operation_id="create",
            job_id="job",
            goal_id="G1",
            title="Synthetic",
            desired_outcome=SUPPORTED_OUTCOME,
        )
        self.course_id = created["course_id"]

    def tearDown(self):
        self.tmp.cleanup()

    def test_engine_projection_exposes_s03_condition_fields(self):
        result = self.engine.submit_attempt(
            operation_id="m-op",
            attempt_id="m1",
            learner_id="L1",
            course_id=self.course_id,
            item_id="M-STAB-1",
            response="STABLE",
            submitted_at=100,
        )
        projection = result["projection"]
        self.assertIn("evidence_coverage", projection)
        self.assertIn("uncertainty", projection)
        self.assertIn("assistance_conditions", projection)
        self.assertIn("retention", projection)
        self.assertIn("transfer", projection)
        self.assertIn("independence", projection)
        self.assertIsNone(projection["universal_mastery_threshold"])

    def test_engine_preserves_richer_assistance_condition(self):
        result = self.engine.submit_attempt(
            operation_id="m-op",
            attempt_id="m1",
            learner_id="L1",
            course_id=self.course_id,
            item_id="M-STAB-1",
            response="STABLE",
            submitted_at=100,
            assistance_condition=ASSISTANCE_AI,
        )
        self.assertEqual(ASSISTANCE_AI, result["attempt"]["assistance_condition"])
        self.assertEqual("ASSISTANCE_BREAKS_INDEPENDENCE", result["projection"]["excluded_attempts"]["m1"])

    def test_engine_authorized_accommodation_remains_distinct(self):
        result = self.engine.submit_attempt(
            operation_id="m-op",
            attempt_id="m1",
            learner_id="L1",
            course_id=self.course_id,
            item_id="M-STAB-1",
            response="STABLE",
            submitted_at=100,
            assistance_condition=ASSISTANCE_ACCOMMODATION,
            accommodation_authorized=True,
        )
        self.assertEqual(ASSISTANCE_ACCOMMODATION, result["attempt"]["assistance_condition"])
        self.assertEqual("SATISFIED", result["projection"]["gate_states"]["INDEPENDENCE"])

    def test_engine_idempotent_replay_with_s03_fields(self):
        kwargs = dict(
            operation_id="m-op",
            attempt_id="m1",
            learner_id="L1",
            course_id=self.course_id,
            item_id="M-STAB-1",
            response="STABLE",
            submitted_at=100,
            assistance_condition=ASSISTANCE_INDEPENDENT,
        )
        first = self.engine.submit_attempt(**kwargs)
        second = self.engine.submit_attempt(**kwargs)
        self.assertEqual(first, second)
        self.assertEqual(1, self.repo.count_attempts())

    def test_engine_changed_payload_conflicts(self):
        self.engine.submit_attempt(
            operation_id="m-op", attempt_id="m1", learner_id="L1", course_id=self.course_id,
            item_id="M-STAB-1", response="STABLE", submitted_at=100,
        )
        with self.assertRaisesRegex(ValueError, "IDEMPOTENCY_DIGEST_MISMATCH"):
            self.engine.submit_attempt(
                operation_id="m-op", attempt_id="m1", learner_id="L1", course_id=self.course_id,
                item_id="M-STAB-1", response="UNSTABLE", submitted_at=100,
            )

    def test_engine_delayed_retention_reaches_mastery(self):
        self.engine.submit_attempt(
            operation_id="m-op", attempt_id="m1", learner_id="L1", course_id=self.course_id,
            item_id="M-STAB-1", response="STABLE", submitted_at=100,
        )
        result = self.engine.submit_attempt(
            operation_id="r-op", attempt_id="r1", learner_id="L1", course_id=self.course_id,
            item_id="R-STAB-1", response="UNSTABLE", submitted_at=3800,
        )
        self.assertEqual("MASTERED", result["projection"]["stage"])
        self.assertEqual("SATISFIED", result["projection"]["gate_states"]["RETENTION"])

    def test_projection_history_is_append_only(self):
        self.engine.submit_attempt(
            operation_id="m-op", attempt_id="m1", learner_id="L1", course_id=self.course_id,
            item_id="M-STAB-1", response="STABLE", submitted_at=100,
        )
        before = self.repo.projection_history("L1", self.course_id, "S-STABILITY")
        self.engine.submit_attempt(
            operation_id="r-op", attempt_id="r1", learner_id="L1", course_id=self.course_id,
            item_id="R-STAB-1", response="UNSTABLE", submitted_at=3800,
        )
        after = self.repo.projection_history("L1", self.course_id, "S-STABILITY")
        self.assertEqual(before[0], after[0])
        self.assertGreater(len(after), len(before))

    def test_validated_attempt_reader_survives_restart(self):
        self.engine.submit_attempt(
            operation_id="m-op", attempt_id="m1", learner_id="L1", course_id=self.course_id,
            item_id="M-STAB-1", response="STABLE", submitted_at=100,
        )
        restarted = Repository(self.db)
        rows = validated_attempts_for_skill(restarted, "L1", self.course_id, "S-STABILITY")
        self.assertEqual(["m1"], [row["attempt_id"] for row in rows])

    def test_attempt_tamper_is_rejected_before_mastery(self):
        self.engine.submit_attempt(
            operation_id="m-op", attempt_id="m1", learner_id="L1", course_id=self.course_id,
            item_id="M-STAB-1", response="STABLE", submitted_at=100,
        )
        with self.repo.connect() as con:
            con.execute("UPDATE attempts SET body='{}' WHERE attempt_id='m1'")
        with self.assertRaisesRegex(ValueError, "ATTEMPT_DIGEST_MISMATCH"):
            self.engine.reproject("L1", self.course_id, "S-STABILITY", now=200)


if __name__ == "__main__":
    unittest.main()
