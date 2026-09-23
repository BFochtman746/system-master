from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Optional
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from a01_supervisor_adapter import canonical
from a01_supervisor_coordination import CoordinationError, SupervisorCoordinationAdapter, validate_coordination_contract
from tools.second_shift_supervisor_v2 import SupervisorStore, in_shift, iso, parse_iso, utcnow

NIGHT_SCHEDULER_PROTOCOL = "control-gateway.a01-night-scheduler.v1"
QUEUE_STATES = {"BINDING", "QUEUED", "CLAIMED", "VALIDATING", "TERMINAL", "CANCELLED", "RECONCILE"}
ACTIVE_STAGE_STATES = {"BINDING", "QUEUED", "CLAIMED", "VALIDATING", "RECONCILE"}
A01_POLICY_PATH = ROOT / "qualification" / "a01" / "a01-policy.json"
_SCHEDULER_SCHEMA_OBJECTS = frozenset(
    {
        "night_scheduler_queue",
        "ix_night_scheduler_queue_state",
        "night_scheduler_claim_authorizations",
        "night_scheduler_night_budget",
        "night_scheduler_budget_usage",
        "cg010_night_scheduler_claim_guard",
    }
)


class NightSchedulerError(CoordinationError):
    pass


class A01NightScheduler:
    """A-01-local night scheduler and exclusive claim authority for queued night work.

    GitHub may admit/persist work, but it does not select or order nightly tasks.
    Exact admitted handoffs plus CG-009 coordination contracts are persisted in
    the A-01 supervisor SQLite database. This scheduler owns the local clock,
    execution-stage barrier, priority selection, the durable night-wide claim
    budget, and the only authorized path that may create a claim for a queued
    night delegation. CG-009 coordination remains authoritative for dependency,
    resource-capacity, cancellation, lease, fence, and dispatch-outbox invariants.
    """

    def __init__(self, store: SupervisorStore):
        if not isinstance(store, SupervisorStore):
            raise TypeError("store must be SupervisorStore")
        self.store = store
        self.coordination = SupervisorCoordinationAdapter(store)
        self.night_timezone_name, self.max_night_slots = self._load_overnight_policy()
        self.night_timezone = ZoneInfo(self.night_timezone_name)
        self._init_schema()

    @staticmethod
    def _load_overnight_policy() -> tuple[str, int]:
        try:
            policy = json.loads(A01_POLICY_PATH.read_text(encoding="utf-8"))
            overnight = policy["overnight"]
            timezone_name = str(overnight["timezone"])
            max_slots = overnight["max_slots"]
        except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise NightSchedulerError(f"invalid A-01 overnight policy: {exc}") from exc
        if overnight.get("enabled") is not True:
            raise NightSchedulerError("A-01 overnight scheduling is disabled")
        if timezone_name != "America/New_York":
            raise NightSchedulerError("night scheduler timezone differs from Second Shift authority")
        if type(max_slots) is not int or not 1 <= max_slots <= 64:
            raise NightSchedulerError("A-01 overnight max_slots must be an integer 1..64")
        return timezone_name, max_slots

    def _schema_ready(self) -> bool:
        rows = self.store.conn.execute(
            "SELECT name FROM sqlite_master WHERE "
            "(type='table' AND name IN ("
            "'night_scheduler_queue','night_scheduler_claim_authorizations',"
            "'night_scheduler_night_budget','night_scheduler_budget_usage')) "
            "OR (type='index' AND name='ix_night_scheduler_queue_state') "
            "OR (type='trigger' AND name='cg010_night_scheduler_claim_guard')"
        ).fetchall()
        return {str(row[0]) for row in rows} == _SCHEDULER_SCHEMA_OBJECTS

    def _init_schema(self) -> None:
        if self._schema_ready():
            return
        try:
            self.store.conn.executescript(
                """
                BEGIN IMMEDIATE;
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
                CREATE TABLE IF NOT EXISTS night_scheduler_claim_authorizations (
                  delegation_id TEXT NOT NULL,
                  idempotency_key TEXT NOT NULL,
                  authorization_id TEXT NOT NULL,
                  PRIMARY KEY(delegation_id, idempotency_key)
                );
                CREATE TABLE IF NOT EXISTS night_scheduler_night_budget (
                  night_key TEXT PRIMARY KEY,
                  max_slots INTEGER NOT NULL CHECK(max_slots BETWEEN 1 AND 64),
                  used_slots INTEGER NOT NULL DEFAULT 0 CHECK(used_slots >= 0 AND used_slots <= max_slots),
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS night_scheduler_budget_usage (
                  night_key TEXT NOT NULL,
                  slot_number INTEGER NOT NULL,
                  delegation_id TEXT NOT NULL,
                  lease_id TEXT NOT NULL UNIQUE,
                  claimed_at TEXT NOT NULL,
                  PRIMARY KEY(night_key, slot_number),
                  UNIQUE(night_key, delegation_id),
                  FOREIGN KEY(night_key) REFERENCES night_scheduler_night_budget(night_key)
                );
                DROP TRIGGER IF EXISTS cg010_night_scheduler_claim_guard;
                CREATE TRIGGER cg010_night_scheduler_claim_guard
                BEFORE INSERT ON claims
                WHEN EXISTS (
                  SELECT 1 FROM night_scheduler_queue q
                  WHERE q.delegation_id=NEW.delegation_id
                )
                AND NOT EXISTS (
                  SELECT 1 FROM night_scheduler_claim_authorizations a
                  WHERE a.delegation_id=NEW.delegation_id
                    AND a.idempotency_key=NEW.idempotency_key
                )
                BEGIN
                  SELECT RAISE(ABORT, 'CG010_NIGHT_SCHEDULER_AUTH_REQUIRED');
                END;
                COMMIT;
                """
            )
        except Exception:
            if self.store.conn.in_transaction:
                self.store.conn.execute("ROLLBACK")
            raise

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

    def _night_key(self, now: dt.datetime) -> str:
        if now.tzinfo is None or now.utcoffset() is None:
            raise NightSchedulerError("night scheduler requires timezone-aware timestamps")
        return now.astimezone(self.night_timezone).date().isoformat()

    def _budget_status(self, now: dt.datetime) -> dict[str, Any]:
        night_key = self._night_key(now)
        row = self.store.conn.execute(
            "SELECT max_slots,used_slots FROM night_scheduler_night_budget WHERE night_key=?",
            (night_key,),
        ).fetchone()
        max_slots = int(row["max_slots"]) if row is not None else self.max_night_slots
        used_slots = int(row["used_slots"]) if row is not None else 0
        return {
            "night_key": night_key,
            "max_slots": max_slots,
            "used_slots": used_slots,
            "remaining_slots": max(0, max_slots - used_slots),
        }

    def _reserve_night_slot(
        self,
        c,
        now: dt.datetime,
        delegation_id: str,
        lease_id: str,
    ) -> dict[str, Any]:
        night_key = self._night_key(now)
        row = c.execute(
            "SELECT * FROM night_scheduler_night_budget WHERE night_key=?",
            (night_key,),
        ).fetchone()
        if row is None:
            c.execute(
                "INSERT INTO night_scheduler_night_budget(night_key,max_slots,used_slots,created_at,updated_at) "
                "VALUES(?,?,?,?,?)",
                (night_key, self.max_night_slots, 0, iso(now), iso(now)),
            )
            max_slots = self.max_night_slots
            used_slots = 0
        else:
            max_slots = int(row["max_slots"])
            used_slots = int(row["used_slots"])
            if max_slots != self.max_night_slots:
                raise NightSchedulerError("night scheduler budget policy changed during active night")

        counted = int(
            c.execute(
                "SELECT COUNT(*) n FROM night_scheduler_budget_usage WHERE night_key=?",
                (night_key,),
            ).fetchone()["n"]
        )
        if counted != used_slots:
            raise NightSchedulerError("night scheduler budget accounting mismatch")
        if used_slots >= max_slots:
            raise NightSchedulerError("night-wide scheduler slot budget exhausted")

        slot_number = used_slots + 1
        c.execute(
            "INSERT INTO night_scheduler_budget_usage(night_key,slot_number,delegation_id,lease_id,claimed_at) "
            "VALUES(?,?,?,?,?)",
            (night_key, slot_number, delegation_id, lease_id, iso(now)),
        )
        c.execute(
            "UPDATE night_scheduler_night_budget SET used_slots=?,updated_at=? WHERE night_key=?",
            (slot_number, iso(now), night_key),
        )
        return {
            "night_key": night_key,
            "slot_number": slot_number,
            "max_slots": max_slots,
        }

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
            if existing["state"] == "BINDING":
                self.coordination.bind(handoff, contract, now=now)
                with self.store.tx() as c:
                    c.execute(
                        "UPDATE night_scheduler_queue SET state='QUEUED',updated_at=? WHERE delegation_id=? AND state='BINDING'",
                        (iso(now), handoff["delegation_id"]),
                    )
            return dict(
                self.store.conn.execute(
                    "SELECT * FROM night_scheduler_queue WHERE delegation_id=?",
                    (handoff["delegation_id"],),
                ).fetchone()
            )

        with self.store.tx() as c:
            c.execute(
                "INSERT INTO night_scheduler_queue("
                "delegation_id,handoff_json,contract_json,scheduler_digest,state,enqueued_at,updated_at"
                ") VALUES(?,?,?,?,?,?,?)",
                (
                    handoff["delegation_id"], expected_handoff, expected_contract,
                    expected_digest, "BINDING", iso(now), iso(now),
                ),
            )
        self.coordination.bind(handoff, contract, now=now)
        with self.store.tx() as c:
            c.execute(
                "UPDATE night_scheduler_queue SET state='QUEUED',updated_at=? WHERE delegation_id=? AND state='BINDING'",
                (iso(now), handoff["delegation_id"]),
            )
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
                if row["state"] == "BINDING":
                    results.append({"delegation_id": row["delegation_id"], "state": "BINDING"})
                    continue
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
                elif delegation["state"] == "VALIDATING":
                    state = "VALIDATING"
                elif delegation["state"] in ("COMPLETED", "BLOCKED", "CANCELLED"):
                    state = "TERMINAL" if delegation["state"] != "CANCELLED" else "CANCELLED"
                elif delegation["state"] == "STALE":
                    state = "RECONCILE"
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

    def _active_orders_by_lane(self) -> dict[str, int]:
        orders: dict[str, int] = {}
        for row in self.store.conn.execute(
            "SELECT state,handoff_json FROM night_scheduler_queue"
        ).fetchall():
            if row["state"] not in ACTIVE_STAGE_STATES:
                continue
            handoff = json.loads(row["handoff_json"])
            lane = str(handoff["lane"])
            execution_order = int(handoff["execution_order"])
            orders[lane] = min(execution_order, orders.get(lane, execution_order))
        return orders

    def _validating_lanes(self) -> set[str]:
        return {
            str(json.loads(row["handoff_json"])["lane"])
            for row in self.store.conn.execute(
                "SELECT handoff_json FROM night_scheduler_queue WHERE state='VALIDATING'"
            ).fetchall()
        }

    def _ordered_candidates(self, now: dt.datetime) -> list[tuple[dict[str, Any], dict[str, Any], Any]]:
        active_orders = self._active_orders_by_lane()
        if not active_orders:
            return []
        validating_lanes = self._validating_lanes()
        candidates: list[tuple[dict[str, Any], dict[str, Any], Any]] = []
        for row in self.store.conn.execute(
            "SELECT * FROM night_scheduler_queue WHERE state='QUEUED'"
        ).fetchall():
            handoff = json.loads(row["handoff_json"])
            lane = str(handoff["lane"])
            if lane in validating_lanes:
                continue
            if int(handoff["execution_order"]) != active_orders.get(lane):
                continue
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
                -int(item[0]["priority"]),
                int(item[0]["execution_order"]),
                item[0]["lane"],
                item[0]["delegation_id"],
            )
        )
        return candidates

    def _claim_authorized(
        self,
        handoff: dict[str, Any],
        contract: dict[str, Any],
        now: dt.datetime,
        lease_seconds: int,
    ):
        validate_coordination_contract(handoff, contract)
        not_before = parse_iso(handoff["not_before"]) if handoff["not_before"] else None
        not_after = parse_iso(handoff["not_after"]) if handoff["not_after"] else None
        if not_before and now < not_before:
            raise NightSchedulerError("admitted work is not_before gated")
        if not_after and now >= not_after:
            raise NightSchedulerError("admitted work window expired")
        if not in_shift(now):
            raise NightSchedulerError("new coordinated claim outside Second Shift window")
        if lease_seconds < 30 or lease_seconds > 3600:
            raise ValueError("lease_seconds must be between 30 and 3600")

        with self.store.tx() as c:
            prior = c.execute(
                "SELECT * FROM claims WHERE idempotency_key=?",
                (handoff["idempotency_key"],),
            ).fetchone()
            if prior:
                same = (
                    prior["lane"] == handoff["lane"]
                    and prior["delegation_id"] == handoff["delegation_id"]
                    and prior["objective_id"] == handoff["objective_id"]
                    and prior["control_head"] == handoff["control_head"]
                )
                if not same:
                    raise NightSchedulerError("idempotency key collision across claim identities")
                if prior["released_at"] is not None or prior["status"] in ("CANCELLED", "CANCEL_REQUESTED"):
                    raise NightSchedulerError("idempotent claim identity is no longer live")
                return self.store._to_claim(prior)

            task = c.execute(
                "SELECT * FROM coordination_tasks WHERE delegation_id=?",
                (handoff["delegation_id"],),
            ).fetchone()
            if task is None or task["handoff_digest"] != handoff["handoff_digest"]:
                raise NightSchedulerError("missing exact durable coordination task")
            if task["cancel_state"] != "NONE":
                raise NightSchedulerError("coordinated delegation is cancelled")

            for dep in c.execute(
                "SELECT dependency_id FROM coordination_dependencies WHERE delegation_id=? ORDER BY dependency_id",
                (handoff["delegation_id"],),
            ).fetchall():
                dep_task = c.execute(
                    "SELECT graph_id,graph_version FROM coordination_tasks WHERE delegation_id=?",
                    (dep["dependency_id"],),
                ).fetchone()
                if dep_task is None:
                    raise NightSchedulerError(f"missing dependency {dep['dependency_id']}")
                if dep_task["graph_id"] != task["graph_id"] or int(dep_task["graph_version"]) != int(task["graph_version"]):
                    raise NightSchedulerError(f"dependency {dep['dependency_id']} graph identity/version mismatch")
                dep_row = c.execute(
                    "SELECT state FROM delegations WHERE delegation_id=?",
                    (dep["dependency_id"],),
                ).fetchone()
                if dep_row is None:
                    raise NightSchedulerError(f"missing dependency {dep['dependency_id']}")
                if dep_row["state"] != "COMPLETED":
                    raise NightSchedulerError(f"dependency {dep['dependency_id']} is not COMPLETED")

            resource = c.execute(
                "SELECT max_concurrency FROM coordination_resource_limits WHERE resource_key=?",
                (task["resource_key"],),
            ).fetchone()
            if resource is None or int(resource["max_concurrency"]) != int(task["max_concurrency"]):
                raise NightSchedulerError("durable resource policy mismatch")
            occupied = self.coordination._resource_occupancy_locked(c, task["resource_key"])
            if occupied >= int(resource["max_concurrency"]):
                raise NightSchedulerError("resource concurrency limit reached")

            lane = self.store._lane(c, handoff["lane"])
            if lane["control_head"] != handoff["control_head"]:
                raise NightSchedulerError("claim head differs from current lane head")
            if self.store._active_claim(c, handoff["lane"]):
                raise NightSchedulerError("lane already has a live mutation claim")
            delegation = c.execute(
                "SELECT * FROM delegations WHERE delegation_id=?",
                (handoff["delegation_id"],),
            ).fetchone()
            if (
                not delegation
                or delegation["lane"] != handoff["lane"]
                or delegation["objective_id"] != handoff["objective_id"]
                or delegation["control_head"] != handoff["control_head"]
                or delegation["state"] != "READY"
            ):
                raise NightSchedulerError("delegation is not exact current READY work")

            token = int(lane["fencing_counter"]) + 1
            lease_id = f"{handoff['lane']}-{uuid.uuid4()}"
            dispatch_id = f"dispatch-{uuid.uuid4()}"
            expires = now + dt.timedelta(seconds=lease_seconds)
            budget = self._reserve_night_slot(c, now, handoff["delegation_id"], lease_id)
            authorization_id = f"sched-auth-{uuid.uuid4()}"
            c.execute(
                "INSERT INTO night_scheduler_claim_authorizations(delegation_id,idempotency_key,authorization_id) VALUES(?,?,?)",
                (handoff["delegation_id"], handoff["idempotency_key"], authorization_id),
            )
            c.execute(
                "UPDATE lanes SET fencing_counter=?,state='CLAIMED',current_delegation_id=?,updated_at=? WHERE lane=?",
                (token, handoff["delegation_id"], iso(now), handoff["lane"]),
            )
            c.execute(
                "UPDATE delegations SET state='CLAIMED',updated_at=? WHERE delegation_id=?",
                (iso(now), handoff["delegation_id"]),
            )
            c.execute(
                "INSERT INTO claims(lease_id,lane,delegation_id,objective_id,control_head,idempotency_key,fencing_token,claimed_at,expires_at,heartbeat_at,status,dispatch_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    lease_id, handoff["lane"], handoff["delegation_id"],
                    handoff["objective_id"], handoff["control_head"], handoff["idempotency_key"],
                    token, iso(now), iso(expires), iso(now), "CLAIMED", dispatch_id,
                ),
            )
            c.execute(
                "INSERT INTO dispatch_outbox(dispatch_id,lane,lease_id,idempotency_key,fencing_token,executor_kind,payload_json,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                (
                    dispatch_id, handoff["lane"], lease_id, handoff["idempotency_key"], token,
                    handoff["executor_kind"],
                    json.dumps({
                        "gateway_handoff_digest": handoff["handoff_digest"],
                        "coordination_digest": contract["coordination_digest"],
                        "admission_digest": handoff["admission_receipt"]["admission_digest"],
                        "payload_digest": handoff["payload_digest"],
                        "payload": handoff["payload"],
                    }, sort_keys=True),
                    "PENDING", iso(now), iso(now),
                ),
            )
            c.execute(
                "DELETE FROM night_scheduler_claim_authorizations WHERE delegation_id=? AND idempotency_key=?",
                (handoff["delegation_id"], handoff["idempotency_key"]),
            )
            common_payload = {
                "resource_key": task["resource_key"],
                "execution_order": handoff["execution_order"],
                "priority": handoff["priority"],
                "scheduling_owner": "A01_SUPERVISOR",
                "night_key": budget["night_key"],
                "night_slot": budget["slot_number"],
                "night_slot_limit": budget["max_slots"],
            }
            self.store._event(
                c, handoff["lane"], "CLAIMED", now,
                delegation_id=handoff["delegation_id"], objective_id=handoff["objective_id"],
                lease_id=lease_id, dispatch_id=dispatch_id,
                idempotency_key=handoff["idempotency_key"], fencing_token=token,
                control_head=handoff["control_head"],
                payload={"expires_at": iso(expires), **common_payload},
            )
            self.store._event(
                c, handoff["lane"], "DISPATCH_INTENT", now,
                delegation_id=handoff["delegation_id"], objective_id=handoff["objective_id"],
                lease_id=lease_id, dispatch_id=dispatch_id,
                idempotency_key=handoff["idempotency_key"], fencing_token=token,
                control_head=handoff["control_head"],
                payload={
                    "executor_kind": handoff["executor_kind"],
                    "coordination_digest": contract["coordination_digest"],
                    **common_payload,
                },
            )
            return self.store._to_claim(
                c.execute("SELECT * FROM claims WHERE lease_id=?", (lease_id,)).fetchone()
            )

    def submit_worker_result(
        self,
        delegation_id: str,
        lease_id: str,
        fencing_token: int,
        state: str,
        payload: Optional[dict[str, Any]] = None,
        *,
        candidate_digest: Optional[str] = None,
        evaluation_timeout_seconds: int = 900,
        now: Optional[dt.datetime] = None,
    ) -> dict[str, Any]:
        if state not in {"COMPLETED", "BLOCKED", "STALE"}:
            raise ValueError("worker result state must be COMPLETED, BLOCKED, or STALE")
        now = now or utcnow()
        payload = payload or {}
        row = self.store.conn.execute(
            "SELECT handoff_json FROM night_scheduler_queue WHERE delegation_id=?",
            (delegation_id,),
        ).fetchone()
        if row is None:
            raise NightSchedulerError("worker result delegation is not scheduled overnight work")
        claim = self.store.conn.execute(
            "SELECT delegation_id,fencing_token FROM claims WHERE lease_id=?",
            (lease_id,),
        ).fetchone()
        if claim is None or claim["delegation_id"] != delegation_id:
            raise NightSchedulerError("worker result lease does not match scheduled delegation")
        if int(claim["fencing_token"]) != int(fencing_token):
            raise NightSchedulerError("worker result fencing token differs from scheduled claim")
        handoff = json.loads(row["handoff_json"])
        handoff_payload = handoff.get("payload") if isinstance(handoff.get("payload"), dict) else {}
        if state == "COMPLETED" and handoff_payload.get("independent_evaluation_required") is True:
            if candidate_digest is None:
                raise NightSchedulerError("independent evaluation requires candidate_digest")
            self.store.await_evaluation(
                lease_id, fencing_token, candidate_digest, payload,
                evaluation_timeout_seconds=evaluation_timeout_seconds, now=now,
            )
            self.reconcile(now=now)
            return {"delegation_id": delegation_id, "lease_id": lease_id, "state": "VALIDATING", "candidate_digest": candidate_digest}
        self.store.terminal(lease_id, fencing_token, state, payload=payload, now=now)
        self.reconcile(now=now)
        return {"delegation_id": delegation_id, "lease_id": lease_id, "state": state}

    def submit_evaluator_verdict(
        self,
        delegation_id: str,
        lease_id: str,
        fencing_token: int,
        verdict_id: str,
        verdict: str,
        candidate_digest: str,
        evaluator_id: str,
        evidence: dict[str, Any],
        now: Optional[dt.datetime] = None,
    ) -> dict[str, Any]:
        now = now or utcnow()
        row = self.store.conn.execute(
            "SELECT 1 FROM night_scheduler_queue WHERE delegation_id=?",
            (delegation_id,),
        ).fetchone()
        claim = self.store.conn.execute(
            "SELECT delegation_id FROM claims WHERE lease_id=?",
            (lease_id,),
        ).fetchone()
        if row is None or claim is None or claim["delegation_id"] != delegation_id:
            raise NightSchedulerError("evaluator verdict does not match scheduled delegation")
        state = self.store.evaluator_verdict(
            lease_id, fencing_token, verdict_id, verdict, candidate_digest,
            evaluator_id, evidence, now=now,
        )
        self.reconcile(now=now)
        return {"delegation_id": delegation_id, "lease_id": lease_id, "state": state, "verdict": verdict}

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
                "at": iso(now), "shift_open": False, "active_execution_order": None,
                "active_execution_orders": {}, "claims": [], "blocked": [],
                "night_budget": self._budget_status(now),
            }

        self.reconcile(now=now)
        claims: list[dict[str, Any]] = []
        blocked: list[dict[str, Any]] = []
        active_orders = self._active_orders_by_lane()
        active_order = min(active_orders.values()) if active_orders else None
        for handoff, contract, _row in self._ordered_candidates(now):
            if len(claims) >= max_claims:
                break
            try:
                claim = self._claim_authorized(handoff, contract, now, lease_seconds)
            except (CoordinationError, NightSchedulerError) as exc:
                blocked.append({"delegation_id": handoff["delegation_id"], "reason": str(exc)})
                continue
            with self.store.tx() as c:
                c.execute(
                    "UPDATE night_scheduler_queue SET state='CLAIMED',updated_at=? WHERE delegation_id=?",
                    (iso(now), handoff["delegation_id"]),
                )
            claims.append({
                "delegation_id": claim.delegation_id, "lease_id": claim.lease_id,
                "dispatch_id": claim.dispatch_id, "fencing_token": claim.fencing_token,
                "execution_order": handoff["execution_order"], "priority": handoff["priority"],
            })
        return {
            "protocol_version": NIGHT_SCHEDULER_PROTOCOL,
            "at": iso(now), "shift_open": True, "active_execution_order": active_order,
            "active_execution_orders": dict(sorted(active_orders.items())),
            "claims": claims, "blocked": blocked,
            "night_budget": self._budget_status(now),
        }

    def snapshot(self) -> dict[str, Any]:
        rows = [dict(row) for row in self._queue_rows()]
        for row in rows:
            row["handoff"] = json.loads(row.pop("handoff_json"))
            row["coordination_contract"] = json.loads(row.pop("contract_json"))
        leaked = self.store.conn.execute(
            "SELECT COUNT(*) n FROM night_scheduler_claim_authorizations"
        ).fetchone()["n"]
        budgets = [
            dict(row) for row in self.store.conn.execute(
                "SELECT * FROM night_scheduler_night_budget ORDER BY night_key"
            ).fetchall()
        ]
        usage = [
            dict(row) for row in self.store.conn.execute(
                "SELECT * FROM night_scheduler_budget_usage ORDER BY night_key,slot_number"
            ).fetchall()
        ]
        return {
            "protocol_version": NIGHT_SCHEDULER_PROTOCOL,
            "queue": rows,
            "night_budgets": budgets,
            "night_budget_usage": usage,
            "authorization_leaks": int(leaked),
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
