from __future__ import annotations

import hashlib
import os
import re
import sqlite3
from dataclasses import dataclass
from pathlib import Path


class MigrationError(RuntimeError):
    pass


class MigrationChecksumMismatch(MigrationError):
    pass


class MigrationSequenceError(MigrationError):
    pass


class UntrackedSchema(MigrationError):
    pass


@dataclass(frozen=True)
class Migration:
    version: int
    name: str
    path: Path
    checksum_sha256: str
    sql: str


_MIGRATION_RE = re.compile(r"^(\d{3})_(.+)\.sql$")


def _connect(path: Path) -> sqlite3.Connection:
    con = sqlite3.connect(str(path), timeout=5.0, isolation_level=None)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    con.execute("PRAGMA synchronous=FULL")
    con.execute("PRAGMA busy_timeout=5000")
    con.execute("PRAGMA trusted_schema=OFF")
    return con


def _checksum(sql: str) -> str:
    return hashlib.sha256(sql.encode("utf-8")).hexdigest()


def discover_migrations(schema_dir: str | Path) -> list[Migration]:
    root = Path(schema_dir)
    migrations: list[Migration] = []
    for path in sorted(root.glob("*.sql")):
        match = _MIGRATION_RE.match(path.name)
        if not match:
            continue
        version = int(match.group(1))
        sql = path.read_text(encoding="utf-8")
        migrations.append(Migration(version, path.stem, path, _checksum(sql), sql))
    if not migrations:
        raise MigrationSequenceError("no migrations found")
    expected = list(range(1, len(migrations) + 1))
    actual = [migration.version for migration in migrations]
    if actual != expected:
        raise MigrationSequenceError(f"migration versions must be contiguous from 1: {actual}")
    return migrations


def _verify_integrity(con: sqlite3.Connection) -> None:
    integrity = str(con.execute("PRAGMA integrity_check").fetchone()[0])
    if integrity.lower() != "ok":
        raise MigrationError(f"integrity_check failed: {integrity}")
    foreign_key_errors = list(con.execute("PRAGMA foreign_key_check"))
    if foreign_key_errors:
        raise MigrationError(f"foreign_key_check failed: {foreign_key_errors!r}")


def _record_migration(con: sqlite3.Connection, migration: Migration) -> None:
    con.execute(
        "INSERT INTO schema_migrations(version,name,checksum_sha256,applied_at_ms) "
        "VALUES(?,?,?,CAST(strftime('%s','now') AS INTEGER)*1000)",
        (migration.version, migration.name, migration.checksum_sha256),
    )


def _apply_bootstrap(con: sqlite3.Connection, migration: Migration) -> None:
    if migration.version != 1:
        raise MigrationSequenceError("bootstrap migration must be version 1")
    con.executescript(migration.sql)
    _record_migration(con, migration)


def _apply_upgrade(con: sqlite3.Connection, migration: Migration) -> None:
    script = (
        "BEGIN IMMEDIATE;\n"
        + migration.sql
        + "\n"
        + "INSERT INTO schema_migrations(version,name,checksum_sha256,applied_at_ms) VALUES("
        + f"{migration.version},"
        + "'" + migration.name.replace("'", "''") + "',"
        + "'" + migration.checksum_sha256 + "',"
        + "CAST(strftime('%s','now') AS INTEGER)*1000);\n"
        + "COMMIT;\n"
    )
    try:
        con.executescript(script)
    except BaseException:
        if con.in_transaction:
            con.execute("ROLLBACK")
        raise


def _verify_applied(con: sqlite3.Connection, migrations: list[Migration]) -> int:
    table = con.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
    ).fetchone()
    if table is None:
        return 0
    rows = list(
        con.execute(
            "SELECT version,name,checksum_sha256 FROM schema_migrations ORDER BY version"
        )
    )
    if not rows:
        return 0
    versions = [int(row["version"]) for row in rows]
    if versions != list(range(1, versions[-1] + 1)):
        raise MigrationSequenceError(f"applied migrations are not contiguous: {versions}")
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
    # Windows' CRT commit primitive, used by os.fsync(), requires a writable
    # descriptor. Open read/write even though this helper does not modify bytes.
    with path.open("r+b") as handle:
        handle.flush()
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
