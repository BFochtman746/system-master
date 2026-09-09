#!/usr/bin/env python3
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
TOPOLOGY = ROOT / "governance" / "SYSTEM-TOPOLOGY-001.json"
A01_REGISTRY = ROOT / "qualification" / "a01" / "registry.json"

EXPECTED_SYSTEMS = {"MASTER", "LEARNING", "BOOK", "PROSE"}
EXPECTED_PARENT = {"MASTER": None, "LEARNING": None, "BOOK": None, "PROSE": "BOOK"}


def fail(message):
    print(f"SYSTEM_TOPOLOGY_ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def main():
    topology = json.loads(TOPOLOGY.read_text(encoding="utf-8"))
    systems = topology.get("systems", [])
    ids = [entry.get("system_id") for entry in systems]

    if topology.get("system_cardinality") != 4:
        fail("system_cardinality must equal 4")
    if len(systems) != 4 or set(ids) != EXPECTED_SYSTEMS or len(ids) != len(set(ids)):
        fail(f"canonical systems must be exactly {sorted(EXPECTED_SYSTEMS)}; got {ids}")

    by_id = {entry["system_id"]: entry for entry in systems}
    for system_id, parent in EXPECTED_PARENT.items():
        if by_id[system_id].get("parent_system_id") != parent:
            fail(f"{system_id} parent must be {parent!r}")
        if not by_id[system_id].get("control_ref"):
            fail(f"{system_id} must declare control_ref")
        if not by_id[system_id].get("control_record"):
            fail(f"{system_id} must declare control_record")

    if topology.get("reserved_word") != "SYSTEM":
        fail("SYSTEM must remain the reserved architecture word")

    creation = topology.get("system_creation_rule", {})
    required_flags = [
        "implicit_creation_forbidden",
        "branch_name_cannot_create_system",
        "workstream_id_cannot_create_system",
        "chat_or_task_title_cannot_create_system",
        "qualification_id_cannot_create_system",
    ]
    for flag in required_flags:
        if creation.get(flag) is not True:
            fail(f"system creation guard {flag} must remain true")

    lane_map = topology.get("execution_lane_owner_map", {})
    for lane, owner in lane_map.items():
        if owner not in EXPECTED_SYSTEMS:
            fail(f"execution lane {lane} maps to unknown system {owner}")

    registry = json.loads(A01_REGISTRY.read_text(encoding="utf-8"))
    unmapped = sorted({
        q.get("workstream_id")
        for q in registry.get("qualifications", {}).values()
        if q.get("workstream_id") and q.get("workstream_id") not in lane_map
    })
    if unmapped:
        fail("A-01 workstream IDs lack four-system ownership mapping: " + ", ".join(unmapped))

    explicit_non_systems = topology.get("explicit_non_systems", {})
    required_non_systems = ["A-01", "ASSURANCE", "RECONCILIATION", "CONTINUITY", "BOOK EVALUATOR", "LITERARY PROSE ENGINE", "NIGHT SHIFT", "QUALIFICATION", "RUNNER"]
    missing = [name for name in required_non_systems if name not in explicit_non_systems]
    if missing:
        fail("required non-system classifications missing: " + ", ".join(missing))

    print("SYSTEM_TOPOLOGY_PASS")
    print("canonical_systems=MASTER,LEARNING,BOOK,PROSE")
    print("system_cardinality=4")
    print(f"a01_workstream_ids_mapped={len(set(q.get('workstream_id') for q in registry.get('qualifications', {}).values() if q.get('workstream_id')))}")


if __name__ == "__main__":
    main()
