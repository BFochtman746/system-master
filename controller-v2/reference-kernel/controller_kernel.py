from __future__ import annotations

import hashlib
import json
import re
import secrets
import sqlite3
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol

COMMAND_KEYS = {
    "protocol_version", "schema", "command_id", "created_at", "issuer",
    "command_type", "target", "preconditions", "intent", "constraints",
    "required_policy_version", "fingerprint"
}
TX_TERMINAL = {"SUCCEEDED", "REJECTED", "FAILED", "CANCELLED", "SUPERSEDED"}
OP_TERMINAL = {"SUCCEEDED", "FAILED", "CANCELLED", "STALE"}
QUAL_TERMINAL = {"PASSED", "FAILED", "INDETERMINATE", "CANCELLED"}
PROMOTION_TERMINAL = {"SUCCEEDED", "FAILED", "CANCELLED"}


class ControllerError(RuntimeError):
    pass


class ValidationError(ControllerError):
    pass


class IdempotencyConflict(ControllerError):
    pass


class ConcurrencyConflict(ControllerError):
    pass


class IllegalTransition(ControllerError):
    pass


class StaleLease(ControllerError):
    pass


class DurabilityBarrierNotMet(ControllerError):
    pass


class UnsupportedSchema(ControllerError):
    pass


class AmbiguousExternalResult(ControllerError):
    pass


class JournalCollision(ControllerError):
    pass


class DurableJournal(Protocol):
    def put_if_absent(self, *, event_id: str, body: str) -> None:
        ...

    def get(self, *, event_id: str) -> str | None:
        ...


class PromotionAdapter(Protocol):
    def promote(self, *, subject_repo: str, subject_sha: str, idempotency_key: str) -> None:
        ...

    def observe(self, *, subject_repo: str) -> str | None:
        ...


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


RFC3339_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$"
)


def validate_timestamp(value: str) -> None:
    if not isinstance(value, str) or not RFC3339_RE.fullmatch(value):
        raise ValidationError("timestamp must be RFC3339 with T separator and timezone")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValidationError("invalid RFC3339 timestamp") from exc
    if parsed.tzinfo is None:
        raise ValidationError("timestamp must include timezone")


def uuid7(now_ms: int | None = None) -> str:
    ms = int(time.time() * 1000) if now_ms is None else int(now_ms)
    if not 0 <= ms < (1 << 48):
        raise ValueError("uuid7 timestamp out of range")
    rand_a = secrets.randbits(12)
    rand_b = secrets.randbits(62)
    value = (ms << 80) | (0x7 << 76) | (rand_a << 64) | (0b10 << 62) | rand_b
    return str(uuid.UUID(int=value))


def _reject_unsupported_json(value: Any) -> None:
    if isinstance(value, float):
        raise ValidationError("floating-point values are forbidden in canonical protocol objects")
    if isinstance(value, str):
        if any(0xD800 <= ord(ch) <= 0xDFFF for ch in value):
            raise ValidationError("unpaired UTF-16 surrogate is forbidden")
    elif isinstance(value, list):
        for item in value:
            _reject_unsupported_json(item)
    elif isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                raise ValidationError("JSON object keys must be strings")
            _reject_unsupported_json(key)
            _reject_unsupported_json(item)
    elif value is not None and not isinstance(value, (bool, int)):
        raise ValidationError(f"unsupported JSON value type: {type(value).__name__}")


def _utf16_key(value: str) -> bytes:
    return value.encode("utf-16-be")


def _ordered(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _ordered(value[k]) for k in sorted(value, key=_utf16_key)}
    if isinstance(value, list):
        return [_ordered(v) for v in value]
    return value


def canonical_json(value: Any) -> str:
    _reject_unsupported_json(value)
    return json.dumps(
        _ordered(value),
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
    )


def sha256_json(value: Any) -> str:
    return "sha256:" + hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def command_fingerprint(command: dict[str, Any]) -> str:
    body = {k: v for k, v in command.items() if k != "fingerprint"}
    return sha256_json(body)


def validate_command(command: dict[str, Any]) -> None:
    if not isinstance(command, dict):
        raise ValidationError("command must be an object")
    unknown = set(command) - COMMAND_KEYS
    if unknown:
        raise ValidationError(f"unknown command fields: {sorted(unknown)}")
    required = {
        "protocol_version", "schema", "command_id", "created_at", "issuer",
        "command_type", "target", "intent", "fingerprint"
    }
    missing = required - set(command)
    if missing:
        raise ValidationError(f"missing command fields: {sorted(missing)}")
    if command["protocol_version"] != "1.0":
        raise UnsupportedSchema("unsupported protocol version")
    if command["schema"] != "controller://schemas/command/v1":
        raise UnsupportedSchema("unsupported command schema")
    try:
        uuid.UUID(command["command_id"])
    except Exception as exc:
        raise ValidationError("invalid command_id") from exc
    validate_timestamp(command["created_at"])
    if not isinstance(command["issuer"], dict) or not command["issuer"].get("principal"):
        raise ValidationError("issuer.principal required")
    if not isinstance(command["target"], dict):
        raise ValidationError("target must be an object")
    if not command["target"].get("repository"):
        raise ValidationError("target.repository required")
    sha = command["target"].get("expected_subject_sha")
    if sha is not None and (not isinstance(sha, str) or len(sha) != 40 or any(c not in "0123456789abcdefABCDEF" for c in sha)):
        raise ValidationError("expected_subject_sha must be a 40-hex Git SHA")
    actual = command_fingerprint(command)
    if command["fingerprint"] != actual:
        raise ValidationError("command fingerprint mismatch")


