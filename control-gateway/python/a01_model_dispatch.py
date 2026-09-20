from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import signal
import subprocess
import tempfile
import time
import zipfile
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse
from urllib.request import Request, urlopen

MODEL_DISPATCH_PROTOCOL = "control-gateway.a01-model-dispatch.v1"
DEFAULT_LEMONADE_BASE_URL = "http://127.0.0.1:13305/api/v1"
DEFAULT_MODEL = "gpt-oss-20b-NPU"
PROVIDER_ID = "lemonade"
MAX_PROMPT_BYTES = 64 * 1024
MAX_CAPTURE_BYTES = 4 * 1024 * 1024
MAX_ALLOWED_PATHS = 64
MAX_ALLOWED_COMMANDS = 64
OPENCODE_VERSION = "v1.18.31"
OPENCODE_WINDOWS_X64_URL = "https://github.com/anomalyco/opencode/releases/download/v1.18.31/opencode-windows-x64.zip"
OPENCODE_WINDOWS_X64_ARCHIVE_SHA256 = "0ecd7ffc7f26390ce7799e7bcd409e4f11c410144308a6a5b0fcdce63d871006"
MAX_OPENCODE_ARCHIVE_BYTES = 70 * 1024 * 1024
MAX_OPENCODE_EXECUTABLE_BYTES = 192 * 1024 * 1024

_FORBIDDEN_PATH_PARTS = {".git", ".opencode"}
_FORBIDDEN_COMMAND_PATTERNS = (
    re.compile(r"(?:^|\s)git\s+(?:push|commit|merge|rebase|reset|clean|checkout|switch|worktree|fetch|pull|clone|tag)(?:\s|$)", re.I),
    re.compile(r"(?:^|\s)gh(?:\s|$)", re.I),
    re.compile(r"(?:^|\s)(?:curl|wget|scp|ssh|rsync)(?:\s|$)", re.I),
    re.compile(r"(?:^|\s)(?:invoke-webrequest|invoke-restmethod|start-bitstransfer)(?:\s|$)", re.I),
)
_CLOUD_ENV_PREFIXES = (
    "ANTHROPIC_", "OPENAI_", "AZURE_", "AWS_", "GOOGLE_", "GEMINI_",
    "OPENROUTER_", "GROQ_", "MISTRAL_", "COHERE_", "DEEPSEEK_",
    "TOGETHER_", "FIREWORKS_", "CEREBRAS_", "PERPLEXITY_",
)
_SECRET_ENV_MARKERS = ("TOKEN", "SECRET", "PASSWORD", "PRIVATE_KEY", "API_KEY", "CREDENTIAL")


class ModelDispatchError(RuntimeError):
    pass


class ModelDispatchFailed(ModelDispatchError):
    def __init__(self, message: str, details: Optional[dict[str, Any]] = None):
        super().__init__(message)
        self.details = details or {}


class DispatchAmbiguousError(ModelDispatchFailed):
    pass


def _is_sha(value: Any) -> bool:
    return isinstance(value, str) and len(value) == 40 and all(ch in "0123456789abcdefABCDEF" for ch in value)


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _validate_relative_path(value: Any) -> str:
    if not isinstance(value, str) or not value or len(value) > 512:
        raise ModelDispatchError("allowed path must be a non-empty bounded string")
    normalized = value.replace("\\", "/")
    if normalized.startswith("/") or re.match(r"^[A-Za-z]:/", normalized):
        raise ModelDispatchError("allowed paths must be repository-relative")
    parts = [p for p in normalized.split("/") if p not in ("", ".")]
    if not parts or ".." in parts:
        raise ModelDispatchError("allowed path cannot escape the repository")
    if any(p in _FORBIDDEN_PATH_PARTS for p in parts):
        raise ModelDispatchError("allowed path enters a protected control directory")
    if any(ch in normalized for ch in "*?[]{}"):
        raise ModelDispatchError("allowed paths must be exact files, not globs")
    return "/".join(parts)


def _validate_command(value: Any) -> str:
    if not isinstance(value, str) or not value or len(value) > 512:
        raise ModelDispatchError("allowed command must be a non-empty bounded string")
    if any(ch in value for ch in ("\n", "\r", "\x00")):
        raise ModelDispatchError("allowed command contains a forbidden control character")
    if any(pattern.search(value) for pattern in _FORBIDDEN_COMMAND_PATTERNS):
        raise ModelDispatchError("allowed command requests forbidden repository/network authority")
    return value


