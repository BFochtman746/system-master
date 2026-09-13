"""A-01 GitHub ingress — the missing transport layer.

Nothing on A-01 reads GitHub. Work reaches the night scheduler's queue only if a
human puts it there, which makes the operator the message bus. This module closes
that loop: it reads the governance state of record from GitHub read-only, mints a
local A-01 admission receipt, builds a frozen gateway handoff plus coordination
contract, and enqueues it with the existing night scheduler.

Authority model is unchanged and deliberately so:
  * A-01 remains the sole scheduling owner. Admission is minted here, locally.
  * GitHub stays ADMISSION_TRANSPORT_EVIDENCE_ONLY. This module never writes to it
    and requires only a read-scoped token.
  * Enqueue is idempotent on delegation_id. The scheduler rejects identity
    collisions, so a re-poll of unchanged state is a no-op, not a duplicate.

Operational safety, both of which the estate previously lacked:
  * A kill switch. If the halt file exists, nothing is enqueued. Checked on every
    pass, so it takes effect mid-night without restarting anything.
  * A global night budget. max_delegations and max_minutes bound the whole night,
    not one lineage. A repair loop across a dozen obligations cannot eat the window.

Usage:
    python -m a01_github_ingress --dry-run          # build and print, enqueue nothing
    python -m a01_github_ingress --once             # one pass
    python -m a01_github_ingress --daemon           # poll until the window closes
    python -m a01_github_ingress --halt / --resume  # kill switch

Environment:
    A01_INGRESS_REPO         owner/name           (default BFochtman746/system-master)
    A01_INGRESS_REF          git ref              (default main)
    A01_INGRESS_TOKEN        read-scoped PAT      (optional for a public repo)
    A01_INGRESS_STATE_DIR    state/halt location  (default <repo>/control-gateway/state)
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Optional

from a01_supervisor_adapter import (
    ADMISSION_PROTOCOL,
    HANDOFF_PROTOCOL,
    digest,
    validate_gateway_handoff,
)
from a01_supervisor_coordination_strict import (
    COORDINATION_PROTOCOL,
    validate_coordination_contract,
)

INGRESS_PROTOCOL = "control-gateway.a01-github-ingress.v1"
AUTHORITY_PATH = "governance/CURRENT-AUTHORITY.json"
ENQUEUEABLE_STATES = ("READY",)
DEFAULT_REPO = "BFochtman746/system-master"


class IngressError(RuntimeError):
    pass


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def iso(value: dt.datetime) -> str:
    return value.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")


# ---------------------------------------------------------------------------
# Budget and kill switch
# ---------------------------------------------------------------------------


@dataclass
class NightBudget:
    """A ceiling on the whole night, not on one failure lineage."""

    max_delegations: int = 8
    max_minutes: int = 420
    window_start: Optional[dt.datetime] = None
    delegations_used: int = 0
    minutes_committed: int = 0

    def __post_init__(self) -> None:
        if self.max_delegations < 0:
            raise IngressError("max_delegations must be nonnegative")
        if self.max_minutes < 0:
            raise IngressError("max_minutes must be nonnegative")
        self.window_start = self.window_start or utcnow()

    def remaining_delegations(self) -> int:
        return max(0, self.max_delegations - self.delegations_used)

    def remaining_minutes(self) -> int:
        return max(0, self.max_minutes - self.minutes_committed)

    def admits(self, minutes: int) -> bool:
        return self.remaining_delegations() > 0 and minutes <= self.remaining_minutes()

    def commit(self, minutes: int) -> None:
        if not self.admits(minutes):
            raise IngressError("night budget exhausted")
        self.delegations_used += 1
        self.minutes_committed += minutes

    def snapshot(self) -> dict[str, Any]:
        return {
            "max_delegations": self.max_delegations,
            "max_minutes": self.max_minutes,
            "delegations_used": self.delegations_used,
            "minutes_committed": self.minutes_committed,
            "remaining_delegations": self.remaining_delegations(),
            "remaining_minutes": self.remaining_minutes(),
        }


class KillSwitch:
    """A file whose existence halts ingress. Checked every pass, never cached."""

    def __init__(self, state_dir: str):
        self.state_dir = state_dir
        self.path = os.path.join(state_dir, "NIGHT-HALT")

    def engaged(self) -> bool:
        return os.path.exists(self.path)

    def reason(self) -> str:
        if not self.engaged():
            return ""
        try:
            with open(self.path, "r", encoding="utf-8") as handle:
                return handle.read().strip() or "no reason recorded"
        except OSError:
            return "halt file unreadable"

    def engage(self, reason: str) -> None:
        os.makedirs(self.state_dir, exist_ok=True)
        with open(self.path, "w", encoding="utf-8") as handle:
            handle.write(f"{iso(utcnow())} {reason}\n")

    def release(self) -> None:
        try:
            os.remove(self.path)
        except FileNotFoundError:
            pass


# ---------------------------------------------------------------------------
# GitHub read-only source
# ---------------------------------------------------------------------------


class GitHubSource:
    """Read-only. This class has no write method and must never grow one."""

    def __init__(self, repo: str = DEFAULT_REPO, ref: str = "main", token: Optional[str] = None, timeout: int = 30):
        self.repo = repo
        self.ref = ref
        self.token = token
        self.timeout = timeout

    def _get(self, path: str) -> dict[str, Any]:
        url = f"https://api.github.com/repos/{self.repo}/contents/{path}?ref={self.ref}"
        request = urllib.request.Request(url, method="GET")
        request.add_header("Accept", "application/vnd.github+json")
        request.add_header("User-Agent", "a01-github-ingress")
        if self.token:
            request.add_header("Authorization", f"Bearer {self.token}")
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                if response.status != 200:
                    raise IngressError(f"github returned {response.status} for {path}")
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            raise IngressError(f"github HTTP {error.code} for {path}") from error
        except urllib.error.URLError as error:
            raise IngressError(f"github unreachable for {path}: {error.reason}") from error

    def read_json(self, path: str) -> dict[str, Any]:
        payload = self._get(path)
        if payload.get("encoding") != "base64" or "content" not in payload:
            raise IngressError(f"unexpected content encoding for {path}")
        return json.loads(base64.b64decode(payload["content"]).decode("utf-8"))

    def head_sha(self, path: str = AUTHORITY_PATH) -> str:
        return str(self._get(path)["sha"])


# ---------------------------------------------------------------------------
# Handoff construction
# ---------------------------------------------------------------------------


def obligation_lane(obligation: dict[str, Any]) -> tuple[str, str]:
    owner_path = obligation.get("owner_path") or obligation.get("owner") or ""
    if not owner_path.startswith("SYSTEM_MASTER/"):
        raise IngressError(f"obligation {obligation.get('obligation_id')} has no resolvable owner lane")
    return owner_path.split("/")[-1], owner_path


def build_handoff(
    obligation: dict[str, Any],
    *,
    control_head: str,
    control_ref: str,
    not_before: str,
    not_after: str,
    execution_order: int,
    session_date: str,
    priority: int = 500,
    executor_kind: str = "A01_LOCAL_WORKER",
    registry_id: str = "",
) -> dict[str, Any]:
    """Build a frozen gateway handoff. Raises unless it validates."""

    objective_id = obligation.get("obligation_id") or obligation.get("id")
    if not objective_id:
        raise IngressError("obligation has no identifier")
    lane, owner_path = obligation_lane(obligation)

    # Identity is "this objective, at this control head, on this night" —
    # deliberately NOT the poll instant. Deriving it from not_before made every
    # re-poll a new delegation, which is the duplicate-work failure idempotency
    # exists to prevent. Window times may move; identity may not.
    identity = digest({"objective_id": objective_id, "control_head": control_head, "session_date": session_date})
    delegation_id = f"ING-{objective_id}-{identity[:16]}"

    payload = {
        "ingress_protocol": INGRESS_PROTOCOL,
        "objective_id": objective_id,
        "lane": lane,
        "owner_path": owner_path,
        "obligation_state": obligation.get("state") or obligation.get("standing") or "",
        "title": obligation.get("title", ""),
        "objective": obligation.get("objective", ""),
        "acceptance_target": obligation.get("acceptance_target", ""),
        "evidence_target": obligation.get("evidence_target", ""),
        "source_registry": registry_id,
        "source_ref": control_ref,
    }
    payload_digest = digest(payload)

    # The receipt must mirror every bound field of the handoff exactly. The
    # supervisor re-checks all fourteen, so an admission can never be reused for
    # a differently-shaped request.
    receipt_body = {
        "protocol_version": ADMISSION_PROTOCOL,
        "decision": "GRANTED",
        "scheduling_owner": "A01_SUPERVISOR",
        "github_role": "ADMISSION_TRANSPORT_EVIDENCE_ONLY",
        "granted_at": iso(utcnow()),
        "granted_by": INGRESS_PROTOCOL,
        "lane": lane,
        "owner_path": owner_path,
        "delegation_id": delegation_id,
        "objective_id": objective_id,
        "control_ref": control_ref,
        "control_head": control_head,
        "idempotency_key": identity,
        "executor_kind": executor_kind,
        "execution_class": "OVERNIGHT",
        "execution_order": execution_order,
        "priority": priority,
        "not_before": not_before,
        "not_after": not_after,
        "payload_digest": payload_digest,
    }
    admission_receipt = dict(receipt_body)
    admission_receipt["admission_digest"] = digest(receipt_body)

    body = {
        "protocol_version": HANDOFF_PROTOCOL,
        "admission_receipt": admission_receipt,
        "scheduling_owner": "A01_SUPERVISOR",
        "github_role": "ADMISSION_TRANSPORT_EVIDENCE_ONLY",
        "lane": lane,
        "owner_path": owner_path,
        "delegation_id": delegation_id,
        "objective_id": objective_id,
        "control_ref": control_ref,
        "control_head": control_head,
        "idempotency_key": identity,
        "executor_kind": executor_kind,
        "execution_class": "OVERNIGHT",
        "execution_order": execution_order,
        "priority": priority,
        "not_before": not_before,
        "not_after": not_after,
        "payload_digest": payload_digest,
        "payload": payload,
    }
    handoff = dict(body)
    handoff["handoff_digest"] = digest(body)
    validate_gateway_handoff(handoff)
    return handoff


def build_contract(
    handoff: dict[str, Any],
    *,
    graph_id: str,
    graph_version: int = 1,
    dependency_ids: Optional[list[str]] = None,
    max_concurrency: int = 1,
    cancellation_policy: str = "NO_CASCADE",
) -> dict[str, Any]:
    """Build the coordination contract bound to an exact handoff."""

    deps = sorted(set(dependency_ids or []))
    body = {
        "protocol_version": COORDINATION_PROTOCOL,
        "handoff_digest": handoff["handoff_digest"],
        "graph_id": graph_id,
        "graph_version": graph_version,
        "delegation_id": handoff["delegation_id"],
        "dependency_ids": deps,
        "resource_key": f"lane:{handoff['lane']}",
        "max_concurrency": max_concurrency,
        "cancellation_policy": cancellation_policy,
    }
    contract = dict(body)
    contract["coordination_digest"] = digest(body)
    validate_coordination_contract(handoff, contract)
    return contract


# ---------------------------------------------------------------------------
# Ingress pass
# ---------------------------------------------------------------------------


@dataclass
class IngressResult:
    halted: bool = False
    halt_reason: str = ""
    considered: int = 0
    built: list[dict[str, Any]] = field(default_factory=list)
    skipped: list[dict[str, str]] = field(default_factory=list)
    enqueued: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    budget: dict[str, Any] = field(default_factory=dict)

    def summary(self) -> dict[str, Any]:
        return {
            "halted": self.halted,
            "halt_reason": self.halt_reason,
            "considered": self.considered,
            "built": len(self.built),
            "enqueued": len(self.enqueued),
            "skipped": len(self.skipped),
            "errors": self.errors,
            "budget": self.budget,
        }


class Ingress:
    def __init__(
        self,
        source: GitHubSource,
        kill_switch: KillSwitch,
        budget: NightBudget,
        scheduler: Any = None,
        minutes_per_delegation: int = 45,
    ):
        self.source = source
        self.kill_switch = kill_switch
        self.budget = budget
        self.scheduler = scheduler
        self.minutes_per_delegation = minutes_per_delegation

    def window(self, now: Optional[dt.datetime] = None, hours: int = 8) -> tuple[str, str]:
        start = now or utcnow()
        return iso(start), iso(start + dt.timedelta(hours=hours))

    @staticmethod
    def session_date(now: Optional[dt.datetime] = None, rollover_hour: int = 12) -> str:
        """The night this pass belongs to.

        A session that starts at 22:00 and continues past midnight is one night,
        so the date rolls at midday rather than at midnight.
        """
        moment = now or utcnow()
        anchor = moment if moment.hour >= rollover_hour else moment - dt.timedelta(days=1)
        return anchor.astimezone(dt.timezone.utc).date().isoformat()

    def run_once(self, now: Optional[dt.datetime] = None, dry_run: bool = False) -> IngressResult:
        result = IngressResult()

        if self.kill_switch.engaged():
            result.halted = True
            result.halt_reason = self.kill_switch.reason()
            result.budget = self.budget.snapshot()
            return result

        try:
            authority = self.source.read_json(AUTHORITY_PATH)
            registry_path = authority.get("obligation_registry")
            if not registry_path:
                raise IngressError("CURRENT-AUTHORITY declares no obligation_registry")
            registry = self.source.read_json(registry_path)
            control_head = self.source.head_sha()
        except IngressError as error:
            result.errors.append(str(error))
            result.budget = self.budget.snapshot()
            return result

        not_before, not_after = self.window(now)
        session_date = self.session_date(now)
        obligations = [
            o for o in registry.get("obligations", [])
            if (o.get("state") or o.get("standing")) in ENQUEUEABLE_STATES
        ]
        result.considered = len(obligations)

        for order, obligation in enumerate(obligations):
            oid = obligation.get("obligation_id") or obligation.get("id") or "(unidentified)"

            # Re-checked every iteration so a mid-night halt stops the next item.
            if self.kill_switch.engaged():
                result.halted = True
                result.halt_reason = self.kill_switch.reason()
                break
            if not self.budget.admits(self.minutes_per_delegation):
                result.skipped.append({"objective_id": oid, "reason": "NIGHT_BUDGET_EXHAUSTED"})
                continue

            try:
                handoff = build_handoff(
                    obligation,
                    control_head=control_head,
                    control_ref=self.source.ref,
                    not_before=not_before,
                    not_after=not_after,
                    execution_order=order,
                    session_date=session_date,
                    registry_id=registry.get("registry_id", ""),
                )
                contract = build_contract(handoff, graph_id=registry.get("registry_id", "INGRESS"))
            except Exception as error:  # noqa: BLE001 - one bad obligation must not end the night
                result.skipped.append({"objective_id": oid, "reason": f"BUILD_FAILED: {error}"})
                continue

            result.built.append({"delegation_id": handoff["delegation_id"], "objective_id": oid, "lane": handoff["lane"]})

            if dry_run or self.scheduler is None:
                self.budget.commit(self.minutes_per_delegation)
                continue

            try:
                self.scheduler.enqueue(handoff, contract, now=now)
                self.budget.commit(self.minutes_per_delegation)
                result.enqueued.append(handoff["delegation_id"])
            except Exception as error:  # noqa: BLE001
                result.skipped.append({"objective_id": oid, "reason": f"ENQUEUE_REFUSED: {error}"})

        result.budget = self.budget.snapshot()
        return result


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _state_dir() -> str:
    explicit = os.environ.get("A01_INGRESS_STATE_DIR")
    if explicit:
        return explicit
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "state")


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="A-01 GitHub ingress")
    parser.add_argument("--once", action="store_true", help="run a single pass")
    parser.add_argument("--daemon", action="store_true", help="poll until the budget is spent")
    parser.add_argument("--dry-run", action="store_true", help="build and report, enqueue nothing")
    parser.add_argument("--interval", type=int, default=300, help="daemon poll interval in seconds")
    parser.add_argument("--max-delegations", type=int, default=8)
    parser.add_argument("--max-minutes", type=int, default=420)
    parser.add_argument("--halt", metavar="REASON", help="engage the kill switch and exit")
    parser.add_argument("--resume", action="store_true", help="release the kill switch and exit")
    parser.add_argument("--status", action="store_true", help="report kill switch state and exit")
    args = parser.parse_args(argv)

    kill_switch = KillSwitch(_state_dir())

    if args.halt:
        kill_switch.engage(args.halt)
        print(json.dumps({"halted": True, "reason": args.halt, "path": kill_switch.path}))
        return 0
    if args.resume:
        kill_switch.release()
        print(json.dumps({"halted": False, "path": kill_switch.path}))
        return 0
    if args.status:
        print(json.dumps({"halted": kill_switch.engaged(), "reason": kill_switch.reason(), "path": kill_switch.path}))
        return 0

    source = GitHubSource(
        repo=os.environ.get("A01_INGRESS_REPO", DEFAULT_REPO),
        ref=os.environ.get("A01_INGRESS_REF", "main"),
        token=os.environ.get("A01_INGRESS_TOKEN"),
    )
    budget = NightBudget(max_delegations=args.max_delegations, max_minutes=args.max_minutes)

    # The scheduler is intentionally not constructed here. Wire it in the service
    # entry point where the SupervisorStore lifetime is owned, and pass it in.
    ingress = Ingress(source, kill_switch, budget, scheduler=None)

    if args.daemon:
        while budget.remaining_delegations() > 0 and not kill_switch.engaged():
            result = ingress.run_once(dry_run=args.dry_run)
            print(json.dumps(result.summary()))
            if result.halted or result.errors:
                break
            time.sleep(max(1, args.interval))
        return 0

    result = ingress.run_once(dry_run=args.dry_run or not args.once)
    print(json.dumps(result.summary(), indent=2))
    return 1 if result.errors else 0


if __name__ == "__main__":
    sys.exit(main())
