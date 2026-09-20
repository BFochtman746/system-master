from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import stat
import sys
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any

INGRESS_PROTOCOL = "control-gateway.a01-candidate-ingress.v1"
RECEIPT_PROTOCOL = "control-gateway.a01-candidate-ingress-receipt.v1"
MANIFEST_PROTOCOL = "control-gateway.a01-candidate-package.v1"
MANIFEST_NAME = "manifest.json"
DEFAULT_MAX_PACKAGE_BYTES = 1024 * 1024
DEFAULT_MAX_UNCOMPRESSED_BYTES = 4 * 1024 * 1024
DEFAULT_MAX_ENTRIES = 64
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
PACKAGE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


class CandidateIngressError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def _fail(code: str, message: str) -> None:
    raise CandidateIngressError(code, message)


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _canonical_json(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode("utf-8")


def _validate_exact_keys(value: dict[str, Any], expected: set[str], label: str) -> None:
    if set(value) != expected:
        _fail("PACKAGE_SCHEMA_INVALID", f"{label} fields differ from the frozen contract")


def _validate_sha256(value: Any, label: str) -> str:
    if not isinstance(value, str) or not SHA256_RE.fullmatch(value):
        _fail("PACKAGE_SCHEMA_INVALID", f"{label} must be a lowercase SHA-256 digest")
    return value


def _validate_archive_path(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value:
        _fail("PACKAGE_PATH_INVALID", f"{label} must be a non-empty path")
    if "\x00" in value or "\\" in value or value.startswith("/"):
        _fail("PACKAGE_PATH_INVALID", f"{label} is not a safe relative POSIX path")
    path = PurePosixPath(value)
    parts = path.parts
    if not parts or any(part in {"", ".", ".."} for part in parts):
        _fail("PACKAGE_PATH_INVALID", f"{label} contains path traversal or non-normal segments")
    if parts[0].endswith(":") or value != path.as_posix():
        _fail("PACKAGE_PATH_INVALID", f"{label} is not a normalized relative path")
    return value


def _is_symlink(info: zipfile.ZipInfo) -> bool:
    mode = (info.external_attr >> 16) & 0xFFFF
    return stat.S_IFMT(mode) == stat.S_IFLNK


def _parse_manifest(raw: bytes) -> dict[str, Any]:
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise CandidateIngressError("PACKAGE_MANIFEST_INVALID", "manifest.json is not UTF-8") from exc
    try:
        value = json.loads(text)
    except json.JSONDecodeError as exc:
        raise CandidateIngressError("PACKAGE_MANIFEST_INVALID", "manifest.json is not valid JSON") from exc
    if not isinstance(value, dict):
        _fail("PACKAGE_MANIFEST_INVALID", "manifest.json must contain an object")
    _validate_exact_keys(value, {"protocol_version", "package_id", "entries"}, "manifest")
    if value.get("protocol_version") != MANIFEST_PROTOCOL:
        _fail("PACKAGE_PROTOCOL_INVALID", "candidate package manifest protocol mismatch")
    package_id = value.get("package_id")
    if not isinstance(package_id, str) or not PACKAGE_ID_RE.fullmatch(package_id):
        _fail("PACKAGE_SCHEMA_INVALID", "manifest package_id is invalid")
    entries = value.get("entries")
    if not isinstance(entries, list) or not entries:
        _fail("PACKAGE_SCHEMA_INVALID", "manifest entries must be a non-empty array")
    return value


def _validate_package_bytes(
    package_bytes: bytes,
    *,
    max_uncompressed_bytes: int,
    max_entries: int,
) -> dict[str, Any]:
    try:
        archive = zipfile.ZipFile(io.BytesIO(package_bytes), mode="r")
    except (zipfile.BadZipFile, OSError) as exc:
        raise CandidateIngressError("PACKAGE_MALFORMED", "candidate package is not a readable ZIP archive") from exc

    with archive:
        infos = archive.infolist()
        if not infos or len(infos) > max_entries + 1:
            _fail("PACKAGE_ENTRY_LIMIT_EXCEEDED", "candidate package entry count is outside the allowed bound")

        names: list[str] = []
        seen: set[str] = set()
        total_uncompressed = 0
        for info in infos:
            name = _validate_archive_path(info.filename, "archive entry")
            if name in seen:
                _fail("PACKAGE_DUPLICATE_ENTRY", f"duplicate archive entry {name}")
            seen.add(name)
            names.append(name)
            if info.is_dir():
                _fail("PACKAGE_ENTRY_TYPE_INVALID", f"directory entries are not permitted: {name}")
            if _is_symlink(info):
                _fail("PACKAGE_ENTRY_TYPE_INVALID", f"symbolic-link entries are not permitted: {name}")
            if info.flag_bits & 0x1:
                _fail("PACKAGE_ENTRY_TYPE_INVALID", f"encrypted entries are not permitted: {name}")
            if info.file_size < 0 or info.compress_size < 0:
                _fail("PACKAGE_MALFORMED", f"invalid ZIP sizes for {name}")
            total_uncompressed += info.file_size
            if total_uncompressed > max_uncompressed_bytes:
                _fail("PACKAGE_UNCOMPRESSED_LIMIT_EXCEEDED", "candidate package uncompressed size exceeds the allowed bound")

        if MANIFEST_NAME not in seen:
            _fail("PACKAGE_MANIFEST_MISSING", "candidate package lacks manifest.json")
        if names[0] != MANIFEST_NAME:
            _fail("PACKAGE_NOT_DETERMINISTIC", "manifest.json must be the first archive entry")

        try:
            manifest_raw = archive.read(MANIFEST_NAME)
        except (RuntimeError, zipfile.BadZipFile, OSError) as exc:
            raise CandidateIngressError("PACKAGE_MALFORMED", "manifest.json could not be read intact") from exc
        manifest = _parse_manifest(manifest_raw)
        entries = manifest["entries"]
        if len(entries) > max_entries:
            _fail("PACKAGE_ENTRY_LIMIT_EXCEEDED", "manifest entry count exceeds the allowed bound")

        manifest_paths: list[str] = []
        expected_by_path: dict[str, dict[str, Any]] = {}
        for index, entry in enumerate(entries):
            if not isinstance(entry, dict):
                _fail("PACKAGE_SCHEMA_INVALID", f"manifest entries[{index}] must be an object")
            _validate_exact_keys(entry, {"path", "sha256", "size_bytes"}, f"manifest entries[{index}]")
            path = _validate_archive_path(entry.get("path"), f"manifest entries[{index}].path")
            if path == MANIFEST_NAME:
                _fail("PACKAGE_SCHEMA_INVALID", "manifest cannot list itself as a payload entry")
            if path in expected_by_path:
                _fail("PACKAGE_DUPLICATE_ENTRY", f"manifest duplicates {path}")
            digest = _validate_sha256(entry.get("sha256"), f"manifest entries[{index}].sha256")
            size_bytes = entry.get("size_bytes")
            if type(size_bytes) is not int or size_bytes < 0:
                _fail("PACKAGE_SCHEMA_INVALID", f"manifest entries[{index}].size_bytes must be a non-negative integer")
            manifest_paths.append(path)
            expected_by_path[path] = {"sha256": digest, "size_bytes": size_bytes}

        if manifest_paths != sorted(manifest_paths):
            _fail("PACKAGE_NOT_DETERMINISTIC", "manifest payload entries must be sorted by path")
        if names != [MANIFEST_NAME, *manifest_paths]:
            _fail("PACKAGE_CONTENT_SET_MISMATCH", "archive payload entries must exactly match the manifest in deterministic order")

        verified: list[dict[str, Any]] = []
        for path in manifest_paths:
            try:
                payload = archive.read(path)
            except (RuntimeError, zipfile.BadZipFile, OSError) as exc:
                raise CandidateIngressError("PACKAGE_MALFORMED", f"payload {path} could not be read intact") from exc
            expected = expected_by_path[path]
            if len(payload) != expected["size_bytes"]:
                _fail("PACKAGE_PAYLOAD_SIZE_MISMATCH", f"payload size mismatch for {path}")
            actual_digest = _sha256_bytes(payload)
            if actual_digest != expected["sha256"]:
                _fail("PACKAGE_PAYLOAD_DIGEST_MISMATCH", f"payload digest mismatch for {path}")
            verified.append({"path": path, "sha256": actual_digest, "size_bytes": len(payload)})

        return {
            "protocol_version": manifest["protocol_version"],
            "package_id": manifest["package_id"],
            "entries": verified,
            "entry_count": len(verified),
            "total_uncompressed_bytes": total_uncompressed,
        }


def _persist_exact_bytes(store_dir: Path, received_digest: str, package_bytes: bytes) -> tuple[Path, bool]:
    store_dir.mkdir(parents=True, exist_ok=True)
    target = store_dir / f"{received_digest}.zip"
    if target.exists():
        if not target.is_file():
            _fail("STORE_TARGET_INVALID", "content-addressed store target exists but is not a regular file")
        if target.stat().st_size != len(package_bytes) or _sha256_file(target) != received_digest:
            _fail("STORE_COLLISION_OR_CORRUPTION", "existing content-addressed package does not match received bytes")
        return target, True

    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_BINARY"):
        flags |= os.O_BINARY
    fd: int | None = None
    try:
        fd = os.open(target, flags, 0o600)
        with os.fdopen(fd, "wb", closefd=True) as handle:
            fd = None
            handle.write(package_bytes)
            handle.flush()
            os.fsync(handle.fileno())
    except FileExistsError:
        if target.stat().st_size != len(package_bytes) or _sha256_file(target) != received_digest:
            _fail("STORE_COLLISION_OR_CORRUPTION", "concurrent store target does not match received bytes")
        return target, True
    except Exception:
        if fd is not None:
            os.close(fd)
        try:
            target.unlink()
        except FileNotFoundError:
            pass
        raise
    return target, False


def _receipt_digest(receipt: dict[str, Any]) -> str:
    body = dict(receipt)
    body.pop("receipt_digest", None)
    return _sha256_bytes(_canonical_json(body))


def receive_candidate_package(
    package_path: os.PathLike[str] | str,
    *,
    expected_sha256: str,
    store_dir: os.PathLike[str] | str,
    max_package_bytes: int = DEFAULT_MAX_PACKAGE_BYTES,
    max_uncompressed_bytes: int = DEFAULT_MAX_UNCOMPRESSED_BYTES,
    max_entries: int = DEFAULT_MAX_ENTRIES,
) -> dict[str, Any]:
    expected_sha256 = _validate_sha256(expected_sha256, "expected_sha256")
    if type(max_package_bytes) is not int or max_package_bytes <= 0:
        raise ValueError("max_package_bytes must be a positive integer")
    if type(max_uncompressed_bytes) is not int or max_uncompressed_bytes <= 0:
        raise ValueError("max_uncompressed_bytes must be a positive integer")
    if type(max_entries) is not int or max_entries <= 0:
        raise ValueError("max_entries must be a positive integer")

    source = Path(package_path)
    try:
        size_before = source.stat().st_size
    except OSError as exc:
        raise CandidateIngressError("PACKAGE_READ_FAILED", f"candidate package is not readable: {exc}") from exc
    if size_before > max_package_bytes:
        _fail("PACKAGE_SIZE_LIMIT_EXCEEDED", "candidate package exceeds the allowed byte bound")
    try:
        package_bytes = source.read_bytes()
    except OSError as exc:
        raise CandidateIngressError("PACKAGE_READ_FAILED", f"candidate package could not be read: {exc}") from exc
    if len(package_bytes) != size_before:
        _fail("PACKAGE_CHANGED_DURING_READ", "candidate package changed while being read")
    if len(package_bytes) > max_package_bytes:
        _fail("PACKAGE_SIZE_LIMIT_EXCEEDED", "candidate package exceeds the allowed byte bound")

    received_digest = _sha256_bytes(package_bytes)
    if received_digest != expected_sha256:
        _fail("PACKAGE_DIGEST_MISMATCH", "candidate package SHA-256 differs from the expected digest")

    validation = _validate_package_bytes(
        package_bytes,
        max_uncompressed_bytes=max_uncompressed_bytes,
        max_entries=max_entries,
    )
    stored_path, idempotent_replay = _persist_exact_bytes(Path(store_dir), received_digest, package_bytes)
    stored_digest = _sha256_file(stored_path)
    stored_size = stored_path.stat().st_size
    if stored_digest != received_digest or stored_size != len(package_bytes):
        try:
            stored_path.unlink()
        except OSError:
            pass
        _fail("STORED_DIGEST_MISMATCH", "stored candidate bytes differ from received candidate bytes")

    receipt = {
        "protocol_version": RECEIPT_PROTOCOL,
        "ingress_protocol": INGRESS_PROTOCOL,
        "status": "RECEIVED_NOT_EXECUTED",
        "package_id": validation["package_id"],
        "package_size_bytes": len(package_bytes),
        "received_sha256": received_digest,
        "stored_sha256": stored_digest,
        "digest_match": received_digest == stored_digest,
        "stored_filename": stored_path.name,
        "idempotent_replay": idempotent_replay,
        "validated_entries": validation["entries"],
        "execution_authority": "NONE",
        "executed": False,
        "receipt_digest": "",
    }
    receipt["receipt_digest"] = _receipt_digest(receipt)
    return receipt


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Receive and preserve a bounded A-01 engineering candidate package without executing it")
    parser.add_argument("--package", required=True, dest="package_path")
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--store-dir", required=True)
    parser.add_argument("--max-package-bytes", type=int, default=DEFAULT_MAX_PACKAGE_BYTES)
    parser.add_argument("--max-uncompressed-bytes", type=int, default=DEFAULT_MAX_UNCOMPRESSED_BYTES)
    parser.add_argument("--max-entries", type=int, default=DEFAULT_MAX_ENTRIES)
    args = parser.parse_args(argv)

    try:
        receipt = receive_candidate_package(
            args.package_path,
            expected_sha256=args.expected_sha256,
            store_dir=args.store_dir,
            max_package_bytes=args.max_package_bytes,
            max_uncompressed_bytes=args.max_uncompressed_bytes,
            max_entries=args.max_entries,
        )
    except CandidateIngressError as exc:
        sys.stderr.write(f"A01_CANDIDATE_INGRESS=FAIL code={exc.code} detail={exc}\n")
        return 2

    rendered = json.dumps(receipt, indent=2, sort_keys=True) + "\n"
    sys.stdout.write(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
