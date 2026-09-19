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
    digest,
    validate_gateway_handoff,
)
from a01_supervisor_coordination import COORDINATION_PROTOCOL, validate_coordination_contract

INGRESS_PROTOCOL = "control-gateway.a01-github-ingress.v1"
EXECUTION_ENVELOPE_PROTOCOL = "control-gateway.a01-github-ingress-execution.v1"
CURRENT_AUTHORITY_PATH = "governance/CURRENT-AUTHORITY.json"
A01_POLICY_PATH = "qualification/a01/a01-policy.json"
A01_REGISTRY_PATH = "qualification/a01/registry.json"
READY_STATES = {"READY"}
NON_EXECUTABLE_OBLIGATION_STATES = {"CLOSED", "HOLD", "BLOCKED", "SUPERSEDED", "CANCELLED"}
SHARED_OWNER_PATHS = {"SYSTEM_MASTER/SHARED_INFRASTRUCTURE", "SYSTEM_MASTER/SHARED_INFRASTRUCTURE/A01"}
SUPPORTED_EXECUTOR = "A01_CONTROL_PLANE_QUALIFICATION"


class IngressError(RuntimeError):
    pass


def iso(value: dt.datetime) -> str:
    if value.tzinfo is None or value.utcoffset() is None:
        raise IngressError("timezone-aware datetime required")
    return value.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def parse_iso(value: str) -> dt.datetime:
    if not isinstance(value, str) or not value:
        raise IngressError("ISO timestamp is required")
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise IngressError(f"invalid ISO timestamp {value!r}") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise IngressError("ISO timestamp must be timezone-aware")
    return parsed.astimezone(dt.timezone.utc)


def parse_time(value: str) -> tuple[int, int]:
    try:
        hour, minute = (int(x) for x in value.split(":"))
    except Exception as exc:
        raise IngressError(f"invalid local time {value!r}") from exc
    if not 0 <= hour <= 23 or not 0 <= minute <= 59:
        raise IngressError(f"invalid local time {value!r}")
    return hour, minute


