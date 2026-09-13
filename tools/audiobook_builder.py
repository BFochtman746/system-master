#!/usr/bin/env python3
"""Deterministic, side-effect-bounded audiobook package builder for C00.

Foundation 1.0 accepts caller-supplied narration audio plus transcript/source
metadata and assembles a deterministic local package. It performs no speech
synthesis, playback, streaming, network, credential, publication, provider, or
production-distribution operations.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import stat
import tempfile
from pathlib import Path, PurePosixPath

PROJECT_MANIFEST_NAME = "audiobook.json"
BUILD_MANIFEST_NAME = "audiobook-build-manifest.json"
PROJECT_SCHEMA = "AUDIOBOOK-PROJECT-1.0"
BUILD_SCHEMA = "AUDIOBOOK-BUILD-1.0"
CAPABILITY_ID = "C00"
OWNER = "SYSTEM_MASTER/MEDIA"
CONTRACT_ID = "AUDIOBOOK-FOUNDATION-1.0"
ALLOWED_AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".m4b", ".aac", ".flac", ".ogg"}


class AudiobookBuildError(RuntimeError):
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


def _assert_safe_roots(project_arg: Path, output_arg: Path) -> tuple[Path, Path]:
    if not project_arg.exists() or not project_arg.is_dir() or project_arg.is_symlink():
        raise AudiobookBuildError("project root must be an existing non-symlink directory")
    project = project_arg.resolve(strict=True)
    output = output_arg.resolve(strict=False)
    if project == output or _is_within(output, project) or _is_within(project, output):
        raise AudiobookBuildError("project and output directories must be disjoint")
    if output.exists():
        if output.is_symlink():
            raise AudiobookBuildError("output path may not be a symlink")
        raise AudiobookBuildError("output path already exists; refusing destructive replacement")
    return project, output


def _safe_relative(value: object, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise AudiobookBuildError(f"{field} must be a non-empty relative path")
    if "\\" in value:
        raise AudiobookBuildError(f"{field} must use POSIX-style relative paths")
    posix = PurePosixPath(value)
    if posix.is_absolute() or any(part in ("", ".", "..") for part in posix.parts):
        raise AudiobookBuildError(f"{field} contains an unsafe path")
    return posix.as_posix()


def _regular_source(project: Path, rel: str, field: str) -> Path:
    path = project / Path(rel)
    if not path.exists():
        raise AudiobookBuildError(f"{field} does not exist: {rel}")
    if path.is_symlink():
        raise AudiobookBuildError(f"symlinks are not allowed: {rel}")
    mode = path.stat(follow_symlinks=False).st_mode
    if not stat.S_ISREG(mode):
        raise AudiobookBuildError(f"{field} must reference a regular file: {rel}")
    resolved = path.resolve(strict=True)
    if not _is_within(resolved, project):
        raise AudiobookBuildError(f"{field} escapes project root: {rel}")
    return path


def _read_project(project: Path) -> tuple[dict[str, object], list[dict[str, object]], list[Path]]:
    manifest_path = project / PROJECT_MANIFEST_NAME
    if not manifest_path.exists() or not manifest_path.is_file() or manifest_path.is_symlink():
        raise AudiobookBuildError(f"missing project manifest: {PROJECT_MANIFEST_NAME}")
    try:
        config = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AudiobookBuildError(f"invalid project manifest: {exc}") from exc
    if config.get("schema_version") != PROJECT_SCHEMA:
        raise AudiobookBuildError(f"project schema_version must be {PROJECT_SCHEMA}")
    for field in ("title", "author"):
        if not isinstance(config.get(field), str) or not config[field].strip():
            raise AudiobookBuildError(f"project {field} must be a non-empty string")
    chapters = config.get("chapters")
    if not isinstance(chapters, list) or not chapters:
        raise AudiobookBuildError("project chapters must be a non-empty list")

    seen_ids: set[str] = set()
    seen_paths: set[str] = set()
    normalized: list[dict[str, object]] = []
    source_files: list[Path] = [manifest_path]
    for index, chapter in enumerate(chapters, start=1):
        if not isinstance(chapter, dict):
            raise AudiobookBuildError(f"chapter {index} must be an object")
        chapter_id = chapter.get("id")
        title = chapter.get("title")
        if not isinstance(chapter_id, str) or not chapter_id.strip():
            raise AudiobookBuildError(f"chapter {index} id must be a non-empty string")
        if chapter_id in seen_ids:
            raise AudiobookBuildError(f"duplicate chapter id: {chapter_id}")
        seen_ids.add(chapter_id)
        if not isinstance(title, str) or not title.strip():
            raise AudiobookBuildError(f"chapter {chapter_id} title must be a non-empty string")

        transcript_rel = _safe_relative(chapter.get("transcript"), f"chapter {chapter_id} transcript")
        audio_rel = _safe_relative(chapter.get("audio"), f"chapter {chapter_id} audio")
        if audio_rel.lower().endswith(BUILD_MANIFEST_NAME.lower()):
            raise AudiobookBuildError(f"chapter {chapter_id} audio collides with reserved build manifest")
        if Path(audio_rel).suffix.lower() not in ALLOWED_AUDIO_EXTENSIONS:
            raise AudiobookBuildError(f"chapter {chapter_id} audio extension is not admitted by Foundation 1.0")
        if transcript_rel in seen_paths or audio_rel in seen_paths or transcript_rel == audio_rel:
            raise AudiobookBuildError(f"chapter {chapter_id} reuses a source path")
        seen_paths.update((transcript_rel, audio_rel))

        transcript = _regular_source(project, transcript_rel, f"chapter {chapter_id} transcript")
        audio = _regular_source(project, audio_rel, f"chapter {chapter_id} audio")
        source_files.extend((transcript, audio))
        normalized.append({
            "sequence": index,
            "id": chapter_id,
            "title": title.strip(),
            "transcript": transcript_rel,
            "audio": audio_rel,
        })
    return config, normalized, source_files


def _entry(project: Path, path: Path, role: str, chapter_id: str | None = None) -> dict[str, object]:
    result: dict[str, object] = {
        "path": path.relative_to(project).as_posix(),
        "role": role,
        "size": path.stat().st_size,
        "sha256": _sha256_file(path),
    }
    if chapter_id is not None:
        result["chapter_id"] = chapter_id
    return result


def _artifact_digest(entries: list[dict[str, object]]) -> str:
    return _sha256_bytes(_canonical_json(entries))


def build(project_dir: str | os.PathLike[str], output_dir: str | os.PathLike[str]) -> dict[str, object]:
    project, output = _assert_safe_roots(Path(project_dir), Path(output_dir))
    config, chapters, _ = _read_project(project)

    entries: list[dict[str, object]] = []
    manifest_source = project / PROJECT_MANIFEST_NAME
    entries.append(_entry(project, manifest_source, "PROJECT_MANIFEST"))
    for chapter in chapters:
        entries.append(_entry(project, project / str(chapter["transcript"]), "TRANSCRIPT", str(chapter["id"])))
        entries.append(_entry(project, project / str(chapter["audio"]), "NARRATION_AUDIO", str(chapter["id"])))
    entries.sort(key=lambda item: str(item["path"]))
    source_sha256 = _artifact_digest(entries)

    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{output.name}.c00-", dir=output.parent))
    try:
        for item in entries:
            source = project / str(item["path"])
            target = staging / str(item["path"])
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(source.read_bytes())

        artifact_entries: list[dict[str, object]] = []
        for item in entries:
            target = staging / str(item["path"])
            copied = dict(item)
            copied["size"] = target.stat().st_size
            copied["sha256"] = _sha256_file(target)
            artifact_entries.append(copied)
        artifact_sha256 = _artifact_digest(artifact_entries)
        if artifact_entries != entries or artifact_sha256 != source_sha256:
            raise AudiobookBuildError("output bytes diverged from deterministic audiobook source package")

        manifest: dict[str, object] = {
            "schema_version": BUILD_SCHEMA,
            "contract_id": CONTRACT_ID,
            "capability_id": CAPABILITY_ID,
            "owner": OWNER,
            "build_mode": "DETERMINISTIC_LOCAL_AUDIOBOOK_PACKAGE",
            "title": str(config["title"]).strip(),
            "author": str(config["author"]).strip(),
            "chapter_count": len(chapters),
            "chapters": chapters,
            "file_count": len(artifact_entries),
            "source_sha256": source_sha256,
            "artifact_sha256": artifact_sha256,
            "files": artifact_entries,
            "authority_boundary": {
                "external_side_effects": False,
                "network_access": False,
                "speech_synthesis_authority": "NOT_GRANTED",
                "playback_authority": "NOT_GRANTED",
                "credentials_authority": "NOT_GRANTED",
                "publication_authority": "NOT_GRANTED",
                "distribution_authority": "NOT_GRANTED",
                "production_promotion_authority": "NOT_GRANTED",
            },
            "execution_boundary": {
                "narration_input": "CALLER_SUPPLIED_AUDIO_ONLY",
                "audio_transcoding": False,
                "codec_generation": False,
                "acoustic_quality_certification": False,
                "output": "LOCAL_FILESYSTEM_ARTIFACT_ONLY",
            },
        }
        (staging / BUILD_MANIFEST_NAME).write_bytes(_pretty_json(manifest))
        os.replace(staging, output)
        staging = None
        return manifest
    finally:
        if staging is not None and staging.exists():
            shutil.rmtree(staging, ignore_errors=True)


def verify(output_dir: str | os.PathLike[str]) -> dict[str, object]:
    output_arg = Path(output_dir)
    if not output_arg.exists() or not output_arg.is_dir() or output_arg.is_symlink():
        raise AudiobookBuildError("output directory is missing, not a directory, or a symlink")
    output = output_arg.resolve(strict=True)
    manifest_path = output / BUILD_MANIFEST_NAME
    if not manifest_path.exists() or not manifest_path.is_file() or manifest_path.is_symlink():
        raise AudiobookBuildError(f"missing deterministic manifest: {BUILD_MANIFEST_NAME}")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AudiobookBuildError(f"invalid build manifest: {exc}") from exc

    expected_identity = {
        "schema_version": BUILD_SCHEMA,
        "contract_id": CONTRACT_ID,
        "capability_id": CAPABILITY_ID,
        "owner": OWNER,
        "build_mode": "DETERMINISTIC_LOCAL_AUDIOBOOK_PACKAGE",
    }
    for key, expected in expected_identity.items():
        if manifest.get(key) != expected:
            raise AudiobookBuildError(f"manifest {key} mismatch")

    files = manifest.get("files")
    if not isinstance(files, list) or not files:
        raise AudiobookBuildError("manifest files must be a non-empty list")

    config, chapters, _ = _read_project(output)
    if manifest.get("title") != str(config["title"]).strip() or manifest.get("author") != str(config["author"]).strip():
        raise AudiobookBuildError("build manifest title/author diverge from packaged project manifest")
    if manifest.get("chapters") != chapters or manifest.get("chapter_count") != len(chapters):
        raise AudiobookBuildError("build manifest chapter metadata diverges from packaged project manifest")

    expected_entries: list[dict[str, object]] = [_entry(output, output / PROJECT_MANIFEST_NAME, "PROJECT_MANIFEST")]
    for chapter in chapters:
        expected_entries.append(_entry(output, output / str(chapter["transcript"]), "TRANSCRIPT", str(chapter["id"])))
        expected_entries.append(_entry(output, output / str(chapter["audio"]), "NARRATION_AUDIO", str(chapter["id"])))
    expected_entries.sort(key=lambda item: str(item["path"]))
    if files != expected_entries:
        raise AudiobookBuildError("artifact file sizes, roles, or hashes do not match packaged project")

    actual_paths: set[str] = set()
    for path in output.rglob("*"):
        rel = path.relative_to(output).as_posix()
        if path.is_symlink():
            raise AudiobookBuildError(f"symlinks are not allowed in built artifact: {rel}")
        if path.is_file() and rel != BUILD_MANIFEST_NAME:
            actual_paths.add(rel)
    expected_paths = {str(item["path"]) for item in expected_entries}
    if actual_paths != expected_paths:
        raise AudiobookBuildError("artifact file set does not match manifest")
    actual_entries = expected_entries
    digest = _artifact_digest(actual_entries)
    if digest != manifest.get("artifact_sha256") or digest != manifest.get("source_sha256"):
        raise AudiobookBuildError("artifact digest does not match manifest")
    if manifest.get("file_count") != len(actual_entries):
        raise AudiobookBuildError("manifest file_count mismatch")

    boundary = manifest.get("authority_boundary") or {}
    denied = (
        boundary.get("external_side_effects") is False
        and boundary.get("network_access") is False
        and boundary.get("speech_synthesis_authority") == "NOT_GRANTED"
        and boundary.get("playback_authority") == "NOT_GRANTED"
        and boundary.get("credentials_authority") == "NOT_GRANTED"
        and boundary.get("publication_authority") == "NOT_GRANTED"
        and boundary.get("distribution_authority") == "NOT_GRANTED"
        and boundary.get("production_promotion_authority") == "NOT_GRANTED"
    )
    if not denied:
        raise AudiobookBuildError("manifest attempts to grant authority outside C00 Foundation 1.0")
    execution = manifest.get("execution_boundary") or {}
    expected_execution = {
        "narration_input": "CALLER_SUPPLIED_AUDIO_ONLY",
        "audio_transcoding": False,
        "codec_generation": False,
        "acoustic_quality_certification": False,
        "output": "LOCAL_FILESYSTEM_ARTIFACT_ONLY",
    }
    if execution != expected_execution:
        raise AudiobookBuildError("manifest execution boundary mismatch")
    return manifest


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="C00 deterministic local audiobook package builder")
    sub = parser.add_subparsers(dest="command", required=True)
    build_parser = sub.add_parser("build", help="assemble caller-supplied audiobook assets into a local deterministic package")
    build_parser.add_argument("project")
    build_parser.add_argument("output")
    verify_parser = sub.add_parser("verify", help="verify a built local audiobook package")
    verify_parser.add_argument("output")
    return parser


def main() -> int:
    args = _parser().parse_args()
    try:
        result = build(args.project, args.output) if args.command == "build" else verify(args.output)
    except AudiobookBuildError as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, sort_keys=True))
        return 2
    print(json.dumps({
        "status": "PASS",
        "contract_id": result["contract_id"],
        "capability_id": result["capability_id"],
        "artifact_sha256": result["artifact_sha256"],
        "chapter_count": result["chapter_count"],
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
