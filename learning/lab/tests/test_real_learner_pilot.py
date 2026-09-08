import copy
import unittest

from learning_lab.real_learner_pilot import (
    PROTOCOL_VERSION,
    PilotEvidenceError,
    adjudicate_pilot_record,
    validate_pilot_record,
)


D1 = "a" * 64
D2 = "b" * 64
D3 = "c" * 64
D4 = "d" * 64


def complete_record():
    return {
        "pilot_id": "PILOT-001-0001",
        "participant_key": "LRN-0001",
        "course_id": "COURSE-G-GIT",
        "protocol_version": PROTOCOL_VERSION,
        "events": [
            {"event_id": "E1", "event_type": "PILOT_STARTED", "occurred_at": 0, "payload": {}},
            {
                "event_id": "E2",
                "event_type": "PARTICIPATION_CONSENT_ATTESTED",
                "occurred_at": 1,
                "payload": {"consent_recorded": True, "protocol_version": PROTOCOL_VERSION},
            },
            {
                "event_id": "E3",
                "event_type": "BASELINE_COMPLETED",
                "occurred_at": 10,
                "payload": {
                    "score": 1,
                    "max_score": 2,
                    "assistance_used": False,
                    "answer_revealed": False,
                    "response_digest": D1,
                },
            },
            {
                "event_id": "E4",
                "event_type": "ROUTE_SELECTED",
                "occurred_at": 11,
                "payload": {
                    "action_type": "TUTOR_REMEDIATION",
                    "skill_id": "S-GIT-STAGE-COMMIT",
                    "selected_authority": "BASELINE_DIAGNOSTIC_ROUTING",
                },
            },
            {
                "event_id": "E5",
                "event_type": "INSTRUCTION_COMPLETED",
                "occurred_at": 100,
                "payload": {"skill_id": "S-GIT-STAGE-COMMIT"},
            },
            {
                "event_id": "E6",
                "event_type": "INDEPENDENT_VERIFICATION_COMPLETED",
                "occurred_at": 200,
                "payload": {
                    "score": 2,
                    "max_score": 2,
                    "passed": True,
                    "assistance_used": False,
                    "answer_revealed": False,
                    "response_digest": D2,
                    "item_family_id": "F-MASTERY-A",
                },
            },
            {
                "event_id": "E7",
                "event_type": "RETENTION_CHECK_COMPLETED",
                "occurred_at": 3800,
                "payload": {
                    "score": 2,
                    "max_score": 2,
                    "passed": True,
                    "assistance_used": False,
                    "answer_revealed": False,
                    "response_digest": D3,
                    "item_family_id": "F-RETENTION-B",
                },
            },
            {
                "event_id": "E8",
                "event_type": "TRANSFER_CHECK_COMPLETED",
                "occurred_at": 3900,
                "payload": {
                    "score": 1,
                    "max_score": 1,
                    "passed": True,
                    "assistance_used": False,
                    "answer_revealed": False,
                    "response_digest": D4,
                    "item_family_id": "F-TRANSFER-C",
                    "novel_context": True,
                },
            },
            {"event_id": "E9", "event_type": "PILOT_COMPLETED", "occurred_at": 4000, "payload": {}},
        ],
    }


