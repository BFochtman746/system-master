from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
PYROOT = ROOT / "control-gateway" / "python"
if str(PYROOT) not in sys.path:
    sys.path.insert(0, str(PYROOT))

from a01_model_dispatch import (
    DEFAULT_LEMONADE_BASE_URL,
    DEFAULT_MODEL,
    MODEL_DISPATCH_PROTOCOL,
    MAX_OPENCODE_EXECUTABLE_BYTES,
    OPENCODE_VERSION,
    OPENCODE_WINDOWS_X64_ARCHIVE_SHA256,
    OPENCODE_WINDOWS_X64_URL,
    DispatchAmbiguousError,
    ModelDispatchError,
    ModelDispatchFailed,
    _bootstrap_pinned_opencode,
    _sanitized_environment,
    build_opencode_config,
    dispatch_ai_coding,
    validate_ai_coding_payload,
)


def git(root: Path, *args: str) -> str:
    proc = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True, check=True)
    return proc.stdout.strip()


class FakeWorker:
    renew_seconds = 1


class FakeContext:
    def __init__(self, evidence_dir: Path):
        self._evidence_dir = evidence_dir
        self.worker = FakeWorker()
        self.renewals = []

    @property
    def evidence_dir(self) -> Path:
        return self._evidence_dir

    def renew(self, checkpoint_pointer=None, now=None):
        self.renewals.append(checkpoint_pointer)
        return "ok"


def payload(subject_sha: str) -> dict:
    return {
        "protocol_version": MODEL_DISPATCH_PROTOCOL,
        "workstream_id": "TEST-WORKSTREAM",
        "packet_id": "TEST-PACKET-001",
        "subject_sha": subject_sha,
        "prompt": "Edit allowed.txt only.",
        "allowed_paths": ["allowed.txt"],
        "allowed_commands": ["python -m unittest"],
        "model": DEFAULT_MODEL,
        "base_url": DEFAULT_LEMONADE_BASE_URL,
        "max_steps": 8,
        "timeout_seconds": 60,
        "evaluator_required": True,
    }


