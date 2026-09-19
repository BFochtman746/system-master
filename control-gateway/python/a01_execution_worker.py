#!/usr/bin/env python3
"""A-01 authorized local execution worker with execution-generation fencing.

The scheduler remains the sole claim authority. This runtime adds a second, durable
execution-owner generation beneath the claim fence so overlapping worker processes
cannot execute or mutate the same dispatch concurrently.
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import hashlib
import json
import os
import signal
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Callable, Optional

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from a01_night_scheduler import A01NightScheduler
from a01_model_dispatch import DispatchAmbiguousError, ModelDispatchError, ModelDispatchFailed, dispatch_ai_coding
from tools.second_shift_supervisor_v2 import (
    Conflict,
    StaleWorker,
    SupervisorStore,
    iso,
    parse_iso,
    utcnow,
)

EXECUTION_WORKER_PROTOCOL = "control-gateway.a01-execution-worker.v1"
FINAL_RESULT_STATES = {"SUCCEEDED", "FAILED", "AUTHORITY_LOST"}
RESUMABLE_RESULT_STATES = {"RUNNING", "RESULT_READY"}
RETRY_SAFE = "RETRY_SAFE"
RECONCILIATION_REQUIRED = "RECONCILIATION_REQUIRED"
RETRY_POLICIES = {RETRY_SAFE, RECONCILIATION_REQUIRED}


class ExecutionWorkerError(RuntimeError):
    pass


class UnsupportedExecutor(ExecutionWorkerError):
    pass


class ExecutionBusy(ExecutionWorkerError):
    pass


class WorkExecutionFailed(ExecutionWorkerError):
    def __init__(self, message: str, result: Optional[dict[str, Any]] = None):
        super().__init__(message)
        self.result = result or {}


@dataclasses.dataclass(frozen=True)
class ExecutionContext:
    worker: "A01ExecutionWorker"
    dispatch_id: str
    lease_id: str
    fencing_token: int
    idempotency_key: str
    delegation_id: str
    execution_generation: int
    execution_owner: str
    attempt_id: str
    retry_safety: str

    def renew(self, checkpoint_pointer: Optional[str] = None, now: Optional[dt.datetime] = None) -> str:
        return self.worker.renew_execution_lease(
            self,
            checkpoint_pointer=checkpoint_pointer,
            now=now,
        )

    @property
    def evidence_dir(self) -> Path:
        return self.worker.evidence_root / self.dispatch_id / self.attempt_id


Executor = Callable[[dict[str, Any], ExecutionContext], dict[str, Any]]


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _digest(value: Any) -> str:
    return hashlib.sha256(_canonical(value).encode("utf-8")).hexdigest()


class A01ExecutionWorker:
    """Consume authorized dispatches under claim and execution-generation fences."""

    def __init__(
        self,
        store: SupervisorStore,
        *,
        root: Optional[Path] = None,
        scheduler: Optional[A01NightScheduler] = None,
        executors: Optional[dict[str, Executor]] = None,
        executor_retry_safety: Optional[dict[str, str]] = None,
        lease_seconds: int = 300,
        renew_seconds: int = 30,
        heartbeat_sla_seconds: int = 300,
        evidence_root: Optional[Path] = None,
        clock: Callable[[], dt.datetime] = utcnow,
        worker_id: Optional[str] = None,
    ):
        if not isinstance(store, SupervisorStore):
            raise TypeError("store must be SupervisorStore")
        if lease_seconds < 30 or lease_seconds > 3600:
            raise ValueError("lease_seconds must be between 30 and 3600")
        if renew_seconds < 1 or renew_seconds >= lease_seconds:
            raise ValueError("renew_seconds must be positive and less than lease_seconds")
        if heartbeat_sla_seconds < renew_seconds:
            raise ValueError("heartbeat_sla_seconds must be >= renew_seconds")
        self.store = store
        self.root = (root or ROOT).resolve()
        self.scheduler = scheduler or A01NightScheduler(store)
        self.lease_seconds = lease_seconds
        self.renew_seconds = renew_seconds
        self.heartbeat_sla_seconds = heartbeat_sla_seconds
        self.evidence_root = (evidence_root or (Path(store.db_path).resolve().parent / "execution-evidence")).resolve()
        self.clock = clock
        self.worker_id = worker_id or f"worker-{os.getpid()}-{uuid.uuid4().hex}"
        self.executors: dict[str, Executor] = {
            "A01_CONTROL_PLANE_QUALIFICATION": self._execute_a01_qualification,
            "AI_CODING": self._execute_ai_coding,
        }
        if executors:
            self.executors.update(executors)
        self.executor_retry_safety: dict[str, str] = {
            "A01_CONTROL_PLANE_QUALIFICATION": RETRY_SAFE,
            "AI_CODING": RECONCILIATION_REQUIRED,
        }
        if executor_retry_safety:
            self.executor_retry_safety.update(executor_retry_safety)
        invalid = {k: v for k, v in self.executor_retry_safety.items() if v not in RETRY_POLICIES}
        if invalid:
            raise ValueError(f"invalid executor retry safety: {invalid}")
        self._init_schema()

    def _init_schema(self) -> None:
        with self.store.tx() as c:
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS night_execution_results (
                  dispatch_id TEXT PRIMARY KEY REFERENCES dispatch_outbox(dispatch_id),
                  lease_id TEXT NOT NULL,
                  lane TEXT NOT NULL,
                  idempotency_key TEXT NOT NULL,
                  fencing_token INTEGER NOT NULL,
                  executor_kind TEXT NOT NULL,
                  input_digest TEXT NOT NULL,
                  state TEXT NOT NULL,
                  terminal_state TEXT,
                  attempt_count INTEGER NOT NULL DEFAULT 0,
                  started_at TEXT,
                  finished_at TEXT,
                  updated_at TEXT NOT NULL,
                  result_json TEXT,
                  error_class TEXT,
                  error_message TEXT,
                  execution_generation INTEGER NOT NULL DEFAULT 0,
                  execution_owner TEXT,
                  execution_owner_acquired_at TEXT,
                  current_attempt_id TEXT,
                  retry_safety TEXT NOT NULL DEFAULT 'RECONCILIATION_REQUIRED'
                )
                """
            )
            columns = {str(row["name"]) for row in c.execute("PRAGMA table_info(night_execution_results)").fetchall()}
            additions = {
                "execution_generation": "INTEGER NOT NULL DEFAULT 0",
                "execution_owner": "TEXT",
                "execution_owner_acquired_at": "TEXT",
                "current_attempt_id": "TEXT",
                "retry_safety": "TEXT NOT NULL DEFAULT 'RECONCILIATION_REQUIRED'",
            }
            for name, ddl in additions.items():
                if name not in columns:
                    c.execute(f"ALTER TABLE night_execution_results ADD COLUMN {name} {ddl}")
            c.execute(
                "CREATE INDEX IF NOT EXISTS ix_night_execution_results_state ON night_execution_results(state)"
            )
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS night_execution_attempts (
                  attempt_id TEXT PRIMARY KEY,
                  dispatch_id TEXT NOT NULL REFERENCES night_execution_results(dispatch_id),
                  execution_generation INTEGER NOT NULL,
                  execution_owner TEXT NOT NULL,
                  fencing_token INTEGER NOT NULL,
                  retry_safety TEXT NOT NULL,
                  evidence_dir TEXT NOT NULL,
                  state TEXT NOT NULL,
                  started_at TEXT NOT NULL,
                  finished_at TEXT,
                  UNIQUE(dispatch_id, execution_generation)
                )
                """
            )

    def _dispatch_bundle(self, dispatch_id: str) -> dict[str, Any]:
        row = self.store.conn.execute(
            """
            SELECT o.*, c.delegation_id, c.objective_id, c.control_head,
                   c.claimed_at, c.expires_at, c.heartbeat_at, c.status AS claim_status,
                   c.released_at, c.terminal_reason
            FROM dispatch_outbox o
            JOIN claims c ON c.lease_id=o.lease_id
            WHERE o.dispatch_id=?
            """,
            (dispatch_id,),
        ).fetchone()
        if row is None:
            raise ExecutionWorkerError("unknown dispatch id")
        bundle = dict(row)
        bundle["payload_envelope"] = json.loads(bundle["payload_json"])
        bundle["input_digest"] = _digest(
            {
                "dispatch_id": bundle["dispatch_id"],
                "lease_id": bundle["lease_id"],
                "lane": bundle["lane"],
                "idempotency_key": bundle["idempotency_key"],
                "executor_kind": bundle["executor_kind"],
                "payload": bundle["payload_envelope"],
            }
        )
        return bundle

    def _result_row(self, dispatch_id: str) -> Optional[dict[str, Any]]:
        row = self.store.conn.execute(
            "SELECT * FROM night_execution_results WHERE dispatch_id=?", (dispatch_id,)
        ).fetchone()
        return dict(row) if row is not None else None

    def _attempt_row(self, attempt_id: str) -> Optional[dict[str, Any]]:
        row = self.store.conn.execute(
            "SELECT * FROM night_execution_attempts WHERE attempt_id=?", (attempt_id,)
        ).fetchone()
        return dict(row) if row is not None else None

    def _retry_safety_for(self, executor_kind: str) -> str:
        return self.executor_retry_safety.get(executor_kind, RECONCILIATION_REQUIRED)

    def renew_lease(
        self,
        lease_id: str,
        fencing_token: int,
        *,
        checkpoint_pointer: Optional[str] = None,
        lease_seconds: Optional[int] = None,
        now: Optional[dt.datetime] = None,
    ) -> str:
        now = now or self.clock()
        ttl = self.lease_seconds if lease_seconds is None else lease_seconds
        if ttl < 30 or ttl > 3600:
            raise ValueError("lease_seconds must be between 30 and 3600")
        expires = now + dt.timedelta(seconds=ttl)
        with self.store.tx() as c:
            claim = self.store._claim(c, lease_id)
            self.store._assert_live_worker(c, claim, fencing_token, now)
            c.execute(
                "UPDATE claims SET expires_at=?,heartbeat_at=?,checkpoint_pointer=COALESCE(?,checkpoint_pointer),status='RUNNING' WHERE lease_id=?",
                (iso(expires), iso(now), checkpoint_pointer, lease_id),
            )
            self.store._event(
                c,
                claim["lane"],
                "LEASE_RENEWED",
                now,
                delegation_id=claim["delegation_id"],
                objective_id=claim["objective_id"],
                lease_id=lease_id,
                dispatch_id=claim["dispatch_id"],
                idempotency_key=claim["idempotency_key"],
                fencing_token=fencing_token,
                control_head=claim["control_head"],
                payload={"expires_at": iso(expires), "checkpoint_pointer": checkpoint_pointer},
            )
        return iso(expires)

    def renew_execution_lease(
        self,
        context: ExecutionContext,
        *,
        checkpoint_pointer: Optional[str] = None,
        lease_seconds: Optional[int] = None,
        now: Optional[dt.datetime] = None,
    ) -> str:
        now = now or self.clock()
        ttl = self.lease_seconds if lease_seconds is None else lease_seconds
        if ttl < 30 or ttl > 3600:
            raise ValueError("lease_seconds must be between 30 and 3600")
        expires = now + dt.timedelta(seconds=ttl)
        with self.store.tx() as c:
            claim = self.store._claim(c, context.lease_id)
            self.store._assert_live_worker(c, claim, context.fencing_token, now)
            result = c.execute(
                "SELECT state,execution_generation,execution_owner,current_attempt_id FROM night_execution_results WHERE dispatch_id=?",
                (context.dispatch_id,),
            ).fetchone()
            if (
                result is None
                or result["state"] in FINAL_RESULT_STATES
                or int(result["execution_generation"]) != context.execution_generation
                or result["execution_owner"] != context.execution_owner
                or result["current_attempt_id"] != context.attempt_id
            ):
                raise StaleWorker("execution generation or owner is stale")
            c.execute(
                "UPDATE claims SET expires_at=?,heartbeat_at=?,checkpoint_pointer=COALESCE(?,checkpoint_pointer),status='RUNNING' WHERE lease_id=?",
                (iso(expires), iso(now), checkpoint_pointer, context.lease_id),
            )
            self.store._event(
                c,
                claim["lane"],
                "LEASE_RENEWED",
                now,
                delegation_id=claim["delegation_id"],
                objective_id=claim["objective_id"],
                lease_id=context.lease_id,
                dispatch_id=context.dispatch_id,
                idempotency_key=claim["idempotency_key"],
                fencing_token=context.fencing_token,
                control_head=claim["control_head"],
                payload={
                    "expires_at": iso(expires),
                    "checkpoint_pointer": checkpoint_pointer,
                    "execution_generation": context.execution_generation,
                    "execution_owner": context.execution_owner,
                    "attempt_id": context.attempt_id,
                },
            )
        return iso(expires)

    def _validate_recovery_identity(self, row: Any) -> None:
        if int(row["outbox_fencing_token"]) != int(row["fencing_token"]):
            raise Conflict("recovery identity mismatch: outbox fence differs from claim fence")
        if row["outbox_idempotency_key"] != row["idempotency_key"]:
            raise Conflict("recovery identity mismatch: outbox idempotency key differs from claim")
        if row["result_state"] is None:
            return
        if int(row["result_fencing_token"]) != int(row["fencing_token"]):
            raise Conflict("recovery identity mismatch: result fence differs from claim fence")
        envelope = json.loads(row["outbox_payload_json"])
        expected_digest = _digest(
            {
                "dispatch_id": row["dispatch_id"],
                "lease_id": row["lease_id"],
                "lane": row["lane"],
                "idempotency_key": row["idempotency_key"],
                "executor_kind": row["executor_kind"],
                "payload": envelope,
            }
        )
        if row["result_input_digest"] != expected_digest:
            raise Conflict("recovery identity mismatch: result digest differs from dispatch identity")

    def _recoverable(self, claim: Any, outbox: Any, result: Optional[Any], now: dt.datetime) -> tuple[bool, str]:
        expired = parse_iso(claim["expires_at"]) <= now
        heartbeat_stale = (now - parse_iso(claim["heartbeat_at"])).total_seconds() > self.heartbeat_sla_seconds
        if not expired and not heartbeat_stale:
            return False, ""
        if outbox["executor_kind"] not in self.executors:
            return False, ""
        if outbox["state"] not in ("PENDING", "DISPATCHED"):
            return False, ""
        expected_local_run = f"local:{outbox['dispatch_id']}"
        if outbox["external_run_id"] not in (None, expected_local_run):
            return False, ""
        if result is not None and result["state"] in FINAL_RESULT_STATES:
            return False, ""
        if result is not None and result["state"] == "RUNNING" and result["retry_safety"] != RETRY_SAFE:
            return False, ""
        return True, "LEASE_EXPIRED" if expired else "HEARTBEAT_STALE"

    def _recover_local_claims(self, now: dt.datetime) -> list[dict[str, Any]]:
        resumed: list[dict[str, Any]] = []
        with self.store.tx() as c:
            rows = c.execute(
                """
                SELECT c.*, o.state AS outbox_state, o.executor_kind, o.external_run_id,
                       o.fencing_token AS outbox_fencing_token,
                       o.idempotency_key AS outbox_idempotency_key,
                       o.payload_json AS outbox_payload_json,
                       r.state AS result_state, r.input_digest AS result_input_digest,
                       r.fencing_token AS result_fencing_token,
                       r.execution_generation AS result_execution_generation,
                       r.execution_owner AS result_execution_owner,
                       r.current_attempt_id AS result_attempt_id,
                       r.retry_safety AS result_retry_safety
                FROM claims c
                JOIN dispatch_outbox o ON o.lease_id=c.lease_id
                LEFT JOIN night_execution_results r ON r.dispatch_id=o.dispatch_id
                WHERE c.released_at IS NULL
                ORDER BY c.claimed_at,c.lease_id
                """
            ).fetchall()
            for row in rows:
                self._validate_recovery_identity(row)
                outbox = {
                    "dispatch_id": row["dispatch_id"],
                    "state": row["outbox_state"],
                    "executor_kind": row["executor_kind"],
                    "external_run_id": row["external_run_id"],
                }
                result = None if row["result_state"] is None else {
                    "state": row["result_state"],
                    "retry_safety": row["result_retry_safety"],
                }
                recoverable, reason = self._recoverable(row, outbox, result, now)
                if not recoverable:
                    continue
                lane = self.store._lane(c, row["lane"])
                active = self.store._active_claim(c, row["lane"])
                if active is None or active["lease_id"] != row["lease_id"]:
                    continue
                new_fence = int(lane["fencing_counter"]) + 1
                expires = now + dt.timedelta(seconds=self.lease_seconds)
                c.execute(
                    "UPDATE lanes SET fencing_counter=?,state='CLAIMED',current_delegation_id=?,updated_at=? WHERE lane=?",
                    (new_fence, row["delegation_id"], iso(now), row["lane"]),
                )
                c.execute(
                    """
                    UPDATE claims
                    SET fencing_token=?,expires_at=?,heartbeat_at=?,status='RECOVERED',
                        checkpoint_pointer=COALESCE(checkpoint_pointer,?),terminal_reason=NULL
                    WHERE lease_id=? AND released_at IS NULL
                    """,
                    (new_fence, iso(expires), iso(now), f"execution:{row['dispatch_id']}:recovered", row["lease_id"]),
                )
                c.execute(
                    "UPDATE dispatch_outbox SET fencing_token=?,updated_at=? WHERE dispatch_id=?",
                    (new_fence, iso(now), row["dispatch_id"]),
                )
                old_generation = int(row["result_execution_generation"] or 0)
                new_generation = old_generation
                if row["result_state"] == "RUNNING":
                    new_generation = old_generation + 1
                    if row["result_attempt_id"]:
                        c.execute(
                            "UPDATE night_execution_attempts SET state='FENCED',finished_at=COALESCE(finished_at,?) WHERE attempt_id=? AND state='RUNNING'",
                            (iso(now), row["result_attempt_id"]),
                        )
                    c.execute(
                        """
                        UPDATE night_execution_results
                        SET fencing_token=?,execution_generation=execution_generation+1,
                            execution_owner=NULL,execution_owner_acquired_at=NULL,current_attempt_id=NULL,updated_at=?
                        WHERE dispatch_id=? AND state='RUNNING'
                        """,
                        (new_fence, iso(now), row["dispatch_id"]),
                    )
                elif row["result_state"] == "RESULT_READY":
                    c.execute(
                        """
                        UPDATE night_execution_results
                        SET fencing_token=?,execution_owner=NULL,execution_owner_acquired_at=NULL,updated_at=?
                        WHERE dispatch_id=? AND state='RESULT_READY'
                        """,
                        (new_fence, iso(now), row["dispatch_id"]),
                    )
                self.store._event(
                    c,
                    row["lane"],
                    "LEASE_RECOVERED",
                    now,
                    delegation_id=row["delegation_id"],
                    objective_id=row["objective_id"],
                    lease_id=row["lease_id"],
                    dispatch_id=row["dispatch_id"],
                    idempotency_key=row["idempotency_key"],
                    fencing_token=new_fence,
                    control_head=row["control_head"],
                    payload={
                        "reason": reason,
                        "previous_fencing_token": int(row["fencing_token"]),
                        "expires_at": iso(expires),
                        "identity_preserved": True,
                        "previous_execution_generation": old_generation,
                        "execution_generation": new_generation,
                    },
                )
                resumed.append(
                    {
                        "lease_id": row["lease_id"],
                        "dispatch_id": row["dispatch_id"],
                        "idempotency_key": row["idempotency_key"],
                        "previous_fencing_token": int(row["fencing_token"]),
                        "fencing_token": new_fence,
                        "previous_execution_generation": old_generation,
                        "execution_generation": new_generation,
                        "reason": reason,
                    }
                )
        return resumed

    def recover(self, now: Optional[dt.datetime] = None) -> dict[str, Any]:
        now = now or self.clock()
        evaluation_resumed = []
        rows = self.store.conn.execute(
            "SELECT r.dispatch_id FROM night_execution_results r JOIN claims c ON c.lease_id=r.lease_id JOIN dispatch_outbox o ON o.dispatch_id=r.dispatch_id WHERE r.state='RESULT_READY' AND c.status='VALIDATING' AND c.released_at IS NOT NULL AND o.state='VALIDATING' ORDER BY r.dispatch_id"
        ).fetchall()
        for item in rows:
            dispatch_id = str(item["dispatch_id"])
            self._commit_evaluation_candidate(self._dispatch_bundle(dispatch_id), now)
            evaluation_resumed.append(dispatch_id)
        resumed = self._recover_local_claims(now)
        recovered = self.store.recover(now=now, heartbeat_sla_seconds=self.heartbeat_sla_seconds)
        stale = set(recovered["stale_leases"])
        if stale:
            with self.store.tx() as c:
                placeholders = ",".join("?" for _ in stale)
                attempt_rows = c.execute(
                    f"SELECT current_attempt_id FROM night_execution_results WHERE lease_id IN ({placeholders}) AND state IN ('RUNNING','RESULT_READY')",
                    (*sorted(stale),),
                ).fetchall()
                for item in attempt_rows:
                    if item["current_attempt_id"]:
                        c.execute(
                            "UPDATE night_execution_attempts SET state='FENCED',finished_at=COALESCE(finished_at,?) WHERE attempt_id=? AND state='RUNNING'",
                            (iso(now), item["current_attempt_id"]),
                        )
                c.execute(
                    f"""
                    UPDATE night_execution_results
                    SET state='AUTHORITY_LOST',terminal_state='STALE',finished_at=?,updated_at=?,
                        execution_owner=NULL,execution_owner_acquired_at=NULL,
                        error_class='StaleWorker',error_message='lease recovered as stale before terminal result commit'
                    WHERE lease_id IN ({placeholders}) AND state IN ('RUNNING','RESULT_READY')
                    """,
                    (iso(now), iso(now), *sorted(stale)),
                )
        self.scheduler.reconcile(now=now)
        return {**recovered, "resumed_leases": resumed, "resumed_evaluation_dispatches": evaluation_resumed}

    def _new_attempt_id(self, dispatch_id: str, generation: int) -> str:
        return f"{dispatch_id}-g{generation}-{uuid.uuid4().hex}"

    def _acquire_execution(self, bundle: dict[str, Any], now: dt.datetime) -> ExecutionContext:
        with self.store.tx() as c:
            claim = self.store._claim(c, bundle["lease_id"])
            self.store._assert_live_worker(c, claim, int(bundle["fencing_token"]), now)
            row = c.execute(
                "SELECT * FROM night_execution_results WHERE dispatch_id=?",
                (bundle["dispatch_id"],),
            ).fetchone()
            retry_safety = self._retry_safety_for(bundle["executor_kind"])
            if row is None:
                generation = 1
                attempt_id = self._new_attempt_id(bundle["dispatch_id"], generation)
                evidence_dir = str(self.evidence_root / bundle["dispatch_id"] / attempt_id)
                c.execute(
                    """
                    INSERT INTO night_execution_results(
                      dispatch_id,lease_id,lane,idempotency_key,fencing_token,executor_kind,input_digest,
                      state,attempt_count,started_at,updated_at,execution_generation,execution_owner,
                      execution_owner_acquired_at,current_attempt_id,retry_safety
                    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    """,
                    (
                        bundle["dispatch_id"], bundle["lease_id"], bundle["lane"], bundle["idempotency_key"],
                        int(bundle["fencing_token"]), bundle["executor_kind"], bundle["input_digest"],
                        "RUNNING", 1, iso(now), iso(now), generation, self.worker_id,
                        iso(now), attempt_id, retry_safety,
                    ),
                )
                c.execute(
                    """
                    INSERT INTO night_execution_attempts(
                      attempt_id,dispatch_id,execution_generation,execution_owner,fencing_token,
                      retry_safety,evidence_dir,state,started_at
                    ) VALUES(?,?,?,?,?,?,?,?,?)
                    """,
                    (
                        attempt_id, bundle["dispatch_id"], generation, self.worker_id,
                        int(bundle["fencing_token"]), retry_safety, evidence_dir, "RUNNING", iso(now),
                    ),
                )
            else:
                if row["input_digest"] != bundle["input_digest"]:
                    raise Conflict("dispatch result identity collision")
                if row["state"] in FINAL_RESULT_STATES:
                    raise ExecutionBusy("dispatch is already terminal")
                if row["state"] == "RESULT_READY":
                    raise ExecutionBusy("dispatch result is already staged")
                generation = int(row["execution_generation"])
                if generation < 1:
                    generation = 1
                owner = row["execution_owner"]
                if owner and owner != self.worker_id:
                    raise ExecutionBusy(
                        f"dispatch already owned by execution worker {owner} generation {generation}"
                    )
                attempt_id = row["current_attempt_id"]
                if owner == self.worker_id and attempt_id:
                    retry_safety = str(row["retry_safety"])
                else:
                    attempt_id = self._new_attempt_id(bundle["dispatch_id"], generation)
                    evidence_dir = str(self.evidence_root / bundle["dispatch_id"] / attempt_id)
                    updated = c.execute(
                        """
                        UPDATE night_execution_results
                        SET execution_generation=?,execution_owner=?,execution_owner_acquired_at=?,
                            current_attempt_id=?,retry_safety=?,attempt_count=attempt_count+1,
                            started_at=COALESCE(started_at,?),updated_at=?
                        WHERE dispatch_id=? AND state='RUNNING' AND execution_owner IS NULL
                        """,
                        (
                            generation, self.worker_id, iso(now), attempt_id, retry_safety,
                            iso(now), iso(now), bundle["dispatch_id"],
                        ),
                    )
                    if updated.rowcount != 1:
                        raise ExecutionBusy("dispatch execution ownership changed concurrently")
                    c.execute(
                        """
                        INSERT INTO night_execution_attempts(
                          attempt_id,dispatch_id,execution_generation,execution_owner,fencing_token,
                          retry_safety,evidence_dir,state,started_at
                        ) VALUES(?,?,?,?,?,?,?,?,?)
                        """,
                        (
                            attempt_id, bundle["dispatch_id"], generation, self.worker_id,
                            int(bundle["fencing_token"]), retry_safety, evidence_dir, "RUNNING", iso(now),
                        ),
                    )
            current = c.execute(
                "SELECT * FROM night_execution_results WHERE dispatch_id=?",
                (bundle["dispatch_id"],),
            ).fetchone()
            if current is None or current["execution_owner"] != self.worker_id or not current["current_attempt_id"]:
                raise ExecutionBusy("execution ownership was not acquired")
            return ExecutionContext(
                worker=self,
                dispatch_id=bundle["dispatch_id"],
                lease_id=bundle["lease_id"],
                fencing_token=int(bundle["fencing_token"]),
                idempotency_key=bundle["idempotency_key"],
                delegation_id=bundle["delegation_id"],
                execution_generation=int(current["execution_generation"]),
                execution_owner=str(current["execution_owner"]),
                attempt_id=str(current["current_attempt_id"]),
                retry_safety=str(current["retry_safety"]),
            )

    def _ensure_execution_record(self, bundle: dict[str, Any], now: dt.datetime) -> dict[str, Any]:
        try:
            self._acquire_execution(bundle, now)
        except ExecutionBusy:
            pass
        row = self._result_row(bundle["dispatch_id"])
        if row is None:
            raise ExecutionWorkerError("execution record was not created")
        return row

    def _mark_attempt(self, dispatch_id: str, now: dt.datetime) -> None:
        row = self._result_row(dispatch_id)
        if row is None:
            raise ExecutionWorkerError("unknown execution record")
        if row["execution_owner"] != self.worker_id:
            raise StaleWorker("execution owner is stale")
        # Compatibility no-op: acquisition already records the attempt atomically.

    def _record_authority_lost(self, context: ExecutionContext, message: str, now: dt.datetime) -> None:
        with self.store.tx() as c:
            updated = c.execute(
                """
                UPDATE night_execution_results
                SET state='AUTHORITY_LOST',terminal_state='STALE',finished_at=?,updated_at=?,
                    execution_owner=NULL,execution_owner_acquired_at=NULL,
                    error_class='StaleWorker',error_message=?
                WHERE dispatch_id=? AND execution_generation=? AND execution_owner=?
                  AND current_attempt_id=? AND state='RUNNING'
                """,
                (
                    iso(now), iso(now), message, context.dispatch_id,
                    context.execution_generation, context.execution_owner, context.attempt_id,
                ),
            )
            if updated.rowcount == 1:
                c.execute(
                    "UPDATE night_execution_attempts SET state='FENCED',finished_at=COALESCE(finished_at,?) WHERE attempt_id=? AND state='RUNNING'",
                    (iso(now), context.attempt_id),
                )

    def _stage_owned_result(
        self,
        bundle: dict[str, Any],
        context: ExecutionContext,
        *,
        terminal_state: str,
        result: dict[str, Any],
        error: Optional[BaseException],
        now: dt.datetime,
    ) -> dict[str, Any]:
        if terminal_state not in ("COMPLETED", "BLOCKED"):
            raise ValueError("worker terminal state must be COMPLETED or BLOCKED")
        error_class = error.__class__.__name__ if error is not None else None
        error_message = str(error) if error is not None else None
        terminal_payload = {
            "execution_worker_protocol": EXECUTION_WORKER_PROTOCOL,
            "dispatch_id": bundle["dispatch_id"],
            "executor_kind": bundle["executor_kind"],
            "input_digest": bundle["input_digest"],
            "idempotency_key": bundle["idempotency_key"],
            "execution_generation": context.execution_generation,
            "execution_owner": context.execution_owner,
            "attempt_id": context.attempt_id,
            "retry_safety": context.retry_safety,
            "result": result,
        }
        if error is not None:
            terminal_payload["error"] = {"class": error_class, "message": error_message}
        with self.store.tx() as c:
            claim = self.store._claim(c, context.lease_id)
            self.store._assert_live_worker(c, claim, context.fencing_token, now)
            updated = c.execute(
                """
                UPDATE night_execution_results
                SET state='RESULT_READY',terminal_state=?,result_json=?,error_class=?,error_message=?,updated_at=?
                WHERE dispatch_id=? AND execution_generation=? AND execution_owner=?
                  AND current_attempt_id=? AND state='RUNNING'
                """,
                (
                    terminal_state, json.dumps(terminal_payload, sort_keys=True),
                    error_class, error_message, iso(now), bundle["dispatch_id"],
                    context.execution_generation, context.execution_owner, context.attempt_id,
                ),
            )
            if updated.rowcount != 1:
                raise StaleWorker("execution generation lost before result staging")
            c.execute(
                "UPDATE night_execution_attempts SET state='RESULT_READY',finished_at=COALESCE(finished_at,?) WHERE attempt_id=? AND state='RUNNING'",
                (iso(now), context.attempt_id),
            )
        return terminal_payload

    def _commit_evaluation_candidate(self, bundle: dict[str, Any], now: dt.datetime) -> dict[str, Any]:
        row = self._result_row(bundle["dispatch_id"])
        if row is None:
            raise ExecutionWorkerError("evaluation candidate result does not exist")
        if row["state"] == "SUCCEEDED" and row["terminal_state"] == "VALIDATING":
            return row
        if row["state"] != "RESULT_READY" or int(row["fencing_token"]) != int(bundle["fencing_token"]):
            raise StaleWorker("evaluation candidate staging identity is stale")
        payload = json.loads(row["result_json"] or "{}")
        result = payload.get("result")
        if bundle["executor_kind"] != "AI_CODING" or not isinstance(result, dict):
            raise ExecutionWorkerError("only AI_CODING may enter evaluator validation")
        digest = result.get("patch_sha256")
        if result.get("status") != "CANDIDATE_READY_FOR_INDEPENDENT_EVALUATION" or result.get("evaluator_required") is not True:
            raise ExecutionWorkerError("AI_CODING result is not evaluator-bound")
        if not isinstance(digest, str) or len(digest) != 64 or any(ch not in "0123456789abcdefABCDEF" for ch in digest):
            raise ExecutionWorkerError("AI_CODING candidate requires an exact patch SHA-256")
        self.store.await_evaluation(bundle["lease_id"], int(bundle["fencing_token"]), digest.lower(), payload=payload, now=now)
        with self.store.tx() as c:
            updated = c.execute(
                "UPDATE night_execution_results SET state='SUCCEEDED',terminal_state='VALIDATING',finished_at=?,updated_at=?,execution_owner=NULL,execution_owner_acquired_at=NULL WHERE dispatch_id=? AND state='RESULT_READY' AND execution_generation=? AND current_attempt_id=?",
                (iso(now), iso(now), bundle["dispatch_id"], int(row["execution_generation"]), row["current_attempt_id"]),
            )
            if updated.rowcount == 0:
                current = c.execute("SELECT state,terminal_state FROM night_execution_results WHERE dispatch_id=?", (bundle["dispatch_id"],)).fetchone()
                if current is None or current["state"] != "SUCCEEDED" or current["terminal_state"] != "VALIDATING":
                    raise Conflict("evaluation candidate result changed while committing")
            if row["current_attempt_id"]:
                c.execute("UPDATE night_execution_attempts SET state='SUCCEEDED',finished_at=COALESCE(finished_at,?) WHERE attempt_id=? AND state='RESULT_READY'", (iso(now), row["current_attempt_id"]))
        self.scheduler.reconcile(now=now)
        return self._result_row(bundle["dispatch_id"]) or {}

    def _stage_result(
        self,
        bundle: dict[str, Any],
        *,
        terminal_state: str,
        result: dict[str, Any],
        error: Optional[BaseException],
        now: dt.datetime,
    ) -> dict[str, Any]:
        row = self._result_row(bundle["dispatch_id"])
        if row is None or row["execution_owner"] != self.worker_id or not row["current_attempt_id"]:
            raise StaleWorker("current worker does not own execution result")
        context = ExecutionContext(
            worker=self,
            dispatch_id=bundle["dispatch_id"],
            lease_id=bundle["lease_id"],
            fencing_token=int(bundle["fencing_token"]),
            idempotency_key=bundle["idempotency_key"],
            delegation_id=bundle["delegation_id"],
            execution_generation=int(row["execution_generation"]),
            execution_owner=str(row["execution_owner"]),
            attempt_id=str(row["current_attempt_id"]),
            retry_safety=str(row["retry_safety"]),
        )
        return self._stage_owned_result(
            bundle,
            context,
            terminal_state=terminal_state,
            result=result,
            error=error,
            now=now,
        )

    def _commit_staged_result(self, bundle: dict[str, Any], now: dt.datetime) -> dict[str, Any]:
        row = self._result_row(bundle["dispatch_id"])
        if row is None:
            raise ExecutionWorkerError("result does not exist")
        if row["state"] in FINAL_RESULT_STATES:
            return row
        if row["state"] != "RESULT_READY" or not row["terminal_state"]:
            raise ExecutionWorkerError("result is not staged for terminal commit")
        if int(row["fencing_token"]) != int(bundle["fencing_token"]):
            raise StaleWorker("staged result fence differs from live dispatch fence")
        payload = json.loads(row["result_json"] or "{}")
        self.store.terminal(
            bundle["lease_id"],
            int(bundle["fencing_token"]),
            row["terminal_state"],
            payload=payload,
            now=now,
        )
        final = "SUCCEEDED" if row["terminal_state"] == "COMPLETED" else "FAILED"
        with self.store.tx() as c:
            updated = c.execute(
                """
                UPDATE night_execution_results
                SET state=?,finished_at=?,updated_at=?,execution_owner=NULL,execution_owner_acquired_at=NULL
                WHERE dispatch_id=? AND state='RESULT_READY' AND execution_generation=?
                  AND current_attempt_id=?
                """,
                (
                    final, iso(now), iso(now), bundle["dispatch_id"],
                    int(row["execution_generation"]), row["current_attempt_id"],
                ),
            )
            if updated.rowcount == 0:
                current = c.execute(
                    "SELECT * FROM night_execution_results WHERE dispatch_id=?",
                    (bundle["dispatch_id"],),
                ).fetchone()
                if current is None or current["state"] not in FINAL_RESULT_STATES:
                    raise Conflict("terminal result changed while committing")
            if row["current_attempt_id"]:
                c.execute(
                    "UPDATE night_execution_attempts SET state=?,finished_at=COALESCE(finished_at,?) WHERE attempt_id=? AND state='RESULT_READY'",
                    (final, iso(now), row["current_attempt_id"]),
                )
        self.scheduler.reconcile(now=now)
        return self._result_row(bundle["dispatch_id"]) or {}

    def _validate_payload_envelope(self, bundle: dict[str, Any]) -> dict[str, Any]:
        envelope = bundle["payload_envelope"]
        if not isinstance(envelope, dict) or "payload" not in envelope or "payload_digest" not in envelope:
            raise ExecutionWorkerError("dispatch payload envelope is incomplete")
        if _digest(envelope["payload"]) != envelope["payload_digest"]:
            raise ExecutionWorkerError("dispatch payload digest mismatch")
        return envelope["payload"]

    def consume_dispatch(self, dispatch_id: str, now: Optional[dt.datetime] = None) -> dict[str, Any]:
        now = now or self.clock()
        bundle = self._dispatch_bundle(dispatch_id)
        existing = self._result_row(dispatch_id)
        if existing is not None and existing["input_digest"] != bundle["input_digest"]:
            raise Conflict("dispatch result identity collision")
        if existing is not None and existing["state"] in FINAL_RESULT_STATES:
            return existing
        if existing is not None and existing["state"] == "RESULT_READY":
            staged = json.loads(existing["result_json"] or "{}")
            result = staged.get("result")
            if isinstance(result, dict) and result.get("evaluator_required") is True:
                return self._commit_evaluation_candidate(bundle, now)
            return self._commit_staged_result(bundle, now)
        if bundle["released_at"] is not None:
            raise StaleWorker("dispatch claim is already released without a committed worker result")
        if bundle["state"] not in ("PENDING", "DISPATCHED"):
            raise ExecutionWorkerError(f"dispatch is not executable from state {bundle['state']}")
        context = self._acquire_execution(bundle, now)
        try:
            context.renew(checkpoint_pointer=f"execution:{dispatch_id}:starting", now=now)
            self.store.mark_dispatched(dispatch_id, f"local:{dispatch_id}", now=now)
            payload = self._validate_payload_envelope(bundle)
            executor = self.executors.get(bundle["executor_kind"])
            if executor is None:
                raise UnsupportedExecutor(f"unsupported executor kind: {bundle['executor_kind']}")
            result = executor(payload, context)
            if not isinstance(result, dict):
                raise ExecutionWorkerError("executor result must be an object")
            end = self.clock()
            context.renew(checkpoint_pointer=f"execution:{dispatch_id}:result-ready", now=end)
            self._stage_owned_result(
                bundle, context, terminal_state="COMPLETED", result=result, error=None, now=end
            )
            if result.get("evaluator_required") is True:
                return self._commit_evaluation_candidate(bundle, end)
            return self._commit_staged_result(bundle, end)
        except StaleWorker:
            self._record_authority_lost(
                context, "fencing or execution authority lost during execution", self.clock()
            )
            raise
        except Exception as exc:
            failure_result = exc.result if isinstance(exc, WorkExecutionFailed) else {}
            failure_result = {**failure_result, "status": "BLOCKED"}
            failure_now = self.clock()
            try:
                context.renew(
                    checkpoint_pointer=f"execution:{dispatch_id}:blocked",
                    now=failure_now,
                )
                self._stage_owned_result(
                    bundle,
                    context,
                    terminal_state="BLOCKED",
                    result=failure_result,
                    error=exc,
                    now=failure_now,
                )
                return self._commit_staged_result(bundle, failure_now)
            except StaleWorker:
                self._record_authority_lost(
                    context, "fencing or execution authority lost while recording failure", failure_now
                )
                raise

    def _live_dispatch_ids(self) -> list[str]:
        rows = self.store.conn.execute(
            """
            SELECT o.dispatch_id
            FROM dispatch_outbox o
            JOIN claims c ON c.lease_id=o.lease_id
            WHERE c.released_at IS NULL AND o.state IN ('PENDING','DISPATCHED')
            ORDER BY c.claimed_at,o.dispatch_id
            """
        ).fetchall()
        return [str(row["dispatch_id"]) for row in rows]

    def run_once(self, now: Optional[dt.datetime] = None) -> dict[str, Any]:
        now = now or self.clock()
        recovery = self.recover(now=now)
        live = self._live_dispatch_ids()
        scheduler_tick: Optional[dict[str, Any]] = None
        if not live:
            scheduler_tick = self.scheduler.tick(now=now, max_claims=1, lease_seconds=self.lease_seconds)
            live = [str(item["dispatch_id"]) for item in scheduler_tick["claims"]]
        if not live:
            return {
                "protocol_version": EXECUTION_WORKER_PROTOCOL,
                "at": iso(now),
                "recovery": recovery,
                "scheduler": scheduler_tick,
                "execution": None,
                "busy_dispatch": None,
            }
        try:
            result = self.consume_dispatch(live[0], now=now)
        except ExecutionBusy as exc:
            return {
                "protocol_version": EXECUTION_WORKER_PROTOCOL,
                "at": iso(now),
                "recovery": recovery,
                "scheduler": scheduler_tick,
                "execution": None,
                "busy_dispatch": {"dispatch_id": live[0], "reason": str(exc)},
            }
        self.scheduler.reconcile(now=now)
        return {
            "protocol_version": EXECUTION_WORKER_PROTOCOL,
            "at": iso(now),
            "recovery": recovery,
            "scheduler": scheduler_tick,
            "execution": result,
            "busy_dispatch": None,
        }

    def _git_head(self) -> str:
        proc = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=self.root, capture_output=True, text=True, shell=False
        )
        if proc.returncode != 0:
            raise WorkExecutionFailed("git rev-parse failed", {"stderr": proc.stderr.strip()})
        return proc.stdout.strip()

    @staticmethod
    def _require_string(payload: dict[str, Any], name: str) -> str:
        value = payload.get(name)
        if not isinstance(value, str) or not value:
            raise WorkExecutionFailed(f"missing required qualification payload field: {name}")
        return value

    def _spawn_managed_process(
        self,
        args: list[str],
        *,
        cwd: Optional[Path] = None,
        env: Optional[dict[str, str]] = None,
        stdout: Any = subprocess.PIPE,
        stderr: Any = subprocess.PIPE,
        text: bool = True,
    ) -> subprocess.Popen:
        kwargs: dict[str, Any] = {
            "cwd": cwd or self.root,
            "env": env,
            "stdout": stdout,
            "stderr": stderr,
            "text": text,
            "shell": False,
        }
        if os.name == "nt":
            kwargs["creationflags"] = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        else:
            kwargs["start_new_session"] = True
        return subprocess.Popen(args, **kwargs)

    def _terminate_process_tree(self, proc: subprocess.Popen) -> None:
        if proc.poll() is not None:
            return
        if os.name == "nt":
            killed = subprocess.run(
                ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                capture_output=True,
                text=True,
                shell=False,
                timeout=15,
            )
            if killed.returncode != 0 and proc.poll() is None:
                proc.kill()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)
            return
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except ProcessLookupError:
            return
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
            except ProcessLookupError:
                pass
            proc.wait(timeout=5)

    def _execute_ai_coding(self, payload: dict[str, Any], context: ExecutionContext) -> dict[str, Any]:
        try:
            return dispatch_ai_coding(payload, context, root=self.root)
        except DispatchAmbiguousError as exc:
            raise WorkExecutionFailed(
                "AI_CODING dispatch requires reconciliation before retry",
                {"reconciliation_required": True, **exc.details},
            ) from exc
        except ModelDispatchFailed as exc:
            raise WorkExecutionFailed("AI_CODING model dispatch failed", exc.details) from exc
        except ModelDispatchError as exc:
            raise WorkExecutionFailed("AI_CODING model dispatch rejected", {"error": str(exc)}) from exc

    def _execute_a01_qualification(self, payload: dict[str, Any], context: ExecutionContext) -> dict[str, Any]:
        if not isinstance(payload, dict):
            raise WorkExecutionFailed("qualification payload must be an object")
        qualification_id = self._require_string(payload, "qualification_id")
        workstream_id = self._require_string(payload, "workstream_id")
        subject_sha = self._require_string(payload, "subject_sha")
        if len(subject_sha) != 40 or any(ch not in "0123456789abcdefABCDEF" for ch in subject_sha):
            raise WorkExecutionFailed("subject_sha must be a 40-character hexadecimal Git SHA")
        checkout = self._git_head()
        if checkout.lower() != subject_sha.lower():
            raise WorkExecutionFailed(
                "local checkout does not match admitted qualification subject",
                {"expected_subject_sha": subject_sha, "checkout_sha": checkout},
            )
        control_plane_sha = payload.get("control_plane_sha", checkout)
        if not isinstance(control_plane_sha, str) or control_plane_sha.lower() != checkout.lower():
            raise WorkExecutionFailed(
                "local worker requires admitted control plane to match its exact checkout",
                {"control_plane_sha": control_plane_sha, "checkout_sha": checkout},
            )
        qualifier_timeout = int(payload.get("qualifier_timeout_minutes", 28))
        if qualifier_timeout < 1 or qualifier_timeout > 240:
            raise WorkExecutionFailed("qualifier_timeout_minutes must be 1..240")
        queue_row = self.store.conn.execute(
            "SELECT handoff_json FROM night_scheduler_queue WHERE delegation_id=?",
            (context.delegation_id,),
        ).fetchone()
        if queue_row is None:
            raise WorkExecutionFailed("qualification dispatch is missing its scheduler handoff")
        handoff = json.loads(queue_row["handoff_json"])
        not_before = handoff.get("not_before")
        not_after = handoff.get("not_after")
        if not not_before or not not_after:
            raise WorkExecutionFailed("overnight qualification requires an admitted not_before/not_after window")
        evidence_dir = context.evidence_dir
        evidence_dir.mkdir(parents=True, exist_ok=False)
        env = os.environ.copy()
        env.update(
            {
                "A01_QUALIFICATION_ID": qualification_id,
                "A01_WORKSTREAM_ID": workstream_id,
                "A01_SUBJECT_SHA": subject_sha,
                "A01_CONTROL_PLANE_SHA": control_plane_sha,
                "A01_ORIGIN_REF": str(payload.get("origin_ref") or "a01-local-execution-worker"),
                "A01_RESUME_ON_PASS": str(payload.get("resume_on_pass") or "Continue the next dependency-valid objective."),
                "A01_RESUME_ON_FAILURE": str(payload.get("resume_on_failure") or "Adjudicate evidence and repair the failing boundary."),
                "A01_NOTIFICATION_TARGET": str(payload.get("notification_target") or "originating-workstream"),
                "A01_EXECUTION_CONTEXT": "overnight",
                "A01_QUALIFIER_TIMEOUT_MINUTES": str(qualifier_timeout),
                "A01_NOT_BEFORE": str(not_before),
                "A01_NOT_AFTER": str(not_after),
                "A01_CONTROL_ROOT": str(self.root),
                "A01_SUBJECT_ROOT": str(self.root),
                "A01_EVIDENCE_DIR": str(evidence_dir),
                "A01_ARTIFACT_NAME": f"{qualification_id}-{context.attempt_id}-evidence",
                "A01_IDEMPOTENCY_KEY": context.idempotency_key,
                "A01_DISPATCH_ID": context.dispatch_id,
                "A01_EXECUTION_GENERATION": str(context.execution_generation),
                "A01_EXECUTION_OWNER": context.execution_owner,
                "A01_EXECUTION_ATTEMPT_ID": context.attempt_id,
                "A01_RETRY_SAFETY": context.retry_safety,
            }
        )
        script = self.root / ".github" / "scripts" / "a01-control-plane.js"
        if not script.is_file():
            raise WorkExecutionFailed("A-01 control-plane executor script is missing")
        proc = self._spawn_managed_process(
            ["node", str(script), "execute"],
            cwd=self.root,
            env=env,
        )
        stdout = ""
        stderr = ""
        try:
            while True:
                try:
                    stdout, stderr = proc.communicate(timeout=self.renew_seconds)
                    break
                except subprocess.TimeoutExpired:
                    context.renew(
                        checkpoint_pointer=f"execution:{context.dispatch_id}:qualification-running"
                    )
        except StaleWorker:
            self._terminate_process_tree(proc)
            raise
        receipt_path = evidence_dir / "receipt.json"
        receipt = None
        if receipt_path.is_file():
            receipt = json.loads(receipt_path.read_text(encoding="utf-8-sig"))
        details = {
            "returncode": proc.returncode,
            "stdout_tail": stdout[-4000:],
            "stderr_tail": stderr[-4000:],
            "evidence_dir": str(evidence_dir),
            "attempt_id": context.attempt_id,
            "execution_generation": context.execution_generation,
            "receipt": receipt,
        }
        if proc.returncode != 0 or not isinstance(receipt, dict) or receipt.get("result_class") != "PASS":
            raise WorkExecutionFailed("registered A-01 qualification did not PASS", details)
        return details


def main() -> int:
    parser = argparse.ArgumentParser(description="A-01 authorized Second Shift execution worker")
    parser.add_argument("--db", required=True, help="Supervisor SQLite database path")
    parser.add_argument("--once", action="store_true", help="Execute at most one authorized dispatch and exit")
    parser.add_argument("--poll-seconds", type=int, default=5)
    parser.add_argument("--lease-seconds", type=int, default=300)
    parser.add_argument("--renew-seconds", type=int, default=30)
    parser.add_argument("--heartbeat-sla-seconds", type=int, default=300)
    parser.add_argument("--root", default=str(ROOT), help="Exact local repository checkout used by registered executors")
    parser.add_argument("--evidence-root", default="", help="Durable local evidence directory")
    args = parser.parse_args()
    if args.poll_seconds < 1 or args.poll_seconds > 3600:
        parser.error("--poll-seconds must be 1..3600")
    with SupervisorStore(Path(args.db)) as store:
        worker = A01ExecutionWorker(
            store,
            root=Path(args.root),
            lease_seconds=args.lease_seconds,
            renew_seconds=args.renew_seconds,
            heartbeat_sla_seconds=args.heartbeat_sla_seconds,
            evidence_root=Path(args.evidence_root) if args.evidence_root else None,
        )
        if args.once:
            print(json.dumps(worker.run_once(), sort_keys=True))
            return 0
        while True:
            result = worker.run_once()
            print(json.dumps(result, sort_keys=True), flush=True)
            if result["execution"] is None:
                time.sleep(args.poll_seconds)


if __name__ == "__main__":
    raise SystemExit(main())
