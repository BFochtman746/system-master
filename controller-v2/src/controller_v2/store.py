from __future__ import annotations

import contextlib
import hashlib
import json
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any, Iterator


class ControllerError(RuntimeError):
    pass


class IdempotencyConflict(ControllerError):
    pass


class LeaseConflict(ControllerError):
    pass


class StaleFence(ControllerError):
    pass


class MigrationDrift(ControllerError):
    pass


def now_ms() -> int:
    return time.time_ns() // 1_000_000


def new_id() -> str:
    return str(uuid.uuid4())


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def command_fingerprint(command_type: str, payload: Any) -> tuple[str, str]:
    canonical = canonical_json(payload)
    return canonical, sha256_text(command_type + '\n' + canonical)


class ControllerStore:
    OUTBOX_DESTINATION = 'github-control-state'

    def __init__(self, db_path: str | Path, migrations_dir: str | Path):
        self.db_path = Path(db_path)
        self.migrations_dir = Path(migrations_dir)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(
            self.db_path,
            timeout=5.0,
            autocommit=True,
            check_same_thread=False,
        )
        self.conn.row_factory = sqlite3.Row
        self._configure()
        self._bootstrap_migrations()
        self.apply_migrations()

    def close(self) -> None:
        self.conn.close()

    def _configure(self) -> None:
        self.conn.execute('PRAGMA trusted_schema=OFF')
        self.conn.execute('PRAGMA mmap_size=0')
        self.conn.execute('PRAGMA cell_size_check=ON')
        result = self.conn.execute('PRAGMA quick_check').fetchone()[0]
        if result != 'ok':
            raise ControllerError(f'database quick_check failed: {result}')
        self.conn.execute('PRAGMA foreign_keys=ON')
        mode = self.conn.execute('PRAGMA journal_mode=WAL').fetchone()[0]
        if str(mode).lower() != 'wal':
            raise ControllerError(f'WAL mode required, got {mode}')
        self.conn.execute('PRAGMA synchronous=FULL')
        self.conn.execute('PRAGMA busy_timeout=5000')
        if self.conn.execute('PRAGMA foreign_keys').fetchone()[0] != 1:
            raise ControllerError('foreign key enforcement is required')
        if self.conn.execute('PRAGMA synchronous').fetchone()[0] != 2:
            raise ControllerError('synchronous=FULL is required')
        if self.conn.execute('PRAGMA trusted_schema').fetchone()[0] != 0:
            raise ControllerError('trusted_schema=OFF is required')

    def _bootstrap_migrations(self) -> None:
        self.conn.execute(
            '''CREATE TABLE IF NOT EXISTS schema_migrations (
                 version INTEGER PRIMARY KEY,
                 name TEXT NOT NULL,
                 checksum_sha256 TEXT NOT NULL,
                 applied_at_ms INTEGER NOT NULL
               ) STRICT'''
        )

    @contextlib.contextmanager
    def immediate(self) -> Iterator[sqlite3.Connection]:
        self.conn.execute('BEGIN IMMEDIATE')
        try:
            yield self.conn
        except BaseException:
            self.conn.execute('ROLLBACK')
            raise
        else:
            self.conn.execute('COMMIT')

    def apply_migrations(self) -> None:
        files = sorted(self.migrations_dir.glob('[0-9][0-9][0-9][0-9]_*.sql'))
        for path in files:
            version = int(path.name[:4])
            sql = path.read_text(encoding='utf-8')
            checksum = sha256_text(sql)
            row = self.conn.execute(
                'SELECT name, checksum_sha256 FROM schema_migrations WHERE version=?',
                (version,),
            ).fetchone()
            if row:
                if row['name'] != path.name or row['checksum_sha256'] != checksum:
                    raise MigrationDrift(f'migration {version} changed after application')
                continue
            with self.immediate():
                for statement in self._split_sql(sql):
                    self.conn.execute(statement)
                self.conn.execute(
                    'INSERT INTO schema_migrations(version,name,checksum_sha256,applied_at_ms) VALUES(?,?,?,?)',
                    (version, path.name, checksum, now_ms()),
                )
                self.conn.execute(f'PRAGMA user_version={version}')

    @staticmethod
    def _split_sql(sql: str) -> list[str]:
        statements: list[str] = []
        buffer = ''
        for line in sql.splitlines(True):
            buffer += line
            if sqlite3.complete_statement(buffer):
                text = buffer.strip()
                if text:
                    statements.append(text)
                buffer = ''
        if buffer.strip():
            raise MigrationDrift('migration ends with incomplete SQL')
        return statements

    def backup_to(self, target_path: str | Path) -> Path:
        target = Path(target_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            raise ControllerError(f'backup target already exists: {target}')
        destination = sqlite3.connect(target, autocommit=True)
        try:
            self.conn.backup(destination)
        finally:
            destination.close()
        check = sqlite3.connect(f'file:{target}?mode=ro', uri=True, autocommit=True)
        try:
            result = check.execute('PRAGMA quick_check').fetchone()[0]
            if result != 'ok':
                raise ControllerError(f'backup quick_check failed: {result}')
        finally:
            check.close()
        return target

    def register_subject(
        self,
        repository: str,
        object_digest: str,
        object_algorithm: str = 'sha1',
    ) -> str:
        digest = object_digest.lower()
        with self.immediate():
            row = self.conn.execute(
                'SELECT subject_id FROM subjects WHERE repository=? AND object_algorithm=? AND object_digest=?',
                (repository, object_algorithm, digest),
            ).fetchone()
            if row:
                return row['subject_id']
            subject_id = new_id()
            self.conn.execute(
                '''INSERT INTO subjects(subject_id,repository,object_algorithm,object_digest,created_at_ms)
                   VALUES(?,?,?,?,?)''',
                (subject_id, repository, object_algorithm, digest, now_ms()),
            )
            return subject_id

    def submit_command(
        self,
        *,
        command_id: str,
        caller_id: str,
        command_type: str,
        payload: Any,
        base_subject_id: str,
        controller_subject_id: str,
        policy_subject_id: str,
    ) -> str:
        canonical, fingerprint = command_fingerprint(command_type, payload)
        ts = now_ms()
        with self.immediate():
            existing = self.conn.execute(
                'SELECT fingerprint_sha256 FROM commands WHERE command_id=?',
                (command_id,),
            ).fetchone()
            if existing:
                if existing['fingerprint_sha256'] != fingerprint:
                    raise IdempotencyConflict('same command_id used with different semantic payload')
                tx = self.conn.execute(
                    'SELECT transaction_id FROM transactions WHERE command_id=?',
                    (command_id,),
                ).fetchone()
                if tx is None:
                    raise ControllerError('idempotent command exists without transaction')
                return tx['transaction_id']

            transaction_id = new_id()
            self.conn.execute(
                '''INSERT INTO commands(command_id,caller_id,command_type,payload_canonical,fingerprint_sha256,received_at_ms)
                   VALUES(?,?,?,?,?,?)''',
                (command_id, caller_id, command_type, canonical, fingerprint, ts),
            )
            self.conn.execute(
                '''INSERT INTO transactions(
                     transaction_id,command_id,state,base_subject_id,controller_subject_id,policy_subject_id,
                     created_at_ms,updated_at_ms
                   ) VALUES(?,?,?,?,?,?,?,?)''',
                (transaction_id, command_id, 'RECEIVED', base_subject_id, controller_subject_id, policy_subject_id, ts, ts),
            )
            self._append_event(
                aggregate_type='TRANSACTION',
                aggregate_id=transaction_id,
                event_type='COMMAND_RECEIVED',
                payload={'command_id': command_id, 'command_type': command_type},
                actor_id=caller_id,
                correlation_id=command_id,
                publish=True,
                occurred_at_ms=ts,
            )
            return transaction_id

    def transition_transaction(
        self,
        transaction_id: str,
        expected_state: str,
        new_state: str,
        actor_id: str,
        detail: Any | None = None,
    ) -> int:
        ts = now_ms()
        with self.immediate():
            row = self.conn.execute(
                'SELECT state,state_version,command_id FROM transactions WHERE transaction_id=?',
                (transaction_id,),
            ).fetchone()
            if row is None:
                raise ControllerError('transaction not found')
            if row['state'] != expected_state:
                raise ControllerError(f'expected {expected_state}, found {row["state"]}')
            version = row['state_version'] + 1
            terminal = new_state in {'SUCCEEDED','FAILED','REJECTED','CANCELLED'}
            self.conn.execute(
                '''UPDATE transactions SET state=?, state_version=?, updated_at_ms=?, terminal_at_ms=CASE WHEN ? THEN ? ELSE terminal_at_ms END
                   WHERE transaction_id=?''',
                (new_state, version, ts, 1 if terminal else 0, ts, transaction_id),
            )
            return self._append_event(
                aggregate_type='TRANSACTION',
                aggregate_id=transaction_id,
                event_type='TRANSACTION_STATE_CHANGED',
                payload={'from': expected_state, 'to': new_state, 'detail': detail},
                actor_id=actor_id,
                correlation_id=row['command_id'],
                publish=True,
                occurred_at_ms=ts,
            )

    def bind_candidate(self, transaction_id: str, subject_id: str, actor_id: str) -> None:
        with self.immediate():
            row = self.conn.execute(
                'SELECT candidate_subject_id,command_id FROM transactions WHERE transaction_id=?',
                (transaction_id,),
            ).fetchone()
            if row is None:
                raise ControllerError('transaction not found')
            if row['candidate_subject_id'] is not None:
                if row['candidate_subject_id'] == subject_id:
                    return
                raise ControllerError('candidate subject already bound')
            self.conn.execute(
                'UPDATE transactions SET candidate_subject_id=?, updated_at_ms=? WHERE transaction_id=?',
                (subject_id, now_ms(), transaction_id),
            )
            self._append_event(
                aggregate_type='TRANSACTION',
                aggregate_id=transaction_id,
                event_type='CANDIDATE_BOUND',
                payload={'subject_id': subject_id},
                actor_id=actor_id,
                correlation_id=row['command_id'],
                publish=True,
            )

    def create_attempt(self, transaction_id: str, actor_id: str) -> str:
        ts = now_ms()
        with self.immediate():
            tx = self.conn.execute(
                'SELECT state,command_id FROM transactions WHERE transaction_id=?',
                (transaction_id,),
            ).fetchone()
            if tx is None or tx['state'] != 'EXECUTING':
                raise ControllerError('transaction must be EXECUTING before creating attempt')
            n = self.conn.execute(
                'SELECT COALESCE(MAX(attempt_no),0)+1 AS n FROM execution_attempts WHERE transaction_id=?',
                (transaction_id,),
            ).fetchone()['n']
            attempt_id = new_id()
            self.conn.execute(
                '''INSERT INTO execution_attempts(attempt_id,transaction_id,attempt_no,state,created_at_ms)
                   VALUES(?,?,?,?,?)''',
                (attempt_id, transaction_id, n, 'CREATED', ts),
            )
            self.conn.execute(
                'UPDATE execution_attempts SET state=? WHERE attempt_id=?',
                ('CLAIMABLE', attempt_id),
            )
            self._append_event(
                aggregate_type='ATTEMPT', aggregate_id=attempt_id, event_type='ATTEMPT_CLAIMABLE',
                payload={'transaction_id': transaction_id, 'attempt_no': n}, actor_id=actor_id,
                correlation_id=tx['command_id'], publish=True, occurred_at_ms=ts,
            )
            return attempt_id

    def acquire_lease(
        self,
        *,
        resource_key: str,
        transaction_id: str,
        attempt_id: str,
        holder_id: str,
        ttl_ms: int,
        actor_id: str,
    ) -> tuple[str, int]:
        if ttl_ms <= 0:
            raise ValueError('ttl_ms must be positive')
        ts = now_ms()
        with self.immediate():
            attempt = self.conn.execute(
                'SELECT state FROM execution_attempts WHERE attempt_id=? AND transaction_id=?',
                (attempt_id, transaction_id),
            ).fetchone()
            if attempt is None or attempt['state'] != 'CLAIMABLE':
                raise LeaseConflict('attempt is not claimable')

            expired = self.conn.execute(
                'SELECT lease_id,fencing_token FROM leases WHERE resource_key=? AND state=? AND expires_at_ms<=?',
                (resource_key, 'ACTIVE', ts),
            ).fetchall()
            for row in expired:
                self.conn.execute(
                    'UPDATE leases SET state=?, released_at_ms=? WHERE lease_id=?',
                    ('EXPIRED', ts, row['lease_id']),
                )
                self._append_event(
                    aggregate_type='LEASE', aggregate_id=row['lease_id'], event_type='LEASE_EXPIRED',
                    payload={'resource_key': resource_key, 'fencing_token': row['fencing_token']},
                    actor_id=actor_id, publish=True, occurred_at_ms=ts,
                )

            if self.conn.execute(
                'SELECT 1 FROM leases WHERE resource_key=? AND state=?',
                (resource_key, 'ACTIVE'),
            ).fetchone():
                raise LeaseConflict('resource already has an active lease')

            token = self.conn.execute(
                '''INSERT INTO resource_fences(resource_key,current_token) VALUES(?,1)
                   ON CONFLICT(resource_key) DO UPDATE SET current_token=current_token+1
                   RETURNING current_token''',
                (resource_key,),
            ).fetchone()['current_token']
            lease_id = new_id()
            self.conn.execute(
                '''INSERT INTO leases(
                     lease_id,resource_key,transaction_id,attempt_id,holder_id,fencing_token,state,
                     acquired_at_ms,last_heartbeat_at_ms,expires_at_ms
                   ) VALUES(?,?,?,?,?,?,?,?,?,?)''',
                (lease_id, resource_key, transaction_id, attempt_id, holder_id, token, 'ACTIVE', ts, ts, ts + ttl_ms),
            )
            self.conn.execute('UPDATE execution_attempts SET state=? WHERE attempt_id=?', ('CLAIMED', attempt_id))
            self._append_event(
                aggregate_type='LEASE', aggregate_id=lease_id, event_type='LEASE_ACQUIRED',
                payload={'resource_key': resource_key, 'fencing_token': token, 'attempt_id': attempt_id},
                actor_id=actor_id, publish=True, occurred_at_ms=ts,
            )
            return lease_id, token

    def assert_fence(self, lease_id: str, fencing_token: int, *, at_ms: int | None = None) -> None:
        ts = now_ms() if at_ms is None else at_ms
        row = self.conn.execute(
            '''SELECT l.state,l.expires_at_ms,l.resource_key,l.fencing_token,f.current_token
               FROM leases l JOIN resource_fences f ON f.resource_key=l.resource_key
               WHERE l.lease_id=?''',
            (lease_id,),
        ).fetchone()
        if row is None or row['state'] != 'ACTIVE' or row['expires_at_ms'] <= ts:
            raise StaleFence('lease is not active')
        if row['fencing_token'] != fencing_token or row['current_token'] != fencing_token:
            raise StaleFence('fencing token is stale')

    def heartbeat_lease(self, lease_id: str, fencing_token: int, ttl_ms: int, actor_id: str) -> None:
        if ttl_ms <= 0:
            raise ValueError('ttl_ms must be positive')
        ts = now_ms()
        with self.immediate():
            self.assert_fence(lease_id, fencing_token, at_ms=ts)
            self.conn.execute(
                'UPDATE leases SET last_heartbeat_at_ms=?, expires_at_ms=? WHERE lease_id=?',
                (ts, ts + ttl_ms, lease_id),
            )
            self._append_event(
                aggregate_type='LEASE', aggregate_id=lease_id, event_type='LEASE_HEARTBEAT',
                payload={'fencing_token': fencing_token}, actor_id=actor_id,
                publish=False, occurred_at_ms=ts,
            )

    def release_lease(self, lease_id: str, fencing_token: int, actor_id: str) -> None:
        ts = now_ms()
        with self.immediate():
            self.assert_fence(lease_id, fencing_token, at_ms=ts)
            row = self.conn.execute('SELECT resource_key FROM leases WHERE lease_id=?', (lease_id,)).fetchone()
            self.conn.execute(
                'UPDATE leases SET state=?, released_at_ms=? WHERE lease_id=?',
                ('RELEASED', ts, lease_id),
            )
            self._append_event(
                aggregate_type='LEASE', aggregate_id=lease_id, event_type='LEASE_RELEASED',
                payload={'resource_key': row['resource_key'], 'fencing_token': fencing_token},
                actor_id=actor_id, publish=True, occurred_at_ms=ts,
            )

    def record_inbox(self, source: str, delivery_id: str, payload: Any) -> bool:
        payload_hash = sha256_text(canonical_json(payload))
        ts = now_ms()
        with self.immediate():
            row = self.conn.execute(
                'SELECT payload_sha256 FROM inbox_messages WHERE source=? AND delivery_id=?',
                (source, delivery_id),
            ).fetchone()
            if row:
                if row['payload_sha256'] != payload_hash:
                    raise IdempotencyConflict('same delivery ID arrived with different payload')
                return False
            self.conn.execute(
                '''INSERT INTO inbox_messages(source,delivery_id,payload_sha256,state,received_at_ms)
                   VALUES(?,?,?,?,?)''',
                (source, delivery_id, payload_hash, 'RECEIVED', ts),
            )
            return True

    def next_outbox(self, destination: str = OUTBOX_DESTINATION) -> sqlite3.Row | None:
        return self.conn.execute(
            '''SELECT o.*, e.event_id,e.aggregate_type,e.aggregate_id,e.event_type,e.payload_canonical,e.actor_id,e.occurred_at_ms
               FROM outbox o JOIN controller_events e ON e.event_seq=o.event_seq
               WHERE o.destination=? AND o.state='PENDING' AND o.available_at_ms<=?
               ORDER BY o.event_seq LIMIT 1''',
            (destination, now_ms()),
        ).fetchone()

    def mark_outbox_published(self, event_seq: int, destination: str = OUTBOX_DESTINATION) -> None:
        with self.immediate():
            self.conn.execute(
                '''UPDATE outbox SET state='PUBLISHED', attempts=attempts+1, published_at_ms=?, last_error=NULL
                   WHERE event_seq=? AND destination=? AND state='PENDING' ''',
                (now_ms(), event_seq, destination),
            )

    def _append_event(
        self,
        *,
        aggregate_type: str,
        aggregate_id: str,
        event_type: str,
        payload: Any,
        actor_id: str,
        correlation_id: str | None = None,
        causation_event_id: str | None = None,
        publish: bool,
        occurred_at_ms: int | None = None,
    ) -> int:
        ts = now_ms() if occurred_at_ms is None else occurred_at_ms
        event_id = new_id()
        cursor = self.conn.execute(
            '''INSERT INTO controller_events(
                 event_id,aggregate_type,aggregate_id,event_type,payload_canonical,actor_id,
                 correlation_id,causation_event_id,occurred_at_ms
               ) VALUES(?,?,?,?,?,?,?,?,?)''',
            (event_id, aggregate_type, aggregate_id, event_type, canonical_json(payload), actor_id,
             correlation_id, causation_event_id, ts),
        )
        event_seq = int(cursor.lastrowid)
        if publish:
            self.conn.execute(
                '''INSERT INTO outbox(event_seq,destination,state,attempts,available_at_ms)
                   VALUES(?,?, 'PENDING',0,?)''',
                (event_seq, self.OUTBOX_DESTINATION, ts),
            )
        return event_seq
