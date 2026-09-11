from __future__ import annotations

import hashlib
import os
import re
import sqlite3
from dataclasses import dataclass
from pathlib import Path

_MIGRATION_RE = re.compile(r"^(?P<version>[0-9]{3})_(?P<name>[a-z0-9_]+)\.sql$")


class MigrationError(RuntimeError):
    code = "MIGRATION_ERROR"


class MigrationChecksumMismatch(MigrationError):
    code = "MIGRATION_CHECKSUM_MISMATCH"


class MigrationSequenceError(MigrationError):
    code = "MIGRATION_SEQUENCE_ERROR"


class UntrackedSchema(MigrationError):
    code = "UNTRACKED_SCHEMA"


@dataclass(frozen=True)
class Migration:
    version: int
    name: str
    path: Path
    checksum_sha256: str
    sql: str


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def discover_migrations(schema_dir: str | Path) -> list[Migration]:
    directory = Path(schema_dir)
    migrations: list[Migration] = []
    for path in directory.glob("*.sql"):
        match = _MIGRATION_RE.fullmatch(path.name)
        if not match:
            continue
        raw = path.read_bytes()
        migrations.append(
            Migration(
                version=int(match.group("version")),
                name=match.group("name"),
                path=path,
                checksum_sha256=_sha256_bytes(raw),
                sql=raw.decode("utf-8"),
            )
        )
    migrations.sort(key=lambda item: item.version)
    if not migrations or migrations[0].version != 1:
        raise MigrationSequenceError("migration sequence must begin at version 001")
    expected = list(range(1, len(migrations) + 1))
    actual = [item.version for item in migrations]
    if actual != expected:
        raise MigrationSequenceError(f"migration versions must be contiguous: expected {expected}, got {actual}")
    if len({item.name for item in migrations}) != len(migrations):
        raise MigrationSequenceError("migration names must be unique")
    return migrations


def _connect(path: Path) -> sqlite3.Connection:
    con = sqlite3.connect(path, timeout=5.0, isolation_level=None)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    con.execute("PRAGMA synchronous=FULL")
    con.execute("PRAGMA busy_timeout=5000")
    return con


def _sql_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _migration_table_exists(con: sqlite3.Connection) -> bool:
    return con.execute(
        "SELECT 1 FROM sqlite_schema WHERE type='table' AND name='schema_migrations'"
    ).fetchone() is not None


def _verify_integrity(con: sqlite3.Connection) -> None:
    result = con.execute("PRAGMA integrity_check").fetchone()
    if not result or result[0] != "ok":
        raise MigrationError(f"integrity_check failed: {result[0] if result else 'no result'}")
    violations = con.execute("PRAGMA foreign_key_check").fetchall()
    if violations:
        raise MigrationError(f"foreign_key_check failed with {len(violations)} violation(s)")


def _record_sql(migration: Migration) -> str:
    return (
        "INSERT INTO schema_migrations(version,name,checksum_sha256,applied_at_ms) VALUES("
        f"{migration.version},{_sql_quote(migration.name)},{_sql_quote(migration.checksum_sha256)},"
        "CAST(unixepoch('subsec')*1000 AS INTEGER));"
    )


def _apply_bootstrap(con: sqlite3.Connection, migration: Migration) -> None:
    # 001 contains journal-mode PRAGMAs that must run outside a transaction.
    # A brand-new DB is built in a temporary file, so a crash cannot expose a
    # half-created canonical runtime database.
    con.executescript(migration.sql)
    if not _migration_table_exists(con):
        raise MigrationError("bootstrap migration did not create schema_migrations")
    con.execute("BEGIN IMMEDIATE")
    try:
        con.execute(
            "INSERT INTO schema_migrations(version,name,checksum_sha256,applied_at_ms) VALUES(?,?,?,CAST(unixepoch('subsec')*1000 AS INTEGER))",
            (migration.version, migration.name, migration.checksum_sha256),
        )
        con.execute("COMMIT")
    except BaseException:
        if con.in_transaction:
            con.execute("ROLLBACK")
        raise


def _apply_upgrade(con: sqlite3.Connection, migration: Migration) -> None:
    script = "BEGIN IMMEDIATE;\n" + migration.sql + "\n" + _record_sql(migration) + "\nCOMMIT;"
    try:
        con.executescript(script)
    except BaseException:
        if con.in_transaction:
            con.execute("ROLLBACK")
        raise


