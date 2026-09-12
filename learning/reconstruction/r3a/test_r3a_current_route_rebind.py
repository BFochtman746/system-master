from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parent


def load_module(filename: str, name: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


adapter = load_module("shared_authority_current.py", "r3a_shared_authority_current")
generator = load_module("generate_current_route_manifest.py", "r3a_route_generator")
rebind = json.loads((ROOT / "CURRENT_SHARED_OWNER_REBIND.json").read_text(encoding="utf-8"))
fence = json.loads((ROOT / "KNOWLEDGE_ALIGNMENT_FENCE.json").read_text(encoding="utf-8"))


class Gateway:
    def invoke(self, **kwargs):
        return {
            "canonical_owner": kwargs["canonical_owner"],
            "contract_id": kwargs["contract_id"],
            "contract_version": kwargs["contract_version"],
            "ok": True,
        }


class R3ACurrentRouteTests(unittest.TestCase):
    def test_14_shared_bindings_are_explicit_and_unresolved(self):
        self.assertEqual(14, len(rebind["bindings"]))
        self.assertEqual(set(generator.SHARED), set(rebind["bindings"]))
        for interface_id, binding in rebind["bindings"].items():
            self.assertEqual(generator.SHARED[interface_id], binding["logical_owner"])
            self.assertIsNone(binding["contract_id"])
            self.assertIsNone(binding["contract_version"])
            self.assertEqual("CURRENT_CONTRACT_ID_UNRESOLVED", binding["status"])

    def test_no_historical_composite_is_current_logical_owner(self):
        current = {v["logical_owner"] for v in rebind["bindings"].values()}
        self.assertFalse(current & set(adapter.HISTORICAL_OWNER_IDS))

    def test_unresolved_current_contract_fails_closed(self):
        gateway = adapter.CurrentSharedAuthorityAdapter(Gateway())
        with self.assertRaises(adapter.DependencyUnavailable):
            gateway.invoke(
                interface_id="I021",
                logical_owner="Durable Execution Runtime",
                operation="CancelLearningJob",
                payload={},
            )

    def test_historical_owner_id_is_rejected(self):
        gateway = adapter.CurrentSharedAuthorityAdapter(Gateway())
        with self.assertRaises(adapter.SharedAuthorityBindingError):
            gateway.invoke(
                interface_id="I021",
                logical_owner="FOUNDATION-003 + PLATFORM-002",
                operation="CancelLearningJob",
                payload={},
            )

    def test_wrong_current_logical_owner_is_rejected(self):
        gateway = adapter.CurrentSharedAuthorityAdapter(Gateway())
        with self.assertRaises(adapter.SharedAuthorityBindingError):
            gateway.invoke(
                interface_id="I021",
                logical_owner="Transport & Delivery",
                operation="CancelLearningJob",
                payload={},
            )

    def test_future_exact_binding_is_checked_without_becoming_learning_truth(self):
        binding = adapter.CurrentContractBinding(
            "Durable Execution Runtime", "CURRENT-CORE-CONTRACT-FIXTURE", "v-test"
        )
        gateway = adapter.CurrentSharedAuthorityAdapter(Gateway(), bindings={"I021": binding})
        result = gateway.invoke(
            interface_id="I021",
            logical_owner="Durable Execution Runtime",
            operation="CancelLearningJob",
            payload={"job_ref": "fixture"},
        )
        self.assertTrue(result["ok"])

    def test_knowledge_residual_is_deny_by_default(self):
        self.assertEqual("LRN-069 / LRN-EXT-002", fence["residual_id"])
        self.assertFalse(fence["canonical_store_permitted"])
        self.assertFalse(fence["canonical_route_permitted"])
        self.assertEqual("DENY_BY_DEFAULT", fence["feature_gate"])

    @unittest.skipUnless(
        os.environ.get("LRN_SOURCE_ROUTE_MANIFEST"),
        "Exact admitted source route manifest must be materialized before lossless regeneration test",
    )
    def test_materialized_source_regenerates_losslessly(self):
        current = generator.generate(Path(os.environ["LRN_SOURCE_ROUTE_MANIFEST"]))
        self.assertEqual(112, current["route_count"])
        self.assertEqual(59, sum(r["canonical_owner"] == generator.LEARNING for r in current["routes"]))
        self.assertEqual(39, sum(r["canonical_owner"] == generator.CURRICULUM for r in current["routes"]))
        self.assertEqual(14, sum(r["current_owner_scope"] == "SYSTEM_MASTER/CORE" for r in current["routes"]))
        self.assertTrue(all(r["executable"] is False for r in current["routes"]))


if __name__ == "__main__":
    unittest.main()
