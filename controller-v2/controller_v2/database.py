from __future__ import annotations

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
    """Foundation-002 store with migration-aware initialization.

    The original store implementation remains as an implementation source file,
    but package consumers receive this hardened class.
    """

    def initialize(self) -> None:
        initialize_database(self.db_path, self.schema_path.parent)

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
        ts = now_ms()

        with self.immediate() as con:
            subject = con.execute(
                "SELECT repository_id,object_format,object_oid FROM subjects WHERE subject_id=?",
                (base_subject_id,),
            ).fetchone()
            if not subject or subject["repository_id"] != repository_id:
                raise InvalidState("base subject does not belong to target repository")

            # Idempotency covers caller intent and immutable target semantics.
            # Controller/policy version are deliberately excluded: retrying an
            # already accepted command after a controller upgrade must return
            # the original transaction, not reinterpret the command.
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
                (
                    command_id,
                    caller_type,
                    caller_id,
                    command_type,
                    canonical_payload,
                    fingerprint,
                    ts,
                ),
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
