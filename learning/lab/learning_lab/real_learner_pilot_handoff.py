from __future__ import annotations

import hashlib
import json
import sqlite3
from pathlib import Path
from typing import Any, Dict


REAL_LEARNER_PILOT_HANDOFF_VERSION = "REAL-LEARNER-PILOT-HANDOFF-V1"


class RealLearnerPilotHandoffError(ValueError):
    pass


def _fail(code: str) -> None:
    raise RealLearnerPilotHandoffError(code)


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _is_sha256(value: Any) -> bool:
    return isinstance(value, str) and len(value) == 64 and all(ch in "0123456789abcdef" for ch in value.lower())


def _checkpoint_sqlite(database_path: Path) -> Dict[str, int]:
    if not database_path.is_file():
        _fail("PILOT_HANDOFF_STATE_DATABASE_NOT_FOUND")
    try:
        connection = sqlite3.connect(str(database_path))
        try:
            row = connection.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()
        finally:
            connection.close()
    except sqlite3.Error as exc:
        _fail("PILOT_HANDOFF_SQLITE_CHECKPOINT_FAILED:" + type(exc).__name__)
    if row is None or len(row) < 3:
        _fail("PILOT_HANDOFF_SQLITE_CHECKPOINT_RESULT_INVALID")
    busy, log_frames, checkpointed_frames = (int(row[0]), int(row[1]), int(row[2]))
    if busy != 0:
        _fail("PILOT_HANDOFF_SQLITE_CHECKPOINT_BUSY")
    wal_path = Path(str(database_path) + "-wal")
    if wal_path.exists() and wal_path.stat().st_size != 0:
        _fail("PILOT_HANDOFF_SQLITE_WAL_NOT_DRAINED")
    return {
        "busy": busy,
        "log_frames": log_frames,
        "checkpointed_frames": checkpointed_frames,
    }


def handoff_path(root: Path, pilot_id: str) -> Path:
    return root / f"{pilot_id}.handoff.json"


def handoff_digest_path(root: Path, pilot_id: str) -> Path:
    return root / f"{pilot_id}.handoff.sha256"


def write_pilot_handoff(
    *,
    root: Path,
    manifest: Dict[str, Any],
    completion_package_path: Path,
) -> Dict[str, Any]:
    pilot_id = manifest.get("pilot_id")
    state_key = manifest.get("state_key")
    if not isinstance(pilot_id, str) or not pilot_id:
        _fail("PILOT_HANDOFF_ID_REQUIRED")
    if manifest.get("completed") is not True:
        _fail("PILOT_HANDOFF_COMPLETED_MANIFEST_REQUIRED")
    if not isinstance(state_key, str) or not state_key:
        _fail("PILOT_HANDOFF_STATE_KEY_REQUIRED")

    manifest_path = root / f"{pilot_id}.manifest.json"
    database_path = root / f"{state_key}.sqlite3"
    if not manifest_path.is_file():
        _fail("PILOT_HANDOFF_MANIFEST_NOT_FOUND")
    if not completion_package_path.is_file():
        _fail("PILOT_HANDOFF_COMPLETION_PACKAGE_NOT_FOUND")

    completion = json.loads(completion_package_path.read_text(encoding="utf-8"))
    if completion.get("pilot_id") != pilot_id:
        _fail("PILOT_HANDOFF_COMPLETION_ID_MISMATCH")
    if completion.get("raw_response_included") is not False:
        _fail("PILOT_HANDOFF_RAW_RESPONSE_BOUNDARY_INVALID")
    if completion.get("direct_pii_included") is not False:
        _fail("PILOT_HANDOFF_DIRECT_PII_BOUNDARY_INVALID")
    record_digest = completion.get("record_digest")
    if not _is_sha256(record_digest):
        _fail("PILOT_HANDOFF_RECORD_DIGEST_REQUIRED")

    checkpoint = _checkpoint_sqlite(database_path)
    envelope = {
        "handoff_version": REAL_LEARNER_PILOT_HANDOFF_VERSION,
        "protocol_version": manifest.get("protocol_version"),
        "pilot_id": pilot_id,
        "completed_at": manifest.get("completed_at"),
        "record_digest": record_digest,
        "completion_package_sha256": _sha256_file(completion_package_path),
        "manifest_sha256": _sha256_file(manifest_path),
        "state_database_sha256": _sha256_file(database_path),
        "sqlite_checkpoint": {
            "status": "PASS",
            "wal_drained": True,
            **checkpoint,
        },
        "raw_response_included": False,
        "direct_pii_included": False,
        "truth_boundary": {
            "completion_inputs_bound_by_sha256": True,
            "sqlite_snapshot_checkpointed_before_hash": True,
            "handoff_contains_raw_participant_response": False,
            "handoff_contains_direct_pii": False,
            "local_hash_files_alone_prevent_malicious_rewrite": False,
            "tamper_detection_after_digest_is_anchored_externally": True,
            "real_learner_effectiveness": "NOT_PROVEN",
            "psychometric_validity": "NOT_PROVEN",
            "population_validity": "NOT_PROVEN",
        },
    }
    rendered = json.dumps(envelope, indent=2, sort_keys=True) + "\n"
    lowered = rendered.lower()
    for forbidden in ('"response"', '"raw_response"', '"answer_text"', '"free_text"', "resolved_state_root"):
        if forbidden in lowered:
            _fail("PILOT_HANDOFF_FORBIDDEN_FIELD")

    target = handoff_path(root, pilot_id)
    tmp = target.with_suffix(".tmp")
    tmp.write_text(rendered, encoding="utf-8")
    tmp.replace(target)
    handoff_digest = _sha256_file(target)

    digest_target = handoff_digest_path(root, pilot_id)
    digest_tmp = digest_target.with_suffix(".tmp")
    digest_tmp.write_text(handoff_digest + "\n", encoding="ascii")
    digest_tmp.replace(digest_target)
    return {
        "status": "PASS",
        "pilot_id": pilot_id,
        "handoff_version": REAL_LEARNER_PILOT_HANDOFF_VERSION,
        "handoff_digest": handoff_digest,
        "handoff_path": target,
        "handoff_digest_path": digest_target,
        "envelope": envelope,
    }


