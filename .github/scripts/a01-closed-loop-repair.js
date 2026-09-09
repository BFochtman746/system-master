'use strict';

const NON_AUTOMATABLE = new Set([
  'HUMAN_ONLY',
  'AUTHOR_ONLY',
  'PRIVATE_DATA_REQUIRED',
  'APPLE_NATIVE_REQUIRED',
  'NATIVE_PLATFORM_REQUIRED',
  'EXTERNAL_AUTHORITY',
  'PRODUCTION_AUTHORITY_REQUIRED',
  'PUBLICATION_AUTHORITY_REQUIRED'
]);

const ADMISSION_ONLY = new Set([
  'OVERNIGHT_WINDOW_EXPIRED',
  'OVERNIGHT_INSUFFICIENT_REMAINING_WINDOW',
  'WINDOW_EXPIRED',
  'INSUFFICIENT_REMAINING_WINDOW',
  'STALE_DELEGATION'
]);

const DEPENDENCY_ONLY = new Set([
  'PREDECESSOR_FAILURE',
  'BLOCKED_PREDECESSOR',
  'DEPENDENCY_BLOCKED'
]);

function value(receipt) {
  return String(receipt?.result_class || receipt?.failure_class || receipt?.classification || '').trim().toUpperCase();
}

function classifyReceipt(receipt) {
  const c = value(receipt);
  if (!c) return 'UNKNOWN';
  if (c === 'PASS') return 'PASS';
  if (c === 'SUBJECT_FAILURE') return 'REPAIRABLE_SUBJECT';
  if (c === 'INFRA_FAILURE') return 'RETRYABLE_INFRA';
  if (c === 'CONTROL_PLANE_FAILURE') return 'CONTROL_PLANE_OWNER_ROUTE';
  if (NON_AUTOMATABLE.has(c)) return 'NON_AUTOMATABLE';
  if (ADMISSION_ONLY.has(c)) return 'ADMISSION_ONLY';
  if (DEPENDENCY_ONLY.has(c)) return 'DEPENDENCY_ONLY';
  return 'UNKNOWN';
}

function assertHexSha(name, sha) {
  if (!/^[0-9a-f]{40}$/i.test(String(sha || ''))) throw new Error(`${name} must be a 40-hex Git SHA`);
}

function rejectWorkerAuthority(input) {
  const forbidden = [
    ['promotion_authorized', true],
    ['a01_pass', true],
    ['authoritative_pass', true],
    ['publication_authorized', true],
    ['production_authorized', true]
  ];
  for (const [field, forbiddenValue] of forbidden) {
    if (input?.[field] === forbiddenValue) throw new Error(`repair worker cannot set ${field}=true`);
  }
  if (String(input?.result_class || '').toUpperCase() === 'PASS') throw new Error('repair worker cannot emit result_class=PASS');
  if (input?.command || input?.shell || input?.run) throw new Error('arbitrary command execution is forbidden in repair planning input');
}