SCHEMA_SQL = r"""
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS commands (
  command_id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  body_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  transaction_id TEXT PRIMARY KEY,
  command_id TEXT NOT NULL UNIQUE REFERENCES commands(command_id),
  state TEXT NOT NULL,
  subject_repo TEXT NOT NULL,
  subject_sha TEXT,
  controller_version TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS operations (
  operation_id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id),
  state TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  result_json TEXT
);

CREATE TABLE IF NOT EXISTS resource_fences (
  resource_id TEXT PRIMARY KEY,
  generation INTEGER NOT NULL CHECK(generation >= 0)
);

CREATE TABLE IF NOT EXISTS leases (
  lease_id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL REFERENCES operations(operation_id),
  resource_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK(generation > 0),
  status TEXT NOT NULL CHECK(status IN ('ACTIVE','RELEASED','EXPIRED','REVOKED')),
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_heartbeat_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_lease_per_resource
  ON leases(resource_id) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS semantic_events (
  stream_id TEXT NOT NULL,
  stream_version INTEGER NOT NULL CHECK(stream_version > 0),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  prev_event_digest TEXT,
  event_digest TEXT NOT NULL UNIQUE,
  envelope_json TEXT NOT NULL,
  PRIMARY KEY(stream_id, stream_version)
);

CREATE TABLE IF NOT EXISTS outbox (
  outbox_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE REFERENCES semantic_events(event_id),
  state TEXT NOT NULL CHECK(state IN ('PENDING','SEALED')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  last_error TEXT,
  sealed_at TEXT
);

CREATE TABLE IF NOT EXISTS qualifications (
  qualification_id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id),
  subject_repo TEXT NOT NULL,
  subject_sha TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  state TEXT NOT NULL,
  receipt_id TEXT
);

CREATE TABLE IF NOT EXISTS promotions (
  promotion_id TEXT PRIMARY KEY,
  qualification_id TEXT NOT NULL REFERENCES qualifications(qualification_id),
  subject_repo TEXT NOT NULL,
  subject_sha TEXT NOT NULL,
  state TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE
);
"""


@dataclass(frozen=True)
class LeaseGrant:
    lease_id: str
    operation_id: str
    resource_id: str
    worker_id: str
    generation: int
    expires_at: str


