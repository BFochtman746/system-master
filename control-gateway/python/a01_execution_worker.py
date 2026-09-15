#!/usr/bin/env python3
"""A-01 local execution worker for authorized Second Shift claims.

The scheduler remains the sole claim authority. This worker consumes only claims already
materialized in the supervisor dispatch outbox, keeps their leases alive under the exact
fence, persists idempotent execution results, terminalizes the claim, performs fenced
crash recovery for locally executable dispatches, and returns control to the scheduler
for the next dependency-valid continuation.
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Callable, Optional

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from a01_night_scheduler import A01NightScheduler
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


class ExecutionWorkerError(RuntimeError):
    pass


class UnsupportedExecutor(ExecutionWorkerError):
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

    def renew(self, checkpoint_pointer: Optional[str] = None, now: Optional[dt.datetime] = None) -> str:
        return self.worker.renew_lease(
            self.lease_id,
            self.fencing_token,
            checkpoint_pointer=checkpoint_pointer,
            now=now,
        )


Executor = Callable[[dict[str, Any], ExecutionContext], dict[str, Any]]


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _digest(value: Any) -> str:
    return hashlib.sha256(_canonical(value).encode("utf-8")).hexdigest()


class A01ExecutionWorker:
    """Consume authorized dispatches and execute them under durable lease/fence state.

    Executor functions are required to be idempotent for the supplied idempotency_key.
    The built-in A-01 qualification executor satisfies this by executing only the
    registered, no-post-action overnight qualification path. Recovery never invents a
    new claim or admission identity: it rotates fencing authority on the existing
    lease/dispatch identity so an old worker is rejected while the same durable work
    can resume.
    """

    def __init__(
        self,
        store: SupervisorStore,
        *,
        root: Optional[Path] = None,
        scheduler: Optional[A01NightScheduler] = None,
        executors: Optional[dict[str, Executor]] = None,
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
        if worker_id is not None and (not isinstance(worker_id, str) or not worker_id.strip()):
            raise ValueError("worker_id must be a non-empty string")
        self.store = store
        self.root = (root or ROOT).resolve()
        self.scheduler = scheduler or A01NightScheduler(store)
        self.lease_seconds = lease_seconds
        self.renew_seconds = renew_seconds
        self.heartbeat_sla_seconds = heartbeat_sla_seconds
        self.evidence_root = (evidence_root or (Path(store.db_path).resolve().parent / "execution-evidence")).resolve()
        self.clock = clock
        self.worker_id = worker_id or f"a01-worker:{os.getpid()}:{time.time_ns()}:{id(self):x}"
        self.executors: dict[str, Executor] = {
            "A01_CONTROL_PLANE_QUALIFICATION": self._execute_a01_qualification,
        }
        if executors:
            self.executors.update(executors)
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
                  error_message TEXT
                )
                """
            )
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS night_execution_owners (
                  dispatch_id TEXT PRIMARY KEY REFERENCES dispatch_outbox(dispatch_id),
                  owner_worker_id TEXT NOT NULL,
                  fencing_token INTEGER NOT NULL,
                  acquired_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                )
                """
            )
            c.execute(
                "CREATE INDEX IF NOT EXISTS ix_night_execution_results_state ON night_execution_results(state)"
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
        # Fencing generation is deliberately not part of work identity. Recovery
        # rotates the fence while preserving the same admitted dispatch/idempotency
        # identity, so the durable result must remain addressable across that rotation.
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

    def _assert_owned_result(
        self,
        c: Any,
        bundle: dict[str, Any],
        *,
        states: set[str],
        now: Optional[dt.datetime] = None,
        require_live_fence: bool = True,
    ) -> Any:
        fence = int(bundle["fencing_token"])
        if require_live_fence:
            if now is None:
                raise ValueError("now is required for live-fence validation")
            claim = self.store._claim(c, bundle["lease_id"])
            self.store._assert_live_worker(c, claim, fence, now)
        owner = c.execute(
            "SELECT owner_worker_id,fencing_token FROM night_execution_owners WHERE dispatch_id=?",
            (bundle["dispatch_id"],),
        ).fetchone()
        if owner is None or owner["owner_worker_id"] != self.worker_id or int(owner["fencing_token"]) != fence:
            raise StaleWorker("execution ownership or fencing authority changed")
        row = c.execute(
            "SELECT * FROM night_execution_results WHERE dispatch_id=?",
            (bundle["dispatch_id"],),
        ).fetchone()
        if row is None:
            raise ExecutionWorkerError("execution result record is missing")
        if row["input_digest"] != bundle["input_digest"]:
            raise Conflict("dispatch result identity collision")
        if int(row["fencing_token"]) != fence:
            raise StaleWorker("execution result fencing authority changed")
        if row["state"] not in states:
            raise ExecutionWorkerError(f"execution result is not mutable from state {row['state']}")
        return row

    def _mark_authority_lost_if_owned(self, bundle: dict[str, Any], message: str, now: dt.datetime) -> bool:
        fence = int(bundle["fencing_token"])
        with self.store.tx() as c:
            changed = c.execute(
                """
                UPDATE night_execution_results
                SET state='AUTHORITY_LOST',terminal_state='STALE',finished_at=?,updated_at=?,
                    error_class='StaleWorker',error_message=?
                WHERE dispatch_id=? AND fencing_token=? AND state IN ('RUNNING','RESULT_READY')
                  AND EXISTS (
                    SELECT 1 FROM night_execution_owners o
                    WHERE o.dispatch_id=night_execution_results.dispatch_id
                      AND o.owner_worker_id=? AND o.fencing_token=?
                  )
                """,
                (iso(now), iso(now), message, bundle["dispatch_id"], fence, self.worker_id, fence),
            ).rowcount
        return changed == 1

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
        return True, "LEASE_EXPIRED" if expired else "HEARTBEAT_STALE"

    def _recover_local_claims(self, now: dt.datetime) -> list[dict[str, Any]]:
        resumed: list[dict[str, Any]] = []
        with self.store.tx() as c:
            rows = c.execute(
                """
                SELECT c.*, o.state AS outbox_state, o.executor_kind, o.external_run_id,
                       o.fencing_token AS outbox_fencing_token,
                       r.state AS result_state, r.input_digest AS result_input_digest
                FROM claims c
                JOIN dispatch_outbox o ON o.lease_id=c.lease_id
                LEFT JOIN night_execution_results r ON r.dispatch_id=o.dispatch_id
                WHERE c.released_at IS NULL
                ORDER BY c.claimed_at,c.lease_id
                """
            ).fetchall()
            for row in rows:
                outbox = {
                    "dispatch_id": row["dispatch_id"],
                    "state": row["outbox_state"],
                    "executor_kind": row["executor_kind"],
                    "external_run_id": row["external_run_id"],
                }
                result = None if row["result_state"] is None else {"state": row["result_state"]}
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
                c.execute(
                    "UPDATE night_execution_results SET fencing_token=?,updated_at=? WHERE dispatch_id=? AND state IN ('RUNNING','RESULT_READY')",
                    (new_fence, iso(now), row["dispatch_id"]),
                )
                c.execute(
                    """
                    INSERT INTO night_execution_owners(dispatch_id,owner_worker_id,fencing_token,acquired_at,updated_at)
                    VALUES(?,?,?,?,?)
                    ON CONFLICT(dispatch_id) DO UPDATE SET
                      owner_worker_id=excluded.owner_worker_id,
                      fencing_token=excluded.fencing_token,
                      acquired_at=excluded.acquired_at,
                      updated_at=excluded.updated_at
                    """,
                    (row["dispatch_id"], self.worker_id, new_fence, iso(now), iso(now)),
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
                    },
                )
                resumed.append(
                    {
                        "lease_id": row["lease_id"],
                        "dispatch_id": row["dispatch_id"],
                        "idempotency_key": row["idempotency_key"],
                        "previous_fencing_token": int(row["fencing_token"]),
                        "fencing_token": new_fence,
                        "reason": reason,
                    }
                )
        return resumed

    def recover(self, now: Optional[dt.datetime] = None) -> dict[str, Any]:
        now = now or self.clock()
        resumed = self._recover_local_claims(now)
        # Anything not safely resumable by this local worker keeps the supervisor's
        # fail-closed recovery semantics and is terminally fenced stale.
        recovered = self.store.recover(now=now, heartbeat_sla_seconds=self.heartbeat_sla_seconds)
        stale = set(recovered["stale_leases"])
        if stale:
            with self.store.tx() as c:
                placeholders = ",".join("?" for _ in stale)
                c.execute(
                    f"""
                    UPDATE night_execution_results
                    SET state='AUTHORITY_LOST',terminal_state='STALE',finished_at=?,updated_at=?,
                        error_class='StaleWorker',error_message='lease recovered as stale before terminal result commit'
                    WHERE lease_id IN ({placeholders}) AND state IN ('RUNNING','RESULT_READY')
                    """,
                    (iso(now), iso(now), *sorted(stale)),
                )
        self.scheduler.reconcile(now=now)
        return {**recovered, "resumed_leases": resumed}

    def _ensure_execution_record(self, bundle: dict[str, Any], now: dt.datetime) -> dict[str, Any]:
        fence = int(bundle["fencing_token"])
        with self.store.tx() as c:
            claim = self.store._claim(c, bundle["lease_id"])
            self.store._assert_live_worker(c, claim, fence, now)
            existing = c.execute(
                "SELECT * FROM night_execution_results WHERE dispatch_id=?",
                (bundle["dispatch_id"],),
            ).fetchone()
            if existing is not None and existing["input_digest"] != bundle["input_digest"]:
                raise Conflict("dispatch result identity collision")
            owner = c.execute(
                "SELECT owner_worker_id,fencing_token FROM night_execution_owners WHERE dispatch_id=?",
                (bundle["dispatch_id"],),
            ).fetchone()
            if owner is None:
                c.execute(
                    """
                    INSERT INTO night_execution_owners(dispatch_id,owner_worker_id,fencing_token,acquired_at,updated_at)
                    VALUES(?,?,?,?,?)
                    """,
                    (bundle["dispatch_id"], self.worker_id, fence, iso(now), iso(now)),
                )
            elif owner["owner_worker_id"] != self.worker_id or int(owner["fencing_token"]) != fence:
                raise StaleWorker("dispatch execution is owned by another worker or fencing generation")
            if existing is not None:
                if int(existing["fencing_token"]) != fence:
                    raise StaleWorker("execution result fencing generation does not match live authority")
                return dict(existing)
            c.execute(
                """
                INSERT INTO night_execution_results(
                  dispatch_id,lease_id,lane,idempotency_key,fencing_token,executor_kind,input_digest,
                  state,attempt_count,started_at,updated_at
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    bundle["dispatch_id"], bundle["lease_id"], bundle["lane"], bundle["idempotency_key"],
                    fence, bundle["executor_kind"], bundle["input_digest"],
                    "RUNNING", 0, iso(now), iso(now),
                ),
            )
            created = c.execute(
                "SELECT * FROM night_execution_results WHERE dispatch_id=?",
                (bundle["dispatch_id"],),
            ).fetchone()
            return dict(created) if created is not None else {}

    def _mark_attempt(self, bundle: dict[str, Any], now: dt.datetime) -> None:
        fence = int(bundle["fencing_token"])
        with self.store.tx() as c:
            self._assert_owned_result(c, bundle, states={"RUNNING"}, now=now)
            changed = c.execute(
                """
                UPDATE night_execution_results
                SET attempt_count=attempt_count+1,state='RUNNING',updated_at=?
                WHERE dispatch_id=? AND fencing_token=? AND state='RUNNING'
                  AND EXISTS (
                    SELECT 1 FROM night_execution_owners o
                    WHERE o.dispatch_id=night_execution_results.dispatch_id
                      AND o.owner_worker_id=? AND o.fencing_token=?
                  )
                """,
                (iso(now), bundle["dispatch_id"], fence, self.worker_id, fence),
            ).rowcount
            if changed != 1:
                raise StaleWorker("execution attempt lost owner/fence authority")

    def _stage_result(
        self,
        bundle: dict[str, Any],
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
            "result": result,
        }
        if error is not None:
            terminal_payload["error"] = {"class": error_class, "message": error_message}
        fence = int(bundle["fencing_token"])
        with self.store.tx() as c:
            self._assert_owned_result(c, bundle, states={"RUNNING"}, now=now)
            changed = c.execute(
                """
                UPDATE night_execution_results
                SET state='RESULT_READY',terminal_state=?,result_json=?,error_class=?,error_message=?,updated_at=?
                WHERE dispatch_id=? AND fencing_token=? AND state='RUNNING'
                  AND EXISTS (
                    SELECT 1 FROM night_execution_owners o
                    WHERE o.dispatch_id=night_execution_results.dispatch_id
                      AND o.owner_worker_id=? AND o.fencing_token=?
                  )
                """,
                (
                    terminal_state,
                    json.dumps(terminal_payload, sort_keys=True),
                    error_class,
                    error_message,
                    iso(now),
                    bundle["dispatch_id"],
                    fence,
                    self.worker_id,
                    fence,
                ),
            ).rowcount
            if changed != 1:
                raise StaleWorker("execution result lost owner/fence authority before staging")
        return terminal_payload

    def _commit_staged_result(self, bundle: dict[str, Any], now: dt.datetime) -> dict[str, Any]:
        fence = int(bundle["fencing_token"])
        with self.store.tx() as c:
            row = self._assert_owned_result(c, bundle, states={"RESULT_READY"}, now=now)
            terminal_state = row["terminal_state"]
            payload = json.loads(row["result_json"] or "{}")
        if not terminal_state:
            raise ExecutionWorkerError("result is not staged for terminal commit")
        try:
            self.store.terminal(
                bundle["lease_id"],
                fence,
                terminal_state,
                payload=payload,
                now=now,
            )
        except StaleWorker:
            self._mark_authority_lost_if_owned(
                bundle,
                "fencing authority lost before terminal result commit",
                now,
            )
            raise
        final = "SUCCEEDED" if terminal_state == "COMPLETED" else "FAILED"
        with self.store.tx() as c:
            changed = c.execute(
                """
                UPDATE night_execution_results
                SET state=?,finished_at=?,updated_at=?
                WHERE dispatch_id=? AND fencing_token=? AND state='RESULT_READY'
                  AND EXISTS (
                    SELECT 1 FROM night_execution_owners o
                    WHERE o.dispatch_id=night_execution_results.dispatch_id
                      AND o.owner_worker_id=? AND o.fencing_token=?
                  )
                """,
                (final, iso(now), iso(now), bundle["dispatch_id"], fence, self.worker_id, fence),
            ).rowcount
            if changed != 1:
                raise StaleWorker("execution result lost owner/fence authority after terminal commit")
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
            return self._commit_staged_result(bundle, now)
        if bundle["released_at"] is not None:
            raise StaleWorker("dispatch claim is already released without a committed worker result")
        if bundle["state"] not in ("PENDING", "DISPATCHED"):
            raise ExecutionWorkerError(f"dispatch is not executable from state {bundle['state']}")
        self._ensure_execution_record(bundle, now)
        self.renew_lease(
            bundle["lease_id"], int(bundle["fencing_token"]),
            checkpoint_pointer=f"execution:{dispatch_id}:starting", now=now,
        )
        self.store.mark_dispatched(dispatch_id, f"local:{dispatch_id}", now=now)
        self._mark_attempt(bundle, now)
        context = ExecutionContext(
            worker=self,
            dispatch_id=dispatch_id,
            lease_id=bundle["lease_id"],
            fencing_token=int(bundle["fencing_token"]),
            idempotency_key=bundle["idempotency_key"],
            delegation_id=bundle["delegation_id"],
        )
        try:
            payload = self._validate_payload_envelope(bundle)
            executor = self.executors.get(bundle["executor_kind"])
            if executor is None:
                raise UnsupportedExecutor(f"unsupported executor kind: {bundle['executor_kind']}")
            result = executor(payload, context)
            if not isinstance(result, dict):
                raise ExecutionWorkerError("executor result must be an object")
            end = self.clock()
            self.renew_lease(
                bundle["lease_id"], int(bundle["fencing_token"]),
                checkpoint_pointer=f"execution:{dispatch_id}:result-ready", now=end,
            )
            self._stage_result(bundle, terminal_state="COMPLETED", result=result, error=None, now=end)
            return self._commit_staged_result(bundle, end)
        except StaleWorker:
            lost_at = self.clock()
            self._mark_authority_lost_if_owned(
                bundle,
                "fencing authority lost during execution",
                lost_at,
            )
            raise
        except Exception as exc:
            failure_result = exc.result if isinstance(exc, WorkExecutionFailed) else {}
            failure_result = {**failure_result, "status": "BLOCKED"}
            failure_now = self.clock()
            try:
                self.renew_lease(
                    bundle["lease_id"], int(bundle["fencing_token"]),
                    checkpoint_pointer=f"execution:{dispatch_id}:blocked", now=failure_now,
                )
                self._stage_result(bundle, terminal_state="BLOCKED", result=failure_result, error=exc, now=failure_now)
                return self._commit_staged_result(bundle, failure_now)
            except StaleWorker:
                self._mark_authority_lost_if_owned(
                    bundle,
                    "fencing authority lost while recording failure",
                    failure_now,
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
            }
        result = self.consume_dispatch(live[0], now=now)
        self.scheduler.reconcile(now=now)
        return {
            "protocol_version": EXECUTION_WORKER_PROTOCOL,
            "at": iso(now),
            "recovery": recovery,
            "scheduler": scheduler_tick,
            "execution": result,
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
        evidence_dir = self.evidence_root / context.dispatch_id
        evidence_dir.mkdir(parents=True, exist_ok=True)
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
                "A01_ARTIFACT_NAME": f"{qualification_id}-{context.dispatch_id}-evidence",
                "A01_IDEMPOTENCY_KEY": context.idempotency_key,
                "A01_DISPATCH_ID": context.dispatch_id,
            }
        )
        script = self.root / ".github" / "scripts" / "a01-control-plane.js"
        if not script.is_file():
            raise WorkExecutionFailed("A-01 control-plane executor script is missing")
        proc = subprocess.Popen(
            ["node", str(script), "execute"],
            cwd=self.root,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            shell=False,
        )
        stdout = ""
        stderr = ""
        try:
            while True:
                try:
                    stdout, stderr = proc.communicate(timeout=self.renew_seconds)
                    break
                except subprocess.TimeoutExpired:
                    context.renew(checkpoint_pointer=f"execution:{context.dispatch_id}:qualification-running")
        except StaleWorker:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
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
            "receipt": receipt,
        }
        if proc.returncode != 0 or not isinstance(receipt, dict) or receipt.get("result_class") != "PASS":
            raise WorkExecutionFailed("registered A-01 qualification did not PASS", details)
        return details


def _cli() -> int:
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
    raise SystemExit(_cli())