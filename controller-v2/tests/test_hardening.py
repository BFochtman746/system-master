from __future__ import annotations

import sqlite3
import sys
import tempfile
import time
import unittest
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src'))

from controller_v2 import ControllerError, ControllerStore, IdempotencyConflict, StaleFence


SHA_A = 'a' * 40
SHA_B = 'b' * 40
SHA_C = 'c' * 40
SHA_D = 'd' * 40


class HardeningTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = Path(self.temp.name) / 'controller.db'
        self.store = ControllerStore(self.db, ROOT / 'migrations')
        self.base = self.store.register_subject('BFochtman746/system-master', SHA_A)
        self.other_base = self.store.register_subject('BFochtman746/system-master', SHA_D)
        self.controller = self.store.register_subject('BFochtman746/system-master-controller', SHA_B)
        self.policy = self.store.register_subject('BFochtman746/system-master-controller', SHA_C)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def submit(self, *, command_id=None, caller_id='test', payload=None, base_subject_id=None):
        return self.store.submit_command(
            command_id=command_id or str(uuid.uuid4()),
            caller_id=caller_id,
            command_type='BUILD',
            payload={'target': 'foundation'} if payload is None else payload,
            base_subject_id=base_subject_id or self.base,
            controller_subject_id=self.controller,
            policy_subject_id=self.policy,
        )

    def drive_to_executing(self, tx):
        for old, new in [('RECEIVED','VALIDATED'),('VALIDATED','ADMITTED'),('ADMITTED','PLANNED'),('PLANNED','EXECUTING')]:
            self.store.transition_transaction(tx, old, new, 'test')

    def test_command_identity_binds_subject(self):
        cid = str(uuid.uuid4())
        self.submit(command_id=cid, base_subject_id=self.base)
        with self.assertRaises(IdempotencyConflict):
            self.submit(command_id=cid, base_subject_id=self.other_base)

    def test_command_identity_binds_caller(self):
        cid = str(uuid.uuid4())
        self.submit(command_id=cid, caller_id='principal-a')
        with self.assertRaises(IdempotencyConflict):
            self.submit(command_id=cid, caller_id='principal-b')

    def test_transaction_cannot_be_inserted_terminal(self):
        cid = str(uuid.uuid4())
        ts = int(time.time() * 1000)
        self.store.conn.execute(
            '''INSERT INTO commands(command_id,caller_id,command_type,payload_canonical,fingerprint_sha256,received_at_ms)
               VALUES(?,?,?,?,?,?)''',
            (cid, 'raw', 'BUILD', '{}', '0' * 64, ts),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.conn.execute(
                '''INSERT INTO transactions(transaction_id,command_id,state,base_subject_id,controller_subject_id,
                   policy_subject_id,state_version,created_at_ms,updated_at_ms,terminal_at_ms)
                   VALUES(?,?,?,?,?,?,?,?,?,?)''',
                (str(uuid.uuid4()), cid, 'SUCCEEDED', self.base, self.controller, self.policy, 0, ts, ts, ts),
            )

    def test_attempt_cannot_be_claimed_without_lease(self):
        tx = self.submit()
        self.drive_to_executing(tx)
        attempt = self.store.create_attempt(tx, 'test')
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.conn.execute("UPDATE execution_attempts SET state='CLAIMED' WHERE attempt_id=?", (attempt,))

    def test_attempt_cannot_be_inserted_running(self):
        tx = self.submit()
        self.drive_to_executing(tx)
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.conn.execute(
                '''INSERT INTO execution_attempts(attempt_id,transaction_id,attempt_no,state,created_at_ms,started_at_ms)
                   VALUES(?,?,?,?,?,?)''',
                (str(uuid.uuid4()), tx, 99, 'RUNNING', int(time.time() * 1000), int(time.time() * 1000)),
            )

    def test_candidate_cannot_bind_before_execution(self):
        tx = self.submit()
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.bind_candidate(tx, self.other_base, 'test')

    def test_qualification_cannot_be_inserted_as_verdict(self):
        tx = self.submit()
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.conn.execute(
                '''INSERT INTO qualifications(qualification_id,transaction_id,subject_id,policy_subject_id,state,created_at_ms)
                   VALUES(?,?,?,?,?,?)''',
                (str(uuid.uuid4()), tx, self.base, self.policy, 'QUALIFIED', int(time.time() * 1000)),
            )

    def test_promotion_cannot_be_inserted_eligible(self):
        tx = self.submit()
        qid = str(uuid.uuid4())
        self.store.conn.execute(
            '''INSERT INTO qualifications(qualification_id,transaction_id,subject_id,policy_subject_id,state,created_at_ms)
               VALUES(?,?,?,?,?,?)''',
            (qid, tx, self.base, self.policy, 'PENDING', int(time.time() * 1000)),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.conn.execute(
                '''INSERT INTO promotions(promotion_id,qualification_id,target_repository,target_ref,expected_head_digest,state,created_at_ms)
                   VALUES(?,?,?,?,?,?,?)''',
                (str(uuid.uuid4()), qid, 'BFochtman746/system-master', 'refs/heads/main', SHA_A,
                 'ELIGIBLE', int(time.time() * 1000)),
            )

    def test_lease_identity_cannot_be_rewritten(self):
        tx = self.submit()
        self.drive_to_executing(tx)
        attempt = self.store.create_attempt(tx, 'test')
        lease, epoch, token = self.store.acquire_lease(
            resource_key='R', transaction_id=tx, attempt_id=attempt, holder_id='worker',
            ttl_ms=60_000, actor_id='test')
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.conn.execute('UPDATE leases SET fencing_token=? WHERE lease_id=?', (token + 100, lease))
        self.store.assert_fence(lease, epoch, token)

    def test_resource_fence_cannot_skip_or_regress(self):
        tx = self.submit()
        self.drive_to_executing(tx)
        attempt = self.store.create_attempt(tx, 'test')
        self.store.acquire_lease(resource_key='R', transaction_id=tx, attempt_id=attempt,
                                 holder_id='worker', ttl_ms=60_000, actor_id='test')
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.conn.execute("UPDATE resource_fences SET current_token=current_token+2 WHERE resource_key='R'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.conn.execute("UPDATE resource_fences SET current_token=0 WHERE resource_key='R'")

    def test_active_lease_cannot_be_released_before_attempt_terminal(self):
        tx = self.submit()
        self.drive_to_executing(tx)
        attempt = self.store.create_attempt(tx, 'test')
        lease, epoch, token = self.store.acquire_lease(
            resource_key='R', transaction_id=tx, attempt_id=attempt, holder_id='worker',
            ttl_ms=60_000, actor_id='test')
        with self.assertRaises(ControllerError):
            self.store.release_lease(lease, epoch, token, 'test')

    def test_expired_lease_abandons_old_attempt(self):
        tx1 = self.submit(payload={'n': 1})
        self.drive_to_executing(tx1)
        a1 = self.store.create_attempt(tx1, 'test')
        lease1, epoch1, token1 = self.store.acquire_lease(
            resource_key='shared', transaction_id=tx1, attempt_id=a1, holder_id='worker-a',
            ttl_ms=1, actor_id='test')
        time.sleep(0.01)

        tx2 = self.submit(payload={'n': 2})
        self.drive_to_executing(tx2)
        a2 = self.store.create_attempt(tx2, 'test')
        self.store.acquire_lease(
            resource_key='shared', transaction_id=tx2, attempt_id=a2, holder_id='worker-b',
            ttl_ms=60_000, actor_id='test')

        attempt_state = self.store.conn.execute(
            'SELECT state FROM execution_attempts WHERE attempt_id=?', (a1,)
        ).fetchone()[0]
        lease_state = self.store.conn.execute('SELECT state FROM leases WHERE lease_id=?', (lease1,)).fetchone()[0]
        self.assertEqual(attempt_state, 'ABANDONED')
        self.assertEqual(lease_state, 'EXPIRED')
        with self.assertRaises(StaleFence):
            self.store.assert_fence(lease1, epoch1, token1)

    def test_recovery_epoch_revokes_live_leases_and_invalidates_old_fence(self):
        tx = self.submit()
        self.drive_to_executing(tx)
        attempt = self.store.create_attempt(tx, 'test')
        lease, old_epoch, token = self.store.acquire_lease(
            resource_key='R', transaction_id=tx, attempt_id=attempt, holder_id='worker',
            ttl_ms=60_000, actor_id='test')
        new_epoch, event_seq = self.store.begin_recovery_epoch(
            remote_epoch=old_epoch + 4, remote_event_seq=999, actor_id='recovery')
        self.assertEqual(new_epoch, old_epoch + 5)
        self.assertGreater(event_seq, 0)
        self.assertEqual(self.store.authority_position()[0], new_epoch)
        self.assertEqual(self.store.conn.execute('SELECT state FROM leases WHERE lease_id=?', (lease,)).fetchone()[0], 'REVOKED')
        self.assertEqual(self.store.conn.execute('SELECT state FROM execution_attempts WHERE attempt_id=?', (attempt,)).fetchone()[0], 'ABANDONED')
        with self.assertRaises(StaleFence):
            self.store.assert_fence(lease, old_epoch, token)
        event_epoch = self.store.conn.execute(
            'SELECT authority_epoch FROM controller_events WHERE event_seq=?', (event_seq,)
        ).fetchone()[0]
        self.assertEqual(event_epoch, new_epoch)

    def test_event_cannot_spoof_authority_epoch(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.conn.execute(
                '''INSERT INTO controller_events(event_id,aggregate_type,aggregate_id,event_type,payload_canonical,
                   actor_id,occurred_at_ms,authority_epoch) VALUES(?,?,?,?,?,?,?,?)''',
                (str(uuid.uuid4()), 'TEST', 'x', 'SPOOF', '{}', 'test', int(time.time() * 1000), 999),
            )

    def test_outbox_publish_is_single_transition(self):
        self.submit()
        row = self.store.next_outbox()
        self.assertIsNotNone(row)
        self.store.mark_outbox_published(row['event_seq'])
        with self.assertRaises(ControllerError):
            self.store.mark_outbox_published(row['event_seq'])

    def test_applied_migration_record_is_immutable(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.conn.execute("UPDATE schema_migrations SET checksum_sha256='0' WHERE version=1")
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.conn.execute('DELETE FROM schema_migrations WHERE version=1')


if __name__ == '__main__':
    unittest.main()
