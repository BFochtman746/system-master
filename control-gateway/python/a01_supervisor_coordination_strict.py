from __future__ import annotations

import datetime as dt
import json
import uuid
from typing import Any, Optional

from a01_supervisor_adapter import digest, validate_gateway_handoff
from tools.second_shift_supervisor_v2 import Conflict, SupervisorStore, in_shift, iso, parse_iso, utcnow

COORDINATION_PROTOCOL = "control-gateway.a01-supervisor-coordination.v1"
CANCELLATION_POLICIES = {"NO_CASCADE", "CASCADE_DEPENDENTS"}


class CoordinationError(Conflict):
    pass


def _required_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise CoordinationError(f"{label} must be a non-empty string")
    return value


def _contract_body(contract: dict[str, Any]) -> dict[str, Any]:
    result = dict(contract)
    result.pop("coordination_digest", None)
    return result


def validate_coordination_contract(handoff: dict[str, Any], contract: dict[str, Any]) -> None:
    validate_gateway_handoff(handoff)
    if not isinstance(contract, dict):
        raise CoordinationError("coordination contract must be an object")
    expected = {
        "protocol_version", "handoff_digest", "graph_id", "graph_version", "delegation_id",
        "dependency_ids", "resource_key", "max_concurrency", "cancellation_policy", "coordination_digest",
    }
    if set(contract) != expected:
        raise CoordinationError("coordination fields differ from frozen contract")
    if contract["protocol_version"] != COORDINATION_PROTOCOL:
        raise CoordinationError("coordination protocol mismatch")
    for key in ("handoff_digest", "graph_id", "delegation_id", "resource_key", "coordination_digest"):
        _required_string(contract[key], key)
    if contract["handoff_digest"] != handoff["handoff_digest"]:
        raise CoordinationError("coordination contract is not bound to exact handoff")
    if contract["delegation_id"] != handoff["delegation_id"]:
        raise CoordinationError("coordination delegation differs from handoff")
    if not isinstance(contract["graph_version"], int) or isinstance(contract["graph_version"], bool) or contract["graph_version"] < 1:
        raise CoordinationError("graph_version must be positive integer")
    deps = contract["dependency_ids"]
    if not isinstance(deps, list) or any(not isinstance(x, str) or not x for x in deps):
        raise CoordinationError("dependency_ids must be a string array")
    if deps != sorted(set(deps)):
        raise CoordinationError("dependency_ids must be unique and canonical-sorted")
    if contract["delegation_id"] in deps:
        raise CoordinationError("delegation cannot depend on itself")
    if not isinstance(contract["max_concurrency"], int) or isinstance(contract["max_concurrency"], bool) or not 1 <= contract["max_concurrency"] <= 64:
        raise CoordinationError("max_concurrency must be 1..64")
    if contract["cancellation_policy"] not in CANCELLATION_POLICIES:
        raise CoordinationError("unsupported cancellation policy")
    if digest(_contract_body(contract)) != contract["coordination_digest"]:
        raise CoordinationError("coordination digest mismatch")


