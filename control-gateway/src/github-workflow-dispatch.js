export const A01_GATEWAY_WORKFLOW = 'a01-control-plane-gateway.yml';
export const A01_DISPATCH_WORKFLOW = 'a01-control-plane-dispatch-bridge.yml';
export const A01_GATEWAY_NAME = 'A-01 Control Plane Gateway';
export const A01_DEFAULT_RESUME_ON_PASS = 'Adjudicate PASS and continue the next dependency-valid objective.';
export const A01_DEFAULT_RESUME_ON_FAILURE = 'Adjudicate evidence, repair the failing boundary, and rerun the minimum sufficient gate.';

const SHA40 = /^[0-9a-f]{40}$/;
const WORKFLOW_RE = /^[A-Za-z0-9_.-]+\.ya?ml$/;
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;
const ISO_OFFSET_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export class GitHubWorkflowDispatchError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'GitHubWorkflowDispatchError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) { throw new GitHubWorkflowDispatchError(code, message, details); }
function string(value, name, pattern = null, code = 'DISPATCH_INPUT_INVALID') {
  if (typeof value !== 'string' || value.length === 0) fail(code, `${name} must be a non-empty string`);
  if (pattern && !pattern.test(value)) fail(code, `${name} has invalid format`);
  return value;
}
function optionalString(value, name, code) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') fail(code, `${name} must be a string when supplied`);
  return value;
}
function integer(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER, code = 'DISPATCH_INPUT_INVALID' } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(code, `${name} must be an integer in range ${min}..${max}`);
  return value;
}
function validateRef(value, name) {
  string(value, name, REF_RE);
  if (value.includes('..') || value.includes('//') || value.endsWith('/')) fail('DISPATCH_INPUT_INVALID', `${name} contains traversal or an invalid path segment`);
  return value;
}
function validateTimestamp(value, name) {
  if (!ISO_OFFSET_RE.test(value) || Number.isNaN(Date.parse(value))) fail('DISPATCH_WINDOW_INVALID', `${name} must be ISO-8601 with an explicit UTC offset`);
  return value;
}

export function normalizeA01Dispatch({ workflow = A01_DISPATCH_WORKFLOW, ref, inputs }) {
  string(workflow, 'workflow', WORKFLOW_RE);
  validateRef(ref, 'ref');
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) fail('DISPATCH_INPUT_INVALID', 'inputs object required');
  string(inputs.qualification_id, 'qualification_id');
  string(inputs.workstream_id, 'workstream_id');
  string(inputs.subject_sha, 'subject_sha', SHA40);
  validateRef(inputs.origin_ref, 'origin_ref');

  const executionContext = inputs.execution_context ?? 'normal';
  if (!['normal', 'recovery', 'repair', 'overnight'].includes(executionContext)) fail('DISPATCH_INPUT_INVALID', 'execution_context is not registered');

  const qualifierTimeout = integer(inputs.qualifier_timeout_minutes ?? 28, 'qualifier_timeout_minutes', { min: 1, max: 360, code: 'DISPATCH_BUDGET_INVALID' });
  const jobTimeout = integer(inputs.job_timeout_minutes ?? 30, 'job_timeout_minutes', { min: 1, max: 360, code: 'DISPATCH_BUDGET_INVALID' });
  if (jobTimeout <= qualifierTimeout) fail('DISPATCH_BUDGET_INVALID', 'job_timeout_minutes must exceed qualifier_timeout_minutes');

  const repairAttempt = integer(inputs.repair_attempt ?? 0, 'repair_attempt', { min: 0, max: 100 });
  const maxRepairAttempts = integer(inputs.max_repair_attempts ?? 1, 'max_repair_attempts', { min: 0, max: 100 });
  if (repairAttempt > maxRepairAttempts) fail('DISPATCH_INPUT_INVALID', 'repair_attempt cannot exceed max_repair_attempts');

  const notificationTarget = inputs.notification_target ?? 'originating-workstream';
  string(notificationTarget, 'notification_target');
  const notBefore = optionalString(inputs.not_before, 'not_before', 'DISPATCH_WINDOW_INVALID');
  const notAfter = optionalString(inputs.not_after, 'not_after', 'DISPATCH_WINDOW_INVALID');
  const repairTransactionId = optionalString(inputs.repair_transaction_id, 'repair_transaction_id', 'DISPATCH_LINEAGE_INVALID');

  if (executionContext === 'overnight') {
    if (!notBefore || !notAfter) fail('DISPATCH_WINDOW_INVALID', 'overnight execution requires both not_before and not_after');
    validateTimestamp(notBefore, 'not_before');
    validateTimestamp(notAfter, 'not_after');
    if (Date.parse(notBefore) >= Date.parse(notAfter)) fail('DISPATCH_WINDOW_INVALID', 'not_before must be strictly before not_after');
  } else if (notBefore || notAfter) {
    fail('DISPATCH_WINDOW_INVALID', 'admission windows are only valid for overnight execution');
  }

  if (repairAttempt > 0 && !repairTransactionId) fail('DISPATCH_LINEAGE_INVALID', 'repair_attempt above zero requires repair_transaction_id');

  const advanced = Object.freeze({
    notification_target: notificationTarget,
    qualifier_timeout_minutes: qualifierTimeout,
    job_timeout_minutes: jobTimeout,
    not_before: notBefore,
    not_after: notAfter,
    repair_transaction_id: repairTransactionId
  });

  // GitHub workflow_dispatch currently permits at most ten declared inputs. The frozen
  // P06 packet therefore remains fifteen logical fields while six advanced fields travel
  // inside one validated JSON envelope. Both the bridge and direct gateway understand it.
  const normalizedInputs = Object.freeze({
    qualification_id: inputs.qualification_id,
    workstream_id: inputs.workstream_id,
    subject_sha: inputs.subject_sha,
    origin_ref: inputs.origin_ref,
    resume_on_pass: inputs.resume_on_pass ?? A01_DEFAULT_RESUME_ON_PASS,
    resume_on_failure: inputs.resume_on_failure ?? A01_DEFAULT_RESUME_ON_FAILURE,
    execution_context: executionContext,
    repair_attempt: String(repairAttempt),
    max_repair_attempts: String(maxRepairAttempts),
    advanced_json: JSON.stringify(advanced)
  });
  return Object.freeze({ workflow, ref, inputs: normalizedInputs });
}

