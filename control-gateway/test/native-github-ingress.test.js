import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NATIVE_GITHUB_INGRESS_PROTOCOL,
  parseNativeGitHubIngressEvent
} from '../src/native-github-ingress.js';

const REPOSITORY = 'BFochtman746/system-master';
const MUTATION_ID = 'LEARNING-SYSTEM-REBUILD-001M-S06-GW01-RECOVERY-001';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fixture() {
  const request = {
    protocol_version: 'control-gateway.github-mutation-request.v1',
    mutation_id: MUTATION_ID,
    repository: REPOSITORY,
    target_kind: 'WORK_REF',
    target_ref: 'learning/system-rebuild-001m-s06-learning-effectiveness-20260912',
    expected_predecessor_sha: 'f37d7c82dbfacb50fb8103b9138b473b8830fabc'
  };
  const plan = {
    protocol_version: 'control-gateway.github-production-mutation-plan.v1',
    mutation_id: MUTATION_ID,
    repository: REPOSITORY,
    target_kind: request.target_kind,
    target_ref: request.target_ref,
    expected_predecessor_sha: request.expected_predecessor_sha,
    commit_message: 'test',
    writes: [],
    deletes: []
  };
  const envelope = {
    protocol_version: NATIVE_GITHUB_INGRESS_PROTOCOL,
    state_ref: 'control-gateway-state/active-work/learning-system-rebuild-001m-s06',
    mutation_request: request,
    mutation_plan: plan
  };
  return {
    action: 'opened',
    repository: { owner: { login: 'BFochtman746' } },
    issue: {
      number: 101,
      title: `[CONTROL-GATEWAY] ${MUTATION_ID}`,
      body: JSON.stringify(envelope),
      author_association: 'OWNER',
      user: { login: 'BFochtman746' }
    }
  };
}

function expectCode(event, code) {
  assert.throws(
    () => parseNativeGitHubIngressEvent({ event, repository: REPOSITORY }),
    (error) => error?.code === code
  );
}

test('accepts exact owner-authored native ingress envelope', () => {
  const parsed = parseNativeGitHubIngressEvent({ event: fixture(), repository: REPOSITORY });
  assert.equal(parsed.mutationId, MUTATION_ID);
  assert.equal(parsed.stateRef, 'control-gateway-state/active-work/learning-system-rebuild-001m-s06');
  assert.equal(parsed.request.repository, REPOSITORY);
  assert.equal(parsed.plan.expected_predecessor_sha, parsed.request.expected_predecessor_sha);
  assert.deepEqual(JSON.parse(parsed.requestJson), parsed.request);
  assert.deepEqual(JSON.parse(parsed.planJson), parsed.plan);
});

test('rejects non-owner issue author', () => {
  const event = fixture();
  event.issue.user.login = 'attacker';
  expectCode(event, 'NATIVE_INGRESS_AUTHOR_FORBIDDEN');
});

test('rejects non-OWNER author association', () => {
  const event = fixture();
  event.issue.author_association = 'CONTRIBUTOR';
  expectCode(event, 'NATIVE_INGRESS_AUTHOR_ASSOCIATION_FORBIDDEN');
});

test('rejects title that is not exactly bound to mutation id', () => {
  const event = fixture();
  event.issue.title = '[CONTROL-GATEWAY] different-mutation';
  expectCode(event, 'NATIVE_INGRESS_TITLE_MISMATCH');
});

test('rejects malformed JSON body', () => {
  const event = fixture();
  event.issue.body = '{not-json';
  expectCode(event, 'NATIVE_INGRESS_BODY_JSON_INVALID');
});

test('rejects extra envelope keys', () => {
  const event = fixture();
  const envelope = JSON.parse(event.issue.body);
  envelope.untrusted = true;
  event.issue.body = JSON.stringify(envelope);
  expectCode(event, 'NATIVE_INGRESS_ENVELOPE_KEYS_INVALID');
});

test('rejects mutation id mismatch between request and plan', () => {
  const event = fixture();
  const envelope = JSON.parse(event.issue.body);
  envelope.mutation_plan.mutation_id = 'different';
  event.issue.body = JSON.stringify(envelope);
  expectCode(event, 'NATIVE_INGRESS_MUTATION_ID_MISMATCH');
});

test('rejects repository mismatch', () => {
  const event = fixture();
  const envelope = JSON.parse(event.issue.body);
  envelope.mutation_request.repository = 'someone/else';
  event.issue.body = JSON.stringify(envelope);
  expectCode(event, 'NATIVE_INGRESS_REQUEST_REPOSITORY_MISMATCH');
});

test('rejects predecessor mismatch between request and plan', () => {
  const event = fixture();
  const envelope = JSON.parse(event.issue.body);
  envelope.mutation_plan.expected_predecessor_sha = '0000000000000000000000000000000000000000';
  event.issue.body = JSON.stringify(envelope);
  expectCode(event, 'NATIVE_INGRESS_PREDECESSOR_MISMATCH');
});

test('rejects state ref outside durable active-work namespace', () => {
  const event = fixture();
  const envelope = JSON.parse(event.issue.body);
  envelope.state_ref = 'heads/main';
  event.issue.body = JSON.stringify(envelope);
  expectCode(event, 'NATIVE_INGRESS_STATE_REF_FORBIDDEN');
});

test('rejects traversal-like state refs', () => {
  const event = fixture();
  const envelope = JSON.parse(event.issue.body);
  envelope.state_ref = 'control-gateway-state/active-work/../main';
  event.issue.body = JSON.stringify(envelope);
  expectCode(event, 'NATIVE_INGRESS_STATE_REF_INVALID');
});
