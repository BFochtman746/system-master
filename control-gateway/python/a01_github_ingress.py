from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Optional
from zoneinfo import ZoneInfo

from a01_supervisor_adapter import (
    ADMISSION_PROTOCOL,
    HANDOFF_PROTOCOL,
    canonical,
    digest,
    validate_gateway_handoff,
)
from a01_supervisor_coordination import COORDINATION_PROTOCOL, validate_coordination_contract

INGRESS_PROTOCOL = "control-gateway.a01-github-ingress.v1"
CURRENT_AUTHORITY_PATH = "governance/CURRENT-AUTHORITY.json"
A01_POLICY_PATH = "qualification/a01/a01-policy.json"
READY_STATES = {"READY"}
DEFAULT_EXECUTION_ORDER = 0
DEFAULT_PRIORITY = 100
DEFAULT_EXECUTOR_KIND = "LOCAL_AGENT"


class IngressError(RuntimeError):
    pass


def iso(value: dt.datetime) -> str:
    if value.tzinfo is None or value.utcoffset() is None:
        raise IngressError("timezone-aware datetime required")
    return value.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def parse_time(value: str) -> tuple[int, int]:
    try:
        hour, minute = (int(x) for x in value.split(":"))
    except Exception as exc:
        raise IngressError(f"invalid local time {value!r}") from exc
    if not 0 <= hour <= 23 or not 0 <= minute <= 59:
        raise IngressError(f"invalid local time {value!r}")
    return hour, minute


def session_date(now: dt.datetime, timezone_name: str = "America/New_York") -> str:
    """Return the stable night-session date.

    The session rolls at local noon, not midnight. A 23:57 kickoff and the 00:00-07:00
    execution window therefore share one session date, and repeated polling within that
    night produces the same delegation identities.
    """
    if now.tzinfo is None or now.utcoffset() is None:
        raise IngressError("timezone-aware datetime required")
    local = now.astimezone(ZoneInfo(timezone_name))
    day = local.date()
    if local.hour >= 12:
        day += dt.timedelta(days=1)
    return day.isoformat()


def night_window(session: str, *, timezone_name: str, start_local: str, end_local: str) -> tuple[str, str]:
    zone = ZoneInfo(timezone_name)
    day = dt.date.fromisoformat(session)
    sh, sm = parse_time(start_local)
    eh, em = parse_time(end_local)
    start = dt.datetime.combine(day, dt.time(sh, sm), tzinfo=zone)
    end = dt.datetime.combine(day, dt.time(eh, em), tzinfo=zone)
    if end <= start:
        end += dt.timedelta(days=1)
    return iso(start), iso(end)


