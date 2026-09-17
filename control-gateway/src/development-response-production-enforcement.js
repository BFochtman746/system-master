import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditDevelopmentResponseProductionEnforcement } from '../src/development-response-production-enforcement.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, '..', '..');

const SAFE_PRODUCTION_WRITER = [
  'new GovernedGitHubMutationAdmissionGate(',
  'governedAdmissionGate.admit(request, { responseText, responseReceipt })'
].join('\n');

const SAFE_BOOTSTRAP_WRITER = [
  'assertDevelopmentResponseAuthorization({',
  'CONTROL_GATEWAY_DEVELOPMENT_RESPONSE_BASE64',
  'CONTROL_GATEWAY_DEVELOPMENT_RESPONSE_RECEIPT_JSON'
].join('\n');

function createFixture(t, {
  source = 'export const safe = true;\n',
  productionWriter = SAFE_PRODUCTION_WRITER,
  bootstrapWriter = SAFE_BOOTSTRAP_WRITER
} = {}) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'development-response-production-enforcement-')
  );

  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  fs.mkdirSync(path.join(root, 'control-gateway', 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, '.github', 'scripts'), { recursive: true });

  fs.writeFileSync(
    path.join(root, 'control-gateway', 'src', 'safe.js'),
    source,
    'utf8'
  );

  fs.writeFileSync(
    path.join(root, '.github', 'scripts', 'control-gateway-production-writer.js'),
    productionWriter,
    'utf8'
  );

  fs.writeFileSync(
    path.join(root, '.github', 'scripts', 'control-gateway-authority-bootstrap.js'),
    bootstrapWriter,
    'utf8'
  );

  return root;
}

test('production control-gateway source has no raw GitHub/A-01 admission bypass', () => {
  const violations = auditDevelopmentResponseProductionEnforcement(repositoryRoot);
  assert.deepEqual(violations, []);
});

test('raw admission in ordinary control-gateway source fails enforcement', (t) => {
  const root = createFixture(t, {
    source: 'new GitHubMutationAdmissionGate();\n'
  });

  const violations = auditDevelopmentResponseProductionEnforcement(root);

  assert.ok(
    violations.some(({ path: violationPath }) =>
      violationPath === 'control-gateway/src/safe.js'
    )
  );
});

test('missing governed production admission marker fails enforcement', (t) => {
  const root = createFixture(t, {
    productionWriter: 'new GovernedGitHubMutationAdmissionGate(\n'
  });

  const violations = auditDevelopmentResponseProductionEnforcement(root);

  assert.ok(
    violations.some(({ path: violationPath, missing }) =>
      violationPath === '.github/scripts/control-gateway-production-writer.js' &&
      missing === 'governedAdmissionGate.admit(request, { responseText, responseReceipt })'
    )
  );
});

test('missing bootstrap response receipt marker fails enforcement', (t) => {
  const root = createFixture(t, {
    bootstrapWriter: [
      'assertDevelopmentResponseAuthorization({',
      'CONTROL_GATEWAY_DEVELOPMENT_RESPONSE_BASE64'
    ].join('\n')
  });

  const violations = auditDevelopmentResponseProductionEnforcement(root);

  assert.ok(
    violations.some(({ path: violationPath, missing }) =>
      violationPath === '.github/scripts/control-gateway-authority-bootstrap.js' &&
      missing === 'CONTROL_GATEWAY_DEVELOPMENT_RESPONSE_RECEIPT_JSON'
    )
  );
});

test('raw GitHub admission restored in a production entrypoint fails enforcement', (t) => {
  const root = createFixture(t, {
    productionWriter: `${SAFE_PRODUCTION_WRITER}\nnew GitHubMutationAdmissionGate(`
  });

  const violations = auditDevelopmentResponseProductionEnforcement(root);

  assert.ok(
    violations.some(({ path: violationPath, pattern }) =>
      violationPath === '.github/scripts/control-gateway-production-writer.js' &&
      typeof pattern === 'string'
    )
  );
});