def session_date(now: dt.datetime, timezone_name: str = "America/New_York") -> str:
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
    """Read-only GitHub authority source. There is intentionally no write method."""

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

    @property
    def repository_full_name(self) -> str:
        return f"{self.owner}/{self.repo}"

    def _request(self, url: str, *, accept: str) -> bytes:
        headers = {
            "Accept": accept,
            "User-Agent": "system-master-a01-ingress/1",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if self.token:
            headers["Author" + "ization"] = "Bear" + "er " + self.token
        request = urllib.request.Request(url, headers=headers, method="GET")
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                if response.status != 200:
                    raise IngressError(f"GitHub read returned HTTP {response.status}")
                return response.read()
        except urllib.error.HTTPError as exc:
            raise IngressError(f"GitHub read returned HTTP {exc.code}") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise IngressError(f"GitHub read failed: {exc}") from exc

    def read_text(self, path: str) -> str:
        quoted = urllib.parse.quote(path, safe="/")
        ref = urllib.parse.quote(self.ref, safe="")
        url = f"{self.api_base}/repos/{self.owner}/{self.repo}/contents/{quoted}?ref={ref}"
        try:
            return self._request(url, accept="application/vnd.github.raw+json").decode("utf-8")
        except UnicodeDecodeError as exc:
            raise IngressError(f"GitHub text {path} is not UTF-8") from exc

    def read_json(self, path: str) -> dict[str, Any]:
        try:
            value = json.loads(self.read_text(path))
        except json.JSONDecodeError as exc:
            raise IngressError(f"GitHub JSON {path} is invalid: {exc}") from exc
        if not isinstance(value, dict):
            raise IngressError(f"GitHub JSON {path} must be an object")
        return value

    def resolve_ref_head(self, ref: str) -> str:
        if not isinstance(ref, str) or not ref:
            raise IngressError("control ref is required")
        encoded = urllib.parse.quote(ref, safe="")
        url = f"{self.api_base}/repos/{self.owner}/{self.repo}/branches/{encoded}"
        try:
            value = json.loads(self._request(url, accept="application/vnd.github+json").decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise IngressError(f"GitHub branch response for {ref} is invalid") from exc
        sha = value.get("commit", {}).get("sha") if isinstance(value, dict) else None
        if not _is_sha(sha):
            raise IngressError(f"GitHub branch {ref} did not resolve to an exact SHA")
        return sha.lower()


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
    """Additional durable transport ceiling; P11 remains authoritative for claims."""

    def __init__(self, state_dir: os.PathLike[str] | str, *, max_slots: int, timezone_name: str) -> None:
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


def _is_sha(value: Any) -> bool:
    return isinstance(value, str) and len(value) == 40 and all(ch in "0123456789abcdefABCDEF" for ch in value)


def _required_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise IngressError(f"{label} must be a non-empty string")
    return value


def validate_a01_execution_envelope(
    delegation: dict[str, Any],
    envelope: dict[str, Any],
    *,
    lane: str,
    owner_path: str,
    control_ref: str,
    control_head: str,
    obligation_id: str,
    qualification_registry: dict[str, Any],
    repository_full_name: str,
    expected_not_before: str,
    expected_not_after: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Validate already-admitted A-01 authority without manufacturing any of it."""
    if not isinstance(envelope, dict):
        raise IngressError("a01_execution must be an object")
    expected_fields = {"protocol_version", "qualification_id", "subject_sha", "handoff", "coordination_contract"}
    if set(envelope) != expected_fields:
        raise IngressError("a01_execution fields differ from frozen ingress contract")
    if envelope["protocol_version"] != EXECUTION_ENVELOPE_PROTOCOL:
        raise IngressError("a01_execution protocol mismatch")

    qualification_id = _required_string(envelope["qualification_id"], "qualification_id")
    subject_sha = _required_string(envelope["subject_sha"], "subject_sha")
    if not _is_sha(subject_sha):
        raise IngressError("subject_sha must be a 40-character hexadecimal Git SHA")
    subject_sha = subject_sha.lower()

    qualifications = qualification_registry.get("qualifications")
    if not isinstance(qualifications, dict):
        raise IngressError("A-01 qualification registry lacks qualifications")
    qualification = qualifications.get(qualification_id)
    if not isinstance(qualification, dict):
        raise IngressError("a01_execution qualifier is not registered")
    if qualification.get("source") != "subject":
        raise IngressError("overnight ingress requires a subject-bound qualifier")
    if qualification.get("overnight_eligible") is not True:
        raise IngressError("registered qualifier is not overnight eligible")
    registered_workstream = _required_string(qualification.get("workstream_id"), "registered qualifier workstream_id")

    handoff = envelope["handoff"]
    contract = envelope["coordination_contract"]
    validate_gateway_handoff(handoff)
    validate_coordination_contract(handoff, contract)

    if handoff.get("protocol_version") != HANDOFF_PROTOCOL:
        raise IngressError("handoff protocol mismatch")
    if contract.get("protocol_version") != COORDINATION_PROTOCOL:
        raise IngressError("coordination protocol mismatch")
    if handoff.get("executor_kind") != SUPPORTED_EXECUTOR:
        raise IngressError("ingress executor is not supported by the production A-01 worker")
    if handoff.get("execution_class") != "OVERNIGHT":
        raise IngressError("P12 ingress accepts OVERNIGHT execution only")

    source_delegation_id = _required_string(delegation.get("delegation_id"), "source delegation_id")
    objective_id = _required_string(delegation.get("objective_id"), "source objective_id")
    required_identity = {
        "lane": lane,
        "owner_path": owner_path,
        "delegation_id": source_delegation_id,
        "objective_id": objective_id,
        "control_ref": control_ref,
        "control_head": control_head,
    }
    for key, expected in required_identity.items():
        if handoff.get(key) != expected:
            raise IngressError(f"handoff {key} is not bound to current owner delegation identity")

    if delegation.get("valid_for_control_ref") != control_ref or delegation.get("valid_for_control_head") != control_head:
        raise IngressError("source delegation is stale against live owner control")

    receipt = handoff.get("admission_receipt")
    if not isinstance(receipt, dict) or receipt.get("protocol_version") != ADMISSION_PROTOCOL:
        raise IngressError("already-granted A-01 admission receipt is required")
    _required_string(receipt.get("admission_id"), "admission_id")
    _required_string(receipt.get("request_digest"), "request_digest")
    task_id = _required_string(receipt.get("task_id"), "admission task_id")
    if task_id != obligation_id:
        raise IngressError("A-01 admission task_id differs from current obligation")
    if receipt.get("decision") != "GRANTED":
        raise IngressError("A-01 admission was not granted")
    if receipt.get("repository") != repository_full_name:
        raise IngressError("A-01 admission receipt repository mismatch")
    if receipt.get("workstream_id") != registered_workstream:
        raise IngressError("A-01 admission workstream differs from registered qualifier")

    authoritative_subject = receipt.get("authoritative_subject")
    if not isinstance(authoritative_subject, dict):
        raise IngressError("A-01 admission receipt lacks authoritative_subject")
    if authoritative_subject.get("algorithm") != "sha1" or str(authoritative_subject.get("oid", "")).lower() != subject_sha:
        raise IngressError("A-01 admission subject differs from execution subject_sha")

    payload = handoff.get("payload")
    if not isinstance(payload, dict):
        raise IngressError("A-01 execution payload must be an object")
    if payload.get("qualification_id") != qualification_id:
        raise IngressError("payload qualification_id differs from a01_execution qualifier")
    if str(payload.get("subject_sha", "")).lower() != subject_sha:
        raise IngressError("payload subject_sha differs from a01_execution subject")
    if payload.get("workstream_id") != registered_workstream:
        raise IngressError("payload workstream_id differs from registered qualifier")
    control_plane_sha = payload.get("control_plane_sha")
    if control_plane_sha is not None and str(control_plane_sha).lower() != subject_sha:
        raise IngressError("payload control_plane_sha differs from exact subject")
    if handoff.get("payload_digest") != digest(payload):
        raise IngressError("payload digest differs from admitted payload")

    if parse_iso(handoff.get("not_before")) != parse_iso(expected_not_before):
        raise IngressError("admitted not_before differs from current night window")
    if parse_iso(handoff.get("not_after")) != parse_iso(expected_not_after):
        raise IngressError("admitted not_after differs from current night window")

    if contract.get("handoff_digest") != handoff.get("handoff_digest"):
        raise IngressError("coordination contract is not bound to exact admitted handoff")
    if contract.get("delegation_id") != source_delegation_id:
        raise IngressError("coordination contract delegation differs from source delegation")
    if contract.get("resource_key") != f"OWNER-LANE:{lane}":
        raise IngressError("coordination resource_key must bind the exact owner lane")
    if contract.get("max_concurrency") != 1:
        raise IngressError("coordination max_concurrency must preserve one mutation claim per owner lane")

    return handoff, contract


class Ingress:
    def __init__(
        self,
        source: Any,
        *,
        scheduler: Any = None,
        state_dir: os.PathLike[str] | str = ".a01-ingress-state",
        expected_authority_id: str = "CURRENT-AUTHORITY-005",
        repository_full_name: Optional[str] = None,
    ) -> None:
        if not hasattr(source, "read_json") or not hasattr(source, "resolve_ref_head"):
            raise TypeError("source must provide read_json(path) and resolve_ref_head(ref)")
        self.source = source
        self.scheduler = scheduler
        self.state_dir = Path(state_dir)
        self.expected_authority_id = expected_authority_id
        self.repository_full_name = repository_full_name or getattr(source, "repository_full_name", None)
        if not isinstance(self.repository_full_name, str) or "/" not in self.repository_full_name:
            raise ValueError("repository_full_name is required")
        self.kill_switch = KillSwitch(self.state_dir)

    def _load_state(self) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
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
        qualification_registry = self.source.read_json(A01_REGISTRY_PATH)
        return authority, second_shift, obligations, policy, qualification_registry

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
            if row["obligation_id"] in result:
                raise IngressError("duplicate obligation_id in current registry")
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
            _, second_shift, obligations, policy, qualification_registry = self._load_state()
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
            coverage_routes = second_shift.get("coverage_routes")
            if not isinstance(owner_heads, dict) or not isinstance(owner_files, dict):
                raise IngressError("owner head snapshot or Second Shift owner_files is invalid")
            if not isinstance(coverage_routes, dict):
                raise IngressError("Second Shift coverage_routes is invalid")
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
                if not isinstance(control_ref, str) or not _is_sha(control_head):
                    raise IngressError(f"owner file control binding invalid for {lane}")
                control_head = control_head.lower()
                snapshot_head = owner_heads.get(lane)
                if not _is_sha(snapshot_head) or snapshot_head.lower() != control_head:
                    raise IngressError(f"owner head snapshot mismatch for {lane}")
                live_head = self.source.resolve_ref_head(control_ref)
                if live_head.lower() != control_head:
                    raise IngressError(f"live owner control head drift for {lane}")

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
                    if delegation.get("valid_for_control_ref") != control_ref or str(delegation.get("valid_for_control_head", "")).lower() != control_head:
                        result.skipped.append({"source_delegation_id": delegation.get("delegation_id"), "reason": "STALE_CONTROL_BINDING"})
                        continue

                    obligation_id = delegation.get("obligation_id") or delegation.get("objective_id")
                    obligation = obligation_index.get(obligation_id)
                    if obligation is None:
                        result.skipped.append({"source_delegation_id": delegation.get("delegation_id"), "reason": "MISSING_CURRENT_OBLIGATION"})
                        continue
                    obligation_owner = obligation.get("owner_path")
                    owner_matches = obligation_owner == owner_path
                    if obligation_owner in SHARED_OWNER_PATHS:
                        owner_matches = (
                            obligation.get("administrative_owner") == owner_path
                            and coverage_routes.get(obligation_owner) == lane
                        )
                    if not owner_matches:
                        result.skipped.append({"source_delegation_id": delegation.get("delegation_id"), "reason": "OBLIGATION_OWNER_MISMATCH"})
                        continue
                    if obligation.get("state") in NON_EXECUTABLE_OBLIGATION_STATES:
                        result.skipped.append({
                            "source_delegation_id": delegation.get("delegation_id"),
                            "reason": "OBLIGATION_NOT_EXECUTABLE",
                            "state": obligation.get("state"),
                        })
                        continue

                    envelope = delegation.get("a01_execution")
                    if envelope is None:
                        result.skipped.append({
                            "source_delegation_id": delegation.get("delegation_id"),
                            "reason": "NO_PRE_ADMITTED_A01_EXECUTION",
                        })
                        continue
                    try:
                        handoff, contract = validate_a01_execution_envelope(
                            delegation,
                            envelope,
                            lane=lane,
                            owner_path=owner_path,
                            control_ref=control_ref,
                            control_head=control_head,
                            obligation_id=obligation_id,
                            qualification_registry=qualification_registry,
                            repository_full_name=self.repository_full_name,
                            expected_not_before=not_before,
                            expected_not_after=not_after,
                        )
                    except Exception as exc:
                        result.skipped.append({
                            "source_delegation_id": delegation.get("delegation_id"),
                            "reason": "A01_EXECUTION_REVALIDATION_FAILED",
                            "detail": str(exc),
                        })
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
                        result.skipped.append({
                            "source_delegation_id": delegation.get("delegation_id"),
                            "reason": "P11_ENQUEUE_REFUSED",
                            "detail": str(exc),
                        })
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
    parser = argparse.ArgumentParser(description="Read-only GitHub to A-01 ingress transport")
    parser.add_argument("--owner", default="BFochtman746")
    parser.add_argument("--repo", default="system-master")
    parser.add_argument("--ref", default="main")
    parser.add_argument("--token", default=os.environ.get("GITHUB_" + "TOKEN"))
    parser.add_argument("--state-dir", default=".a01-ingress-state")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--kill", metavar="REASON")
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args(argv)

    switch = KillSwitch(args.state_dir)
    if args.kill:
        switch.engage(args.kill)
        print(json.dumps({"status": "HALTED", "reason": switch.reason()}, sort_keys=True))
        return 0
    if args.resume:
        switch.release()
        print(json.dumps({"status": "RESUMED"}, sort_keys=True))
        return 0

    source = GitHubSource(args.owner, args.repo, ref=args.ref, token=args.token)
    ingress = Ingress(source, state_dir=args.state_dir)
    result = ingress.run_once(dry_run=args.dry_run)
    print(json.dumps(result.to_dict(), indent=2, sort_keys=True))
    return 0 if result.status in {"PASS", "PASS_WITH_ERRORS", "HALTED"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
