import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from store import Conflict, Store


class Clock:
    def __init__(self, now=1000.0): self.now = float(now)
    def __call__(self): return self.now


class VisibleStoreTests(unittest.TestCase):
    def test_replay_returns_same_durable_claim_and_not_new(self):
        with tempfile.TemporaryDirectory() as d:
            s = Store(Path(d) / "x.db")
            try:
                first, acquired1 = s.claim("r1", "worker-a", "payload")
                second, acquired2 = s.claim("r1", "worker-a", "payload")
                self.assertEqual(first, second)
                self.assertTrue(acquired1)
                self.assertFalse(acquired2)
            finally:
                s.close()

    def test_conflicting_payload_is_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            s = Store(Path(d) / "x.db")
            try:
                s.claim("r1", "worker-a", "one")
                with self.assertRaises(Conflict):
                    s.claim("r1", "worker-b", "two")
            finally:
                s.close()

    def test_stale_generation_cannot_complete(self):
        with tempfile.TemporaryDirectory() as d:
            c = Clock()
            s = Store(Path(d) / "x.db", clock=c, lease_seconds=10)
            try:
                first, _ = s.claim("r1", "worker-a", "p")
                c.now += 11
                second, acquired = s.recover("r1", "worker-b")
                self.assertTrue(acquired)
                self.assertEqual(second.generation, first.generation + 1)
                self.assertFalse(s.complete("r1", first.owner, first.generation))
                self.assertTrue(s.complete("r1", second.owner, second.generation))
            finally:
                s.close()

if __name__ == "__main__":
    unittest.main()
