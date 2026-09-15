#!/usr/bin/env python3
"""Generate one run-local A01-CODE-QUAL-001 benchmark instance.

This script runs only in the hosted SEAL job. It emits two separate directories:
- candidate-package: visible to A-01 during the coding window
- hidden-evaluator: withheld until the hosted EVALUATE job

The exact hidden data is randomized per run. This script is not itself the hidden
evaluator; it is the generator for the exact sealed instance.
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
    assignment = """# A01-CODE-QUAL-001 Candidate Assignment\n\nHard deadline: 30 minutes. Human assistance is prohibited.\n\nRepair and complete the supplied Java/Python/JavaScript request pipeline. Preserve idempotent durable effects, single-owner concurrency, stale-writer rejection, restart-safe behavior, fail-closed validation, and clean tests. Change only paths listed in benchmark-manifest.json. Hidden evaluation occurs only after your artifact is frozen.\n"""
    write(CANDIDATE / "assignment.md", assignment)
    manifest = {
        "benchmark": "A01-CODE-QUAL-001",
        "seed_tag": seed_tag,
        "deadline_seconds": 1800,
        "writable_globs": ["java/**", "python/**", "javascript/**", "tests-visible/**"],
        "read_only": ["assignment.md", "benchmark-manifest.json"],
    }
    write(CANDIDATE / "benchmark-manifest.json", json.dumps(manifest, indent=2, sort_keys=True) + "\n")

    write(CANDIDATE / "python" / "store.py", '''from __future__ import annotations\n\nimport sqlite3\nfrom dataclasses import dataclass\nfrom pathlib import Path\n\n@dataclass(frozen=True)\nclass Claim:\n    request_id: str\n    owner: str\n    generation: int\n    payload: str\n\nclass Store:\n    def __init__(self, db: str | Path):\n        self.db = str(db)\n        self.conn = sqlite3.connect(self.db, timeout=10, isolation_level=None, check_same_thread=False)\n        self.conn.execute("PRAGMA journal_mode=WAL")\n        self.conn.execute("CREATE TABLE IF NOT EXISTS claims(request_id TEXT PRIMARY KEY, owner TEXT NOT NULL, generation INTEGER NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL)")\n\n    def close(self):\n        self.conn.close()\n\n    def claim(self, request_id: str, owner: str, payload: str) -> tuple[Claim, bool]:\n        # TODO: make this atomic and idempotent under concurrent callers.\n        row = self.conn.execute("SELECT request_id, owner, generation, payload FROM claims WHERE request_id=?", (request_id,)).fetchone()\n        if row:\n            return Claim(*row), True\n        self.conn.execute("INSERT INTO claims(request_id, owner, generation, payload, status) VALUES(?,?,?,?, 'CLAIMED')", (request_id, owner, 1, payload))\n        return Claim(request_id, owner, 1, payload), True\n\n    def complete(self, request_id: str, owner: str, generation: int) -> bool:\n        # BUG: stale owners/generations can overwrite newer state.\n        cur = self.conn.execute("UPDATE claims SET status='DONE' WHERE request_id=?", (request_id,))\n        return cur.rowcount == 1\n''')

    write(CANDIDATE / "javascript" / "validate.js", '''export function validateRequest(input) {\n  // TODO: fail closed on malformed input without coercing dangerous values.\n  if (!input) return { ok: false, error: 'missing' };\n  return {\n    ok: true,\n    requestId: String(input.requestId),\n    owner: String(input.owner),\n    payload: String(input.payload ?? '')\n  };\n}\n''')

    write(CANDIDATE / "java" / "src" / "main" / "java" / "benchmark" / "RequestKey.java", '''package benchmark;\n\nimport java.nio.charset.StandardCharsets;\nimport java.security.MessageDigest;\nimport java.security.NoSuchAlgorithmException;\n\npublic final class RequestKey {\n    private RequestKey() {}\n\n    public static String canonical(String requestId, String payload) {\n        // TODO: canonical key must be stable across retries and insensitive to incidental whitespace in payload.\n        return requestId + ":" + payload;\n    }\n\n    public static String sha256(String value) {\n        try {\n            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));\n            StringBuilder sb = new StringBuilder();\n            for (byte b : digest) sb.append(String.format("%02x", b));\n            return sb.toString();\n        } catch (NoSuchAlgorithmException e) {\n            throw new IllegalStateException(e);\n        }\n    }\n}\n''')

    write(CANDIDATE / "tests-visible" / "test_store.py", '''import tempfile\nimport unittest\nfrom pathlib import Path\nimport sys\n\nsys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))\nfrom store import Store\n\nclass VisibleStoreTests(unittest.TestCase):\n    def test_replay_returns_same_durable_claim(self):\n        with tempfile.TemporaryDirectory() as d:\n            s = Store(Path(d) / "x.db")\n            try:\n                first, acquired1 = s.claim("r1", "worker-a", "payload")\n                second, acquired2 = s.claim("r1", "worker-a", "payload")\n                self.assertEqual(first, second)\n                self.assertTrue(acquired1)\n                self.assertFalse(acquired2)\n            finally:\n                s.close()\n\nif __name__ == "__main__":\n    unittest.main()\n''')

    write(CANDIDATE / "README.md", "A01-CODE-QUAL-001 generated candidate fixture. Exact instance tag: " + seed_tag + "\n")


def build_hidden(seed_tag: str) -> None:
    hidden_ids = [secrets.token_hex(8) for _ in range(12)]
    boundary_payloads = ["  alpha  ", "beta\n", "", "γ", "x" * 257]
    randomized = {
        "seed_tag": seed_tag,
        "request_ids": hidden_ids,
        "boundary_payloads": boundary_payloads,
        "concurrency_workers": secrets.randbelow(5) + 4,
        "replay_count": secrets.randbelow(15) + 10,
        "stale_generation_delta": secrets.randbelow(4) + 1,
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
