#!/usr/bin/env python3
"""Second Shift Supervisor v2 reliability prototype.

Branch-only prototype. Live execution authority remains with current repository controls.
This module deliberately separates durable coordination state from Git audit evidence.
"""

from __future__ import annotations

import contextlib
import dataclasses
import datetime as dt
import json
import os
import sqlite3
import uuid
from pathlib import Path
from typing import Any, Iterator, Optional
from zoneinfo import ZoneInfo

NY = ZoneInfo("America/New_York")
UTC = dt.timezone.utc
TERMINAL = {"COMPLETED", "BLOCKED", "STALE"}
_SCHEMA_OBJECTS = frozenset(
    {
        "lanes",
        "delegations",
        "claims",
        "uq_active_claim_per_lane",
        "dispatch_outbox",
        "circuits",
        "events",
        "supervisor_meta",
    }
)


class SupervisorError(RuntimeError):
    pass


class Conflict(SupervisorError):
    pass


class StaleWorker(SupervisorError):
    pass


def utcnow() -> dt.datetime:
    return dt.datetime.now(tz=UTC)


def iso(value: dt.datetime) -> str:
    if value.tzinfo is None:
        raise ValueError("timezone-aware datetime required")
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def parse_iso(value: str) -> dt.datetime:
    parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("timezone-aware timestamp required")
    return parsed.astimezone(UTC)


def in_shift(value: dt.datetime) -> bool:
    local = value.astimezone(NY)
    return 0 <= local.hour < 7


@dataclasses.dataclass(frozen=True)
class Claim:
    lease_id: str
    lane: str
    delegation_id: str
    objective_id: str
    control_head: str
    idempotency_key: str
    fencing_token: int
    claimed_at: str
    expires_at: str
    heartbeat_at: str
    dispatch_id: str


