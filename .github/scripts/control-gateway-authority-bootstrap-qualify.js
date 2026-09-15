'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');
const script = path.join(root, '.github', 'scripts', 'control-gateway-authority-bootstrap.js');
const evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'control-gateway-bootstrap-qualify-'));
const secret = 'qualification-token-must-not-be-persisted';
const request = {
  operation: 'CONTROL-GATEWAY-AUTHORITY-BOOTSTRAP-001',
  state_ref: 'control-gateway-state/active-work/qualification-only',
  repository: 'BFochtman746/system-master',
  workstream_id: 'QUALIFICATION',
  mission_version: 'qualification/v1',
  publication_commit_sha: '0'.repeat(40),
  expected_predecessor_sha: '1'.repeat(40)
};

try {
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      CONTROL_GATEWAY_BOOTSTRAP_REQUEST_JSON: JSON.stringify(request),
      CONTROL_GATEWAY_WRITER_TOKEN: secret,
      CONTROL_GATEWAY_WRITER_EVIDENCE_DIR: evidenceDir,
      CONTROL_GATEWAY_WRITER_ACTUAL_APP_SLUG: 'control-gateway-writer',
      CONTROL_GATEWAY_WRITER_EXPECTED_APP_SLUG: '',
      CONTROL_GATEWAY_WRITER_INSTALLATION_ID: '161212907',
      GITHUB_ACTIONS: 'true',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_SHA: '2'.repeat(40),
      GITHUB_RUN_ID: 'qualification-run'
    }
  });

  if (result.status === 0) throw new Error('QUALIFICATION_EXPECTED_FAIL_CLOSED');
  const stderr = String(result.stderr || '');
  if (!stderr.includes('code=AUTHORITY_BOOTSTRAP_INPUTS_MISSING message=AUTHORITY_BOOTSTRAP_INPUTS_MISSING')) {
    throw new Error(`QUALIFICATION_FAILURE_CLASSIFICATION_MISSING:${stderr.trim()}`);
  }

  const requestPath = path.join(evidenceDir, 'bootstrap-request.json');
  const failurePath = path.join(evidenceDir, 'bootstrap-failure.json');
  if (!fs.existsSync(requestPath)) throw new Error('QUALIFICATION_REQUEST_EVIDENCE_MISSING');
  if (!fs.existsSync(failurePath)) throw new Error('QUALIFICATION_FAILURE_EVIDENCE_MISSING');

  const persistedRequest = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
  const failure = JSON.parse(fs.readFileSync(failurePath, 'utf8'));
  if (persistedRequest.repository !== request.repository) throw new Error('QUALIFICATION_REQUEST_EVIDENCE_MISMATCH');
  if (failure.schema_version !== 1 || failure.outcome !== 'FAIL') throw new Error('QUALIFICATION_FAILURE_EVIDENCE_SCHEMA_INVALID');
  if (failure.code !== 'AUTHORITY_BOOTSTRAP_INPUTS_MISSING') throw new Error('QUALIFICATION_FAILURE_EVIDENCE_CODE_INVALID');
  if (failure.writer_identity?.actual_app_slug !== 'control-gateway-writer') throw new Error('QUALIFICATION_ACTUAL_WRITER_IDENTITY_MISSING');
  if (failure.writer_identity?.expected_app_slug !== '') throw new Error('QUALIFICATION_EXPECTED_WRITER_IDENTITY_NOT_EMPTY');
  if (failure.writer_identity?.installation_id !== '161212907') throw new Error('QUALIFICATION_INSTALLATION_ID_MISSING');
  if (failure.github?.ref !== 'refs/heads/main' || failure.github?.run_id !== 'qualification-run') {
    throw new Error('QUALIFICATION_GITHUB_CONTEXT_MISSING');
  }

  const evidenceText = fs.readdirSync(evidenceDir)
    .map((name) => fs.readFileSync(path.join(evidenceDir, name), 'utf8'))
    .join('\n');
  if (evidenceText.includes(secret)) throw new Error('QUALIFICATION_SECRET_PERSISTED_IN_EVIDENCE');

  console.log('CONTROL_GATEWAY_AUTHORITY_BOOTSTRAP_FAILURE_EVIDENCE=PASS');
} finally {
  fs.rmSync(evidenceDir, { recursive: true, force: true });
}
