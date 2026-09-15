import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const PYTHON_DIR = path.join(ROOT, 'control-gateway', 'python');
const PYTHONPATH = [PYTHON_DIR, ROOT, process.env.PYTHONPATH || ''].filter(Boolean).join(path.delimiter);

function runPython(args) {
  const result = spawnSync('python', args, {
    cwd: ROOT,
    env: { ...process.env, PYTHONPATH },
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  return result;
}

// This bridge intentionally uses the pre-existing Control Gateway Node suite. The
// registered cumulative A-01 qualifier already executes `node --test` here, so P12
// gains exact-subject A-01 coverage without modifying predecessor qualifier/registry
// blobs whose prior Foundation receipts are content-addressed.
test('P12 GitHub ingress accepts only already-admitted A-01 execution authority', () => {
  const result = runPython([path.join('tests', 'test_a01_github_ingress.py')]);
  assert.equal(result.status, 0, `P12 Python ingress suite failed with exit ${result.status}`);
});

test('P12 production service binds the real A01NightScheduler without GitHub write authority', () => {
  const db = path.join(process.env.RUNNER_TEMP || process.env.TEMP || ROOT, `p12-ingress-${process.pid}.db`);
  const state = path.join(process.env.RUNNER_TEMP || process.env.TEMP || ROOT, `p12-ingress-state-${process.pid}`);
  const result = runPython([
    '-m', 'a01_ingress_service',
    '--check',
    '--db', db,
    '--state-dir', state,
  ]);
  assert.equal(result.status, 0, `P12 service wiring check failed with exit ${result.status}`);
  assert.match(result.stdout, /"scheduler": "A01NightScheduler"/);
  assert.match(result.stdout, /"github_write_capable": false/);
});