class SupervisorCoordinationAdapter:
    """Durable DAG, cross-lane concurrency, and cancellation authority on A-01.

    The CG-008 handoff remains immutable and GitHub remains transport/evidence only.
    All claim eligibility, dependency identity, resource capacity and cancellation
    decisions are persisted and decided under the same SQLite BEGIN IMMEDIATE
    transaction used to create the supervisor lease and dispatch intent.
    """

    def __init__(self, store: SupervisorStore):
        if not isinstance(store, SupervisorStore):
            raise TypeError("store must be SupervisorStore")
        self.store = store
        self._init_schema()

    def _init_schema(self) -> None:
        self.store.conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS coordination_tasks (
              delegation_id TEXT PRIMARY KEY,
              handoff_digest TEXT NOT NULL,
              graph_id TEXT NOT NULL,
              graph_version INTEGER NOT NULL,
              resource_key TEXT NOT NULL,
              max_concurrency INTEGER NOT NULL,
              cancellation_policy TEXT NOT NULL,
              cancel_state TEXT NOT NULL DEFAULT 'NONE',
              cancel_reason TEXT,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS coordination_dependencies (
              delegation_id TEXT NOT NULL,
              dependency_id TEXT NOT NULL,
              PRIMARY KEY(delegation_id, dependency_id)
            );
            CREATE TABLE IF NOT EXISTS coordination_resource_limits (
              resource_key TEXT PRIMARY KEY,
              max_concurrency INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_coordination_dependencies_dependency
              ON coordination_dependencies(dependency_id);
            CREATE INDEX IF NOT EXISTS ix_coordination_tasks_resource
              ON coordination_tasks(resource_key);
            """
        )

    def bind(self, handoff: dict[str, Any], contract: dict[str, Any], now: Optional[dt.datetime] = None) -> None:
        validate_coordination_contract(handoff, contract)
        now = now or utcnow()
        with self.store.tx() as c:
            limit = c.execute(
                "SELECT max_concurrency FROM coordination_resource_limits WHERE resource_key=?",
                (contract["resource_key"],),
            ).fetchone()
            if limit is not None and int(limit["max_concurrency"]) != contract["max_concurrency"]:
                raise CoordinationError("resource concurrency limit conflicts with existing durable policy")
            if limit is None:
                c.execute(
                    "INSERT INTO coordination_resource_limits(resource_key,max_concurrency) VALUES(?,?)",
                    (contract["resource_key"], contract["max_concurrency"]),
                )

            lane = c.execute("SELECT * FROM lanes WHERE lane=?", (handoff["lane"],)).fetchone()
            if lane is None:
                c.execute(
                    "INSERT INTO lanes(lane,owner_path,control_ref,control_head,state,updated_at) VALUES(?,?,?,?,?,?)",
                    (handoff["lane"], handoff["owner_path"], handoff["control_ref"], handoff["control_head"], "IDLE", iso(now)),
                )
                self.store._event(
                    c, handoff["lane"], "LANE_REGISTERED", now, control_head=handoff["control_head"],
                    payload={"owner_path": handoff["owner_path"], "control_ref": handoff["control_ref"]},
                )
            else:
                if lane["owner_path"] != handoff["owner_path"] or lane["control_ref"] != handoff["control_ref"]:
                    raise CoordinationError("lane ownership/control ref change requires explicit authority migration")
                if lane["control_head"] != handoff["control_head"]:
                    self.store._invalidate_head_locked(c, handoff["lane"], handoff["control_head"], now)

            if self.store._active_claim(c, handoff["lane"]):
                raise CoordinationError("cannot bind coordinated work while lane has live claim")
            validating = c.execute(
                "SELECT delegation_id FROM delegations WHERE lane=? AND state='VALIDATING' "
                "ORDER BY delegation_id LIMIT 1",
                (handoff["lane"],),
            ).fetchone()
            if validating is not None:
                raise CoordinationError(
                    f"cannot bind coordinated successor while delegation {validating['delegation_id']} awaits independent evaluation"
                )

            existing = c.execute("SELECT * FROM delegations WHERE delegation_id=?", (handoff["delegation_id"],)).fetchone()
            if existing is None:
                c.execute(
                    "INSERT INTO delegations(delegation_id,lane,objective_id,obligation_id,control_head,state,payload_json,updated_at) VALUES(?,?,?,?,?,?,?,?)",
                    (
                        handoff["delegation_id"], handoff["lane"], handoff["objective_id"],
                        handoff["admission_receipt"]["task_id"], handoff["control_head"], "READY",
                        json.dumps({
                            "gateway_handoff_digest": handoff["handoff_digest"],
                            "admission_digest": handoff["admission_receipt"]["admission_digest"],
                            "execution_class": handoff["execution_class"], "execution_order": handoff["execution_order"],
                            "priority": handoff["priority"], "not_before": handoff["not_before"], "not_after": handoff["not_after"],
                            "independent_evaluation_required": isinstance(handoff["payload"], dict)
                            and handoff["payload"].get("independent_evaluation_required") is True,
                            "payload_digest": handoff["payload_digest"], "payload": handoff["payload"],
                        }, sort_keys=True),
                        iso(now),
                    ),
                )
                c.execute(
                    "UPDATE lanes SET state='READY',current_delegation_id=?,updated_at=? WHERE lane=?",
                    (handoff["delegation_id"], iso(now), handoff["lane"]),
                )
            else:
                if (
                    existing["lane"] != handoff["lane"]
                    or existing["objective_id"] != handoff["objective_id"]
                    or existing["control_head"] != handoff["control_head"]
                    or existing["state"] != "READY"
                ):
                    raise CoordinationError("delegation id collision or non-READY existing delegation")

            task = c.execute("SELECT * FROM coordination_tasks WHERE delegation_id=?", (handoff["delegation_id"],)).fetchone()
            if task is None:
                c.execute(
                    "INSERT INTO coordination_tasks(delegation_id,handoff_digest,graph_id,graph_version,resource_key,max_concurrency,cancellation_policy,cancel_state,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
                    (
                        handoff["delegation_id"], handoff["handoff_digest"], contract["graph_id"], contract["graph_version"],
                        contract["resource_key"], contract["max_concurrency"], contract["cancellation_policy"], "NONE", iso(now),
                    ),
                )
                c.executemany(
                    "INSERT INTO coordination_dependencies(delegation_id,dependency_id) VALUES(?,?)",
                    [(handoff["delegation_id"], dep) for dep in contract["dependency_ids"]],
                )
            else:
                stored_deps = [r["dependency_id"] for r in c.execute(
                    "SELECT dependency_id FROM coordination_dependencies WHERE delegation_id=? ORDER BY dependency_id",
                    (handoff["delegation_id"],),
                ).fetchall()]
                exact = (
                    task["handoff_digest"] == handoff["handoff_digest"]
                    and task["graph_id"] == contract["graph_id"]
                    and int(task["graph_version"]) == contract["graph_version"]
                    and task["resource_key"] == contract["resource_key"]
                    and int(task["max_concurrency"]) == contract["max_concurrency"]
                    and task["cancellation_policy"] == contract["cancellation_policy"]
                    and stored_deps == contract["dependency_ids"]
                )
                if not exact:
                    raise CoordinationError("coordination delegation identity collision")
                return

            cycle = self._find_cycle_locked(c)
            if cycle:
                raise CoordinationError("dependency graph cycle: " + " -> ".join(cycle))
            mismatch = self._graph_mismatch_locked(c)
            if mismatch:
                raise CoordinationError(
                    f"dependency graph identity/version mismatch: {mismatch[0]} -> {mismatch[1]}"
                )
            self.store._event(
                c, handoff["lane"], "COORDINATION_BOUND", now,
                delegation_id=handoff["delegation_id"], objective_id=handoff["objective_id"], control_head=handoff["control_head"],
                payload={
                    "graph_id": contract["graph_id"], "graph_version": contract["graph_version"],
                    "dependency_ids": contract["dependency_ids"], "resource_key": contract["resource_key"],
                    "max_concurrency": contract["max_concurrency"], "cancellation_policy": contract["cancellation_policy"],
                    "coordination_digest": contract["coordination_digest"],
                },
            )

    def claim(self, handoff: dict[str, Any], contract: dict[str, Any], now: Optional[dt.datetime] = None, lease_seconds: int = 300):
        validate_coordination_contract(handoff, contract)
        now = now or utcnow()
        not_before = parse_iso(handoff["not_before"]) if handoff["not_before"] else None
        not_after = parse_iso(handoff["not_after"]) if handoff["not_after"] else None
        if not_before and now < not_before:
            raise CoordinationError("admitted work is not_before gated")
        if not_after and now >= not_after:
            raise CoordinationError("admitted work window expired")
        if handoff["execution_class"] == "OVERNIGHT" and not in_shift(now):
            raise CoordinationError("new coordinated claim outside Second Shift window")
        if lease_seconds < 30 or lease_seconds > 3600:
            raise ValueError("lease_seconds must be between 30 and 3600")

        with self.store.tx() as c:
            prior = c.execute("SELECT * FROM claims WHERE idempotency_key=?", (handoff["idempotency_key"],)).fetchone()
            if prior:
                same = (
                    prior["lane"] == handoff["lane"] and prior["delegation_id"] == handoff["delegation_id"]
                    and prior["objective_id"] == handoff["objective_id"] and prior["control_head"] == handoff["control_head"]
                )
                if not same:
                    raise CoordinationError("idempotency key collision across claim identities")
                if prior["released_at"] is not None or prior["status"] in ("CANCELLED", "CANCEL_REQUESTED"):
                    raise CoordinationError("idempotent claim identity is no longer live")
                return self.store._to_claim(prior)

            task = c.execute("SELECT * FROM coordination_tasks WHERE delegation_id=?", (handoff["delegation_id"],)).fetchone()
            if task is None or task["handoff_digest"] != handoff["handoff_digest"]:
                raise CoordinationError("missing exact durable coordination task")
            if task["cancel_state"] != "NONE":
                raise CoordinationError("coordinated delegation is cancelled")

            for dep in c.execute(
                "SELECT dependency_id FROM coordination_dependencies WHERE delegation_id=? ORDER BY dependency_id",
                (handoff["delegation_id"],),
            ).fetchall():
                dep_task = c.execute(
                    "SELECT graph_id,graph_version FROM coordination_tasks WHERE delegation_id=?",
                    (dep["dependency_id"],),
                ).fetchone()
                if dep_task is None:
                    raise CoordinationError(f"missing dependency {dep['dependency_id']}")
                if dep_task["graph_id"] != task["graph_id"] or int(dep_task["graph_version"]) != int(task["graph_version"]):
                    raise CoordinationError(f"dependency {dep['dependency_id']} graph identity/version mismatch")
                row = c.execute("SELECT state FROM delegations WHERE delegation_id=?", (dep["dependency_id"],)).fetchone()
                if row is None:
                    raise CoordinationError(f"missing dependency {dep['dependency_id']}")
                if row["state"] != "COMPLETED":
                    raise CoordinationError(f"dependency {dep['dependency_id']} is not COMPLETED")

            resource = c.execute(
                "SELECT max_concurrency FROM coordination_resource_limits WHERE resource_key=?",
                (task["resource_key"],),
            ).fetchone()
            if resource is None or int(resource["max_concurrency"]) != int(task["max_concurrency"]):
                raise CoordinationError("durable resource policy mismatch")
            live_for_resource = self._resource_occupancy_locked(c, task["resource_key"])
            if int(live_for_resource) >= int(resource["max_concurrency"]):
                raise CoordinationError("resource concurrency limit reached")

            lane = self.store._lane(c, handoff["lane"])
            if lane["control_head"] != handoff["control_head"]:
                raise CoordinationError("claim head differs from current lane head")
            if self.store._active_claim(c, handoff["lane"]):
                raise CoordinationError("lane already has a live mutation claim")
            delegation = c.execute("SELECT * FROM delegations WHERE delegation_id=?", (handoff["delegation_id"],)).fetchone()
            if not delegation or delegation["lane"] != handoff["lane"] or delegation["objective_id"] != handoff["objective_id"] or delegation["control_head"] != handoff["control_head"] or delegation["state"] != "READY":
                raise CoordinationError("delegation is not exact current READY work")

            token = int(lane["fencing_counter"]) + 1
            lease_id = f"{handoff['lane']}-{uuid.uuid4()}"
            dispatch_id = f"dispatch-{uuid.uuid4()}"
            expires = now + dt.timedelta(seconds=lease_seconds)
            c.execute(
                "UPDATE lanes SET fencing_counter=?,state='CLAIMED',current_delegation_id=?,updated_at=? WHERE lane=?",
                (token, handoff["delegation_id"], iso(now), handoff["lane"]),
            )
            c.execute("UPDATE delegations SET state='CLAIMED',updated_at=? WHERE delegation_id=?", (iso(now), handoff["delegation_id"]))
            c.execute(
                "INSERT INTO claims(lease_id,lane,delegation_id,objective_id,control_head,idempotency_key,fencing_token,claimed_at,expires_at,heartbeat_at,status,dispatch_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                (lease_id, handoff["lane"], handoff["delegation_id"], handoff["objective_id"], handoff["control_head"], handoff["idempotency_key"], token, iso(now), iso(expires), iso(now), "CLAIMED", dispatch_id),
            )
            c.execute(
                "INSERT INTO dispatch_outbox(dispatch_id,lane,lease_id,idempotency_key,fencing_token,executor_kind,payload_json,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                (
                    dispatch_id, handoff["lane"], lease_id, handoff["idempotency_key"], token, handoff["executor_kind"],
                    json.dumps({
                        "gateway_handoff_digest": handoff["handoff_digest"],
                        "coordination_digest": contract["coordination_digest"],
                        "admission_digest": handoff["admission_receipt"]["admission_digest"],
                        "payload_digest": handoff["payload_digest"], "payload": handoff["payload"],
                    }, sort_keys=True),
                    "PENDING", iso(now), iso(now),
                ),
            )
            self.store._event(
                c, handoff["lane"], "CLAIMED", now,
                delegation_id=handoff["delegation_id"], objective_id=handoff["objective_id"], lease_id=lease_id,
                dispatch_id=dispatch_id, idempotency_key=handoff["idempotency_key"], fencing_token=token,
                control_head=handoff["control_head"], payload={"expires_at": iso(expires), "resource_key": task["resource_key"]},
            )
            self.store._event(
                c, handoff["lane"], "DISPATCH_INTENT", now,
                delegation_id=handoff["delegation_id"], objective_id=handoff["objective_id"], lease_id=lease_id,
                dispatch_id=dispatch_id, idempotency_key=handoff["idempotency_key"], fencing_token=token,
                control_head=handoff["control_head"], payload={"executor_kind": handoff["executor_kind"], "coordination_digest": contract["coordination_digest"]},
            )
            return self.store._to_claim(c.execute("SELECT * FROM claims WHERE lease_id=?", (lease_id,)).fetchone())

    def request_cancel(self, delegation_id: str, reason: str, now: Optional[dt.datetime] = None, cascade: Optional[bool] = None) -> dict[str, Any]:
        _required_string(delegation_id, "delegation_id")
        _required_string(reason, "reason")
        now = now or utcnow()
        with self.store.tx() as c:
            root = c.execute("SELECT * FROM coordination_tasks WHERE delegation_id=?", (delegation_id,)).fetchone()
            if root is None:
                raise CoordinationError("unknown coordinated delegation")
            policy_cascade = root["cancellation_policy"] == "CASCADE_DEPENDENTS"
            if cascade is not None and bool(cascade) != policy_cascade:
                raise CoordinationError("cancellation cascade override differs from durable policy")
            use_cascade = policy_cascade
            targets = self._descendants_locked(c, delegation_id, root["graph_id"], int(root["graph_version"])) if use_cascade else []
            targets = [delegation_id] + [x for x in targets if x != delegation_id]
            outcomes = [self._cancel_one_locked(c, target, reason, now) for target in targets]
            return {"root": delegation_id, "cascade": use_cascade, "outcomes": outcomes}

    def acknowledge_cancel(self, dispatch_id: str, external_run_id: str, now: Optional[dt.datetime] = None) -> None:
        _required_string(dispatch_id, "dispatch_id")
        _required_string(external_run_id, "external_run_id")
        now = now or utcnow()
        with self.store.tx() as c:
            row = c.execute("SELECT * FROM dispatch_outbox WHERE dispatch_id=?", (dispatch_id,)).fetchone()
            if row is None:
                raise CoordinationError("unknown dispatch id")
            if row["state"] == "CANCELLED":
                if row["external_run_id"] and row["external_run_id"] != external_run_id:
                    raise CoordinationError("cancellation acknowledgement conflicts with external run")
                return
            if row["state"] != "CANCEL_REQUESTED":
                raise CoordinationError("dispatch is not awaiting cancellation acknowledgement")
            if row["external_run_id"] != external_run_id:
                raise CoordinationError("cancellation acknowledgement external run mismatch")
            c.execute("UPDATE dispatch_outbox SET state='CANCELLED',updated_at=? WHERE dispatch_id=?", (iso(now), dispatch_id))
            claim = c.execute("SELECT * FROM claims WHERE lease_id=?", (row["lease_id"],)).fetchone()
            self.store._event(
                c, row["lane"], "CANCEL_ACKNOWLEDGED", now,
                delegation_id=claim["delegation_id"] if claim else None,
                objective_id=claim["objective_id"] if claim else None,
                lease_id=row["lease_id"], dispatch_id=dispatch_id,
                payload={"external_run_id": external_run_id},
            )

    def coordination_status(self, delegation_id: str) -> dict[str, Any]:
        task = self.store.conn.execute("SELECT * FROM coordination_tasks WHERE delegation_id=?", (delegation_id,)).fetchone()
        if task is None:
            raise CoordinationError("unknown coordinated delegation")
        deps = [r["dependency_id"] for r in self.store.conn.execute(
            "SELECT dependency_id FROM coordination_dependencies WHERE delegation_id=? ORDER BY dependency_id",
            (delegation_id,),
        ).fetchall()]
        delegation = self.store.conn.execute("SELECT state FROM delegations WHERE delegation_id=?", (delegation_id,)).fetchone()
        live = self.store.conn.execute("SELECT lease_id,status FROM claims WHERE delegation_id=? AND released_at IS NULL", (delegation_id,)).fetchone()
        return {
            "delegation_id": delegation_id,
            "state": delegation["state"] if delegation else "MISSING",
            "graph_id": task["graph_id"],
            "graph_version": int(task["graph_version"]),
            "dependency_ids": deps,
            "resource_key": task["resource_key"],
            "max_concurrency": int(task["max_concurrency"]),
            "cancel_state": task["cancel_state"],
            "cancel_reason": task["cancel_reason"],
            "live_claim": dict(live) if live else None,
        }

    def audit_coordination_invariants(self) -> list[str]:
        c = self.store.conn
        problems: list[str] = []
        cycle = self._find_cycle_locked(c)
        if cycle:
            problems.append("DEPENDENCY_CYCLE:" + "->".join(cycle))
        mismatch = self._graph_mismatch_locked(c)
        if mismatch:
            problems.append(f"DEPENDENCY_GRAPH_IDENTITY_MISMATCH:{mismatch[0]}->{mismatch[1]}")
        for row in c.execute("SELECT resource_key,max_concurrency FROM coordination_resource_limits").fetchall():
            occupied = self._resource_occupancy_locked(c, row["resource_key"])
            if int(occupied) > int(row["max_concurrency"]):
                problems.append(f"RESOURCE_LIMIT_EXCEEDED:{row['resource_key']}")
        cancelled_live = c.execute(
            "SELECT ct.delegation_id FROM coordination_tasks ct JOIN claims cl ON cl.delegation_id=ct.delegation_id WHERE ct.cancel_state='CANCELLED' AND cl.released_at IS NULL"
        ).fetchall()
        if cancelled_live:
            problems.append("CANCELLED_TASK_HAS_LIVE_CLAIM")
        return problems

    def _resource_occupancy_locked(self, c, resource_key: str) -> int:
        row = c.execute(
            "SELECT COUNT(*) n FROM ("
            "SELECT DISTINCT cl.lease_id FROM claims cl "
            "JOIN coordination_tasks ct ON ct.delegation_id=cl.delegation_id "
            "LEFT JOIN dispatch_outbox o ON o.lease_id=cl.lease_id "
            "WHERE ct.resource_key=? AND (cl.released_at IS NULL OR o.state='CANCEL_REQUESTED')"
            ")",
            (resource_key,),
        ).fetchone()
        return int(row["n"])

    def _cancel_one_locked(self, c, delegation_id: str, reason: str, now: dt.datetime) -> dict[str, Any]:
        task = c.execute("SELECT * FROM coordination_tasks WHERE delegation_id=?", (delegation_id,)).fetchone()
        if task is None:
            return {"delegation_id": delegation_id, "outcome": "NOT_REGISTERED"}
        delegation = c.execute("SELECT * FROM delegations WHERE delegation_id=?", (delegation_id,)).fetchone()
        if delegation is None:
            raise CoordinationError("coordination task has no supervisor delegation")
        if delegation["state"] == "COMPLETED":
            return {"delegation_id": delegation_id, "outcome": "ALREADY_COMPLETED"}
        if task["cancel_state"] == "CANCELLED" or delegation["state"] == "CANCELLED":
            return {"delegation_id": delegation_id, "outcome": "ALREADY_CANCELLED"}

        claim = c.execute("SELECT * FROM claims WHERE delegation_id=? AND released_at IS NULL", (delegation_id,)).fetchone()
        outbox_state = None
        if claim:
            lane = self.store._lane(c, claim["lane"])
            new_fence = int(lane["fencing_counter"]) + 1
            outbox = c.execute("SELECT * FROM dispatch_outbox WHERE lease_id=?", (claim["lease_id"],)).fetchone()
            outbox_state = "CANCEL_REQUESTED" if outbox and outbox["external_run_id"] else "CANCELLED"
            c.execute(
                "UPDATE claims SET status='CANCELLED',released_at=?,terminal_reason=? WHERE lease_id=?",
                (iso(now), json.dumps({"reason": "CANCEL_REQUESTED", "detail": reason}, sort_keys=True), claim["lease_id"]),
            )
            c.execute(
                "UPDATE lanes SET fencing_counter=?,state='RECONCILE',current_delegation_id=NULL,updated_at=? WHERE lane=?",
                (new_fence, iso(now), claim["lane"]),
            )
            if outbox:
                c.execute("UPDATE dispatch_outbox SET state=?,updated_at=? WHERE dispatch_id=?", (outbox_state, iso(now), outbox["dispatch_id"]))
            self.store._event(
                c, claim["lane"], "CANCEL_REQUESTED" if outbox_state == "CANCEL_REQUESTED" else "CANCELLED", now,
                delegation_id=delegation_id, objective_id=claim["objective_id"], lease_id=claim["lease_id"],
                dispatch_id=claim["dispatch_id"], idempotency_key=claim["idempotency_key"], fencing_token=new_fence,
                control_head=claim["control_head"], payload={"reason": reason},
            )
        else:
            lane = self.store._lane(c, delegation["lane"])
            if lane["current_delegation_id"] == delegation_id:
                c.execute("UPDATE lanes SET state='RECONCILE',current_delegation_id=NULL,updated_at=? WHERE lane=?", (iso(now), delegation["lane"]))
            self.store._event(
                c, delegation["lane"], "CANCELLED", now,
                delegation_id=delegation_id, objective_id=delegation["objective_id"], control_head=delegation["control_head"],
                payload={"reason": reason},
            )

        c.execute("UPDATE delegations SET state='CANCELLED',updated_at=? WHERE delegation_id=?", (iso(now), delegation_id))
        c.execute(
            "UPDATE coordination_tasks SET cancel_state='CANCELLED',cancel_reason=?,updated_at=? WHERE delegation_id=?",
            (reason, iso(now), delegation_id),
        )
        return {"delegation_id": delegation_id, "outcome": "CANCELLED", "outbox_state": outbox_state}

    def _descendants_locked(self, c, root: str, graph_id: str, graph_version: int) -> list[str]:
        result: list[str] = []
        seen = {root}
        queue = [root]
        while queue:
            current = queue.pop(0)
            children = [r["delegation_id"] for r in c.execute(
                "SELECT d.delegation_id FROM coordination_dependencies d "
                "JOIN coordination_tasks t ON t.delegation_id=d.delegation_id "
                "WHERE d.dependency_id=? AND t.graph_id=? AND t.graph_version=? ORDER BY d.delegation_id",
                (current, graph_id, graph_version),
            ).fetchall()]
            for child in children:
                if child not in seen:
                    seen.add(child)
                    result.append(child)
                    queue.append(child)
        return result

    def _graph_mismatch_locked(self, c) -> Optional[tuple[str, str]]:
        row = c.execute(
            "SELECT d.delegation_id,d.dependency_id FROM coordination_dependencies d "
            "JOIN coordination_tasks child ON child.delegation_id=d.delegation_id "
            "JOIN coordination_tasks parent ON parent.delegation_id=d.dependency_id "
            "WHERE child.graph_id<>parent.graph_id OR child.graph_version<>parent.graph_version "
            "ORDER BY d.delegation_id,d.dependency_id LIMIT 1"
        ).fetchone()
        return (row["delegation_id"], row["dependency_id"]) if row else None

    def _find_cycle_locked(self, c) -> list[str]:
        graph: dict[str, list[str]] = {}
        for row in c.execute("SELECT delegation_id,dependency_id FROM coordination_dependencies ORDER BY delegation_id,dependency_id").fetchall():
            graph.setdefault(row["delegation_id"], []).append(row["dependency_id"])
            graph.setdefault(row["dependency_id"], [])
        visiting: set[str] = set()
        visited: set[str] = set()
        path: list[str] = []

        def visit(node: str) -> Optional[list[str]]:
            if node in visiting:
                index = path.index(node)
                return path[index:] + [node]
            if node in visited:
                return None
            visiting.add(node)
            path.append(node)
            for dep in graph.get(node, []):
                cycle = visit(dep)
                if cycle:
                    return cycle
            path.pop()
            visiting.remove(node)
            visited.add(node)
            return None

        for node in sorted(graph):
            cycle = visit(node)
            if cycle:
                return cycle
        return []