def verify_pilot_handoff(*, root: Path, pilot_id: str, state_key: str) -> Dict[str, Any]:
    target = handoff_path(root, pilot_id)
    digest_target = handoff_digest_path(root, pilot_id)
    manifest_path = root / f"{pilot_id}.manifest.json"
    completion_path = root / f"{pilot_id}.completion.json"
    database_path = root / f"{state_key}.sqlite3"
    for path, code in (
        (target, "PILOT_HANDOFF_ENVELOPE_NOT_FOUND"),
        (digest_target, "PILOT_HANDOFF_DIGEST_NOT_FOUND"),
        (manifest_path, "PILOT_HANDOFF_MANIFEST_NOT_FOUND"),
        (completion_path, "PILOT_HANDOFF_COMPLETION_PACKAGE_NOT_FOUND"),
        (database_path, "PILOT_HANDOFF_STATE_DATABASE_NOT_FOUND"),
    ):
        if not path.is_file():
            _fail(code)

    envelope = json.loads(target.read_text(encoding="utf-8"))
    expected_handoff_digest = digest_target.read_text(encoding="ascii").strip().lower()
    if not _is_sha256(expected_handoff_digest) or _sha256_file(target) != expected_handoff_digest:
        _fail("PILOT_HANDOFF_ENVELOPE_DIGEST_MISMATCH")
    if envelope.get("pilot_id") != pilot_id:
        _fail("PILOT_HANDOFF_ENVELOPE_ID_MISMATCH")

    _checkpoint_sqlite(database_path)
    checks = {
        "completion_package_sha256": _sha256_file(completion_path),
        "manifest_sha256": _sha256_file(manifest_path),
        "state_database_sha256": _sha256_file(database_path),
    }
    for key, actual in checks.items():
        if envelope.get(key) != actual:
            _fail("PILOT_HANDOFF_BOUND_FILE_DIGEST_MISMATCH:" + key)
    return {
        "status": "PASS",
        "pilot_id": pilot_id,
        "handoff_version": envelope.get("handoff_version"),
        "handoff_digest": expected_handoff_digest,
        "bound_file_digests_verified": True,
        "raw_response_included": False,
        "direct_pii_included": False,
    }
