import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
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

// The registered consolidated A-01 qualifier already runs the Control Gateway Node
// suite. This bridge gives P15 exact-subject A-01 coverage without changing the shared
// qualifier or qualification registry blobs used by prior Foundation receipts.
test('P15 morning receipt is read-only, fail-closed, and one-scroll observable', () => {
  const result = runPython([path.join('tests', 'test_a01_morning_receipt.py')]);
  assert.equal(result.status, 0, `P15 Python morning receipt suite failed with exit ${result.status}`);
  assert.match(result.stderr, /Ran 16 tests/);
  assert.match(result.stderr, /OK/);
});

test('P15 missing supervisor database never reports a clean morning', () => {
  const missing = path.join(process.env.RUNNER_TEMP || process.env.TEMP || ROOT, `p15-missing-${process.pid}.db`);
  const result = runPython(['-m', 'a01_morning_receipt', '--db', missing, '--json']);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /DATABASE_UNREADABLE/);
});

test('P15 operational delivery uses local Windows Task Scheduler, not an independent GitHub A-01 schedule', () => {
  const runner = fs.readFileSync(path.join(ROOT, 'control-gateway', 'windows', 'run-a01-morning-receipt.ps1'), 'utf8');
  const installer = fs.readFileSync(path.join(ROOT, 'control-gateway', 'windows', 'install-a01-morning-receipt-task.ps1'), 'utf8');
  assert.match(runner, /python -m a01_morning_receipt/);
  assert.match(runner, /--out \$receiptPath/);
  assert.match(runner, /exit \$receiptExit/);
  assert.match(installer, /LocalTime = '07:15'/);
  assert.match(installer, /New-ScheduledTaskTrigger -Daily/);
  assert.match(installer, /-UserId 'SYSTEM'/);
  assert.match(installer, /Register-ScheduledTask/);
  assert.equal(fs.existsSync(path.join(ROOT, '.github', 'workflows', 'p15-a01-morning-receipt.yml')), false);
});
