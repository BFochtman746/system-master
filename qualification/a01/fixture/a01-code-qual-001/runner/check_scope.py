#!/usr/bin/env python3
from __future__ import annotations

import argparse
import fnmatch
import json
import subprocess
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--workspace', required=True)
    ap.add_argument('--manifest', required=True)
    ap.add_argument('--out', required=True)
    args = ap.parse_args()

    ws = Path(args.workspace).resolve()
    manifest = json.loads(Path(args.manifest).read_text(encoding='utf-8'))
    allowed = manifest['writable_globs']
    diff = subprocess.run(['git', 'diff', '--name-only', 'HEAD~1', 'HEAD'], cwd=ws, check=True, text=True, capture_output=True).stdout.splitlines()
    unauthorized = [p for p in diff if not any(fnmatch.fnmatch(p, pat) for pat in allowed)]
    result = {
        'authorized_files_changed': [p for p in diff if p not in unauthorized],
        'unauthorized_files_changed': unauthorized,
        'pass': len(unauthorized) == 0
    }
    Path(args.out).write_text(json.dumps(result, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print(json.dumps(result, sort_keys=True))
    return 0 if result['pass'] else 2


if __name__ == '__main__':
    raise SystemExit(main())
