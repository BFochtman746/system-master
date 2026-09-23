from __future__ import annotations

import copy
import datetime as dt
import hashlib
import json
from typing import Any, Optional

from tools.second_shift_supervisor_v2 import Conflict, SupervisorStore, parse_iso, utcnow

HANDOFF_PROTOCOL = "control-gateway.a01-supervisor-handoff.v1"
ADMISSION_PROTOCOL = "control-gateway.a01-admission-receipt.v1"
EXECUTION_CLASSES = {"A01_QUALIFICATION", "IMMEDIATE", "DELAYED", "OVERNIGHT"}


class GatewayHandoffError(RuntimeError):
    pass


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(value: Any) -> str:
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def _without(value: dict[str, Any], field: str) -> dict[str, Any]:
    result = copy.deepcopy(value)
    result.pop(field, None)
    return result


def _required(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise GatewayHandoffError(f"{label} must be a non-empty string")
    return value


def validate_gateway_handoff(handoff: dict[str, Any]) -> None:
    if not isinstance(handoff, dict):
        raise GatewayHandoffError("handoff must be an object")
    expected = {
        "protocol_version", "admission_receipt", "scheduling_owner", "github_role", "lane", "owner_path",
        "delegation_id", "objective_id", "control_ref", "control_head", "idempotency_key", "executor_kind",
        "execution_class", "execution_order", "priority", "not_before", "not_after", "payload_digest", "payload",
        "handoff_digest",
    }
    if set(handoff) != expected:
        raise GatewayHandoffError("handoff fields differ from frozen contract")
    if handoff["protocol_version"] != HANDOFF_PROTOCOL:
        raise GatewayHandoffError("handoff protocol mismatch")
    if handoff["scheduling_owner"] != "A01_SUPERVISOR" or handoff["github_role"] != "ADMISSION_TRANSPORT_EVIDENCE_ONLY":
        raise GatewayHandoffError("A-01 supervisor must be the sole scheduling owner")
    for key in ("lane", "owner_path", "delegation_id", "objective_id", "control_ref", "control_head", "idempotency_key", "executor_kind", "payload_digest", "handoff_digest"):
        _required(handoff[key], key)
    if handoff["execution_class"] not in EXECUTION_CLASSES:
        raise GatewayHandoffError("unsupported execution_class")
    if not isinstance(handoff["execution_order"], int) or handoff["execution_order"] < 0:
        raise GatewayHandoffError("execution_order must be nonnegative integer")
    if not isinstance(handoff["priority"], int) or not 0 <= handoff["priority"] <= 1000:
        raise GatewayHandoffError("priority must be 0..1000")
    if handoff["not_before"] is not None:
        parse_iso(handoff["not_before"])
    if handoff["not_after"] is not None:
        parse_iso(handoff["not_after"])
    if handoff["not_before"] and handoff["not_after"] and parse_iso(handoff["not_before"]) >= parse_iso(handoff["not_after"]):
        raise GatewayHandoffError("not_before must precede not_after")
    if digest(handoff["payload"]) != handoff["payload_digest"]:
        raise GatewayHandoffError("payload digest mismatch")

    receipt = handoff["admission_receipt"]
    if not isinstance(receipt, dict) or receipt.get("protocol_version") != ADMISSION_PROTOCOL or receipt.get("decision") != "GRANTED":
        raise GatewayHandoffError("valid A-01 admission receipt required")
    if receipt.get("scheduling_owner") != "A01_SUPERVISOR" or receipt.get("github_role") != "ADMISSION_TRANSPORT_EVIDENCE_ONLY":
        raise GatewayHandoffError("admission receipt scheduler authority mismatch")
    admission_digest = receipt.get("admission_digest")
    if not isinstance(admission_digest, str) or digest(_without(receipt, "admission_digest")) != admission_digest:
        raise GatewayHandoffError("admission receipt digest mismatch")

    bound = (
        "lane", "owner_path", "delegation_id", "objective_id", "control_ref", "control_head", "idempotency_key",
        "executor_kind", "execution_class", "execution_order", "priority", "not_before", "not_after", "payload_digest",
    )
    for key in bound:
        if handoff[key] != receipt.get(key):
            raise GatewayHandoffError(f"handoff {key} differs from admission receipt")
    if digest(_without(handoff, "handoff_digest")) != handoff["handoff_digest"]:
        raise GatewayHandoffError("handoff digest mismatch")


class SupervisorGatewayAdapter:
    """Bind an admitted Control Gateway handoff into SecondShiftSupervisorV2.

    GitHub is transport/evidence only. This adapter never dispatches externally.
    It only makes the admitted unit READY in the supervisor store and lets the
    supervisor's existing lease/fence/outbox machinery decide when it may run.
    """

    def __init__(self, store: SupervisorStore):
        if not isinstance(store, SupervisorStore):
            raise TypeError("store must be SupervisorStore")
        self.store = store

    def bind(self, handoff: dict[str, Any], now: Optional[dt.datetime] = None) -> None:
        validate_gateway_handoff(handoff)
        now = now or utcnow()
        self.store.register_lane(
            handoff["lane"], handoff["owner_path"], handoff["control_ref"], handoff["control_head"], now=now,
        )
        self.store.bind_ready(
            lane=handoff["lane"], delegation_id=handoff["delegation_id"], objective_id=handoff["objective_id"],
            control_head=handoff["control_head"], obligation_id=handoff["admission_receipt"]["task_id"],
            payload={
                "gateway_handoff_digest": handoff["handoff_digest"],
                "admission_digest": handoff["admission_receipt"]["admission_digest"],
                "execution_class": handoff["execution_class"], "execution_order": handoff["execution_order"],
                "priority": handoff["priority"], "not_before": handoff["not_before"], "not_after": handoff["not_after"],
                "independent_evaluation_required": isinstance(handoff["payload"], dict)
                and handoff["payload"].get("independent_evaluation_required") is True,
                "payload_digest": handoff["payload_digest"], "payload": handoff["payload"],
            },
            now=now,
        )

    def claim(self, handoff: dict[str, Any], now: Optional[dt.datetime] = None, lease_seconds: int = 300):
        validate_gateway_handoff(handoff)
        # CG-009 fail-closed boundary: once a delegation carries durable coordination
        # metadata, the CG-008 claim path may not bypass dependency/resource/cancel gates.
        has_table = self.store.conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='coordination_tasks'"
        ).fetchone()
        if has_table and self.store.conn.execute(
            "SELECT 1 FROM coordination_tasks WHERE delegation_id=?", (handoff["delegation_id"],)
        ).fetchone():
            raise Conflict("coordinated delegation requires SupervisorCoordinationAdapter")

        now = now or utcnow()
        not_before = parse_iso(handoff["not_before"]) if handoff["not_before"] else None
        not_after = parse_iso(handoff["not_after"]) if handoff["not_after"] else None
        if not_before and now < not_before:
            raise Conflict("admitted work is not_before gated")
        if not_after and now >= not_after:
            raise Conflict("admitted work window expired")
        allow_outside_shift = handoff["execution_class"] != "OVERNIGHT"
        return self.store.claim_ready(
            lane=handoff["lane"], delegation_id=handoff["delegation_id"], objective_id=handoff["objective_id"],
            control_head=handoff["control_head"], idempotency_key=handoff["idempotency_key"],
            executor_kind=handoff["executor_kind"],
            dispatch_payload={
                "gateway_handoff_digest": handoff["handoff_digest"],
                "admission_digest": handoff["admission_receipt"]["admission_digest"],
                "payload_digest": handoff["payload_digest"], "payload": handoff["payload"],
            },
            lease_seconds=lease_seconds, now=now, allow_outside_shift=allow_outside_shift,
        )
