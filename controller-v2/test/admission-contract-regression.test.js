import test from 'node:test';
import assert from 'node:assert/strict';
import { ControllerKernel, ControllerError } from '../src/kernel.js';
import { buildAuthorizationRequest, POLICY_DECISION_CANDIDATE_SCHEMA, validatePolicyDecisionCandidate } from '../src/admission.js';
import { sha256, uuidv7 } from '../src/canonical.js';

const SUBJECT = { algorithm: 'sha1', oid: '0123456789abcdef0123456789abcdef01234567' };
const PROFILE = {
  actionClassByCommandType: { 'controller.work.submit': 'controller.work' },
  requestedCompletionClassByCommandType: { 'controller.work.submit': 'standard' },
  defaultRequestedCompletionClass: 'standard'
};

function setup() {
  const kernel = new ControllerKernel(':memory:');
  const command = {
    protocol_version: '1.0', schema: 'controller://schemas/command/v1', command_id: uuidv7(), created_at: new Date().toISOString(),
    issuer: { principal: 'user:test', source: 'chatgpt' }, command_type: 'controller.work.submit',
    target: { repository: 'BFochtman746/system-master', expected_subject: SUBJECT }, preconditions: {}, intent: { task: 'contract-regression' }, constraints: {}, required_policy_version: 'policy.v1'
  };
  const tx = kernel.acceptCommand(command).transaction_id;
  const { request, input_digest } = buildAuthorizationRequest(kernel, tx, {}, PROFILE);
  return { kernel, request, input_digest };
}

function candidate(request, decisionId) {
  return {
    schema: POLICY_DECISION_CANDIDATE_SCHEMA, decision_id: decisionId, outcome: 'ALLOW', policy_version: request.required_policy_version,
    policy_revision: 'policy-rev-001', policy_digest: 'a'.repeat(64), input_digest: sha256(request), reason_codes: [],
    determining_policy_ids: ['policy.main'], diagnostic_error_codes: [], principal_refs: [], delegation_refs: [], approval_refs: [],
    approval_required: false, completion_contract: { operations: 'none', qualification: 'not_required', promotion: 'not_required' }, valid_until: null
  };
}

test('F006 design-lock regression: non-UUID decision IDs require explicit adapter acceptance', () => {
  const { kernel, request, input_digest } = setup();
  const id = 'provider:immutable:decision-42';
  assert.throws(() => validatePolicyDecisionCandidate(candidate(request, id), request, input_digest, PROFILE),
    (error) => error instanceof ControllerError && error.code === 'POLICY_DECISION_INVALID');
  const accepted = validatePolicyDecisionCandidate(candidate(request, id), request, input_digest,
    { ...PROFILE, validateDecisionId: (value) => value === id });
  assert.equal(accepted.candidate.decision_id, id);
  assert.equal(accepted.deferred, false);
  assert.throws(() => validatePolicyDecisionCandidate(candidate(request, id), request, input_digest,
    { ...PROFILE, validateDecisionId: () => { throw new Error('adapter failure'); } }),
    (error) => error instanceof ControllerError && error.code === 'POLICY_DECISION_INVALID');
  kernel.close();
});