class ControllerKernel:
    def __init__(
        self,
        db_path: str | Path,
        *,
        controller_version: str = "controller-ref-v1",
        policy_version: str = "policy-ref-v1",
        timeout: float = 5.0,
    ) -> None:
        self.db_path = str(db_path)
        self.controller_version = controller_version
        self.policy_version = policy_version
        self.conn = sqlite3.connect(self.db_path, timeout=timeout, isolation_level=None)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA_SQL)
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA synchronous=FULL")
        self.conn.execute("PRAGMA foreign_keys=ON")

    def close(self) -> None:
        self.conn.close()

    def _begin(self) -> None:
        self.conn.execute("BEGIN IMMEDIATE")

    def _commit(self) -> None:
        self.conn.execute("COMMIT")

    def _rollback(self) -> None:
        self.conn.execute("ROLLBACK")

    def _append_event_tx(
        self,
        *,
        stream_id: str,
        event_type: str,
        subject: str,
        data: dict[str, Any],
        correlation_id: str,
        causation_id: str | None = None,
        occurred_at: str | None = None,
    ) -> tuple[str, int]:
        row = self.conn.execute(
            "SELECT stream_version, event_digest FROM semantic_events "
            "WHERE stream_id=? ORDER BY stream_version DESC LIMIT 1",
            (stream_id,),
        ).fetchone()
        version = 1 if row is None else int(row["stream_version"]) + 1
        prev = None if row is None else row["event_digest"]
        event_id = uuid7()
        when = occurred_at or utc_now()
        validate_timestamp(when)
        envelope: dict[str, Any] = {
            "specversion": "1.0",
            "id": event_id,
            "source": "controller://reference-kernel",
            "type": event_type,
            "subject": subject,
            "time": when,
            "dataschema": f"controller://schemas/events/{event_type}/v1",
            "streamid": stream_id,
            "streamversion": version,
            "correlationid": correlation_id,
            "causationid": causation_id,
            "controllerdigest": self.controller_version,
            "policydigest": self.policy_version,
            "preveventdigest": prev,
            "data": data,
        }
        digest = sha256_json(envelope)
        envelope["eventdigest"] = digest
        body = canonical_json(envelope)
        self.conn.execute(
            "INSERT INTO semantic_events("
            "stream_id,stream_version,event_id,event_type,occurred_at,prev_event_digest,event_digest,envelope_json"
            ") VALUES(?,?,?,?,?,?,?,?)",
            (stream_id, version, event_id, event_type, when, prev, digest, body),
        )
        self.conn.execute(
            "INSERT INTO outbox(outbox_id,event_id,state) VALUES(?,?,'PENDING')",
            (uuid7(), event_id),
        )
        return event_id, version

    def accept_command(self, command: dict[str, Any]) -> str:
        validate_command(command)
        command_id = command["command_id"]
        fingerprint = command["fingerprint"]
        body = canonical_json(command)
        subject_repo = command["target"]["repository"]
        subject_sha = command["target"].get("expected_subject_sha")
        try:
            self._begin()
            existing = self.conn.execute(
                "SELECT fingerprint FROM commands WHERE command_id=?", (command_id,)
            ).fetchone()
            if existing is not None:
                if existing["fingerprint"] != fingerprint:
                    raise IdempotencyConflict("same command_id used with different semantic content")
                tx = self.conn.execute(
                    "SELECT transaction_id FROM transactions WHERE command_id=?", (command_id,)
                ).fetchone()
                self._commit()
                return tx["transaction_id"]

            self.conn.execute(
                "INSERT INTO commands(command_id,fingerprint,body_json,created_at) VALUES(?,?,?,?)",
                (command_id, fingerprint, body, command["created_at"]),
            )
            transaction_id = uuid7()
            self.conn.execute(
                "INSERT INTO transactions("
                "transaction_id,command_id,state,subject_repo,subject_sha,controller_version,policy_version"
                ") VALUES(?,?,'OPEN',?,?,?,?)",
                (
                    transaction_id,
                    command_id,
                    subject_repo,
                    subject_sha,
                    self.controller_version,
                    self.policy_version,
                ),
            )
            self._append_event_tx(
                stream_id=f"transaction:{transaction_id}",
                event_type="controller.command.accepted",
                subject=f"transaction/{transaction_id}",
                correlation_id=command_id,
                data={
                    "state": "OPEN",
                    "command_id": command_id,
                    "fingerprint": fingerprint,
                    "subject_repo": subject_repo,
                    "subject_sha": subject_sha,
                },
            )
            self._commit()
            return transaction_id
        except Exception:
            if self.conn.in_transaction:
                self._rollback()
            raise

    def _transition_transaction(self, transaction_id: str, allowed: set[str], new_state: str, event_type: str) -> None:
        try:
            self._begin()
            row = self.conn.execute(
                "SELECT * FROM transactions WHERE transaction_id=?", (transaction_id,)
            ).fetchone()
            if row is None:
                raise ValidationError("transaction not found")
            if row["state"] not in allowed:
                raise IllegalTransition(f"transaction {row['state']} -> {new_state} forbidden")
            self.conn.execute(
                "UPDATE transactions SET state=?, version=version+1 WHERE transaction_id=?",
                (new_state, transaction_id),
            )
            self._append_event_tx(
                stream_id=f"transaction:{transaction_id}",
                event_type=event_type,
                subject=f"transaction/{transaction_id}",
                correlation_id=row["command_id"],
                data={"from_state": row["state"], "state": new_state},
            )
            self._commit()
        except Exception:
            if self.conn.in_transaction:
                self._rollback()
            raise

    def admit_transaction(self, transaction_id: str) -> None:
        self._transition_transaction(transaction_id, {"OPEN"}, "ADMITTED", "controller.transaction.admitted")

    def complete_transaction(self, transaction_id: str) -> None:
        rows = self.conn.execute(
            "SELECT state FROM operations WHERE transaction_id=?", (transaction_id,)
        ).fetchall()
        if not rows or any(r["state"] != "SUCCEEDED" for r in rows):
            raise IllegalTransition("all operations must be SUCCEEDED before transaction completion")
        self._transition_transaction(
            transaction_id, {"ADMITTED", "ACTIVE", "WAITING"}, "SUCCEEDED", "controller.transaction.succeeded"
        )

    def plan_operation(self, transaction_id: str, resource_id: str) -> str:
        try:
            self._begin()
            tx = self.conn.execute(
                "SELECT * FROM transactions WHERE transaction_id=?", (transaction_id,)
            ).fetchone()
            if tx is None or tx["state"] not in {"ADMITTED", "ACTIVE"}:
                raise IllegalTransition("transaction must be ADMITTED or ACTIVE to plan")
            operation_id = uuid7()
            self.conn.execute(
                "INSERT INTO operations(operation_id,transaction_id,state,resource_id) VALUES(?,?,'PLANNED',?)",
                (operation_id, transaction_id, resource_id),
            )
            self.conn.execute(
                "UPDATE transactions SET state='ACTIVE', version=version+1 WHERE transaction_id=?",
                (transaction_id,),
            )
            self._append_event_tx(
                stream_id=f"operation:{operation_id}",
                event_type="controller.operation.planned",
                subject=f"operation/{operation_id}",
                correlation_id=tx["command_id"],
                data={
                    "state": "PLANNED",
                    "transaction_id": transaction_id,
                    "resource_id": resource_id,
                },
            )
            self._commit()
            return operation_id
        except Exception:
            if self.conn.in_transaction:
                self._rollback()
            raise

    def mark_operation_ready(self, operation_id: str) -> None:
        self._transition_operation(
            operation_id, {"PLANNED", "BLOCKED"}, "READY", "controller.operation.ready"
        )

    def _transition_operation(
        self,
        operation_id: str,
        allowed: set[str],
        new_state: str,
        event_type: str,
        data: dict[str, Any] | None = None,
    ) -> None:
        try:
            self._begin()
            op = self.conn.execute(
                "SELECT o.*, t.command_id FROM operations o JOIN transactions t "
                "ON t.transaction_id=o.transaction_id WHERE o.operation_id=?",
                (operation_id,),
            ).fetchone()
            if op is None:
                raise ValidationError("operation not found")
            if op["state"] not in allowed:
                raise IllegalTransition(f"operation {op['state']} -> {new_state} forbidden")
            self.conn.execute(
                "UPDATE operations SET state=?, version=version+1 WHERE operation_id=?",
                (new_state, operation_id),
            )
            payload = {"from_state": op["state"], "state": new_state}
            if data:
                payload.update(data)
            self._append_event_tx(
                stream_id=f"operation:{operation_id}",
                event_type=event_type,
                subject=f"operation/{operation_id}",
                correlation_id=op["command_id"],
                data=payload,
            )
            self._commit()
        except Exception:
            if self.conn.in_transaction:
                self._rollback()
            raise

    def _expire_resource_leases_tx(self, resource_id: str, now: str) -> None:
        rows = self.conn.execute(
            "SELECT l.*, o.state AS operation_state, t.command_id "
            "FROM leases l JOIN operations o ON o.operation_id=l.operation_id "
            "JOIN transactions t ON t.transaction_id=o.transaction_id "
            "WHERE l.resource_id=? AND l.status='ACTIVE'",
            (resource_id,),
        ).fetchall()
        now_dt = datetime.fromisoformat(now.replace("Z", "+00:00"))
        for row in rows:
            exp = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
            if exp <= now_dt:
                self.conn.execute(
                    "UPDATE leases SET status='EXPIRED' WHERE lease_id=?", (row["lease_id"],)
                )
                if row["operation_state"] in {"READY", "RUNNING"}:
                    self.conn.execute(
                        "UPDATE operations SET state='STALE', version=version+1 WHERE operation_id=?",
                        (row["operation_id"],),
                    )
                    self._append_event_tx(
                        stream_id=f"operation:{row['operation_id']}",
                        event_type="controller.operation.staled",
                        subject=f"operation/{row['operation_id']}",
                        correlation_id=row["command_id"],
                        data={"state": "STALE", "reason": "lease_expired"},
                    )

    def acquire_lease(
        self,
        operation_id: str,
        worker_id: str,
        *,
        ttl_seconds: int = 300,
        now: str | None = None,
    ) -> LeaseGrant:
        if ttl_seconds <= 0:
            raise ValidationError("ttl_seconds must be positive")
        now = now or utc_now()
        validate_timestamp(now)
        now_dt = datetime.fromisoformat(now.replace("Z", "+00:00"))
        expires = (now_dt.timestamp() + ttl_seconds)
        expires_at = datetime.fromtimestamp(expires, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        try:
            self._begin()
            op = self.conn.execute(
                "SELECT o.*, t.command_id FROM operations o JOIN transactions t "
                "ON t.transaction_id=o.transaction_id WHERE o.operation_id=?",
                (operation_id,),
            ).fetchone()
            if op is None or op["state"] != "READY":
                raise IllegalTransition("operation must be READY to acquire lease")
            resource_id = op["resource_id"]
            self._expire_resource_leases_tx(resource_id, now)
            refreshed = self.conn.execute(
                "SELECT state FROM operations WHERE operation_id=?", (operation_id,)
            ).fetchone()
            if refreshed is None or refreshed["state"] != "READY":
                raise StaleLease("operation became stale while expiring prior lease")
            active = self.conn.execute(
                "SELECT lease_id FROM leases WHERE resource_id=? AND status='ACTIVE'",
                (resource_id,),
            ).fetchone()
            if active is not None:
                raise ConcurrencyConflict("resource already has active lease")
            current = self.conn.execute(
                "SELECT generation FROM resource_fences WHERE resource_id=?", (resource_id,)
            ).fetchone()
            generation = 1 if current is None else int(current["generation"]) + 1
            self.conn.execute(
                "INSERT INTO resource_fences(resource_id,generation) VALUES(?,?) "
                "ON CONFLICT(resource_id) DO UPDATE SET generation=excluded.generation",
                (resource_id, generation),
            )
            lease_id = uuid7()
            self.conn.execute(
                "INSERT INTO leases("
                "lease_id,operation_id,resource_id,worker_id,generation,status,issued_at,expires_at,last_heartbeat_at"
                ") VALUES(?,?,?,?,?,'ACTIVE',?,?,?)",
                (lease_id, operation_id, resource_id, worker_id, generation, now, expires_at, now),
            )
            self._append_event_tx(
                stream_id=f"operation:{operation_id}",
                event_type="controller.lease.granted",
                subject=f"operation/{operation_id}",
                correlation_id=op["command_id"],
                data={
                    "lease_id": lease_id,
                    "resource_id": resource_id,
                    "worker_id": worker_id,
                    "generation": generation,
                    "expires_at": expires_at,
                },
            )
            self._commit()
            return LeaseGrant(lease_id, operation_id, resource_id, worker_id, generation, expires_at)
        except Exception:
            if self.conn.in_transaction:
                self._rollback()
            raise

    def _validate_lease_tx(
        self, lease_id: str, generation: int, *, now: str | None = None
    ) -> sqlite3.Row:
        row = self.conn.execute(
            "SELECT l.*, o.state AS operation_state, t.command_id "
            "FROM leases l JOIN operations o ON o.operation_id=l.operation_id "
            "JOIN transactions t ON t.transaction_id=o.transaction_id WHERE l.lease_id=?",
            (lease_id,),
        ).fetchone()
        if row is None or row["status"] != "ACTIVE":
            raise StaleLease("lease is not active")
        current = self.conn.execute(
            "SELECT generation FROM resource_fences WHERE resource_id=?", (row["resource_id"],)
        ).fetchone()
        if current is None or int(current["generation"]) != int(generation) or int(row["generation"]) != int(generation):
            raise StaleLease("fencing generation is stale")
        when = now or utc_now()
        now_dt = datetime.fromisoformat(when.replace("Z", "+00:00"))
        exp = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
        if exp <= now_dt:
            self.conn.execute(
                "UPDATE leases SET status='EXPIRED' WHERE lease_id=?", (lease_id,)
            )
            if row["operation_state"] in {"READY", "RUNNING"}:
                self.conn.execute(
                    "UPDATE operations SET state='STALE', version=version+1 WHERE operation_id=?",
                    (row["operation_id"],),
                )
                self._append_event_tx(
                    stream_id=f"operation:{row['operation_id']}",
                    event_type="controller.operation.staled",
                    subject=f"operation/{row['operation_id']}",
                    correlation_id=row["command_id"],
                    data={"state": "STALE", "reason": "lease_expired"},
                )
            raise StaleLease("lease expired")
        return row

    def heartbeat(self, lease_id: str, generation: int, *, now: str | None = None) -> None:
        when = now or utc_now()
        validate_timestamp(when)
        try:
            self._begin()
            self._validate_lease_tx(lease_id, generation, now=when)
            self.conn.execute(
                "UPDATE leases SET last_heartbeat_at=? WHERE lease_id=?", (when, lease_id)
            )
            self._commit()
        except StaleLease:
            if self.conn.in_transaction:
                self._commit()
            raise
        except Exception:
            if self.conn.in_transaction:
                self._rollback()
            raise

    def start_operation(self, lease_id: str, generation: int, *, now: str | None = None) -> None:
        try:
            self._begin()
            lease = self._validate_lease_tx(lease_id, generation, now=now)
            if lease["operation_state"] != "READY":
                raise IllegalTransition("operation must be READY to start")
            self.conn.execute(
                "UPDATE operations SET state='RUNNING', version=version+1 WHERE operation_id=?",
                (lease["operation_id"],),
            )
            self._append_event_tx(
                stream_id=f"operation:{lease['operation_id']}",
                event_type="controller.operation.started",
                subject=f"operation/{lease['operation_id']}",
                correlation_id=lease["command_id"],
                data={"state": "RUNNING", "lease_id": lease_id, "generation": generation},
            )
            self._commit()
        except StaleLease:
            if self.conn.in_transaction:
                self._commit()
            raise
        except Exception:
            if self.conn.in_transaction:
                self._rollback()
            raise

    def submit_worker_result(
        self,
        lease_id: str,
        generation: int,
        result: dict[str, Any],
        *,
        now: str | None = None,
    ) -> None:
        canonical_json(result)
        try:
            self._begin()
            lease = self._validate_lease_tx(lease_id, generation, now=now)
            if lease["operation_state"] != "RUNNING":
                raise IllegalTransition("worker result requires RUNNING operation")
            self.conn.execute(
                "UPDATE operations SET state='VERIFYING', version=version+1, result_json=? WHERE operation_id=?",
                (canonical_json(result), lease["operation_id"]),
            )
            self.conn.execute(
                "UPDATE leases SET status='RELEASED' WHERE lease_id=?", (lease_id,)
            )
            self._append_event_tx(
                stream_id=f"operation:{lease['operation_id']}",
                event_type="controller.operation.result-submitted",
                subject=f"operation/{lease['operation_id']}",
                correlation_id=lease["command_id"],
                data={
                    "state": "VERIFYING",
                    "lease_id": lease_id,
                    "generation": generation,
                    "result_digest": sha256_json(result),
                },
            )
            self._commit()
        except StaleLease:
            if self.conn.in_transaction:
                self._commit()
            raise
        except Exception:
            if self.conn.in_transaction:
                self._rollback()
            raise

    def verify_operation(self, operation_id: str, accepted: bool) -> None:
        self._transition_operation(
            operation_id,
            {"VERIFYING"},
            "SUCCEEDED" if accepted else "FAILED",
            "controller.operation.succeeded" if accepted else "controller.operation.failed",
        )

    def publish_outbox_event(self, event_id: str, journal: DurableJournal, *, when: str | None = None) -> None:
        """Seal only after durable put-if-absent plus byte-for-byte readback verification."""
        when = when or utc_now()
        validate_timestamp(when)
        row = self.conn.execute(
            "SELECT o.state, e.envelope_json FROM outbox o "
            "JOIN semantic_events e ON e.event_id=o.event_id WHERE o.event_id=?",
            (event_id,),
        ).fetchone()
        if row is None:
            raise ValidationError("outbox event not found")
        body = row["envelope_json"]
        journal.put_if_absent(event_id=event_id, body=body)
        observed = journal.get(event_id=event_id)
        if observed != body:
            raise JournalCollision("durable journal readback differs from local canonical event")
        try:
            self._begin()
            current = self.conn.execute(
                "SELECT state FROM outbox WHERE event_id=?", (event_id,)
            ).fetchone()
            if current is None:
                raise ValidationError("outbox event disappeared")
            if current["state"] == "SEALED":
                self._commit()
                return
            self.conn.execute(
                "UPDATE outbox SET state='SEALED', sealed_at=? WHERE event_id=?",
                (when, event_id),
            )
            self._commit()
        except Exception:
            if self.conn.in_transaction:
                self._rollback()
            raise

    def outbox_state(self, event_id: str) -> str | None:
        row = self.conn.execute("SELECT state FROM outbox WHERE event_id=?", (event_id,)).fetchone()
        return None if row is None else row["state"]

    def pending_outbox(self) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            "SELECT o.*, e.envelope_json FROM outbox o JOIN semantic_events e ON e.event_id=o.event_id "
            "WHERE o.state='PENDING' ORDER BY e.rowid"
        ).fetchall()
        return [dict(r) for r in rows]

    def events(self, stream_id: str | None = None) -> list[dict[str, Any]]:
        if stream_id is None:
            rows = self.conn.execute(
                "SELECT envelope_json FROM semantic_events ORDER BY rowid"
            ).fetchall()
        else:
            rows = self.conn.execute(
                "SELECT envelope_json FROM semantic_events WHERE stream_id=? ORDER BY stream_version",
                (stream_id,),
            ).fetchall()
        return [json.loads(r["envelope_json"]) for r in rows]

    @staticmethod
    def verify_event_stream(events: list[dict[str, Any]]) -> None:
        expected_version = 1
        previous = None
        for event in events:
            if event.get("specversion") != "1.0":
                raise UnsupportedSchema("unsupported CloudEvents version")
            if event.get("streamversion") != expected_version:
                raise ValidationError("non-contiguous stream version")
            if event.get("preveventdigest") != previous:
                raise ValidationError("previous digest mismatch")
            claimed = event.get("eventdigest")
            base = {k: v for k, v in event.items() if k != "eventdigest"}
            actual = sha256_json(base)
            if claimed != actual:
                raise ValidationError("event digest mismatch")
            previous = claimed
            expected_version += 1

    @staticmethod
    def project_events(events: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
        grouped: dict[str, list[dict[str, Any]]] = {}
        for event in events:
            if event.get("specversion") != "1.0":
                raise UnsupportedSchema("unsupported event envelope")
            schema = event.get("dataschema", "")
            if not schema.endswith("/v1"):
                raise UnsupportedSchema(f"unsupported event data schema: {schema}")
            grouped.setdefault(event["streamid"], []).append(event)
        projection: dict[str, dict[str, Any]] = {}
        for stream_id, stream_events in grouped.items():
            stream_events.sort(key=lambda e: int(e["streamversion"]))
            ControllerKernel.verify_event_stream(stream_events)
            last = stream_events[-1]
            projection[stream_id] = {
                "stream_version": last["streamversion"],
                "last_event_id": last["id"],
                "last_event_type": last["type"],
                "state": last.get("data", {}).get("state"),
                "event_digest": last["eventdigest"],
            }
        return projection

    def append_semantic_event(
        self,
        *,
        stream_id: str,
        event_type: str,
        subject: str,
        data: dict[str, Any],
        correlation_id: str,
        expected_current_version: int,
    ) -> tuple[str, int]:
        """Reference append API with optimistic concurrency."""
        if expected_current_version < 0:
            raise ValidationError("expected_current_version must be >= 0")
        canonical_json(data)
        try:
            self._begin()
            row = self.conn.execute(
                "SELECT COALESCE(MAX(stream_version),0) AS v FROM semantic_events WHERE stream_id=?",
                (stream_id,),
            ).fetchone()
            current = int(row["v"])
            if current != expected_current_version:
                raise ConcurrencyConflict(
                    f"stream {stream_id} expected version {expected_current_version}, actual {current}"
                )
            result = self._append_event_tx(
                stream_id=stream_id,
                event_type=event_type,
                subject=subject,
                data=data,
                correlation_id=correlation_id,
            )
            self._commit()
            return result
        except Exception:
            if self.conn.in_transaction:
                self._rollback()
            raise

    def request_qualification(
        self,
        transaction_id: str,
        *,
        subject_repo: str,
        subject_sha: str,
        policy_version: str | None = None,
    ) -> str:
        if len(subject_sha) != 40 or any(c not in "0123456789abcdefABCDEF" for c in subject_sha):
            raise ValidationError("qualification subject must be exact 40-hex SHA")
        try:
            self._begin()
            tx = self.conn.execute(
                "SELECT command_id FROM transactions WHERE transaction_id=?", (transaction_id,)
            ).fetchone()
            if tx is None:
                raise ValidationError("transaction not found")
            qid = uuid7()
            policy = policy_version or self.policy_version
            self.conn.execute(
                "INSERT INTO qualifications("
                "qualification_id,transaction_id,subject_repo,subject_sha,policy_version,state"
                ") VALUES(?,?,?,?,?,'REQUESTED')",
                (qid, transaction_id, subject_repo, subject_sha, policy),
            )
            self._append_event_tx(
                stream_id=f"qualification:{qid}",
                event_type="controller.qualification.requested",
                subject=f"qualification/{qid}",
                correlation_id=tx["command_id"],
                data={"state": "REQUESTED", "subject_repo": subject_repo, "subject_sha": subject_sha, "policy_version": policy},
            )
            self._commit()
            return qid
        except Exception:
            if self.conn.in_transaction:
                self._rollback()
            raise

    def finish_qualification(self, qualification_id: str, verdict: str, receipt_id: str) -> None:
        if verdict not in {"PASSED", "FAILED", "INDETERMINATE", "CANCELLED"}:
            raise ValidationError("invalid qualification verdict")
        try:
            self._begin()
            row = self.conn.execute(
                "SELECT q.*, t.command_id FROM qualifications q JOIN transactions t "
                "ON t.transaction_id=q.transaction_id WHERE qualification_id=?",
                (qualification_id,),
            ).fetchone()
            if row is None or row["state"] in QUAL_TERMINAL:
                raise IllegalTransition("qualification not finishable")
            self.conn.execute(
                "UPDATE qualifications SET state=?, receipt_id=? WHERE qualification_id=?",
                (verdict, receipt_id, qualification_id),
            )
            self._append_event_tx(
                stream_id=f"qualification:{qualification_id}",
                event_type=f"controller.qualification.{verdict.lower()}",
                subject=f"qualification/{qualification_id}",
                correlation_id=row["command_id"],
                data={"state": verdict, "subject_repo": row["subject_repo"], "subject_sha": row["subject_sha"], "receipt_id": receipt_id},
            )
            self._commit()
        except Exception:
            if self.conn.in_transaction:
                self._rollback()
            raise

    def request_promotion(self, qualification_id: str) -> str:
        try:
            self._begin()
            q = self.conn.execute(
                "SELECT q.*, t.command_id FROM qualifications q JOIN transactions t "
                "ON t.transaction_id=q.transaction_id WHERE qualification_id=?",
                (qualification_id,),
            ).fetchone()
            if q is None or q["state"] != "PASSED":
                raise IllegalTransition("only PASSED qualification may request promotion")
            pid = uuid7()
            idem = f"promotion:{pid}:{q['subject_sha']}"
            self.conn.execute(
                "INSERT INTO promotions("
                "promotion_id,qualification_id,subject_repo,subject_sha,state,idempotency_key"
                ") VALUES(?,?,?,?, 'REQUESTED', ?)",
                (pid, qualification_id, q["subject_repo"], q["subject_sha"], idem),
            )
            self._append_event_tx(
                stream_id=f"promotion:{pid}",
                event_type="controller.promotion.requested",
                subject=f"promotion/{pid}",
                correlation_id=q["command_id"],
                data={"state": "REQUESTED", "subject_repo": q["subject_repo"], "subject_sha": q["subject_sha"], "qualification_id": qualification_id},
            )
            self._commit()
            return pid
        except Exception:
            if self.conn.in_transaction:
                self._rollback()
            raise

    def authorize_promotion(self, promotion_id: str) -> str:
        try:
            self._begin()
            row = self.conn.execute(
                "SELECT p.*, t.command_id FROM promotions p JOIN qualifications q "
                "ON q.qualification_id=p.qualification_id JOIN transactions t "
                "ON t.transaction_id=q.transaction_id WHERE p.promotion_id=?",
                (promotion_id,),
            ).fetchone()
            if row is None or row["state"] != "REQUESTED":
                raise IllegalTransition("promotion must be REQUESTED")
            self.conn.execute(
                "UPDATE promotions SET state='AUTHORIZED' WHERE promotion_id=?", (promotion_id,)
            )
            event_id, _ = self._append_event_tx(
                stream_id=f"promotion:{promotion_id}",
                event_type="controller.promotion.authorized",
                subject=f"promotion/{promotion_id}",
                correlation_id=row["command_id"],
                data={"state": "AUTHORIZED", "subject_repo": row["subject_repo"], "subject_sha": row["subject_sha"], "qualification_id": row["qualification_id"]},
            )
            self._commit()
            return event_id
        except Exception:
            if self.conn.in_transaction:
                self._rollback()
            raise

    def execute_promotion(self, promotion_id: str, adapter: PromotionAdapter) -> None:
        row = self.conn.execute(
            "SELECT * FROM promotions WHERE promotion_id=?", (promotion_id,)
        ).fetchone()
        if row is None or row["state"] != "AUTHORIZED":
            raise IllegalTransition("promotion must be AUTHORIZED")
        ev = self.conn.execute(
            "SELECT o.state FROM semantic_events e JOIN outbox o ON o.event_id=e.event_id "
            "WHERE e.stream_id=? AND e.event_type='controller.promotion.authorized' "
            "ORDER BY e.stream_version DESC LIMIT 1",
            (f"promotion:{promotion_id}",),
        ).fetchone()
        if ev is None or ev["state"] != "SEALED":
            raise DurabilityBarrierNotMet("promotion authorization is not durably sealed")
        try:
            adapter.promote(
                subject_repo=row["subject_repo"],
                subject_sha=row["subject_sha"],
                idempotency_key=row["idempotency_key"],
            )
        except AmbiguousExternalResult:
            self._set_promotion_state(
                promotion_id, {"AUTHORIZED"}, "RECONCILIATION_REQUIRED",
                "controller.promotion.reconciliation-required"
            )
            return
        self._set_promotion_state(
            promotion_id, {"AUTHORIZED"}, "SUCCEEDED", "controller.promotion.succeeded"
        )

    def reconcile_promotion(self, promotion_id: str, adapter: PromotionAdapter) -> str:
        row = self.conn.execute(
            "SELECT * FROM promotions WHERE promotion_id=?", (promotion_id,)
        ).fetchone()
        if row is None or row["state"] != "RECONCILIATION_REQUIRED":
            raise IllegalTransition("promotion is not awaiting reconciliation")
        observed = adapter.observe(subject_repo=row["subject_repo"])
        if observed == row["subject_sha"]:
            self._set_promotion_state(
                promotion_id, {"RECONCILIATION_REQUIRED"}, "SUCCEEDED",
                "controller.promotion.succeeded"
            )
            return "SUCCEEDED"
        self._set_promotion_state(
            promotion_id, {"RECONCILIATION_REQUIRED"}, "AUTHORIZED",
            "controller.promotion.retry-authorized"
        )
        return "AUTHORIZED"

    def _set_promotion_state(self, promotion_id: str, allowed: set[str], new_state: str, event_type: str) -> None:
        try:
            self._begin()
            row = self.conn.execute(
                "SELECT p.*, t.command_id FROM promotions p JOIN qualifications q "
                "ON q.qualification_id=p.qualification_id JOIN transactions t "
                "ON t.transaction_id=q.transaction_id WHERE p.promotion_id=?",
                (promotion_id,),
            ).fetchone()
            if row is None or row["state"] not in allowed:
                raise IllegalTransition("invalid promotion transition")
            self.conn.execute(
                "UPDATE promotions SET state=? WHERE promotion_id=?", (new_state, promotion_id)
            )
            self._append_event_tx(
                stream_id=f"promotion:{promotion_id}",
                event_type=event_type,
                subject=f"promotion/{promotion_id}",
                correlation_id=row["command_id"],
                data={"state": new_state, "subject_repo": row["subject_repo"], "subject_sha": row["subject_sha"]},
            )
            self._commit()
        except Exception:
            if self.conn.in_transaction:
                self._rollback()
            raise

    def get_state(self, table: str, id_field: str, object_id: str) -> str:
        if table not in {"transactions", "operations", "qualifications", "promotions", "leases"}:
            raise ValueError("unsupported table")
        if id_field not in {"transaction_id", "operation_id", "qualification_id", "promotion_id", "lease_id"}:
            raise ValueError("unsupported id field")
        field = "status" if table == "leases" else "state"
        row = self.conn.execute(
            f"SELECT {field} AS state FROM {table} WHERE {id_field}=?", (object_id,)
        ).fetchone()
        if row is None:
            raise ValidationError("object not found")
        return row["state"]


class MemoryJournal:
    """Deterministic test adapter implementing put-if-absent journal semantics."""
    def __init__(self) -> None:
        self._events: dict[str, str] = {}

    def put_if_absent(self, *, event_id: str, body: str) -> None:
        prior = self._events.get(event_id)
        if prior is not None and prior != body:
            raise JournalCollision("event_id already exists with different bytes")
        self._events.setdefault(event_id, body)

    def get(self, *, event_id: str) -> str | None:
        return self._events.get(event_id)


class WorkerFacade:
    """Narrow worker authority: no qualification, policy, or promotion methods."""
    def __init__(self, kernel: ControllerKernel) -> None:
        self._kernel = kernel

    def heartbeat(self, lease_id: str, generation: int, *, now: str | None = None) -> None:
        self._kernel.heartbeat(lease_id, generation, now=now)

    def start_operation(self, lease_id: str, generation: int, *, now: str | None = None) -> None:
        self._kernel.start_operation(lease_id, generation, now=now)

    def submit_result(self, lease_id: str, generation: int, result: dict[str, Any], *, now: str | None = None) -> None:
        self._kernel.submit_worker_result(lease_id, generation, result, now=now)


class QualifierFacade:
    """Narrow qualifier authority: reports verdicts but has no subject mutation API."""
    def __init__(self, kernel: ControllerKernel) -> None:
        self._kernel = kernel

    def finish(self, qualification_id: str, verdict: str, receipt_id: str) -> None:
        self._kernel.finish_qualification(qualification_id, verdict, receipt_id)