class GitHubSource:
    """Read-only GitHub contents source.

    There is intentionally no write method. P12 transports repository authority to A-01;
    it never mutates repository state.
    """

    def __init__(
        self,
        owner: str,
        repo: str,
        *,
        ref: str = "main",
        token: Optional[str] = None,
        api_base: str = "https://api.github.com",
        timeout_seconds: int = 20,
    ) -> None:
        if not owner or not repo or not ref:
            raise ValueError("owner, repo, and ref are required")
        self.owner = owner
        self.repo = repo
        self.ref = ref
        self.token = token
        self.api_base = api_base.rstrip("/")
        self.timeout_seconds = timeout_seconds

    def read_text(self, path: str) -> str:
        quoted = urllib.parse.quote(path, safe="/")
        ref = urllib.parse.quote(self.ref, safe="")
        url = f"{self.api_base}/repos/{self.owner}/{self.repo}/contents/{quoted}?ref={ref}"
        headers = {
            "Accept": "application/vnd.github.raw+json",
            "User-Agent": "system-master-a01-ingress/1",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        request = urllib.request.Request(url, headers=headers, method="GET")
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                if response.status != 200:
                    raise IngressError(f"GitHub read {path} returned HTTP {response.status}")
                return response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            raise IngressError(f"GitHub read {path} returned HTTP {exc.code}") from exc
        except (urllib.error.URLError, TimeoutError, UnicodeDecodeError) as exc:
            raise IngressError(f"GitHub read {path} failed: {exc}") from exc

    def read_json(self, path: str) -> dict[str, Any]:
        try:
            value = json.loads(self.read_text(path))
        except json.JSONDecodeError as exc:
            raise IngressError(f"GitHub JSON {path} is invalid: {exc}") from exc
        if not isinstance(value, dict):
            raise IngressError(f"GitHub JSON {path} must be an object")
        return value


class KillSwitch:
    def __init__(self, state_dir: os.PathLike[str] | str) -> None:
        self.state_dir = Path(state_dir)
        self.path = self.state_dir / "NIGHT-HALT"

    def engaged(self) -> bool:
        return self.path.exists()

    def reason(self) -> Optional[str]:
        if not self.engaged():
            return None
        try:
            return self.path.read_text(encoding="utf-8").strip() or "HALTED"
        except OSError:
            return "HALTED"

    def engage(self, reason: str) -> None:
        if not isinstance(reason, str) or not reason.strip():
            raise ValueError("kill-switch reason is required")
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.path.write_text(reason.strip() + "\n", encoding="utf-8")

    def release(self) -> None:
        try:
            self.path.unlink()
        except FileNotFoundError:
            return


class NightBudget:
    """Durable P12 transport ceiling.

    P11 remains the authoritative claim budget. This separate ingress budget bounds how
    many distinct transport identities may be offered to P11 during one night and is
    deliberately non-refundable after reservation.
    """

    def __init__(
        self,
        state_dir: os.PathLike[str] | str,
        *,
        max_slots: int,
        timezone_name: str,
    ) -> None:
        if type(max_slots) is not int or not 1 <= max_slots <= 64:
            raise ValueError("max_slots must be an integer 1..64")
        self.state_dir = Path(state_dir)
        self.path = self.state_dir / "a01-ingress-night-budget.json"
        self.max_slots = max_slots
        self.timezone_name = timezone_name

    def _empty(self, session: str) -> dict[str, Any]:
        return {
            "budget_version": 1,
            "session_date": session,
            "timezone": self.timezone_name,
            "max_slots": self.max_slots,
            "reserved_delegation_ids": [],
        }

    def _load(self, session: str) -> dict[str, Any]:
        if not self.path.exists():
            return self._empty(session)
        try:
            value = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise IngressError(f"night budget state is unreadable: {exc}") from exc
        if not isinstance(value, dict):
            raise IngressError("night budget state must be an object")
        if value.get("session_date") != session:
            return self._empty(session)
        if value.get("timezone") != self.timezone_name:
            raise IngressError("night budget timezone drift")
        if value.get("max_slots") != self.max_slots:
            raise IngressError("night budget policy changed during active session")
        ids = value.get("reserved_delegation_ids")
        if not isinstance(ids, list) or any(not isinstance(x, str) or not x for x in ids):
            raise IngressError("night budget reservation ledger is invalid")
        if len(ids) != len(set(ids)) or len(ids) > self.max_slots:
            raise IngressError("night budget reservation ledger violates invariants")
        return value

    def _write(self, value: dict[str, Any]) -> None:
        self.state_dir.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(value, indent=2, sort_keys=True) + "\n"
        fd, tmp_name = tempfile.mkstemp(prefix="a01-ingress-budget-", suffix=".tmp", dir=str(self.state_dir))
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(tmp_name, self.path)
        finally:
            try:
                os.unlink(tmp_name)
            except FileNotFoundError:
                pass

    def snapshot(self, now: dt.datetime) -> dict[str, Any]:
        session = session_date(now, self.timezone_name)
        value = self._load(session)
        used = len(value["reserved_delegation_ids"])
        return {
            "session_date": session,
            "max_slots": self.max_slots,
            "used_slots": used,
            "remaining_slots": self.max_slots - used,
            "reserved_delegation_ids": list(value["reserved_delegation_ids"]),
        }

    def reserve(self, delegation_id: str, now: dt.datetime) -> bool:
        if not isinstance(delegation_id, str) or not delegation_id:
            raise ValueError("delegation_id is required")
        session = session_date(now, self.timezone_name)
        value = self._load(session)
        ids = list(value["reserved_delegation_ids"])
        if delegation_id in ids:
            return True
        if len(ids) >= self.max_slots:
            return False
        ids.append(delegation_id)
        value["reserved_delegation_ids"] = ids
        self._write(value)
        return True


@dataclass
class IngressResult:
    protocol_version: str = INGRESS_PROTOCOL
    status: str = "PASS"
    session_date: str = ""
    considered: int = 0
    enqueued: int = 0
    dry_run_built: int = 0
    skipped: list[dict[str, Any]] = field(default_factory=list)
    errors: list[dict[str, Any]] = field(default_factory=list)
    budget: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _identity(objective_id: str, control_head: str, session: str) -> tuple[str, str]:
    body = {"objective_id": objective_id, "control_head": control_head, "session_date": session}
    full = digest(body)
    return f"ING-{full[:16]}", f"INGRESS-{full[:32]}"


def build_handoff(
    delegation: dict[str, Any],
    *,
    control_head: str,
    control_ref: str,
    session: str,
    not_before: Optional[str],
    not_after: Optional[str],
    execution_order: int = DEFAULT_EXECUTION_ORDER,
    priority: int = DEFAULT_PRIORITY,
    source_path: Optional[str] = None,
    executor_kind: str = DEFAULT_EXECUTOR_KIND,
) -> dict[str, Any]:
    if not isinstance(delegation, dict):
        raise IngressError("delegation must be an object")
    owner_path = delegation.get("owner_path")
    objective_id = delegation.get("objective_id")
    obligation_id = delegation.get("obligation_id") or objective_id
    source_delegation_id = delegation.get("delegation_id")
    for value, label in (
        (owner_path, "owner_path"),
        (objective_id, "objective_id"),
        (obligation_id, "obligation_id"),
        (source_delegation_id, "source delegation_id"),
        (control_head, "control_head"),
        (control_ref, "control_ref"),
    ):
        if not isinstance(value, str) or not value:
            raise IngressError(f"{label} is required")
    if not owner_path.startswith("SYSTEM_MASTER/"):
        raise IngressError("owner_path is outside System Master")
    lane = owner_path.split("/", 1)[1]
    if "/" in lane:
        raise IngressError("ingress accepts peer-lane owner paths only")
    if type(execution_order) is not int or execution_order < 0:
        raise IngressError("execution_order must be nonnegative integer")
    if type(priority) is not int or not 0 <= priority <= 1000:
        raise IngressError("priority must be 0..1000")

    delegation_id, idempotency_key = _identity(objective_id, control_head, session)
    payload = {
        "source_protocol": "system-master.second-shift-delegation.v1",
        "source_path": source_path,
        "source_delegation_id": source_delegation_id,
        "session_date": session,
        "obligation_id": obligation_id,
        "completion_delta": delegation.get("completion_delta"),
        "stop_condition": delegation.get("stop_condition"),
        "allowed_work": delegation.get("allowed_work", []),
        "forbidden_authority": delegation.get("forbidden_authority", []),
        "on_pass": delegation.get("on_pass"),
        "on_failure": delegation.get("on_failure"),
        "semantic_priority": delegation.get("priority"),
    }
    payload_digest = digest(payload)

    receipt: dict[str, Any] = {
        "protocol_version": ADMISSION_PROTOCOL,
        "decision": "GRANTED",
        "task_id": obligation_id,
        "scheduling_owner": "A01_SUPERVISOR",
        "github_role": "ADMISSION_TRANSPORT_EVIDENCE_ONLY",
        "lane": lane,
        "owner_path": owner_path,
        "delegation_id": delegation_id,
        "objective_id": objective_id,
        "control_ref": control_ref,
        "control_head": control_head,
        "idempotency_key": idempotency_key,
        "executor_kind": executor_kind,
        "execution_class": "OVERNIGHT",
        "execution_order": execution_order,
        "priority": priority,
        "not_before": not_before,
        "not_after": not_after,
        "payload_digest": payload_digest,
        "session_date": session,
        "source_delegation_id": source_delegation_id,
    }
    receipt["admission_digest"] = digest(receipt)

    handoff: dict[str, Any] = {
        "protocol_version": HANDOFF_PROTOCOL,
        "admission_receipt": receipt,
        "scheduling_owner": "A01_SUPERVISOR",
        "github_role": "ADMISSION_TRANSPORT_EVIDENCE_ONLY",
        "lane": lane,
        "owner_path": owner_path,
        "delegation_id": delegation_id,
        "objective_id": objective_id,
        "control_ref": control_ref,
        "control_head": control_head,
        "idempotency_key": idempotency_key,
        "executor_kind": executor_kind,
        "execution_class": "OVERNIGHT",
        "execution_order": execution_order,
        "priority": priority,
        "not_before": not_before,
        "not_after": not_after,
        "payload_digest": payload_digest,
        "payload": payload,
    }
    handoff["handoff_digest"] = digest(handoff)
    validate_gateway_handoff(handoff)
    return handoff


def build_contract(
    handoff: dict[str, Any],
    *,
    graph_id: str,
    graph_version: int = 1,
    dependency_ids: Optional[list[str]] = None,
    resource_key: Optional[str] = None,
    max_concurrency: int = 1,
    cancellation_policy: str = "NO_CASCADE",
) -> dict[str, Any]:
    dependency_ids = sorted(set(dependency_ids or []))
    contract: dict[str, Any] = {
        "protocol_version": COORDINATION_PROTOCOL,
        "handoff_digest": handoff["handoff_digest"],
        "graph_id": graph_id,
        "graph_version": graph_version,
        "delegation_id": handoff["delegation_id"],
        "dependency_ids": dependency_ids,
        "resource_key": resource_key or f"OWNER-LANE:{handoff['lane']}",
        "max_concurrency": max_concurrency,
        "cancellation_policy": cancellation_policy,
    }
    contract["coordination_digest"] = digest(contract)
    validate_coordination_contract(handoff, contract)
    return contract


class Ingress:
    def __init__(
        self,
        source: Any,
        *,
        scheduler: Any = None,
        state_dir: os.PathLike[str] | str = ".a01-ingress-state",
        expected_authority_id: str = "CURRENT-AUTHORITY-005",
    ) -> None:
        if not hasattr(source, "read_json"):
            raise TypeError("source must provide read_json(path)")
        self.source = source
        self.scheduler = scheduler
        self.state_dir = Path(state_dir)
        self.expected_authority_id = expected_authority_id
        self.kill_switch = KillSwitch(self.state_dir)

    def _load_state(self) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
        authority = self.source.read_json(CURRENT_AUTHORITY_PATH)
        if authority.get("authority_id") != self.expected_authority_id:
            raise IngressError("current authority id mismatch")
        second_shift_path = authority.get("second_shift_registry")
        obligation_path = authority.get("obligation_registry")
        if not isinstance(second_shift_path, str) or not second_shift_path:
            raise IngressError("current authority lacks second_shift_registry")
        if not isinstance(obligation_path, str) or not obligation_path:
            raise IngressError("current authority lacks obligation_registry")
        second_shift = self.source.read_json(second_shift_path)
        obligations = self.source.read_json(obligation_path)
        policy = self.source.read_json(A01_POLICY_PATH)
        return authority, second_shift, obligations, policy

    @staticmethod
    def _policy(policy: dict[str, Any]) -> tuple[str, int, str, str]:
        overnight = policy.get("overnight")
        if not isinstance(overnight, dict) or overnight.get("enabled") is not True:
            raise IngressError("A-01 overnight policy is disabled or invalid")
        timezone_name = overnight.get("timezone")
        max_slots = overnight.get("max_slots")
        start_local = overnight.get("window_start_local")
        end_local = overnight.get("window_end_local")
        if timezone_name != "America/New_York":
            raise IngressError("A-01 ingress timezone differs from Second Shift authority")
        if type(max_slots) is not int or not 1 <= max_slots <= 64:
            raise IngressError("A-01 overnight max_slots must be integer 1..64")
        if not isinstance(start_local, str) or not isinstance(end_local, str):
            raise IngressError("A-01 overnight window is invalid")
        return timezone_name, max_slots, start_local, end_local

    @staticmethod
    def _obligation_index(obligations: dict[str, Any]) -> dict[str, dict[str, Any]]:
        rows = obligations.get("obligations")
        if not isinstance(rows, list):
            raise IngressError("obligation registry lacks obligations array")
        result: dict[str, dict[str, Any]] = {}
        for row in rows:
            if not isinstance(row, dict) or not isinstance(row.get("obligation_id"), str):
                raise IngressError("obligation registry row is invalid")
            result[row["obligation_id"]] = row
        return result

    def run_once(self, now: Optional[dt.datetime] = None, dry_run: bool = False) -> IngressResult:
        now = now or dt.datetime.now(dt.timezone.utc)
        result = IngressResult()
        if self.kill_switch.engaged():
            result.status = "HALTED"
            result.session_date = session_date(now)
            result.skipped.append({"reason": "KILL_SWITCH", "detail": self.kill_switch.reason()})
            return result

        try:
            authority, second_shift, obligations, policy = self._load_state()
            timezone_name, max_slots, start_local, end_local = self._policy(policy)
            session = session_date(now, timezone_name)
            result.session_date = session
            not_before, not_after = night_window(
                session,
                timezone_name=timezone_name,
                start_local=start_local,
                end_local=end_local,
            )
            budget = NightBudget(self.state_dir, max_slots=max_slots, timezone_name=timezone_name)
            obligation_index = self._obligation_index(obligations)
            owner_heads = obligations.get("owner_head_snapshot")
            owner_files = second_shift.get("owner_files")
            if not isinstance(owner_heads, dict) or not isinstance(owner_files, dict):
                raise IngressError("owner head snapshot or Second Shift owner_files is invalid")
            if set(owner_files) != set(owner_heads):
                raise IngressError("Second Shift owner coverage differs from obligation owner-head snapshot")

            for lane in sorted(owner_files):
                owner_path = f"SYSTEM_MASTER/{lane}"
                owner_file_path = owner_files[lane]
                owner_file = self.source.read_json(owner_file_path)
                if owner_file.get("owner_system_id") != lane or owner_file.get("owner_path") != owner_path:
                    raise IngressError(f"owner file identity mismatch for {lane}")
                control_ref = owner_file.get("control_ref")
                control_head = owner_file.get("last_known_control_head")
                if not isinstance(control_ref, str) or not isinstance(control_head, str):
                    raise IngressError(f"owner file control binding invalid for {lane}")
                if owner_heads.get(lane) != control_head:
                    raise IngressError(f"owner head snapshot mismatch for {lane}")
                active = owner_file.get("active_delegations")
                if not isinstance(active, list):
                    raise IngressError(f"owner file active_delegations invalid for {lane}")

                for delegation in active:
                    if not isinstance(delegation, dict):
                        result.errors.append({"owner_file": owner_file_path, "reason": "INVALID_DELEGATION_OBJECT"})
                        continue
                    state = delegation.get("state")
                    if state not in READY_STATES:
                        result.skipped.append({
                            "source_delegation_id": delegation.get("delegation_id"),
                            "reason": "NOT_READY",
                            "state": state,
                        })
                        continue
                    result.considered += 1
                    if self.kill_switch.engaged():
                        result.status = "HALTED"
                        result.skipped.append({
                            "source_delegation_id": delegation.get("delegation_id"),
                            "reason": "KILL_SWITCH",
                            "detail": self.kill_switch.reason(),
                        })
                        result.budget = budget.snapshot(now)
                        return result
                    if delegation.get("owner_path") != owner_path:
                        result.skipped.append({"source_delegation_id": delegation.get("delegation_id"), "reason": "OWNER_MISMATCH"})
                        continue
                    if delegation.get("valid_for_control_ref") != control_ref or delegation.get("valid_for_control_head") != control_head:
                        result.skipped.append({"source_delegation_id": delegation.get("delegation_id"), "reason": "STALE_CONTROL_BINDING"})
                        continue
                    obligation_id = delegation.get("obligation_id") or delegation.get("objective_id")
                    obligation = obligation_index.get(obligation_id)
                    if obligation is None:
                        result.skipped.append({"source_delegation_id": delegation.get("delegation_id"), "reason": "MISSING_CURRENT_OBLIGATION"})
                        continue
                    if obligation.get("owner_path") not in (owner_path, "SYSTEM_MASTER/SHARED_INFRASTRUCTURE", "SYSTEM_MASTER/SHARED_INFRASTRUCTURE/A01"):
                        result.skipped.append({"source_delegation_id": delegation.get("delegation_id"), "reason": "OBLIGATION_OWNER_MISMATCH"})
                        continue
                    if obligation.get("state") in {"CLOSED", "HOLD", "BLOCKED", "SUPERSEDED"}:
                        result.skipped.append({"source_delegation_id": delegation.get("delegation_id"), "reason": "OBLIGATION_NOT_EXECUTABLE", "state": obligation.get("state")})
                        continue
                    try:
                        handoff = build_handoff(
                            delegation,
                            control_head=control_head,
                            control_ref=control_ref,
                            session=session,
                            not_before=not_before,
                            not_after=not_after,
                            source_path=owner_file_path,
                        )
                        contract = build_contract(
                            handoff,
                            graph_id=f"SECOND-SHIFT:{session}:{lane}",
                            resource_key=f"OWNER-LANE:{lane}",
                            max_concurrency=1,
                        )
                    except Exception as exc:
                        result.skipped.append({"source_delegation_id": delegation.get("delegation_id"), "reason": "BUILD_FAILED", "detail": str(exc)})
                        continue

                    if dry_run:
                        result.dry_run_built += 1
                        continue
                    if self.scheduler is None:
                        result.errors.append({"source_delegation_id": delegation.get("delegation_id"), "reason": "SCHEDULER_NOT_BOUND"})
                        continue
                    if not budget.reserve(handoff["delegation_id"], now):
                        result.skipped.append({"source_delegation_id": delegation.get("delegation_id"), "reason": "NIGHT_BUDGET_EXHAUSTED"})
                        continue
                    try:
                        self.scheduler.enqueue(handoff, contract, now=now)
                    except Exception as exc:
                        result.skipped.append({"source_delegation_id": delegation.get("delegation_id"), "reason": "ENQUEUE_REFUSED", "detail": str(exc)})
                        continue
                    result.enqueued += 1

            result.budget = budget.snapshot(now)
            if result.errors:
                result.status = "PASS_WITH_ERRORS"
            return result
        except Exception as exc:
            result.status = "ERROR"
            result.errors.append({"reason": "INGRESS_FAILURE", "detail": str(exc)})
            return result


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only GitHub to A-01 ingress builder")
    parser.add_argument("--owner", default=os.environ.get("A01_INGRESS_OWNER", "BFochtman746"))
    parser.add_argument("--repo", default=os.environ.get("A01_INGRESS_REPO", "system-master"))
    parser.add_argument("--ref", default=os.environ.get("A01_INGRESS_REF", "main"))
    parser.add_argument("--state-dir", default=os.environ.get("A01_INGRESS_STATE_DIR", ".a01-ingress-state"))
    parser.add_argument("--dry-run", action="store_true", default=True)
    args = parser.parse_args(argv)
    source = GitHubSource(args.owner, args.repo, ref=args.ref, token=os.environ.get("A01_INGRESS_TOKEN"))
    ingress = Ingress(source, scheduler=None, state_dir=args.state_dir)
    result = ingress.run_once(dry_run=True)
    print(json.dumps(result.to_dict(), sort_keys=True))
    return 0 if result.status in {"PASS", "HALTED"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
