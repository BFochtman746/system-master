from __future__ import annotations

from collections.abc import Callable
from typing import Any

from .migrations import initialize_database
from .store import (
    CommandResult,
    ControllerStore as _BaseControllerStore,
    IdempotencyConflict,
    InvalidState,
    canonical_json,
    new_uuid7,
    now_ms,
    sha256_text,
)


class ControllerStore(_BaseControllerStore):
    """Foundation-002 transactional store.

    This class is the package entry point. It layers migration tracking,
    semantic command identity, proof-bearing execution/qualification helpers,
    and non-revivable lease renewal over the low-level store primitives.
    """

    def __init__(self, db_path, schema_path, *, clock_ms: Callable[[], int] | None = None):
        super().__init__(db_path, schema_path)
        self._clock_ms = clock_ms or now_ms

    def connect(self):
        con = super().connect()
        con.execute("PRAGMA trusted_schema=OFF")
        return con

    def initialize(self) -> None:
        initialize_database(self.db_path, self.schema_path.parent)

    def register_repository(
        self,
        repository_id: str,
        owner: str,
        name: str,
        canonical_url: str,
        object_format: str = "sha1",
    ) -> None:
        """Register repository identity without INSERT-OR-IGNORE ambiguity."""
        with self.immediate() as con:
            by_id = con.execute(
                "SELECT provider,owner,name,canonical_url,object_format FROM repositories WHERE repository_id=?",
                (repository_id,),
            ).fetchone()
            if by_id:
                expected = ("github", owner, name, canonical_url, object_format)
                actual = tuple(by_id[key] for key in ("provider", "owner", "name", "canonical_url", "object_format"))
                if actual != expected:
                    raise InvalidState("repository_id is already bound to different immutable identity")
                return
            collision = con.execute(
                "SELECT repository_id FROM repositories WHERE canonical_url=? OR (provider='github' AND owner=? AND name=?)",
                (canonical_url, owner, name),
            ).fetchone()
            if collision:
                raise InvalidState("repository identity is already registered under another repository_id")
            con.execute(
                "INSERT INTO repositories(repository_id,provider,owner,name,canonical_url,object_format,created_at_ms) "
                "VALUES(?, 'github', ?, ?, ?, ?, ?)",
                (repository_id, owner, name, canonical_url, object_format, self._clock_ms()),
            )

    def submit_command(
        self,
        *,
        command_id: str,
        caller_type: str,
        caller_id: str,
        command_type: str,
        payload: dict[str, Any],
        repository_id: str,
        base_subject_id: str,
        controller_version: str,
        controller_commit_oid: str,
        policy_version: str,
        policy_digest_sha256: str,
        parent_transaction_id: str | None = None,
        relation_to_parent: str | None = None,
    ) -> CommandResult:
        canonical_payload = canonical_json(payload)
        ts = self._clock_ms()

        with self.immediate() as con:
            subject = con.execute(
                "SELECT repository_id,object_format,object_oid FROM subjects WHERE subject_id=?",
                (base_subject_id,),
            ).fetchone()
            if not subject or subject["repository_id"] != repository_id:
                raise InvalidState("base subject does not belong to target repository")

            # Idempotency identifies caller intent plus immutable target semantics.
            # Controller/policy versions are deliberately not part of the command
            # fingerprint: a retry after an upgrade returns the original transaction,
            # whose execution bindings remain pinned to their originally accepted values.
            fingerprint = sha256_text(
                canonical_json(
                    {
                        "base_subject": {
                            "object_format": str(subject["object_format"]),
                            "object_oid": str(subject["object_oid"]),
                        },
                        "caller_id": caller_id,
                        "caller_type": caller_type,
                        "command_schema_version": 1,
                        "command_type": command_type,
                        "parent_transaction_id": parent_transaction_id,
                        "payload": payload,
                        "relation_to_parent": relation_to_parent,
                        "repository_id": repository_id,
                    }
                )
            )

            prior = con.execute(
                "SELECT fingerprint_sha256 FROM commands WHERE command_id=?",
                (command_id,),
            ).fetchone()
            if prior:
                if prior["fingerprint_sha256"] != fingerprint:
                    raise IdempotencyConflict(
                        "same command_id was reused with different target or semantics"
                    )
                tx = con.execute(
                    "SELECT transaction_id FROM transactions WHERE command_id=?",
                    (command_id,),
                ).fetchone()
                if not tx:
                    raise InvalidState("accepted duplicate command has no transaction")
                return CommandResult(command_id, str(tx["transaction_id"]), True)

            con.execute(
                "INSERT INTO commands(command_id,caller_type,caller_id,command_type,command_schema_version,canonical_payload_json,fingerprint_sha256,disposition,rejection_code,received_at_ms) "
                "VALUES(?,?,?,?,1,?,?,'ACCEPTED',NULL,?)",
                (command_id, caller_type, caller_id, command_type, canonical_payload, fingerprint, ts),
            )
            transaction_id = new_uuid7()
            con.execute(
                "INSERT INTO transactions(transaction_id,command_id,repository_id,base_subject_id,candidate_subject_id,parent_transaction_id,relation_to_parent,controller_version,controller_commit_oid,policy_version,policy_digest_sha256,execution_state,qualification_state,promotion_state,terminal_code,row_version,created_at_ms,updated_at_ms) "
                "VALUES(?,?,?,?,NULL,?,?,?,?,?,?, 'ADMITTED','NOT_REQUESTED','NOT_ELIGIBLE',NULL,0,?,?)",
                (
                    transaction_id,
                    command_id,
                    repository_id,
                    base_subject_id,
                    parent_transaction_id,
                    relation_to_parent,
                    controller_version,
                    controller_commit_oid,
                    policy_version,
                    policy_digest_sha256,
                    ts,
                    ts,
                ),
            )
            self._append_event(
                con,
                transaction_id=transaction_id,
                command_id=command_id,
                event_type="controller.transaction.admitted",
                subject=base_subject_id,
                payload={
                    "base_subject_id": base_subject_id,
                    "command_id": command_id,
                    "transaction_id": transaction_id,
                },
            )
            return CommandResult(command_id, transaction_id, False)

    def _require_current_lease(
        self,
        con,
        lease_id: str,
        fencing_token: int,
        *,
        transaction_id: str | None = None,
        worker_id: str | None = None,
        at_ms: int | None = None,
    ):
        ts = self._clock_ms() if at_ms is None else at_ms
        row = con.execute(
            "SELECT l.*, p.last_fencing_token FROM leases l "
            "JOIN protected_resources p ON p.resource_key=l.resource_key WHERE l.lease_id=?",
            (lease_id,),
        ).fetchone()
        if not row or row["state"] != "ACTIVE":
            raise InvalidState("lease is not active")
        if int(row["fencing_token"]) != fencing_token or int(row["last_fencing_token"]) != fencing_token:
            raise InvalidState("lease fencing token is stale")
        if int(row["expires_at_ms"]) <= ts:
            raise InvalidState("lease has expired and cannot be revived")
        if transaction_id is not None and row["transaction_id"] != transaction_id:
            raise InvalidState("lease belongs to another transaction")
        if worker_id is not None and row["worker_id"] != worker_id:
            raise InvalidState("lease belongs to another worker")
        return row

    def renew_lease(self, lease_id: str, fencing_token: int, ttl_ms: int = 60_000) -> None:
        if ttl_ms <= 0:
            raise ValueError("ttl_ms must be positive")
        ts = self._clock_ms()
        with self.immediate() as con:
            row = self._require_current_lease(con, lease_id, fencing_token, at_ms=ts)
            new_expiry = max(int(row["expires_at_ms"]), ts + ttl_ms)
            con.execute(
                "UPDATE leases SET last_heartbeat_at_ms=?, expires_at_ms=? WHERE lease_id=?",
                (ts, new_expiry, lease_id),
            )

    def start_execution_attempt(
        self,
        *,
        transaction_id: str,
        worker_id: str,
        lease_id: str,
        fencing_token: int,
    ) -> str:
        ts = self._clock_ms()
        with self.immediate() as con:
            tx = con.execute(
                "SELECT command_id,execution_state,base_subject_id,candidate_subject_id FROM transactions WHERE transaction_id=?",
                (transaction_id,),
            ).fetchone()
            if not tx or tx["execution_state"] != "RUNNING":
                raise InvalidState("transaction must be RUNNING before an execution attempt starts")
            self._require_current_lease(
                con,
                lease_id,
                fencing_token,
                transaction_id=transaction_id,
                worker_id=worker_id,
                at_ms=ts,
            )
            attempt_number = int(
                con.execute(
                    "SELECT COALESCE(MAX(attempt_number),0)+1 FROM execution_attempts WHERE transaction_id=?",
                    (transaction_id,),
                ).fetchone()[0]
            )
            attempt_id = new_uuid7()
            con.execute(
                "INSERT INTO execution_attempts(attempt_id,transaction_id,attempt_number,worker_id,lease_id,fencing_token,state,started_at_ms,finished_at_ms,result_digest_sha256,error_code) "
                "VALUES(?,?,?,?,?,?,'STARTED',?,NULL,NULL,NULL)",
                (attempt_id, transaction_id, attempt_number, worker_id, lease_id, fencing_token, ts),
            )
            self._append_event(
                con,
                transaction_id=transaction_id,
                command_id=str(tx["command_id"]),
                event_type="controller.execution.attempt_started",
                subject=str(tx["candidate_subject_id"] or tx["base_subject_id"]),
                payload={"attempt_id": attempt_id, "attempt_number": attempt_number, "fencing_token": fencing_token},
            )
            return attempt_id

    def record_worker_result(
        self,
        *,
        transaction_id: str,
        attempt_id: str,
        lease_id: str,
        fencing_token: int,
        result_type: str,
        payload: dict[str, Any],
    ) -> tuple[str, str]:
        ts = self._clock_ms()
        payload_json = canonical_json(payload)
        digest = sha256_text(payload_json)
        with self.immediate() as con:
            attempt = con.execute(
                "SELECT worker_id,state FROM execution_attempts WHERE attempt_id=? AND transaction_id=?",
                (attempt_id, transaction_id),
            ).fetchone()
            if not attempt or attempt["state"] != "STARTED":
                raise InvalidState("worker result requires a live STARTED execution attempt")
            self._require_current_lease(
                con,
                lease_id,
                fencing_token,
                transaction_id=transaction_id,
                worker_id=str(attempt["worker_id"]),
                at_ms=ts,
            )
            result_id = new_uuid7()
            con.execute(
                "INSERT INTO worker_results(result_id,transaction_id,attempt_id,lease_id,fencing_token,result_type,payload_json,payload_digest_sha256,accepted_at_ms) "
                "VALUES(?,?,?,?,?,?,?,?,?)",
                (result_id, transaction_id, attempt_id, lease_id, fencing_token, result_type, payload_json, digest, ts),
            )
            tx = con.execute(
                "SELECT command_id,base_subject_id,candidate_subject_id FROM transactions WHERE transaction_id=?",
                (transaction_id,),
            ).fetchone()
            self._append_event(
                con,
                transaction_id=transaction_id,
                command_id=str(tx["command_id"]),
                event_type="controller.execution.result_accepted",
                subject=str(tx["candidate_subject_id"] or tx["base_subject_id"]),
                payload={"attempt_id": attempt_id, "result_id": result_id, "result_type": result_type, "payload_digest_sha256": digest},
            )
            return result_id, digest

    def finish_execution_attempt(
        self,
        attempt_id: str,
        outcome: str,
        *,
        result_digest_sha256: str | None = None,
        error_code: str | None = None,
    ) -> None:
        if outcome not in {"SUCCEEDED", "FAILED", "BLOCKED", "INTERRUPTED", "REJECTED_STALE_FENCE"}:
            raise ValueError("unsupported execution attempt outcome")
        ts = self._clock_ms()
        with self.immediate() as con:
            row = con.execute(
                "SELECT a.*, t.command_id,t.base_subject_id,t.candidate_subject_id FROM execution_attempts a "
                "JOIN transactions t ON t.transaction_id=a.transaction_id WHERE a.attempt_id=?",
                (attempt_id,),
            ).fetchone()
            if not row or row["state"] != "STARTED":
                raise InvalidState("execution attempt is not STARTED")
            if outcome == "SUCCEEDED" and not result_digest_sha256:
                raise InvalidState("successful execution requires a result digest")
            con.execute(
                "UPDATE execution_attempts SET state=?,finished_at_ms=?,result_digest_sha256=?,error_code=? WHERE attempt_id=?",
                (outcome, ts, result_digest_sha256, error_code, attempt_id),
            )
            self._append_event(
                con,
                transaction_id=str(row["transaction_id"]),
                command_id=str(row["command_id"]),
                event_type="controller.execution.attempt_finished",
                subject=str(row["candidate_subject_id"] or row["base_subject_id"]),
                payload={"attempt_id": attempt_id, "outcome": outcome, "result_digest_sha256": result_digest_sha256, "error_code": error_code},
            )

    def start_qualification(self, transaction_id: str, qualifier_worker_id: str) -> str:
        ts = self._clock_ms()
        with self.immediate() as con:
            tx = con.execute(
                "SELECT * FROM transactions WHERE transaction_id=?",
                (transaction_id,),
            ).fetchone()
            if not tx or tx["execution_state"] != "SUCCEEDED" or tx["candidate_subject_id"] is None:
                raise InvalidState("qualification requires an execution-proven candidate")
            if tx["qualification_state"] != "NOT_REQUESTED":
                raise InvalidState("qualification has already started")
            worker = con.execute(
                "SELECT 1 FROM workers WHERE worker_id=? AND worker_kind='QUALIFIER' AND trust_class='READ_ONLY_QUALIFIER' AND status='ONLINE'",
                (qualifier_worker_id,),
            ).fetchone()
            if not worker:
                raise InvalidState("worker is not an authorized qualifier")
            qualification_id = new_uuid7()
            con.execute(
                "INSERT INTO qualification_attempts(qualification_id,transaction_id,subject_id,qualifier_worker_id,policy_version,policy_digest_sha256,state,started_at_ms,finished_at_ms,receipt_id) "
                "VALUES(?,?,?,?,?,?,'RUNNING',?,NULL,NULL)",
                (
                    qualification_id,
                    transaction_id,
                    tx["candidate_subject_id"],
                    qualifier_worker_id,
                    tx["policy_version"],
                    tx["policy_digest_sha256"],
                    ts,
                ),
            )
            for new_state in ("PENDING", "RUNNING"):
                old_state = "NOT_REQUESTED" if new_state == "PENDING" else "PENDING"
                con.execute(
                    "UPDATE transactions SET qualification_state=?,row_version=row_version+1,updated_at_ms=? WHERE transaction_id=?",
                    (new_state, ts, transaction_id),
                )
                self._append_event(
                    con,
                    transaction_id=transaction_id,
                    command_id=str(tx["command_id"]),
                    event_type="controller.qualification.state_changed",
                    subject=str(tx["candidate_subject_id"]),
                    payload={"from": old_state, "to": new_state, "qualification_id": qualification_id, "transaction_id": transaction_id},
                )
            return qualification_id

    def complete_qualification(
        self,
        qualification_id: str,
        verdict: str,
        *,
        storage_uri: str,
        manifest: dict[str, Any],
    ) -> str:
        if verdict not in {"QUALIFIED", "REJECTED", "INDETERMINATE"}:
            raise ValueError("unsupported qualification verdict")
        ts = self._clock_ms()
        manifest_json = canonical_json(manifest)
        digest = sha256_text(manifest_json)
        with self.immediate() as con:
            q = con.execute(
                "SELECT q.*,t.command_id,t.candidate_subject_id,t.qualification_state FROM qualification_attempts q "
                "JOIN transactions t ON t.transaction_id=q.transaction_id WHERE q.qualification_id=?",
                (qualification_id,),
            ).fetchone()
            if not q or q["state"] != "RUNNING" or q["qualification_state"] != "RUNNING":
                raise InvalidState("qualification is not RUNNING")
            receipt_id = new_uuid7()
            con.execute(
                "INSERT INTO evidence_receipts(receipt_id,transaction_id,subject_id,receipt_kind,digest_algorithm,digest,storage_uri,manifest_json,created_at_ms) "
                "VALUES(?,?,?,'QUALIFICATION','sha256',?,?,?,?,?)",
                (receipt_id, q["transaction_id"], q["subject_id"], digest, storage_uri, manifest_json, ts),
            )
            con.execute(
                "UPDATE qualification_attempts SET state=?,finished_at_ms=?,receipt_id=? WHERE qualification_id=?",
                (verdict, ts, receipt_id, qualification_id),
            )
            con.execute(
                "UPDATE transactions SET qualification_state=?,row_version=row_version+1,updated_at_ms=? WHERE transaction_id=?",
                (verdict, ts, q["transaction_id"]),
            )
            self._append_event(
                con,
                transaction_id=str(q["transaction_id"]),
                command_id=str(q["command_id"]),
                event_type="controller.qualification.verdict_recorded",
                subject=str(q["subject_id"]),
                payload={"qualification_id": qualification_id, "receipt_id": receipt_id, "verdict": verdict, "evidence_digest_sha256": digest},
            )
            return receipt_id
