#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def canonical(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_tree(root: Path) -> str:
    rows = []
    for p in sorted(x for x in root.rglob('*') if x.is_file()):
        rows.append((p.relative_to(root).as_posix(), sha256_bytes(p.read_bytes())))
    return sha256_bytes(canonical(rows))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--seal', required=True)
    ap.add_argument('--start', required=True)
    ap.add_argument('--freeze', required=True)
    ap.add_argument('--functional', required=True)
    ap.add_argument('--evidence-root', required=True)
    ap.add_argument('--out', required=True)
    args = ap.parse_args()

    seal = json.loads(Path(args.seal).read_text(encoding='utf-8'))
    start = json.loads(Path(args.start).read_text(encoding='utf-8'))
    freeze = json.loads(Path(args.freeze).read_text(encoding='utf-8'))
    functional = json.loads(Path(args.functional).read_text(encoding='utf-8'))

    receipt = {
        'protocol_version': 'a01.code-qualification-receipt.v1',
        'contract_id': 'A01-CODE-QUAL-001-30-MINUTE-SEALED-CODING-STRESS-BASELINE-CONTRACT-001',
        'operation_id': 'A01-CODE-QUAL-001',
        'benchmark_subject_sha256': seal['candidate_package_sha256'],
        'hidden_evaluator_sha256': seal['hidden_evaluator_sha256'],
        'assignment_sha256': seal['assignment_sha256'],
        'starting_git_sha': start['starting_git_sha'],
        'final_git_sha': freeze['final_git_sha'],
        'start_timestamp_utc': start['start_timestamp_utc'],
        'stop_timestamp_utc': freeze['stop_timestamp_utc'],
        'elapsed_seconds': freeze['elapsed_seconds'],
        'deadline_enforced': bool(freeze['deadline_enforced']),
        'human_assistance': False,
        'visible_tests': functional['visible_tests'],
        'hidden_tests': functional['hidden_tests'],
        'coverage': {},
        'complexity': {},
        'duplication': {},
        'concurrency_recovery': functional['hidden_tests'].get('python', {}),
        'security_failure_safety': functional['hidden_tests'].get('javascript', {}),
        'scope_discipline': {},
        'first_pass_quality': {},
        'raw_artifact_digest': sha256_tree(Path(args.evidence_root)),
        'receipt_digest': ''
    }
    receipt['receipt_digest'] = sha256_bytes(canonical(receipt))
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(receipt, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print(json.dumps({'receipt_digest': receipt['receipt_digest']}, sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