class ModelDispatchTests(unittest.TestCase):
    def test_payload_rejects_remote_endpoint_and_forbidden_command(self):
        p = payload("a" * 40)
        p["base_url"] = "https://example.com/v1"
        with self.assertRaises(ModelDispatchError):
            validate_ai_coding_payload(p)
        p = payload("a" * 40)
        p["allowed_commands"] = ["git push origin HEAD"]
        with self.assertRaises(ModelDispatchError):
            validate_ai_coding_payload(p)

    def test_config_is_local_and_deny_by_default(self):
        self.assertEqual(DEFAULT_MODEL, "gpt-oss-20b-NPU")
        config = build_opencode_config(payload("a" * 40))
        self.assertEqual(config["provider"]["lemonade"]["options"]["baseURL"], DEFAULT_LEMONADE_BASE_URL)
        self.assertEqual(config["permission"]["*"], "deny")
        self.assertEqual(config["permission"]["read"]["*.env"], "deny")
        self.assertEqual(config["permission"]["edit"]["*"], "deny")
        self.assertEqual(config["permission"]["edit"]["allowed.txt"], "allow")
        self.assertEqual(config["permission"]["bash"]["*"], "deny")
        self.assertEqual(config["permission"]["webfetch"], "deny")
        self.assertEqual(config["permission"]["websearch"], "deny")

    def _repo(self, base: Path) -> tuple[Path, str]:
        repo = base / "repo"
        repo.mkdir()
        git(repo, "init")
        git(repo, "config", "user.email", "test@example.com")
        git(repo, "config", "user.name", "Test")
        (repo / "allowed.txt").write_text("before\n", encoding="utf-8")
        (repo / "forbidden.txt").write_text("stable\n", encoding="utf-8")
        git(repo, "add", ".")
        git(repo, "commit", "-m", "base")
        return repo, git(repo, "rev-parse", "HEAD")

    def _fake_opencode(self, base: Path, *, unauthorized: bool = False) -> Path:
        script = base / ("fake-opencode.py")
        target = "forbidden.txt" if unauthorized else "allowed.txt"
        script.write_text(
            "#!/usr/bin/env python3\n"
            "from pathlib import Path\n"
            "import json, os\n"
            f"Path({target!r}).write_text('after\\n', encoding='utf-8')\n"
            "cfg=json.loads(os.environ['OPENCODE_CONFIG_CONTENT'])\n"
            "print(json.dumps({'type':'result','model':cfg['model']}))\n",
            encoding="utf-8",
        )
        if os.name != "nt":
            script.chmod(0o755)
            return script
        wrapper = base / "fake-opencode.cmd"
        wrapper.write_text(f'@"{sys.executable}" "{script}" %*\r\n', encoding="utf-8")
        return wrapper

    def test_dispatch_emits_patch_from_exact_detached_subject(self):
        with tempfile.TemporaryDirectory() as td:
            base = Path(td)
            repo, sha = self._repo(base)
            ctx = FakeContext(base / "evidence")
            fake = self._fake_opencode(base)
            result = dispatch_ai_coding(payload(sha), ctx, root=repo, opencode_executable=str(fake))
            self.assertEqual(result["status"], "CANDIDATE_READY_FOR_INDEPENDENT_EVALUATION")
            self.assertEqual(result["subject_sha"], sha)
            self.assertEqual(result["changed_paths"], ["allowed.txt"])
            self.assertEqual((repo / "allowed.txt").read_text(encoding="utf-8"), "before\n")
            patch = (ctx.evidence_dir / "candidate.patch").read_text(encoding="utf-8")
            self.assertIn("+after", patch)
            self.assertTrue((ctx.evidence_dir / "model-dispatch-result.json").is_file())

    def test_dispatch_rejects_unauthorized_changed_path(self):
        with tempfile.TemporaryDirectory() as td:
            base = Path(td)
            repo, sha = self._repo(base)
            ctx = FakeContext(base / "evidence")
            fake = self._fake_opencode(base, unauthorized=True)
            with self.assertRaises(ModelDispatchFailed) as caught:
                dispatch_ai_coding(payload(sha), ctx, root=repo, opencode_executable=str(fake))
            self.assertIn("outside admitted surface", str(caught.exception))
            self.assertEqual((repo / "forbidden.txt").read_text(encoding="utf-8"), "stable\n")

    def test_pinned_opencode_bootstrap_verifies_archive_before_extraction(self):
        with tempfile.TemporaryDirectory() as td:
            base = Path(td)
            source = base / "source.zip"
            with zipfile.ZipFile(source, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
                bundle.writestr("nested/opencode.exe", b"MZ-fake-opencode")
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            evidence_dir = base / "evidence"
            executable = Path(
                _bootstrap_pinned_opencode(
                    evidence_dir,
                    cache_root=base / "cache",
                    archive_url=source.as_uri(),
                    expected_sha256=digest,
                )
            )
            self.assertEqual(executable.read_bytes(), b"MZ-fake-opencode")
            receipt = json.loads((evidence_dir / "opencode-bootstrap.json").read_text(encoding="utf-8"))
            self.assertEqual(receipt["archive_sha256"], digest)
            self.assertEqual(receipt["cache_scope"], "runner_temp")
            self.assertEqual(OPENCODE_VERSION, "v1.18.31")
            self.assertEqual(MAX_OPENCODE_EXECUTABLE_BYTES, 192 * 1024 * 1024)
            self.assertGreater(MAX_OPENCODE_EXECUTABLE_BYTES, 179_998_248)
            self.assertTrue(OPENCODE_WINDOWS_X64_URL.endswith("/v1.18.31/opencode-windows-x64.zip"))
            self.assertEqual(
                OPENCODE_WINDOWS_X64_ARCHIVE_SHA256,
                "0ecd7ffc7f26390ce7799e7bcd409e4f11c410144308a6a5b0fcdce63d871006",
            )

    def test_transport_and_secret_boundaries_are_fail_closed(self):
        p = payload("a" * 40)
        for command in ("git fetch origin", "git pull", "git clone x", "gh pr merge 1", "Invoke-RestMethod http://x"):
            q = dict(p)
            q["allowed_commands"] = [command]
            with self.assertRaises(ModelDispatchError):
                validate_ai_coding_payload(q)
        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": "x", "MY_PRIVATE_KEY": "y", "SAFE_VALUE": "z"}, clear=True):
            env = _sanitized_environment("{}")
        self.assertNotIn("OPENAI_API_KEY", env)
        self.assertNotIn("MY_PRIVATE_KEY", env)
        self.assertEqual(env["SAFE_VALUE"], "z")
        self.assertEqual(env["NO_PROXY"], "127.0.0.1,localhost")

    def test_timeout_preserves_worktree_and_reconciliation_evidence(self):
        with tempfile.TemporaryDirectory() as td:
            base = Path(td)
            repo, sha = self._repo(base)
            ctx = FakeContext(base / "evidence")

            class FakeProc:
                returncode = None
                def poll(self):
                    return None

            fake_proc = FakeProc()
            real_popen = subprocess.Popen
            def popen_side_effect(args, *a, **kw):
                if isinstance(args, list) and args and args[0] == "fake-opencode":
                    return fake_proc
                return real_popen(args, *a, **kw)
            with mock.patch("a01_model_dispatch.subprocess.Popen", side_effect=popen_side_effect), \
                 mock.patch("a01_model_dispatch._terminate_process_tree"), \
                 mock.patch("a01_model_dispatch.time.monotonic", side_effect=[0.0, 61.0]):
                with self.assertRaises(DispatchAmbiguousError) as caught:
                    dispatch_ai_coding(payload(sha), ctx, root=repo, opencode_executable="fake-opencode")
            evidence_path = ctx.evidence_dir / "model-dispatch-reconciliation.json"
            self.assertTrue(evidence_path.is_file())
            evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
            self.assertEqual(evidence["status"], "RECONCILIATION_REQUIRED")
            worktree = Path(caught.exception.details["worktree"])
            self.assertTrue(worktree.exists())
            subprocess.run(["git", "-C", str(repo), "worktree", "remove", "--force", str(worktree)], check=False, capture_output=True)
            parent = worktree.parent
            if parent.exists():
                import shutil
                shutil.rmtree(parent, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
