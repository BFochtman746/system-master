import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from controller_v2 import ControllerStore

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "schema" / "001_initial.sql"
CHILD = ROOT / "tests" / "crash_child.py"


class CrashRecoveryTests(unittest.TestCase):
    def test_commit_survives_and_uncommitted_write_rolls_back(self):
        with tempfile.TemporaryDirectory() as temp:
            db = Path(temp) / "controller.db"
            store = ControllerStore(db, SCHEMA)
            store.initialize()

            subprocess.run([sys.executable, str(CHILD), str(db), "committed"], check=True)
            subprocess.run([sys.executable, str(CHILD), str(db), "uncommitted"], check=False)

            con = store.connect()
            try:
                names = {row[0] for row in con.execute("SELECT projection_name FROM projection_state")}
                self.assertIn("crash-test", names)
                self.assertNotIn("crash-test-uncommitted", names)
                self.assertEqual(con.execute("PRAGMA integrity_check").fetchone()[0], "ok")
                self.assertEqual(con.execute("PRAGMA foreign_key_check").fetchall(), [])
            finally:
                con.close()


if __name__ == "__main__":
    unittest.main()
