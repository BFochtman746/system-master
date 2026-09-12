import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ControllerError } from '../src/errors.js';
import { ControllerProcessOwnership, ControllerRuntime, readControllerRuntimeStatus, resolveControllerRuntimePaths } from '../src/lifecycle.js';

function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'controller-v2-lifecycle-'));
  return { dir, db: join(dir, 'controller.sqlite'), cleanup: () => { if (process.platform !== 'win32') rmSync(dir, { recursive: true, force: true }); } };
}

function expectCode(fn, code) {
  assert.throws(fn, error => error instanceof ControllerError && error.code === code);
}

async function waitForOwned(child) {
  await new Promise((resolve, reject) => {
    let text = '';
    const timer = setTimeout(() => reject(new Error('child ownership timeout')), 10_000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.stdout.on('data', chunk => {
      text += chunk.toString();
      if (text.includes('OWNED\n')) { clearTimeout(timer); resolve(); }
    });
    child.once('exit', code => { if (!text.includes('OWNED\n')) { clearTimeout(timer); reject(new Error(`child exited before ownership: ${code}`)); } });
  });
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once('exit', resolve);
    child.once('error', reject);
  });
}

test('LC-T001 first owner acquires one resolved database identity', () => {
  const w = workspace();
  try {
    const owner = new ControllerProcessOwnership(w.db);
    const identity = owner.acquire();
    assert.equal(owner.owned, true);
    assert.equal(identity.database_path, resolveControllerRuntimePaths(w.db).database_path);
    owner.release();
  } finally { w.cleanup(); }
});

test('LC-T002 second owner fails immediately with CONTROLLER_ALREADY_RUNNING', () => {
  const w = workspace();
  try {
    const a = new ControllerProcessOwnership(w.db); a.acquire();
    const b = new ControllerProcessOwnership(w.db);
    expectCode(() => b.acquire(), 'CONTROLLER_ALREADY_RUNNING');
    a.release();
  } finally { w.cleanup(); }
});

test('LC-T003 different database paths may be owned independently', () => {
  const w = workspace();
  try {
    const a = new ControllerProcessOwnership(w.db);
    const b = new ControllerProcessOwnership(join(w.dir, 'other.sqlite'));
    a.acquire(); b.acquire();
    assert.equal(a.owned, true); assert.equal(b.owned, true);
    b.release(); a.release();
  } finally { w.cleanup(); }
});

test('LC-T004 stale owner/status files without an OS lock do not deny ownership', () => {
  const w = workspace();
  try {
    const paths = resolveControllerRuntimePaths(w.db);
    writeFileSync(paths.status_path, '{"state":"READY","pid":1}\n');
    const first = new ControllerProcessOwnership(w.db); first.acquire(); first.release();
    const second = new ControllerProcessOwnership(w.db); second.acquire();
    assert.equal(second.owned, true);
    second.release();
  } finally { w.cleanup(); }
});

test('LC-T005 release permits a successor owner', () => {
  const w = workspace();
  try {
    const first = new ControllerProcessOwnership(w.db); first.acquire(); first.release();
    const successor = new ControllerProcessOwnership(w.db); successor.acquire();
    assert.equal(successor.owned, true);
    successor.release();
  } finally { w.cleanup(); }
});

test('LC-T006 abnormal child-process termination releases ownership', async () => {
  const w = workspace();
  const fixture = fileURLToPath(new URL('./fixtures/lifecycle-owner-child.js', import.meta.url));
  let child;
  try {
    child = spawn(process.execPath, [fixture, w.db], { stdio: ['ignore', 'pipe', 'inherit'] });
    await waitForOwned(child);
    const contender = new ControllerProcessOwnership(w.db);
    expectCode(() => contender.acquire(), 'CONTROLLER_ALREADY_RUNNING');
    child.kill();
    await waitForExit(child);
    const successor = new ControllerProcessOwnership(w.db); successor.acquire();
    assert.equal(successor.owned, true);
    successor.release();
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) { child.kill(); await waitForExit(child).catch(() => {}); }
    w.cleanup();
  }
});

test('LC-T007 READY diagnostics are v1 JSON bound to exact instance and database identity', () => {
  const w = workspace();
  try {
    const runtime = new ControllerRuntime(w.db); runtime.start();
    const status = readControllerRuntimeStatus(runtime.paths.status_path);
    assert.equal(status.schema, 'controller.runtime-status.v1');
    assert.equal(status.instance_id, runtime.instance_id);
    assert.equal(status.database_path, runtime.paths.database_path);
    assert.equal(status.state, 'READY');
    assert.equal(runtime.ready, true);
    runtime.stop();
  } finally { w.cleanup(); }
});

test('LC-T008 stale diagnostics never grant ownership', () => {
  const w = workspace();
  try {
    const owner = new ControllerProcessOwnership(w.db); owner.acquire();
    const paths = resolveControllerRuntimePaths(w.db);
    writeFileSync(paths.status_path, JSON.stringify({ schema:'controller.runtime-status.v1', state:'STOPPED' }));
    const contender = new ControllerProcessOwnership(w.db);
    expectCode(() => contender.acquire(), 'CONTROLLER_ALREADY_RUNNING');
    owner.release();
  } finally { w.cleanup(); }
});

