"""Tests for A-01 evidence retention — P03 Foundation 1.0."""

from __future__ import annotations

import contextlib
import datetime as dt
import io
import json
import os
import tempfile
import unittest
from types import SimpleNamespace
from unittest import mock

from a01_evidence_retention import (
    GENESIS,
    MANIFEST_NAME,
    ChainError,
    EvidenceManifest,
    EvidenceStore,
    RetentionPolicy,
    main,
)

NOW = dt.datetime(2026, 9, 13, 12, 0, tzinfo=dt.timezone.utc)


def make_root(files):
    root = tempfile.mkdtemp()
    for relpath, (content, age_days) in files.items():
        abs_path = os.path.join(root, relpath)
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)
        with open(abs_path, "w", encoding="utf-8") as handle:
            handle.write(content)
        stamp = (NOW - dt.timedelta(days=age_days)).timestamp()
        os.utime(abs_path, (stamp, stamp))
    return root


class TestChain(unittest.TestCase):
    def test_first_entry_links_to_genesis(self):
        store = EvidenceStore(make_root({"a.json": ("x", 1)}))
        store.index()
        first = next(store.manifest.entries())
        self.assertEqual(first["previous_entry_digest"], GENESIS)

    def test_chain_verifies_after_indexing(self):
        store = EvidenceStore(make_root({f"a{i}.json": ("x" * i, i) for i in range(1, 6)}))
        store.index()
        result = store.manifest.verify()
        self.assertTrue(result["ok"])
        self.assertEqual(result["entries"], 5)

    def test_edited_entry_is_detected(self):
        store = EvidenceStore(make_root({"a.json": ("x", 1), "b.json": ("y", 2)}))
        store.index()
        path = store.manifest.path
        lines = open(path, encoding="utf-8").read().splitlines()
        entry = json.loads(lines[0])
        entry["size_bytes"] = 99999
        lines[0] = json.dumps(entry, sort_keys=True, separators=(",", ":"))
        open(path, "w", encoding="utf-8").write("\n".join(lines) + "\n")
        result = store.manifest.verify()
        self.assertFalse(result["ok"])
        self.assertEqual(result["broken_at"], 0)

    def test_removed_entry_is_detected(self):
        store = EvidenceStore(make_root({f"a{i}.json": ("x", i) for i in range(1, 4)}))
        store.index()
        path = store.manifest.path
        lines = open(path, encoding="utf-8").read().splitlines()
        del lines[1]
        open(path, "w", encoding="utf-8").write("\n".join(lines) + "\n")
        self.assertFalse(store.manifest.verify()["ok"])

    def test_indexing_is_idempotent(self):
        store = EvidenceStore(make_root({"a.json": ("x", 1)}))
        store.index()
        second = store.index()
        self.assertEqual(second["indexed"], 0)
        self.assertEqual(store.manifest.verify()["entries"], 1)

    def test_changed_content_is_recorded_again(self):
        root = make_root({"a.json": ("x", 1)})
        store = EvidenceStore(root)
        store.index()
        with open(os.path.join(root, "a.json"), "w", encoding="utf-8") as handle:
            handle.write("changed")
        self.assertEqual(store.index()["indexed"], 1)


class TestPolicy(unittest.TestCase):
    def policy_store(self, files, **kw):
        return EvidenceStore(make_root(files), RetentionPolicy(**kw))

    def test_recent_evidence_is_kept(self):
        store = self.policy_store({"a.json": ("x", 3)})
        self.assertIn("a.json", store.plan(NOW)["keep"])

    def test_evidence_past_the_summary_window_is_prunable(self):
        store = self.policy_store({"old.json": ("x", 400)})
        self.assertIn("old.json", store.plan(NOW)["prune"])

    def test_summary_tier_keeps_one_artifact_per_day(self):
        files = {f"d/{i}.json": ("x" * (i + 1), 90) for i in range(4)}
        plan = self.policy_store(files).plan(NOW)
        self.assertEqual(len(plan["keep"]), 1)
        self.assertEqual(len(plan["prune"]), 3)

    def test_protected_prefixes_are_never_prunable(self):
        store = self.policy_store({"authority/genesis.json": ("x", 5000),
                                   "qualification/q.json": ("x", 5000),
                                   "closure/c.json": ("x", 5000)})
        plan = store.plan(NOW)
        self.assertEqual(plan["prune"], [])
        self.assertEqual(len(plan["protected"]), 3)

    @mock.patch("a01_evidence_retention.shutil.disk_usage")
    def test_low_free_space_threshold_is_surfaced_without_overriding_retention(self, disk_usage):
        disk_usage.return_value = SimpleNamespace(total=100, used=95, free=5)
        store = self.policy_store({"recent.json": ("x", 1)}, min_free_bytes=10)
        plan = store.plan(NOW)
        self.assertTrue(plan["below_min_free_bytes"])
        self.assertEqual(plan["free_bytes"], 5)
        self.assertEqual(plan["min_free_bytes"], 10)
        self.assertIn("recent.json", plan["keep"])


