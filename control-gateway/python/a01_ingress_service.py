from __future__ import annotations

"""A-01 service wrapper for overnight ingress and explicit user-directed RUN NOW.

Production ownership:
- GitHub remains read-only authority/transport input on A-01.
- A01NightScheduler remains the only autonomous overnight queue/claim authority.
- USER_DIRECTED_RUN_NOW is accepted only from an owner-authenticated GitHub issue
  carrying a pre-admitted IMMEDIATE handoff and coordination contract.
- Both paths share the same SupervisorStore, lease/fence/idempotency machinery, and
  execution worker. No second scheduler or writer is introduced.
"""

import argparse
import datetime as dt
import json
import os
import time
import urllib.parse
from pathlib import Path
from typing import Any, Optional

from a01_github_ingress import (
    CURRENT_AUTHORITY_PATH,
    NON_EXECUTABLE_OBLIGATION_STATES,
    SHARED_OWNER_PATHS,
    SUPPORTED_EXECUTORS,
    GitHubSource,
    Ingress,
    _is_sha,
)
from a01_night_scheduler import A01NightScheduler
from a01_supervisor_adapter import validate_gateway_handoff
from a01_supervisor_coordination import SupervisorCoordinationAdapter, validate_coordination_contract
from tools.second_shift_supervisor_v2 import SupervisorStore

RUN_NOW_PROTOCOL = "control-gateway.a01-user-directed-run-now.v1"
RUN_NOW_AUTH_PROTOCOL = "control-gateway.a01-user-directed-run-now-authorization.v1"
RUN_NOW_TITLE_PREFIX = "[CONTROL-GATEWAY-A01-RUN-NOW] "
ACTIVE_WORK_HEAD_PATH = "control-gateway-state/active-work/head.json"


class RunNowError(RuntimeError):
    pass