export class GitHubWorkflowDispatchRestTransport {
  constructor({ owner, repo, tokenProvider = null, fetchImpl = globalThis.fetch, apiBase = 'https://api.github.com' }) {
    if (!owner || !repo) throw new TypeError('owner and repo required');
    if (tokenProvider !== null && typeof tokenProvider !== 'function') throw new TypeError('tokenProvider must be a function or null');
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl function required');
    this.owner = owner;
    this.repo = repo;
    this.tokenProvider = tokenProvider;
    this.fetchImpl = fetchImpl;
    this.apiBase = apiBase.replace(/\/$/, '');
  }

  async request(method, path, body = undefined) {
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    const token = this.tokenProvider ? await this.tokenProvider() : null;
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await this.fetchImpl(`${this.apiBase}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (cause) {
      fail('DISPATCH_NETWORK_AMBIGUOUS', 'GitHub request failed before a definitive response', { cause });
    }
    const text = await response.text();
    let parsed = null;
    if (text) {
      try { parsed = JSON.parse(text); } catch { parsed = text; }
    }
    if (!response.ok) {
      fail(
        'DISPATCH_GITHUB_API_ERROR',
        typeof parsed === 'object' && parsed?.message ? parsed.message : `GitHub API ${response.status}`,
        { status: response.status, body: parsed }
      );
    }
    return { status: response.status, body: parsed };
  }

  async snapshotRuns(workflow, ref) {
    const path = `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/actions/workflows/${encodeURIComponent(workflow)}/runs?event=workflow_dispatch&branch=${encodeURIComponent(ref)}&per_page=100`;
    const result = await this.request('GET', path);
    return result.body?.workflow_runs ?? [];
  }

  async dispatch(workflow, ref, inputs) {
    return this.request(
      'POST',
      `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
      { ref, inputs }
    );
  }

  async jobs(runId) {
    const result = await this.request('GET', `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/actions/runs/${runId}/jobs?per_page=100`);
    return result.body?.jobs ?? [];
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function dispatchA01AndCorrelate({ transport, ref = 'main', inputs, pollAttempts = 12, pollIntervalMs = 1000 }) {
  if (!transport || typeof transport.snapshotRuns !== 'function' || typeof transport.dispatch !== 'function' || typeof transport.jobs !== 'function') {
    throw new TypeError('workflow dispatch transport required');
  }
  const packet = normalizeA01Dispatch({ ref, inputs });
  const before = await transport.snapshotRuns(packet.workflow, packet.ref);
  const priorIds = new Set(before.map((run) => run.id));
  const requestedAt = new Date().toISOString();
  const response = await transport.dispatch(packet.workflow, packet.ref, packet.inputs);
  if (response?.status !== 204) {
    fail('DISPATCH_HTTP_RESULT_INVALID', `workflow_dispatch expected HTTP 204, received ${response?.status ?? '<missing>'}`);
  }

  for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
    const after = await transport.snapshotRuns(packet.workflow, packet.ref);
    const candidates = after.filter((run) =>
      !priorIds.has(run.id) &&
      run.event === 'workflow_dispatch' &&
      run.head_branch === packet.ref &&
      new Date(run.created_at).getTime() >= new Date(requestedAt).getTime() - 2000
    );
    if (candidates.length > 1) {
      fail('DISPATCH_CORRELATION_AMBIGUOUS', 'multiple new workflow runs match dispatch boundary', { run_ids: candidates.map((run) => run.id) });
    }
    if (candidates.length === 1) {
      const run = candidates[0];
      const jobs = await transport.jobs(run.id);
      return Object.freeze({
        request_identity: 'connected-github-adapter',
        workflow: packet.workflow,
        ref: packet.ref,
        normalized_inputs: packet.inputs,
        http_status: response.status,
        workflow_run: Object.freeze({
          id: run.id,
          url: run.html_url ?? null,
          status: run.status ?? null,
          conclusion: run.conclusion ?? null,
          head_sha: run.head_sha ?? null,
          created_at: run.created_at ?? null
        }),
        jobs: Object.freeze(jobs.map((job) => Object.freeze({
          id: job.id,
          name: job.name,
          status: job.status,
          conclusion: job.conclusion ?? null
        })))
      });
    }
    if (attempt + 1 < pollAttempts) await sleep(pollIntervalMs);
  }
  fail('DISPATCH_RUN_NOT_ATTRIBUTABLE', 'GitHub accepted workflow_dispatch but no uniquely attributable run appeared before correlation deadline');
}