function planRepair(input) {
  rejectWorkerAuthority(input);
  if (!input?.receipt_id) throw new Error('receipt_id is required');
  if (!input?.qualification_id) throw new Error('qualification_id is required');
  if (!input?.workstream_id) throw new Error('workstream_id is required');
  if (!input?.owner_path) throw new Error('owner_path is required');
  assertHexSha('failed_subject_sha', input.failed_subject_sha);

  const classification = classifyReceipt(input.receipt || input);
  const attempt = Number(input.repair_attempt ?? 0);
  const maxAttempts = Number(input.max_repair_attempts ?? 1);
  if (!Number.isInteger(attempt) || attempt < 0) throw new Error('repair_attempt must be a non-negative integer');
  if (!Number.isInteger(maxAttempts) || maxAttempts < 0 || maxAttempts > 2) throw new Error('max_repair_attempts must be an integer from 0 to 2');

  const base = {
    receipt_id: input.receipt_id,
    qualification_id: input.qualification_id,
    workstream_id: input.workstream_id,
    owner_path: input.owner_path,
    failed_subject_sha: input.failed_subject_sha,
    repair_attempt: attempt,
    max_repair_attempts: maxAttempts,
    classification,
    promotion_authorized: false,
    authoritative_pass: false
  };

  if (classification === 'PASS') return { ...base, route: 'NO_REPAIR', standing: 'ALREADY_PASS' };
  if (classification === 'NON_AUTOMATABLE') return { ...base, route: 'OWNER_AUTHORITY_REQUIRED', standing: 'BLOCKED_NON_AUTOMATABLE' };
  if (classification === 'ADMISSION_ONLY') return { ...base, route: 'REPLAN_ADMISSION', standing: 'NOT_A_SUBJECT_FAILURE' };
  if (classification === 'DEPENDENCY_ONLY') return { ...base, route: 'WAIT_FOR_PREDECESSOR', standing: 'BLOCKED_PREDECESSOR' };
  if (classification === 'CONTROL_PLANE_OWNER_ROUTE') return { ...base, route: 'CORE_CONTROL_PLANE_REPAIR', standing: 'CONTROL_PLANE_OWNER_REQUIRED' };
  if (classification === 'UNKNOWN') return { ...base, route: 'DEAD_LETTER', standing: 'UNCLASSIFIED_FAILURE' };

  if (classification === 'RETRYABLE_INFRA') {
    if (attempt >= Math.min(maxAttempts, 1)) return { ...base, route: 'DEAD_LETTER', standing: 'INFRA_RETRY_BUDGET_EXHAUSTED' };
    return {
      ...base,
      route: 'RETRY_SAME_SHA',
      standing: 'A01_ELIGIBLE',
      replacement_request: {
        qualification_id: input.qualification_id,
        workstream_id: input.workstream_id,
        subject_sha: input.failed_subject_sha,
        parent_receipt_id: input.receipt_id,
        repair_attempt: attempt + 1,
        retry_kind: 'SAME_SHA_INFRA'
      }
    };
  }

  if (classification !== 'REPAIRABLE_SUBJECT') return { ...base, route: 'DEAD_LETTER', standing: 'UNSUPPORTED_CLASSIFICATION' };
  if (attempt >= maxAttempts) return { ...base, route: 'DEAD_LETTER', standing: 'REPAIR_BUDGET_EXHAUSTED' };

  assertHexSha('replacement_subject_sha', input.replacement_subject_sha);
  if (input.replacement_subject_sha.toLowerCase() === input.failed_subject_sha.toLowerCase()) {
    throw new Error('subject repair must produce a new exact SHA');
  }

  const prequal = input.prequalification || {};
  if (String(prequal.result || '').toUpperCase() !== 'PASS') throw new Error('replacement subject requires deterministic prequalification PASS');
  assertHexSha('prequalification.subject_sha', prequal.subject_sha);
  if (prequal.subject_sha.toLowerCase() !== input.replacement_subject_sha.toLowerCase()) {
    throw new Error('prequalification subject SHA must equal replacement subject SHA');
  }
  if (prequal.qualification_id && prequal.qualification_id !== input.qualification_id) {
    throw new Error('prequalification qualification_id must preserve original qualification lineage');
  }
  if (prequal.workstream_id && prequal.workstream_id !== input.workstream_id) {
    throw new Error('prequalification workstream_id must preserve original workstream lineage');
  }

  return {
    ...base,
    route: 'REQUEUE_CHANGED_SHA',
    standing: 'A01_ELIGIBLE',
    replacement_subject_sha: input.replacement_subject_sha,
    prequalification: {
      result: 'PASS',
      subject_sha: prequal.subject_sha,
      evidence_pointer: prequal.evidence_pointer || null
    },
    replacement_request: {
      qualification_id: input.qualification_id,
      workstream_id: input.workstream_id,
      subject_sha: input.replacement_subject_sha,
      origin_ref: input.repair_branch || null,
      parent_receipt_id: input.receipt_id,
      replacement_of_subject_sha: input.failed_subject_sha,
      repair_attempt: attempt + 1,
      retry_kind: 'CHANGED_SHA_SUBJECT_REPAIR',
      promotion_authorized: false
    }
  };
}

module.exports = { classifyReceipt, planRepair, rejectWorkerAuthority };

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { raw += chunk; });
  process.stdin.on('end', () => {
    try {
      const input = JSON.parse(raw || '{}');
      const output = planRepair(input);
      process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    } catch (error) {
      console.error(`A01_CLOSED_LOOP_REPAIR_ERROR: ${error.message}`);
      process.exit(1);
    }
  });
}