def validate_ai_coding_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ModelDispatchError("AI_CODING payload must be an object")
    expected = {
        "protocol_version",
        "workstream_id",
        "packet_id",
        "subject_sha",
        "prompt",
        "allowed_paths",
        "allowed_commands",
        "model",
        "base_url",
        "max_steps",
        "timeout_seconds",
        "evaluator_required",
    }
    if set(payload) != expected:
        raise ModelDispatchError("AI_CODING payload fields differ from frozen model-dispatch contract")
    if payload["protocol_version"] != MODEL_DISPATCH_PROTOCOL:
        raise ModelDispatchError("AI_CODING model-dispatch protocol mismatch")
    for field in ("workstream_id", "packet_id", "prompt"):
        if not isinstance(payload[field], str) or not payload[field].strip():
            raise ModelDispatchError(f"{field} must be a non-empty string")
    if len(payload["prompt"].encode("utf-8")) > MAX_PROMPT_BYTES:
        raise ModelDispatchError("AI_CODING prompt exceeds bounded size")
    if not _is_sha(payload["subject_sha"]):
        raise ModelDispatchError("AI_CODING subject_sha must be an exact 40-character Git SHA")
    if payload["model"] != DEFAULT_MODEL:
        raise ModelDispatchError("AI_CODING model differs from the frozen local model")
    if payload["base_url"] != DEFAULT_LEMONADE_BASE_URL:
        raise ModelDispatchError("AI_CODING endpoint differs from the frozen local Lemonade endpoint")
    parsed = urlparse(payload["base_url"])
    if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost"} or parsed.port != 13305:
        raise ModelDispatchError("AI_CODING endpoint must remain loopback-only on Lemonade port 13305")
    if payload["evaluator_required"] is not True:
        raise ModelDispatchError("AI_CODING requires independent evaluator acceptance")
    if type(payload["max_steps"]) is not int or not 1 <= payload["max_steps"] <= 64:
        raise ModelDispatchError("max_steps must be an integer in 1..64")
    if type(payload["timeout_seconds"]) is not int or not 30 <= payload["timeout_seconds"] <= 7200:
        raise ModelDispatchError("timeout_seconds must be an integer in 30..7200")

    paths = payload["allowed_paths"]
    if not isinstance(paths, list) or not 1 <= len(paths) <= MAX_ALLOWED_PATHS:
        raise ModelDispatchError("allowed_paths must contain 1..64 exact repository-relative files")
    normalized_paths = [_validate_relative_path(value) for value in paths]
    if len(set(normalized_paths)) != len(normalized_paths):
        raise ModelDispatchError("allowed_paths contains duplicates")

    commands = payload["allowed_commands"]
    if not isinstance(commands, list) or len(commands) > MAX_ALLOWED_COMMANDS:
        raise ModelDispatchError("allowed_commands must contain at most 64 exact commands")
    normalized_commands = [_validate_command(value) for value in commands]
    if len(set(normalized_commands)) != len(normalized_commands):
        raise ModelDispatchError("allowed_commands contains duplicates")

    normalized = dict(payload)
    normalized["subject_sha"] = payload["subject_sha"].lower()
    normalized["allowed_paths"] = normalized_paths
    normalized["allowed_commands"] = normalized_commands
    return normalized


def build_opencode_config(payload: dict[str, Any]) -> dict[str, Any]:
    payload = validate_ai_coding_payload(payload)
    edit_permissions: dict[str, str] = {"*": "deny"}
    for path in payload["allowed_paths"]:
        edit_permissions[path] = "allow"
    bash_permissions: dict[str, str] = {"*": "deny"}
    for command in payload["allowed_commands"]:
        bash_permissions[command] = "allow"
    # Use the V1-compatible shape intentionally. OpenCode V2 documents that it
    # reads and normalizes supported V1 configuration, keeping this packet usable
    # across the controlled A-01 migration boundary.
    return {
        "$schema": "https://opencode.ai/config.json",
        "model": f"{PROVIDER_ID}/{payload['model']}",
        "autoupdate": False,
        "provider": {
            PROVIDER_ID: {
                "npm": "@ai-sdk/openai-compatible",
                "name": "Lemonade Local",
                "options": {"baseURL": payload["base_url"]},
                "models": {payload["model"]: {"name": payload["model"]}},
            }
        },
        "share": "disabled",
        "permission": {
            "*": "deny",
            "read": {"*": "allow", "*.env": "deny", "*.env.*": "deny"},
            "glob": "allow",
            "grep": "allow",
            "edit": edit_permissions,
            "bash": bash_permissions,
            "webfetch": "deny",
            "websearch": "deny",
            "task": "deny",
            "external_directory": "deny",
            "question": "deny",
            "skill": "deny",
        },
        "plugin": [],
    }


