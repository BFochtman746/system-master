import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from a01_book_durability_provider import (
    DurabilityError,
    PRESERVE_OPERATION_ID,
    RESTORE_OPERATION_ID,
    filesystem_resolver,
    preserve_physical_set,
    restore_physical_set,
)


def digest_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest_json(value) -> str:
    return digest_bytes(canonical(value).encode())


class CoreP03BookDurabilityProviderTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.source = self.root / "source"
        self.archive = self.root / "archive"
        self.restore_parent = self.root / "restore"
        self.source.mkdir()
        files = {
            "book/canonical.json": b'{"v":1}\n',
            "book/manuscript.txt": b"final expression\n",
            "book/brief.json": b'{"brief":true}\n',
            "book/plan.json": b'{"plan":true}\n',
            "book/lifecycle.json": b'{"phase":"PRESERVATION"}\n',
            "book/evidence.json": b'{"evidence":true}\n',
        }
        self.digests = {}
        for ref, data in files.items():
            p = self.source / ref
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(data)
            self.digests[ref] = digest_bytes(data)
        self.manifest = {
            "manifest_schema_version": 1,
            "manifest_id": "book-semantic-set-001",
            "recovery_profile_id": "BOOK-SEMANTIC-RECOVERY-PROFILE-001",
            "objective_id": "BOOK-ENG-009-SEMANTIC-RECOVERY-PROFILE-001",
            "owner_path": "SYSTEM_MASTER/BOOK",
            "component_id": "BOOK-COMP-12",
            "book_project_id": "book-001",
            "subject": {
                "canonical_state_ref": "book/canonical.json",
                "canonical_version": 1,
                "canonical_digest": self.digests["book/canonical.json"],
                "manuscript_ref": "book/manuscript.txt",
                "manuscript_digest": self.digests["book/manuscript.txt"],
            },
            "scope": {
                "requires_knowledge_canon": False,
                "requires_research": False,
                "has_publication_artifacts": False,
                "has_release": False,
                "has_external_receipts": False,
                "has_active_workflow": False,
            },
            "dependencies": [
                {"dependency_id": "brief", "class": "GOVERNING_BRIEF", "owner_path": "SYSTEM_MASTER/BOOK", "ref": "book/brief.json", "digest": self.digests["book/brief.json"], "currentness": "CURRENT", "required": True},
                {"dependency_id": "plan", "class": "BOOK_PLAN", "owner_path": "SYSTEM_MASTER/BOOK", "ref": "book/plan.json", "digest": self.digests["book/plan.json"], "currentness": "CURRENT", "required": True},
                {"dependency_id": "life", "class": "LIFECYCLE_STATE", "owner_path": "SYSTEM_MASTER/BOOK", "ref": "book/lifecycle.json", "digest": self.digests["book/lifecycle.json"], "currentness": "CURRENT", "required": True},
                {"dependency_id": "ev", "class": "EVIDENCE_MANIFEST", "owner_path": "SYSTEM_MASTER/BOOK", "ref": "book/evidence.json", "digest": self.digests["book/evidence.json"], "currentness": "CURRENT", "required": True},
            ],
            "rebuild_profile": {"recipes": [], "recipes_disposition": "NOT_APPLICABLE", "indexes": [], "indexes_disposition": "NOT_APPLICABLE"},
            "lineage": {"edition_id": "edition-001", "parent_version_refs": [], "release_id": None},
            "policy": {"retention_class": "LONG_TERM", "offline_continuity_requirement": "FULL_LOCAL_SEMANTIC_CONTINUITY"},
            "created_at": "2026-09-14T17:00:00Z",
            "physical_payload_included": False,
            "canonical_effect_allowed": False,
        }
        self.manifest["manifest_digest"] = digest_json(self.manifest)
        self.preserve_request = {
            "request_schema_version": 1,
            "request_id": "preserve-001",
            "caller_system": "BOOK",
            "caller_owner_path": "SYSTEM_MASTER/BOOK",
            "provider_system": "CORE",
            "operation_id": PRESERVE_OPERATION_ID,
            "semantic_role": "PRESERVE_PHYSICAL_SET",
            "book_project_id": "book-001",
            "subject": self.manifest["subject"],
            "semantic_manifest_id": self.manifest["manifest_id"],
            "semantic_manifest_digest": self.manifest["manifest_digest"],
            "retention_class": "LONG_TERM",
            "offline_continuity_requirement": "FULL_LOCAL_SEMANTIC_CONTINUITY",
            "idempotency_key": "preserve-key-001",
            "requested_at": "2026-09-14T17:01:00Z",
            "canonical_effect_allowed": False,
            "direct_database_access": False,
            "physical_payload_included": False,
        }

    def tearDown(self):
        self.tmp.cleanup()

    def _preserve(self):
        return preserve_physical_set(self.preserve_request, self.manifest, filesystem_resolver(self.source), self.archive)

    def _restore_request(self, durability):
        return {
            "request_schema_version": 1,
            "request_id": "restore-001",
            "caller_system": "BOOK",
            "provider_system": "CORE",
            "operation_id": RESTORE_OPERATION_ID,
            "semantic_role": "RESTORE_PHYSICAL_SET",
            "semantic_manifest_digest": self.manifest["manifest_digest"],
            "canonical_digest": self.manifest["subject"]["canonical_digest"],
            "physical_manifest_digest": durability["physical_manifest_digest"],
            "restore_handle": durability["restore_handle"],
            "destructive_test_environment_required": True,
            "idempotency_key": "restore-key-001",
            "requested_at": "2026-09-14T17:02:00Z",
            "canonical_effect_allowed": False,
            "direct_database_access": False,
        }

    def test_operation_ids_are_core_p03_commands(self):
        self.assertEqual("CORE.P03.COMMAND.PRESERVE_PHYSICAL_SET", PRESERVE_OPERATION_ID)
        self.assertEqual("CORE.P03.COMMAND.RESTORE_PHYSICAL_SET", RESTORE_OPERATION_ID)

    def test_preserve_returns_book_compatible_durable_receipt(self):
        receipt = self._preserve()
        self.assertEqual("DURABLE", receipt["status"])
        self.assertEqual(PRESERVE_OPERATION_ID, receipt["operation_id"])
        self.assertEqual(self.manifest["manifest_digest"], receipt["semantic_manifest_digest"])
        self.assertEqual(self.manifest["subject"]["canonical_digest"], receipt["canonical_digest"])
        self.assertEqual(64, len(receipt["physical_manifest_digest"]))
        self.assertTrue(receipt["restore_handle"].startswith("sets/"))

    def test_preserve_is_idempotent_for_same_key_and_subject(self):
        first = self._preserve()
        for ref in self.digests:
            (self.source / ref).unlink()
        second = self._preserve()
        self.assertEqual(first, second)

    def test_preserve_rejects_same_idempotency_key_for_different_subject(self):
        self._preserve()
        other = json.loads(json.dumps(self.manifest))
        other["subject"]["canonical_digest"] = "1" * 64
        body = dict(other)
        body.pop("manifest_digest", None)
        other["manifest_digest"] = digest_json(body)
        request = dict(self.preserve_request)
        request["subject"] = dict(request["subject"])
        request["subject"]["canonical_digest"] = "1" * 64
        request["semantic_manifest_digest"] = other["manifest_digest"]
        with self.assertRaisesRegex(DurabilityError, "IDEMPOTENCY_CONFLICT"):
            preserve_physical_set(request, other, filesystem_resolver(self.source), self.archive)

    def test_preserve_rejects_semantic_manifest_digest_mismatch(self):
        bad = dict(self.manifest)
        bad["manifest_id"] = "changed"
        with self.assertRaisesRegex(DurabilityError, "SEMANTIC_MANIFEST_DIGEST_MISMATCH"):
            preserve_physical_set(self.preserve_request, bad, filesystem_resolver(self.source), self.archive)

    def test_preserve_rejects_source_digest_mismatch(self):
        (self.source / "book/manuscript.txt").write_text("changed", encoding="utf-8")
        with self.assertRaisesRegex(DurabilityError, "PHYSICAL_SOURCE_DIGEST_MISMATCH"):
            self._preserve()

    def test_request_cannot_grant_book_write_authority(self):
        bad = dict(self.preserve_request)
        bad["canonical_effect_allowed"] = True
        with self.assertRaisesRegex(DurabilityError, "BOOK_WRITE_AUTHORITY_FORBIDDEN"):
            preserve_physical_set(bad, self.manifest, filesystem_resolver(self.source), self.archive)

    def test_default_filesystem_resolver_rejects_traversal(self):
        resolver = filesystem_resolver(self.source)
        with self.assertRaisesRegex(DurabilityError, "UNSAFE_PHYSICAL_REF"):
            resolver("../outside.txt")

    def test_restore_is_destructive_only_inside_derived_test_target(self):
        durability = self._preserve()
        request = self._restore_request(durability)
        neighbor = self.restore_parent / "neighbor.txt"
        self.restore_parent.mkdir(parents=True, exist_ok=True)
        neighbor.write_text("must survive", encoding="utf-8")
        first = restore_physical_set(request, self.archive, self.restore_parent)
        target = self.restore_parent / first["restore_test_target_ref"]
        self.assertTrue(target.is_dir())
        self.assertEqual("must survive", neighbor.read_text(encoding="utf-8"))
        self.assertTrue(first["destructive_restore_executed"])

    def test_restore_retry_reconciles_receipt_without_duplicate_destructive_effect(self):
        durability = self._preserve()
        request = self._restore_request(durability)
        first = restore_physical_set(request, self.archive, self.restore_parent)
        target = self.restore_parent / first["restore_test_target_ref"]
        marker = target / "after-receipt-marker.txt"
        marker.write_text("do not destroy on idempotent replay", encoding="utf-8")
        second = restore_physical_set(request, self.archive, self.restore_parent)
        self.assertEqual(first, second)
        self.assertTrue(marker.exists())

    def test_restore_receipt_reproduces_book_expected_digests(self):
        durability = self._preserve()
        restored = restore_physical_set(self._restore_request(durability), self.archive, self.restore_parent)
        self.assertEqual("RESTORED", restored["status"])
        self.assertEqual(self.manifest["subject"]["canonical_digest"], restored["restored_canonical_digest"])
        self.assertEqual(self.manifest["subject"]["manuscript_digest"], restored["restored_manuscript_digest"])
        self.assertEqual(self.manifest["subject"]["manuscript_digest"], restored["reproduced_final_expression_digest"])
        for dep in self.manifest["dependencies"]:
            self.assertEqual(dep["digest"], restored["restored_dependency_digests"][dep["ref"]])

    def test_restore_rejects_wrong_physical_manifest_digest(self):
        durability = self._preserve()
        request = self._restore_request(durability)
        request["physical_manifest_digest"] = "0" * 64
        with self.assertRaisesRegex(DurabilityError, "RESTORE_PHYSICAL_MANIFEST_MISMATCH"):
            restore_physical_set(request, self.archive, self.restore_parent)

    def test_restore_requires_destructive_test_environment_flag(self):
        durability = self._preserve()
        request = self._restore_request(durability)
        request["destructive_test_environment_required"] = False
        with self.assertRaisesRegex(DurabilityError, "DESTRUCTIVE_TEST_RESTORE_REQUIRED"):
            restore_physical_set(request, self.archive, self.restore_parent)

    def test_provider_never_mutates_book_source_files(self):
        before = {p: (self.source / p).read_bytes() for p in self.digests}
        durability = self._preserve()
        restore_physical_set(self._restore_request(durability), self.archive, self.restore_parent)
        after = {p: (self.source / p).read_bytes() for p in self.digests}
        self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()
