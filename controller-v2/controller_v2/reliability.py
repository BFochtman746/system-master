from __future__ import annotations

import hashlib
import os
import sqlite3
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from .store import IdempotencyConflict, InvalidState, canonical_json, new_uuid7, now_ms, sha256_text


@dataclass(frozen=True)
class BackupResult:
    path: Path
    sha256: str
    size_bytes: int
    created_at_ms: int


@dataclass(frozen=True)
class EffectResult:
    effect_id: str
    duplicate: bool


@dataclass(frozen=True)
class RecoveryReport:
    expired_leases: int
    interrupted_attempts: int
    recovering_transactions: int
    ambiguous_effects: int
    requeued_outbox: int


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _fsync_parent(path: Path) -> None:
    flags = getattr(os, "O_DIRECTORY", 0)
    if not flags:
        return
    try:
        fd = os.open(str(path), os.O_RDONLY | flags)
    except OSError:
        return
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def create_verified_backup(db_path: str | Path, destination: str | Path) -> BackupResult:
    """Create a consistent SQLite backup and atomically publish it after verification.

    The live database is read through SQLite's online backup API. Raw copying of a
    live database/WAL pair is deliberately avoided.
    """
    source_path = Path(db_path)
    target_path = Path(destination)
    if not source_path.exists():
        raise FileNotFoundError(source_path)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = target_path.with_name(f".{target_path.name}.{uuid.uuid4().hex}.tmp")
    created_at = now_ms()

    try:
        source = sqlite3.connect(str(source_path), timeout=5.0, isolation_level=None)
        target = sqlite3.connect(str(temp_path), timeout=5.0, isolation_level=None)
        try:
            source.backup(target)
        finally:
            target.close()
            source.close()

        verifier = sqlite3.connect(str(temp_path), timeout=5.0, isolation_level=None)
        try:
            verifier.execute("PRAGMA foreign_keys=ON")
            integrity_rows = [str(row[0]) for row in verifier.execute("PRAGMA integrity_check").fetchall()]
            if integrity_rows != ["ok"]:
                raise InvalidState(f"backup integrity_check failed: {integrity_rows!r}")
            foreign_key_rows = verifier.execute("PRAGMA foreign_key_check").fetchall()
            if foreign_key_rows:
                raise InvalidState(f"backup foreign_key_check failed: {foreign_key_rows!r}")
        finally:
            verifier.close()

        with temp_path.open("rb") as handle:
            os.fsync(handle.fileno())
        os.replace(temp_path, target_path)
        _fsync_parent(target_path.parent)
        return BackupResult(
            path=target_path,
            sha256=_sha256_file(target_path),
            size_bytes=target_path.stat().st_size,
            created_at_ms=created_at,
        )
    finally:
        if temp_path.exists():
            temp_path.unlink()