class SupervisorStore:
    def __init__(self, db_path: os.PathLike[str] | str):
        self.db_path = str(db_path)
        self.conn = sqlite3.connect(self.db_path, timeout=30, isolation_level=None)
        self.conn.row_factory = sqlite3.Row
        # Install the wait policy before any pragma that can need a database lock.
        self.conn.execute("PRAGMA busy_timeout=30000")
        self.conn.execute("PRAGMA foreign_keys=ON")
        journal_mode = str(self.conn.execute("PRAGMA journal_mode").fetchone()[0]).lower()
        if journal_mode != "wal":
            self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA synchronous=FULL")
        # Reopened scheduler processes must not all become schema writers. A fully
        # initialized database takes this read-only fast path; only incomplete/new
        # stores enter the transactional schema bootstrap below.
        if not self._schema_ready():
            self._init_schema()

    def close(self) -> None:
        self.conn.close()

    def __enter__(self) -> "SupervisorStore":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    @contextlib.contextmanager
    def tx(self) -> Iterator[sqlite3.Connection]:
        self.conn.execute("BEGIN IMMEDIATE")
        try:
            yield self.conn
        except Exception:
            self.conn.execute("ROLLBACK")
            raise
        else:
            self.conn.execute("COMMIT")

    def _schema_ready(self) -> bool:
        rows = self.conn.execute(
            "SELECT name FROM sqlite_master WHERE "
            "(type='table' AND name IN ('lanes','delegations','claims','dispatch_outbox','circuits','events','supervisor_meta')) "
            "OR (type='index' AND name='uq_active_claim_per_lane')"
        ).fetchall()
        return {str(row[0]) for row in rows} == _SCHEMA_OBJECTS

    def _init_schema(self) -> None:
        try:
            self.conn.executescript(
                """
                BEGIN IMMEDIATE;
                CREATE TABLE IF NOT EXISTS lanes (
                  lane TEXT PRIMARY KEY,
                  owner_path TEXT NOT NULL,
                  control_ref TEXT NOT NULL,
                  control_head TEXT NOT NULL,
                  fencing_counter INTEGER NOT NULL DEFAULT 0,
                  state TEXT NOT NULL,
                  current_delegation_id TEXT,
                  shift_date TEXT,
                  updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS delegations (
                  delegation_id TEXT PRIMARY KEY,
                  lane TEXT NOT NULL REFERENCES lanes(lane),
                  objective_id TEXT NOT NULL,
                  obligation_id TEXT,
                  control_head TEXT NOT NULL,
                  state TEXT NOT NULL,
                  payload_json TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS claims (
                  lease_id TEXT PRIMARY KEY,
                  lane TEXT NOT NULL REFERENCES lanes(lane),
                  delegation_id TEXT NOT NULL REFERENCES delegations(delegation_id),
                  objective_id TEXT NOT NULL,
                  control_head TEXT NOT NULL,
                  idempotency_key TEXT NOT NULL UNIQUE,
                  fencing_token INTEGER NOT NULL,
                  claimed_at TEXT NOT NULL,
                  expires_at TEXT NOT NULL,
                  heartbeat_at TEXT NOT NULL,
                  checkpoint_pointer TEXT,
                  status TEXT NOT NULL,
                  released_at TEXT,
                  terminal_reason TEXT,
                  dispatch_id TEXT NOT NULL UNIQUE
                );
                CREATE UNIQUE INDEX IF NOT EXISTS uq_active_claim_per_lane
                  ON claims(lane) WHERE released_at IS NULL;
                CREATE TABLE IF NOT EXISTS dispatch_outbox (
                  dispatch_id TEXT PRIMARY KEY,
                  lane TEXT NOT NULL REFERENCES lanes(lane),
                  lease_id TEXT NOT NULL UNIQUE REFERENCES claims(lease_id),
                  idempotency_key TEXT NOT NULL UNIQUE,
                  fencing_token INTEGER NOT NULL,
                  executor_kind TEXT NOT NULL,
                  payload_json TEXT NOT NULL,
                  state TEXT NOT NULL,
                  attempt INTEGER NOT NULL DEFAULT 0,
                  next_attempt_at TEXT,
                  external_run_id TEXT,
                  last_error TEXT,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS circuits (
                  dependency_key TEXT PRIMARY KEY,
                  lane TEXT NOT NULL REFERENCES lanes(lane),
                  state TEXT NOT NULL,
                  failure_count INTEGER NOT NULL DEFAULT 0,
                  retry_budget INTEGER NOT NULL,
                  opened_at TEXT,
                  next_probe_at TEXT,
                  updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS events (
                  seq INTEGER PRIMARY KEY AUTOINCREMENT,
                  event_id TEXT NOT NULL UNIQUE,
                  occurred_at TEXT NOT NULL,
                  lane TEXT NOT NULL,
                  event_type TEXT NOT NULL,
                  delegation_id TEXT,
                  objective_id TEXT,
                  lease_id TEXT,
                  dispatch_id TEXT,
                  idempotency_key TEXT,
                  fencing_token INTEGER,
                  control_head TEXT,
                  payload_json TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS supervisor_meta (
                  key TEXT PRIMARY KEY,
                  value TEXT NOT NULL
                );
                COMMIT;
                """
            )
        except Exception:
            if self.conn.in_transaction:
                self.conn.execute("ROLLBACK")
            raise

    def pragma_state(self) -> dict[str, Any]:
        return {
            "journal_mode": self.conn.execute("PRAGMA journal_mode").fetchone()[0],
            "synchronous": self.conn.execute("PRAGMA synchronous").fetchone()[0],
            "foreign_keys": self.conn.execute("PRAGMA foreign_keys").fetchone()[0],
        }

    def register_lane(
        self,
        lane: str,
        owner_path: str,
        control_ref: str,
        control_head: str,
        now: Optional[dt.datetime] = None,
    ) -> None:
        now = now or utcnow()
        with self.tx() as c:
            row = c.execute("SELECT * FROM lanes WHERE lane=?", (lane,)).fetchone()
            if row is None:
                c.execute(
                    "INSERT INTO lanes(lane,owner_path,control_ref,control_head,state,updated_at) VALUES(?,?,?,?,?,?)",
                    (lane, owner_path, control_ref, control_head, "IDLE", iso(now)),
                )
                self._event(c, lane, "LANE_REGISTERED", now, control_head=control_head, payload={"owner_path": owner_path, "control_ref": control_ref})
            else:
                if row["owner_path"] != owner_path or row["control_ref"] != control_ref:
                    raise Conflict("lane ownership/control ref change requires explicit authority migration")
                if row["control_head"] != control_head:
                    self._invalidate_head_locked(c, lane, control_head, now)

    def bind_ready(
        self,
        lane: str,
        delegation_id: str,
        objective_id: str,
        control_head: str,
        obligation_id: Optional[str] = None,
        payload: Optional[dict[str, Any]] = None,
        now: Optional[dt.datetime] = None,
    ) -> None:
        now = now or utcnow()
        payload = payload or {}
        with self.tx() as c:
            lane_row = self._lane(c, lane)
            if lane_row["control_head"] != control_head:
                raise Conflict("delegation head differs from live lane head")
            if self._active_claim(c, lane):
                raise Conflict("cannot bind successor while live claim exists")
            validating = c.execute(
                "SELECT delegation_id FROM delegations WHERE lane=? AND state='VALIDATING' ORDER BY delegation_id LIMIT 1",
                (lane,),
            ).fetchone()
            if validating is not None:
                raise Conflict(
                    f"cannot bind successor while delegation {validating['delegation_id']} awaits independent evaluation"
                )
            existing = c.execute("SELECT * FROM delegations WHERE delegation_id=?", (delegation_id,)).fetchone()
            if existing:
                same = existing["lane"] == lane and existing["objective_id"] == objective_id and existing["control_head"] == control_head
                if not same:
                    raise Conflict("delegation id collision")
                if existing["state"] == "READY":
                    return
                raise Conflict("cannot reactivate terminal delegation id")
            c.execute(
                "INSERT INTO delegations(delegation_id,lane,objective_id,obligation_id,control_head,state,payload_json,updated_at) VALUES(?,?,?,?,?,?,?,?)",
                (delegation_id, lane, objective_id, obligation_id, control_head, "READY", json.dumps(payload, sort_keys=True), iso(now)),
            )
            c.execute("UPDATE lanes SET state='READY',current_delegation_id=?,updated_at=? WHERE lane=?", (delegation_id, iso(now), lane))
            self._event(c, lane, "SUCCESSOR_BOUND", now, delegation_id=delegation_id, objective_id=objective_id, control_head=control_head, payload=payload)
            self._event(c, lane, "READY", now, delegation_id=delegation_id, objective_id=objective_id, control_head=control_head, payload={})

    def claim_ready(
        self,
        lane: str,
        delegation_id: str,
        objective_id: str,
        control_head: str,
        idempotency_key: str,
        executor_kind: str,
        dispatch_payload: Optional[dict[str, Any]] = None,
        lease_seconds: int = 300,
        now: Optional[dt.datetime] = None,
        allow_outside_shift: bool = False,
    ) -> Claim:
        now = now or utcnow()
        if not allow_outside_shift and not in_shift(now):
            raise Conflict("new claim outside Second Shift window")
        if lease_seconds < 30 or lease_seconds > 3600:
            raise ValueError("lease_seconds must be between 30 and 3600")
        dispatch_payload = dispatch_payload or {}
        with self.tx() as c:
            prior = c.execute("SELECT * FROM claims WHERE idempotency_key=?", (idempotency_key,)).fetchone()
            if prior:
                same = prior["lane"] == lane and prior["delegation_id"] == delegation_id and prior["objective_id"] == objective_id and prior["control_head"] == control_head
                if not same:
                    raise Conflict("idempotency key collision across claim identities")
                return self._to_claim(prior)
            lane_row = self._lane(c, lane)
            if lane_row["control_head"] != control_head:
                raise Conflict("claim head differs from current lane head")
            if self._active_claim(c, lane):
                raise Conflict("lane already has a live mutation claim")
            delegation = c.execute("SELECT * FROM delegations WHERE delegation_id=?", (delegation_id,)).fetchone()
            if not delegation or delegation["lane"] != lane or delegation["objective_id"] != objective_id or delegation["control_head"] != control_head or delegation["state"] != "READY":
                raise Conflict("delegation is not exact current READY work")
            token = int(lane_row["fencing_counter"]) + 1
            lease_id = f"{lane}-{uuid.uuid4()}"
            dispatch_id = f"dispatch-{uuid.uuid4()}"
            expires = now + dt.timedelta(seconds=lease_seconds)
            c.execute("UPDATE lanes SET fencing_counter=?,state='CLAIMED',current_delegation_id=?,updated_at=? WHERE lane=?", (token, delegation_id, iso(now), lane))
            c.execute("UPDATE delegations SET state='CLAIMED',updated_at=? WHERE delegation_id=?", (iso(now), delegation_id))
            c.execute(
                "INSERT INTO claims(lease_id,lane,delegation_id,objective_id,control_head,idempotency_key,fencing_token,claimed_at,expires_at,heartbeat_at,status,dispatch_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                (lease_id, lane, delegation_id, objective_id, control_head, idempotency_key, token, iso(now), iso(expires), iso(now), "CLAIMED", dispatch_id),
            )
            c.execute(
                "INSERT INTO dispatch_outbox(dispatch_id,lane,lease_id,idempotency_key,fencing_token,executor_kind,payload_json,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                (dispatch_id, lane, lease_id, idempotency_key, token, executor_kind, json.dumps(dispatch_payload, sort_keys=True), "PENDING", iso(now), iso(now)),
            )
            self._event(c, lane, "CLAIMED", now, delegation_id=delegation_id, objective_id=objective_id, lease_id=lease_id, dispatch_id=dispatch_id, idempotency_key=idempotency_key, fencing_token=token, control_head=control_head, payload={"expires_at": iso(expires)})
            self._event(c, lane, "DISPATCH_INTENT", now, delegation_id=delegation_id, objective_id=objective_id, lease_id=lease_id, dispatch_id=dispatch_id, idempotency_key=idempotency_key, fencing_token=token, control_head=control_head, payload={"executor_kind": executor_kind})
            row = c.execute("SELECT * FROM claims WHERE lease_id=?", (lease_id,)).fetchone()
            return self._to_claim(row)

    def mark_dispatched(self, dispatch_id: str, external_run_id: str, now: Optional[dt.datetime] = None) -> None:
        now = now or utcnow()
        with self.tx() as c:
            row = c.execute("SELECT * FROM dispatch_outbox WHERE dispatch_id=?", (dispatch_id,)).fetchone()
            if not row:
                raise Conflict("unknown dispatch id")
            if row["external_run_id"]:
                if row["external_run_id"] == external_run_id:
                    return
                raise Conflict("dispatch acknowledgement conflicts with previously recorded external run")
            claim = c.execute("SELECT * FROM claims WHERE lease_id=?", (row["lease_id"],)).fetchone()
            if not claim or claim["released_at"] is not None:
                raise StaleWorker("dispatch belongs to released claim")
            c.execute("UPDATE dispatch_outbox SET state='DISPATCHED',external_run_id=?,attempt=attempt+1,updated_at=? WHERE dispatch_id=?", (external_run_id, iso(now), dispatch_id))
            self._event(c, row["lane"], "DISPATCHED", now, delegation_id=claim["delegation_id"], objective_id=claim["objective_id"], lease_id=claim["lease_id"], dispatch_id=dispatch_id, idempotency_key=claim["idempotency_key"], fencing_token=claim["fencing_token"], control_head=claim["control_head"], payload={"external_run_id": external_run_id})

    def dispatch_failed(
        self,
        dispatch_id: str,
        error_text: str,
        retry_budget: int = 3,
        now: Optional[dt.datetime] = None,
        failure_id: Optional[str] = None,  # required in practice; see the guard below
    ) -> dict[str, Any]:
        now = now or utcnow()
        if retry_budget < 1 or retry_budget > 3:
            raise ValueError("retry_budget must be 1..3")
        if failure_id is None or not str(failure_id).strip():
            raise ValueError("failure_id is required for idempotent dispatch failure handling")
        failure_id = str(failure_id)
        with self.tx() as c:
            row = c.execute("SELECT * FROM dispatch_outbox WHERE dispatch_id=?", (dispatch_id,)).fetchone()
            if not row:
                raise Conflict("unknown dispatch id")

            # Failure callbacks are delivered at least once. The append-only event
            # ledger is the durable deduplication record so an exact replay after a
            # process restart returns the already-recorded outcome without spending
            # another retry or opening the circuit early.
            prior_events = c.execute(
                "SELECT dispatch_id,event_type,payload_json FROM events "
                "WHERE event_type IN ('RETRY','CIRCUIT_OPEN') ORDER BY seq"
            ).fetchall()
            for event in prior_events:
                payload = json.loads(event["payload_json"] or "{}")
                if payload.get("failure_id") != failure_id:
                    continue
                if event["dispatch_id"] != dispatch_id:
                    raise Conflict("failure id collision across dispatch identities")
                same_failure = (
                    payload.get("error") == error_text
                    and int(payload.get("retry_budget", -1)) == retry_budget
                )
                if not same_failure:
                    raise Conflict("failure id collision across dispatch failure identities")
                state = "CIRCUIT_OPEN" if event["event_type"] == "CIRCUIT_OPEN" else "RETRY_WAIT"
                next_at = payload.get("next_probe_at") or payload.get("next_attempt_at")
                return {
                    "state": state,
                    "attempt": int(payload["attempt"]),
                    "next_attempt_at": next_at,
                }

            # A new failure callback is valid only while this dispatch is still
            # locally retryable and no external run has been acknowledged. A late
            # unique failure after DISPATCHED/CANCELLED/CANCEL_REQUESTED/CIRCUIT_OPEN
            # must never resurrect the outbox or spend another retry.
            if row["external_run_id"] is not None or row["state"] not in ("PENDING", "RETRY_WAIT"):
                raise Conflict("dispatch failure callback is stale for non-retryable dispatch state")

            attempt = int(row["attempt"]) + 1
            if attempt >= retry_budget:
                state = "CIRCUIT_OPEN"
                next_at = now + dt.timedelta(minutes=5)
                c.execute("UPDATE dispatch_outbox SET state=?,attempt=?,last_error=?,next_attempt_at=?,updated_at=? WHERE dispatch_id=?", (state, attempt, error_text, iso(next_at), iso(now), dispatch_id))
                c.execute("INSERT INTO circuits(dependency_key,lane,state,failure_count,retry_budget,opened_at,next_probe_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(dependency_key) DO UPDATE SET state=excluded.state,failure_count=excluded.failure_count,retry_budget=excluded.retry_budget,opened_at=excluded.opened_at,next_probe_at=excluded.next_probe_at,updated_at=excluded.updated_at", (f"dispatch:{dispatch_id}", row["lane"], "OPEN", attempt, retry_budget, iso(now), iso(next_at), iso(now)))
                self._event(c, row["lane"], "CIRCUIT_OPEN", now, dispatch_id=dispatch_id, idempotency_key=row["idempotency_key"], fencing_token=row["fencing_token"], payload={"failure_class": "DISPATCH_FAILURE", "failure_id": failure_id, "attempt": attempt, "retry_budget": retry_budget, "next_probe_at": iso(next_at), "error": error_text})
            else:
                state = "RETRY_WAIT"
                next_at = now + dt.timedelta(seconds=min(60, 2 ** attempt * 5))
                c.execute("UPDATE dispatch_outbox SET state=?,attempt=?,last_error=?,next_attempt_at=?,updated_at=? WHERE dispatch_id=?", (state, attempt, error_text, iso(next_at), iso(now), dispatch_id))
                self._event(c, row["lane"], "RETRY", now, dispatch_id=dispatch_id, idempotency_key=row["idempotency_key"], fencing_token=row["fencing_token"], payload={"failure_class": "DISPATCH_FAILURE", "failure_id": failure_id, "attempt": attempt, "retry_budget": retry_budget, "next_attempt_at": iso(next_at), "error": error_text})
            return {"state": state, "attempt": attempt, "next_attempt_at": iso(next_at)}

    def heartbeat(self, lease_id: str, fencing_token: int, checkpoint_pointer: str, now: Optional[dt.datetime] = None) -> None:
        now = now or utcnow()
        with self.tx() as c:
            claim = self._claim(c, lease_id)
            self._assert_live_worker(c, claim, fencing_token, now)
            c.execute("UPDATE claims SET heartbeat_at=?,checkpoint_pointer=?,status='RUNNING' WHERE lease_id=?", (iso(now), checkpoint_pointer, lease_id))
            self._event(c, claim["lane"], "HEARTBEAT", now, delegation_id=claim["delegation_id"], objective_id=claim["objective_id"], lease_id=lease_id, dispatch_id=claim["dispatch_id"], idempotency_key=claim["idempotency_key"], fencing_token=fencing_token, control_head=claim["control_head"], payload={"checkpoint_pointer": checkpoint_pointer})

    def progress(self, lease_id: str, fencing_token: int, payload: dict[str, Any], now: Optional[dt.datetime] = None) -> None:
        now = now or utcnow()
        with self.tx() as c:
            claim = self._claim(c, lease_id)
            self._assert_live_worker(c, claim, fencing_token, now)
            c.execute("UPDATE claims SET heartbeat_at=?,status='RUNNING' WHERE lease_id=?", (iso(now), lease_id))
            self._event(c, claim["lane"], "PROGRESS", now, delegation_id=claim["delegation_id"], objective_id=claim["objective_id"], lease_id=lease_id, dispatch_id=claim["dispatch_id"], idempotency_key=claim["idempotency_key"], fencing_token=fencing_token, control_head=claim["control_head"], payload=payload)


    @staticmethod
    def _require_sha256(value: str, label: str) -> str:
        if not isinstance(value, str) or len(value) != 64 or any(ch not in "0123456789abcdefABCDEF" for ch in value):
            raise ValueError(f"{label} must be an exact SHA-256 digest")
        return value.lower()

    def await_evaluation(
        self, lease_id: str, fencing_token: int, candidate_digest: str,
        payload: Optional[dict[str, Any]] = None, evaluation_timeout_seconds: int = 900,
        now: Optional[dt.datetime] = None,
    ) -> None:
        candidate_digest = self._require_sha256(candidate_digest, "candidate_digest")
        if payload is None:
            payload = {}
        if not isinstance(payload, dict):
            raise ValueError("validation payload must be an object")
        if not isinstance(evaluation_timeout_seconds, int) or evaluation_timeout_seconds < 30 or evaluation_timeout_seconds > 3600:
            raise ValueError("evaluation_timeout_seconds must be between 30 and 3600")
        now = now or utcnow()
        with self.tx() as c:
            claim = self._claim(c, lease_id)
            delegation = c.execute("SELECT * FROM delegations WHERE delegation_id=?", (claim["delegation_id"],)).fetchone()
            if delegation is None:
                raise Conflict("validation claim has no delegation")
            outbox = c.execute("SELECT * FROM dispatch_outbox WHERE lease_id=?", (lease_id,)).fetchone()
            if outbox is None:
                raise Conflict("validation handoff has no dispatch")
            worker_run_id = outbox["external_run_id"]
            if claim["released_at"] is not None:
                recorded = json.loads(claim["terminal_reason"] or "{}")
                exact_replay = (
                    claim["status"] == "VALIDATING" and delegation["state"] == "VALIDATING"
                    and int(fencing_token) == int(claim["fencing_token"])
                    and recorded.get("candidate_digest") == candidate_digest
                    and recorded.get("candidate") == payload
                    and recorded.get("evaluation_timeout_seconds") == evaluation_timeout_seconds
                    and recorded.get("worker_run_id") == worker_run_id
                )
                if exact_replay:
                    return
                if int(fencing_token) != int(claim["fencing_token"]) or claim["status"] == "STALE":
                    raise StaleWorker("validation handoff replay is stale")
                raise Conflict("validation handoff conflicts with recorded state")
            self._assert_live_worker(c, claim, fencing_token, now)
            if outbox["state"] != "DISPATCHED" or not isinstance(worker_run_id, str) or not worker_run_id.strip():
                raise Conflict("validation handoff requires an acknowledged dispatch with worker identity")
            validation_payload = {
                "candidate_digest": candidate_digest, "candidate": payload, "worker_run_id": worker_run_id.strip(),
                "evaluation_timeout_seconds": evaluation_timeout_seconds,
                "evaluation_deadline": iso(now + dt.timedelta(seconds=evaluation_timeout_seconds)),
            }
            c.execute("UPDATE claims SET status='VALIDATING',released_at=?,terminal_reason=? WHERE lease_id=?", (iso(now), json.dumps(validation_payload, sort_keys=True), lease_id))
            c.execute("UPDATE delegations SET state='VALIDATING',updated_at=? WHERE delegation_id=?", (iso(now), claim["delegation_id"]))
            c.execute("UPDATE lanes SET state='RECONCILE',current_delegation_id=NULL,updated_at=? WHERE lane=?", (iso(now), claim["lane"]))
            c.execute("UPDATE dispatch_outbox SET state='VALIDATING',updated_at=? WHERE lease_id=?", (iso(now), lease_id))
            self._event(c, claim["lane"], "VALIDATING", now, delegation_id=claim["delegation_id"], objective_id=claim["objective_id"], lease_id=lease_id, dispatch_id=claim["dispatch_id"], idempotency_key=claim["idempotency_key"], fencing_token=claim["fencing_token"], control_head=claim["control_head"], payload=validation_payload)

    def evaluator_verdict(
        self, lease_id: str, fencing_token: int, verdict_id: str, verdict: str,
        candidate_digest: str, evaluator_id: str, evidence: dict[str, Any],
        now: Optional[dt.datetime] = None,
    ) -> str:
        if not isinstance(verdict_id, str) or not verdict_id.strip():
            raise ValueError("verdict_id is required")
        verdict_id = verdict_id.strip()
        if verdict not in {"PASS", "BLOCKED", "REWORK", "DRIFT"}:
            raise ValueError("verdict must be PASS, BLOCKED, REWORK, or DRIFT")
        candidate_digest = self._require_sha256(candidate_digest, "candidate_digest")
        if not isinstance(evaluator_id, str) or not evaluator_id.strip():
            raise ValueError("evaluator_id is required")
        evaluator_id = evaluator_id.strip()
        if not isinstance(evidence, dict) or not evidence:
            raise ValueError("evaluator evidence must be a non-empty object")
        now = now or utcnow()
        verdict_payload = {"verdict_id": verdict_id, "verdict": verdict, "candidate_digest": candidate_digest, "evaluator_id": evaluator_id, "evidence": evidence}
        terminal_state = "COMPLETED" if verdict == "PASS" else "BLOCKED"
        with self.tx() as c:
            prior = c.execute("SELECT lease_id,payload_json FROM events WHERE event_type='EVALUATOR_VERDICT' ORDER BY seq").fetchall()
            for event in prior:
                recorded_verdict = json.loads(event["payload_json"] or "{}")
                if recorded_verdict.get("verdict_id") != verdict_id:
                    continue
                if event["lease_id"] != lease_id or recorded_verdict != verdict_payload:
                    raise Conflict("evaluator verdict id collision")
                return terminal_state
            claim = self._claim(c, lease_id)
            if int(fencing_token) != int(claim["fencing_token"]):
                raise StaleWorker("evaluator verdict fence differs from candidate claim")
            if claim["status"] == "STALE":
                raise StaleWorker("evaluator verdict candidate is stale")
            if claim["status"] != "VALIDATING" or claim["released_at"] is None:
                raise Conflict("evaluator verdict requires a released VALIDATING claim")
            lane = self._lane(c, claim["lane"])
            if lane["control_head"] != claim["control_head"] or int(lane["fencing_counter"]) != int(claim["fencing_token"]):
                raise StaleWorker("evaluator verdict candidate authority is stale")
            validation_payload = json.loads(claim["terminal_reason"] or "{}")
            if validation_payload.get("candidate_digest") != candidate_digest:
                raise Conflict("evaluator verdict candidate digest differs from validation handoff")
            if validation_payload.get("worker_run_id") == evaluator_id:
                raise Conflict("independent evaluator identity must differ from worker identity")
            deadline = validation_payload.get("evaluation_deadline")
            if not isinstance(deadline, str) or parse_iso(deadline) <= now:
                raise StaleWorker("evaluator verdict arrived after evaluation deadline")
            delegation = c.execute("SELECT * FROM delegations WHERE delegation_id=?", (claim["delegation_id"],)).fetchone()
            outbox = c.execute("SELECT * FROM dispatch_outbox WHERE lease_id=?", (lease_id,)).fetchone()
            if delegation is None or delegation["state"] != "VALIDATING":
                raise Conflict("evaluator verdict requires a VALIDATING delegation")
            if outbox is None or outbox["state"] != "VALIDATING":
                raise Conflict("evaluator verdict requires a VALIDATING dispatch")
            c.execute("UPDATE claims SET status=?,terminal_reason=? WHERE lease_id=?", (terminal_state, json.dumps(verdict_payload, sort_keys=True), lease_id))
            c.execute("UPDATE delegations SET state=?,updated_at=? WHERE delegation_id=?", (terminal_state, iso(now), claim["delegation_id"]))
            c.execute("UPDATE dispatch_outbox SET state=?,updated_at=? WHERE lease_id=?", (terminal_state, iso(now), lease_id))
            self._event(c, claim["lane"], "EVALUATOR_VERDICT", now, delegation_id=claim["delegation_id"], objective_id=claim["objective_id"], lease_id=lease_id, dispatch_id=claim["dispatch_id"], idempotency_key=claim["idempotency_key"], fencing_token=claim["fencing_token"], control_head=claim["control_head"], payload=verdict_payload)
            self._event(c, claim["lane"], terminal_state, now, delegation_id=claim["delegation_id"], objective_id=claim["objective_id"], lease_id=lease_id, dispatch_id=claim["dispatch_id"], idempotency_key=claim["idempotency_key"], fencing_token=claim["fencing_token"], control_head=claim["control_head"], payload={"verdict_id": verdict_id, "candidate_digest": candidate_digest, "evaluator_verdict": verdict, "evaluator_id": evaluator_id})
            return terminal_state

    def _release_dispatch_for_stale_authority(self, c: sqlite3.Connection, lease_id: str, now: dt.datetime) -> None:
        c.execute(
            "UPDATE dispatch_outbox SET state=CASE "
            "WHEN state='DISPATCHED' AND external_run_id IS NOT NULL THEN 'CANCEL_REQUESTED' "
            "WHEN state IN ('PENDING','RETRY_WAIT') THEN 'CANCELLED' "
            "ELSE state END,updated_at=? WHERE lease_id=?",
            (iso(now), lease_id),
        )

    def terminal(self, lease_id: str, fencing_token: int, state: str, payload: Optional[dict[str, Any]] = None, now: Optional[dt.datetime] = None) -> None:
        if state not in TERMINAL:
            raise ValueError("terminal state must be COMPLETED, BLOCKED, or STALE")
        now = now or utcnow()
        payload = payload or {}
        with self.tx() as c:
            claim = self._claim(c, lease_id)
            if claim["released_at"] is not None:
                recorded_payload = json.loads(claim["terminal_reason"] or "{}")
                exact_replay = claim["status"] == state and int(fencing_token) == int(claim["fencing_token"]) and recorded_payload == payload
                if exact_replay:
                    return
                if int(fencing_token) != int(claim["fencing_token"]) or claim["status"] == "STALE":
                    raise StaleWorker("terminal result replay is stale")
                raise Conflict("terminal result replay conflicts with recorded terminalization")
            if state != "STALE":
                self._assert_live_worker(c, claim, fencing_token, now)
            else:
                lane_row = self._lane(c, claim["lane"])
                if fencing_token != claim["fencing_token"] and fencing_token != lane_row["fencing_counter"]:
                    raise StaleWorker("stale terminalization has invalid fence")
            if state == "COMPLETED":
                delegation = c.execute("SELECT payload_json FROM delegations WHERE delegation_id=?", (claim["delegation_id"],)).fetchone()
                delegation_payload = json.loads(delegation["payload_json"] or "{}") if delegation is not None else {}
                if delegation_payload.get("independent_evaluation_required") is True:
                    raise Conflict("independent evaluation required before COMPLETED")
            c.execute("UPDATE claims SET status=?,released_at=?,terminal_reason=? WHERE lease_id=?", (state, iso(now), json.dumps(payload, sort_keys=True), lease_id))
            c.execute("UPDATE delegations SET state=?,updated_at=? WHERE delegation_id=?", (state, iso(now), claim["delegation_id"]))
            c.execute("UPDATE lanes SET state='RECONCILE',current_delegation_id=NULL,updated_at=? WHERE lane=?", (iso(now), claim["lane"]))
            if state == "STALE":
                self._release_dispatch_for_stale_authority(c, lease_id, now)
            else:
                c.execute("UPDATE dispatch_outbox SET state=CASE WHEN state IN ('PENDING','RETRY_WAIT') THEN 'CANCELLED' ELSE state END,updated_at=? WHERE lease_id=?", (iso(now), lease_id))
            self._event(c, claim["lane"], state, now, delegation_id=claim["delegation_id"], objective_id=claim["objective_id"], lease_id=lease_id, dispatch_id=claim["dispatch_id"], idempotency_key=claim["idempotency_key"], fencing_token=claim["fencing_token"], control_head=claim["control_head"], payload=payload)

    def invalidate_head(self, lane: str, new_control_head: str, now: Optional[dt.datetime] = None) -> None:
        now = now or utcnow()
        with self.tx() as c:
            self._invalidate_head_locked(c, lane, new_control_head, now)

    def _invalidate_head_locked(self, c: sqlite3.Connection, lane: str, new_control_head: str, now: dt.datetime) -> None:
        lane_row = self._lane(c, lane)
        if lane_row["control_head"] == new_control_head:
            return
        new_fence = int(lane_row["fencing_counter"]) + 1
        claim = self._active_claim(c, lane)
        if claim:
            c.execute("UPDATE claims SET status='STALE',released_at=?,terminal_reason=? WHERE lease_id=?", (iso(now), json.dumps({"reason": "CONTROL_HEAD_CHANGED", "new_control_head": new_control_head}), claim["lease_id"]))
            c.execute("UPDATE delegations SET state='STALE',updated_at=? WHERE delegation_id=?", (iso(now), claim["delegation_id"]))
            self._release_dispatch_for_stale_authority(c, claim["lease_id"], now)
            self._event(c, lane, "STALE", now, delegation_id=claim["delegation_id"], objective_id=claim["objective_id"], lease_id=claim["lease_id"], dispatch_id=claim["dispatch_id"], idempotency_key=claim["idempotency_key"], fencing_token=claim["fencing_token"], control_head=claim["control_head"], payload={"reason": "CONTROL_HEAD_CHANGED", "new_control_head": new_control_head})
        validating = c.execute(
            "SELECT * FROM claims WHERE lane=? AND status='VALIDATING' AND released_at IS NOT NULL ORDER BY lease_id",
            (lane,),
        ).fetchall()
        for candidate in validating:
            stale_payload = {"reason": "CONTROL_HEAD_CHANGED", "new_control_head": new_control_head}
            c.execute("UPDATE claims SET status='STALE',terminal_reason=? WHERE lease_id=? AND status='VALIDATING'", (json.dumps(stale_payload, sort_keys=True), candidate["lease_id"]))
            c.execute("UPDATE delegations SET state='STALE',updated_at=? WHERE delegation_id=? AND state='VALIDATING'", (iso(now), candidate["delegation_id"]))
            c.execute("UPDATE dispatch_outbox SET state='CANCELLED',updated_at=? WHERE lease_id=? AND state='VALIDATING'", (iso(now), candidate["lease_id"]))
            self._event(c, lane, "STALE", now, delegation_id=candidate["delegation_id"], objective_id=candidate["objective_id"], lease_id=candidate["lease_id"], dispatch_id=candidate["dispatch_id"], idempotency_key=candidate["idempotency_key"], fencing_token=candidate["fencing_token"], control_head=candidate["control_head"], payload=stale_payload)
        c.execute("UPDATE delegations SET state='STALE',updated_at=? WHERE lane=? AND state='READY'", (iso(now), lane))
        c.execute("UPDATE lanes SET control_head=?,fencing_counter=?,state='RECONCILE',current_delegation_id=NULL,updated_at=? WHERE lane=?", (new_control_head, new_fence, iso(now), lane))
        self._event(c, lane, "CONTROL_HEAD_CHANGED", now, fencing_token=new_fence, control_head=new_control_head, payload={"previous_control_head": lane_row["control_head"]})

    def recover(self, now: Optional[dt.datetime] = None, heartbeat_sla_seconds: int = 300) -> dict[str, Any]:
        now = now or utcnow()
        stale_leases: list[str] = []
        with self.tx() as c:
            rows = c.execute("SELECT * FROM claims WHERE released_at IS NULL ORDER BY claimed_at").fetchall()
            for claim in rows:
                expired = parse_iso(claim["expires_at"]) <= now
                heartbeat_stale = (now - parse_iso(claim["heartbeat_at"])).total_seconds() > heartbeat_sla_seconds
                if expired or heartbeat_stale:
                    stale_leases.append(claim["lease_id"])
                    c.execute("UPDATE claims SET status='STALE',released_at=?,terminal_reason=? WHERE lease_id=?", (iso(now), json.dumps({"reason": "LEASE_EXPIRED" if expired else "HEARTBEAT_STALE"}), claim["lease_id"]))
                    c.execute("UPDATE delegations SET state='STALE',updated_at=? WHERE delegation_id=?", (iso(now), claim["delegation_id"]))
                    c.execute("UPDATE lanes SET fencing_counter=fencing_counter+1,state='RECONCILE',current_delegation_id=NULL,updated_at=? WHERE lane=?", (iso(now), claim["lane"]))
                    self._release_dispatch_for_stale_authority(c, claim["lease_id"], now)
                    self._event(c, claim["lane"], "STALE", now, delegation_id=claim["delegation_id"], objective_id=claim["objective_id"], lease_id=claim["lease_id"], dispatch_id=claim["dispatch_id"], idempotency_key=claim["idempotency_key"], fencing_token=claim["fencing_token"], control_head=claim["control_head"], payload={"reason": "LEASE_EXPIRED" if expired else "HEARTBEAT_STALE"})
            validating = c.execute("SELECT * FROM claims WHERE status='VALIDATING' AND released_at IS NOT NULL ORDER BY released_at").fetchall()
            for claim in validating:
                recorded = json.loads(claim["terminal_reason"] or "{}")
                deadline = recorded.get("evaluation_deadline")
                if isinstance(deadline, str) and parse_iso(deadline) > now:
                    continue
                stale_leases.append(claim["lease_id"])
                stale_payload = {"reason": "EVALUATOR_TIMEOUT", "evaluation_deadline": deadline}
                c.execute("UPDATE claims SET status='STALE',terminal_reason=? WHERE lease_id=?", (json.dumps(stale_payload, sort_keys=True), claim["lease_id"]))
                c.execute("UPDATE delegations SET state='STALE',updated_at=? WHERE delegation_id=?", (iso(now), claim["delegation_id"]))
                c.execute("UPDATE lanes SET fencing_counter=fencing_counter+1,state='RECONCILE',current_delegation_id=NULL,updated_at=? WHERE lane=?", (iso(now), claim["lane"]))
                c.execute("UPDATE dispatch_outbox SET state='CANCELLED',updated_at=? WHERE lease_id=?", (iso(now), claim["lease_id"]))
                self._event(c, claim["lane"], "STALE", now, delegation_id=claim["delegation_id"], objective_id=claim["objective_id"], lease_id=claim["lease_id"], dispatch_id=claim["dispatch_id"], idempotency_key=claim["idempotency_key"], fencing_token=claim["fencing_token"], control_head=claim["control_head"], payload=stale_payload)
            pending = [dict(r) for r in c.execute("SELECT * FROM dispatch_outbox WHERE state IN ('PENDING','RETRY_WAIT','CIRCUIT_OPEN') ORDER BY created_at").fetchall()]
        return {"stale_leases": stale_leases, "pending_dispatches": pending}

    def pending_dispatches(self, now: Optional[dt.datetime] = None) -> list[dict[str, Any]]:
        now = now or utcnow()
        rows = self.conn.execute("SELECT * FROM dispatch_outbox WHERE state IN ('PENDING','RETRY_WAIT') ORDER BY created_at").fetchall()
        result = []
        for row in rows:
            next_at = parse_iso(row["next_attempt_at"]) if row["next_attempt_at"] else None
            if next_at is None or next_at <= now:
                result.append(dict(row))
        return result

    def audit_invariants(self, deep: bool = True) -> list[str]:
        """Check controller invariants.

        deep=True  also runs PRAGMA integrity_check, a full database page scan.
                   Use it at the start and end of a run, and in any release gate.
        deep=False runs the logical invariants only. Use it inside hot loops; a
                   full page scan per transition makes a 20,000-step run quadratic.
        """
        problems: list[str] = []
        dup = self.conn.execute("SELECT lane,COUNT(*) n FROM claims WHERE released_at IS NULL GROUP BY lane HAVING n>1").fetchall()
        if dup:
            problems.append("MULTIPLE_ACTIVE_CLAIMS")
        rows = self.conn.execute("SELECT l.lane,l.state,c.lease_id,c.fencing_token,l.fencing_counter FROM lanes l LEFT JOIN claims c ON c.lane=l.lane AND c.released_at IS NULL").fetchall()
        for r in rows:
            if r["state"] == "CLAIMED" and r["lease_id"] is None:
                problems.append(f"CLAIMED_LANE_WITHOUT_CLAIM:{r['lane']}")
            if r["lease_id"] is not None and r["state"] != "CLAIMED":
                problems.append(f"LIVE_CLAIM_WITH_NONCLAIMED_LANE:{r['lane']}")
            if r["lease_id"] is not None and int(r["fencing_token"]) != int(r["fencing_counter"]):
                problems.append(f"LIVE_CLAIM_FENCE_MISMATCH:{r['lane']}")
        orphan = self.conn.execute("SELECT d.dispatch_id FROM dispatch_outbox d LEFT JOIN claims c ON c.lease_id=d.lease_id WHERE c.lease_id IS NULL").fetchall()
        if orphan:
            problems.append("ORPHAN_DISPATCH_OUTBOX")
        invalid_validating = self.conn.execute(
            """
            SELECT d.delegation_id
            FROM delegations d
            LEFT JOIN claims c ON c.delegation_id=d.delegation_id
            LEFT JOIN dispatch_outbox o ON o.lease_id=c.lease_id
            WHERE d.state='VALIDATING'
              AND (c.lease_id IS NULL OR c.status!='VALIDATING' OR c.released_at IS NULL OR o.state!='VALIDATING')
            """
        ).fetchall()
        if invalid_validating:
            problems.append("INVALID_VALIDATING_LIFECYCLE")
        if deep:
            integrity = self.conn.execute("PRAGMA integrity_check").fetchone()[0]
            if integrity != "ok":
                problems.append(f"SQLITE_INTEGRITY:{integrity}")
        return problems

    SNAPSHOT_TABLES = ("lanes", "delegations", "claims", "dispatch_outbox", "circuits", "events")

    def snapshot(self, tables: Optional[tuple[str, ...]] = None) -> dict[str, Any]:
        """Materialise whole tables as dictionaries.

        The default is every table, which is what an audit export wants. Pass an
        explicit subset inside a loop: the events table grows without bound, so
        fetching all of it once per iteration is quadratic in the step count.
        """
        wanted = tuple(tables) if tables else self.SNAPSHOT_TABLES
        unknown = [t for t in wanted if t not in self.SNAPSHOT_TABLES]
        if unknown:
            raise ValueError(f"unknown snapshot table(s): {unknown}")

        def rows(table: str) -> list[dict[str, Any]]:
            return [dict(r) for r in self.conn.execute(f"SELECT * FROM {table} ORDER BY rowid").fetchall()]
        return {k: rows(k) for k in wanted}

    def export_audit_json(self, out_path: os.PathLike[str] | str) -> None:
        Path(out_path).write_text(json.dumps(self.snapshot(), indent=2, sort_keys=True) + "\n", encoding="utf-8")

    def _lane(self, c: sqlite3.Connection, lane: str) -> sqlite3.Row:
        row = c.execute("SELECT * FROM lanes WHERE lane=?", (lane,)).fetchone()
        if not row:
            raise Conflict(f"unknown lane {lane}")
        return row

    def _claim(self, c: sqlite3.Connection, lease_id: str) -> sqlite3.Row:
        row = c.execute("SELECT * FROM claims WHERE lease_id=?", (lease_id,)).fetchone()
        if not row:
            raise Conflict("unknown lease")
        return row

    def _active_claim(self, c: sqlite3.Connection, lane: str) -> Optional[sqlite3.Row]:
        return c.execute("SELECT * FROM claims WHERE lane=? AND released_at IS NULL", (lane,)).fetchone()

    def _assert_live_worker(self, c: sqlite3.Connection, claim: sqlite3.Row, fencing_token: int, now: dt.datetime) -> None:
        if claim["released_at"] is not None:
            raise StaleWorker("claim already released")
        lane = self._lane(c, claim["lane"])
        if int(fencing_token) != int(claim["fencing_token"]) or int(fencing_token) != int(lane["fencing_counter"]):
            raise StaleWorker("fencing token is stale")
        if lane["control_head"] != claim["control_head"]:
            raise StaleWorker("control head changed")
        if parse_iso(claim["expires_at"]) <= now:
            raise StaleWorker("lease expired")

    def _to_claim(self, row: sqlite3.Row) -> Claim:
        return Claim(
            lease_id=row["lease_id"], lane=row["lane"], delegation_id=row["delegation_id"], objective_id=row["objective_id"],
            control_head=row["control_head"], idempotency_key=row["idempotency_key"], fencing_token=int(row["fencing_token"]),
            claimed_at=row["claimed_at"], expires_at=row["expires_at"], heartbeat_at=row["heartbeat_at"], dispatch_id=row["dispatch_id"],
        )

    def _event(
        self,
        c: sqlite3.Connection,
        lane: str,
        event_type: str,
        when: dt.datetime,
        *,
        delegation_id: Optional[str] = None,
        objective_id: Optional[str] = None,
        lease_id: Optional[str] = None,
        dispatch_id: Optional[str] = None,
        idempotency_key: Optional[str] = None,
        fencing_token: Optional[int] = None,
        control_head: Optional[str] = None,
        payload: Optional[dict[str, Any]] = None,
    ) -> None:
        event_id = f"{lane}-{event_type}-{uuid.uuid4()}"
        c.execute(
            "INSERT INTO events(event_id,occurred_at,lane,event_type,delegation_id,objective_id,lease_id,dispatch_id,idempotency_key,fencing_token,control_head,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            (event_id, iso(when), lane, event_type, delegation_id, objective_id, lease_id, dispatch_id, idempotency_key, fencing_token, control_head, json.dumps(payload or {}, sort_keys=True)),
        )


def main() -> int:
    import argparse
    p = argparse.ArgumentParser(description="Second Shift Supervisor v2 prototype")
    p.add_argument("--db", required=True)
    p.add_argument("--audit", action="store_true")
    p.add_argument("--snapshot")
    args = p.parse_args()
    with SupervisorStore(args.db) as store:
        if args.audit:
            problems = store.audit_invariants()
            print(json.dumps({"problems": problems, "pragma": store.pragma_state()}, indent=2))
            if problems:
                return 1
        if args.snapshot:
            store.export_audit_json(args.snapshot)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
