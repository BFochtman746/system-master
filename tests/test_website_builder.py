import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.website_builder import MANIFEST_NAME, WebsiteBuildError, build, verify


class WebsiteBuilderTests(unittest.TestCase):
    def _project(self, root: Path) -> Path:
        project = root / "project"
        project.mkdir()
        (project / "index.html").write_text("<!doctype html><title>x</title>\n", encoding="utf-8")
        (project / "assets").mkdir()
        (project / "assets" / "app.js").write_bytes(b"console.log('x');\n")
        return project

    def test_repeat_build_is_byte_deterministic(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = self._project(root)
            out_a, out_b = root / "out-a", root / "out-b"
            first = build(project, out_a)
            second = build(project, out_b)
            self.assertEqual(first["artifact_sha256"], second["artifact_sha256"])
            self.assertEqual((out_a / MANIFEST_NAME).read_bytes(), (out_b / MANIFEST_NAME).read_bytes())
            self.assertEqual((out_a / "assets" / "app.js").read_bytes(), (out_b / "assets" / "app.js").read_bytes())

    def test_verify_detects_tampering(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            out = root / "out"
            build(self._project(root), out)
            verify(out)
            (out / "index.html").write_text("tampered", encoding="utf-8")
            with self.assertRaises(WebsiteBuildError):
                verify(out)

    def test_missing_entrypoint_fails_closed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = root / "project"
            project.mkdir()
            (project / "app.js").write_text("x", encoding="utf-8")
            with self.assertRaisesRegex(WebsiteBuildError, "index.html"):
                build(project, root / "out")

    def test_source_symlink_fails_closed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = self._project(root)
            try:
                os.symlink(project / "index.html", project / "alias.html")
            except (OSError, NotImplementedError):
                self.skipTest("symlinks unavailable on this platform")
            with self.assertRaisesRegex(WebsiteBuildError, "symlinks"):
                build(project, root / "out")

    def test_output_inside_source_fails_closed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = self._project(root)
            with self.assertRaisesRegex(WebsiteBuildError, "disjoint"):
                build(project, project / "dist")

    def test_existing_output_fails_closed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            project = self._project(root)
            output = root / "out"
            output.mkdir()
            marker = output / "do-not-delete.txt"
            marker.write_text("preserve", encoding="utf-8")
            with self.assertRaisesRegex(WebsiteBuildError, "already exists"):
                build(project, output)
            self.assertEqual(marker.read_text(encoding="utf-8"), "preserve")

    def test_output_ancestor_of_source_fails_closed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            container = root / "container"
            project = self._project(container) if container.mkdir() is None else None
            with self.assertRaisesRegex(WebsiteBuildError, "disjoint"):
                build(project, container)

    def test_cli_has_no_deploy_command(self):
        script = Path(__file__).resolve().parents[1] / "tools" / "website_builder.py"
        result = subprocess.run([sys.executable, str(script), "deploy"], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("invalid choice", result.stderr)

    def test_manifest_denies_external_authority(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            out = root / "out"
            build(self._project(root), out)
            manifest = json.loads((out / MANIFEST_NAME).read_text(encoding="utf-8"))
            boundary = manifest["authority_boundary"]
            self.assertFalse(boundary["external_side_effects"])
            self.assertFalse(boundary["network_access"])
            self.assertEqual(boundary["publication_authority"], "NOT_GRANTED")
            self.assertEqual(boundary["production_deployment_authority"], "NOT_GRANTED")


if __name__ == "__main__":
    unittest.main()
