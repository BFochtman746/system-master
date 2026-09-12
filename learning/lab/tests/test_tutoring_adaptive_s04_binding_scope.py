from __future__ import annotations

import unittest

from learning_lab.adaptive import AdaptiveLearningEngine
from learning_lab.adaptive_mastery_binding import _s03_bound_compute_projection
from learning_lab.domain_tutor_compat import bind_s04_adaptive_runtime_engine


class S04AdaptiveMasteryBindingScopeTests(unittest.TestCase):
    def test_import_does_not_replace_predecessor_adaptive_class_authority(self):
        self.assertIsNot(AdaptiveLearningEngine._compute_projection, _s03_bound_compute_projection)
        self.assertFalse(getattr(AdaptiveLearningEngine, "_s04_s03_mastery_binding_installed", False))

    def test_binding_is_instance_only_and_does_not_mutate_peer_engine(self):
        class FakeEngine:
            def _compute_projection(self, *args, **kwargs):
                return {"standing": "PREDECESSOR"}

        first = FakeEngine()
        peer = FakeEngine()
        original_class_method = FakeEngine._compute_projection

        bound = bind_s04_adaptive_runtime_engine(first)

        self.assertIs(bound, first)
        self.assertIs(FakeEngine._compute_projection, original_class_method)
        self.assertNotIn("_compute_projection", peer.__dict__)
        self.assertNotIn("_s04_s03_mastery_binding_installed", peer.__dict__)
        self.assertTrue(first.__dict__["_s04_s03_mastery_binding_installed"])
        self.assertEqual(first.__dict__["_s04_s03_mastery_binding_scope"], "INSTANCE_ONLY")
        self.assertIs(first._compute_projection.__func__, _s03_bound_compute_projection)

    def test_rebinding_same_instance_is_idempotent(self):
        class FakeEngine:
            def _compute_projection(self, *args, **kwargs):
                return {"standing": "PREDECESSOR"}

        engine = FakeEngine()
        first_method = bind_s04_adaptive_runtime_engine(engine)._compute_projection
        second_method = bind_s04_adaptive_runtime_engine(engine)._compute_projection
        self.assertIs(first_method.__func__, second_method.__func__)
        self.assertIs(first_method.__self__, second_method.__self__)


if __name__ == "__main__":
    unittest.main()
