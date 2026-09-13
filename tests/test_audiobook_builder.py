import json
import os
import struct
import subprocess
import sys
import tempfile
import unittest
import wave
from pathlib import Path

from tools.audiobook_builder import (
    BUILD_MANIFEST_NAME,
    PROJECT_SCHEMA,
    AudiobookBuildError,
    build,
    verify,
)


class AudiobookBuilderTests(unittest.TestCase):
    def _write_wav(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        sample_rate = 8000
        frames = 800
        with wave.open(str(path), "wb") as handle:
            handle.setnchannels(1)
            handle.setsampwidth(2)
            handle.setframerate(sample_rate)
            payload = bytearray()
            for index in range(frames):
                sample = ((index % 32) - 16) * 100
                payload.extend(struct.pack("<h", sample))
            handle.writeframes(bytes(payload))

    def _project(self, root: Path) -> Path:
        project = root / "project"
        (project / "chapters").mkdir(parents=True)
        (project / "audio").mkdir()
        (project / "chapters" / "01.txt").write_text("Chapter one narration source.\n", encoding="utf-8")
        self._write_wav(project / "audio" / "01.wav")
        manifest = {
            "schema_version": PROJECT_SCHEMA,
            "title": "Foundation Audiobook",
            "author": "System Master",
            "chapters": [{
                "id": "chapter-01",
                "title": "Opening",
                "transcript": "chapters/01.txt",
                "audio": "audio/01.wav",
            }],
        }
        (project / "audiobook.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        return project

    def test_repeat_build_is_byte_deterministic(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = self._project(root)
            first = build(project, root / "out-a")
            second = build(project, root / "out-b")
            self.assertEqual(first["artifact_sha256"], second["artifact_sha256"])
            self.assertEqual((root / "out-a" / BUILD_MANIFEST_NAME).read_bytes(), (root / "out-b" / BUILD_MANIFEST_NAME).read_bytes())

    def test_verify_detects_audio_tampering(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            out = root / "out"
            build(self._project(root), out)
            verify(out)
            target = out / "audio" / "01.wav"
            target.write_bytes(target.read_bytes() + b"tamper")
            with self.assertRaises(AudiobookBuildError):
                verify(out)

    def test_verify_detects_manifest_metadata_tampering(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            out = root / "out"
            build(self._project(root), out)
            manifest_path = out / BUILD_MANIFEST_NAME
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["title"] = "Tampered title"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(AudiobookBuildError, "title/author"):
                verify(out)

    def test_missing_narration_audio_fails_closed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = self._project(root)
            (project / "audio" / "01.wav").unlink()
            with self.assertRaisesRegex(AudiobookBuildError, "does not exist"):
                build(project, root / "out")

    def test_path_traversal_fails_closed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = self._project(root)
            manifest = json.loads((project / "audiobook.json").read_text(encoding="utf-8"))
            manifest["chapters"][0]["audio"] = "../outside.wav"
            (project / "audiobook.json").write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(AudiobookBuildError, "unsafe path"):
                build(project, root / "out")

    def test_source_symlink_fails_closed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = self._project(root)
            target = project / "audio" / "01.wav"
            alias = project / "audio" / "alias.wav"
            try:
                os.symlink(target, alias)
            except (OSError, NotImplementedError):
                self.skipTest("symlinks unavailable on this platform")
            manifest = json.loads((project / "audiobook.json").read_text(encoding="utf-8"))
            manifest["chapters"][0]["audio"] = "audio/alias.wav"
            (project / "audiobook.json").write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(AudiobookBuildError, "symlinks"):
                build(project, root / "out")

    def test_output_inside_source_fails_closed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = self._project(root)
            with self.assertRaisesRegex(AudiobookBuildError, "disjoint"):
                build(project, project / "dist")

    def test_existing_output_fails_closed_without_deletion(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = self._project(root)
            output = root / "out"
            output.mkdir()
            marker = output / "preserve.txt"
            marker.write_text("preserve", encoding="utf-8")
            with self.assertRaisesRegex(AudiobookBuildError, "already exists"):
                build(project, output)
            self.assertEqual(marker.read_text(encoding="utf-8"), "preserve")

    def test_unadmitted_audio_extension_fails_closed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = self._project(root)
            target = project / "audio" / "01.bin"
            target.write_bytes((project / "audio" / "01.wav").read_bytes())
            manifest = json.loads((project / "audiobook.json").read_text(encoding="utf-8"))
            manifest["chapters"][0]["audio"] = "audio/01.bin"
            (project / "audiobook.json").write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(AudiobookBuildError, "extension"):
                build(project, root / "out")

    def test_cli_has_no_synthesize_publish_or_stream_command(self):
        script = Path(__file__).resolve().parents[1] / "tools" / "audiobook_builder.py"
        for forbidden in ("synthesize", "publish", "stream", "upload", "deploy"):
            result = subprocess.run([sys.executable, str(script), forbidden], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("invalid choice", result.stderr)

    def test_manifest_denies_external_authority(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            out = root / "out"
            manifest = build(self._project(root), out)
            boundary = manifest["authority_boundary"]
            self.assertFalse(boundary["external_side_effects"])
            self.assertFalse(boundary["network_access"])
            self.assertEqual(boundary["speech_synthesis_authority"], "NOT_GRANTED")
            self.assertEqual(boundary["playback_authority"], "NOT_GRANTED")
            self.assertEqual(boundary["publication_authority"], "NOT_GRANTED")
            self.assertEqual(boundary["distribution_authority"], "NOT_GRANTED")
            self.assertEqual(boundary["production_promotion_authority"], "NOT_GRANTED")


if __name__ == "__main__":
    unittest.main()
