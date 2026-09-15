from __future__ import annotations

import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable


class Conflict(RuntimeError):
    pass


@dataclass(frozen=True)
class Claim:
    request_id: str
    owner: str
    generation: int
    payload: str
    status: str
    expires_at: float


class Store:
    def __init__(
        self,
        db: str | Path,
        clock: Callable[[], float] | None = None,
        lease_seconds: int = 30,
    ):
        self.db = str(db)
        self.clock = clock or time.time
        self.lease_seconds = lease_seconds
        self.conn = sqlite3.connect(
            self.db, timeout=10, isolation_level=None, check_same_thread=False
        )
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute(
            """CREATE TABLE IF NOT EXISTS claims(
                request_id TEXT PRIMARY KEY,
                owner TEXT NOT NULL,
                generation INTEGER NOT NULL,
                payload TEXT NOT NULL,
                status TEXT NOT NULL,
                expires_at REAL NOT NULL
            )"""
        )

    def close(self):
        self.conn.close()

    @staticmethod
    def _claim(row) -> Claim:
        return Claim(*row)

    def get(self, request_id: str) -> Claim | None:
        row = self.conn.execute(
            "SELECT request_id, owner, generation, payload, status, expires_at FROM claims WHERE request_id=?",
            (request_id,),
        ).fetchone()
        return self._claim(row) if row else None

    def claim(self, request_id: str, owner: str, payload: str) -> tuple[Claim, bool]:
        # Intentionally defective: check-then-insert races, replay reports acquired,
        # and conflicting payload is not rejected.
        row = self.conn.execute(
            "SELECT request_id, owner, generation, payload, status, expires_at FROM claims WHERE request_id=?",
            (request_id,),
        ).fetchone()
        if row:
            return self._claim(row), True
        expires = float(self.clock()) + self.lease_seconds
        self.conn.execute(
            "INSERT INTO claims(request_id, owner, generation, payload, status, expires_at) VALUES(?,?,?,?,?,?)",
            (request_id, owner, 1, payload, "CLAIMED", expires),
        )
        return Claim(request_id, owner, 1, payload, "CLAIMED", expires), True

    def renew(self, request_id: str, owner: str, generation: int) -> bool:
        # Intentionally defective: ignores ownership/generation.
        expires = float(self.clock()) + self.lease_seconds
        cur = self.conn.execute(
            "UPDATE claims SET expires_at=? WHERE request_id=? AND status='CLAIMED'",
            (expires, request_id),
        )
        return cur.rowcount == 1

    def complete(self, request_id: str, owner: str, generation: int) -> bool:
        # Intentionally defective: stale owners/generations can complete.
        cur = self.conn.execute(
            "UPDATE claims SET status='DONE' WHERE request_id=?", (request_id,)
        )
        return cur.rowcount == 1

    def recover(self, request_id: str, new_owner: str) -> tuple[Claim, bool]:
        # Intentionally defective: takeover is not implemented.
        claim = self.get(request_id)
        if claim is None:
            raise KeyError(request_id)
        return claim, False