def _verify_applied(con: sqlite3.Connection, migrations: list[Migration]) -> int:
    if not _migration_table_exists(con):
        user_version = int(con.execute("PRAGMA user_version").fetchone()[0])
        if user_version != 0:
            raise UntrackedSchema(f"database has user_version={user_version} but no migration ledger")
        return 0

    rows = con.execute(
        "SELECT version,name,checksum_sha256 FROM schema_migrations ORDER BY version"
    ).fetchall()
    if not rows:
        user_version = int(con.execute("PRAGMA user_version").fetchone()[0])
        if user_version != 0:
            raise UntrackedSchema(
                f"database has user_version={user_version} but schema_migrations is empty"
            )
        return 0

    versions = [int(row["version"]) for row in rows]
    expected = list(range(1, len(rows) + 1))
    if versions != expected:
        raise MigrationSequenceError(
            f"applied migration ledger has a gap: expected {expected}, got {versions}"
        )
    by_version = {migration.version: migration for migration in migrations}
    for row in rows:
        version = int(row["version"])
        migration = by_version.get(version)
        if migration is None:
            raise MigrationSequenceError(f"applied migration {version} is absent from source")
        if row["name"] != migration.name or row["checksum_sha256"] != migration.checksum_sha256:
            raise MigrationChecksumMismatch(
                f"migration {version:03d} source differs from the immutable applied record"
            )
    return versions[-1]


def _apply_pending(con: sqlite3.Connection, migrations: list[Migration], current: int) -> None:
    for migration in migrations:
        if migration.version <= current:
            continue
        _apply_upgrade(con, migration)
        _verify_integrity(con)


def _fsync_file(path: Path) -> None:
    with path.open("rb") as handle:
        os.fsync(handle.fileno())


def _fsync_directory(path: Path) -> None:
    try:
        fd = os.open(path, os.O_RDONLY)
    except (AttributeError, OSError):
        return
    try:
        os.fsync(fd)
    except OSError:
        pass
    finally:
        os.close(fd)


def initialize_database(db_path: str | Path, schema_dir: str | Path) -> None:
    target = Path(db_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    migrations = discover_migrations(schema_dir)

    if target.exists() and target.stat().st_size > 0:
        con = _connect(target)
        try:
            current = _verify_applied(con, migrations)
            if current == 0:
                raise UntrackedSchema("existing non-empty database is not migration-tracked")
            _apply_pending(con, migrations, current)
            _verify_integrity(con)
            latest = migrations[-1].version
            if int(con.execute("PRAGMA user_version").fetchone()[0]) != latest:
                raise MigrationError("PRAGMA user_version does not match latest applied migration")
        finally:
            con.close()
        return

    temp = target.with_name(f".{target.name}.bootstrap.{os.getpid()}.tmp")
    for suffix in ("", "-wal", "-shm"):
        stale = Path(str(temp) + suffix)
        if stale.exists():
            stale.unlink()

    con = _connect(temp)
    try:
        _apply_bootstrap(con, migrations[0])
        _apply_pending(con, migrations, 1)
        _verify_integrity(con)
        latest = migrations[-1].version
        if int(con.execute("PRAGMA user_version").fetchone()[0]) != latest:
            raise MigrationError("bootstrap user_version does not match latest migration")
        con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    except BaseException:
        con.close()
        for suffix in ("", "-wal", "-shm"):
            failed = Path(str(temp) + suffix)
            if failed.exists():
                failed.unlink()
        raise
    else:
        con.close()

    _fsync_file(temp)
    os.replace(temp, target)
    _fsync_directory(target.parent)


def verify_migrations(db_path: str | Path, schema_dir: str | Path) -> None:
    migrations = discover_migrations(schema_dir)
    con = _connect(Path(db_path))
    try:
        current = _verify_applied(con, migrations)
        if current != migrations[-1].version:
            raise MigrationError(
                f"database is at migration {current}, source requires {migrations[-1].version}"
            )
        if int(con.execute("PRAGMA user_version").fetchone()[0]) != current:
            raise MigrationError("PRAGMA user_version disagrees with migration ledger")
        _verify_integrity(con)
    finally:
        con.close()
