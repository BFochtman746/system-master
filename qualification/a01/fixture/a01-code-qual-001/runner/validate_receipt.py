#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

REQUIRED = {
    'protocol_version','contract_id','operation_id','benchmark_subject_sha256','hidden_evaluator_sha256',
    'assignment_sha256','starting_git_sha','final_git_sha','start_timestamp_utc','stop_timestamp_utc',
    'elapsed_seconds','deadline_enforced','human_assistance','visible_tests','hidden_tests','coverage',
    'complexity','duplication','concurrency_recovery','security_failure_safety','scope_discipline',
    'first_pass_quality','raw_artifact_digest','receipt_digest'
}


def canonical(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('receipt')
    args = ap.parse_args()
    receipt = json.loads(Path(args.receipt).read_text(encoding='utf-8'))
    if set(receipt) != REQUIRED:
        raise SystemExit(f'receipt field mismatch missing={sorted(REQUIRED-set(receipt))} extra={sorted(set(receipt)-REQUIRED)}')
    observed = receipt['receipt_digest']
    copy = dict(receipt)
    copy['receipt_digest'] = ''
    expected = hashlib.sha256(canonical(copy)).hexdigest()
    if observed != expected:
        raise SystemExit(f'receipt digest mismatch observed={observed} expected={expected}')
    if receipt['protocol_version'] != 'a01.code-qualification-receipt.v1':
        raise SystemExit('protocol mismatch')
    if receipt['operation_id'] != 'A01-CODE-QUAL-001':
        raise SystemExit('operation mismatch')
    if receipt['human_assistance'] is not False:
        raise SystemExit('human assistance invalidates run')
    if receipt['deadline_enforced'] is not True:
        raise SystemExit('deadline not enforced')
    print(json.dumps({'status':'PASS','receipt_digest':observed}, sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
