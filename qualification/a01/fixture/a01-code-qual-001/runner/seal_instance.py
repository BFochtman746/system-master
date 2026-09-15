#!/usr/bin/env python3
"""Generate one run-local A01-CODE-QUAL-001 benchmark instance.

The generator emits a candidate package plus randomized hidden data. The exact
hidden data is never part of the candidate package.
"""
from __future__ import annotations

import hashlib
import json
import os
import secrets
import shutil
from pathlib import Path

ROOT = Path(os.environ.get("A01_QUAL_OUT", "a01-code-qual-out")).resolve()
CANDIDATE = ROOT / "candidate-package"
HIDDEN = ROOT / "hidden-evaluator"
META = ROOT / "seal-metadata.json"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_tree(root: Path) -> str:
    items: list[tuple[str, str]] = []
    for path in sorted(p for p in root.rglob("*") if p.is_file()):
        items.append((path.relative_to(root).as_posix(), sha256_bytes(path.read_bytes())))
    return sha256_bytes(json.dumps(items, separators=(",", ":"), sort_keys=True).encode())


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


def build_candidate(seed_tag: str) -> None:
    assignment = r'''# A01-CODE-QUAL-001 Candidate Assignment

You have 30 measured minutes. Human assistance is prohibited.

Repair and complete the supplied Java/Python/JavaScript durable-request pipeline.
The code is intentionally incomplete and contains concurrency, idempotency,
validation, stale-writer, recovery, and cross-language identity defects.

## Required behavior

### Python durable store (`python/store.py`)
Preserve the public API and implement these semantics:

- `Store(db, clock=None, lease_seconds=30)` persists claims in SQLite.
- `claim(request_id, owner, payload) -> (Claim, acquired_new)` is atomic across
  concurrent Store instances/process-like callers. Exactly one caller creates a
  new durable row and reports `acquired_new=True`. Same request + same payload is
  idempotent replay and returns the existing durable claim with `False`. Same
  request + different payload must raise `Conflict` without changing durable state.
- `renew(request_id, owner, generation) -> bool` extends only the exact current
  live owner/generation and never revives DONE state.
- `complete(request_id, owner, generation) -> bool` transitions only the exact
  current live owner/generation from CLAIMED to DONE. Stale writers return False.
  Repeating an already-applied completion must not create a second effect.
- `recover(request_id, new_owner) -> (Claim, acquired_new)` may take over only an
  expired CLAIMED claim. One successful takeover increments generation exactly
  once and renews the lease. Competing recovery callers must not both report a
  new acquisition. Before expiry, recovery returns the current claim with False.
- `get(request_id) -> Claim | None` returns durable state.
- Reopening the database must preserve all state. Do not hide races with global
  process locks; use durable SQLite transaction semantics.

`Claim` fields are `request_id`, `owner`, `generation`, `payload`, `status`, and
`expires_at` (Unix seconds as float).

### Canonical identity (`python/canonical.py`, `javascript/canonical.js`, Java `RequestKey`)
All three languages must produce exactly the same canonical request identity:

1. request id is trimmed;
2. payload normalizes CRLF/CR to LF;
3. every run of ASCII whitespace (`space`, tab, CR, LF, form-feed) becomes one
   ASCII space;
4. leading/trailing whitespace is removed;
5. canonical string is `<trimmed-request-id>:<normalized-payload>`;
6. SHA-256 is lowercase 64-hex over UTF-8 canonical bytes.

### JavaScript request validation (`javascript/validate.js`)
`validateRequest(input)` must fail closed. It must accept only a plain object with
exactly `requestId`, `owner`, and `payload`. `requestId` and `owner` must be
trimmed non-empty strings of at most 64 characters matching `[A-Za-z0-9._:-]+`.
`payload` must be a string of at most 1024 characters and must not contain NUL.
Do not coerce nulls, objects, arrays, numbers, booleans, or unknown fields.
Return `{ok:false,error:<stable-code>}` on invalid input. On success return
`{ok:true, requestId:<trimmed>, owner:<trimmed>, payload:<original-string>}`.

## Engineering expectations

- Add useful candidate-created tests under `tests-visible/added/**` if time permits.
- Preserve public APIs and keep changes inside the writable paths from
  `benchmark-manifest.json`.
- Do not weaken or delete baseline tests.
- Prefer small coherent code over test-specific patches.
- Hidden evaluation occurs only after the measured artifact is frozen.
'''
    write(CANDIDATE / "assignment.md", assignment)
    manifest = {
        "benchmark": "A01-CODE-QUAL-001",
        "seed_tag": seed_tag,
        "deadline_seconds": 1800,
        "writable_globs": [
            "python/**",
            "javascript/**",
            "java/src/main/**",
            "tests-visible/added/**",
        ],
        "read_only": [
            "assignment.md",
            "benchmark-manifest.json",
            "tests-visible/test_store.py",
            "tests-visible/test_canonical.py",
            "tests-visible/visible-js.mjs",
            "tests-visible/VisibleRequestKey.java",
            "tests-visible/run_all.py",
        ],
    }
    write(CANDIDATE / "benchmark-manifest.json", json.dumps(manifest, indent=2, sort_keys=True) + "\n")

    write(CANDIDATE / "python" / "store.py", r'''from __future__ import annotations

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
''')

    write(CANDIDATE / "python" / "canonical.py", r'''from __future__ import annotations

import hashlib


def canonical(request_id: str, payload: str) -> str:
    # Intentionally defective: does not normalize incidental whitespace.
    return f"{request_id}:{payload}"


def sha256(request_id: str, payload: str) -> str:
    return hashlib.sha256(canonical(request_id, payload).encode("utf-8")).hexdigest()
''')

    write(CANDIDATE / "javascript" / "validate.js", r'''export function validateRequest(input) {
  // Intentionally defective: coercion makes malformed values look valid.
  if (!input) return { ok: false, error: 'missing' };
  return {
    ok: true,
    requestId: String(input.requestId).trim(),
    owner: String(input.owner).trim(),
    payload: String(input.payload ?? '')
  };
}
''')

    write(CANDIDATE / "javascript" / "canonical.js", r'''import { createHash } from 'node:crypto';

export function canonical(requestId, payload) {
  // Intentionally defective: differs from the required cross-language contract.
  return `${requestId}:${payload}`;
}

export function sha256(requestId, payload) {
  return createHash('sha256').update(canonical(requestId, payload), 'utf8').digest('hex');
}
''')

    write(CANDIDATE / "java" / "src" / "main" / "java" / "benchmark" / "RequestKey.java", r'''package benchmark;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

public final class RequestKey {
    private RequestKey() {}

    public static String canonical(String requestId, String payload) {
        // Intentionally defective: no normalization.
        return requestId + ":" + payload;
    }

    public static String sha256(String requestId, String payload) {
        String value = canonical(requestId, payload);
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
''')

    write(CANDIDATE / "tests-visible" / "test_store.py", r'''import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from store import Conflict, Store


class Clock:
    def __init__(self, now=1000.0): self.now = float(now)
    def __call__(self): return self.now


class VisibleStoreTests(unittest.TestCase):
    def test_replay_returns_same_durable_claim_and_not_new(self):
        with tempfile.TemporaryDirectory() as d:
            s = Store(Path(d) / "x.db")
            try:
                first, acquired1 = s.claim("r1", "worker-a", "payload")
                second, acquired2 = s.claim("r1", "worker-a", "payload")
                self.assertEqual(first, second)
                self.assertTrue(acquired1)
                self.assertFalse(acquired2)
            finally:
                s.close()

    def test_conflicting_payload_is_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            s = Store(Path(d) / "x.db")
            try:
                s.claim("r1", "worker-a", "one")
                with self.assertRaises(Conflict):
                    s.claim("r1", "worker-b", "two")
            finally:
                s.close()

    def test_stale_generation_cannot_complete(self):
        with tempfile.TemporaryDirectory() as d:
            c = Clock()
            s = Store(Path(d) / "x.db", clock=c, lease_seconds=10)
            try:
                first, _ = s.claim("r1", "worker-a", "p")
                c.now += 11
                second, acquired = s.recover("r1", "worker-b")
                self.assertTrue(acquired)
                self.assertEqual(second.generation, first.generation + 1)
                self.assertFalse(s.complete("r1", first.owner, first.generation))
                self.assertTrue(s.complete("r1", second.owner, second.generation))
            finally:
                s.close()

if __name__ == "__main__":
    unittest.main()
''')

    write(CANDIDATE / "tests-visible" / "test_canonical.py", r'''import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from canonical import canonical, sha256


class CanonicalTests(unittest.TestCase):
    def test_whitespace_normalization(self):
        self.assertEqual(canonical(" r1 ", "  alpha\t beta\r\n gamma  "), "r1:alpha beta gamma")

    def test_sha_is_stable(self):
        self.assertEqual(
            sha256("r1", "alpha\n beta"),
            sha256(" r1 ", " alpha   beta ")
        )

if __name__ == "__main__":
    unittest.main()
''')

    write(CANDIDATE / "tests-visible" / "visible-js.mjs", r'''import assert from 'node:assert/strict';
import { validateRequest } from '../javascript/validate.js';
import { canonical } from '../javascript/canonical.js';

assert.deepEqual(
  validateRequest({requestId:' r1 ', owner:' worker-1 ', payload:'alpha'}),
  {ok:true, requestId:'r1', owner:'worker-1', payload:'alpha'}
);
assert.equal(validateRequest({requestId:null, owner:'w', payload:'p'}).ok, false);
assert.equal(validateRequest({requestId:'r', owner:'w', payload:{x:1}}).ok, false);
assert.equal(canonical(' r1 ', ' alpha\t beta\r\n gamma '), 'r1:alpha beta gamma');
console.log('visible-js PASS');
''')

    write(CANDIDATE / "tests-visible" / "VisibleRequestKey.java", r'''import benchmark.RequestKey;

public class VisibleRequestKey {
    public static void main(String[] args) {
        String a = RequestKey.canonical(" r1 ", "  alpha\t beta\r\n gamma  ");
        if (!a.equals("r1:alpha beta gamma")) throw new AssertionError(a);
        String h1 = RequestKey.sha256("r1", "alpha beta");
        String h2 = RequestKey.sha256(" r1 ", " alpha\n\tbeta ");
        if (!h1.equals(h2) || !h1.matches("[0-9a-f]{64}")) throw new AssertionError("hash mismatch");
    }
}
''')

    write(CANDIDATE / "tests-visible" / "run_all.py", r'''from __future__ import annotations
import subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def run(cmd):
    p = subprocess.run(cmd, cwd=ROOT, text=True)
    if p.returncode:
        raise SystemExit(p.returncode)

run([sys.executable, '-m', 'unittest', 'discover', '-s', 'tests-visible', '-p', 'test_*.py'])
run(['node', 'tests-visible/visible-js.mjs'])
out = ROOT / '.visible-java'
out.mkdir(exist_ok=True)
run(['javac', '-d', str(out), 'java/src/main/java/benchmark/RequestKey.java', 'tests-visible/VisibleRequestKey.java'])
run(['java', '-cp', str(out), 'VisibleRequestKey'])
print('VISIBLE_SUITE_PASS')
''')

    write(CANDIDATE / "README.md", "A01-CODE-QUAL-001 generated stress fixture. Exact instance tag: " + seed_tag + "\nRun visible checks with: python tests-visible/run_all.py\n")


