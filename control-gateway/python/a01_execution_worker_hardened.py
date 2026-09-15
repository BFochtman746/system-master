#!/usr/bin/env python3
"""PQF hardened A-01 execution worker.

This is a compatibility-preserving hardening layer over a01_execution_worker.py.
It keeps the v1 dispatch/claim protocol but adds a second, transactionally owned
execution generation so one durable claim cannot be executed by two worker
processes at the same time. All result mutation is fenced by dispatch identity,
claim fence, execution generation, and worker owner token.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import signal
import subprocess
import sys
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Optional

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from a01_execution_worker import (  # noqa: E402
    A01ExecutionWorker,
    EXECUTION_WORKER_PROTOCOL,
    ExecutionWorkerError,
    UnsupportedExecutor,
    WorkExecutionFailed,
    _digest,
)
from a01_night_scheduler import A01NightScheduler  # noqa: E402
from tools.second_shift_supervisor_v2 import (  # noqa: E402
    Conflict,
    StaleWorker,
    SupervisorStore,
    iso,
    parse_iso,
    utcnow,
)

HARDENING_CONTRACT = "pqf-repair-a01-001.execution-owner.v1"
FINAL_RESULT_STATES = {"SUCCEEDED", "FAILED", "AUTHORITY_LOST"}
OWNABLE_RESULT_STATES = {"RUNNING", "RESULT_READY"}
RETRY_SAFE = "RETRY_SAFE"
RECONCILE_REQUIRED = "RECONCILE_REQUIRED"
RETRY_POLICIES = {RETRY_SAFE, RECONCILE_REQUIRED}


class ExecutionBusy(ExecutionWorkerError):
    """Another live worker owns this execution generation."""


class ExecutionOwnershipLost(StaleWorker):
    """This worker no longer owns the execution generation."""


@dataclass(frozen=True)
class HardenedExecutionContext:
    worker: "A01ExecutionWorkerHardened"
    dispatch_id: str
    lease_id: str
    fencing_token: int
    idempotency_key: str
    delegation_id: str
    execution_generation: int
    attempt_identity: str

    def renew(self, checkpoint_pointer: Optional[str] = None, now: Optional[dt.datetime] = None) -> str:
        return self.worker.renew_execution_lease(
            self.lease_id,
            self.fencing_token,
            self.execution_generation,
            checkpoint_pointer=checkpoint_pointer,
            now=now,
        )


Executor = Callable[[dict[str, Any], HardenedExecutionContext], dict[str, Any]]


class A01ExecutionWorkerHardened(A01ExecutionWorker):
    """A-01 worker with single-owner execution generations and immutable finals."""

    def __init__(
        self,
        store: SupervisorStore,
        *,
        root: Optional[Path] = None,
        scheduler: Optional[A01NightScheduler] = None,
        executors: Optional[dict[str, Executor]] = None,
        executor_retry_policies: Optional[dict[str, str]] = None,
        worker_instance_id: Optional[str] = None,
        lease_seconds: int = 300,
        renew_seconds: int = 30,
        heartbeat_sla_seconds: int = 300,
        evidence_root: Optional[Path] = None,
        clock: Callable[[], dt.datetime] = utcnow,
    ):
        self.worker_instance_id = worker_instance_id or f"worker-{uuid.uuid4().hex}"
        super().__init__(
            store,
            root=root,
            scheduler=scheduler,
            executors=executors,
            lease_seconds=lease_seconds,
            renew_seconds=renew_seconds,
            heartbeat_sla_seconds=heartbeat_sla_seconds,
            evidence_root=evidence_root,
            clock=clock,
        )
        self.executor_retry_policies: dict[str, str] = {
            "A01_CONTROL_PLANE_QUALIFICATION": RETRY_SAFE,
        }
        for kind in self.executors:
            self.executor_retry_policies.setdefault(kind, RECONCILE_REQUIRED)
        if executor_retry_policies:
            for kind, policy in executor_retry_policies.items():
                if policy not in RETRY_POLICIES:
                    raise ValueError(f"unsupported retry policy for {kind}: {policy}")
                self.executor_retry_policies[kind] = policy
        self._init_hardening_schema()

    def _retry_policy(self, executor_kind: str) -> str:
        policy = self.executor_retry_policies.get(executor_kind, RECONCILE_REQUIRED)
        if policy not in RETRY_POLICIES:
            raise ExecutionWorkerError(f"invalid retry policy for {executor_kind}: {policy}")
        return policy

    def _init_hardening_schema(self) -> None:
        additions = {
            "execution_generation": "INTEGER NOT NULL DEFAULT 0",
            "owner_token": "TEXT",
            "owner_fencing_token": "INTEGER",
            "owner_acquired_at": "TEXT",
            "owner_heartbeat_at": "TEXT",
            "retry_policy": "TEXT NOT NULL DEFAULT 'RECONCILE_REQUIRED'",
            "attempt_identity": "TEXT",
            "evidence_path": "TEXT",
        }
        with self.store.tx() as c:
            existing = {str(row[1]) for row in c.execute("PRAGMA table_info(night_execution_results)").fetchall()}
            for name, ddl in additions.items():
                if name not in existing:
                    c.execute(f"ALTER TABLE night_execution_results ADD COLUMN {name} {ddl}")
            c.execute(
                "UPDATE night_execution_results SET execution_generation=1 "
                "WHERE execution_generation IS NULL OR execution_generation<1"
            )
            c.execute(
                "UPDATE night_execution_results SET retry_policy=? "
                "WHERE executor_kind='A01_CONTROL_PLANE_QUALIFICATION'",
                (RETRY_SAFE,),
            )
            c.execute(
                "CREATE INDEX IF NOT EXISTS ix_night_execution_owner "
                "ON night_execution_results(dispatch_id,execution_generation,owner_token)"
            )

    @staticmethod
    def _row_dict(row: Any) -> Optional[dict[str, Any]]:
        return None if row is None else dict(row)

    def _result_row(self, dispatch_id: str) -> Optional[dict[str, Any]]:
        row = self.store.conn.execute(
            "SELECT * FROM night_execution_results WHERE dispatch_id=?", (dispatch_id,)
        ).fetchone()
        return self._row_dict(row)

    @staticmethod
    def _validate_result_identity(row: dict[str, Any], bundle: dict[str, Any]) -> None:
        expected = {
            "dispatch_id": bundle["dispatch_id"],
            "lease_id": bundle["lease_id"],
            "lane": bundle["lane"],
            "idempotency_key": bundle["idempotency_key"],
            "executor_kind": bundle["executor_kind"],
            "input_digest": bundle["input_digest"],
        }
        mismatches = [name for name, value in expected.items() if row.get(name) != value]
        if mismatches:
            raise Conflict(f"execution result identity mismatch: {','.join(sorted(mismatches))}")

    def _owner_row(self, c: Any, dispatch_id: str) -> dict[str, Any]:
        row = c.execute(
            "SELECT * FROM night_execution_results WHERE dispatch_id=?", (dispatch_id,)
        ).fetchone()
        if row is None:
            raise ExecutionOwnershipLost("execution result row disappeared")
        return dict(row)

    def _assert_execution_owner(
        self,
        c: Any,
        bundle: dict[str, Any],
        generation: int,
        *,
        allowed_states: set[str] = OWNABLE_RESULT_STATES,
    ) -> dict[str, Any]:
        row = self._owner_row(c, bundle["dispatch_id"])
        self._validate_result_identity(row, bundle)
        if row["state"] not in allowed_states:
            raise ExecutionOwnershipLost(f"execution is no longer mutable from state {row['state']}")
        if int(row["execution_generation"]) != int(generation):
            raise ExecutionOwnershipLost("execution generation is stale")
        if row["owner_token"] != self.worker_instance_id:
            raise ExecutionOwnershipLost("execution owner token is stale")
        if int(row["owner_fencing_token"] or -1) != int(bundle["fencing_token"]):
            raise ExecutionOwnershipLost("execution owner fence is stale")
        if int(row["fencing_token"]) != int(bundle["fencing_token"]):
            raise ExecutionOwnershipLost("result fence is stale")
        return row

    def _acquire_execution(self, bundle: dict[str, Any], now: dt.datetime) -> dict[str, Any]:
        policy = self._retry_policy(bundle["executor_kind"])
        with self.store.tx() as c:
            raw = c.execute(
                "SELECT * FROM night_execution_results WHERE dispatch_id=?",
                (bundle["dispatch_id"],),
            ).fetchone()
            if raw is None:
                c.execute(
                    """
                    INSERT INTO night_execution_results(
                      dispatch_id,lease_id,lane,idempotency_key,fencing_token,executor_kind,input_digest,
                      state,attempt_count,started_at,updated_at,execution_generation,owner_token,
                      owner_fencing_token,owner_acquired_at,owner_heartbeat_at,retry_policy
                    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    """,
                    (
                        bundle["dispatch_id"], bundle["lease_id"], bundle["lane"], bundle["idempotency_key"],
                        int(bundle["fencing_token"]), bundle["executor_kind"], bundle["input_digest"],
                        "RUNNING", 0, iso(now), iso(now), 1, self.worker_instance_id,
                        int(bundle["fencing_token"]), iso(now), iso(now), policy,
                    ),
                )
                return self._owner_row(c, bundle["dispatch_id"])

            row = dict(raw)
            self._validate_result_identity(row, bundle)
            if row["state"] in FINAL_RESULT_STATES:
                return row
            generation = max(1, int(row["execution_generation"] or 0))
            owner = row["owner_token"]
            owner_fence = row["owner_fencing_token"]
            if owner == self.worker_instance_id and int(owner_fence or -1) == int(bundle["fencing_token"]):
                return row
            if owner is not None:
                raise ExecutionBusy(
                    f"dispatch {bundle['dispatch_id']} is owned by another live execution worker"
                )
            changed = c.execute(
                """
                UPDATE night_execution_results
                SET owner_token=?,owner_fencing_token=?,owner_acquired_at=?,owner_heartbeat_at=?,
                    retry_policy=?,updated_at=?
                WHERE dispatch_id=? AND execution_generation=? AND owner_token IS NULL
                  AND fencing_token=? AND state IN ('RUNNING','RESULT_READY')
                """,
                (
                    self.worker_instance_id, int(bundle["fencing_token"]), iso(now), iso(now),
                    policy, iso(now), bundle["dispatch_id"], generation, int(bundle["fencing_token"]),
                ),
            ).rowcount
            if changed != 1:
                raise ExecutionBusy(f"dispatch {bundle['dispatch_id']} execution ownership race lost")
            return self._owner_row(c, bundle["dispatch_id"])

    def _mark_attempt_owned(self, bundle: dict[str, Any], generation: int, now: dt.datetime) -> str:
        with self.store.tx() as c:
            row = self._assert_execution_owner(c, bundle, generation, allowed_states={"RUNNING"})
            attempt = int(row["attempt_count"]) + 1
            attempt_identity = f"g{generation:06d}-a{attempt:06d}-{self.worker_instance_id[:12]}"
            changed = c.execute(
                """
                UPDATE night_execution_results
                SET attempt_count=?,attempt_identity=?,owner_heartbeat_at=?,updated_at=?
                WHERE dispatch_id=? AND execution_generation=? AND owner_token=?
                  AND owner_fencing_token=? AND fencing_token=? AND state='RUNNING'
                """,
                (
                    attempt, attempt_identity, iso(now), iso(now), bundle["dispatch_id"], generation,
                    self.worker_instance_id, int(bundle["fencing_token"]), int(bundle["fencing_token"]),
                ),
            ).rowcount
            if changed != 1:
                raise ExecutionOwnershipLost("attempt ownership compare-and-swap failed")
        return attempt_identity

    def renew_execution_lease(
        self,
        lease_id: str,
        fencing_token: int,
        generation: int,
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
            bundle = self._dispatch_bundle(claim["dispatch_id"])
            self._assert_execution_owner(c, bundle, generation)
            c.execute(
                "UPDATE claims SET expires_at=?,heartbeat_at=?,checkpoint_pointer=COALESCE(?,checkpoint_pointer),"
                "status='RUNNING' WHERE lease_id=?",
                (iso(expires), iso(now), checkpoint_pointer, lease_id),
            )
            c.execute(
                "UPDATE night_execution_results SET owner_heartbeat_at=?,updated_at=? "
                "WHERE dispatch_id=? AND execution_generation=? AND owner_token=?",
                (iso(now), iso(now), bundle["dispatch_id"], generation, self.worker_instance_id),
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
                payload={
                    "expires_at": iso(expires),
                    "checkpoint_pointer": checkpoint_pointer,
                    "execution_generation": generation,
                    "worker_instance_id": self.worker_instance_id,
                },
            )
        return iso(expires)

    def _stage_result_owned(
        self,
        bundle: dict[str, Any],
        generation: int,
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
        current = self._result_row(bundle["dispatch_id"])
        attempt_identity = current.get("attempt_identity") if current else None
        terminal_payload = {
            "execution_worker_protocol": EXECUTION_WORKER_PROTOCOL,
            "hardening_contract": HARDENING_CONTRACT,
            "dispatch_id": bundle["dispatch_id"],
            "executor_kind": bundle["executor_kind"],
            "input_digest": bundle["input_digest"],
            "idempotency_key": bundle["idempotency_key"],
            "execution_generation": generation,
            "attempt_identity": attempt_identity,
            "result": result,
        }
        if error is not None:
            terminal_payload["error"] = {"class": error_class, "message": error_message}
        with self.store.tx() as c:
            self._assert_execution_owner(c, bundle, generation, allowed_states={"RUNNING"})
            changed = c.execute(
                """
                UPDATE night_execution_results
                SET state='RESULT_READY',terminal_state=?,result_json=?,error_class=?,error_message=?,
                    owner_heartbeat_at=?,updated_at=?
                WHERE dispatch_id=? AND execution_generation=? AND owner_token=?
                  AND owner_fencing_token=? AND fencing_token=? AND state='RUNNING'
                """,
                (
                    terminal_state, json.dumps(terminal_payload, sort_keys=True), error_class, error_message,
                    iso(now), iso(now), bundle["dispatch_id"], generation, self.worker_instance_id,
                    int(bundle["fencing_token"]), int(bundle["fencing_token"]),
                ),
            ).rowcount
            if changed != 1:
                raise ExecutionOwnershipLost("result staging compare-and-swap failed")
        return terminal_payload

    def _record_authority_lost(
        self,
        bundle: dict[str, Any],
        generation: int,
        reason: str,
        now: dt.datetime,
    ) -> bool:
        with self.store.tx() as c:
            changed = c.execute(
                """
                UPDATE night_execution_results
                SET state='AUTHORITY_LOST',terminal_state='STALE',finished_at=?,updated_at=?,
                    error_class='StaleWorker',error_message=?
                WHERE dispatch_id=? AND execution_generation=? AND owner_token=?
                  AND owner_fencing_token=? AND fencing_token=? AND state IN ('RUNNING','RESULT_READY')
                """,
                (
                    iso(now), iso(now), reason, bundle["dispatch_id"], generation,
                    self.worker_instance_id, int(bundle["fencing_token"]), int(bundle["fencing_token"]),
                ),
            ).rowcount
        return changed == 1

    def _commit_staged_result_owned(
        self, bundle: dict[str, Any], generation: int, now: dt.datetime
    ) -> dict[str, Any]:
        with self.store.tx() as c:
            row = self._assert_execution_owner(c, bundle, generation, allowed_states={"RESULT_READY"})
            if not row["terminal_state"]:
                raise ExecutionWorkerError("result is not staged for terminal commit")
            payload = json.loads(row["result_json"] or "{}")
            terminal_state = row["terminal_state"]
        try:
            self.store.terminal(
                bundle["lease_id"],
                int(bundle["fencing_token"]),
                terminal_state,
                payload=payload,
                now=now,
            )
        except StaleWorker:
            self._record_authority_lost(
                bundle, generation, "fencing authority lost before terminal result commit", now
            )
            raise
        final = "SUCCEEDED" if terminal_state == "COMPLETED" else "FAILED"
        with self.store.tx() as c:
            changed = c.execute(
                """
                UPDATE night_execution_results
                SET state=?,finished_at=?,updated_at=?
                WHERE dispatch_id=? AND execution_generation=? AND owner_token=?
                  AND owner_fencing_token=? AND fencing_token=? AND state='RESULT_READY'
                """,
                (
                    final, iso(now), iso(now), bundle["dispatch_id"], generation,
                    self.worker_instance_id, int(bundle["fencing_token"]), int(bundle["fencing_token"]),
                ),
            ).rowcount
            if changed != 1:
                raise ExecutionOwnershipLost("terminal result compare-and-swap failed")
        self.scheduler.reconcile(now=now)
        return self._result_row(bundle["dispatch_id"]) or {}

    def _recover_local_claims(self, now: dt.datetime) -> list[dict[str, Any]]:
        resumed: list[dict[str, Any]] = []
        with self.store.tx() as c:
            rows = c.execute(
                """
                SELECT c.*,o.state AS outbox_state,o.executor_kind,o.external_run_id,
                       o.fencing_token AS outbox_fencing_token,o.payload_json,
                       r.state AS result_state,r.input_digest AS result_input_digest,
                       r.fencing_token AS result_fencing_token,r.execution_generation,
                       r.retry_policy,r.owner_token
                FROM claims c
                JOIN dispatch_outbox o ON o.lease_id=c.lease_id
                LEFT JOIN night_execution_results r ON r.dispatch_id=o.dispatch_id
                WHERE c.released_at IS NULL
                ORDER BY c.claimed_at,c.lease_id
                """
            ).fetchall()
            for row in rows:
                expired = parse_iso(row["expires_at"]) <= now
                heartbeat_stale = (
                    now - parse_iso(row["heartbeat_at"])
                ).total_seconds() > self.heartbeat_sla_seconds
                if not expired and not heartbeat_stale:
                    continue
                if row["executor_kind"] not in self.executors:
                    continue
                if row["outbox_state"] not in ("PENDING", "DISPATCHED"):
                    continue
                expected_local_run = f"local:{row['dispatch_id']}"
                if row["external_run_id"] not in (None, expected_local_run):
                    continue
                if row["result_state"] in FINAL_RESULT_STATES:
                    continue
                if int(row["outbox_fencing_token"]) != int(row["fencing_token"]):
                    raise Conflict("recovery refused outbox/claim fencing mismatch")
                expected_digest = _digest(
                    {
                        "dispatch_id": row["dispatch_id"],
                        "lease_id": row["lease_id"],
                        "lane": row["lane"],
                        "idempotency_key": row["idempotency_key"],
                        "executor_kind": row["executor_kind"],
                        "payload": json.loads(row["payload_json"]),
                    }
                )
                if row["result_input_digest"] is not None and row["result_input_digest"] != expected_digest:
                    raise Conflict("recovery refused execution input digest mismatch")
                if row["result_fencing_token"] is not None and int(row["result_fencing_token"]) != int(row["fencing_token"]):
                    raise Conflict("recovery refused result/claim fencing mismatch")
                policy = row["retry_policy"] or self._retry_policy(row["executor_kind"])
                if row["result_state"] == "RUNNING" and policy != RETRY_SAFE:
                    continue

                lane = self.store._lane(c, row["lane"])
                active = self.store._active_claim(c, row["lane"])
                if active is None or active["lease_id"] != row["lease_id"]:
                    continue
                new_fence = int(lane["fencing_counter"]) + 1
                previous_generation = int(row["execution_generation"] or 0)
                new_generation = max(1, previous_generation + 1)
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
                    (
                        new_fence, iso(expires), iso(now),
                        f"execution:{row['dispatch_id']}:recovered:g{new_generation}", row["lease_id"],
                    ),
                )
                c.execute(
                    "UPDATE dispatch_outbox SET fencing_token=?,updated_at=? WHERE dispatch_id=?",
                    (new_fence, iso(now), row["dispatch_id"]),
                )
                if row["result_state"] is None:
                    c.execute(
                        """
                        INSERT INTO night_execution_results(
                          dispatch_id,lease_id,lane,idempotency_key,fencing_token,executor_kind,input_digest,
                          state,attempt_count,started_at,updated_at,execution_generation,owner_fencing_token,
                          retry_policy
                        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                        """,
                        (
                            row["dispatch_id"], row["lease_id"], row["lane"], row["idempotency_key"],
                            new_fence, row["executor_kind"], expected_digest, "RUNNING", 0, None, iso(now),
                            new_generation, new_fence, policy,
                        ),
                    )
                else:
                    changed = c.execute(
                        """
                        UPDATE night_execution_results
                        SET fencing_token=?,execution_generation=?,owner_token=NULL,owner_fencing_token=?,
                            owner_acquired_at=NULL,owner_heartbeat_at=NULL,retry_policy=?,updated_at=?
                        WHERE dispatch_id=? AND execution_generation=? AND state IN ('RUNNING','RESULT_READY')
                        """,
                        (
                            new_fence, new_generation, new_fence, policy, iso(now), row["dispatch_id"],
                            previous_generation,
                        ),
                    ).rowcount
                    if changed != 1:
                        raise Conflict("recovery execution-generation compare-and-swap failed")
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
                        "reason": "LEASE_EXPIRED" if expired else "HEARTBEAT_STALE",
                        "previous_fencing_token": int(row["fencing_token"]),
                        "previous_execution_generation": previous_generation,
                        "execution_generation": new_generation,
                        "retry_policy": policy,
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
                        "previous_execution_generation": previous_generation,
                        "execution_generation": new_generation,
                        "retry_policy": policy,
                        "reason": "LEASE_EXPIRED" if expired else "HEARTBEAT_STALE",
                    }
                )
        return resumed

    def recover(self, now: Optional[dt.datetime] = None) -> dict[str, Any]:
        now = now or self.clock()
        resumed = self._recover_local_claims(now)
        recovered = self.store.recover(now=now, heartbeat_sla_seconds=self.heartbeat_sla_seconds)
        stale = set(recovered["stale_leases"])
        if stale:
            with self.store.tx() as c:
                placeholders = ",".join("?" for _ in stale)
                c.execute(
                    f"""
                    UPDATE night_execution_results
                    SET state='AUTHORITY_LOST',terminal_state='STALE',finished_at=?,updated_at=?,
                        owner_token=NULL,error_class='StaleWorker',
                        error_message='lease recovered as stale before terminal result commit'
                    WHERE lease_id IN ({placeholders}) AND state IN ('RUNNING','RESULT_READY')
                    """,
                    (iso(now), iso(now), *sorted(stale)),
                )
        self.scheduler.reconcile(now=now)
        return {**recovered, "resumed_leases": resumed}

    def consume_dispatch(self, dispatch_id: str, now: Optional[dt.datetime] = None) -> dict[str, Any]:
        now = now or self.clock()
        bundle = self._dispatch_bundle(dispatch_id)
        existing = self._result_row(dispatch_id)
        if existing is not None:
            self._validate_result_identity(existing, bundle)
            if existing["state"] in FINAL_RESULT_STATES:
                return existing
        if bundle["released_at"] is not None:
            raise StaleWorker("dispatch claim is already released without a committed worker result")
        if bundle["state"] not in ("PENDING", "DISPATCHED"):
            raise ExecutionWorkerError(f"dispatch is not executable from state {bundle['state']}")

        owned = self._acquire_execution(bundle, now)
        if owned["state"] in FINAL_RESULT_STATES:
            return owned
        generation = int(owned["execution_generation"])
        if owned["state"] == "RESULT_READY":
            return self._commit_staged_result_owned(bundle, generation, now)

        self.renew_execution_lease(
            bundle["lease_id"], int(bundle["fencing_token"]), generation,
            checkpoint_pointer=f"execution:{dispatch_id}:starting:g{generation}", now=now,
        )
        self.store.mark_dispatched(dispatch_id, f"local:{dispatch_id}", now=now)
        attempt_identity = self._mark_attempt_owned(bundle, generation, now)
        context = HardenedExecutionContext(
            worker=self,
            dispatch_id=dispatch_id,
            lease_id=bundle["lease_id"],
            fencing_token=int(bundle["fencing_token"]),
            idempotency_key=bundle["idempotency_key"],
            delegation_id=bundle["delegation_id"],
            execution_generation=generation,
            attempt_identity=attempt_identity,
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
            self.renew_execution_lease(
                bundle["lease_id"], int(bundle["fencing_token"]), generation,
                checkpoint_pointer=f"execution:{dispatch_id}:result-ready:g{generation}", now=end,
            )
            self._stage_result_owned(
                bundle, generation, terminal_state="COMPLETED", result=result, error=None, now=end
            )
            return self._commit_staged_result_owned(bundle, generation, end)
        except (ExecutionBusy, ExecutionOwnershipLost):
            raise
        except StaleWorker:
            lost_at = self.clock()
            self._record_authority_lost(
                bundle, generation, "fencing authority lost during execution", lost_at
            )
            raise
        except Exception as exc:
            failure_result = exc.result if isinstance(exc, WorkExecutionFailed) else {}
            failure_result = {**failure_result, "status": "BLOCKED"}
            failure_now = self.clock()
            try:
                self.renew_execution_lease(
                    bundle["lease_id"], int(bundle["fencing_token"]), generation,
                    checkpoint_pointer=f"execution:{dispatch_id}:blocked:g{generation}", now=failure_now,
                )
                self._stage_result_owned(
                    bundle, generation, terminal_state="BLOCKED", result=failure_result,
                    error=exc, now=failure_now,
                )
                return self._commit_staged_result_owned(bundle, generation, failure_now)
            except (StaleWorker, ExecutionOwnershipLost):
                self._record_authority_lost(
                    bundle, generation, "fencing authority lost while recording failure", failure_now
                )
                raise

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
                "hardening_contract": HARDENING_CONTRACT,
                "worker_instance_id": self.worker_instance_id,
                "at": iso(now),
                "recovery": recovery,
                "scheduler": scheduler_tick,
                "execution": None,
            }
        try:
            result = self.consume_dispatch(live[0], now=now)
        except ExecutionBusy:
            return {
                "protocol_version": EXECUTION_WORKER_PROTOCOL,
                "hardening_contract": HARDENING_CONTRACT,
                "worker_instance_id": self.worker_instance_id,
                "at": iso(now),
                "recovery": recovery,
                "scheduler": scheduler_tick,
                "execution": None,
                "busy_dispatch_id": live[0],
            }
        self.scheduler.reconcile(now=now)
        return {
            "protocol_version": EXECUTION_WORKER_PROTOCOL,
            "hardening_contract": HARDENING_CONTRACT,
            "worker_instance_id": self.worker_instance_id,
            "at": iso(now),
            "recovery": recovery,
            "scheduler": scheduler_tick,
            "execution": result,
        }

    def _terminate_process_tree(self, proc: subprocess.Popen[Any]) -> None:
        if proc.poll() is not None:
            return
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                capture_output=True,
                text=True,
                shell=False,
                timeout=15,
            )
        else:
            try:
                os.killpg(proc.pid, signal.SIGTERM)
            except ProcessLookupError:
                return
            try:
                proc.wait(timeout=5)
                return
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)

    @staticmethod
    def _tail(path: Path, limit: int = 4000) -> str:
        if not path.is_file():
            return ""
        text = path.read_text(encoding="utf-8", errors="replace")
        return text[-limit:]

    def _execute_a01_qualification(
        self, payload: dict[str, Any], context: HardenedExecutionContext
    ) -> dict[str, Any]:
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

        evidence_dir = self.evidence_root / context.dispatch_id / context.attempt_identity
        evidence_dir.mkdir(parents=True, exist_ok=False)
        stdout_path = evidence_dir / "worker-stdout.txt"
        stderr_path = evidence_dir / "worker-stderr.txt"
        with self.store.tx() as c:
            changed = c.execute(
                """
                UPDATE night_execution_results SET evidence_path=?,updated_at=?
                WHERE dispatch_id=? AND execution_generation=? AND owner_token=?
                  AND owner_fencing_token=? AND state='RUNNING'
                """,
                (
                    str(evidence_dir), iso(self.clock()), context.dispatch_id,
                    context.execution_generation, self.worker_instance_id, context.fencing_token,
                ),
            ).rowcount
            if changed != 1:
                raise ExecutionOwnershipLost("evidence identity compare-and-swap failed")

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
                "A01_ARTIFACT_NAME": f"{qualification_id}-{context.dispatch_id}-{context.attempt_identity}-evidence",
                "A01_IDEMPOTENCY_KEY": context.idempotency_key,
                "A01_DISPATCH_ID": context.dispatch_id,
                "A01_EXECUTION_GENERATION": str(context.execution_generation),
                "A01_ATTEMPT_IDENTITY": context.attempt_identity,
            }
        )
        script = self.root / ".github" / "scripts" / "a01-control-plane.js"
        if not script.is_file():
            raise WorkExecutionFailed("A-01 control-plane executor script is missing")

        popen_kwargs: dict[str, Any] = {
            "cwd": self.root,
            "env": env,
            "text": True,
            "shell": False,
        }
        if os.name == "nt":
            popen_kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            popen_kwargs["start_new_session"] = True

        with stdout_path.open("w", encoding="utf-8") as stdout_file, stderr_path.open("w", encoding="utf-8") as stderr_file:
            proc = subprocess.Popen(
                ["node", str(script), "execute"],
                stdout=stdout_file,
                stderr=stderr_file,
                **popen_kwargs,
            )
            try:
                while True:
                    try:
                        proc.wait(timeout=self.renew_seconds)
                        break
                    except subprocess.TimeoutExpired:
                        context.renew(
                            checkpoint_pointer=(
                                f"execution:{context.dispatch_id}:qualification-running:"
                                f"g{context.execution_generation}:{context.attempt_identity}"
                            )
                        )
            except (StaleWorker, ExecutionOwnershipLost):
                self._terminate_process_tree(proc)
                raise
            except BaseException:
                self._terminate_process_tree(proc)
                raise

        receipt_path = evidence_dir / "receipt.json"
        receipt = None
        if receipt_path.is_file():
            receipt = json.loads(receipt_path.read_text(encoding="utf-8-sig"))
        details = {
            "returncode": proc.returncode,
            "stdout_tail": self._tail(stdout_path),
            "stderr_tail": self._tail(stderr_path),
            "evidence_dir": str(evidence_dir),
            "execution_generation": context.execution_generation,
            "attempt_identity": context.attempt_identity,
            "receipt": receipt,
        }
        if proc.returncode != 0 or not isinstance(receipt, dict) or receipt.get("result_class") != "PASS":
            raise WorkExecutionFailed("registered A-01 qualification did not PASS", details)
        return details


def _cli() -> int:
    parser = argparse.ArgumentParser(description="A-01 hardened authorized Second Shift execution worker")
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
        worker = A01ExecutionWorkerHardened(
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
