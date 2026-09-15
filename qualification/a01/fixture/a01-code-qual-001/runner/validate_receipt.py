#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

REQUIRED = {
    'protocol_version','contract_id','operation_id','authoring_subject_identity','benchmark_subject_sha256',
    'hidden_evaluator_sha256','assignment_sha256','starting_git_sha','final_git_sha','start_timestamp_utc',
    'stop_timestamp_utc','elapsed_seconds','deadline_enforced','candidate_isolation_enforced','human_assistance',
    'a01_host_evidence','visible_tests','hidden_tests','coverage','complexity','duplication','concurrency_recovery',
    'security_failure_safety','scope_discipline','first_pass_quality','raw_artifact_digest','receipt_digest'
}
AUTHORING_REQUIRED = {
    'provider_or_runtime','authoring_entrypoint_identity','system_or_project_instruction_digest','tool_permission_profile_digest'
}
HOST_REQUIRED = {'runner_name','operating_system','architecture','freeze_artifact_sha256'}
SHA256_RE = re.compile(r'^[0-9a-f]{64}$')


def canonical(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')


def require_sha256(value, label: str) -> None:
    if not isinstance(value, str) or not SHA256_RE.fullmatch(value):
        raise SystemExit(f'{label} must be lowercase SHA-256')


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
    if receipt['candidate_isolation_enforced'] is not True:
        raise SystemExit('candidate isolation not enforced')
    if not isinstance(receipt['elapsed_seconds'], (int, float)) or not 0 <= receipt['elapsed_seconds'] <= 1800.999:
        raise SystemExit('elapsed_seconds exceeds hard qualification boundary')

    authoring = receipt['authoring_subject_identity']
    if not isinstance(authoring, dict):
        raise SystemExit('authoring_subject_identity must be an object')
    missing_authoring = sorted(AUTHORING_REQUIRED - set(authoring))
    if missing_authoring:
        raise SystemExit(f'authoring identity missing required fields: {missing_authoring}')
    if not str(authoring.get('provider_or_runtime', '')).strip() or not str(authoring.get('authoring_entrypoint_identity', '')).strip():
        raise SystemExit('authoring runtime and entrypoint must be non-empty')
    require_sha256(authoring.get('system_or_project_instruction_digest'), 'system_or_project_instruction_digest')
    require_sha256(authoring.get('tool_permission_profile_digest'), 'tool_permission_profile_digest')

    host = receipt['a01_host_evidence']
    if not isinstance(host, dict):
        raise SystemExit('a01_host_evidence must be an object')
    missing_host = sorted(HOST_REQUIRED - set(host))
    if missing_host:
        raise SystemExit(f'A-01 host evidence missing required fields: {missing_host}')
    for key in ('runner_name','operating_system','architecture'):
        if not str(host.get(key, '')).strip():
            raise SystemExit(f'A-01 host evidence {key} must be non-empty')
    require_sha256(host.get('freeze_artifact_sha256'), 'freeze_artifact_sha256')

    for key in ('benchmark_subject_sha256','hidden_evaluator_sha256','assignment_sha256','raw_artifact_digest','receipt_digest'):
        require_sha256(receipt.get(key), key)

    print(json.dumps({'status':'PASS','receipt_digest':observed}, sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
