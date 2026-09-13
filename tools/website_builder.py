#!/usr/bin/env python3
"""Deterministic, side-effect-bounded static website builder for C40.

This foundation intentionally performs no network, browser, credential, hosting,
DNS, publication, or provider operations. It packages a static website tree into
an output directory and emits a deterministic cryptographic manifest.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import stat
import tempfile
from pathlib import Path
from typing import Iterable

MANIFEST_NAME = "website-build-manifest.json"
SCHEMA_VERSION = "1.0"
CAPABILITY_ID = "C40"
OWNER = "SYSTEM_MASTER/PROGRAMMING"
CONTRACT_ID = "WEBSITE-BUILDING-FOUNDATION-1.0"


class WebsiteBuildError(RuntimeError):
    pass


def _canonical_json(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode("utf-8")


def _pretty_json(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _is_within(child: Path, parent: Path) -> bool:
    try:
        child.relative_to(parent)
        return True
    except ValueError:
        return False


def _assert_safe_root(project_arg: Path, output_arg: Path) -> tuple[Path, Path]:
    if not project_arg.exists() or not project_arg.is_dir():
        raise WebsiteBuildError(f"project directory does not exist: {project_arg}")
    if project_arg.is_symlink():
        raise WebsiteBuildError("project root may not be a symlink")

    project = project_arg.resolve(strict=True)
    output = output_arg.resolve(strict=False)
    if project == output or _is_within(output, project) or _is_within(project, output):
        raise WebsiteBuildError("project and output directories must be disjoint")
    if output.exists():
        if output.is_symlink():
            raise WebsiteBuildError("output path may not be a symlink")
        raise WebsiteBuildError("output path already exists; refusing destructive replacement")
    return project, output


def _walk_regular_files(project: Path, allow_manifest: bool = False) -> list[Path]:
    files: list[Path] = []
    for current, dirs, names in os.walk(project, topdown=True, followlinks=False):
        current_path = Path(current)
        for name in list(dirs):
            item = current_path / name
            if item.is_symlink():
                raise WebsiteBuildError(f"symlinks are not allowed: {item.relative_to(project).as_posix()}")
            mode = item.stat(follow_symlinks=False).st_mode
            if not stat.S_ISDIR(mode):
                raise WebsiteBuildError(f"non-directory entry in directory set: {item.relative_to(project).as_posix()}")
        for name in names:
            item = current_path / name
            rel = item.relative_to(project).as_posix()
            if item.is_symlink():
                raise WebsiteBuildError(f"symlinks are not allowed: {rel}")
            mode = item.stat(follow_symlinks=False).st_mode
            if not stat.S_ISREG(mode):
                raise WebsiteBuildError(f"only regular files are allowed: {rel}")
            if rel == MANIFEST_NAME and not allow_manifest:
                raise WebsiteBuildError(f"source may not contain reserved output file: {MANIFEST_NAME}")
            files.append(item)
    files.sort(key=lambda p: p.relative_to(project).as_posix())
    return files


def _file_entries(root: Path, files: Iterable[Path]) -> list[dict[str, object]]:
    entries: list[dict[str, object]] = []
    for path in files:
        rel = path.relative_to(root).as_posix()
        entries.append({
            "path": rel,
            "size": path.stat().st_size,
            "sha256": _sha256_file(path),
        })
    return entries


def _artifact_digest(entries: list[dict[str, object]]) -> str:
    return _sha256_bytes(_canonical_json(entries))


def build(project_dir: str | os.PathLike[str], output_dir: str | os.PathLike[str]) -> dict[str, object]:
    project, output = _assert_safe_root(Path(project_dir), Path(output_dir))
    files = _walk_regular_files(project)
    relative_paths = {p.relative_to(project).as_posix() for p in files}
    if "index.html" not in relative_paths:
        raise WebsiteBuildError("static foundation requires index.html at project root")

    source_entries = _file_entries(project, files)
    source_digest = _artifact_digest(source_entries)

    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{output.name}.c40-", dir=output.parent))
    try:
        for source in files:
            rel = source.relative_to(project)
            target = staging / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(source.read_bytes())

        artifact_files = _walk_regular_files(staging)
        artifact_entries = _file_entries(staging, artifact_files)
        artifact_sha256 = _artifact_digest(artifact_entries)
        if artifact_entries != source_entries or artifact_sha256 != source_digest:
            raise WebsiteBuildError("output bytes diverged from deterministic static source package")

        manifest: dict[str, object] = {
            "schema_version": SCHEMA_VERSION,
            "contract_id": CONTRACT_ID,
            "capability_id": CAPABILITY_ID,
            "owner": OWNER,
            "build_mode": "DETERMINISTIC_STATIC_PACKAGE",
            "entrypoint": "index.html",
            "file_count": len(artifact_entries),
            "source_sha256": source_digest,
            "artifact_sha256": artifact_sha256,
            "files": artifact_entries,
            "authority_boundary": {
                "external_side_effects": False,
                "network_access": False,
                "browser_action_authority": "NOT_GRANTED",
                "credentials_authority": "NOT_GRANTED",
                "publication_authority": "NOT_GRANTED",
                "production_deployment_authority": "NOT_GRANTED",
            },
            "preview_boundary": {
                "mode": "LOCAL_FILESYSTEM_ARTIFACT_ONLY",
                "browser_launch": False,
                "network_bind": False,
            },
        }
        (staging / MANIFEST_NAME).write_bytes(_pretty_json(manifest))

        os.replace(staging, output)
        staging = None
        return manifest
    finally:
        if staging is not None and staging.exists():
            shutil.rmtree(staging, ignore_errors=True)


def verify(output_dir: str | os.PathLike[str]) -> dict[str, object]:
    output_arg = Path(output_dir)
    if not output_arg.exists() or not output_arg.is_dir() or output_arg.is_symlink():
        raise WebsiteBuildError("output directory is missing, not a directory, or a symlink")
    output = output_arg.resolve(strict=True)
    manifest_path = output / MANIFEST_NAME
    if not manifest_path.exists() or not manifest_path.is_file() or manifest_path.is_symlink():
        raise WebsiteBuildError(f"missing deterministic manifest: {MANIFEST_NAME}")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise WebsiteBuildError(f"invalid manifest: {exc}") from exc

    expected_identity = {
        "schema_version": SCHEMA_VERSION,
        "contract_id": CONTRACT_ID,
        "capability_id": CAPABILITY_ID,
        "owner": OWNER,
        "build_mode": "DETERMINISTIC_STATIC_PACKAGE",
        "entrypoint": "index.html",
    }
    for key, expected in expected_identity.items():
        if manifest.get(key) != expected:
            raise WebsiteBuildError(f"manifest {key} mismatch")

    files = [p for p in _walk_regular_files(output, allow_manifest=True) if p.relative_to(output).as_posix() != MANIFEST_NAME]
    actual_entries = _file_entries(output, files)
    expected_entries = manifest.get("files")
    if actual_entries != expected_entries:
        raise WebsiteBuildError("artifact file set or hashes do not match manifest")
    digest = _artifact_digest(actual_entries)
    if digest != manifest.get("artifact_sha256") or digest != manifest.get("source_sha256"):
        raise WebsiteBuildError("artifact digest does not match manifest")
    if manifest.get("file_count") != len(actual_entries):
        raise WebsiteBuildError("manifest file_count mismatch")

    boundary = manifest.get("authority_boundary") or {}
    forbidden_grants = [
        boundary.get("external_side_effects") is not False,
        boundary.get("network_access") is not False,
        boundary.get("browser_action_authority") != "NOT_GRANTED",
        boundary.get("credentials_authority") != "NOT_GRANTED",
        boundary.get("publication_authority") != "NOT_GRANTED",
        boundary.get("production_deployment_authority") != "NOT_GRANTED",
    ]
    if any(forbidden_grants):
        raise WebsiteBuildError("manifest attempts to grant authority outside C40 foundation")
    return manifest


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="C40 deterministic static website builder")
    sub = parser.add_subparsers(dest="command", required=True)
    build_parser = sub.add_parser("build", help="build a deterministic local static artifact")
    build_parser.add_argument("project")
    build_parser.add_argument("output")
    verify_parser = sub.add_parser("verify", help="verify a built artifact against its manifest")
    verify_parser.add_argument("output")
    return parser


def main() -> int:
    args = _parser().parse_args()
    try:
        result = build(args.project, args.output) if args.command == "build" else verify(args.output)
    except WebsiteBuildError as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, sort_keys=True))
        return 2
    print(json.dumps({
        "status": "PASS",
        "contract_id": result["contract_id"],
        "capability_id": result["capability_id"],
        "artifact_sha256": result["artifact_sha256"],
        "file_count": result["file_count"],
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