def build_hidden(seed_tag: str) -> None:
    request_ids = [f"rq-{secrets.token_hex(6)}" for _ in range(24)]
    randomized = {
        "seed_tag": seed_tag,
        "request_ids": request_ids,
        "payloads": [
            "  alpha  ",
            "alpha\tbeta",
            "alpha\r\nbeta",
            " alpha\n\t beta ",
            "",
            "γ delta",
            "x" * 257,
        ],
        "concurrency_workers": secrets.randbelow(5) + 8,
        "replay_count": secrets.randbelow(20) + 25,
        "stale_generation_delta": secrets.randbelow(4) + 1,
        "lease_seconds": secrets.randbelow(10) + 5,
    }
    write(HIDDEN / "cases.json", json.dumps(randomized, indent=2, ensure_ascii=False, sort_keys=True) + "\n")
    write(HIDDEN / "README.md", "Exact hidden data for one sealed A01-CODE-QUAL-001 run. Do not expose before candidate freeze.\n")


def main() -> int:
    if ROOT.exists():
        shutil.rmtree(ROOT)
    ROOT.mkdir(parents=True)
    seed_tag = secrets.token_hex(16)
    build_candidate(seed_tag)
    build_hidden(seed_tag)
    metadata = {
        "operation_id": "A01-CODE-QUAL-001",
        "seed_tag_sha256": sha256_bytes(seed_tag.encode()),
        "candidate_package_sha256": sha256_tree(CANDIDATE),
        "hidden_evaluator_sha256": sha256_tree(HIDDEN),
        "assignment_sha256": sha256_bytes((CANDIDATE / "assignment.md").read_bytes()),
    }
    write(META, json.dumps(metadata, indent=2, sort_keys=True) + "\n")
    print(json.dumps(metadata, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
