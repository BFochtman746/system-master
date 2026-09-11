from __future__ import annotations

import errno
import json
import os
import uuid
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any

from .reliability import ReliabilityManager
from .store import ControllerError, InvalidState, new_uuid7, now_ms


class ControllerAlreadyRunning(ControllerError):
    code = "CONTROLLER_ALREADY_RUNNING"


def _atomic_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp")
    data = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    try:
        with temp.open("wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, path)
        if os.name != "nt":
            try:
                directory_fd = os.open(str(path.parent), os.O_RDONLY)
            except OSError:
                directory_fd = None
            if directory_fd is not None:
                try:
                    os.fsync(directory_fd)
                except OSError:
                    pass
                finally:
                    os.close(directory_fd)
    finally:
        if temp.exists():
            try:
                temp.unlink()
            except OSError:
                pass


class ProcessOwnershipLock:
    def __init__(self, path: str | Path, *, instance_id: str | None = None):
        self.path = Path(path).resolve()
        self.metadata_path = self.path.with_name(self.path.name + ".owner.json")
        self.instance_id = instance_id or new_uuid7()
        self._handle = None
        self._held = False

    @property
    def owned(self) -> bool:
        return self._held

    def fileno(self) -> int:
        if self._handle is None:
            raise InvalidState("controller ownership is not held")
        return int(self._handle.fileno())

    def _lock(self, fd: int) -> None:
        os.lseek(fd, 0, os.SEEK_SET)
        if os.name == "nt":
            import msvcrt

            msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
            return

        import fcntl

        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)

    def _unlock(self, fd: int) -> None:
        os.lseek(fd, 0, os.SEEK_SET)
        if os.name == "nt":
            import msvcrt

            msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
            return

        import fcntl

        fcntl.flock(fd, fcntl.LOCK_UN)

    def _owner_payload(self, state: str) -> dict[str, Any]:
        return {
            "instance_id": self.instance_id,
            "pid": os.getpid(),
            "state": state,
            "updated_at_ms": now_ms(),
        }

    def _close_os_lock(self) -> None:
        handle = self._handle
        if handle is None:
            self._held = False
            return
        try:
            if self._held:
                self._unlock(handle.fileno())
        finally:
            self._held = False
            self._handle = None
            handle.close()

    def acquire(self) -> None:
        if self._held:
            raise InvalidState("controller ownership is already held by this instance")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(str(self.path), os.O_RDWR | os.O_CREAT, 0o600)
        os.set_inheritable(fd, False)
        handle = os.fdopen(fd, "r+b", buffering=0)
        try:
            if os.fstat(fd).st_size == 0:
                handle.write(b"\0")
                handle.flush()
                os.fsync(fd)
            handle.seek(0)
            try:
                self._lock(fd)
            except OSError as exc:
                handle.close()
                if exc.errno in {errno.EACCES, errno.EAGAIN, errno.EDEADLK} or os.name == "nt":
                    raise ControllerAlreadyRunning("controller ownership is already held") from exc
                raise
            self._handle = handle
            self._held = True
            try:
                _atomic_json(self.metadata_path, self._owner_payload("OWNED"))
            except BaseException:
                self._close_os_lock()
                raise
        except BaseException:
            if self._handle is None and not handle.closed:
                handle.close()
            raise

    def release(self) -> None:
        if not self._held:
            if self._handle is not None:
                self._handle.close()
                self._handle = None
            return
        error: BaseException | None = None
        try:
            _atomic_json(self.metadata_path, self._owner_payload("RELEASED"))
        except BaseException as exc:
            error = exc
        finally:
            self._close_os_lock()
        if error is not None:
            raise error

    def __enter__(self) -> ProcessOwnershipLock:
        self.acquire()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.release()


class ControllerRuntime:
    def __init__(self, store, *, recovery_manager=None):
        self.store = store
        self.db_path = Path(store.db_path).resolve()
        self.lock_path = self.db_path.with_name(self.db_path.name + ".controller.lock")
        self.status_path = self.db_path.with_name(self.db_path.name + ".controller.status.json")
        self.instance_id = new_uuid7()
        self.ownership = ProcessOwnershipLock(self.lock_path, instance_id=self.instance_id)
        self.recovery_manager = recovery_manager or ReliabilityManager(store)
        self.state = "CREATED"
        self.recovery_report = None

    @property
    def ready(self) -> bool:
        return self.state == "READY" and self.ownership.owned

    def _publish(self, state: str, *, recovery=None, error_code: str | None = None) -> None:
        if not self.ownership.owned:
            raise InvalidState("only the controller owner may publish runtime status")
        payload: dict[str, Any] = {
            "instance_id": self.instance_id,
            "pid": os.getpid(),
            "state": state,
            "database": str(self.db_path),
            "updated_at_ms": now_ms(),
        }
        if recovery is not None:
            if is_dataclass(recovery):
                payload["recovery"] = asdict(recovery)
            elif isinstance(recovery, dict):
                payload["recovery"] = dict(recovery)
            else:
                raise TypeError("recovery report must be a dataclass or mapping")
        if error_code is not None:
            payload["error_code"] = error_code
        _atomic_json(self.status_path, payload)

    def start(self):
        if self.ownership.owned or self.state in {"STARTING", "RECOVERING", "READY"}:
            raise InvalidState("controller runtime is already active")
        try:
            self.ownership.acquire()
        except ControllerAlreadyRunning:
            self.state = "CONTENDED"
            raise

        try:
            self.state = "STARTING"
            self._publish(self.state)
            self.store.initialize()
            self.state = "RECOVERING"
            self._publish(self.state)
            report = self.recovery_manager.recover_after_restart()
            self.recovery_report = report
            self.state = "READY"
            self._publish(self.state, recovery=report)
            return report
        except BaseException as exc:
            self.state = "FAILED"
            try:
                self._publish(
                    self.state,
                    error_code=str(getattr(exc, "code", type(exc).__name__)),
                )
            finally:
                self.ownership.release()
            raise

    def stop(self) -> None:
        if not self.ownership.owned:
            return
        try:
            self.state = "STOPPING"
            self._publish(self.state)
            self.state = "STOPPED"
            self._publish(self.state)
        finally:
            self.ownership.release()

    def __enter__(self) -> ControllerRuntime:
        self.start()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.stop()
