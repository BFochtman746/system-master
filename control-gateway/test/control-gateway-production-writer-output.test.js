import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const script = fs.readFileSync(path.join(root, '.github/scripts/control-gateway-production-writer.js'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/control-gateway-production-writer.yml'), 'utf8');

test('production writer emits exact result identity only after successful receipt-consuming CAS execution', () => {
  const executeIndex = script.indexOf('const executionReceipt = await writer.execute');
  const outputIndex = script.indexOf('result_commit_sha=${executionReceipt.result_commit_sha}');
  assert.ok(executeIndex >= 0, 'receipt-consuming writer execution marker missing');
  assert.ok(outputIndex > executeIndex, 'result identity must be emitted only after writer execution succeeds');
  assert.match(script, /process\.env\.GITHUB_OUTPUT/);
  assert.match(script, /result_tree_sha=\$\{executionReceipt\.result_tree_sha\}/);
  assert.match(script, /execution_digest=\$\{executionReceipt\.execution_digest\}/);
  assert.match(script, /idempotent_replay=\$\{executionReceipt\.idempotent_replay\}/);
});

test('reusable production-writer workflow exposes exact result without widening repository permissions', () => {
  assert.match(workflow, /value: \$\{\{ jobs\.receipt-cas-write\.outputs\.result_commit_sha \}\}/);
  assert.match(workflow, /result_commit_sha: \$\{\{ steps\.mutation\.outputs\.result_commit_sha \}\}/);
  assert.match(workflow, /result_tree_sha: \$\{\{ steps\.mutation\.outputs\.result_tree_sha \}\}/);
  assert.match(workflow, /execution_digest: \$\{\{ steps\.mutation\.outputs\.execution_digest \}\}/);
  assert.match(workflow, /idempotent_replay: \$\{\{ steps\.mutation\.outputs\.idempotent_replay \}\}/);
  assert.match(workflow, /id: mutation/);
  assert.match(workflow, /permissions:\n  contents: read\n  actions: read/);
});
