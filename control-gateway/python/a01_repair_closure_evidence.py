from __future__ import annotations

import datetime as dt
import hashlib
import json
import sqlite3
from pathlib import Path
from typing import Any
from urllib.parse import quote

GENESIS = "0" * 64
MANIFEST_NAME = "EVIDENCE-MANIFEST-001.jsonl"
UTC = dt.timezone.utc


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _entry_digest(value: dict[str, Any]) -> str:
    return hashlib.sha256(_canonical(value).encode("utf-8")).hexdigest()


def verify_manifest(root: str | Path) -> dict[str, Any]:
    path = Path(root) / MANIFEST_NAME
    if not path.is_file():
        return {"state": "FAIL", "detail": {"reason": "MANIFEST_MISSING", "path": str(path)}}
    previous = GENESIS
    count = 0
    try:
        with path.open("r", encoding="utf-8") as handle:
            for line_no, raw in enumerate(handle, 1):
                raw = raw.strip()
                if not raw:
                    continue
                row = json.loads(raw)
                count += 1
                if row.get("previous_entry_digest") != previous:
                    return {"state": "FAIL", "detail": {"reason": "PREVIOUS_DIGEST_MISMATCH", "line": line_no}}
                stored = row.get("entry_digest")
                body = {k: v for k, v in row.items() if k != "entry_digest"}
                if stored != _entry_digest(body):
                    return {"state": "FAIL", "detail": {"reason": "ENTRY_DIGEST_MISMATCH", "line": line_no}}
                previous = stored
    except (OSError, json.JSONDecodeError) as exc:
        return {"state": "FAIL", "detail": {"reason": "MANIFEST_UNREADABLE", "error": str(exc)}}
    return {"state": "PASS", "detail": {"entries": count, "head": previous}}


def check_database(db_path: str | Path) -> tuple[dict[str, Any], dict[str, Any]]:
    path = Path(db_path).expanduser().resolve()
    if not path.is_file():
        fail = {"state": "FAIL", "detail": {"reason": "DATABASE_MISSING", "path": str(path)}}
        return fail, fail
    uri_path = quote(path.as_posix(), safe="/:")
    try:
        conn = sqlite3.connect(f"file:{uri_path}?mode=ro", uri=True, timeout=5)
        try:
            conn.execute("PRAGMA query_only=ON")
            integrity_rows = [str(row[0]) for row in conn.execute("PRAGMA integrity_check").fetchall()]
            integrity_ok = integrity_rows == ["ok"]
            foreign_rows = [tuple(row) for row in conn.execute("PRAGMA foreign_key_check").fetchall()]
            return (
                {"state": "PASS" if integrity_ok else "FAIL", "detail": {"rows": integrity_rows}},
                {"state": "PASS" if not foreign_rows else "FAIL", "detail": {"violations": foreign_rows}},
            )
        finally:
            conn.close()
    except sqlite3.Error as exc:
        fail = {"state": "FAIL", "detail": {"reason": "DATABASE_UNREADABLE", "error": str(exc)}}
        return fail, fail


def collect_wave1(db_path: str | Path, evidence_root: str | Path) -> dict[str, Any]:
    database_integrity, foreign_key_integrity = check_database(db_path)
    evidence_manifest_integrity = verify_manifest(evidence_root)
    evaluated = [database_integrity, foreign_key_integrity, evidence_manifest_integrity]
    any_fail = any(row["state"] == "FAIL" for row in evaluated)
    not_evaluated = {"state": "NOT_EVALUATED", "detail": {"wave": "FUTURE_IMPLEMENTATION"}}
    return {
        "report_version": 1,
        "read_only": True,
        "database_integrity": database_integrity,
        "foreign_key_integrity": foreign_key_integrity,
        "evidence_manifest_integrity": evidence_manifest_integrity,
        "authority_coherence": not_evaluated,
        "claim_and_fence_closure": not_evaluated,
        "process_cleanup": not_evaluated,
        "workspace_cleanup": not_evaluated,
        "repair_ref_disposition": not_evaluated,
        "standing": "NEXT_REPAIR_CYCLE_BLOCKED",
        "generated_at": dt.datetime.now(tz=UTC).isoformat().replace("+00:00", "Z"),
    }
