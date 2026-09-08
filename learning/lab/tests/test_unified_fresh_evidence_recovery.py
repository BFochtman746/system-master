from __future__ import annotations

import copy
import json
import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from learning_lab.adaptive import MultiSessionDirector
from learning_lab.adaptive_entry import AdaptiveEntryJourneyDirector
from learning_lab.baseline_diagnostic import BaselineDiagnosticDirector
from learning_lab.domain_general import DomainGeneralTutorDirector
from learning_lab.fraction_domain import REAL_FRACTION_OUTCOME
from learning_lab.fresh_evidence import FreshEvidenceDomainGeneralLearningEngine
from learning_lab.repository import Repository, canonical_json
from learning_lab.unified_fresh_evidence_recovery import (
    UNIFIED_FRESH_EVIDENCE_RECOVERY_INTENT_KIND,
    UNIFIED_FRESH_EVIDENCE_RECOVERY_RESULT_KIND,
    prepare_learning_turn_with_fresh_evidence_recovery,
)


MODEL_ID = "LOCAL-FRESH-IMPL033"
MODEL_PROVIDER = "LOCAL-MODEL-IMPL033"
RESEARCH_PROVIDER = "LOCAL-RESEARCH-IMPL033"
MODEL_CREDENTIAL = "test-only-model-credential-033"
RESEARCH_CREDENTIAL = "test-only-research-credential-033"

FRESH_LCD = {
    "item_id": "MN-FRAC-LCD-IMPL033",
    "family_id": "F-FRAC-LCD-IMPL033",
    "criterion_id": "C-FRAC-EQUIV-LCD",
    "skill_id": "S-FRAC-EQUIV-LCD",
    "mode": "RETENTION_CHECK",
    "prompt": "For 11/18 and 5/12, give the LCD and rewrite both fractions using it. Format: LCD=...; 11/18=...; 5/12=...",
    "answer": "LCD=36; 11/18=22/36; 5/12=15/36",
    "scoring_type": "LCD_EQUIV",
    "claim_refs": ["CL-FRAC-001", "CL-FRAC-002"],
    "fresh_family": True,
}

FRESH_TRANSFER = {
    "item_id": "T-FRAC-TRANSFER-IMPL033",
    "family_id": "F-FRAC-TRANSFER-IMPL033",
    "criterion_id": "C-FRAC-ADD-SUB",
    "skill_id": "S-FRAC-ADD-SUB",
    "mode": "TRANSFER_CHECK",
    "prompt": "A runner completes 3/7 mile and then 5/9 mile. What total distance did the runner complete? Give a simplified fraction.",
    "answer": "62/63",
    "scoring_type": "FRACTION",
    "claim_refs": ["CL-FRAC-003", "CL-FRAC-004", "CL-FRAC-005"],
    "novelty": {
        "surface_context_changed": True,
        "numbers_unseen": True,
        "preserved_construct": "add unlike-denominator fractions and simplify",
    },
}


class _Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):
        return

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw_request = self.rfile.read(length)
        self.server.requests.append({"authorization": self.headers.get("Authorization"), "body": raw_request})
        script = self.server.script[min(len(self.server.requests) - 1, len(self.server.script) - 1)]
        raw = json.dumps(script["body"], sort_keys=True, separators=(",", ":")).encode("utf-8")
        self.send_response(int(script.get("status", 200)))
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


class UnifiedFreshEvidenceRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.repo = Repository(os.path.join(self.td.name, "learning.sqlite3"))
        self.engine = FreshEvidenceDomainGeneralLearningEngine(self.repo)
        created = self.engine.create_research_grounded_course_job(
            operation_id="OP-CREATE-033",
            job_id="JOB-CREATE-033",
            goal_id="G-FRAC-IMPL033",
            title="Fractions unlike denominators",
            desired_outcome=REAL_FRACTION_OUTCOME,
        )
        self.course_id = created["course_id"]
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        self.server.daemon_threads = True
        self.server.requests = []
        self.server.script = [self.response(FRESH_LCD)]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        host, port = self.server.server_address
        self.endpoint = f"http://{host}:{port}/v1/generate"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.td.cleanup()

    def response(self, candidate):
        return {"status": 200, "body": {"model": MODEL_ID, "output": {"candidate": copy.deepcopy(candidate)}}}

    def env(self):
        return {
            "SYSTEM_MASTER_LEARNING_PROVIDER_MODE": "QUALIFICATION_LOCAL",
            "SYSTEM_MASTER_LEARNING_RESEARCH_ENDPOINT": self.endpoint,
            "SYSTEM_MASTER_LEARNING_MODEL_ENDPOINT": self.endpoint,
            "SYSTEM_MASTER_LEARNING_RESEARCH_PROVIDER_ID": RESEARCH_PROVIDER,
            "SYSTEM_MASTER_LEARNING_MODEL_PROVIDER_ID": MODEL_PROVIDER,
            "SYSTEM_MASTER_LEARNING_MODEL_ID": MODEL_ID,
            "SYSTEM_MASTER_LEARNING_SAMPLE_COUNT": "2",
            "SYSTEM_MASTER_LEARNING_ALLOWED_RESEARCH_AUTHORITIES": "OFFICIAL-FRACTIONS",
            "SYSTEM_MASTER_LEARNING_RESEARCH_BEARER_TOKEN": RESEARCH_CREDENTIAL,
            "SYSTEM_MASTER_LEARNING_MODEL_BEARER_TOKEN": MODEL_CREDENTIAL,
        }

    def start_runtime(self, learner_id: str, suffix: str, now: int):
        scorer = self.engine._spec_for_course(self.course_id).behavior_oracle.score
        diagnostic = BaselineDiagnosticDirector(self.repo, scorer=scorer)
        tutor = DomainGeneralTutorDirector(self.repo, self.engine)
        sessions = MultiSessionDirector(self.repo, self.engine)
        journey = AdaptiveEntryJourneyDirector(self.repo, self.engine, diagnostic, tutor, sessions)
        journey_id = f"J-{suffix}"
        session_id = f"S-{suffix}"
        journey.start_journey(
            operation_id=f"OP-J-{suffix}",
            journey_id=journey_id,
            diagnostic_id=f"D-{suffix}",
            learner_id=learner_id,
            course_id=self.course_id,
            claimed_skill_ids=[],
            started_at=now,
        )
        sessions.start_session(
            operation_id=f"OP-S-{suffix}",
            session_id=session_id,
            learner_id=learner_id,
            course_id=self.course_id,
            started_at=now,
        )
        return journey_id, session_id

    def prepare(self, *, operation_id: str, recovery_id: str, turn_id: str, journey_id: str,
                session_id: str, learner_id: str, now: int, crash=None):
        return prepare_learning_turn_with_fresh_evidence_recovery(
            repo=self.repo,
            operation_id=operation_id,
            recovery_id=recovery_id,
            turn_id=turn_id,
            journey_id=journey_id,
            session_id=session_id,
            learner_id=learner_id,
            course_id=self.course_id,
            now=now,
            env=self.env(),
            crash_after_phase=crash,
        )

    def exhaust_maintenance(self, learner_id: str):
        self.engine.submit_attempt(
            operation_id=f"OP-M-{learner_id}", attempt_id=f"ATT-M-{learner_id}",
            learner_id=learner_id, course_id=self.course_id, item_id="M-FRAC-LCD-1",
            response="LCD=24; 5/8=15/24; 7/12=14/24", submitted_at=0,
        )
        self.engine.submit_attempt(
            operation_id=f"OP-R-{learner_id}", attempt_id=f"ATT-R-{learner_id}",
            learner_id=learner_id, course_id=self.course_id, item_id="R-FRAC-LCD-1",
            response="LCD=60; 3/10=18/60; 5/12=25/60", submitted_at=3600,
        )
        stale_at = 3600 + self.engine.RETENTION_FRESHNESS_SECONDS + 1
        self.engine.submit_maintenance_attempt(
            operation_id=f"OP-MN-{learner_id}", attempt_id=f"ATT-MN-{learner_id}",
            learner_id=learner_id, course_id=self.course_id, task_id="MN-FRAC-LCD-2",
            response="LCD=90; 7/15=42/90; 5/18=25/90", submitted_at=stale_at,
        )
        exhausted_at = stale_at + self.engine.RETENTION_FRESHNESS_SECONDS + 1
        self.assertEqual(
            self.engine.next_action(learner_id, self.course_id, now=exhausted_at)["action_type"],
            "MAINTENANCE_RESEARCH_REQUIRED",
        )
        return exhausted_at

    def exhaust_transfer(self, learner_id: str):
        self.engine.submit_attempt(
            operation_id=f"OP-ML-{learner_id}", attempt_id=f"ATT-ML-{learner_id}",
            learner_id=learner_id, course_id=self.course_id, item_id="M-FRAC-LCD-1",
            response="LCD=24; 5/8=15/24; 7/12=14/24", submitted_at=0,
        )
        self.engine.submit_attempt(
            operation_id=f"OP-RL-{learner_id}", attempt_id=f"ATT-RL-{learner_id}",
            learner_id=learner_id, course_id=self.course_id, item_id="R-FRAC-LCD-1",
            response="LCD=60; 3/10=18/60; 5/12=25/60", submitted_at=3600,
        )
        self.engine.submit_attempt(
            operation_id=f"OP-MA-{learner_id}", attempt_id=f"ATT-MA-{learner_id}",
            learner_id=learner_id, course_id=self.course_id, item_id="M-FRAC-ADD-1",
            response="19/12", submitted_at=4000,
        )
        self.engine.submit_attempt(
            operation_id=f"OP-RA-{learner_id}", attempt_id=f"ATT-RA-{learner_id}",
            learner_id=learner_id, course_id=self.course_id, item_id="R-FRAC-SUB-1",
            response="9/20", submitted_at=7600,
        )
        self.engine.submit_transfer_attempt(
            operation_id=f"OP-TA-{learner_id}", attempt_id=f"ATT-TA-{learner_id}",
            learner_id=learner_id, course_id=self.course_id, task_id="T-FRAC-TRANSFER-DISTANCE",
            response="1/2", submitted_at=7601,
        )
        self.engine.submit_transfer_attempt(
            operation_id=f"OP-TB-{learner_id}", attempt_id=f"ATT-TB-{learner_id}",
            learner_id=learner_id, course_id=self.course_id, task_id="T-FRAC-TRANSFER-TANK",
            response="1/2", submitted_at=7602,
        )
        self.assertEqual(
            self.engine.next_action(learner_id, self.course_id, now=7602)["action_type"],
            "TRANSFER_REMEDIATION",
        )
        return 7602

    def test_maintenance_blocker_auto_recovers_to_answer_withheld_turn(self):
        learner = "L-MAINT-033"
        now = self.exhaust_maintenance(learner)
        journey_id, session_id = self.start_runtime(learner, "MAINT-033", now)
        out = self.prepare(
            operation_id="OP-REC-MAINT", recovery_id="REC-MAINT", turn_id="TURN-MAINT",
            journey_id=journey_id, session_id=session_id, learner_id=learner, now=now,
        )
        self.assertTrue(out["recovery_performed"])
        self.assertEqual(out["recovery_kind"], "maintenance")
        self.assertEqual(out["recovery_skill_id"], "S-FRAC-EQUIV-LCD")
        self.assertEqual(out["recovery_criterion_id"], "C-FRAC-EQUIV-LCD")
        self.assertEqual(out["action"]["action_type"], "MAINTENANCE_RECHECK")
        self.assertEqual(out["action"]["target_id"], FRESH_LCD["item_id"])
        self.assertEqual(out["prompt"], FRESH_LCD["prompt"])
        self.assertTrue(out["answer_withheld"])
        self.assertEqual(len(self.server.requests), 1)
        self.assertNotIn(FRESH_LCD["answer"], canonical_json(out))
        self.assertNotIn(MODEL_CREDENTIAL, canonical_json(out))
        self.assertFalse(out["authority_boundary"]["caller_selects_recovery_scope"])
        self.assertTrue(out["authority_boundary"]["impl031_is_admission_authority"])

    def test_replay_after_completed_recovery_makes_zero_additional_http_calls(self):
        learner = "L-REPLAY-033"
        now = self.exhaust_maintenance(learner)
        journey_id, session_id = self.start_runtime(learner, "REPLAY-033", now)
        first = self.prepare(
            operation_id="OP-REC-REPLAY-1", recovery_id="REC-REPLAY", turn_id="TURN-REPLAY",
            journey_id=journey_id, session_id=session_id, learner_id=learner, now=now,
        )
        before = len(self.server.requests)
        self.server.script = [{"status": 500, "body": {"error": "must-not-call"}}]
        replay = self.prepare(
            operation_id="OP-REC-REPLAY-2", recovery_id="REC-REPLAY", turn_id="TURN-REPLAY",
            journey_id=journey_id, session_id=session_id, learner_id=learner, now=now,
        )
        self.assertEqual(replay, first)
        self.assertEqual(len(self.server.requests), before)
        self.assertEqual(self.repo.count_objects(UNIFIED_FRESH_EVIDENCE_RECOVERY_RESULT_KIND), 1)

    def test_crash_after_acquisition_replays_without_resampling_provider(self):
        learner = "L-CRASH-033"
        now = self.exhaust_maintenance(learner)
        journey_id, session_id = self.start_runtime(learner, "CRASH-033", now)
        with self.assertRaisesRegex(RuntimeError, "ACQUISITION_COMPLETED"):
            self.prepare(
                operation_id="OP-REC-CRASH-1", recovery_id="REC-CRASH", turn_id="TURN-CRASH",
                journey_id=journey_id, session_id=session_id, learner_id=learner, now=now,
                crash="ACQUISITION_COMPLETED",
            )
        self.assertEqual(len(self.server.requests), 1)
        self.assertEqual(self.repo.count_objects(UNIFIED_FRESH_EVIDENCE_RECOVERY_INTENT_KIND), 1)
        self.server.script = [{"status": 500, "body": {"error": "must-not-call"}}]
        out = self.prepare(
            operation_id="OP-REC-CRASH-2", recovery_id="REC-CRASH", turn_id="TURN-CRASH",
            journey_id=journey_id, session_id=session_id, learner_id=learner, now=now,
        )
        self.assertTrue(out["recovery_performed"])
        self.assertEqual(out["admitted_task_id"], FRESH_LCD["item_id"])
        self.assertEqual(len(self.server.requests), 1)

    def test_nonblocked_turn_bypasses_provider_entirely(self):
        learner = "L-NONBLOCK-033"
        journey_id, session_id = self.start_runtime(learner, "NONBLOCK-033", 0)
        out = self.prepare(
            operation_id="OP-REC-NONBLOCK", recovery_id="REC-NONBLOCK", turn_id="TURN-NONBLOCK",
            journey_id=journey_id, session_id=session_id, learner_id=learner, now=1,
        )
        self.assertFalse(out["recovery_performed"])
        self.assertFalse(out["provider_http_call_required"])
        self.assertEqual(out["mode"], "EVIDENCE")
        self.assertEqual(out["action"]["action_type"], "DIAGNOSTIC_PROBE")
        self.assertEqual(len(self.server.requests), 0)

    def test_invalid_provider_reference_answer_fails_closed_and_preserves_blocker(self):
        learner = "L-BAD-033"
        now = self.exhaust_maintenance(learner)
        journey_id, session_id = self.start_runtime(learner, "BAD-033", now)
        bad = copy.deepcopy(FRESH_LCD)
        bad["item_id"] = "MN-FRAC-LCD-IMPL033-BAD"
        bad["family_id"] = "F-FRAC-LCD-IMPL033-BAD"
        bad["answer"] = "LCD=18; 11/18=11/18; 5/12=5/18"
        self.server.script = [self.response(bad)]
        with self.assertRaisesRegex(ValueError, "ORACLE_REJECTED_REFERENCE_ANSWER"):
            self.prepare(
                operation_id="OP-REC-BAD", recovery_id="REC-BAD", turn_id="TURN-BAD",
                journey_id=journey_id, session_id=session_id, learner_id=learner, now=now,
            )
        self.assertEqual(len(self.server.requests), 1)
        self.assertEqual(self.repo.count_objects(UNIFIED_FRESH_EVIDENCE_RECOVERY_RESULT_KIND), 0)
        blocked = self.engine.next_action(learner, self.course_id, now=now)
        self.assertEqual(blocked["action_type"], "MAINTENANCE_RESEARCH_REQUIRED")

    def test_transfer_blocker_auto_recovers_from_learning_derived_scope(self):
        learner = "L-TRANSFER-033"
        now = self.exhaust_transfer(learner)
        journey_id, session_id = self.start_runtime(learner, "TRANSFER-033", now)
        self.server.script = [self.response(FRESH_TRANSFER)]
        out = self.prepare(
            operation_id="OP-REC-TRANSFER", recovery_id="REC-TRANSFER", turn_id="TURN-TRANSFER",
            journey_id=journey_id, session_id=session_id, learner_id=learner, now=now,
        )
        self.assertTrue(out["recovery_performed"])
        self.assertEqual(out["initial_surface_kind"], "TRANSFER_REMEDIATION_REQUIRED")
        self.assertEqual(out["recovery_kind"], "transfer")
        self.assertEqual(out["recovery_skill_id"], "S-FRAC-ADD-SUB")
        self.assertEqual(out["recovery_criterion_id"], "C-FRAC-ADD-SUB")
        self.assertEqual(out["action"]["action_type"], "TRANSFER_CHECK")
        self.assertEqual(out["action"]["target_id"], FRESH_TRANSFER["item_id"])
        self.assertTrue(out["answer_withheld"])
        self.assertNotIn(FRESH_TRANSFER["answer"], canonical_json(out))
        self.assertEqual(len(self.server.requests), 1)


if __name__ == "__main__":
    unittest.main()
