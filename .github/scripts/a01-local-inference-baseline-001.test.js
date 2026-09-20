'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const qualifier = fs.readFileSync(path.join(root, '.github/scripts/a01-local-inference-baseline-001.js'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/a01-local-inference-baseline-001.yml'), 'utf8');
const registry = JSON.parse(fs.readFileSync(path.join(root, 'qualification/a01/registry.json'), 'utf8'));
const id = 'A01-LOCAL-INFERENCE-BASELINE-001';

test('registry binds local inference baseline to the exact subject wrapper', () => {
  const entry = registry.qualifications[id];
  assert.ok(registry.registry_version >= 32);
  assert.ok(entry);
  assert.equal(entry.workstream_id, 'SYSTEM-MASTER');
  assert.equal(entry.gate_class, 'focused');
  assert.equal(entry.source, 'subject');
  assert.equal(entry.executable, 'node');
  assert.deepEqual(entry.args, ['.github/scripts/a01-local-inference-baseline-001.js']);
  assert.equal(entry.overnight_eligible, false);
});

test('qualifier is fixed-model fixed-prompt and uses only local Lemonade HTTP APIs', () => {
  assert.match(qualifier, /const MODEL = 'gpt-oss-20b-NPU'/);
  assert.match(qualifier, /const PROMPT = 'Reply with exactly: A01_LOCAL_LLM_OK'/);
  assert.match(qualifier, /127\.0\.0\.1:13305/);
  assert.match(qualifier, /'\/api\/v1', '\/v1'/);
  assert.match(qualifier, /\/models/);
  assert.match(qualifier, /\/load/);
  assert.match(qualifier, /\/responses/);
  assert.match(qualifier, /system-info/);
  assert.match(qualifier, /system-stats/);
  assert.match(qualifier, /tokens_per_second/);
  assert.equal(qualifier.includes('child_process'), false);
});

test('qualifier preserves evidence while redacting local paths and defers production selection', () => {
  assert.match(qualifier, /redacted-local-path/);
  assert.match(qualifier, /evidence-manifest\.json/);
  assert.match(qualifier, /production_model_selected: false/);
  assert.match(qualifier, /LOCAL_LLM_SENTINEL_MISSING/);
});

test('caller routes exact subject through canonical main A-01 control plane instead of direct self-hosted execution', () => {
  assert.match(workflow, /uses: BFochtman746\/system-master\/\.github\/workflows\/a01-control-plane-gateway\.yml@main/);
  assert.match(workflow, /qualification_id: A01-LOCAL-INFERENCE-BASELINE-001/);
  assert.match(workflow, /subject_sha: \$\{\{ github\.sha \}\}/);
  assert.equal(workflow.includes('uses: ./.github/workflows/a01-control-plane-gateway.yml'), false);
  assert.equal(workflow.includes('runs-on: [self-hosted, Windows, X64]'), false);
});
