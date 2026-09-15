'use strict';

export const NATIVE_GITHUB_INGRESS_PROTOCOL = 'control-gateway.native-github-ingress.v1';
export const MUTATION_REQUEST_PROTOCOL = 'control-gateway.github-mutation-request.v1';
export const MUTATION_PLAN_PROTOCOL = 'control-gateway.github-production-mutation-plan.v1';

const ENVELOPE_KEYS = ['mutation_plan', 'mutation_request', 'protocol_version', 'state_ref'];

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  throw error;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requirePlainObject(value, code) {
  if (!isPlainObject(value)) fail(code);
  return value;
}

function requireNonEmptyString(value, code) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) fail(code);
  return value;
}

function requireExactKeys(value, expected, code) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(code, `expected=${wanted.join(',')} actual=${actual.join(',')}`);
  }
}

function validateStateRef(value) {
  const stateRef = requireNonEmptyString(value, 'NATIVE_INGRESS_STATE_REF_INVALID');
  if (!stateRef.startsWith('control-gateway-state/active-work/')) fail('NATIVE_INGRESS_STATE_REF_FORBIDDEN');
  if (!/^[A-Za-z0-9._/-]+$/.test(stateRef)) fail('NATIVE_INGRESS_STATE_REF_INVALID');
  if (stateRef.startsWith('/') || stateRef.endsWith('/') || stateRef.includes('//')) fail('NATIVE_INGRESS_STATE_REF_INVALID');
  if (stateRef.split('/').includes('..')) fail('NATIVE_INGRESS_STATE_REF_INVALID');
  return stateRef;
}

function bindEqual(left, right, code) {
  if (left !== right) fail(code);
}

export function parseNativeGitHubIngressEvent({ event, repository }) {
  requirePlainObject(event, 'NATIVE_INGRESS_EVENT_INVALID');
  const repo = requireNonEmptyString(repository, 'NATIVE_INGRESS_REPOSITORY_INVALID');
  if (event.action !== 'opened') fail('NATIVE_INGRESS_ACTION_FORBIDDEN');

  const issue = requirePlainObject(event.issue, 'NATIVE_INGRESS_ISSUE_MISSING');
  const sender = requirePlainObject(issue.user, 'NATIVE_INGRESS_ISSUE_USER_MISSING');
  const repositoryOwner = requireNonEmptyString(event.repository?.owner?.login, 'NATIVE_INGRESS_OWNER_MISSING');
  if (sender.login !== repositoryOwner) fail('NATIVE_INGRESS_AUTHOR_FORBIDDEN');
  if (issue.author_association !== 'OWNER') fail('NATIVE_INGRESS_AUTHOR_ASSOCIATION_FORBIDDEN');

  const body = requireNonEmptyString(issue.body, 'NATIVE_INGRESS_BODY_MISSING');
  let envelope;
  try {
    envelope = JSON.parse(body);
  } catch {
    fail('NATIVE_INGRESS_BODY_JSON_INVALID');
  }
  requirePlainObject(envelope, 'NATIVE_INGRESS_ENVELOPE_INVALID');
  requireExactKeys(envelope, ENVELOPE_KEYS, 'NATIVE_INGRESS_ENVELOPE_KEYS_INVALID');
  bindEqual(envelope.protocol_version, NATIVE_GITHUB_INGRESS_PROTOCOL, 'NATIVE_INGRESS_PROTOCOL_UNSUPPORTED');

  const stateRef = validateStateRef(envelope.state_ref);
  const request = requirePlainObject(envelope.mutation_request, 'NATIVE_INGRESS_REQUEST_INVALID');
  const plan = requirePlainObject(envelope.mutation_plan, 'NATIVE_INGRESS_PLAN_INVALID');

  bindEqual(request.protocol_version, MUTATION_REQUEST_PROTOCOL, 'NATIVE_INGRESS_REQUEST_PROTOCOL_UNSUPPORTED');
  bindEqual(plan.protocol_version, MUTATION_PLAN_PROTOCOL, 'NATIVE_INGRESS_PLAN_PROTOCOL_UNSUPPORTED');

  const mutationId = requireNonEmptyString(request.mutation_id, 'NATIVE_INGRESS_MUTATION_ID_INVALID');
  bindEqual(plan.mutation_id, mutationId, 'NATIVE_INGRESS_MUTATION_ID_MISMATCH');
  bindEqual(request.repository, repo, 'NATIVE_INGRESS_REQUEST_REPOSITORY_MISMATCH');
  bindEqual(plan.repository, repo, 'NATIVE_INGRESS_PLAN_REPOSITORY_MISMATCH');
  bindEqual(request.target_kind, plan.target_kind, 'NATIVE_INGRESS_TARGET_KIND_MISMATCH');
  bindEqual(request.target_ref, plan.target_ref, 'NATIVE_INGRESS_TARGET_REF_MISMATCH');
  bindEqual(request.expected_predecessor_sha, plan.expected_predecessor_sha, 'NATIVE_INGRESS_PREDECESSOR_MISMATCH');

  const expectedTitle = `[CONTROL-GATEWAY] ${mutationId}`;
  bindEqual(issue.title, expectedTitle, 'NATIVE_INGRESS_TITLE_MISMATCH');

  return Object.freeze({
    stateRef,
    mutationId,
    request,
    plan,
    requestJson: JSON.stringify(request),
    planJson: JSON.stringify(plan)
  });
}