test('LC-T009 semantic kernel migration/open occurs only after ownership acquisition', () => {
  const w = workspace();
  try {
    let sawOwnership = false;
    let runtime;
    runtime = new ControllerRuntime(w.db, {
      kernelFactory: () => {
        sawOwnership = runtime.ownership.owned;
        return { close() {} };
      },
      reconcile: () => ({})
    });
    runtime.start();
    assert.equal(sawOwnership, true);
    runtime.stop();
  } finally { w.cleanup(); }
});

test('LC-T010 reconcile runs after real kernel migration and before READY', () => {
  const w = workspace();
  try {
    let migrated = false;
    const runtime = new ControllerRuntime(w.db, {
      reconcile: kernel => {
        migrated = Number(kernel.db.prepare('SELECT MAX(version) v FROM schema_migrations').get().v) === 4;
        assert.equal(runtime.state, 'RECOVERING');
        return { reconciled: true };
      }
    });
    runtime.start();
    assert.equal(migrated, true);
    assert.equal(runtime.state, 'READY');
    runtime.stop();
  } finally { w.cleanup(); }
});

test('LC-T011 reconciliation failure yields FAILED diagnostics and releases ownership', () => {
  const w = workspace();
  try {
    const runtime = new ControllerRuntime(w.db, { reconcile: () => { throw new ControllerError('TEST_RECONCILE_FAILURE', 'boom'); } });
    expectCode(() => runtime.start(), 'TEST_RECONCILE_FAILURE');
    assert.equal(runtime.ready, false);
    const status = readControllerRuntimeStatus(runtime.paths.status_path);
    assert.equal(status.state, 'FAILED');
    assert.equal(status.error_code, 'TEST_RECONCILE_FAILURE');
    const successor = new ControllerProcessOwnership(w.db); successor.acquire(); successor.release();
  } finally { w.cleanup(); }
});

test('LC-T012 kernel-open failure yields FAILED diagnostics and releases ownership', () => {
  const w = workspace();
  try {
    const runtime = new ControllerRuntime(w.db, { kernelFactory: () => { throw new ControllerError('TEST_KERNEL_FAILURE', 'boom'); } });
    expectCode(() => runtime.start(), 'TEST_KERNEL_FAILURE');
    assert.equal(readControllerRuntimeStatus(runtime.paths.status_path).state, 'FAILED');
    const successor = new ControllerProcessOwnership(w.db); successor.acquire(); successor.release();
  } finally { w.cleanup(); }
});

test('LC-T013 STARTING diagnostic failure prevents semantic kernel creation and releases ownership', () => {
  const w = workspace();
  try {
    let kernelCreated = false;
    const runtime = new ControllerRuntime(w.db, {
      statusWriter: () => { throw new ControllerError('TEST_STATUS_FAILURE', 'boom'); },
      kernelFactory: () => { kernelCreated = true; return { close() {} }; }
    });
    expectCode(() => runtime.start(), 'TEST_STATUS_FAILURE');
    assert.equal(kernelCreated, false);
    const successor = new ControllerProcessOwnership(w.db); successor.acquire(); successor.release();
  } finally { w.cleanup(); }
});

test('LC-T014 graceful stop publishes STOPPED before release and permits successor', () => {
  const w = workspace();
  try {
    const runtime = new ControllerRuntime(w.db); runtime.start(); runtime.stop();
    const status = readControllerRuntimeStatus(runtime.paths.status_path);
    assert.equal(status.state, 'STOPPED');
    assert.equal(runtime.ready, false);
    const successor = new ControllerProcessOwnership(w.db); successor.acquire(); successor.release();
  } finally { w.cleanup(); }
});

test('LC-T015 ready requires both READY state and live ownership', () => {
  const w = workspace();
  try {
    const runtime = new ControllerRuntime(w.db); runtime.start();
    assert.equal(runtime.ready, true);
    runtime.ownership.release();
    assert.equal(runtime.ready, false);
    runtime.kernel.close(); runtime.kernel = null;
  } finally { w.cleanup(); }
});

test('LC-T016 contender cannot overwrite the current owner status file', () => {
  const w = workspace();
  try {
    const owner = new ControllerRuntime(w.db); owner.start();
    const before = readFileSync(owner.paths.status_path, 'utf8');
    const contender = new ControllerRuntime(w.db);
    expectCode(() => contender.start(), 'CONTROLLER_ALREADY_RUNNING');
    const after = readFileSync(owner.paths.status_path, 'utf8');
    assert.equal(after, before);
    owner.stop();
  } finally { w.cleanup(); }
});

test('LC-T017 lifecycle source contains no provider transport or scheduler/worker implementation', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/lifecycle.js', import.meta.url)), 'utf8');
  assert.equal(/github-|fetch\(|https?:\/\//i.test(source), false);
  assert.equal(/scheduler|second.?shift|worker.?dispatch/i.test(source), false);
});

test('LC-T018 ownership uses no retry loop, PID probing or stale-time lease heuristic', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/lifecycle.js', import.meta.url)), 'utf8');
  assert.equal(/setTimeout|setInterval|process\.kill|kill\(|mtime|heartbeat/i.test(source), false);
});

test('lifecycle rejects process ownership for :memory: stores', () => {
  expectCode(() => new ControllerProcessOwnership(':memory:'), 'LIFECYCLE_MEMORY_DB_UNSUPPORTED');
});
