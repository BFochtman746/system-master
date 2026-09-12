from __future__ import annotations

from a01_supervisor_coordination_strict import (
    CANCELLATION_POLICIES,
    COORDINATION_PROTOCOL,
    CoordinationError,
    SupervisorCoordinationAdapter as _StrictSupervisorCoordinationAdapter,
    validate_coordination_contract,
)

_COORDINATION_SCHEMA_OBJECTS = frozenset(
    {
        "coordination_tasks",
        "coordination_dependencies",
        "coordination_resource_limits",
        "ix_coordination_dependencies_dependency",
        "ix_coordination_tasks_resource",
    }
)


class SupervisorCoordinationAdapter(_StrictSupervisorCoordinationAdapter):
    """CG-009 coordination adapter with restart-safe schema bootstrap.

    Reopened scheduler processes take a read-only sqlite_master fast path when the
    coordination schema already exists. Only a new/incomplete database becomes a
    schema writer, and that bootstrap is serialized with BEGIN IMMEDIATE.
    """

    def _schema_ready(self) -> bool:
        rows = self.store.conn.execute(
            "SELECT name FROM sqlite_master WHERE "
            "(type='table' AND name IN ('coordination_tasks','coordination_dependencies','coordination_resource_limits')) "
            "OR (type='index' AND name IN ('ix_coordination_dependencies_dependency','ix_coordination_tasks_resource'))"
        ).fetchall()
        return {str(row[0]) for row in rows} == _COORDINATION_SCHEMA_OBJECTS

    def _init_schema(self) -> None:
        if self._schema_ready():
            return
        try:
            self.store.conn.executescript(
                """
                BEGIN IMMEDIATE;
                CREATE TABLE IF NOT EXISTS coordination_tasks (
                  delegation_id TEXT PRIMARY KEY,
                  handoff_digest TEXT NOT NULL,
                  graph_id TEXT NOT NULL,
                  graph_version INTEGER NOT NULL,
                  resource_key TEXT NOT NULL,
                  max_concurrency INTEGER NOT NULL,
                  cancellation_policy TEXT NOT NULL,
                  cancel_state TEXT NOT NULL DEFAULT 'NONE',
                  cancel_reason TEXT,
                  updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS coordination_dependencies (
                  delegation_id TEXT NOT NULL,
                  dependency_id TEXT NOT NULL,
                  PRIMARY KEY(delegation_id, dependency_id)
                );
                CREATE TABLE IF NOT EXISTS coordination_resource_limits (
                  resource_key TEXT PRIMARY KEY,
                  max_concurrency INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS ix_coordination_dependencies_dependency
                  ON coordination_dependencies(dependency_id);
                CREATE INDEX IF NOT EXISTS ix_coordination_tasks_resource
                  ON coordination_tasks(resource_key);
                COMMIT;
                """
            )
        except Exception:
            if self.store.conn.in_transaction:
                self.store.conn.execute("ROLLBACK")
            raise


__all__ = [
    "CANCELLATION_POLICIES",
    "COORDINATION_PROTOCOL",
    "CoordinationError",
    "SupervisorCoordinationAdapter",
    "validate_coordination_contract",
]
