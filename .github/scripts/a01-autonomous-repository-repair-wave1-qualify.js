#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
function read(rel) { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); }
function assert(condition, message) { if (!condition) throw new Error(message); }

const blueprint = read('governance/repair/A01-AUTONOMOUS-REPOSITORY-REPAIR-CONTROLLER-BLUEPRINT-001.json');
const preflightSchema = read('governance/repair/A01-REPOSITORY-REPAIR-PREFLIGHT-REPORT-001.schema.json');
const closureSchema = read('governance/repair/A01-REPAIR-CLOSURE-READINESS-001.schema.json');
assert(blueprint.blueprint_id === 'A01-AUTONOMOUS-REPOSITORY-REPAIR-CONTROLLER-BLUEPRINT-001', 'BLUEPRINT_ID_MISMATCH');
assert(blueprint.wave1?.may_mutate_repository === false, 'WAVE1_MUTATION_AUTHORITY_FORBIDDEN');
assert(blueprint.wave1?.may_acquire_repair_write_authority === false, 'WAVE1_REPAIR_WRITE_AUTHORITY_FORBIDDEN');
for (const [name, schema] of [['preflight', preflightSchema], ['closure', closureSchema]]) {
  assert(schema.$schema === 'https://json-schema.org/draft/2020-12/schema', `${name.toUpperCase()}_SCHEMA_DRAFT_MISMATCH`);
  assert(schema.additionalProperties === false, `${name.toUpperCase()}_SCHEMA_MUST_REJECT_UNKNOWN_TOP_LEVEL_FIELDS`);
}

const cases = [
  [process.execPath, ['--test', 'control-gateway/test/a01-repository-repair-preflight.test.js']],
  [process.platform === 'win32' ? 'python' : 'python3', ['control-gateway/python/test_a01_repair_closure_evidence.py']]
];
let suitesPassed = 0;
for (const [command, args] of cases) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    process.exit(result.status || 1);
  }
  suitesPassed += 1;
}
assert(suitesPassed === cases.length, 'WAVE1_TEST_SUITE_COUNT_MISMATCH');
process.stdout.write(JSON.stringify({
  status: 'PASS',
  blueprint_id: blueprint.blueprint_id,
  wave: 1,
  scope: 'READ_ONLY_FOUNDATIONS',
  exact_subject: process.env.GITHUB_SHA || 'WORKTREE',
  test_suites_passed: suitesPassed,
  schema_contracts_validated: 2,
  repair_write_authority: false,
  promotion_authority: false,
  branch_deletion_authority: false
}) + '\n');
