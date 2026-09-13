"""A-01 evidence retention — P03.

Evidence accumulates on A-01 every night and nothing governs it. Two failures
follow, and they pull in opposite directions: the disk fills until the night dies
for want of space, or someone clears it by hand and the audit trail has a hole
nobody can date.

This governs retention without either. It indexes evidence under a root, records
each artifact in a hash-chained append-only manifest, and prunes by a tiered
policy. Every destructive attempt is recorded before deletion. Successful
deletion is then confirmed by a second append-only record, so the manifest never
needs to pretend an attempted deletion succeeded when the filesystem refused it.

Design follows current audit-log practice: immutability is a property of the
write path, not of a policy sentence. Each manifest entry carries the digest of
the artifact and the digest of the previous entry, so removal, alteration or
insertion anywhere in the chain is detectable by replay. The manifest is opened
append-only; there is no update or delete path in this module.

The retention rule is deliberately asymmetric. Artifacts are prunable; manifest
entries never are. Pruning an artifact is a space decision. Losing the record
that it existed is an audit decision, and those are not the same decision.

    python -m a01_evidence_retention --index          # record new artifacts
    python -m a01_evidence_retention --verify         # replay the chain
    python -m a01_evidence_retention --plan           # what would be pruned
    python -m a01_evidence_retention --prune          # prune, recording each
    python -m a01_evidence_retention --report

Exit codes: 0 ok, 1 policy/refusal/completion-record problem, 2 chain broken or
unreadable. A broken chain is exit 2 because it is not a retention problem, it is
an integrity problem.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import shutil
import sys
from dataclasses import dataclass
from typing import Any, Iterator, Optional

MANIFEST_NAME = "EVIDENCE-MANIFEST-001.jsonl"
GENESIS = "0" * 64
CHUNK = 1024 * 1024


class RetentionError(RuntimeError):
    pass


class ChainError(RetentionError):
    pass


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def iso(moment: dt.datetime) -> str:
    return moment.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def digest_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as handle:
        while True:
            block = handle.read(CHUNK)
            if not block:
                break
            h.update(block)
    return h.hexdigest()


@dataclass(frozen=True)
class RetentionPolicy:
    """Tiered windows plus a non-destructive low-space alert threshold."""

    keep_all_days: int = 30
    keep_summary_days: int = 365
    min_free_bytes: int = 5 * 1024 ** 3
    never_prune_prefixes: tuple[str, ...] = ("authority/", "qualification/", "closure/")

    def protected(self, relpath: str) -> bool:
        return any(relpath.startswith(p) for p in self.never_prune_prefixes)


class EvidenceManifest:
    """Append-only, hash-chained. No update path exists in this class by design."""

    def __init__(self, root: str):
        self.root = os.path.abspath(root)
        self.path = os.path.join(self.root, MANIFEST_NAME)

    def entries(self) -> Iterator[dict[str, Any]]:
        if not os.path.exists(self.path):
            return
        with open(self.path, "r", encoding="utf-8") as handle:
            for line_no, line in enumerate(handle, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except json.JSONDecodeError as error:
                    raise ChainError(f"manifest line {line_no} is not valid JSON: {error}") from error

    def head(self) -> str:
        last = GENESIS
        for entry in self.entries():
            last = entry["entry_digest"]
        return last

    @staticmethod
    def compute_entry_digest(body: dict[str, Any]) -> str:
        return digest_bytes(canonical(body).encode("utf-8"))

    def append(self, body: dict[str, Any]) -> dict[str, Any]:
        record = dict(body)
        record["previous_entry_digest"] = self.head()
        record["recorded_at"] = iso(utcnow())
        record["entry_digest"] = self.compute_entry_digest(record)
        os.makedirs(self.root, exist_ok=True)
        with open(self.path, "a", encoding="utf-8") as handle:
            handle.write(f"{canonical(record)}\n")
            handle.flush()
            os.fsync(handle.fileno())
        return record

    def verify(self) -> dict[str, Any]:
        previous = GENESIS
        count = 0
        for index, entry in enumerate(self.entries()):
            count += 1
            if entry.get("previous_entry_digest") != previous:
                return {"ok": False, "entries": count, "broken_at": index,
                        "reason": "previous_entry_digest does not match the prior entry"}
            body = {k: v for k, v in entry.items() if k != "entry_digest"}
            if self.compute_entry_digest(body) != entry.get("entry_digest"):
                return {"ok": False, "entries": count, "broken_at": index,
                        "reason": "entry_digest does not match the entry body"}
            previous = entry["entry_digest"]
        return {"ok": True, "entries": count, "head": previous}

    def recorded_paths(self) -> dict[str, dict[str, Any]]:
        """Latest completed artifact state per path. Intent/failure records are audit events."""
        seen: dict[str, dict[str, Any]] = {}
        for entry in self.entries():
            if entry.get("event") in {"INDEXED", "PRUNED"}:
                seen[entry["relpath"]] = entry
        return seen


class EvidenceStore:
    def __init__(self, root: str, policy: Optional[RetentionPolicy] = None):
        self.root = os.path.abspath(root)
        self.policy = policy or RetentionPolicy()
        self.manifest = EvidenceManifest(self.root)

    def _artifacts(self) -> Iterator[str]:
        for dirpath, _dirs, files in os.walk(self.root):
            for name in files:
                if name == MANIFEST_NAME:
                    continue
                abs_path = os.path.join(dirpath, name)
                yield os.path.relpath(abs_path, self.root).replace(os.sep, "/")

    def index(self) -> dict[str, Any]:
        known = self.manifest.recorded_paths()
        added = []
        for relpath in sorted(self._artifacts()):
            abs_path = os.path.join(self.root, relpath)
            existing = known.get(relpath)
            content = digest_file(abs_path)
            if existing and existing.get("content_digest") == content and existing.get("event") == "INDEXED":
                continue
            stat = os.stat(abs_path)
            record = self.manifest.append({
                "event": "INDEXED",
                "relpath": relpath,
                "content_digest": content,
                "size_bytes": stat.st_size,
                "modified_at": iso(dt.datetime.fromtimestamp(stat.st_mtime, dt.timezone.utc)),
                "protected": self.policy.protected(relpath),
            })
            added.append(record["relpath"])
        return {"indexed": len(added), "paths": added}

    def _age_days(self, relpath: str, now: dt.datetime) -> float:
        abs_path = os.path.join(self.root, relpath)
        modified = dt.datetime.fromtimestamp(os.stat(abs_path).st_mtime, dt.timezone.utc)
        return (now - modified).total_seconds() / 86400.0

    def plan(self, now: Optional[dt.datetime] = None) -> dict[str, Any]:
        now = now or utcnow()
        keep, prune, protected = [], [], []
        by_day: dict[str, list[str]] = {}

        for relpath in sorted(self._artifacts()):
            if self.policy.protected(relpath):
                protected.append(relpath)
                continue
            age = self._age_days(relpath, now)
            if age <= self.policy.keep_all_days:
                keep.append(relpath)
                continue
            if age > self.policy.keep_summary_days:
                prune.append(relpath)
                continue
            abs_path = os.path.join(self.root, relpath)
            day = dt.datetime.fromtimestamp(os.stat(abs_path).st_mtime, dt.timezone.utc).date().isoformat()
            by_day.setdefault(day, []).append(relpath)

        for _day, paths in by_day.items():
            paths.sort(key=lambda p: os.stat(os.path.join(self.root, p)).st_size)
            keep.append(paths[0])
            prune.extend(paths[1:])

        usage = shutil.disk_usage(self.root)
        return {
            "now": iso(now),
            "keep": sorted(keep),
            "prune": sorted(prune),
            "protected": sorted(protected),
            "prune_bytes": sum(os.stat(os.path.join(self.root, p)).st_size for p in prune),
            "free_bytes": usage.free,
            "min_free_bytes": self.policy.min_free_bytes,
            "below_min_free_bytes": usage.free < self.policy.min_free_bytes,
        }

    def prune(self, now: Optional[dt.datetime] = None, dry_run: bool = False) -> dict[str, Any]:
        """Record destructive intent first, then delete, then record completion.

        The pre-delete PRUNE_INTENT carries the content digest and size, so even a
        post-delete manifest-write failure cannot make the deletion untraceable.
        """
        chain = self.manifest.verify()
        if not chain["ok"]:
            raise ChainError(f"refusing to prune with a broken manifest: {chain['reason']} at entry {chain['broken_at']}")

        planned = self.plan(now)
        pruned, would_prune, refused, completion_record_failures = [], [], [], []
        bytes_reclaimed = 0
        for relpath in planned["prune"]:
            abs_path = os.path.join(self.root, relpath)
            if not os.path.exists(abs_path):
                continue
            if dry_run:
                would_prune.append(relpath)
                continue

            content = digest_file(abs_path)
            size_bytes = os.stat(abs_path).st_size
            try:
                self.manifest.append({
                    "event": "PRUNE_INTENT",
                    "relpath": relpath,
                    "content_digest": content,
                    "size_bytes": size_bytes,
                    "reason": "retention policy",
                })
            except OSError as error:
                refused.append({"relpath": relpath, "reason": f"intent record failed: {error}"})
                continue

            try:
                os.remove(abs_path)
            except OSError as error:
                failure_reason = f"delete failed: {error}"
                try:
                    self.manifest.append({
                        "event": "PRUNE_FAILED",
                        "relpath": relpath,
                        "content_digest": content,
                        "size_bytes": size_bytes,
                        "reason": failure_reason,
                    })
                except OSError as record_error:
                    failure_reason += f"; failure record failed: {record_error}"
                refused.append({"relpath": relpath, "reason": failure_reason})
                continue

            pruned.append(relpath)
            bytes_reclaimed += size_bytes
            try:
                self.manifest.append({
                    "event": "PRUNED",
                    "relpath": relpath,
                    "content_digest": content,
                    "size_bytes": size_bytes,
                    "reason": "retention policy",
                })
            except OSError as error:
                completion_record_failures.append({
                    "relpath": relpath,
                    "reason": f"completion record failed after traceable deletion: {error}",
                })

        return {
            "pruned": len(pruned),
            "would_prune": len(would_prune),
            "refused": refused,
            "completion_record_failures": completion_record_failures,
            "dry_run": dry_run,
            "bytes_reclaimed": bytes_reclaimed,
        }

    def report(self, now: Optional[dt.datetime] = None) -> dict[str, Any]:
        chain = self.manifest.verify()
        planned = self.plan(now)
        artifacts = list(self._artifacts())
        total = sum(os.stat(os.path.join(self.root, p)).st_size for p in artifacts)
        recorded = self.manifest.recorded_paths()
        unrecorded = [p for p in artifacts if p not in recorded]
        return {
            "root": self.root,
            "chain": chain,
            "artifacts": len(artifacts),
            "total_bytes": total,
            "free_bytes": planned["free_bytes"],
            "min_free_bytes": planned["min_free_bytes"],
            "below_min_free_bytes": planned["below_min_free_bytes"],
            "unrecorded": unrecorded,
            "keep": len(planned["keep"]),
            "prune_candidates": len(planned["prune"]),
            "protected": len(planned["protected"]),
            "policy": {
                "keep_all_days": self.policy.keep_all_days,
                "keep_summary_days": self.policy.keep_summary_days,
                "min_free_bytes": self.policy.min_free_bytes,
                "never_prune_prefixes": list(self.policy.never_prune_prefixes),
            },
        }


def default_root() -> str:
    explicit = os.environ.get("A01_EVIDENCE_ROOT")
    if explicit:
        return explicit
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, "state", "evidence")


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="A-01 evidence retention")
    parser.add_argument("--root", default=None)
    parser.add_argument("--index", action="store_true")
    parser.add_argument("--verify", action="store_true")
    parser.add_argument("--plan", action="store_true")
    parser.add_argument("--prune", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--report", action="store_true")
    parser.add_argument("--keep-all-days", type=int, default=30)
    parser.add_argument("--keep-summary-days", type=int, default=365)
    parser.add_argument("--min-free-bytes", type=int, default=5 * 1024 ** 3)
    args = parser.parse_args(argv)

    root = args.root or default_root()
    if not os.path.isdir(root):
        sys.stderr.write(f"EVIDENCE_RETENTION=FAIL code=ROOT_ABSENT path={root}\n")
        return 2

    store = EvidenceStore(root, RetentionPolicy(
        keep_all_days=args.keep_all_days,
        keep_summary_days=args.keep_summary_days,
        min_free_bytes=args.min_free_bytes))

    try:
        if args.verify:
            result = store.manifest.verify()
            sys.stdout.write(f"{json.dumps(result, indent=2)}\n")
            return 0 if result["ok"] else 2
        if args.index:
            sys.stdout.write(f"{json.dumps(store.index(), indent=2)}\n")
            return 0
        if args.plan:
            sys.stdout.write(f"{json.dumps(store.plan(), indent=2)}\n")
            return 0
        if args.prune:
            result = store.prune(dry_run=args.dry_run)
            sys.stdout.write(f"{json.dumps(result, indent=2)}\n")
            return 1 if result["refused"] or result["completion_record_failures"] else 0
        sys.stdout.write(f"{json.dumps(store.report(), indent=2)}\n")
        return 0
    except ChainError as error:
        sys.stderr.write(f"EVIDENCE_RETENTION=FAIL code=CHAIN_BROKEN detail={error}\n")
        return 2
    except RetentionError as error:
        sys.stderr.write(f"EVIDENCE_RETENTION=FAIL code=POLICY detail={error}\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
