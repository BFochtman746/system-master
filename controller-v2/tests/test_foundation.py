from __future__ import annotations

import concurrent.futures
import sqlite3
import sys
import tempfile
import time
import unittest
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src'))

from controller_v2 import ControllerStore, IdempotencyConflict, LeaseConflict, MigrationDrift, StaleFence


SHA_A = 'a' * 40
SHA_B = 'b' * 40
SHA_C = 'c' * 40


class FoundationTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = Path(self.temp.name) / 'controller.db'
        self.store = ControllerStore(self.db, ROOT / 'migrations')
        self.base = self.store.register_subject('BFochtman746/system-master', SHA_A)
        self.controller = self.store.register_subject('BFochtman746/system-master-controller', SHA_B)
        self.policy = self.store.register_subject('BFochtman746/system-master-controller', SHA_C)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def submit(self, command_id=None, payload=None):
        return self.store.submit_command(
            command_id=command_id or str(uuid.uuid4()),
            caller_id='test',
            command_type='BUILD',
            payload=payload or {'target': 'foundation'},
            base_subject_id=self.base,
            controller_subject_id=self.controller,
            policy_subject_id=self.policy,
        )

    def drive_to_executing(self, tx):
        for old, new in [('RECEIVED','VALIDATED'),('VALIDATED','ADMITTED'),('ADMITTED','PLANNED'),('PLANNED','EXECUTING')]:
            self.store.transition_transaction(tx, old, new, 'test')

    def test_same_command_is_idempotent(self):
        cid = str(uuid.uuid4())
        first = self.submit(cid, {'x': 1})
        second = self.submit(cid, {'x': 1})
        self.assertEqual(first, second)
        count = self.store.conn.execute('SELECT count(*) FROM transactions WHERE command_id=?', (cid,)).fetchone()[0]
        self.assertEqual(count, 1)

    def test_same_command_id_different_payload_rejected(self):
        cid = str(uuid.uuid4())
        self.submit(cid, {'x': 1})
        with self.assertRaises(IdempotencyConflict):
            self.submit(cid, {'x': 2})

    def test_illegal_transaction_transition_rejected_by_database(self):
        tx = self.submit()
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.conn.execute(
                "UPDATE transactions SET state='SUCCEEDED',state_version=1,updated_at_ms=updated_at_ms+1,terminal_at_ms=updated_at_ms+1 WHERE transaction_id=?",
                (tx,),
            )

    def test_events_are_append_only(self):
        self.submit()
        seq = self.store.conn.execute('SELECT max(event_seq) FROM controller_events').fetchone()[0]
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.conn.execute('DELETE FROM controller_events WHERE event_seq=?', (seq,))

    def test_subject_is_immutable(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.conn.execute('UPDATE subjects SET repository=? WHERE subject_id=?', ('other/repo', self.base))

    def test_outbox_is_atomic_with_command(self):
        tx = self.submit()
        event = self.store.conn.execute(
            'SELECT event_seq FROM controller_events WHERE aggregate_id=? ORDER BY event_seq LIMIT 1',
            (tx,),
        ).fetchone()[0]
        out = self.store.conn.execute('SELECT state FROM outbox WHERE event_seq=?', (event,)).fetchone()
        self.assertEqual(out['state'], 'PENDING')

    def test_lease_fencing_rejects_old_worker(self):
        tx = self.submit()
        self.drive_to_executing(tx)
        attempt1 = self.store.create_attempt(tx, 'test')
        lease1, epoch1, token1 = self.store.acquire_lease(
            resource_key='repo:system-master:ref:main', transaction_id=tx, attempt_id=attempt1,
            holder_id='worker-a', ttl_ms=60_000, actor_id='test')
        self.store.transition_attempt(attempt_id=attempt1, expected_state='CLAIMED', new_state='RUNNING',
                                      actor_id='worker-a', lease_id=lease1, authority_epoch=epoch1, fencing_token=token1)
        self.store.transition_attempt(attempt_id=attempt1, expected_state='RUNNING', new_state='FAILED',
                                      actor_id='worker-a', lease_id=lease1, authority_epoch=epoch1,
                                      fencing_token=token1, error_code='TEST_FAILURE')
        self.store.release_lease(lease1, epoch1, token1, 'test')
        attempt2 = self.store.create_attempt(tx, 'test')
        lease2, epoch2, token2 = self.store.acquire_lease(
            resource_key='repo:system-master:ref:main', transaction_id=tx, attempt_id=attempt2,
            holder_id='worker-b', ttl_ms=60_000, actor_id='test')
        self.assertEqual(epoch2, epoch1)
        self.assertGreater(token2, token1)
        with self.assertRaises(StaleFence):
            self.store.assert_fence(lease1, epoch1, token1)
        self.store.assert_fence(lease2, epoch2, token2)

    def test_only_one_active_lease_per_resource(self):
        tx1 = self.submit(payload={'x': 1})
        self.drive_to_executing(tx1)
        a1 = self.store.create_attempt(tx1, 'test')
        self.store.acquire_lease(resource_key='R', transaction_id=tx1, attempt_id=a1,
                                 holder_id='one', ttl_ms=60_000, actor_id='test')
        tx2 = self.submit(payload={'x': 2})
        self.drive_to_executing(tx2)
        a2 = self.store.create_attempt(tx2, 'test')
        with self.assertRaises(LeaseConflict):
            self.store.acquire_lease(resource_key='R', transaction_id=tx2, attempt_id=a2,
                                     holder_id='two', ttl_ms=60_000, actor_id='test')

    def test_same_git_object_can_be_reused_in_later_roles(self):
        first = self.store.register_subject('BFochtman746/system-master', SHA_A)
        second = self.store.register_subject('BFochtman746/system-master', SHA_A)
        self.assertEqual(first, second)

    def test_backup_is_consistent_and_readable(self):
        cid = str(uuid.uuid4())
        tx = self.submit(cid, {'backup': True})
        backup = Path(self.temp.name) / 'backup.db'
        self.store.backup_to(backup)
        con = sqlite3.connect(f'file:{backup}?mode=ro', uri=True)
        try:
            row = con.execute('SELECT transaction_id FROM transactions WHERE command_id=?', (cid,)).fetchone()
            self.assertEqual(row[0], tx)
            self.assertEqual(con.execute('PRAGMA quick_check').fetchone()[0], 'ok')
        finally:
            con.close()

    def test_concurrent_duplicate_command_creates_one_transaction(self):
        cid = str(uuid.uuid4())
        stores = [ControllerStore(self.db, ROOT / 'migrations') for _ in range(6)]
        try:
            def submit_from(store):
                return store.submit_command(
                    command_id=cid, caller_id='race', command_type='BUILD', payload={'same': True},
                    base_subject_id=self.base, controller_subject_id=self.controller, policy_subject_id=self.policy)
            with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
                results = list(pool.map(submit_from, stores))
            self.assertEqual(len(set(results)), 1)
            count = self.store.conn.execute('SELECT count(*) FROM transactions WHERE command_id=?', (cid,)).fetchone()[0]
            self.assertEqual(count, 1)
        finally:
            for store in stores:
                store.close()

    def test_concurrent_lease_race_has_single_winner(self):
        tx1 = self.submit(payload={'lease': 1})
        tx2 = self.submit(payload={'lease': 2})
        self.drive_to_executing(tx1)
        self.drive_to_executing(tx2)
        a1 = self.store.create_attempt(tx1, 'test')
        a2 = self.store.create_attempt(tx2, 'test')
        s1 = ControllerStore(self.db, ROOT / 'migrations')
        s2 = ControllerStore(self.db, ROOT / 'migrations')
        barrier = __import__('threading').Barrier(2)
        try:
            def compete(store, tx, attempt, holder):
                barrier.wait()
                try:
                    return ('won', store.acquire_lease(
                        resource_key='shared-resource', transaction_id=tx, attempt_id=attempt,
                        holder_id=holder, ttl_ms=60_000, actor_id=holder))
                except LeaseConflict:
                    return ('lost', None)
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                f1 = pool.submit(compete, s1, tx1, a1, 'worker-1')
                f2 = pool.submit(compete, s2, tx2, a2, 'worker-2')
                outcomes = [f1.result(), f2.result()]
            self.assertEqual([x[0] for x in outcomes].count('won'), 1)
            self.assertEqual([x[0] for x in outcomes].count('lost'), 1)
        finally:
            s1.close()
            s2.close()

    def test_transaction_and_outbox_rollback_together(self):
        tx = self.submit()
        before = self.store.conn.execute('SELECT count(*) FROM controller_events').fetchone()[0]
        with self.assertRaises(RuntimeError):
            with self.store.immediate():
                self.store.conn.execute(
                    "UPDATE transactions SET state='VALIDATED',state_version=1,updated_at_ms=updated_at_ms+1 WHERE transaction_id=?",
                    (tx,),
                )
                self.store._append_event(
                    aggregate_type='TRANSACTION', aggregate_id=tx, event_type='SHOULD_ROLL_BACK',
                    payload={}, actor_id='test', publish=True,
                )
                raise RuntimeError('simulated crash before commit')
        row = self.store.conn.execute('SELECT state,state_version FROM transactions WHERE transaction_id=?', (tx,)).fetchone()
        self.assertEqual((row['state'], row['state_version']), ('RECEIVED', 0))
        after = self.store.conn.execute('SELECT count(*) FROM controller_events').fetchone()[0]
        self.assertEqual(after, before)

    def test_promotion_cannot_become_eligible_before_qualification(self):
        tx = self.submit()
        qid = str(uuid.uuid4())
        pid = str(uuid.uuid4())
        self.store.conn.execute(
            '''INSERT INTO qualifications(qualification_id,transaction_id,subject_id,policy_subject_id,state,created_at_ms)
               VALUES(?,?,?,?,?,?)''',
            (qid, tx, self.base, self.policy, 'PENDING', int(time.time()*1000)),
        )
        self.store.conn.execute(
            '''INSERT INTO promotions(promotion_id,qualification_id,target_repository,target_ref,expected_head_digest,state,created_at_ms)
               VALUES(?,?,?,?,?,?,?)''',
            (pid, qid, 'BFochtman746/system-master', 'refs/heads/main', SHA_A, 'NOT_ELIGIBLE', int(time.time()*1000)),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.conn.execute("UPDATE promotions SET state='ELIGIBLE' WHERE promotion_id=?", (pid,))

    def test_restart_preserves_idempotency(self):
        cid = str(uuid.uuid4())
        tx = self.submit(cid, {'restart': True})
        self.store.close()
        self.store = ControllerStore(self.db, ROOT / 'migrations')
        self.assertEqual(tx, self.submit(cid, {'restart': True}))

    def test_inbox_redelivery_is_idempotent_and_payload_change_rejected(self):
        self.assertTrue(self.store.record_inbox('github', 'delivery-1', {'x': 1}))
        self.assertFalse(self.store.record_inbox('github', 'delivery-1', {'x': 1}))
        with self.assertRaises(IdempotencyConflict):
            self.store.record_inbox('github', 'delivery-1', {'x': 2})

    def test_migration_drift_is_detected(self):
        self.store.close()
        migration = Path(self.temp.name) / 'migrations'
        migration.mkdir()
        original = (ROOT / 'migrations' / '0001_foundation.sql').read_text()
        (migration / '0001_foundation.sql').write_text(original + '\n-- changed\n')
        with self.assertRaises(MigrationDrift):
            ControllerStore(self.db, migration)
        self.store = ControllerStore(self.db, ROOT / 'migrations')


if __name__ == '__main__':
    unittest.main()
