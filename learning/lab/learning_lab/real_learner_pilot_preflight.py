from __future__ import annotations

import hashlib
import os
import sqlite3
import tempfile
from pathlib import Path
from typing import Any, Dict

from .real_learner_pilot import PROTOCOL_VERSION
from .real_learner_pilot_completion import (
    REAL_LEARNER_PILOT_COMPLETION_VERSION,
    RETENTION_MINIMUM_DELAY_SECONDS,
)
from .real_learner_pilot_human_session import REAL_LEARNER_PILOT_HUMAN_SESSION_VERSION
from .real_learner_pilot_runtime_binding import PILOT_CURRENT_RUNTIME_BINDING_VERSION
from .unified_turn_controller import UNIFIED_TURN_CONTROLLER_VERSION


REAL_LEARNER_PILOT_PREFLIGHT_VERSION = "REAL-LEARNER-PILOT-PREFLIGHT-V1"
EXPECTED_PROTOCOL_VERSION = "PILOT-001-v1"
EXPECTED_RETENTION_MINIMUM_DELAY_SECONDS = 3600

_FROZEN_PILOT_BLOBS = {
    "learning/lab/LEARNING_LAB_PILOT_001_PROTOCOL.md": "0db3de824060f4eb7ce3c2c7ffa0ed4b57ba9d35",
    "learning/lab/learning_lab/real_learner_pilot.py": "0c9f7a8b7850cef15643e3c11899585d2c25a08d",
    "learning/lab/tests/test_real_learner_pilot.py": "e77d423078af4662f2c72b0cc1f8501e20d29851",
    "learning/lab/qualification_pilot001.py": "44aa0124f194f074a421f0a87a0695d96d7bae11",
}


class RealLearnerPilotPreflightError(ValueError):
    pass


def _fail(code: str) -> None:
    raise RealLearnerPilotPreflightError(code)


def repository_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _is_within(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def _git_blob_sha1(path: Path) -> str:
    data = path.read_bytes()
    header = f"blob {len(data)}\0".encode("ascii")
    return hashlib.sha1(header + data).hexdigest()


def _verify_frozen_authority(repo_root: Path) -> Dict[str, str]:
    observed: Dict[str, str] = {}
    for relative, expected in _FROZEN_PILOT_BLOBS.items():
        path = repo_root / relative
        if not path.is_file():
            _fail("PREFLIGHT_FROZEN_AUTHORITY_FILE_MISSING:" + relative)
        actual = _git_blob_sha1(path)
        if actual != expected:
            _fail(f"PREFLIGHT_FROZEN_AUTHORITY_DRIFT:{relative}:expected={expected}:actual={actual}")
        observed[relative] = actual
    return observed


def _verify_state_root(state_root: Path, repo_root: Path) -> Dict[str, Any]:
    resolved = state_root.expanduser().resolve()
    if resolved == repo_root or _is_within(resolved, repo_root):
        _fail("PREFLIGHT_STATE_ROOT_INSIDE_REPOSITORY_FORBIDDEN")

    existed_before = resolved.exists()
    resolved.mkdir(parents=True, exist_ok=True)
    if not resolved.is_dir():
        _fail("PREFLIGHT_STATE_ROOT_NOT_DIRECTORY")

    probe_path = None
    sqlite_path = None
    try:
        with tempfile.NamedTemporaryFile(prefix="pilot001-preflight-", suffix=".tmp", dir=resolved, delete=False) as handle:
            probe_path = Path(handle.name)
            handle.write(b"pilot001-preflight\n")
            handle.flush()
            os.fsync(handle.fileno())
        if probe_path.read_bytes() != b"pilot001-preflight\n":
            _fail("PREFLIGHT_STATE_ROOT_READBACK_FAILED")

        fd, sqlite_name = tempfile.mkstemp(prefix="pilot001-preflight-", suffix=".sqlite3", dir=resolved)
        os.close(fd)
        sqlite_path = Path(sqlite_name)
        conn = sqlite3.connect(str(sqlite_path))
        try:
            conn.execute("PRAGMA journal_mode=DELETE")
            conn.execute("CREATE TABLE preflight_probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL)")
            conn.execute("INSERT INTO preflight_probe(value) VALUES (?)", ("ready",))
            conn.commit()
            row = conn.execute("SELECT value FROM preflight_probe WHERE id = 1").fetchone()
            if row != ("ready",):
                _fail("PREFLIGHT_SQLITE_ROUNDTRIP_FAILED")
        finally:
            conn.close()
    except OSError as exc:
        _fail("PREFLIGHT_STATE_ROOT_IO_FAILED:" + type(exc).__name__)
    except sqlite3.Error as exc:
        _fail("PREFLIGHT_SQLITE_FAILED:" + type(exc).__name__)
    finally:
        if probe_path is not None:
            probe_path.unlink(missing_ok=True)
        if sqlite_path is not None:
            sqlite_path.unlink(missing_ok=True)
            Path(str(sqlite_path) + "-journal").unlink(missing_ok=True)
            Path(str(sqlite_path) + "-wal").unlink(missing_ok=True)
            Path(str(sqlite_path) + "-shm").unlink(missing_ok=True)

    return {
        "resolved_state_root": str(resolved),
        "state_root_existed_before_preflight": existed_before,
        "state_root_writable": True,
        "sqlite_roundtrip": "PASS",
        "probe_files_removed": True,
    }


def run_real_learner_pilot_preflight(*, state_root: Path, repo_root: Path | None = None) -> Dict[str, Any]:
    root = (repo_root or repository_root()).resolve()
    if PROTOCOL_VERSION != EXPECTED_PROTOCOL_VERSION:
        _fail("PREFLIGHT_PROTOCOL_VERSION_MISMATCH")
    if RETENTION_MINIMUM_DELAY_SECONDS != EXPECTED_RETENTION_MINIMUM_DELAY_SECONDS:
        _fail("PREFLIGHT_RETENTION_POLICY_MISMATCH")

    frozen = _verify_frozen_authority(root)
    storage = _verify_state_root(state_root, root)

    return {
        "status": "PASS",
        "preflight_version": REAL_LEARNER_PILOT_PREFLIGHT_VERSION,
        "protocol_version": PROTOCOL_VERSION,
        "retention_minimum_delay_seconds": RETENTION_MINIMUM_DELAY_SECONDS,
        "runtime_versions": {
            "human_session": REAL_LEARNER_PILOT_HUMAN_SESSION_VERSION,
            "runtime_binding": PILOT_CURRENT_RUNTIME_BINDING_VERSION,
            "completion": REAL_LEARNER_PILOT_COMPLETION_VERSION,
            "unified_turn_controller": UNIFIED_TURN_CONTROLLER_VERSION,
        },
        "frozen_authority_blobs": frozen,
        "storage": storage,
        "privacy_boundary": {
            "state_root_inside_repository": False,
            "participant_manifest_created": False,
            "participant_database_created": False,
            "raw_participant_response_collected": False,
            "participant_consent_created_or_inferred": False,
            "direct_pii_collected": False,
        },
        "standing": "READY_FOR_EXPLICIT_PARTICIPANT_CONSENT",
        "truth_boundary": {
            "software_environment_preflight": "PROVEN_BY_THIS_CHECK",
            "human_participant_present": "NOT_PROVEN",
            "human_participant_consent": "NOT_PROVIDED",
            "real_participant_evidence": "NOT_CREATED",
            "real_learner_effectiveness": "NOT_PROVEN",
        },
    }
