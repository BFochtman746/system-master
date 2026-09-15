#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--workspace', required=True)
    ap.add_argument('--out', required=True)
    args = ap.parse_args()
    ws = Path(args.workspace).resolve()
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)

    subprocess.run(['git', 'init'], cwd=ws, check=True, capture_output=True, text=True)
    subprocess.run(['git', 'add', '-A'], cwd=ws, check=True)
    subprocess.run(['git', '-c', 'user.name=A01 Benchmark', '-c', 'user.email=a01-benchmark@local', 'commit', '-m', 'sealed benchmark start'], cwd=ws, check=True, capture_output=True, text=True)
    starting_sha = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ws, check=True, text=True, capture_output=True).stdout.strip()
    start = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    rec = {'operation_id': 'A01-CODE-QUAL-001', 'starting_git_sha': starting_sha, 'start_timestamp_utc': start}
    (out / 'start-record.json').write_text(json.dumps(rec, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print(json.dumps(rec, sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