class RealLearnerPilotTests(unittest.TestCase):
    def test_complete_record_is_valid_but_does_not_prove_effectiveness(self):
        result = adjudicate_pilot_record(complete_record())
        self.assertEqual(result["status"], "VALID_COMPLETE")
        self.assertEqual(result["participant_outcome"], "CLOSED_LOOP_PASS")
        self.assertTrue(result["closed_loop_passed"])
        self.assertEqual(result["retention_delay_seconds"], 3600)
        self.assertEqual(result["truth_boundary"]["real_learner_effectiveness"], "NOT_PROVEN")
        self.assertEqual(result["truth_boundary"]["psychometric_validity"], "NOT_PROVEN")

    def test_observed_score_delta_is_descriptive_not_promoted_claim(self):
        result = adjudicate_pilot_record(complete_record())
        self.assertEqual(result["baseline_fraction"], 0.5)
        self.assertEqual(result["independent_verification_fraction"], 1.0)
        self.assertEqual(result["observed_verification_minus_baseline"], 0.5)
        self.assertEqual(result["truth_boundary"]["population_validity"], "NOT_PROVEN")

    def test_direct_pii_field_is_rejected(self):
        record = complete_record()
        record["email"] = "person@example.com"
        with self.assertRaisesRegex(PilotEvidenceError, "DIRECT_PII_FIELD_FORBIDDEN"):
            validate_pilot_record(record)

    def test_nested_pii_field_is_rejected(self):
        record = complete_record()
        record["events"][3]["payload"]["full_name"] = "Example Person"
        with self.assertRaisesRegex(PilotEvidenceError, "DIRECT_PII_FIELD_FORBIDDEN"):
            validate_pilot_record(record)

    def test_raw_response_is_rejected_and_digest_is_required(self):
        record = complete_record()
        record["events"][2]["payload"]["response"] = "raw answer"
        with self.assertRaisesRegex(PilotEvidenceError, "RAW_LEARNER_RESPONSE_FORBIDDEN"):
            validate_pilot_record(record)

        record = complete_record()
        del record["events"][2]["payload"]["response_digest"]
        with self.assertRaisesRegex(PilotEvidenceError, "BASELINE_COMPLETED_RESPONSE_DIGEST_REQUIRED"):
            validate_pilot_record(record)

    def test_consent_must_precede_baseline(self):
        record = complete_record()
        record["events"][1], record["events"][2] = record["events"][2], record["events"][1]
        record["events"][1]["occurred_at"] = 1
        record["events"][2]["occurred_at"] = 10
        with self.assertRaisesRegex(PilotEvidenceError, "CONSENT_MUST_PRECEDE_BASELINE"):
            validate_pilot_record(record)

    def test_baseline_must_precede_instruction(self):
        record = complete_record()
        record["events"][2]["occurred_at"] = 150
        with self.assertRaisesRegex(PilotEvidenceError, "PILOT_EVENT_TIME_REVERSED|BASELINE_MUST_PRECEDE_INSTRUCTION"):
            validate_pilot_record(record)

    def test_assisted_or_revealed_independent_evidence_is_rejected(self):
        for field in ("assistance_used", "answer_revealed"):
            record = complete_record()
            record["events"][5]["payload"][field] = True
            with self.assertRaises(PilotEvidenceError):
                validate_pilot_record(record)

    def test_retention_requires_delay_and_fresh_family(self):
        record = complete_record()
        record["events"][6]["occurred_at"] = 3799
        with self.assertRaisesRegex(PilotEvidenceError, "RETENTION_DELAY_NOT_MET"):
            validate_pilot_record(record)

        record = complete_record()
        record["events"][6]["payload"]["item_family_id"] = "F-MASTERY-A"
        with self.assertRaisesRegex(PilotEvidenceError, "RETENTION_REQUIRES_FRESH_ITEM_FAMILY"):
            validate_pilot_record(record)

    def test_transfer_requires_current_retention_novelty_and_fresh_family(self):
        record = complete_record()
        record["events"][6]["payload"]["passed"] = False
        with self.assertRaisesRegex(PilotEvidenceError, "TRANSFER_REQUIRES_PASSED_RETENTION"):
            validate_pilot_record(record)

        record = complete_record()
        record["events"][7]["payload"]["novel_context"] = False
        with self.assertRaisesRegex(PilotEvidenceError, "TRANSFER_NOVEL_CONTEXT_REQUIRED"):
            validate_pilot_record(record)

        record = complete_record()
        record["events"][7]["payload"]["item_family_id"] = "F-RETENTION-B"
        with self.assertRaisesRegex(PilotEvidenceError, "TRANSFER_REQUIRES_FRESH_ITEM_FAMILY"):
            validate_pilot_record(record)

    def test_duplicate_event_id_is_rejected(self):
        record = complete_record()
        record["events"][4]["event_id"] = "E4"
        with self.assertRaisesRegex(PilotEvidenceError, "PILOT_EVENT_ID_DUPLICATE"):
            validate_pilot_record(record)

    def test_in_progress_record_is_valid_but_not_effectiveness_eligible(self):
        record = complete_record()
        record["events"] = record["events"][:6]
        result = adjudicate_pilot_record(record)
        self.assertEqual(result["status"], "VALID_IN_PROGRESS")
        self.assertEqual(result["participant_outcome"], "INCOMPLETE")
        self.assertFalse(result["eligible_for_effectiveness_review"])
        self.assertEqual(result["truth_boundary"]["real_learner_effectiveness"], "NOT_PROVEN")

    def test_withdrawal_is_valid_terminal_and_excluded_from_effectiveness_review(self):
        record = complete_record()
        record["events"] = record["events"][:4] + [
            {"event_id": "EW", "event_type": "PILOT_WITHDRAWN", "occurred_at": 20, "payload": {}}
        ]
        result = adjudicate_pilot_record(record)
        self.assertEqual(result["status"], "VALID_WITHDRAWN")
        self.assertEqual(result["participant_outcome"], "WITHDRAWN")
        self.assertFalse(result["eligible_for_effectiveness_review"])

    def test_complete_nonpass_is_preserved_as_evidence_not_rewritten_to_success(self):
        record = complete_record()
        record["events"][7]["payload"]["passed"] = False
        result = adjudicate_pilot_record(record)
        self.assertEqual(result["participant_outcome"], "CLOSED_LOOP_NONPASS")
        self.assertFalse(result["closed_loop_passed"])
        self.assertEqual(result["truth_boundary"]["real_learner_effectiveness"], "NOT_PROVEN")


if __name__ == "__main__":
    unittest.main()