class ReliabilityManager:
    """Provider-independent recovery, remote-effect, and projection primitives."""

    def __init__(self, store, *, clock_ms: Callable[[], int] | None = None):
        self.store = store
        self._clock_ms = clock_ms or now_ms

    @staticmethod
    def _tx_context(con: sqlite3.Connection, transaction_id: str) -> tuple[str, str]:
        row = con.execute(
            "SELECT command_id,base_subject_id,candidate_subject_id FROM transactions WHERE transaction_id=?",
            (transaction_id,),
        ).fetchone()
        if not row:
            raise KeyError(transaction_id)
        return str(row["command_id"]), str(row["candidate_subject_id"] or row["base_subject_id"])

    def prepare_effect(
        self,
        *,
        transaction_id: str,
        provider: str,
        effect_type: str,
        target_key: str,
        idempotency_key: str,
        request_payload: dict[str, Any],
        expected_remote_version: str | None = None,
    ) -> EffectResult:
        request_digest = sha256_text(canonical_json(request_payload))
        ts = self._clock_ms()
        with self.store.immediate() as con:
            command_id, subject = self._tx_context(con, transaction_id)
            prior = con.execute(
                "SELECT * FROM external_effects WHERE provider=? AND idempotency_key=?",
                (provider, idempotency_key),
            ).fetchone()
            if prior:
                expected = (
                    transaction_id,
                    effect_type,
                    target_key,
                    request_digest,
                    expected_remote_version,
                )
                actual = (
                    str(prior["transaction_id"]),
                    str(prior["effect_type"]),
                    str(prior["target_key"]),
                    str(prior["request_digest_sha256"]),
                    prior["expected_remote_version"],
                )
                if actual != expected:
                    raise IdempotencyConflict(
                        "same external-effect idempotency key was reused with different semantics"
                    )
                return EffectResult(str(prior["effect_id"]), True)

            effect_id = new_uuid7()
            con.execute(
                "INSERT INTO external_effects(effect_id,transaction_id,provider,effect_type,target_key,idempotency_key,request_digest_sha256,expected_remote_version,state,attempt_count,remote_result_ref,last_error_code,created_at_ms,updated_at_ms) "
                "VALUES(?,?,?,?,?,?,?,?, 'PREPARED',0,NULL,NULL,?,?)",
                (
                    effect_id,
                    transaction_id,
                    provider,
                    effect_type,
                    target_key,
                    idempotency_key,
                    request_digest,
                    expected_remote_version,
                    ts,
                    ts,
                ),
            )
            self.store._append_event(
                con,
                transaction_id=transaction_id,
                command_id=command_id,
                event_type="controller.external_effect.prepared",
                subject=subject,
                payload={
                    "effect_id": effect_id,
                    "effect_type": effect_type,
                    "provider": provider,
                    "request_digest_sha256": request_digest,
                    "target_key": target_key,
                },
            )
            return EffectResult(effect_id, False)

    def get_effect(self, effect_id: str) -> sqlite3.Row:
        con = self.store.connect()
        try:
            row = con.execute("SELECT * FROM external_effects WHERE effect_id=?", (effect_id,)).fetchone()
            if not row:
                raise KeyError(effect_id)
            return row
        finally:
            con.close()

    def mark_effect_inflight(self, effect_id: str) -> None:
        ts = self._clock_ms()
        with self.store.immediate() as con:
            row = con.execute("SELECT * FROM external_effects WHERE effect_id=?", (effect_id,)).fetchone()
            if not row or row["state"] != "PREPARED":
                raise InvalidState("external effect must be PREPARED before send")
            con.execute(
                "UPDATE external_effects SET state='INFLIGHT',attempt_count=attempt_count+1,last_error_code=NULL,updated_at_ms=? WHERE effect_id=?",
                (ts, effect_id),
            )
            command_id, subject = self._tx_context(con, str(row["transaction_id"]))
            self.store._append_event(
                con,
                transaction_id=str(row["transaction_id"]),
                command_id=command_id,
                event_type="controller.external_effect.inflight",
                subject=subject,
                payload={"effect_id": effect_id, "attempt_count": int(row["attempt_count"]) + 1},
            )

    def record_effect_outcome(
        self,
        effect_id: str,
        outcome: str,
        *,
        remote_result_ref: str | None = None,
        error_code: str | None = None,
    ) -> None:
        if outcome not in {"SUCCEEDED", "FAILED", "UNKNOWN"}:
            raise ValueError("unsupported external effect outcome")
        if outcome == "SUCCEEDED" and not remote_result_ref:
            raise InvalidState("successful external effect requires remote_result_ref")
        if outcome in {"FAILED", "UNKNOWN"} and not error_code:
            raise InvalidState("failed/unknown external effect requires error_code")
        ts = self._clock_ms()
        with self.store.immediate() as con:
            row = con.execute("SELECT * FROM external_effects WHERE effect_id=?", (effect_id,)).fetchone()
            if not row or row["state"] != "INFLIGHT":
                raise InvalidState("external effect outcome requires INFLIGHT state")
            con.execute(
                "UPDATE external_effects SET state=?,remote_result_ref=?,last_error_code=?,updated_at_ms=? WHERE effect_id=?",
                (outcome, remote_result_ref, error_code, ts, effect_id),
            )
            command_id, subject = self._tx_context(con, str(row["transaction_id"]))
            self.store._append_event(
                con,
                transaction_id=str(row["transaction_id"]),
                command_id=command_id,
                event_type="controller.external_effect.outcome",
                subject=subject,
                payload={
                    "effect_id": effect_id,
                    "error_code": error_code,
                    "outcome": outcome,
                    "remote_result_ref": remote_result_ref,
                },
            )

    def begin_reconciliation(self, effect_id: str) -> None:
        ts = self._clock_ms()
        with self.store.immediate() as con:
            row = con.execute("SELECT * FROM external_effects WHERE effect_id=?", (effect_id,)).fetchone()
            if not row or row["state"] != "UNKNOWN":
                raise InvalidState("only UNKNOWN effects may begin reconciliation")
            con.execute(
                "UPDATE external_effects SET state='RECONCILING',updated_at_ms=? WHERE effect_id=?",
                (ts, effect_id),
            )
            command_id, subject = self._tx_context(con, str(row["transaction_id"]))
            self.store._append_event(
                con,
                transaction_id=str(row["transaction_id"]),
                command_id=command_id,
                event_type="controller.external_effect.reconciling",
                subject=subject,
                payload={"effect_id": effect_id},
            )

    def resolve_reconciliation(
        self,
        effect_id: str,
        outcome: str,
        *,
        remote_result_ref: str | None = None,
        error_code: str | None = None,
    ) -> None:
        if outcome not in {"SUCCEEDED", "FAILED", "UNKNOWN"}:
            raise ValueError("unsupported reconciliation outcome")
        if outcome == "SUCCEEDED" and not remote_result_ref:
            raise InvalidState("successful reconciliation requires remote_result_ref")
        if outcome in {"FAILED", "UNKNOWN"} and not error_code:
            raise InvalidState("failed/unknown reconciliation requires error_code")
        ts = self._clock_ms()
        with self.store.immediate() as con:
            row = con.execute("SELECT * FROM external_effects WHERE effect_id=?", (effect_id,)).fetchone()
            if not row or row["state"] != "RECONCILING":
                raise InvalidState("effect is not RECONCILING")
            con.execute(
                "UPDATE external_effects SET state=?,remote_result_ref=?,last_error_code=?,updated_at_ms=? WHERE effect_id=?",
                (outcome, remote_result_ref, error_code, ts, effect_id),
            )
            command_id, subject = self._tx_context(con, str(row["transaction_id"]))
            self.store._append_event(
                con,
                transaction_id=str(row["transaction_id"]),
                command_id=command_id,
                event_type="controller.external_effect.reconciled",
                subject=subject,
                payload={
                    "effect_id": effect_id,
                    "error_code": error_code,
                    "outcome": outcome,
                    "remote_result_ref": remote_result_ref,
                },
            )

    def advance_projection(
        self,
        projection_name: str,
        destination: str,
        event_seq: int,
        event_id: str,
    ) -> None:
        ts = self._clock_ms()
        with self.store.immediate() as con:
            event = con.execute(
                "SELECT event_seq,event_id FROM controller_events WHERE event_seq=? AND event_id=?",
                (event_seq, event_id),
            ).fetchone()
            if not event:
                raise InvalidState("projection cursor must reference a real controller event")
            row = con.execute(
                "SELECT * FROM projection_state WHERE projection_name=?", (projection_name,)
            ).fetchone()
            if row is None:
                con.execute(
                    "INSERT INTO projection_state(projection_name,destination,last_event_seq,last_event_id,published_at_ms,status,last_error_code) "
                    "VALUES(?,?,?,?,?,'CURRENT',NULL)",
                    (projection_name, destination, event_seq, event_id, ts),
                )
                return
            if str(row["destination"]) != destination:
                raise InvalidState("projection destination is immutable")
            current_seq = int(row["last_event_seq"])
            if event_seq < current_seq:
                raise InvalidState("projection cursor cannot regress")
            if event_seq == current_seq and row["last_event_id"] != event_id:
                raise InvalidState("projection sequence is already bound to a different event")
            con.execute(
                "UPDATE projection_state SET last_event_seq=?,last_event_id=?,published_at_ms=?,status='CURRENT',last_error_code=NULL WHERE projection_name=?",
                (event_seq, event_id, ts, projection_name),
            )

    def mark_projection_stale(self, projection_name: str, error_code: str) -> None:
        with self.store.immediate() as con:
            updated = con.execute(
                "UPDATE projection_state SET status='STALE',last_error_code=? WHERE projection_name=?",
                (error_code, projection_name),
            ).rowcount
            if updated != 1:
                raise KeyError(projection_name)

    def mark_projection_error(self, projection_name: str, error_code: str) -> None:
        with self.store.immediate() as con:
            updated = con.execute(
                "UPDATE projection_state SET status='ERROR',last_error_code=? WHERE projection_name=?",
                (error_code, projection_name),
            ).rowcount
            if updated != 1:
                raise KeyError(projection_name)

    def get_projection(self, projection_name: str) -> sqlite3.Row:
        con = self.store.connect()
        try:
            row = con.execute(
                "SELECT * FROM projection_state WHERE projection_name=?", (projection_name,)
            ).fetchone()
            if not row:
                raise KeyError(projection_name)
            return row
        finally:
            con.close()

    def recover_after_restart(self) -> RecoveryReport:
        """Reconcile crash-sensitive local state without replaying remote effects."""
        ts = self._clock_ms()
        expired_leases = interrupted_attempts = recovering_transactions = 0
        ambiguous_effects = requeued_outbox = 0

        with self.store.immediate() as con:
            leases = con.execute(
                "SELECT lease_id FROM leases WHERE state='ACTIVE' AND expires_at_ms<=?",
                (ts,),
            ).fetchall()
            for lease in leases:
                con.execute(
                    "UPDATE leases SET state='EXPIRED',released_at_ms=?,release_reason='CONTROLLER_RESTART_EXPIRED' WHERE lease_id=?",
                    (ts, lease["lease_id"]),
                )
                expired_leases += 1

            attempts = con.execute(
                "SELECT a.attempt_id,a.transaction_id FROM execution_attempts a "
                "JOIN leases l ON l.lease_id=a.lease_id "
                "JOIN protected_resources p ON p.resource_key=l.resource_key "
                "WHERE a.state='STARTED' AND (l.state<>'ACTIVE' OR l.expires_at_ms<=? OR p.last_fencing_token<>l.fencing_token)",
                (ts,),
            ).fetchall()
            for attempt in attempts:
                con.execute(
                    "UPDATE execution_attempts SET state='INTERRUPTED',finished_at_ms=?,error_code='CONTROLLER_RESTART_LOST_LEASE' WHERE attempt_id=?",
                    (ts, attempt["attempt_id"]),
                )
                interrupted_attempts += 1

            transactions = con.execute(
                "SELECT t.transaction_id,t.command_id,t.base_subject_id,t.candidate_subject_id,t.execution_state "
                "FROM transactions t WHERE t.execution_state IN ('CLAIMED','RUNNING','VERIFYING') AND NOT EXISTS ("
                " SELECT 1 FROM leases l JOIN protected_resources p ON p.resource_key=l.resource_key"
                " WHERE l.transaction_id=t.transaction_id AND l.state='ACTIVE' AND l.expires_at_ms>?"
                " AND p.last_fencing_token=l.fencing_token) ",
                (ts,),
            ).fetchall()
            for tx in transactions:
                con.execute(
                    "UPDATE transactions SET execution_state='RECOVERING',row_version=row_version+1,updated_at_ms=? WHERE transaction_id=?",
                    (ts, tx["transaction_id"]),
                )
                self.store._append_event(
                    con,
                    transaction_id=str(tx["transaction_id"]),
                    command_id=str(tx["command_id"]),
                    event_type="controller.recovery.transaction_entered",
                    subject=str(tx["candidate_subject_id"] or tx["base_subject_id"]),
                    payload={
                        "from": str(tx["execution_state"]),
                        "reason": "NO_LIVE_CURRENT_FENCE_AFTER_RESTART",
                        "to": "RECOVERING",
                        "transaction_id": str(tx["transaction_id"]),
                    },
                )
                recovering_transactions += 1

            effects = con.execute(
                "SELECT * FROM external_effects WHERE state='INFLIGHT'"
            ).fetchall()
            for effect in effects:
                con.execute(
                    "UPDATE external_effects SET state='UNKNOWN',last_error_code='CONTROLLER_RESTART_AMBIGUOUS',updated_at_ms=? WHERE effect_id=?",
                    (ts, effect["effect_id"]),
                )
                command_id, subject = self._tx_context(con, str(effect["transaction_id"]))
                self.store._append_event(
                    con,
                    transaction_id=str(effect["transaction_id"]),
                    command_id=command_id,
                    event_type="controller.external_effect.unknown_after_restart",
                    subject=subject,
                    payload={"effect_id": str(effect["effect_id"]), "reason": "CONTROLLER_RESTART_AMBIGUOUS"},
                )
                ambiguous_effects += 1

            requeued_outbox = con.execute(
                "UPDATE outbox_deliveries SET state='RETRY',next_attempt_at_ms=?,last_error_code='CONTROLLER_RESTART_REQUEUE' WHERE state='INFLIGHT'",
                (ts,),
            ).rowcount

        return RecoveryReport(
            expired_leases=expired_leases,
            interrupted_attempts=interrupted_attempts,
            recovering_transactions=recovering_transactions,
            ambiguous_effects=ambiguous_effects,
            requeued_outbox=int(requeued_outbox),
        )
