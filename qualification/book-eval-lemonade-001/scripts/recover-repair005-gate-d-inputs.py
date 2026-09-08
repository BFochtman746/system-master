#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

VERSION = "BOOK-EVAL-REPAIR-005-GATE-D-INPUT-RECOVERY-v1"
TARGETS = {
    "BASE_TRAINING": "0e3d237405340ae1abf0706c88c39275360c8c9380388b4f53d73275f4f38473",
    "PROVIDER": "30bd9d0b2c348b33e6b17a81d639e64c7e7e8eef63d7d6c0bfc3175e94fe2b53",
    "DEVELOPMENT_GOLD": "51cd4790ddd89d067a6e85ee6c6f3092ec3a6fba94faac8e77e31041277da91a",
    "REPAIRED_OUTPUT": "b445acb8764661eea8c0969a7a52c4d73e86bc5bfb7b4ad082125fed875e4ce8",
}
SEALED_ARCHIVES = {
    "GATE_B_PRIVATE_TRAINING_ZIP": "598a73178167f9b46e57899e7c35696241bb20f282fc8dc48995a4bdfc24d1f6",
    "SCORING_PRIVATE_V2_ZIP": "1091d409b5167463325ff85764bdd9b62c0e96cf9a9bef5f03445616c6b81940",
}
ROLE_FILENAMES = {
    "BASE_TRAINING": "gate-d-base-training.jsonl",
    "PROVIDER": "gate-d-provider.jsonl",
    "DEVELOPMENT_GOLD": "gate-d-gold.jsonl",
    "REPAIRED_OUTPUT": "gate-d-repaired-output.jsonl",
}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_stream(f) -> str:
    h = hashlib.sha256()
    for chunk in iter(lambda: f.read(1 << 20), b""):
        h.update(chunk)
    return h.hexdigest()


def safe_files(root: Path):
    if not root.exists():
        return []
    out = []
    try:
        for dirpath, dirnames, filenames in os.walk(root, topdown=True):
            dirnames[:] = sorted(d for d in dirnames if d not in {".git", "node_modules", "__pycache__"})
            for name in sorted(filenames):
                p = Path(dirpath) / name
                if p.suffix.lower() in {".json", ".jsonl", ".zip"}:
                    out.append(p)
    except OSError:
        pass
    return out


def copy_role(source: Path, role: str, out_dir: Path):
    dest = out_dir / ROLE_FILENAMES[role]
    shutil.copyfile(source, dest)
    if sha256_file(dest) != TARGETS[role]:
        raise RuntimeError(f"post-copy hash mismatch for {role}")
    return dest


