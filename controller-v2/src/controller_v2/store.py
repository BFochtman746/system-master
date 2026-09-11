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


def command_fingerprint(
    *,
    caller_id: str,
    command_type: str,
    payload: Any,
    base_subject_id: str,
    controller_subject_id: str,
    policy_subject_id: str,
) -> tuple[str, str]:
    canonical_payload = canonical_json(payload)
    semantic_envelope = canonical_json(
        {
            'caller_id': caller_id,
            'command_type': command_type,
            'payload': payload,
            'base_subject_id': base_subject_id,
            'controller_subject_id': controller_subject_id,
            'policy_subject_id': policy_subject_id,
        }
    )
    return canonical_payload, sha256_text(semantic_envelope)


class ControllerStore:
    OUTBOX_DESTINATION = 'github-control-state'
    ACTIVE_ATTEMPT_STATES = frozenset({'CREATED', 'CLAIMABLE', 'CLAIMED', 'RUNNING', 'VERIFYING'})
    TERMINAL_ATTEMPT_STATES = frozenset({'SUCCEEDED', 'FAILED', 'ABANDONED', 'CANCELLED'})

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
        try:
            self._configure()
            self._bootstrap_migrations()
            self.apply_migrations()
            self._ensure_controller_meta()
        except BaseException:
            self.conn.close()
            raise

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

    def _ensure_controller_meta(self) -> None:
        with self.immediate():
            row = self.conn.execute('SELECT store_id,authority_epoch FROM controller_meta WHERE singleton=1').fetchone()
            if row is None:
                self.conn.execute(
                    'INSERT INTO controller_meta(singleton,store_id,authority_epoch,created_at_ms) VALUES(1,?,?,?)',
                    (new_id(), 1, now_ms()),
                )

    def authority_position(self) -> tuple[int, int]:
        epoch = self.conn.execute('SELECT authority_epoch FROM controller_meta WHERE singleton=1').fetchone()[0]
        seq = self.conn.execute('SELECT COALESCE(MAX(event_seq),0) FROM controller_events').fetchone()[0]
        return int(epoch), int(seq)

    def begin_recovery_epoch(self, *, remote_epoch: int, remote_event_seq: int, actor_id: str) -> tuple[int, int]:
        if remote_epoch < 1 or remote_event_seq < 0:
            raise ValueError('remote authority position is invalid')
        ts = now_ms()
        with self.immediate():
            active = self.conn.execute(
                "SELECT lease_id,attempt_id,resource_key,fencing_token,authority_epoch FROM leases WHERE state='ACTIVE'"
            ).fetchall()
            for lease in active:
                self.conn.execute(
                    "UPDATE execution_attempts SET state='ABANDONED',completed_at_ms=? WHERE attempt_id=? AND state IN ('CLAIMED','RUNNING','VERIFYING')",
                    (ts, lease['attempt_id']),
                )
                self.conn.execute(
                    "UPDATE leases SET state='REVOKED',released_at_ms=? WHERE lease_id=?",
                    (ts, lease['lease_id']),
                )

            current_epoch = int(
                self.conn.execute('SELECT authority_epoch FROM controller_meta WHERE singleton=1').fetchone()[0]
            )
            target_epoch = max(current_epoch, remote_epoch) + 1
            while current_epoch < target_epoch:
                current_epoch += 1
                self.conn.execute(
                    'UPDATE controller_meta SET authority_epoch=? WHERE singleton=1',
                    (current_epoch,),
                )

            seq = self._append_event(
                aggregate_type='CONTROLLER',
                aggregate_id='authority',
                event_type='AUTHORITY_EPOCH_ADVANCED',
                payload={
                    'remote_epoch': remote_epoch,
                    'remote_event_seq': remote_event_seq,
                    'revoked_lease_count': len(active),
                    'new_epoch': current_epoch,
                },
                actor_id=actor_id,
                publish=True,
                occurred_at_ms=ts,
            )
            return current_epoch, seq

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

    def register_subject(self, repository: str, object_digest: str, object_algorithm: str = 'sha1') -> str:
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
        canonical, fingerprint = command_fingerprint(
            caller_id=caller_id,
            command_type=command_type,
            payload=payload,
            base_subject_id=base_subject_id,
            controller_subject_id=controller_subject_id,
            policy_subject_id=policy_subject_id,
        )
        ts = now_ms()
        with self.immediate():
            existing = self.conn.execute(
                'SELECT fingerprint_sha256 FROM commands WHERE command_id=?', (command_id,)
            ).fetchone()
            if existing:
                if existing['fingerprint_sha256'] != fingerprint:
                    raise IdempotencyConflict('same command_id used with different semantic command envelope')
                tx = self.conn.execute(
                    'SELECT transaction_id FROM transactions WHERE command_id=?', (command_id,)
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
            terminal = new_state in {'SUCCEEDED', 'FAILED', 'REJECTED', 'CANCELLED'}
            self.conn.execute(
                '''UPDATE transactions SET state=?, state_version=?, updated_at_ms=?,
                   terminal_at_ms=CASE WHEN ? THEN ? ELSE terminal_at_ms END WHERE transaction_id=?''',
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
                'SELECT state,command_id FROM transactions WHERE transaction_id=?', (transaction_id,)
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
            self.conn.execute('UPDATE execution_attempts SET state=? WHERE attempt_id=?', ('CLAIMABLE', attempt_id))
            self._append_event(
                aggregate_type='ATTEMPT',
                aggregate_id=attempt_id,
                event_type='ATTEMPT_CLAIMABLE',
                payload={'transaction_id': transaction_id, 'attempt_no': n},
                actor_id=actor_id,
                correlation_id=tx['command_id'],
                publish=True,
                occurred_at_ms=ts,
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
    ) -> tuple[str, int, int]:
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
                '''SELECT lease_id,attempt_id,fencing_token,authority_epoch
                   FROM leases WHERE resource_key=? AND state='ACTIVE' AND expires_at_ms<=?''',
                (resource_key, ts),
            ).fetchall()
            for row in expired:
                self.conn.execute(
                    "UPDATE execution_attempts SET state='ABANDONED',completed_at_ms=? WHERE attempt_id=? AND state IN ('CLAIMED','RUNNING','VERIFYING')",
                    (ts, row['attempt_id']),
                )
                self.conn.execute(
                    "UPDATE leases SET state='EXPIRED',released_at_ms=? WHERE lease_id=?",
                    (ts, row['lease_id']),
                )
                self._append_event(
                    aggregate_type='LEASE',
                    aggregate_id=row['lease_id'],
                    event_type='LEASE_EXPIRED',
                    payload={
                        'resource_key': resource_key,
                        'authority_epoch': row['authority_epoch'],
                        'fencing_token': row['fencing_token'],
                        'attempt_id': row['attempt_id'],
                    },
                    actor_id=actor_id,
                    publish=True,
                    occurred_at_ms=ts,
                )

            if self.conn.execute(
                "SELECT 1 FROM leases WHERE resource_key=? AND state='ACTIVE'", (resource_key,)
            ).fetchone():
                raise LeaseConflict('resource already has an active lease')

            token = int(
                self.conn.execute(
                    '''INSERT INTO resource_fences(resource_key,current_token) VALUES(?,1)
                       ON CONFLICT(resource_key) DO UPDATE SET current_token=current_token+1
                       RETURNING current_token''',
                    (resource_key,),
                ).fetchone()['current_token']
            )
            epoch = int(
                self.conn.execute('SELECT authority_epoch FROM controller_meta WHERE singleton=1').fetchone()[0]
            )
            lease_id = new_id()
            self.conn.execute(
                '''INSERT INTO leases(
                     lease_id,resource_key,transaction_id,attempt_id,holder_id,fencing_token,state,
                     acquired_at_ms,last_heartbeat_at_ms,expires_at_ms,authority_epoch
                   ) VALUES(?,?,?,?,?,?,?,?,?,?,?)''',
                (
                    lease_id,
                    resource_key,
                    transaction_id,
                    attempt_id,
                    holder_id,
                    token,
                    'ACTIVE',
                    ts,
                    ts,
                    ts + ttl_ms,
                    epoch,
                ),
            )
            self.conn.execute('UPDATE execution_attempts SET state=? WHERE attempt_id=?', ('CLAIMED', attempt_id))
            self._append_event(
                aggregate_type='LEASE',
                aggregate_id=lease_id,
                event_type='LEASE_ACQUIRED',
                payload={
                    'resource_key': resource_key,
                    'authority_epoch': epoch,
                    'fencing_token': token,
                    'attempt_id': attempt_id,
                },
                actor_id=actor_id,
                publish=True,
                occurred_at_ms=ts,
            )
            return lease_id, epoch, token

    def assert_fence(
        self,
        lease_id: str,
        authority_epoch: int,
        fencing_token: int,
        *,
        at_ms: int | None = None,
    ) -> None:
        ts = now_ms() if at_ms is None else at_ms
        row = self.conn.execute(
            '''SELECT l.state,l.expires_at_ms,l.resource_key,l.fencing_token,l.authority_epoch,
                      f.current_token,m.authority_epoch AS current_epoch
               FROM leases l
               JOIN resource_fences f ON f.resource_key=l.resource_key
               JOIN controller_meta m ON m.singleton=1
               WHERE l.lease_id=?''',
            (lease_id,),
        ).fetchone()
        if row is None or row['state'] != 'ACTIVE' or row['expires_at_ms'] <= ts:
            raise StaleFence('lease is not active')
        if row['authority_epoch'] != authority_epoch or row['current_epoch'] != authority_epoch:
            raise StaleFence('authority epoch is stale')
        if row['fencing_token'] != fencing_token or row['current_token'] != fencing_token:
            raise StaleFence('fencing token is stale')

    def transition_attempt(
        self,
        *,
        attempt_id: str,
        expected_state: str,
        new_state: str,
        actor_id: str,
        lease_id: str | None = None,
        authority_epoch: int | None = None,
        fencing_token: int | None = None,
        error_code: str | None = None,
    ) -> None:
        ts = now_ms()
        with self.immediate():
            row = self.conn.execute(
                '''SELECT a.state,a.transaction_id,t.command_id
                   FROM execution_attempts a JOIN transactions t ON t.transaction_id=a.transaction_id
                   WHERE a.attempt_id=?''',
                (attempt_id,),
            ).fetchone()
            if row is None:
                raise ControllerError('attempt not found')
            if row['state'] != expected_state:
                raise ControllerError(f'expected attempt {expected_state}, found {row["state"]}')

            lease_required = expected_state in {'CLAIMED', 'RUNNING', 'VERIFYING'} and new_state not in {'ABANDONED', 'CANCELLED'}
            if lease_required:
                if lease_id is None or authority_epoch is None or fencing_token is None:
                    raise StaleFence('active attempt transition requires lease epoch and fencing token')
                lease = self.conn.execute(
                    'SELECT attempt_id FROM leases WHERE lease_id=?', (lease_id,)
                ).fetchone()
                if lease is None or lease['attempt_id'] != attempt_id:
                    raise StaleFence('lease is not bound to this attempt')
                self.assert_fence(lease_id, authority_epoch, fencing_token, at_ms=ts)

            terminal = new_state in self.TERMINAL_ATTEMPT_STATES
            started = ts if new_state == 'RUNNING' else None
            self.conn.execute(
                '''UPDATE execution_attempts
                   SET state=?,
                       started_at_ms=CASE WHEN ? IS NOT NULL AND started_at_ms IS NULL THEN ? ELSE started_at_ms END,
                       completed_at_ms=CASE WHEN ? THEN ? ELSE completed_at_ms END,
                       error_code=CASE WHEN ? IS NOT NULL THEN ? ELSE error_code END
                   WHERE attempt_id=?''',
                (new_state, started, started, 1 if terminal else 0, ts, error_code, error_code, attempt_id),
            )
            self._append_event(
                aggregate_type='ATTEMPT',
                aggregate_id=attempt_id,
                event_type='ATTEMPT_STATE_CHANGED',
                payload={'from': expected_state, 'to': new_state, 'error_code': error_code},
                actor_id=actor_id,
                correlation_id=row['command_id'],
                publish=True,
                occurred_at_ms=ts,
            )

    def heartbeat_lease(
        self,
        lease_id: str,
        authority_epoch: int,
        fencing_token: int,
        ttl_ms: int,
        actor_id: str,
    ) -> None:
        if ttl_ms <= 0:
            raise ValueError('ttl_ms must be positive')
        ts = now_ms()
        with self.immediate():
            self.assert_fence(lease_id, authority_epoch, fencing_token, at_ms=ts)
            self.conn.execute(
                'UPDATE leases SET last_heartbeat_at_ms=?, expires_at_ms=? WHERE lease_id=?',
                (ts, ts + ttl_ms, lease_id),
            )
            self._append_event(
                aggregate_type='LEASE',
                aggregate_id=lease_id,
                event_type='LEASE_HEARTBEAT',
                payload={'authority_epoch': authority_epoch, 'fencing_token': fencing_token},
                actor_id=actor_id,
                publish=False,
                occurred_at_ms=ts,
            )

    def release_lease(self, lease_id: str, authority_epoch: int, fencing_token: int, actor_id: str) -> None:
        ts = now_ms()
        with self.immediate():
            self.assert_fence(lease_id, authority_epoch, fencing_token, at_ms=ts)
            row = self.conn.execute(
                '''SELECT l.resource_key,l.attempt_id,a.state AS attempt_state
                   FROM leases l JOIN execution_attempts a ON a.attempt_id=l.attempt_id
                   WHERE l.lease_id=?''',
                (lease_id,),
            ).fetchone()
            if row['attempt_state'] not in self.TERMINAL_ATTEMPT_STATES:
                raise ControllerError('lease may be released only after its attempt is terminal')
            self.conn.execute(
                "UPDATE leases SET state='RELEASED',released_at_ms=? WHERE lease_id=?",
                (ts, lease_id),
            )
            self._append_event(
                aggregate_type='LEASE',
                aggregate_id=lease_id,
                event_type='LEASE_RELEASED',
                payload={
                    'resource_key': row['resource_key'],
                    'authority_epoch': authority_epoch,
                    'fencing_token': fencing_token,
                    'attempt_id': row['attempt_id'],
                },
                actor_id=actor_id,
                publish=True,
                occurred_at_ms=ts,
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
            '''SELECT o.*,e.event_id,e.aggregate_type,e.aggregate_id,e.event_type,e.payload_canonical,
                      e.actor_id,e.occurred_at_ms,e.authority_epoch
               FROM outbox o JOIN controller_events e ON e.event_seq=o.event_seq
               WHERE o.destination=? AND o.state='PENDING' AND o.available_at_ms<=?
               ORDER BY e.authority_epoch,o.event_seq LIMIT 1''',
            (destination, now_ms()),
        ).fetchone()

    def mark_outbox_published(self, event_seq: int, destination: str = OUTBOX_DESTINATION) -> None:
        with self.immediate():
            cursor = self.conn.execute(
                '''UPDATE outbox SET state='PUBLISHED',attempts=attempts+1,published_at_ms=?,last_error=NULL
                   WHERE event_seq=? AND destination=? AND state='PENDING' ''',
                (now_ms(), event_seq, destination),
            )
            if cursor.rowcount != 1:
                raise ControllerError('outbox item is missing or no longer pending')

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
        epoch = int(
            self.conn.execute('SELECT authority_epoch FROM controller_meta WHERE singleton=1').fetchone()[0]
        )
        cursor = self.conn.execute(
            '''INSERT INTO controller_events(
                 event_id,aggregate_type,aggregate_id,event_type,payload_canonical,actor_id,
                 correlation_id,causation_event_id,occurred_at_ms,authority_epoch
               ) VALUES(?,?,?,?,?,?,?,?,?,?)''',
            (
                event_id,
                aggregate_type,
                aggregate_id,
                event_type,
                canonical_json(payload),
                actor_id,
                correlation_id,
                causation_event_id,
                ts,
                epoch,
            ),
        )
        event_seq = int(cursor.lastrowid)
        if publish:
            self.conn.execute(
                '''INSERT INTO outbox(event_seq,destination,state,attempts,available_at_ms)
                   VALUES(?,?, 'PENDING',0,?)''',
                (event_seq, self.OUTBOX_DESTINATION, ts),
            )
        return event_seq
