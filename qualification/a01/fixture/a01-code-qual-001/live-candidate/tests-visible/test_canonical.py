import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from canonical import canonical, sha256


class CanonicalTests(unittest.TestCase):
    def test_whitespace_normalization(self):
        self.assertEqual(canonical(" r1 ", "  alpha\t beta\r\n gamma  "), "r1:alpha beta gamma")

    def test_sha_is_stable(self):
        self.assertEqual(
            sha256("r1", "alpha\n beta"),
            sha256(" r1 ", " alpha   beta ")
        )

if __name__ == "__main__":
    unittest.main()