def write_member(zf: zipfile.ZipFile, info: zipfile.ZipInfo, role: str, out_dir: Path):
    dest = out_dir / ROLE_FILENAMES[role]
    with zf.open(info, "r") as src, dest.open("wb") as dst:
        shutil.copyfileobj(src, dst, 1 << 20)
    if sha256_file(dest) != TARGETS[role]:
        raise RuntimeError(f"post-extract hash mismatch for {role}")
    return dest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", action="append", default=[])
    ap.add_argument("--bundle", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--env-out", required=True)
    args = ap.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = Path(args.manifest)
    env_path = Path(args.env_out)
    bundle = Path(args.bundle)

    roots = []
    seen_roots = set()
    for raw in args.root:
        if not raw:
            continue
        p = Path(raw)
        key = str(p).lower()
        if key not in seen_roots:
            seen_roots.add(key)
            roots.append(p)

    candidates = []
    for root in roots:
        candidates.extend(safe_files(root))
    candidates = sorted(set(candidates), key=lambda p: str(p).lower())

    found = {}
    provenance = {}
    archive_matches = []
    zip_candidates = []

    hash_to_role = {v: k for k, v in TARGETS.items()}
    sealed_by_hash = {v: k for k, v in SEALED_ARCHIVES.items()}

    for path in candidates:
        try:
            if not path.is_file():
                continue
            if path.suffix.lower() == ".zip":
                zip_candidates.append(path)
                digest = sha256_file(path)
                if digest in sealed_by_hash:
                    archive_matches.append({
                        "archive_role": sealed_by_hash[digest],
                        "sha256": digest,
                    })
                continue
            if path.stat().st_size > 100 * 1024 * 1024:
                continue
            digest = sha256_file(path)
            role = hash_to_role.get(digest)
            if role and role not in found:
                found[role] = copy_role(path, role, out_dir)
                provenance[role] = {"source_kind": "direct_exact_hash", "sha256": digest}
        except (OSError, PermissionError):
            continue

    missing = set(TARGETS) - set(found)
    if missing:
        for archive in zip_candidates:
            if not missing:
                break
            try:
                archive_sha = sha256_file(archive)
                with zipfile.ZipFile(archive, "r") as zf:
                    infos = sorted(zf.infolist(), key=lambda i: i.filename.lower())
                    for info in infos:
                        if not missing:
                            break
                        if info.is_dir() or info.file_size > 100 * 1024 * 1024:
                            continue
                        suffix = Path(info.filename).suffix.lower()
                        if suffix not in {".json", ".jsonl"}:
                            continue
                        with zf.open(info, "r") as member:
                            digest = sha256_stream(member)
                        role = hash_to_role.get(digest)
                        if role in missing:
                            found[role] = write_member(zf, info, role, out_dir)
                            provenance[role] = {
                                "source_kind": "zip_member_exact_hash",
                                "sha256": digest,
                                "archive_sha256": archive_sha,
                                "sealed_archive_identity": sealed_by_hash.get(archive_sha),
                            }
                            missing.remove(role)
            except (OSError, PermissionError, zipfile.BadZipFile, RuntimeError):
                continue

    rebuild = None
    if "BASE_TRAINING" not in found and all(k in found for k in ("PROVIDER", "DEVELOPMENT_GOLD", "REPAIRED_OUTPUT")):
        rebuild_dir = out_dir / "rebuild"
        rebuild_dir.mkdir(parents=True, exist_ok=True)
        cmd = [
            sys.executable,
            str(bundle / "scripts" / "compile-repair005-gate-b.py"),
            "--gold", str(found["DEVELOPMENT_GOLD"]),
            "--provider-input", str(found["PROVIDER"]),
            "--repaired-output", str(found["REPAIRED_OUTPUT"]),
            "--taxonomy", str(bundle / "repair005" / "BOOK-EVAL-HIERARCHICAL-SPECIALIST-TAXONOMY-v1.json"),
            "--curriculum", str(bundle / "repair005" / "CONTRASTIVE-CURRICULUM-v1.json"),
            "--schema", str(bundle / "repair005" / "CONTRASTIVE-JUDGE-TRAINING-RECORD-SCHEMA-v1.json"),
            "--rights-manifest", str(bundle / "repair005" / "TRAINING-SOURCE-RIGHTS-MANIFEST-v1.json"),
            "--out-dir", str(rebuild_dir),
        ]
        completed = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
        rebuild = {"attempted": True, "returncode": completed.returncode}
        if completed.returncode == 0:
            rebuilt = rebuild_dir / "BOOK-EVAL-REPAIR-005-TRAINING-PRIVATE-v1.jsonl"
            if rebuilt.exists() and sha256_file(rebuilt) == TARGETS["BASE_TRAINING"]:
                found["BASE_TRAINING"] = copy_role(rebuilt, "BASE_TRAINING", out_dir)
                provenance["BASE_TRAINING"] = {
                    "source_kind": "deterministic_gate_b_rebuild",
                    "sha256": TARGETS["BASE_TRAINING"],
                }
                rebuild["exact_hash_pass"] = True
            else:
                rebuild["exact_hash_pass"] = False
        else:
            rebuild["exact_hash_pass"] = False

    required = ("BASE_TRAINING", "PROVIDER", "DEVELOPMENT_GOLD")
    success = all(role in found for role in required)
    manifest = {
        "objective": "BOOK-EVAL-LEMONADE-001-REPAIR-005-GATE-D",
        "version": VERSION,
        "state": "EXACT_PRIVATE_INPUTS_RECOVERED" if success else "PRIVATE_INPUT_RECOVERY_BLOCKED",
        "required_roles": list(required),
        "recovered_roles": sorted(found),
        "missing_required_roles": [r for r in required if r not in found],
        "provenance": {k: provenance[k] for k in sorted(provenance)},
        "sealed_archive_matches": archive_matches,
        "deterministic_rebuild": rebuild,
        "exact_hash_binding": success,
        "private_paths_persisted_to_evidence": False,
        "raw_private_content_persisted_to_evidence": False,
        "visible_regression_used": False,
        "hidden_holdout_used": False,
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    if not success:
        print(json.dumps(manifest, indent=2, sort_keys=True))
        raise SystemExit("exact frozen Gate D private inputs could not be safely recovered")

    env_lines = [
        f"BASE_TRAINING_PATH={found['BASE_TRAINING']}",
        f"PROVIDER_PATH={found['PROVIDER']}",
        f"DEVELOPMENT_GOLD_PATH={found['DEVELOPMENT_GOLD']}",
    ]
    if "REPAIRED_OUTPUT" in found:
        env_lines.append(f"REPAIRED_OUTPUT_PATH={found['REPAIRED_OUTPUT']}")
    env_path.write_text("\n".join(env_lines) + "\n", encoding="ascii")
    print(json.dumps(manifest, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
