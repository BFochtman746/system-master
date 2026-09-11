from __future__ import annotations

import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src'))

from controller_v2 import ControllerStore


class AuthorityEpochTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = Path(self.temp.name) / 'controller.db'
        self.store = ControllerStore(self.db, ROOT / 'migrations')

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def test_authority_position_is_epoch_and_sequence(self):
        epoch, seq = self.store.authority_position()
        self.assertEqual(epoch, 1)
        self.assertEqual(seq, 0)

    def test_authority_epoch_cannot_regress_or_skip(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.conn.execute('UPDATE controller_meta SET authority_epoch=3 WHERE singleton=1')
        self.store.conn.execute('UPDATE controller_meta SET authority_epoch=2 WHERE singleton=1')
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.conn.execute('UPDATE controller_meta SET authority_epoch=1 WHERE singleton=1')


if __name__ == '__main__':
    unittest.main()