class RunNowGitHubSource(GitHubSource):
    """Read-only GitHub source extended with owner-authenticated issue transport."""

    def read_json_at(self, path: str, ref: str) -> dict[str, Any]:
        quoted = urllib.parse.quote(path, safe="/")
        encoded_ref = urllib.parse.quote(ref, safe="")
        url = f"{self.api_base}/repos/{self.owner}/{self.repo}/contents/{quoted}?ref={encoded_ref}"
        try:
            value = json.loads(self._request(url, accept="application/vnd.github.raw+json").decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise RunNowError(f"GitHub JSON {path}@{ref} is invalid") from exc
        if not isinstance(value, dict):
            raise RunNowError(f"GitHub JSON {path}@{ref} must be an object")
        return value

    def list_run_now_issues(self) -> list[dict[str, Any]]:
        url = (
            f"{self.api_base}/repos/{self.owner}/{self.repo}/issues"
            "?state=open&sort=created&direction=desc&per_page=100"
        )
        try:
            value = json.loads(self._request(url, accept="application/vnd.github+json").decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise RunNowError("GitHub issue response is invalid") from exc
        if not isinstance(value, list):
            raise RunNowError("GitHub issue response must be an array")
        return [
            issue
            for issue in value
            if isinstance(issue, dict)
            and "pull_request" not in issue
            and str(issue.get("title", "")).startswith(RUN_NOW_TITLE_PREFIX)
        ]


def build_runtime(
    db_path: os.PathLike[str] | str,
) -> tuple[SupervisorStore, A01NightScheduler, SupervisorCoordinationAdapter]:
    store = SupervisorStore(Path(db_path))
    try:
        scheduler = A01NightScheduler(store)
        coordination = SupervisorCoordinationAdapter(store)
    except Exception:
        store.close()
        raise
    return store, scheduler, coordination


def build_scheduler(db_path: os.PathLike[str] | str) -> tuple[SupervisorStore, A01NightScheduler]:
    """Compatibility wrapper retained for existing callers/tests."""
    store, scheduler, _coordination = build_runtime(db_path)
    return store, scheduler


def _emit(kind: str, **payload: Any) -> None:
    value = {"kind": kind, **payload}
    print(json.dumps(value, sort_keys=True), flush=True)


def _plain(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise RunNowError(f"{label} must be an object")
    return value


def _required(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise RunNowError(f"{label} must be non-empty text")
    return value


def _current_obligation(
    obligations: dict[str, Any],
    second_shift: dict[str, Any],
    *,
    lane: str,
    owner_path: str,
    obligation_id: str,
) -> dict[str, Any]:
    rows = obligations.get("obligations")
    if not isinstance(rows, list):
        raise RunNowError("current obligation registry lacks obligations")
    matches = [row for row in rows if isinstance(row, dict) and row.get("obligation_id") == obligation_id]
    if len(matches) != 1:
        raise RunNowError("run-now obligation is not uniquely current")
    row = matches[0]
    obligation_owner = row.get("owner_path")
    owner_matches = obligation_owner == owner_path
    if obligation_owner in SHARED_OWNER_PATHS:
        coverage = second_shift.get("coverage_routes")
        owner_matches = (
            isinstance(coverage, dict)
            and row.get("administrative_owner") == owner_path
            and coverage.get(obligation_owner) == lane
        )
    if not owner_matches:
        raise RunNowError("run-now obligation owner differs from current lane")
    if row.get("state") in NON_EXECUTABLE_OBLIGATION_STATES:
        raise RunNowError("run-now obligation is not executable")
    return row


class UserDirectedRunNowIngress:
    """Validate an explicit owner issue, then bind/claim existing IMMEDIATE machinery."""

    def __init__(self, source: Any, coordination: SupervisorCoordinationAdapter):
        if not hasattr(source, "read_json") or not hasattr(source, "read_json_at"):
            raise TypeError("run-now source must provide read_json/read_json_at")
        if not hasattr(source, "resolve_ref_head") or not hasattr(source, "list_run_now_issues"):
            raise TypeError("run-now source must provide resolve_ref_head/list_run_now_issues")
        if not isinstance(coordination, SupervisorCoordinationAdapter):
            raise TypeError("coordination must be SupervisorCoordinationAdapter")
        self.source = source
        self.coordination = coordination

    def _validate_issue(self, issue: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], str]:
        owner = _required(getattr(self.source, "owner", None), "GitHub owner")
        if issue.get("author_association") != "OWNER":
            raise RunNowError("RUN NOW issue is not owner-authenticated")
        issue_user = _plain(issue.get("user"), "issue user")
        if issue_user.get("login") != owner:
            raise RunNowError("RUN NOW issue actor differs from repository owner")
        issue_number = issue.get("number")
        if type(issue_number) is not int or issue_number < 1:
            raise RunNowError("RUN NOW issue number is invalid")
        body_text = _required(issue.get("body"), "RUN NOW issue body")
        try:
            command = json.loads(body_text)
        except json.JSONDecodeError as exc:
            raise RunNowError("RUN NOW issue body is not JSON") from exc
        command = _plain(command, "RUN NOW command")
        expected = {"protocol_version", "command_id", "state_ref", "handoff", "coordination_contract"}
        if set(command) != expected:
            raise RunNowError("RUN NOW command fields differ from frozen contract")
        if command.get("protocol_version") != RUN_NOW_PROTOCOL:
            raise RunNowError("RUN NOW command protocol mismatch")
        command_id = _required(command.get("command_id"), "command_id")
        if issue.get("title") != f"{RUN_NOW_TITLE_PREFIX}{command_id}":
            raise RunNowError("RUN NOW issue title does not bind command_id")
        state_ref = _required(command.get("state_ref"), "state_ref")
        if ".." in state_ref or "//" in state_ref or state_ref.endswith("/"):
            raise RunNowError("RUN NOW state_ref is invalid")

        handoff = _plain(command.get("handoff"), "handoff")
        contract = _plain(command.get("coordination_contract"), "coordination_contract")
        validate_gateway_handoff(handoff)
        validate_coordination_contract(handoff, contract)
        if handoff.get("execution_class") != "IMMEDIATE":
            raise RunNowError("USER_DIRECTED_RUN_NOW requires IMMEDIATE execution_class")
        if handoff.get("not_before") is not None or handoff.get("not_after") is not None:
            raise RunNowError("USER_DIRECTED_RUN_NOW cannot carry an autonomous time window")
        if handoff.get("executor_kind") not in SUPPORTED_EXECUTORS:
            raise RunNowError("RUN NOW executor is not supported by the production worker")
        if contract.get("resource_key") != f"OWNER-LANE:{handoff.get('lane')}":
            raise RunNowError("RUN NOW coordination resource does not bind exact lane")
        if contract.get("max_concurrency") != 1:
            raise RunNowError("RUN NOW must preserve one-live-claim-per-lane")

        payload = _plain(handoff.get("payload"), "handoff payload")
        auth = _plain(payload.get("user_directed_run_now"), "user_directed_run_now")
        if set(auth) != {"protocol_version", "command_id", "issue_number"}:
            raise RunNowError("RUN NOW payload authorization fields differ from frozen contract")
        if auth.get("protocol_version") != RUN_NOW_AUTH_PROTOCOL:
            raise RunNowError("RUN NOW payload authorization protocol mismatch")
        if auth.get("command_id") != command_id or auth.get("issue_number") != issue_number:
            raise RunNowError("RUN NOW payload is not bound to exact owner issue")

        receipt = _plain(handoff.get("admission_receipt"), "admission_receipt")
        state_head = self.source.resolve_ref_head(state_ref)
        publication = self.source.read_json_at(ACTIVE_WORK_HEAD_PATH, state_ref)
        packet = _plain(publication.get("packet"), "active-work packet")
        if receipt.get("mission_version") != packet.get("mission_version"):
            raise RunNowError("RUN NOW mission differs from live active-work authority")
        if receipt.get("workstream_id") != packet.get("workstream_id"):
            raise RunNowError("RUN NOW workstream differs from live active-work authority")
        if receipt.get("authority_epoch") != packet.get("authority_epoch"):
            raise RunNowError("RUN NOW authority epoch is stale")
        if receipt.get("authority_publication_commit_sha") != state_head:
            raise RunNowError("RUN NOW publication head is stale")
        if receipt.get("authority_packet_digest") != publication.get("packet_digest"):
            raise RunNowError("RUN NOW authority packet digest is stale")
        if packet.get("current_operation", {}).get("state") != "ACTIVE":
            raise RunNowError("RUN NOW requires an ACTIVE current operation")
        if receipt.get("operation_id") != packet.get("current_operation", {}).get("operation_id"):
            raise RunNowError("RUN NOW operation differs from live authority")
        if receipt.get("predecessor_receipt_id") != packet.get("current_operation", {}).get("predecessor_receipt_id"):
            raise RunNowError("RUN NOW predecessor differs from live authority")
        if packet.get("github_admission_state") != "ADMITTED" or packet.get("qualification_state") != "PASSED":
            raise RunNowError("RUN NOW requires admitted and qualified live authority")

        authoritative_subject = _plain(packet.get("authoritative_subject"), "authoritative_subject")
        subject_sha = _required(authoritative_subject.get("oid"), "authoritative subject SHA").lower()
        if not _is_sha(subject_sha):
            raise RunNowError("RUN NOW authoritative subject is not an exact Git SHA")
        if receipt.get("authoritative_subject") != authoritative_subject:
            raise RunNowError("RUN NOW admission subject differs from live authority")
        authority_ref = _required(packet.get("branch_or_ref"), "authority branch_or_ref")
        if receipt.get("authority_ref") != authority_ref:
            raise RunNowError("RUN NOW authority_ref differs from live authority")
        if self.source.resolve_ref_head(authority_ref).lower() != subject_sha:
            raise RunNowError("RUN NOW exact subject no longer matches authority ref head")
        if receipt.get("authority_ref_head_sha") != subject_sha:
            raise RunNowError("RUN NOW admission does not bind exact current subject")

        receipt_index = {
            row.get("receipt_id"): row
            for row in packet.get("receipt_index", [])
            if isinstance(row, dict) and isinstance(row.get("receipt_id"), str)
        }
        for dependency_id in receipt.get("dependency_receipt_ids", []):
            dep = receipt_index.get(dependency_id)
            if not dep or dep.get("outcome") != "SUCCEEDED" or dep.get("satisfies_dependency") is not True:
                raise RunNowError(f"RUN NOW dependency receipt {dependency_id} is not satisfied")

        authority = self.source.read_json(CURRENT_AUTHORITY_PATH)
        second_shift = self.source.read_json(_required(authority.get("second_shift_registry"), "second_shift_registry"))
        obligations = self.source.read_json(_required(authority.get("obligation_registry"), "obligation_registry"))
        owner_files = _plain(second_shift.get("owner_files"), "Second Shift owner_files")
        lane = _required(handoff.get("lane"), "handoff lane")
        owner_file_path = _required(owner_files.get(lane), "owner file")
        owner_file = self.source.read_json(owner_file_path)
        owner_path = _required(handoff.get("owner_path"), "handoff owner_path")
        if owner_file.get("owner_system_id") != lane or owner_file.get("owner_path") != owner_path:
            raise RunNowError("RUN NOW owner identity differs from current owner file")
        control_ref = _required(owner_file.get("control_ref"), "owner control_ref")
        control_head = _required(owner_file.get("last_known_control_head"), "owner control_head").lower()
        if not _is_sha(control_head):
            raise RunNowError("RUN NOW owner control head is invalid")
        if handoff.get("control_ref") != control_ref or handoff.get("control_head") != control_head:
            raise RunNowError("RUN NOW handoff is stale against current owner control")
        owner_heads = _plain(obligations.get("owner_head_snapshot"), "owner_head_snapshot")
        if str(owner_heads.get(lane, "")).lower() != control_head:
            raise RunNowError("RUN NOW owner-head snapshot differs from owner file")
        if self.source.resolve_ref_head(control_ref).lower() != control_head:
            raise RunNowError("RUN NOW live owner head drifted")
        obligation_id = _required(receipt.get("task_id"), "admission task_id")
        _current_obligation(
            obligations,
            second_shift,
            lane=lane,
            owner_path=owner_path,
            obligation_id=obligation_id,
        )
        return handoff, contract, command_id

    def run_once(self, now: Optional[dt.datetime] = None, *, dry_run: bool = False) -> dict[str, Any]:
        now = now or dt.datetime.now(dt.timezone.utc)
        result: dict[str, Any] = {
            "protocol_version": RUN_NOW_PROTOCOL,
            "status": "PASS",
            "considered": 0,
            "claimed": [],
            "skipped": [],
        }
        for issue in self.source.list_run_now_issues():
            result["considered"] += 1
            try:
                handoff, contract, command_id = self._validate_issue(issue)
                if dry_run:
                    result["claimed"].append({"command_id": command_id, "dry_run": True})
                    continue
                self.coordination.bind(handoff, contract, now=now)
                claim = self.coordination.claim(handoff, contract, now=now)
                result["claimed"].append(
                    {
                        "command_id": command_id,
                        "delegation_id": claim.delegation_id,
                        "lease_id": claim.lease_id,
                        "dispatch_id": claim.dispatch_id,
                        "fencing_token": claim.fencing_token,
                    }
                )
            except Exception as exc:
                result["skipped"].append(
                    {
                        "issue_number": issue.get("number"),
                        "reason": "RUN_NOW_REFUSED",
                        "detail": str(exc),
                    }
                )
        return result


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="A-01 GitHub ingress service")
    parser.add_argument("--db", required=True)
    parser.add_argument("--state-dir", required=True)
    parser.add_argument("--owner", default=os.environ.get("A01_INGRESS_OWNER", "BFochtman746"))
    parser.add_argument("--repo", default=os.environ.get("A01_INGRESS_REPO", "system-master"))
    parser.add_argument("--ref", default=os.environ.get("A01_INGRESS_REF", "main"))
    parser.add_argument("--poll-seconds", type=int, default=60)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--once", action="store_true")
    group.add_argument("--daemon", action="store_true")
    group.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    if not 5 <= args.poll_seconds <= 3600:
        parser.error("--poll-seconds must be 5..3600")

    source = RunNowGitHubSource(
        args.owner,
        args.repo,
        ref=args.ref,
        token=os.environ.get("A01_INGRESS_TOKEN"),
    )
    store, scheduler, coordination = build_runtime(args.db)
    try:
        overnight = Ingress(source, scheduler=scheduler, state_dir=args.state_dir)
        run_now = UserDirectedRunNowIngress(source, coordination)
        if args.check:
            _emit(
                "WIRING_OK",
                scheduler=type(scheduler).__name__,
                run_now_ingress=type(run_now).__name__,
                source=type(source).__name__,
                github_write_capable=hasattr(source, "write") or hasattr(source, "write_json"),
                db=str(Path(args.db)),
            )
            return 0

        def one_pass() -> int:
            now = dt.datetime.now(dt.timezone.utc)
            run_now_result = run_now.run_once(now=now, dry_run=False)
            overnight_result = overnight.run_once(now=now, dry_run=False)
            _emit("RUN_NOW_PASS", **run_now_result)
            _emit(overnight_result.status, **overnight_result.to_dict())
            overnight_ok = overnight_result.status in {"PASS", "PASS_WITH_ERRORS", "HALTED"} and not overnight_result.errors
            return 0 if run_now_result["status"] == "PASS" and overnight_ok else 1

        if args.once:
            return one_pass()

        while True:
            code = one_pass()
            if code:
                _emit("BACKOFF", seconds=args.poll_seconds)
            time.sleep(args.poll_seconds)
    finally:
        store.close()


if __name__ == "__main__":
    raise SystemExit(main())
