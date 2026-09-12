from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

LEARNING = "MOD-LEARNING-001"
CURRICULUM = "MOD-CURRICULUM-001"

SHARED = {
    "I021": "Durable Execution Runtime",
    "I022": "Durable Execution Runtime",
    "I031": "Durable Execution Runtime",
    "I045": "Canonical Data & Persistence",
    "I046": "Transport & Delivery",
    "I050": "Rights, Licensing & Attribution",
    "I052": "Capability Registry & Routing",
    "I075": "Recovery & Reconciliation",
    "I085": "Recovery & Reconciliation",
    "I101": "Rights, Licensing & Attribution",
    "I105": "AI Safety & Model Risk",
    "I106": "Security, Privacy, Secrets & Cryptography",
    "I108": "Transport & Delivery",
    "I109": "Effect / Action Authority",
}


def generate(source_manifest: Path) -> dict:
    raw = json.loads(source_manifest.read_text(encoding="utf-8"))
    if raw.get("route_count") != 112 or len(raw.get("routes", [])) != 112:
        raise ValueError("SOURCE_ROUTE_DENOMINATOR_MISMATCH")
    rows = []
    for source in raw["routes"]:
        row = dict(source)
        interface_id = row["interface_id"]
        old_owner = row["canonical_owner"]
        row["historical_owner_provenance"] = old_owner
        row["executable"] = False
        if interface_id in SHARED:
            row["canonical_owner"] = SHARED[interface_id]
            row["current_owner_scope"] = "SYSTEM_MASTER/CORE"
            row["canonical_owner_contract_id"] = None
            row["canonical_owner_contract_version"] = None
            row["binding_status"] = "CURRENT_CONTRACT_ID_UNRESOLVED"
            row["handler_readiness"] = "BLOCKED_ON_FOUNDATION_CONTRACT_ADMISSION"
        else:
            if old_owner not in {LEARNING, CURRICULUM}:
                raise ValueError(f"UNADJUDICATED_OWNER:{interface_id}:{old_owner}")
            row["current_owner_scope"] = "SYSTEM_MASTER/LEARNING"
            row["canonical_owner_contract_id"] = old_owner
            row["canonical_owner_contract_version"] = "R2C-SEMANTIC-FREEZE"
            row["binding_status"] = "CURRENT_SEMANTIC_OWNER_BOUND"
            row["handler_readiness"] = "DECLARED_ROUTE_HANDLER_BINDING_REQUIRED"
        rows.append(row)

    ids = [r["interface_id"] for r in rows]
    if len(set(ids)) != 112:
        raise ValueError("DUPLICATE_INTERFACE_ID")
    if sum(r["canonical_owner"] == LEARNING for r in rows) != 59:
        raise ValueError("LEARNING_OWNER_COUNT_MISMATCH")
    if sum(r["canonical_owner"] == CURRICULUM for r in rows) != 39:
        raise ValueError("CURRICULUM_OWNER_COUNT_MISMATCH")
    if sum(r["current_owner_scope"] == "SYSTEM_MASTER/CORE" for r in rows) != 14:
        raise ValueError("SHARED_OWNER_COUNT_MISMATCH")

    return {
        "objective": "LRN-OWNERSHIP-FREEZE-001B-R3A",
        "source_manifest": str(source_manifest),
        "source_sha256": "28e3317e5494c9df7df2f8aefb7f83f7c69fbc9d0ababfb696700542c831edc3",
        "route_count": 112,
        "owner_counts": {LEARNING: 59, CURRICULUM: 39, "SYSTEM_MASTER/CORE_SHARED": 14},
        "inbound_command_query_denominator": 63,
        "shared_binding_policy": "FAIL_CLOSED_UNTIL_CURRENT_FOUNDATION_CONTRACT_ID_AND_VERSION_ARE_ADMITTED",
        "knowledge_alignment_residual": "LRN-069 / LRN-EXT-002: NO ROUTE / NO STORE / FEATURE-GATED",
        "routes": rows,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_manifest", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    manifest = generate(args.source_manifest)
    body = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode()
    args.output.write_bytes(body)
    print(json.dumps({"routes": 112, "sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body)}, sort_keys=True))


if __name__ == "__main__":
    main()
