#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path


def run(cmd: list[str], cwd: Path) -> str:
    p = subprocess.run(cmd, cwd=cwd, text=True, capture_output=True, check=True)
    return p.stdout.strip()


def sha256_tree(root: Path) -> str:
    rows: list[tuple[str, str]] = []
    for path in sorted(p for p in root.rglob('*') if p.is_file() and '.git/' not in p.as_posix()):
        h = hashlib.sha256(path.read_bytes()).hexdigest()
        rows.append((path.relative_to(root).as_posix(), h))
    return hashlib.sha256(json.dumps(rows, separators=(',', ':'), sort_keys=True).encode()).hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--workspace', required=True)
    ap.add_argument('--start-utc', required=True)
    ap.add_argument('--deadline-seconds', type=int, default=1800)
    ap.add_argument('--out', required=True)
    args = ap.parse_args()

    ws = Path(args.workspace).resolve()
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    stop = datetime.now(timezone.utc)
    start = datetime.fromisoformat(args.start_utc.replace('Z', '+00:00'))
    elapsed = (stop - start).total_seconds()
    if elapsed > args.deadline_seconds + 0.999:
        deadline_ok = False
    else:
        deadline_ok = True

    status = run(['git', 'status', '--porcelain=v1'], ws)
    diff = run(['git', 'diff', '--binary', 'HEAD'], ws)
    (out / 'final-status.txt').write_text(status + ('\n' if status else ''), encoding='utf-8')
    (out / 'final.diff').write_text(diff + ('\n' if diff else ''), encoding='utf-8')

    subprocess.run(['git', 'add', '-A'], cwd=ws, check=True)
    subprocess.run(['git', '-c', 'user.name=A01 Benchmark', '-c', 'user.email=a01-benchmark@local', 'commit', '-m', 'A01 benchmark frozen result', '--allow-empty'], cwd=ws, check=True, capture_output=True, text=True)
    final_sha = run(['git', 'rev-parse', 'HEAD'], ws)
    tree_digest = sha256_tree(ws)

    record = {
        'operation_id': 'A01-CODE-QUAL-001',
        'start_timestamp_utc': start.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z'),
        'stop_timestamp_utc': stop.isoformat().replace('+00:00', 'Z'),
        'elapsed_seconds': elapsed,
        'deadline_enforced': deadline_ok,
        'final_git_sha': final_sha,
        'frozen_tree_sha256': tree_digest,
    }
    (out / 'freeze-record.json').write_text(json.dumps(record, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print(json.dumps(record, sort_keys=True))
    return 0 if deadline_ok else 2


if __name__ == '__main__':
    raise SystemExit(main())
