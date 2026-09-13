#!/usr/bin/env python3
"""Deterministic eight-lane Second Shift execution-control qualification.

This test is intentionally side-effect-free outside a temporary SQLite database.
It exercises the repository's actual SupervisorStore lane, delegation, fenced claim,
dispatch acknowledgement, heartbeat and terminal state machinery for every current
execution-ready peer lane.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.second_shift_supervisor_v2 import SupervisorStore


def load_json(relative_path: str) -> dict:
    return json.loads((ROOT / relative_path).read_text(encoding="utf-8"))


def exact_set(label: str, actual: list[str], expected: list[str]) -> None:
    if len(actual) != len(set(actual)):
        raise RuntimeError(f"{label} contains duplicates: {actual}")
    if set(actual) != set(expected):
        raise RuntimeError(f"{label} mismatch expected={sorted(expected)} actual={sorted(actual)}")


def qualify(output_path: Path) -> dict:
    authority = load_json("governance/CURRENT-AUTHORITY.json")
    topology = load_json(authority["topology"])
    registry = load_json(authority["second_shift_registry"])

    lanes = list(topology["execution_readiness"]["execution_ready_peer_system_ids"])
    if len(lanes) != 8:
        raise RuntimeError(f"expected exactly eight execution-ready peer lanes, found {len(lanes)}")
    exact_set("authority active_peer_execution_lanes", authority["active_peer_execution_lanes"], lanes)
    exact_set("registry owner_files", list(registry["owner_files"].keys()), lanes)

    systems = {entry["system_id"]: entry for entry in topology["canonical_internal_systems"]}
    if set(lanes) - set(systems):
        raise RuntimeError(f"topology lacks canonical system records for {sorted(set(lanes) - set(systems))}")

    base_time = dt.datetime(2026, 9, 13, 5, 0, 0, tzinfo=dt.timezone.utc)
    lane_results: list[dict] = []

    with tempfile.TemporaryDirectory(prefix="second-shift-eight-lane-") as temp_dir:
        db_path = Path(temp_dir) / "qualification.sqlite3"
        with SupervisorStore(db_path) as store:
            for index, lane in enumerate(lanes):
                system = systems[lane]
                at = base_time + dt.timedelta(seconds=index * 10)
                owner_path = f"SYSTEM_MASTER/{lane}"
                control_ref = system["control_ref"]
                control_head = f"qualification:{topology['topology_id']}:{lane}"
                delegation_id = f"QUAL-{lane}-001"
                objective_id = f"QUALIFY-{lane}-SECOND-SHIFT"
                idempotency_key = f"qualification:{topology['topology_id']}:{lane}:001"

                store.register_lane(
                    lane=lane,
                    owner_path=owner_path,
                    control_ref=control_ref,
                    control_head=control_head,
                    now=at,
                )
                store.bind_ready(
                    lane=lane,
                    delegation_id=delegation_id,
                    objective_id=objective_id,
                    control_head=control_head,
                    payload={"qualification_only": True, "topology_id": topology["topology_id"]},
                    now=at + dt.timedelta(seconds=1),
                )
                claim = store.claim_ready(
                    lane=lane,
                    delegation_id=delegation_id,
                    objective_id=objective_id,
                    control_head=control_head,
                    idempotency_key=idempotency_key,
                    executor_kind="SECOND_SHIFT_QUALIFICATION",
                    dispatch_payload={"qualification_only": True, "lane": lane},
                    lease_seconds=300,
                    now=at + dt.timedelta(seconds=2),
                    allow_outside_shift=True,
                )
                store.mark_dispatched(
                    claim.dispatch_id,
                    external_run_id=f"qualification-run:{lane}",
                    now=at + dt.timedelta(seconds=3),
                )
                store.heartbeat(
                    claim.lease_id,
                    claim.fencing_token,
                    checkpoint_pointer=f"qualification://{lane}/heartbeat",
                    now=at + dt.timedelta(seconds=4),
                )
                store.terminal(
                    claim.lease_id,
                    claim.fencing_token,
                    "COMPLETED",
                    payload={"qualification_only": True, "lane": lane},
                    now=at + dt.timedelta(seconds=5),
                )

                delegation = store.conn.execute(
                    "SELECT state FROM delegations WHERE delegation_id=?", (delegation_id,)
                ).fetchone()
                persisted_claim = store.conn.execute(
                    "SELECT status,released_at,fencing_token FROM claims WHERE lease_id=?", (claim.lease_id,)
                ).fetchone()
                dispatch = store.conn.execute(
                    "SELECT state,external_run_id FROM dispatch_outbox WHERE dispatch_id=?", (claim.dispatch_id,)
                ).fetchone()
                events = {
                    row[0]
                    for row in store.conn.execute(
                        "SELECT event_type FROM events WHERE lane=? AND delegation_id=?",
                        (lane, delegation_id),
                    ).fetchall()
                }
                required_events = {"READY", "CLAIMED", "DISPATCH_INTENT", "DISPATCHED", "HEARTBEAT", "COMPLETED"}
                missing_events = sorted(required_events - events)

                if delegation is None or delegation["state"] != "COMPLETED":
                    raise RuntimeError(f"{lane}: delegation did not reach COMPLETED")
                if persisted_claim is None or persisted_claim["status"] != "COMPLETED" or persisted_claim["released_at"] is None:
                    raise RuntimeError(f"{lane}: claim did not terminalize cleanly")
                if int(persisted_claim["fencing_token"]) != int(claim.fencing_token):
                    raise RuntimeError(f"{lane}: fencing token changed unexpectedly")
                if dispatch is None or dispatch["state"] != "DISPATCHED" or not dispatch["external_run_id"]:
                    raise RuntimeError(f"{lane}: dispatch acknowledgement missing")
                if missing_events:
                    raise RuntimeError(f"{lane}: missing lifecycle events {missing_events}")

                lane_results.append(
                    {
                        "lane": lane,
                        "control_ref": control_ref,
                        "claim_fencing_token": claim.fencing_token,
                        "dispatch_acknowledged": True,
                        "heartbeat_recorded": True,
                        "terminal_state": "COMPLETED",
                        "required_events_present": True,
                    }
                )

            active_claims = store.conn.execute(
                "SELECT COUNT(*) AS n FROM claims WHERE released_at IS NULL"
            ).fetchone()["n"]
            authorization_leaks = 0
            try:
                authorization_leaks = store.conn.execute(
                    "SELECT COUNT(*) AS n FROM night_scheduler_claim_authorizations"
                ).fetchone()["n"]
            except Exception:
                # The base supervisor does not create scheduler authorization state.
                authorization_leaks = 0
            if int(active_claims) != 0:
                raise RuntimeError(f"qualification left {active_claims} active mutation claims")
            if int(authorization_leaks) != 0:
                raise RuntimeError(f"qualification left {authorization_leaks} scheduler authorization records")

    report = {
        "status": "PASS",
        "qualification": "SECOND_SHIFT_EIGHT_LANE_EXECUTION_CONTROL",
        "side_effect_scope": "TEMPORARY_SQLITE_ONLY",
        "authority_id": authority["authority_id"],
        "topology_id": topology["topology_id"],
        "registry_id": registry["registry_id"],
        "qualified_lane_count": len(lane_results),
        "qualified_lanes": [item["lane"] for item in lane_results],
        "lane_results": lane_results,
        "assertions": {
            "all_current_execution_ready_lanes_exercised": True,
            "one_fenced_claim_per_lane": True,
            "dispatch_acknowledgement_exercised": True,
            "heartbeat_authority_exercised": True,
            "terminal_completion_exercised": True,
            "no_live_claims_remaining": True,
            "external_side_effects_performed": False,
        },
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Qualify all current Second Shift peer lanes")
    parser.add_argument(
        "--out",
        default=".second-shift-enforcement/eight-lane-qualification.json",
        help="machine-readable qualification report path",
    )
    args = parser.parse_args()
    report = qualify(Path(args.out))
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
