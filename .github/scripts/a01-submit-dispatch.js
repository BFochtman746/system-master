'use strict';

const https = require('https');

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  throw error;
}
function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) fail('MISSING_INPUT', name);
  return value;
}
function optional(name, fallback = '') { return String(process.env[name] ?? fallback); }
function isSha(value) { return /^[0-9a-f]{40}$/i.test(value); }

const token = required('GITHUB_TOKEN');
const repository = required('GITHUB_REPOSITORY');
const subjectSha = required('A01_SUBJECT_SHA');
if (!isSha(subjectSha)) fail('INVALID_SUBJECT_SHA', subjectSha);

const inputs = {
  qualification_id: required('A01_QUALIFICATION_ID'),
  workstream_id: required('A01_WORKSTREAM_ID'),
  subject_sha: subjectSha,
  origin_ref: required('A01_ORIGIN_REF'),
  resume_on_pass: required('A01_RESUME_ON_PASS'),
  resume_on_failure: required('A01_RESUME_ON_FAILURE'),
  notification_target: required('A01_NOTIFICATION_TARGET'),
  execution_context: optional('A01_EXECUTION_CONTEXT', 'normal'),
  qualifier_timeout_minutes: optional('A01_QUALIFIER_TIMEOUT_MINUTES', '28'),
  job_timeout_minutes: optional('A01_JOB_TIMEOUT_MINUTES', '30'),
  not_before: optional('A01_NOT_BEFORE', ''),
  not_after: optional('A01_NOT_AFTER', ''),
  repair_attempt: optional('A01_REPAIR_ATTEMPT', '0'),
  max_repair_attempts: optional('A01_MAX_REPAIR_ATTEMPTS', '1'),
  repair_transaction_id: optional('A01_REPAIR_TRANSACTION_ID', '')
};

if (!['normal', 'overnight'].includes(inputs.execution_context)) fail('INVALID_EXECUTION_CONTEXT', inputs.execution_context);
for (const field of ['qualifier_timeout_minutes', 'job_timeout_minutes', 'repair_attempt', 'max_repair_attempts']) {
  if (!/^\d+$/.test(inputs[field])) fail('INVALID_NUMERIC_INPUT', `${field}:${inputs[field]}`);
}

const payload = JSON.stringify({ ref: 'main', inputs });
const [owner, repo] = repository.split('/');
if (!owner || !repo) fail('INVALID_REPOSITORY', repository);

const options = {
  hostname: 'api.github.com',
  path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/a01-qualification-dispatch.yml/dispatches`,
  method: 'POST',
  headers: {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'system-master-a01-submit-dispatch',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

const request = https.request(options, response => {
  let body = '';
  response.setEncoding('utf8');
  response.on('data', chunk => { body += chunk; });
  response.on('end', () => {
    if (response.statusCode !== 204) {
      console.error(`A01_CANONICAL_DISPATCH=FAIL status=${response.statusCode} body=${body.slice(0, 1000)}`);
      process.exit(1);
    }
    console.log(`A01_CANONICAL_DISPATCH=SUBMITTED qualification=${inputs.qualification_id} workstream=${inputs.workstream_id} subject=${subjectSha} ref=main`);
  });
});
request.on('error', error => {
  console.error(`A01_CANONICAL_DISPATCH=FAIL network=${error.message}`);
  process.exit(1);
});
request.write(payload);
request.end();
