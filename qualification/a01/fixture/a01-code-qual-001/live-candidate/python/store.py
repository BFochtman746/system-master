from __future__ import annotations

import sqlite3
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterator


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
        self._lock = threading.RLock()
        self.conn = sqlite3.connect(
            self.db, timeout=30, isolation_level=None, check_same_thread=False
        )
        self.conn.execute("PRAGMA busy_timeout=30000")
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
        with self._lock:
            self.conn.close()

    @staticmethod
    def _claim(row) -> Claim:
        return Claim(*row)

    @contextmanager
    def _write_transaction(self) -> Iterator[None]:
        # The per-instance lock protects a single sqlite connection from concurrent
        # thread use. Cross-instance/process arbitration is performed by SQLite's
        # durable BEGIN IMMEDIATE transaction, not by a process-global lock.
        with self._lock:
            self.conn.execute("BEGIN IMMEDIATE")
            try:
                yield
            except BaseException:
                self.conn.rollback()
                raise
            else:
                self.conn.commit()

    def get(self, request_id: str) -> Claim | None:
        with self._lock:
            row = self.conn.execute(
                "SELECT request_id, owner, generation, payload, status, expires_at "
                "FROM claims WHERE request_id=?",
                (request_id,),
            ).fetchone()
        return self._claim(row) if row else None

    def claim(self, request_id: str, owner: str, payload: str) -> tuple[Claim, bool]:
        with self._write_transaction():
            row = self.conn.execute(
                "SELECT request_id, owner, generation, payload, status, expires_at "
                "FROM claims WHERE request_id=?",
                (request_id,),
            ).fetchone()
            if row is not None:
                current = self._claim(row)
                if current.payload != payload:
                    raise Conflict(request_id)
                return current, False

            expires = float(self.clock()) + self.lease_seconds
            self.conn.execute(
                "INSERT INTO claims(request_id, owner, generation, payload, status, expires_at) "
                "VALUES(?,?,?,?,?,?)",
                (request_id, owner, 1, payload, "CLAIMED", expires),
            )
            return Claim(request_id, owner, 1, payload, "CLAIMED", expires), True

    def renew(self, request_id: str, owner: str, generation: int) -> bool:
        with self._write_transaction():
            now = float(self.clock())
            expires = now + self.lease_seconds
            cur = self.conn.execute(
                "UPDATE claims SET expires_at=? "
                "WHERE request_id=? AND status='CLAIMED' AND owner=? AND generation=? "
                "AND expires_at>?",
                (expires, request_id, owner, generation, now),
            )
            return cur.rowcount == 1

    def complete(self, request_id: str, owner: str, generation: int) -> bool:
        with self._write_transaction():
            now = float(self.clock())
            cur = self.conn.execute(
                "UPDATE claims SET status='DONE' "
                "WHERE request_id=? AND status='CLAIMED' AND owner=? AND generation=? "
                "AND expires_at>?",
                (request_id, owner, generation, now),
            )
            return cur.rowcount == 1

    def recover(self, request_id: str, new_owner: str) -> tuple[Claim, bool]:
        with self._write_transaction():
            now = float(self.clock())
            row = self.conn.execute(
                "SELECT request_id, owner, generation, payload, status, expires_at "
                "FROM claims WHERE request_id=?",
                (request_id,),
            ).fetchone()
            if row is None:
                raise KeyError(request_id)

            current = self._claim(row)
            if current.status != "CLAIMED" or current.expires_at > now:
                return current, False

            generation = current.generation + 1
            expires = now + self.lease_seconds
            cur = self.conn.execute(
                "UPDATE claims SET owner=?, generation=?, expires_at=? "
                "WHERE request_id=? AND status='CLAIMED' AND owner=? AND generation=? "
                "AND expires_at<=?",
                (
                    new_owner,
                    generation,
                    expires,
                    request_id,
                    current.owner,
                    current.generation,
                    now,
                ),
            )
            if cur.rowcount != 1:
                # BEGIN IMMEDIATE should make this unreachable for competing writers,
                # but fail closed if the durable row did not match our snapshot.
                row = self.conn.execute(
                    "SELECT request_id, owner, generation, payload, status, expires_at "
                    "FROM claims WHERE request_id=?",
                    (request_id,),
                ).fetchone()
                if row is None:
                    raise KeyError(request_id)
                return self._claim(row), False

            return Claim(
                request_id,
                new_owner,
                generation,
                current.payload,
                "CLAIMED",
                expires,
            ), True
