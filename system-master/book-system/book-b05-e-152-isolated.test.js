'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const manifest = require('../../qualification/book-system/reconstruction/BOOK-B05-E-152-DENOMINATOR-v1.json');

const ROOT = path.resolve(__dirname, '../..');
const CSV_PATH = path.join(ROOT, manifest.frozen_denominator_path);

function ids(prefix, count) {
  return Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(2, '0')}`);
}

const EXPECTED = [
  ...ids('C', 24),
  ...ids('S', 36),
  ...ids('K', 20),
  ...ids('O', 24),
  ...ids('I', 24),
  ...ids('X', 24)
];

function csvCaseIds() {
  const lines = fs.readFileSync(CSV_PATH, 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  assert.ok(lines.length >= 153, 'frozen denominator CSV must include header plus 152 cases');
  return lines.slice(1).map(line => line.split(',', 1)[0].replace(/^"|"$/g, '').trim());
}

function groupFor(caseId) {
  return manifest.groups.find(group => caseId.startsWith(group.group));
}

function selectorFor(caseId, group) {
  return `^${group.selector_prefix}${caseId.slice(1)}\\b`;
}

function childDiagnostic(caseId, group, selector, result) {
  return [
    `case_id=${caseId}`,
    `source=${group.source}`,
    `selector=${selector}`,
    `status=${String(result.status)}`,
    `signal=${String(result.signal)}`,
    `spawn_error=${result.error ? result.error.stack || result.error.message || String(result.error) : 'none'}`,
    '--- child stdout ---',
    result.stdout || '',
    '--- child stderr ---',
    result.stderr || '',
    '--- end child diagnostic ---'
  ].join('\n');
}

assert.equal(manifest.total, 152);
assert.equal(manifest.fresh_execution_required, true);
assert.equal(manifest.historical_pass_transfer, 0);
assert.equal(manifest.denominator_shrinkage_allowed, false);
assert.equal(manifest.canonical_effect, false);
assert.deepEqual(manifest.groups.map(x => [x.group, x.count]), [['C',24],['S',36],['K',20],['O',24],['I',24],['X',24]]);
assert.deepEqual(csvCaseIds(), EXPECTED, 'frozen CSV IDs/order must be exactly C24,S36,K20,O24,I24,X24');
assert.equal(new Set(EXPECTED).size, 152, 'duplicate denominator ID');

for (const caseId of EXPECTED) {
  const group = groupFor(caseId);
  assert.ok(group, `missing execution group for ${caseId}`);
  const selector = selectorFor(caseId, group);
  test(`${caseId} fresh isolated frozen-denominator execution`, { concurrency: false }, () => {
    const result = spawnSync(process.execPath, ['--test', `--test-name-pattern=${selector}`, group.source], {
      cwd: ROOT,
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 16 * 1024 * 1024
    });
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    const diagnostic = childDiagnostic(caseId, group, selector, result);
    assert.equal(result.status, 0, `${caseId} child execution failed\n${diagnostic}`);
    assert.match(output, /# pass 1\b/, `${caseId} did not execute exactly one passing selected case\n${diagnostic}`);
    assert.match(output, /# fail 0\b/, `${caseId} child execution reported failure\n${diagnostic}`);
    assert.match(output, /# cancelled 0\b/, `${caseId} child execution cancelled\n${diagnostic}`);
  });
}