class TestPrune(unittest.TestCase):
    def test_pruned_artifact_is_recorded_before_and_after_deletion(self):
        root = make_root({"old.json": ("x", 400)})
        store = EvidenceStore(root)
        store.index()
        store.prune(NOW)
        self.assertFalse(os.path.exists(os.path.join(root, "old.json")))
        events = [e["event"] for e in store.manifest.entries() if e["relpath"] == "old.json"]
        self.assertEqual(events, ["INDEXED", "PRUNE_INTENT", "PRUNED"])

    def test_prune_is_refused_on_a_broken_chain(self):
        root = make_root({"old.json": ("x", 400), "b.json": ("y", 1)})
        store = EvidenceStore(root)
        store.index()
        path = store.manifest.path
        lines = open(path, encoding="utf-8").read().splitlines()
        del lines[0]
        open(path, "w", encoding="utf-8").write("\n".join(lines) + "\n")
        with self.assertRaises(ChainError):
            store.prune(NOW)
        self.assertTrue(os.path.exists(os.path.join(root, "old.json")))

    def test_dry_run_deletes_nothing_and_reports_would_prune(self):
        root = make_root({"old.json": ("x", 400)})
        store = EvidenceStore(root)
        store.index()
        result = store.prune(NOW, dry_run=True)
        self.assertTrue(os.path.exists(os.path.join(root, "old.json")))
        self.assertEqual(result["pruned"], 0)
        self.assertEqual(result["would_prune"], 1)
        self.assertEqual(result["bytes_reclaimed"], 0)

    def test_chain_still_verifies_after_pruning(self):
        root = make_root({"old.json": ("x", 400), "new.json": ("y", 1)})
        store = EvidenceStore(root)
        store.index()
        store.prune(NOW)
        self.assertTrue(store.manifest.verify()["ok"])

    def test_pruned_artifact_remains_provable_after_deletion(self):
        root = make_root({"old.json": ("payload", 400)})
        store = EvidenceStore(root)
        store.index()
        original = next(e["content_digest"] for e in store.manifest.entries())
        store.prune(NOW)
        pruned = next(e for e in store.manifest.entries() if e["event"] == "PRUNED")
        self.assertEqual(pruned["content_digest"], original)

    def test_delete_failure_is_recorded_and_not_counted_as_reclaimed(self):
        root = make_root({"old.json": ("payload", 400)})
        store = EvidenceStore(root)
        store.index()
        with mock.patch("a01_evidence_retention.os.remove", side_effect=OSError("denied")):
            result = store.prune(NOW)
        self.assertTrue(os.path.exists(os.path.join(root, "old.json")))
        self.assertEqual(result["pruned"], 0)
        self.assertEqual(result["bytes_reclaimed"], 0)
        self.assertEqual(len(result["refused"]), 1)
        events = [e["event"] for e in store.manifest.entries() if e["relpath"] == "old.json"]
        self.assertEqual(events, ["INDEXED", "PRUNE_INTENT", "PRUNE_FAILED"])

    def test_cli_returns_one_when_prune_is_refused(self):
        root = make_root({"old.json": ("payload", 400)})
        store = EvidenceStore(root)
        store.index()
        original_append = EvidenceManifest.append

        def refuse_intent(manifest, body):
            if body.get("event") == "PRUNE_INTENT":
                raise OSError("manifest denied")
            return original_append(manifest, body)

        with mock.patch.object(EvidenceManifest, "append", new=refuse_intent):
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                code = main(["--root", root, "--prune"])
        self.assertEqual(code, 1)
        self.assertTrue(os.path.exists(os.path.join(root, "old.json")))


class TestReport(unittest.TestCase):
    def test_unrecorded_artifacts_are_surfaced(self):
        root = make_root({"a.json": ("x", 1)})
        store = EvidenceStore(root)
        self.assertEqual(store.report(NOW)["unrecorded"], ["a.json"])
        store.index()
        self.assertEqual(store.report(NOW)["unrecorded"], [])

    def test_manifest_is_not_itself_an_artifact(self):
        root = make_root({"a.json": ("x", 1)})
        store = EvidenceStore(root)
        store.index()
        self.assertNotIn(MANIFEST_NAME, [p for p in store._artifacts()])


if __name__ == "__main__":
    unittest.main(verbosity=2)
