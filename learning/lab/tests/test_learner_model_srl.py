import os
import sqlite3
import tempfile
import unittest

from learning_lab.learner_model import (
    LearnerModelPolicyError,
    LearnerModelService,
    get_learner_model_projection,
    record_self_regulation_observation,
    self_regulation_history,
)
from learning_lab.repository import Repository


class LearnerModelSRLRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = os.path.join(self.tmp.name, "learning.db")
        self.repo = Repository(self.db)
        self.service = LearnerModelService(self.repo)

    def tearDown(self):
        self.tmp.cleanup()

    def record(self, operation_id="op-1", kind="PLAN", value=None, **kwargs):
        if value is None:
            value = {"plan": "attempt independently first"}
        return self.service.record_self_regulation_observation(
            learner_id="learner-1",
            observation_kind=kind,
            value=value,
            operation_id=operation_id,
            observed_at=kwargs.pop("observed_at", 100),
            **kwargs,
        )

    def counts(self):
        with self.repo.connect() as con:
            return {
                "srl": int(con.execute("SELECT COUNT(*) FROM objects WHERE kind='LRN-E028'").fetchone()[0]),
                "operations": int(con.execute("SELECT COUNT(*) FROM operations").fetchone()[0]),
                "attempts": int(con.execute("SELECT COUNT(*) FROM attempts").fetchone()[0]),
                "projections": int(con.execute("SELECT COUNT(*) FROM projections").fetchone()[0]),
                "events": int(con.execute("SELECT COUNT(*) FROM events WHERE event_type='SelfRegulationObservationRecorded'").fetchone()[0]),
            }

    def test_plan_observation_records(self):
        result = self.record()
        self.assertEqual("PLAN", result["observation_kind"])
        self.assertEqual(1, self.counts()["srl"])

    def test_all_allowed_observation_kinds_record(self):
        kinds = ["PLAN", "MONITOR", "EVALUATE", "STRATEGY_USE", "HELP_REQUEST"]
        for index, kind in enumerate(kinds):
            self.record(operation_id=f"op-{index}", kind=kind, value={"v": index})
        self.assertEqual(kinds, [row["observation_kind"] for row in self.service.get_self_regulation_history("learner-1")])

    def test_bounded_declared_context_records_allowed_context(self):
        result = self.record(
            kind="BOUNDED_DECLARED_CONTEXT",
            value="confused about joins",
            context={"context_key": "CONFUSION"},
            source_type="LEARNER_DECLARED",
        )
        self.assertEqual("BOUNDED_DECLARED_CONTEXT", result["observation_kind"])

    def test_invalid_kind_fails_without_persistence(self):
        with self.assertRaisesRegex(LearnerModelPolicyError, "SRL_OBSERVATION_KIND_NOT_ALLOWED"):
            self.record(kind="MOOD_SCORE")
        self.assertEqual(0, self.counts()["srl"])
        self.assertEqual(0, self.counts()["operations"])

    def test_operation_id_required(self):
        with self.assertRaisesRegex(LearnerModelPolicyError, "OPERATION_ID_REQUIRED"):
            self.record(operation_id="")

    def test_same_operation_same_payload_replays(self):
        first = self.record(operation_id="stable")
        second = self.record(operation_id="stable")
        self.assertEqual(first, second)
        self.assertEqual(1, self.counts()["srl"])
        self.assertEqual(1, self.counts()["events"])

    def test_same_operation_different_payload_conflicts(self):
        self.record(operation_id="stable", value="first")
        with self.assertRaisesRegex(ValueError, "IDEMPOTENCY_DIGEST_MISMATCH"):
            self.record(operation_id="stable", value="second")
        self.assertEqual(1, self.counts()["srl"])

    def test_observation_is_immutable_after_commit(self):
        result = self.record()
        with self.repo.connect() as con:
            body_before = con.execute(
                "SELECT body FROM objects WHERE kind='LRN-E028' AND object_id=?",
                (result["observation_id"],),
            ).fetchone()[0]
        self.record(operation_id="op-2", kind="MONITOR", value="new")
        with self.repo.connect() as con:
            body_after = con.execute(
                "SELECT body FROM objects WHERE kind='LRN-E028' AND object_id=?",
                (result["observation_id"],),
            ).fetchone()[0]
        self.assertEqual(body_before, body_after)

    def test_correction_appends_successor_and_preserves_prior(self):
        first = self.record(operation_id="first", value="strategy A")
        second = self.record(
            operation_id="second",
            kind="STRATEGY_USE",
            value="strategy B",
            supersedes_observation_id=first["observation_id"],
            observed_at=101,
        )
        history = self.service.get_self_regulation_history("learner-1")
        self.assertEqual(2, len(history))
        self.assertEqual(first["observation_id"], history[1]["supersedes_observation_id"])
        self.assertNotEqual(first["observation_id"], second["observation_id"])

    def test_correction_missing_prior_fails(self):
        with self.assertRaisesRegex(LearnerModelPolicyError, "SUPERSEDED_OBSERVATION_NOT_FOUND"):
            self.record(supersedes_observation_id="missing")
        self.assertEqual(0, self.counts()["srl"])

    def test_correction_other_learner_fails_without_mutation(self):
        first = self.record(operation_id="first")
        with self.assertRaisesRegex(LearnerModelPolicyError, "SUPERSEDED_OBSERVATION_LEARNER_MISMATCH"):
            record_self_regulation_observation(
                self.repo,
                learner_id="learner-2",
                observation_kind="PLAN",
                value="x",
                operation_id="second",
                observed_at=101,
                supersedes_observation_id=first["observation_id"],
            )
        self.assertEqual(1, self.counts()["srl"])

    def test_history_append_order(self):
        self.record(operation_id="op-b", observed_at=200)
        self.record(operation_id="op-a", observed_at=100)
        history = self.service.get_self_regulation_history("learner-1")
        self.assertEqual([200, 100], [item["observed_at"] for item in history])

    def test_restart_reconstructs_history(self):
        self.record()
        restarted = Repository(self.db)
        history = self_regulation_history(restarted, "learner-1")
        self.assertEqual(1, len(history))
        self.assertEqual("learner-1", history[0]["learner_id"])

    def test_srl_write_does_not_touch_mastery_attempts_or_projections(self):
        before = self.counts()
        self.record()
        after = self.counts()
        self.assertEqual(before["attempts"], after["attempts"])
        self.assertEqual(before["projections"], after["projections"])

    def test_forbidden_model_inference_source_rejected(self):
        with self.assertRaisesRegex(LearnerModelPolicyError, "UNAUTHORIZED_OR_INFERRED_CONTEXT_SOURCE"):
            self.record(source_type="MODEL_INFERENCE")
        self.assertEqual(0, self.counts()["operations"])

    def test_mental_health_context_rejected(self):
        with self.assertRaisesRegex(LearnerModelPolicyError, "FORBIDDEN_PSYCHOLOGICAL_OR_TELEMETRY_CONTEXT"):
            self.record(context={"mental_health_diagnosis": "x"})

    def test_personality_context_rejected(self):
        with self.assertRaisesRegex(LearnerModelPolicyError, "FORBIDDEN_PSYCHOLOGICAL_OR_TELEMETRY_CONTEXT"):
            self.record(context={"personality_type": "x"})

    def test_inferred_emotion_context_rejected(self):
        with self.assertRaisesRegex(LearnerModelPolicyError, "FORBIDDEN_PSYCHOLOGICAL_OR_TELEMETRY_CONTEXT"):
            self.record(context={"inferred_emotion": "frustrated"})

    def test_sensitive_attribute_context_rejected(self):
        with self.assertRaisesRegex(LearnerModelPolicyError, "FORBIDDEN_PSYCHOLOGICAL_OR_TELEMETRY_CONTEXT"):
            self.record(context={"protected_attribute": "x"})

    def test_device_telemetry_context_rejected(self):
        with self.assertRaisesRegex(LearnerModelPolicyError, "FORBIDDEN_PSYCHOLOGICAL_OR_TELEMETRY_CONTEXT"):
            self.record(context={"device_telemetry": {"x": 1}})

    def test_declared_context_out_of_scope_rejected(self):
        with self.assertRaisesRegex(LearnerModelPolicyError, "DECLARED_CONTEXT_OUT_OF_SCOPE"):
            self.record(kind="BOUNDED_DECLARED_CONTEXT", context={"context_key": "PERSONALITY"})

    def test_no_evidence_becomes_unknown_not_zero(self):
        projection = self.service.get_learner_model_projection(learner_id="learner-1", as_of=10)
        mastery = next(c for c in projection["claims"] if c["claim_type"] == "mastery")
        self.assertEqual("UNKNOWN", mastery["standing"])
        self.assertIsNone(mastery["value"])

    def test_valid_claim_standing_and_source_preserved(self):
        projection = self.service.get_learner_model_projection(
            learner_id="learner-1",
            source_claims=[{"claim_type":"mastery","standing":"DERIVED","value":"BUILDING","source_refs":["m:1"]}],
            as_of=10,
        )
        mastery = next(c for c in projection["claims"] if c["claim_type"] == "mastery")
        self.assertEqual("DERIVED", mastery["standing"])
        self.assertEqual(["m:1"], mastery["source_refs"])

    def test_invalid_claim_standing_rejected(self):
        with self.assertRaisesRegex(LearnerModelPolicyError, "CLAIM_STANDING_NOT_ALLOWED"):
            self.service.get_learner_model_projection(
                learner_id="learner-1",
                source_claims=[{"claim_type":"mastery","standing":"CERTAIN","value":1,"source_refs":["x"]}],
            )

    def test_confidence_self_report_does_not_become_mastery(self):
        self.record(kind="MONITOR", value={"confidence": 100})
        projection = self.service.get_learner_model_projection(learner_id="learner-1", as_of=1)
        mastery = next(c for c in projection["claims"] if c["claim_type"] == "mastery")
        self.assertEqual("UNKNOWN", mastery["standing"])
        self.assertEqual("NONE", projection["self_regulation"]["mastery_effect"])

    def test_ai_assisted_independence_is_contradicted(self):
        projection = self.service.get_learner_model_projection(
            learner_id="learner-1",
            source_claims=[{
                "claim_type":"independence","standing":"OBSERVED","value":True,
                "source_refs":["attempt:1"],"assistance_condition":"AI_ASSISTED"
            }],
            as_of=1,
        )
        claim = next(c for c in projection["claims"] if c["claim_type"] == "independence")
        self.assertEqual("CONTRADICTED", claim["standing"])
        self.assertIn("ASSISTANCE_INCOMPATIBLE_WITH_INDEPENDENCE", claim["reason_codes"])

    def test_conflicting_sources_remain_contradicted(self):
        claims = [
            {"claim_type":"mastery","standing":"DERIVED","value":"DEMONSTRATED","source_refs":["a"]},
            {"claim_type":"mastery","standing":"OBSERVED","value":"INSUFFICIENT_EVIDENCE","source_refs":["b"]},
        ]
        projection = self.service.get_learner_model_projection(learner_id="learner-1", source_claims=claims, as_of=1)
        mastery = next(c for c in projection["claims"] if c["claim_type"] == "mastery")
        self.assertEqual("CONTRADICTED", mastery["standing"])
        self.assertEqual(["a", "b"], mastery["source_refs"])
        self.assertEqual(2, len(mastery["variants"]))

    def test_stale_standing_preserved(self):
        projection = self.service.get_learner_model_projection(
            learner_id="learner-1",
            source_claims=[{"claim_type":"retention","standing":"STALE","value":"RETAINED","source_refs":["r:1"]}],
            as_of=1,
        )
        claim = next(c for c in projection["claims"] if c["claim_type"] == "retention")
        self.assertEqual("STALE", claim["standing"])

    def test_same_inputs_are_deterministic(self):
        claims = [{"claim_type":"mastery","standing":"DERIVED","value":"BUILDING","source_refs":["b","a"]}]
        first = self.service.get_learner_model_projection(learner_id="learner-1", source_claims=claims, as_of=5)
        second = self.service.get_learner_model_projection(learner_id="learner-1", source_claims=claims, as_of=5)
        self.assertEqual(first, second)

    def test_source_order_does_not_change_projection(self):
        a = {"claim_type":"mastery","standing":"DERIVED","value":"A","source_refs":["a"]}
        b = {"claim_type":"mastery","standing":"DERIVED","value":"B","source_refs":["b"]}
        first = self.service.get_learner_model_projection(learner_id="learner-1", source_claims=[a,b], as_of=5)
        second = self.service.get_learner_model_projection(learner_id="learner-1", source_claims=[b,a], as_of=5)
        self.assertEqual(first, second)

    def test_projection_summarizes_srl_without_rewriting_history(self):
        first = self.record(operation_id="first", kind="PLAN", value="A")
        self.record(operation_id="second", kind="PLAN", value="B", supersedes_observation_id=first["observation_id"], observed_at=101)
        before = self.service.get_self_regulation_history("learner-1")
        projection = self.service.get_learner_model_projection(learner_id="learner-1", as_of=5)
        after = self.service.get_self_regulation_history("learner-1")
        self.assertEqual(before, after)
        self.assertEqual(2, projection["self_regulation"]["history_count"])
        self.assertEqual(1, projection["self_regulation"]["active_observation_count"])

    def test_projection_is_not_source_of_truth(self):
        projection = self.service.get_learner_model_projection(learner_id="learner-1")
        self.assertFalse(projection["source_of_truth"])
        self.assertEqual("NONE", projection["write_authority"])

    def test_query_is_read_only_for_srl_attempts_and_mastery_projections(self):
        before = self.counts()
        self.service.get_learner_model_projection(learner_id="learner-1", as_of=1)
        after = self.counts()
        self.assertEqual(before, after)

    def test_repeated_query_does_not_persist_learner_model_object(self):
        self.service.get_learner_model_projection(learner_id="learner-1")
        self.service.get_learner_model_projection(learner_id="learner-1")
        self.assertEqual(0, self.repo.count_objects("LRN-E027"))

    def test_no_srl_history_returns_unknown_srl_summary(self):
        projection = self.service.get_learner_model_projection(learner_id="learner-1")
        self.assertEqual("UNKNOWN", projection["self_regulation"]["standing"])
        self.assertEqual(0, projection["self_regulation"]["active_observation_count"])

    def test_bounded_context_missing_is_not_negative_trait(self):
        projection = self.service.get_learner_model_projection(learner_id="learner-1")
        self.assertNotIn("motivation", str(projection).lower())
        self.assertNotIn("lazy", str(projection).lower())

    def test_failed_forbidden_context_does_not_consume_operation_identity(self):
        with self.assertRaises(LearnerModelPolicyError):
            self.record(operation_id="retryable", context={"personality_type": "x"})
        result = self.record(operation_id="retryable", context={"instructional_context": "lesson"})
        self.assertEqual("OBSERVED", result["standing"])

    def test_event_written_atomically_with_observation(self):
        self.record()
        counts = self.counts()
        self.assertEqual(1, counts["srl"])
        self.assertEqual(1, counts["operations"])
        self.assertEqual(1, counts["events"])

    def test_history_detects_digest_corruption(self):
        result = self.record()
        with self.repo.connect() as con:
            con.execute(
                "UPDATE objects SET body=? WHERE kind='LRN-E028' AND object_id=?",
                ('{"corrupt":true}', result["observation_id"]),
            )
        with self.assertRaisesRegex(ValueError, "OBJECT_DIGEST_MISMATCH"):
            self.service.get_self_regulation_history("learner-1")


if __name__ == "__main__":
    unittest.main()
