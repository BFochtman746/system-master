from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
from pathlib import Path
from typing import Any, Optional

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from a01_supervisor_adapter import canonical
from a01_supervisor_coordination import CoordinationError, SupervisorCoordinationAdapter, validate_coordination_contract
from tools.second_shift_supervisor_v2 import SupervisorStore, in_shift, iso, parse_iso, utcnow

NIGHT_SCHEDULER_PROTOCOL = "control-gateway.a01-night-scheduler.v1"
QUEUE_STATES = {"QUEUED", "CLAIMED", "TERMINAL", "CANCELLED", "RECONCILE"}


class NightSchedulerError(CoordinationError):
    pass


class A01NightScheduler:
    """A-01-local night scheduler.

    GitHub may admit/persist work, but it does not select or order nightly tasks.
    Exact admitted handoffs plus CG-009 coordination contracts are persisted in
    the A-01 supervisor SQLite database. This scheduler owns the local clock and
    deterministic claim order; SupervisorCoordinationAdapter still owns the
    dependency, resource-capacity, cancellation, lease, fence, and outbox gates.
    """

    def __init__(self, store: SupervisorStore):
        if not isinstance(store, SupervisorStore):
            raise TypeError("store must be SupervisorStore")
        self.store = store
        self.coordination = SupervisorCoordinationAdapter(store)
        self._init_schema()

    def _init_schema(self) -> None:
        self.store.conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS night_scheduler_queue (
              delegation_id TEXT PRIMARY KEY,
              handoff_json TEXT NOT NULL,
              contract_json TEXT NOT NULL,
              scheduler_digest TEXT NOT NULL,
              state TEXT NOT NULL,
              enqueued_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_night_scheduler_queue_state
              ON night_scheduler_queue(state);
            """
        )

    @staticmethod
    def _scheduler_digest(handoff: dict[str, Any], contract: dict[str, Any]) -> str:
        import hashlib

        body = {
            "protocol_version": NIGHT_SCHEDULER_PROTOCOL,
            "handoff_digest": handoff["handoff_digest"],
            "coordination_digest": contract["coordination_digest"],
            "delegation_id": handoff["delegation_id"],
        }
        return hashlib.sha256(canonical(body).encode("utf-8")).hexdigest()

    def enqueue(
        self,
        handoff: dict[str, Any],
        contract: dict[str, Any],
        now: Optional[dt.datetime] = None,
    ) -> dict[str, Any]:
        validate_coordination_contract(handoff, contract)
        if handoff["execution_class"] != "OVERNIGHT":
            raise NightSchedulerError("night scheduler accepts OVERNIGHT work only")
        if handoff["scheduling_owner"] != "A01_SUPERVISOR":
            raise NightSchedulerError("A-01 supervisor must remain scheduling owner")
        now = now or utcnow()
        expected_handoff = canonical(handoff)
        expected_contract = canonical(contract)
        expected_digest = self._scheduler_digest(handoff, contract)

        existing = self.store.conn.execute(
            "SELECT * FROM night_scheduler_queue WHERE delegation_id=?",
            (handoff["delegation_id"],),
        ).fetchone()
        if existing is not None:
            if (
                existing["handoff_json"] != expected_handoff
                or existing["contract_json"] != expected_contract
                or existing["scheduler_digest"] != expected_digest
            ):
                raise NightSchedulerError("night scheduler delegation identity collision")
            return dict(existing)

        self.coordination.bind(handoff, contract, now=now)
        try:
            with self.store.tx() as c:
                c.execute(
                    "INSERT INTO night_scheduler_queue("
                    "delegation_id,handoff_json,contract_json,scheduler_digest,state,enqueued_at,updated_at"
                    ") VALUES(?,?,?,?,?,?,?)",
                    (
                        handoff["delegation_id"],
                        expected_handoff,
                        expected_contract,
                        expected_digest,
                        "QUEUED",
                        iso(now),
                        iso(now),
                    ),
                )
        except Exception:
            existing = self.store.conn.execute(
                "SELECT * FROM night_scheduler_queue WHERE delegation_id=?",
                (handoff["delegation_id"],),
            ).fetchone()
            if (
                existing is None
                or existing["handoff_json"] != expected_handoff
                or existing["contract_json"] != expected_contract
                or existing["scheduler_digest"] != expected_digest
            ):
                raise
        return dict(
            self.store.conn.execute(
                "SELECT * FROM night_scheduler_queue WHERE delegation_id=?",
                (handoff["delegation_id"],),
            ).fetchone()
        )

    def _queue_rows(self) -> list[Any]:
        return self.store.conn.execute(
            "SELECT * FROM night_scheduler_queue ORDER BY delegation_id"
        ).fetchall()

    def reconcile(self, now: Optional[dt.datetime] = None) -> list[dict[str, Any]]:
        now = now or utcnow()
        results: list[dict[str, Any]] = []
        with self.store.tx() as c:
            for row in c.execute(
                "SELECT * FROM night_scheduler_queue ORDER BY delegation_id"
            ).fetchall():
                delegation = c.execute(
                    "SELECT state FROM delegations WHERE delegation_id=?",
                    (row["delegation_id"],),
                ).fetchone()
                coordination = c.execute(
                    "SELECT cancel_state FROM coordination_tasks WHERE delegation_id=?",
                    (row["delegation_id"],),
                ).fetchone()
                live = c.execute(
                    "SELECT lease_id FROM claims WHERE delegation_id=? AND released_at IS NULL",
                    (row["delegation_id"],),
                ).fetchone()
                if coordination is not None and coordination["cancel_state"] != "NONE":
                    state = "CANCELLED"
                elif delegation is None:
                    state = "RECONCILE"
                elif delegation["state"] in ("COMPLETED", "BLOCKED", "CANCELLED"):
                    state = "TERMINAL" if delegation["state"] != "CANCELLED" else "CANCELLED"
                elif live is not None:
                    state = "CLAIMED"
                elif delegation["state"] == "READY":
                    state = "QUEUED"
                else:
                    state = "RECONCILE"
                if state not in QUEUE_STATES:
                    raise NightSchedulerError("derived unsupported scheduler state")
                if row["state"] != state:
                    c.execute(
                        "UPDATE night_scheduler_queue SET state=?,updated_at=? WHERE delegation_id=?",
                        (state, iso(now), row["delegation_id"]),
                    )
                results.append({"delegation_id": row["delegation_id"], "state": state})
        return results

    def request_cancel(
        self,
        delegation_id: str,
        reason: str,
        now: Optional[dt.datetime] = None,
        cascade: Optional[bool] = None,
    ) -> dict[str, Any]:
        now = now or utcnow()
        row = self.store.conn.execute(
            "SELECT 1 FROM night_scheduler_queue WHERE delegation_id=?",
            (delegation_id,),
        ).fetchone()
        if row is None:
            raise NightSchedulerError("unknown night scheduler delegation")
        result = self.coordination.request_cancel(
            delegation_id, reason, now=now, cascade=cascade
        )
        self.reconcile(now=now)
        return result

    def _ordered_candidates(self, now: dt.datetime) -> list[tuple[dict[str, Any], dict[str, Any], Any]]:
        candidates: list[tuple[dict[str, Any], dict[str, Any], Any]] = []
        for row in self.store.conn.execute(
            "SELECT * FROM night_scheduler_queue WHERE state='QUEUED'"
        ).fetchall():
            handoff = json.loads(row["handoff_json"])
            contract = json.loads(row["contract_json"])
            not_before = parse_iso(handoff["not_before"]) if handoff["not_before"] else None
            not_after = parse_iso(handoff["not_after"]) if handoff["not_after"] else None
            if not_before is not None and now < not_before:
                continue
            if not_after is not None and now >= not_after:
                continue
            candidates.append((handoff, contract, row))
        candidates.sort(
            key=lambda item: (
                int(item[0]["execution_order"]),
                -int(item[0]["priority"]),
                item[0]["delegation_id"],
            )
        )
        return candidates

    def tick(
        self,
        now: Optional[dt.datetime] = None,
        *,
        max_claims: int = 64,
        lease_seconds: int = 300,
    ) -> dict[str, Any]:
        now = now or utcnow()
        if not isinstance(max_claims, int) or not 1 <= max_claims <= 64:
            raise ValueError("max_claims must be 1..64")
        if not in_shift(now):
            self.reconcile(now=now)
            return {
                "protocol_version": NIGHT_SCHEDULER_PROTOCOL,
                "at": iso(now),
                "shift_open": False,
                "claims": [],
                "blocked": [],
            }

        self.reconcile(now=now)
        claims: list[dict[str, Any]] = []
        blocked: list[dict[str, Any]] = []
        for handoff, contract, _row in self._ordered_candidates(now):
            if len(claims) >= max_claims:
                break
            try:
                claim = self.coordination.claim(
                    handoff, contract, now=now, lease_seconds=lease_seconds
                )
            except CoordinationError as exc:
                blocked.append(
                    {"delegation_id": handoff["delegation_id"], "reason": str(exc)}
                )
                continue
            with self.store.tx() as c:
                c.execute(
                    "UPDATE night_scheduler_queue SET state='CLAIMED',updated_at=? "
                    "WHERE delegation_id=?",
                    (iso(now), handoff["delegation_id"]),
                )
            claims.append(
                {
                    "delegation_id": claim.delegation_id,
                    "lease_id": claim.lease_id,
                    "dispatch_id": claim.dispatch_id,
                    "fencing_token": claim.fencing_token,
                    "execution_order": handoff["execution_order"],
                    "priority": handoff["priority"],
                }
            )
        return {
            "protocol_version": NIGHT_SCHEDULER_PROTOCOL,
            "at": iso(now),
            "shift_open": True,
            "claims": claims,
            "blocked": blocked,
        }

    def snapshot(self) -> dict[str, Any]:
        rows = [dict(row) for row in self._queue_rows()]
        for row in rows:
            row["handoff"] = json.loads(row.pop("handoff_json"))
            row["coordination_contract"] = json.loads(row.pop("contract_json"))
        return {
            "protocol_version": NIGHT_SCHEDULER_PROTOCOL,
            "queue": rows,
            "coordination_problems": self.coordination.audit_coordination_invariants(),
            "supervisor_problems": self.store.audit_invariants(),
        }


def _cli() -> int:
    parser = argparse.ArgumentParser(description="A-01 local Second Shift scheduler")
    parser.add_argument("--db", required=True, help="Supervisor SQLite database path")
    parser.add_argument("--once", action="store_true", help="Run one scheduler tick and exit")
    parser.add_argument("--poll-seconds", type=int, default=30)
    parser.add_argument("--max-claims", type=int, default=64)
    parser.add_argument("--lease-seconds", type=int, default=300)
    args = parser.parse_args()
    if args.poll_seconds < 1 or args.poll_seconds > 3600:
        parser.error("--poll-seconds must be 1..3600")

    with SupervisorStore(Path(args.db)) as store:
        scheduler = A01NightScheduler(store)
        if args.once:
            print(json.dumps(scheduler.tick(max_claims=args.max_claims, lease_seconds=args.lease_seconds), sort_keys=True))
            return 0
        while True:
            result = scheduler.tick(max_claims=args.max_claims, lease_seconds=args.lease_seconds)
            print(json.dumps(result, sort_keys=True), flush=True)
            time.sleep(args.poll_seconds)


if __name__ == "__main__":
    raise SystemExit(_cli())
