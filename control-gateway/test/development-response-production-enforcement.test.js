import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditDevelopmentResponseProductionEnforcement } from '../src/development-response-production-enforcement.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, '..', '..');

test('production control-gateway source has no raw GitHub/A-01 admission bypass', () => {
  const violations = auditDevelopmentResponseProductionEnforcement(repositoryRoot);
  assert.deepEqual(violations, []);
});