def _run_git(root: Path, *args: str, timeout: int = 60) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(
        ["git", "-C", str(root), *args],
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        timeout=timeout,
        check=False,
    )
    if proc.returncode != 0:
        raise ModelDispatchFailed(
            f"git {' '.join(args)} failed",
            {"returncode": proc.returncode, "stdout": proc.stdout[-4000:], "stderr": proc.stderr[-4000:]},
        )
    return proc


def _terminate_process_tree(proc: subprocess.Popen[str]) -> None:
    if proc.poll() is not None:
        return
    try:
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
                timeout=15,
            )
        else:
            os.killpg(proc.pid, signal.SIGTERM)
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError, subprocess.SubprocessError):
        try:
            proc.kill()
        except ProcessLookupError:
            pass


def _changed_paths(worktree: Path) -> list[str]:
    # Intent-to-add makes untracked files visible to diff without staging their content.
    subprocess.run(
        ["git", "-C", str(worktree), "add", "-N", "--all"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    proc = _run_git(worktree, "diff", "--name-only", "--relative", "HEAD")
    return sorted({line.strip().replace("\\", "/") for line in proc.stdout.splitlines() if line.strip()})


def _write_evidence(path: Path, data: str | bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(data, bytes):
        path.write_bytes(data)
    else:
        path.write_text(data, encoding="utf-8")


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _bootstrap_pinned_opencode(
    evidence_dir: Path,
    *,
    cache_root: Optional[Path] = None,
    archive_url: str = OPENCODE_WINDOWS_X64_URL,
    expected_sha256: str = OPENCODE_WINDOWS_X64_ARCHIVE_SHA256,
) -> str:
    cache_root = cache_root or (
        Path(os.environ.get("RUNNER_TEMP") or tempfile.gettempdir())
        / "system-master-tools"
        / "opencode"
        / OPENCODE_VERSION
    )
    cache_root.mkdir(parents=True, exist_ok=True)
    archive = cache_root / "opencode-windows-x64.zip"
    part = cache_root / "opencode-windows-x64.zip.part"
    executable = cache_root / "opencode.exe"
    try:
        archive_ok = archive.is_file() and _sha256_file(archive) == expected_sha256
        if not archive_ok:
            archive.unlink(missing_ok=True)
            part.unlink(missing_ok=True)
            request = Request(
                archive_url,
                headers={"User-Agent": "system-master-a01-opencode-bootstrap/1"},
            )
            digest = hashlib.sha256()
            total = 0
            with urlopen(request, timeout=60) as response, part.open("wb") as handle:
                declared = response.headers.get("Content-Length")
                if declared and int(declared) > MAX_OPENCODE_ARCHIVE_BYTES:
                    raise ModelDispatchFailed("Pinned OpenCode archive exceeds bounded download size")
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > MAX_OPENCODE_ARCHIVE_BYTES:
                        raise ModelDispatchFailed("Pinned OpenCode archive exceeds bounded download size")
                    digest.update(chunk)
                    handle.write(chunk)
            actual = digest.hexdigest()
            if actual != expected_sha256:
                raise ModelDispatchFailed(
                    "Pinned OpenCode archive digest mismatch",
                    {"expected_sha256": expected_sha256, "actual_sha256": actual},
                )
            part.replace(archive)

        actual = _sha256_file(archive)
        if actual != expected_sha256:
            raise ModelDispatchFailed(
                "Pinned OpenCode cache digest mismatch",
                {"expected_sha256": expected_sha256, "actual_sha256": actual},
            )

        with zipfile.ZipFile(archive) as bundle:
            candidates = []
            for info in bundle.infolist():
                normalized = info.filename.replace("\\", "/")
                if info.is_dir():
                    continue
                if normalized.startswith("/") or re.match(r"^[A-Za-z]:", normalized):
                    raise ModelDispatchFailed("Pinned OpenCode archive contains an unsafe path")
                if ".." in normalized.split("/"):
                    raise ModelDispatchFailed("Pinned OpenCode archive contains a traversal path")
                if normalized.rsplit("/", 1)[-1].lower() == "opencode.exe":
                    candidates.append(info)
            if len(candidates) != 1:
                raise ModelDispatchFailed(
                    "Pinned OpenCode archive does not contain exactly one opencode.exe",
                    {"candidate_count": len(candidates)},
                )
            info = candidates[0]
            if info.file_size > MAX_OPENCODE_EXECUTABLE_BYTES:
                raise ModelDispatchFailed("Pinned OpenCode executable exceeds bounded size")
            with bundle.open(info) as source, executable.open("wb") as target:
                shutil.copyfileobj(source, target, length=1024 * 1024)

        evidence = {
            "protocol_version": "control-gateway.a01-opencode-bootstrap.v1",
            "version": OPENCODE_VERSION,
            "archive_url": archive_url,
            "archive_sha256": expected_sha256,
            "executable_sha256": _sha256_file(executable),
            "cache_scope": "runner_temp",
        }
        _write_evidence(
            evidence_dir / "opencode-bootstrap.json",
            _canonical(evidence) + "\n",
        )
        return str(executable)
    except ModelDispatchFailed:
        part.unlink(missing_ok=True)
        raise
    except Exception as exc:
        part.unlink(missing_ok=True)
        raise ModelDispatchFailed(
            "Pinned OpenCode bootstrap failed",
            {"bootstrap_error": f"{type(exc).__name__}: {exc}"},
        ) from exc


def _resolve_opencode(evidence_dir: Path, explicit: Optional[str] = None) -> str:
    if explicit:
        return explicit
    existing = shutil.which("opencode") or shutil.which("opencode.exe")
    if existing:
        return existing
    if os.name != "nt":
        raise ModelDispatchFailed("OpenCode executable is not installed or not on PATH")
    return _bootstrap_pinned_opencode(evidence_dir)


def _sanitized_environment(config_json: str) -> dict[str, str]:
    env = os.environ.copy()
    for key in list(env):
        upper = key.upper()
        if any(upper.startswith(prefix) for prefix in _CLOUD_ENV_PREFIXES) or any(marker in upper for marker in _SECRET_ENV_MARKERS):
            env.pop(key, None)
    env["OPENCODE_CONFIG_CONTENT"] = config_json
    env["OPENCODE_DISABLE_AUTOUPDATE"] = "true"
    env["OPENCODE_DISABLE_PRUNE"] = "true"
    env["NO_PROXY"] = "127.0.0.1,localhost"
    env["no_proxy"] = "127.0.0.1,localhost"
    return env


def dispatch_ai_coding(
    payload: dict[str, Any],
    context: Any,
    *,
    root: Path,
    opencode_executable: Optional[str] = None,
) -> dict[str, Any]:
    payload = validate_ai_coding_payload(payload)
    root = root.resolve()
    evidence_dir = Path(context.evidence_dir).resolve()
    evidence_dir.mkdir(parents=True, exist_ok=True)

    resolved = _run_git(root, "rev-parse", "--verify", f"{payload['subject_sha']}^{{commit}}").stdout.strip().lower()
    if resolved != payload["subject_sha"]:
        raise ModelDispatchFailed("AI_CODING exact subject is not the requested commit")

    opencode = _resolve_opencode(evidence_dir, opencode_executable)

    config = build_opencode_config(payload)
    config_json = _canonical(config)
    _write_evidence(evidence_dir / "model-dispatch-request.json", _canonical(payload) + "\n")
    _write_evidence(evidence_dir / "opencode-config.sha256", _sha256_bytes(config_json.encode("utf-8")) + "\n")

    worktree_parent = Path(tempfile.mkdtemp(prefix="a01-model-dispatch-", dir=str(evidence_dir)))
    worktree = worktree_parent / "worktree"
    added = False
    proc: Optional[subprocess.Popen[str]] = None
    started = time.monotonic()
    stdout = ""
    stderr = ""
    preserve_worktree = False
    try:
        _run_git(root, "worktree", "add", "--detach", str(worktree), payload["subject_sha"], timeout=120)
        added = True
        head = _run_git(worktree, "rev-parse", "HEAD").stdout.strip().lower()
        if head != payload["subject_sha"]:
            raise ModelDispatchFailed("detached AI_CODING worktree resolved to the wrong subject")

        env = _sanitized_environment(config_json)

        command = [
            opencode,
            "--pure",
            "run",
            "--model",
            f"{PROVIDER_ID}/{payload['model']}",
            "--format",
            "json",
            payload["prompt"],
        ]
        popen_kwargs: dict[str, Any] = {
            "cwd": str(worktree),
            "env": env,
            "text": True,
            "encoding": "utf-8",
            "errors": "replace",
            "stdout": subprocess.PIPE,
            "stderr": subprocess.PIPE,
        }
        if os.name == "nt":
            popen_kwargs["creationflags"] = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        else:
            popen_kwargs["start_new_session"] = True
        proc = subprocess.Popen(command, **popen_kwargs)

        renew_interval = max(1, min(30, int(getattr(getattr(context, "worker", None), "renew_seconds", 30))))
        deadline = started + payload["timeout_seconds"]
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                _terminate_process_tree(proc)
                changed = _changed_paths(worktree)
                reconciliation = {
                    "protocol_version": MODEL_DISPATCH_PROTOCOL,
                    "status": "RECONCILIATION_REQUIRED",
                    "workstream_id": payload["workstream_id"],
                    "packet_id": payload["packet_id"],
                    "subject_sha": payload["subject_sha"],
                    "worktree": str(worktree),
                    "changed_paths": changed,
                    "reason": "OPENCODE_TIMEOUT_AFTER_POSSIBLE_MUTATION",
                }
                evidence_path = evidence_dir / "model-dispatch-reconciliation.json"
                _write_evidence(evidence_path, _canonical(reconciliation) + "\n")
                raise DispatchAmbiguousError(
                    "OpenCode AI_CODING dispatch exceeded timeout after possible mutation; reconcile before retry",
                    {"worktree": str(worktree), "evidence_path": str(evidence_path), "changed_paths": changed},
                )
            try:
                stdout, stderr = proc.communicate(timeout=min(renew_interval, remaining))
                break
            except subprocess.TimeoutExpired:
                context.renew(checkpoint_pointer=f"model-dispatch:{payload['packet_id']}:running")

        if len(stdout.encode("utf-8", errors="replace")) > MAX_CAPTURE_BYTES:
            raise ModelDispatchFailed("OpenCode stdout exceeded evidence capture limit")
        if len(stderr.encode("utf-8", errors="replace")) > MAX_CAPTURE_BYTES:
            raise ModelDispatchFailed("OpenCode stderr exceeded evidence capture limit")
        _write_evidence(evidence_dir / "opencode.stdout.ndjson", stdout)
        _write_evidence(evidence_dir / "opencode.stderr.log", stderr)
        if proc.returncode != 0:
            raise ModelDispatchFailed(
                "OpenCode AI_CODING run failed",
                {"returncode": proc.returncode, "stdout_tail": stdout[-4000:], "stderr_tail": stderr[-4000:]},
            )

        changed = _changed_paths(worktree)
        unauthorized = sorted(set(changed) - set(payload["allowed_paths"]))
        if unauthorized:
            raise ModelDispatchFailed("OpenCode changed paths outside admitted surface", {"unauthorized_paths": unauthorized})
        if not changed:
            raise ModelDispatchFailed("OpenCode produced no admitted file delta")

        patch = _run_git(worktree, "diff", "--binary", "--no-ext-diff", "HEAD", "--", *changed, timeout=120).stdout
        patch_bytes = patch.encode("utf-8")
        _write_evidence(evidence_dir / "candidate.patch", patch_bytes)
        result = {
            "protocol_version": MODEL_DISPATCH_PROTOCOL,
            "status": "CANDIDATE_READY_FOR_INDEPENDENT_EVALUATION",
            "workstream_id": payload["workstream_id"],
            "packet_id": payload["packet_id"],
            "subject_sha": payload["subject_sha"],
            "model": payload["model"],
            "base_url": payload["base_url"],
            "changed_paths": changed,
            "patch_sha256": _sha256_bytes(patch_bytes),
            "evaluator_required": True,
            "elapsed_seconds": round(time.monotonic() - started, 3),
        }
        _write_evidence(evidence_dir / "model-dispatch-result.json", _canonical(result) + "\n")
        return result
    except DispatchAmbiguousError:
        preserve_worktree = True
        raise
    finally:
        if proc is not None and proc.poll() is None:
            _terminate_process_tree(proc)
        if added and not preserve_worktree:
            subprocess.run(
                ["git", "-C", str(root), "worktree", "remove", "--force", str(worktree)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
                timeout=120,
            )
        if not preserve_worktree:
            shutil.rmtree(worktree_parent, ignore_errors=True)
