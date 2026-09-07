from __future__ import annotations

import hashlib
import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


class Repository:
    def __init__(self, path: str):
        self.path = path
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._init()

    @contextmanager
    def connect(self):
        con = sqlite3.connect(self.path)
        con.row_factory = sqlite3.Row
        try:
            yield con
            con.commit()
        except Exception:
            con.rollback()
            raise
        finally:
            con.close()

    def _init(self):
        with self.connect() as con:
            con.executescript(
                """
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS objects(
                    kind TEXT NOT NULL,
                    object_id TEXT NOT NULL,
                    version INTEGER NOT NULL,
                    body TEXT NOT NULL,
                    body_digest TEXT NOT NULL,
                    PRIMARY KEY(kind, object_id, version)
                );
                CREATE TABLE IF NOT EXISTS operations(
                    operation_id TEXT PRIMARY KEY,
                    payload_digest TEXT NOT NULL,
                    result TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS attempts(
                    attempt_id TEXT PRIMARY KEY,
                    operation_id TEXT NOT NULL UNIQUE,
                    body TEXT NOT NULL,
                    body_digest TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS projections(
                    learner_id TEXT NOT NULL,
                    course_id TEXT NOT NULL,
                    skill_id TEXT NOT NULL,
                    revision INTEGER NOT NULL,
                    body TEXT NOT NULL,
                    body_digest TEXT NOT NULL,
                    PRIMARY KEY(learner_id, course_id, skill_id, revision)
                );
                CREATE TABLE IF NOT EXISTS jobs(
                    job_id TEXT PRIMARY KEY,
                    state TEXT NOT NULL,
                    phase TEXT NOT NULL,
                    checkpoint INTEGER NOT NULL,
                    payload TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS events(
                    seq INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_type TEXT NOT NULL,
                    subject_id TEXT NOT NULL,
                    body TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS tutor_turns(
                    operation_id TEXT PRIMARY KEY,
                    turn_id TEXT NOT NULL UNIQUE,
                    session_id TEXT NOT NULL,
                    learner_id TEXT NOT NULL,
                    course_id TEXT NOT NULL,
                    skill_id TEXT NOT NULL,
                    payload_digest TEXT NOT NULL,
                    checkpoint INTEGER NOT NULL,
                    state TEXT NOT NULL,
                    body TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS learning_sessions(
                    session_id TEXT PRIMARY KEY,
                    learner_id TEXT NOT NULL,
                    course_id TEXT NOT NULL,
                    started_at INTEGER NOT NULL,
                    ended_at INTEGER,
                    state TEXT NOT NULL,
                    body TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS director_decisions(
                    operation_id TEXT PRIMARY KEY,
                    decision_id TEXT NOT NULL UNIQUE,
                    session_id TEXT NOT NULL,
                    learner_id TEXT NOT NULL,
                    course_id TEXT NOT NULL,
                    payload_digest TEXT NOT NULL,
                    checkpoint INTEGER NOT NULL,
                    state TEXT NOT NULL,
                    body TEXT NOT NULL
                );
                """
            )

    def put_object(self, kind: str, object_id: str, version: int, body: Dict[str, Any]):
        serialized = canonical_json(body)
        body_digest = digest(body)
        with self.connect() as con:
            row = con.execute(
                "SELECT body_digest FROM objects WHERE kind=? AND object_id=? AND version=?",
                (kind, object_id, version),
            ).fetchone()
            if row is not None:
                if row[0] != body_digest:
                    raise ValueError("OBJECT_IDENTITY_COLLISION")
                return
            con.execute(
                "INSERT INTO objects(kind,object_id,version,body,body_digest) VALUES(?,?,?,?,?)",
                (kind, object_id, version, serialized, body_digest),
            )

    def get_object(self, kind: str, object_id: str, version: int = 1) -> Optional[Dict[str, Any]]:
        with self.connect() as con:
            row = con.execute(
                "SELECT body,body_digest FROM objects WHERE kind=? AND object_id=? AND version=?",
                (kind, object_id, version),
            ).fetchone()
        if not row:
            return None
        body = json.loads(row[0])
        if digest(body) != row[1]:
            raise ValueError("OBJECT_DIGEST_MISMATCH")
        return body

    def operation_result(self, operation_id: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        d = digest(payload)
        with self.connect() as con:
            row = con.execute("SELECT payload_digest,result FROM operations WHERE operation_id=?", (operation_id,)).fetchone()
        if not row:
            return None
        if row[0] != d:
            raise ValueError("IDEMPOTENCY_DIGEST_MISMATCH")
        return json.loads(row[1])

    def record_operation(self, operation_id: str, payload: Dict[str, Any], result: Dict[str, Any]):
        with self.connect() as con:
            con.execute(
                "INSERT INTO operations(operation_id,payload_digest,result) VALUES(?,?,?)",
                (operation_id, digest(payload), canonical_json(result)),
            )

    def put_attempt(self, attempt_id: str, operation_id: str, body: Dict[str, Any]):
        with self.connect() as con:
            con.execute(
                "INSERT INTO attempts(attempt_id,operation_id,body,body_digest) VALUES(?,?,?,?)",
                (attempt_id, operation_id, canonical_json(body), digest(body)),
            )

    def attempts_for_skill(self, learner_id: str, course_id: str, skill_id: str) -> List[Dict[str, Any]]:
        with self.connect() as con:
            rows = con.execute("SELECT body FROM attempts ORDER BY rowid").fetchall()
        values = [json.loads(r[0]) for r in rows]
        return [a for a in values if a["learner_id"] == learner_id and a["course_id"] == course_id and a["skill_id"] == skill_id]

    def append_projection(self, learner_id: str, course_id: str, skill_id: str, body: Dict[str, Any]) -> int:
        with self.connect() as con:
            row = con.execute(
                "SELECT COALESCE(MAX(revision),0)+1 FROM projections WHERE learner_id=? AND course_id=? AND skill_id=?",
                (learner_id, course_id, skill_id),
            ).fetchone()
            revision = int(row[0])
            con.execute(
                "INSERT INTO projections(learner_id,course_id,skill_id,revision,body,body_digest) VALUES(?,?,?,?,?,?)",
                (learner_id, course_id, skill_id, revision, canonical_json(body), digest(body)),
            )
        return revision

    def latest_projection(self, learner_id: str, course_id: str, skill_id: str) -> Optional[Dict[str, Any]]:
        with self.connect() as con:
            row = con.execute(
                "SELECT body FROM projections WHERE learner_id=? AND course_id=? AND skill_id=? ORDER BY revision DESC LIMIT 1",
                (learner_id, course_id, skill_id),
            ).fetchone()
        return json.loads(row[0]) if row else None

    def projection_history(self, learner_id: str, course_id: str, skill_id: str) -> List[Dict[str, Any]]:
        with self.connect() as con:
            rows = con.execute(
                "SELECT body FROM projections WHERE learner_id=? AND course_id=? AND skill_id=? ORDER BY revision",
                (learner_id, course_id, skill_id),
            ).fetchall()
        return [json.loads(r[0]) for r in rows]

    def save_job(self, job_id: str, state: str, phase: str, checkpoint: int, payload: Dict[str, Any]):
        with self.connect() as con:
            con.execute(
                "INSERT INTO jobs(job_id,state,phase,checkpoint,payload) VALUES(?,?,?,?,?) "
                "ON CONFLICT(job_id) DO UPDATE SET state=excluded.state,phase=excluded.phase,checkpoint=excluded.checkpoint,payload=excluded.payload",
                (job_id, state, phase, checkpoint, canonical_json(payload)),
            )

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        with self.connect() as con:
            row = con.execute("SELECT job_id,state,phase,checkpoint,payload FROM jobs WHERE job_id=?", (job_id,)).fetchone()
        if not row:
            return None
        return {"job_id": row[0], "state": row[1], "phase": row[2], "checkpoint": row[3], "payload": json.loads(row[4])}

    def emit(self, event_type: str, subject_id: str, body: Dict[str, Any]):
        with self.connect() as con:
            con.execute("INSERT INTO events(event_type,subject_id,body) VALUES(?,?,?)", (event_type, subject_id, canonical_json(body)))

    def count_objects(self, kind: str) -> int:
        with self.connect() as con:
            return int(con.execute("SELECT COUNT(*) FROM objects WHERE kind=?", (kind,)).fetchone()[0])

    def count_attempts(self) -> int:
        with self.connect() as con:
            return int(con.execute("SELECT COUNT(*) FROM attempts").fetchone()[0])

    def get_tutor_turn(self, operation_id: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        expected = digest(payload)
        with self.connect() as con:
            row = con.execute(
                "SELECT turn_id,session_id,learner_id,course_id,skill_id,payload_digest,checkpoint,state,body "
                "FROM tutor_turns WHERE operation_id=?",
                (operation_id,),
            ).fetchone()
        if not row:
            return None
        if row[5] != expected:
            raise ValueError("IDEMPOTENCY_DIGEST_MISMATCH")
        return {
            "operation_id": operation_id,
            "turn_id": row[0],
            "session_id": row[1],
            "learner_id": row[2],
            "course_id": row[3],
            "skill_id": row[4],
            "checkpoint": int(row[6]),
            "state": row[7],
            "body": json.loads(row[8]),
        }

    def save_tutor_turn(
        self, *, operation_id: str, turn_id: str, session_id: str, learner_id: str,
        course_id: str, skill_id: str, payload: Dict[str, Any], checkpoint: int, state: str,
        body: Dict[str, Any]
    ) -> None:
        payload_digest = digest(payload)
        serialized = canonical_json(body)
        with self.connect() as con:
            row = con.execute(
                "SELECT turn_id,session_id,learner_id,course_id,skill_id,payload_digest FROM tutor_turns WHERE operation_id=?",
                (operation_id,),
            ).fetchone()
            if row:
                if row[5] != payload_digest:
                    raise ValueError("IDEMPOTENCY_DIGEST_MISMATCH")
                if (row[0], row[1], row[2], row[3], row[4]) != (turn_id, session_id, learner_id, course_id, skill_id):
                    raise ValueError("TUTOR_TURN_IDENTITY_MISMATCH")
                con.execute(
                    "UPDATE tutor_turns SET checkpoint=?,state=?,body=? WHERE operation_id=?",
                    (checkpoint, state, serialized, operation_id),
                )
            else:
                con.execute(
                    "INSERT INTO tutor_turns(operation_id,turn_id,session_id,learner_id,course_id,skill_id,payload_digest,checkpoint,state,body) "
                    "VALUES(?,?,?,?,?,?,?,?,?,?)",
                    (operation_id, turn_id, session_id, learner_id, course_id, skill_id, payload_digest, checkpoint, state, serialized),
                )

    def completed_tutor_turns(self, session_id: str, course_id: str, skill_id: str) -> List[Dict[str, Any]]:
        with self.connect() as con:
            rows = con.execute(
                "SELECT body FROM tutor_turns WHERE session_id=? AND course_id=? AND skill_id=? AND state='COMPLETE' ORDER BY rowid",
                (session_id, course_id, skill_id),
            ).fetchall()
        return [json.loads(r[0]) for r in rows]

    def count_tutor_turns(self, session_id: Optional[str] = None) -> int:
        with self.connect() as con:
            if session_id is None:
                return int(con.execute("SELECT COUNT(*) FROM tutor_turns").fetchone()[0])
            return int(con.execute("SELECT COUNT(*) FROM tutor_turns WHERE session_id=?", (session_id,)).fetchone()[0])

    def save_learning_session(self, *, session_id: str, learner_id: str, course_id: str, started_at: int, state: str, body: Dict[str, Any], ended_at: Optional[int] = None) -> None:
        with self.connect() as con:
            row = con.execute("SELECT learner_id,course_id,started_at FROM learning_sessions WHERE session_id=?", (session_id,)).fetchone()
            if row and (row[0], row[1], int(row[2])) != (learner_id, course_id, int(started_at)):
                raise ValueError("LEARNING_SESSION_IDENTITY_MISMATCH")
            con.execute(
                "INSERT INTO learning_sessions(session_id,learner_id,course_id,started_at,ended_at,state,body) VALUES(?,?,?,?,?,?,?) "
                "ON CONFLICT(session_id) DO UPDATE SET ended_at=excluded.ended_at,state=excluded.state,body=excluded.body",
                (session_id, learner_id, course_id, int(started_at), ended_at, state, canonical_json(body)),
            )

    def get_learning_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        with self.connect() as con:
            row = con.execute("SELECT session_id,learner_id,course_id,started_at,ended_at,state,body FROM learning_sessions WHERE session_id=?", (session_id,)).fetchone()
        if not row:
            return None
        return {"session_id": row[0], "learner_id": row[1], "course_id": row[2], "started_at": int(row[3]), "ended_at": row[4], "state": row[5], "body": json.loads(row[6])}

    def sessions_for_learner(self, learner_id: str, course_id: str) -> List[Dict[str, Any]]:
        with self.connect() as con:
            rows = con.execute("SELECT session_id,learner_id,course_id,started_at,ended_at,state,body FROM learning_sessions WHERE learner_id=? AND course_id=? ORDER BY started_at, rowid", (learner_id, course_id)).fetchall()
        return [{"session_id": r[0], "learner_id": r[1], "course_id": r[2], "started_at": int(r[3]), "ended_at": r[4], "state": r[5], "body": json.loads(r[6])} for r in rows]

    def get_director_decision(self, operation_id: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        expected = digest(payload)
        with self.connect() as con:
            row = con.execute("SELECT decision_id,session_id,learner_id,course_id,payload_digest,checkpoint,state,body FROM director_decisions WHERE operation_id=?", (operation_id,)).fetchone()
        if not row:
            return None
        if row[4] != expected:
            raise ValueError("IDEMPOTENCY_DIGEST_MISMATCH")
        return {"operation_id": operation_id, "decision_id": row[0], "session_id": row[1], "learner_id": row[2], "course_id": row[3], "checkpoint": int(row[5]), "state": row[6], "body": json.loads(row[7])}

    def save_director_decision(self, *, operation_id: str, decision_id: str, session_id: str, learner_id: str, course_id: str, payload: Dict[str, Any], checkpoint: int, state: str, body: Dict[str, Any]) -> None:
        d = digest(payload)
        serialized = canonical_json(body)
        with self.connect() as con:
            row = con.execute("SELECT decision_id,session_id,learner_id,course_id,payload_digest FROM director_decisions WHERE operation_id=?", (operation_id,)).fetchone()
            if row:
                if row[4] != d:
                    raise ValueError("IDEMPOTENCY_DIGEST_MISMATCH")
                if (row[0], row[1], row[2], row[3]) != (decision_id, session_id, learner_id, course_id):
                    raise ValueError("DIRECTOR_DECISION_IDENTITY_MISMATCH")
                con.execute("UPDATE director_decisions SET checkpoint=?,state=?,body=? WHERE operation_id=?", (checkpoint, state, serialized, operation_id))
            else:
                con.execute("INSERT INTO director_decisions(operation_id,decision_id,session_id,learner_id,course_id,payload_digest,checkpoint,state,body) VALUES(?,?,?,?,?,?,?,?,?)", (operation_id, decision_id, session_id, learner_id, course_id, d, checkpoint, state, serialized))

    def count_director_decisions(self) -> int:
        with self.connect() as con:
            return int(con.execute("SELECT COUNT(*) FROM director_decisions").fetchone()[0])

    def latest_object_version(self, kind: str, object_id: str) -> Optional[int]:
        with self.connect() as con:
            row = con.execute(
                "SELECT MAX(version) FROM objects WHERE kind=? AND object_id=?",
                (kind, object_id),
            ).fetchone()
        if not row or row[0] is None:
            return None
        return int(row[0])

    def get_latest_object(self, kind: str, object_id: str) -> Optional[Dict[str, Any]]:
        version = self.latest_object_version(kind, object_id)
        if version is None:
            return None
        body = self.get_object(kind, object_id, version)
        if body is not None:
            body = dict(body)
            body.setdefault("_object_version", version)
        return body

    def append_object_version_checked(
        self, kind: str, object_id: str, body: Dict[str, Any], expected_latest_version: Optional[int]
    ) -> int:
        serialized = canonical_json(body)
        body_digest = digest(body)
        with self.connect() as con:
            row = con.execute(
                "SELECT MAX(version) FROM objects WHERE kind=? AND object_id=?",
                (kind, object_id),
            ).fetchone()
            actual = None if row is None or row[0] is None else int(row[0])
            if actual != expected_latest_version:
                raise ValueError("OBJECT_EXPECTED_VERSION_CONFLICT")
            version = 1 if actual is None else actual + 1
            con.execute(
                "INSERT INTO objects(kind,object_id,version,body,body_digest) VALUES(?,?,?,?,?)",
                (kind, object_id, version, serialized, body_digest),
            )
        return version

    def learners_for_course(self, course_id: str) -> List[str]:
        with self.connect() as con:
            rows = con.execute(
                "SELECT DISTINCT json_extract(body, '$.learner_id') AS learner_id FROM attempts "
                "WHERE json_extract(body, '$.course_id')=? "
                "UNION SELECT learner_id FROM projections WHERE course_id=? ORDER BY learner_id",
                (course_id, course_id),
            ).fetchall()
        return [str(r[0]) for r in rows]
