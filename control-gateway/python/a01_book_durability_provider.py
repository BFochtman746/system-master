"""CORE/P03 public Book physical durability provider.

This module owns only physical persistence and destructive test-restore mechanics.
BOOK remains the semantic owner of Book state and decides semantic backup-set
membership, currentness, canonical admission, and PRESERVATION/G19 acceptance.

The public operation identities are registered separately under CORE/P03:
  CORE.P03.COMMAND.PRESERVE_PHYSICAL_SET
  CORE.P03.COMMAND.RESTORE_PHYSICAL_SET
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any, Callable

PRESERVE_OPERATION_ID = "CORE.P03.COMMAND.PRESERVE_PHYSICAL_SET"
RESTORE_OPERATION_ID = "CORE.P03.COMMAND.RESTORE_PHYSICAL_SET"
OWNER_PATH = "SYSTEM_MASTER/CORE"
PROVIDER_SYSTEM = "CORE"
DOMAIN = "P03"
KIND = "COMMAND"
SHA256_CHARS = set("0123456789abcdef")
PHYSICAL_MANIFEST_NAME = "PHYSICAL-MANIFEST-001.json"


class DurabilityError(RuntimeError):
    def __init__(self, code: str, detail: str = "") -> None:
        self.code = code
        self.detail = detail
        super().__init__(f"{code}:{detail}" if detail else code)


def _fail(code: str, detail: str = "") -> None:
    raise DurabilityError(code, detail)


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _sha256_json(value: Any) -> str:
    return _sha256_bytes(_canonical(value).encode("utf-8"))


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def _digest(value: Any, label: str) -> str:
    text = str(value or "")
    if len(text) != 64 or any(ch not in SHA256_CHARS for ch in text):
        _fail("INVALID_SHA256", label)
    return text


def _text(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        _fail("NONEMPTY_TEXT_REQUIRED", label)
    return value


def _operation_id(role: str) -> str:
    if role == "PRESERVE_PHYSICAL_SET":
        return PRESERVE_OPERATION_ID
    if role == "RESTORE_PHYSICAL_SET":
        return RESTORE_OPERATION_ID
    _fail("UNKNOWN_SEMANTIC_ROLE", role)


def _request_canonical_digest(request: dict[str, Any], role: str) -> str:
    if role == "PRESERVE_PHYSICAL_SET":
        subject = request.get("subject")
        if not isinstance(subject, dict):
            _fail("REQUEST_SUBJECT_REQUIRED")
        return _digest(subject.get("canonical_digest"), "request.subject.canonical_digest")
    return _digest(request.get("canonical_digest"), "request.canonical_digest")


def _validate_request(request: dict[str, Any], role: str) -> str:
    if not isinstance(request, dict):
        _fail("REQUEST_REQUIRED")
    if request.get("caller_system") != "BOOK":
        _fail("CALLER_SYSTEM_MISMATCH")
    if role == "PRESERVE_PHYSICAL_SET" and request.get("caller_owner_path") != "SYSTEM_MASTER/BOOK":
        _fail("CALLER_OWNER_MISMATCH")
    if request.get("provider_system") != PROVIDER_SYSTEM:
        _fail("PROVIDER_SYSTEM_MISMATCH")
    if request.get("semantic_role") != role:
        _fail("SEMANTIC_ROLE_MISMATCH")
    if request.get("operation_id") != _operation_id(role):
        _fail("OPERATION_ID_MISMATCH")
    if request.get("canonical_effect_allowed") is not False or request.get("direct_database_access") is not False:
        _fail("BOOK_WRITE_AUTHORITY_FORBIDDEN")
    if role == "PRESERVE_PHYSICAL_SET" and request.get("physical_payload_included") is not False:
        _fail("BOOK_REQUEST_PHYSICAL_PAYLOAD_FORBIDDEN")
    _text(request.get("request_id"), "request_id")
    _text(request.get("idempotency_key"), "idempotency_key")
    _digest(request.get("semantic_manifest_digest"), "request.semantic_manifest_digest")
    return _request_canonical_digest(request, role)


def _verify_semantic_manifest(manifest: dict[str, Any]) -> None:
    if not isinstance(manifest, dict):
        _fail("SEMANTIC_MANIFEST_REQUIRED")
    supplied = _digest(manifest.get("manifest_digest"), "semantic_manifest_digest")
    body = dict(manifest)
    body.pop("manifest_digest", None)
    if _sha256_json(body) != supplied:
        _fail("SEMANTIC_MANIFEST_DIGEST_MISMATCH")
    if manifest.get("owner_path") != "SYSTEM_MASTER/BOOK":
        _fail("SEMANTIC_MANIFEST_OWNER_MISMATCH")
    if manifest.get("physical_payload_included") is not False or manifest.get("canonical_effect_allowed") is not False:
        _fail("SEMANTIC_MANIFEST_AUTHORITY_VIOLATION")


def _expected_items(manifest: dict[str, Any]) -> list[dict[str, str]]:
    subject = manifest.get("subject") or {}
    items: list[dict[str, str]] = [
        {
            "role": "CANONICAL_STATE",
            "ref": _text(subject.get("canonical_state_ref"), "canonical_state_ref"),
            "digest": _digest(subject.get("canonical_digest"), "canonical_digest"),
        },
        {
            "role": "MANUSCRIPT",
            "ref": _text(subject.get("manuscript_ref"), "manuscript_ref"),
            "digest": _digest(subject.get("manuscript_digest"), "manuscript_digest"),
        },
    ]
    seen = {items[0]["ref"], items[1]["ref"]}
    for dep in manifest.get("dependencies") or []:
        ref = _text(dep.get("ref"), "dependency.ref")
        digest = _digest(dep.get("digest"), f"dependency.digest:{ref}")
        if ref in seen:
            _fail("DUPLICATE_PHYSICAL_REF", ref)
        seen.add(ref)
        items.append({"role": "DEPENDENCY", "ref": ref, "digest": digest})
    return items


def filesystem_resolver(source_root: str | os.PathLike[str]) -> Callable[[str], Path]:
    """Reference resolver for local test/host bindings.

    A production caller may inject a different CORE-owned resolver, but BOOK never
    receives the storage root and never performs direct storage access.
    """
    root = Path(source_root).resolve()

    def resolve(ref: str) -> Path:
        candidate_ref = Path(ref)
        normalized = ref.replace("\\", "/")
        if candidate_ref.is_absolute() or "://" in ref or normalized.startswith("../") or "/../" in normalized:
            _fail("UNSAFE_PHYSICAL_REF", ref)
        candidate = (root / candidate_ref).resolve()
        try:
            candidate.relative_to(root)
        except ValueError:
            _fail("PHYSICAL_REF_OUTSIDE_SOURCE_ROOT", ref)
        if not candidate.is_file():
            _fail("PHYSICAL_SOURCE_MISSING", ref)
        return candidate

    return resolve


def _fsync_dir(path: Path) -> None:
    flags = getattr(os, "O_DIRECTORY", 0) | os.O_RDONLY
    try:
        fd = os.open(path, flags)
    except OSError:
        return
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def _durable_copy(source: Path, destination: Path, expected_digest: str) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        if _sha256_file(destination) != expected_digest:
            _fail("ARCHIVE_OBJECT_DIGEST_MISMATCH", str(destination))
        return
    fd, temp_name = tempfile.mkstemp(prefix=".copy-", dir=str(destination.parent))
    temp_path = Path(temp_name)
    try:
        with os.fdopen(fd, "wb") as out_handle, source.open("rb") as in_handle:
            shutil.copyfileobj(in_handle, out_handle, 1024 * 1024)
            out_handle.flush()
            os.fsync(out_handle.fileno())
        if _sha256_file(temp_path) != expected_digest:
            _fail("ARCHIVE_COPY_VERIFICATION_FAILED", str(source))
        try:
            os.link(temp_path, destination)
        except FileExistsError:
            if _sha256_file(destination) != expected_digest:
                _fail("ARCHIVE_OBJECT_DIGEST_MISMATCH", str(destination))
        _fsync_dir(destination.parent)
    finally:
        temp_path.unlink(missing_ok=True)


def _write_once(path: Path, value: dict[str, Any], conflict_code: str) -> None:
    encoded = (_canonical(value) + "\n").encode("utf-8")
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        if path.read_bytes() != encoded:
            _fail(conflict_code, path.name)
        return
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
        _fsync_dir(path.parent)
    except Exception:
        path.unlink(missing_ok=True)
        raise


def _archive_set_dir(archive_root: str | os.PathLike[str], idempotency_key: str) -> Path:
    safe_key = _sha256_bytes(idempotency_key.encode("utf-8"))
    return Path(archive_root).resolve() / "sets" / safe_key


def _read_physical_manifest(path: Path) -> dict[str, Any]:
    if not path.is_file():
        _fail("PHYSICAL_MANIFEST_MISSING")
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        _fail("PHYSICAL_MANIFEST_UNREADABLE", str(error))
    supplied = _digest(manifest.get("physical_manifest_digest"), "physical_manifest_digest")
    body = dict(manifest)
    body.pop("physical_manifest_digest", None)
    if _sha256_json(body) != supplied:
        _fail("PHYSICAL_MANIFEST_TAMPERED")
    return manifest


def _durability_receipt(request: dict[str, Any], physical_manifest: dict[str, Any]) -> dict[str, Any]:
    digest = physical_manifest["physical_manifest_digest"]
    return {
        "receipt_schema_version": 1,
        "receipt_id": f"CORE-P03-DURABILITY-{digest[:24]}",
        "status": "DURABLE",
        "provider_system": PROVIDER_SYSTEM,
        "owner_path": OWNER_PATH,
        "operation_id": PRESERVE_OPERATION_ID,
        "request_id": request["request_id"],
        "semantic_manifest_digest": physical_manifest["semantic_manifest_digest"],
        "canonical_digest": physical_manifest["canonical_digest"],
        "physical_manifest_digest": digest,
        "restore_handle": f"sets/{_sha256_bytes(request['idempotency_key'].encode('utf-8'))}",
        "canonical_write_authority": False,
        "direct_book_state_write": False,
    }


def preserve_physical_set(
    request: dict[str, Any],
    semantic_manifest: dict[str, Any],
    resolver: Callable[[str], Path],
    archive_root: str | os.PathLike[str],
) -> dict[str, Any]:
    request_canonical_digest = _validate_request(request, "PRESERVE_PHYSICAL_SET")
    _verify_semantic_manifest(semantic_manifest)
    if request["semantic_manifest_digest"] != semantic_manifest["manifest_digest"]:
        _fail("REQUEST_MANIFEST_MISMATCH")
    if request_canonical_digest != semantic_manifest["subject"]["canonical_digest"]:
        _fail("REQUEST_CANONICAL_DIGEST_MISMATCH")

    set_dir = _archive_set_dir(archive_root, request["idempotency_key"])
    manifest_path = set_dir / PHYSICAL_MANIFEST_NAME

    if manifest_path.exists():
        existing = _read_physical_manifest(manifest_path)
        if existing.get("semantic_manifest_digest") != semantic_manifest["manifest_digest"] or existing.get("canonical_digest") != request_canonical_digest:
            _fail("IDEMPOTENCY_CONFLICT", request["idempotency_key"])
        return _durability_receipt(request, existing)

    objects_dir = set_dir / "objects"
    objects_dir.mkdir(parents=True, exist_ok=True)
    physical_items: list[dict[str, Any]] = []
    for item in _expected_items(semantic_manifest):
        source = Path(resolver(item["ref"]))
        actual = _sha256_file(source)
        if actual != item["digest"]:
            _fail("PHYSICAL_SOURCE_DIGEST_MISMATCH", item["ref"])
        object_relpath = f"objects/{item['digest']}"
        object_path = set_dir / object_relpath
        _durable_copy(source, object_path, item["digest"])
        physical_items.append({
            "role": item["role"],
            "ref": item["ref"],
            "content_digest": item["digest"],
            "size_bytes": object_path.stat().st_size,
            "object_relpath": object_relpath,
        })

    physical_manifest = {
        "schema_version": 1,
        "provider_system": PROVIDER_SYSTEM,
        "owner_path": OWNER_PATH,
        "semantic_manifest_digest": semantic_manifest["manifest_digest"],
        "canonical_digest": semantic_manifest["subject"]["canonical_digest"],
        "manuscript_digest": semantic_manifest["subject"]["manuscript_digest"],
        "retention_class": request.get("retention_class"),
        "offline_continuity_requirement": request.get("offline_continuity_requirement"),
        "items": physical_items,
    }
    physical_manifest["physical_manifest_digest"] = _sha256_json(physical_manifest)
    _write_once(manifest_path, physical_manifest, "IDEMPOTENCY_CONFLICT")
    admitted = _read_physical_manifest(manifest_path)
    if admitted["semantic_manifest_digest"] != semantic_manifest["manifest_digest"] or admitted["canonical_digest"] != request_canonical_digest:
        _fail("IDEMPOTENCY_CONFLICT", request["idempotency_key"])
    return _durability_receipt(request, admitted)


def _safe_restore_set(archive_root: Path, restore_handle: str) -> Path:
    handle = Path(_text(restore_handle, "restore_handle"))
    if handle.is_absolute() or ".." in handle.parts or handle.parts[:1] != ("sets",):
        _fail("INVALID_RESTORE_HANDLE")
    set_dir = (archive_root / handle).resolve()
    try:
        set_dir.relative_to(archive_root)
    except ValueError:
        _fail("RESTORE_HANDLE_OUTSIDE_ARCHIVE")
    return set_dir


def _safe_archive_object(set_dir: Path, relpath: str) -> Path:
    candidate = (set_dir / _text(relpath, "object_relpath")).resolve()
    try:
        candidate.relative_to(set_dir.resolve())
    except ValueError:
        _fail("ARCHIVE_OBJECT_OUTSIDE_SET", relpath)
    return candidate


def restore_physical_set(
    request: dict[str, Any],
    archive_root: str | os.PathLike[str],
    restore_parent: str | os.PathLike[str],
) -> dict[str, Any]:
    request_canonical_digest = _validate_request(request, "RESTORE_PHYSICAL_SET")
    if request.get("destructive_test_environment_required") is not True:
        _fail("DESTRUCTIVE_TEST_RESTORE_REQUIRED")

    archive = Path(archive_root).resolve()
    set_dir = _safe_restore_set(archive, request.get("restore_handle"))
    physical_manifest = _read_physical_manifest(set_dir / PHYSICAL_MANIFEST_NAME)
    supplied_digest = physical_manifest["physical_manifest_digest"]
    if supplied_digest != request.get("physical_manifest_digest"):
        _fail("RESTORE_PHYSICAL_MANIFEST_MISMATCH")
    if physical_manifest.get("semantic_manifest_digest") != request.get("semantic_manifest_digest"):
        _fail("RESTORE_SEMANTIC_MANIFEST_MISMATCH")
    if physical_manifest.get("canonical_digest") != request_canonical_digest:
        _fail("RESTORE_CANONICAL_DIGEST_MISMATCH")

    receipt_key = _sha256_bytes(request["idempotency_key"].encode("utf-8"))
    receipt_path = set_dir / "restore-receipts" / f"{receipt_key}.json"
    if receipt_path.exists():
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        if (
            receipt.get("request_id") != request["request_id"]
            or receipt.get("physical_manifest_digest") != supplied_digest
            or receipt.get("semantic_manifest_digest") != request["semantic_manifest_digest"]
        ):
            _fail("RESTORE_IDEMPOTENCY_CONFLICT", request["idempotency_key"])
        return receipt

    parent = Path(restore_parent).resolve()
    parent.mkdir(parents=True, exist_ok=True)
    target_name = f"book-p03-restore-test-{receipt_key[:20]}"
    target = parent / target_name
    target.mkdir(parents=True, exist_ok=True)
    seed = target / ".pre-restore-state"
    seed.write_text("provider-owned destructive restore seed\n", encoding="utf-8")
    with seed.open("rb") as handle:
        os.fsync(handle.fileno())
    shutil.rmtree(target)

    payload_dir = target / "payloads"
    payload_dir.mkdir(parents=True, exist_ok=True)
    dependency_digests: dict[str, str] = {}
    canonical_digest = None
    manuscript_digest = None
    for item in physical_manifest.get("items") or []:
        ref = _text(item.get("ref"), "physical_item.ref")
        digest = _digest(item.get("content_digest"), f"physical_item.digest:{ref}")
        source = _safe_archive_object(set_dir, item.get("object_relpath"))
        if not source.is_file() or _sha256_file(source) != digest:
            _fail("ARCHIVE_OBJECT_MISSING_OR_CORRUPT", ref)
        restored = payload_dir / digest
        _durable_copy(source, restored, digest)
        role = item.get("role")
        if role == "CANONICAL_STATE":
            canonical_digest = digest
        elif role == "MANUSCRIPT":
            manuscript_digest = digest
        elif role == "DEPENDENCY":
            dependency_digests[ref] = digest
        else:
            _fail("UNKNOWN_PHYSICAL_ITEM_ROLE", str(role))

    if canonical_digest is None or manuscript_digest is None:
        _fail("RESTORED_REQUIRED_SUBJECT_ITEM_MISSING")

    receipt = {
        "receipt_schema_version": 1,
        "receipt_id": f"CORE-P03-RESTORE-{receipt_key[:24]}",
        "status": "RESTORED",
        "provider_system": PROVIDER_SYSTEM,
        "owner_path": OWNER_PATH,
        "operation_id": RESTORE_OPERATION_ID,
        "request_id": request["request_id"],
        "semantic_manifest_digest": request["semantic_manifest_digest"],
        "physical_manifest_digest": supplied_digest,
        "restored_canonical_digest": canonical_digest,
        "restored_manuscript_digest": manuscript_digest,
        "reproduced_final_expression_digest": manuscript_digest,
        "restored_dependency_digests": dependency_digests,
        "destructive_restore_executed": True,
        "restore_test_target_ref": target_name,
        "canonical_write_authority": False,
        "direct_book_state_write": False,
    }
    _write_once(receipt_path, receipt, "RESTORE_IDEMPOTENCY_CONFLICT")
    return json.loads(receipt_path.read_text(encoding="utf-8"))
