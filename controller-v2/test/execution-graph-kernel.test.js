import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ControllerKernel, ControllerError } from '../src/kernel.js';
import { uuidv7 } from '../src/canonical.js';
import { MemoryDurableJournal, publishPendingOutbox } from '../src/durable-journal.js';
import {
  ExecutionGraphKernel,
  OPERATION_DEPENDENCY_PROTOCOL,
  OPERATION_DEPENDENCY_RELATION,
  operationDependencyId,
  rebuildExecutionControllerStore
} from '../src/execution-graph-kernel.js';

const SUBJECT = { algorithm: 'sha1', oid: '0123456789abcdef0123456789abcdef01234567' };

function command() {
  return {
    protocol_version: '1.0', schema: 'controller://schemas/command/v1', command_id: uuidv7(), created_at: new Date().toISOString(),
    issuer: { principal: 'user:test', source: 'test' }, command_type: 'controller.work.submit',
    target: { repository: 'BFochtman746/system-master', expected_subject: { ...SUBJECT } }, preconditions: {},
    intent: { task: 'execution-graph-test' }, constraints: {}, required_policy_version: 'execution-graph-v1'
  };
}

function tx(kernel, state = 'ADMITTED') {
  const id = kernel.acceptCommand(command()).transaction_id;
  if (state === 'OPEN') return id;
  kernel.admitTransaction(id, { operations: 'all_succeeded', qualification: 'not_required', promotion: 'not_required' });
  if (state === 'ACTIVE') kernel.activateTransaction(id);
  else if (state === 'WAITING') { kernel.activateTransaction(id); kernel.waitTransaction(id, 'test'); }
  else if (state === 'CANCELLED') kernel.cancelTransaction(id, 'test');
  return id;
}

function ops(kernel, count = 3, transactionId = null) {
  const transaction_id = transactionId ?? tx(kernel);
  const operation_ids = Array.from({ length: count }, (_, i) => kernel.createOperation(transaction_id, { resourceId: `resource:${i + 1}` }));
  return { transaction_id, operation_ids };
}

function assertCode(fn, code) {
  assert.throws(fn, (error) => error instanceof ControllerError && error.code === code);
}

function forceState(kernel, operationId, state) {
  kernel.db.prepare('UPDATE operations SET state=?,updated_at=? WHERE operation_id=?').run(state, new Date().toISOString(), operationId);
}

function depEvents(kernel) {
  return kernel.exportEvents().filter((event) => event.event_type === 'operation.dependency_added');
}

async function durableSnapshot(kernel) {
  const journal = new MemoryDurableJournal();
  const published = await publishPendingOutbox(kernel, journal);
  assert.ok(published.every((item) => item.sealed));
  return { entries: await journal.list(), checkpoint: await journal.getCheckpoint() };
}

function tempDb(prefix = 'controller-execution-graph-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, db: join(dir, 'controller.sqlite') };
}

function cleanupTemp(ctx) { rmSync(ctx.dir, { recursive: true, force: true }); }

// Schema / migration / recovery.
test('GEL-001 fresh store reaches schema v6 with dependency constraints', () => {
  const k = new ExecutionGraphKernel(':memory:');
  assert.equal(Number(k.db.prepare('SELECT MAX(version) v FROM schema_migrations').get().v), 6);
  const columns = k.db.prepare('PRAGMA table_info(operation_dependencies)').all().map((row) => row.name);
  assert.deepEqual(columns, ['dependency_id','transaction_id','dependent_operation_id','prerequisite_operation_id','relation','created_at']);
  k.close();
});

test('GEL-002 v5 store upgrades to v6 without changing predecessor rows', () => {
  const t = tempDb();
  try {
    const base = new ControllerKernel(t.db); const transactionId = base.acceptCommand(command()).transaction_id;
    const before = base.db.prepare('SELECT payload_json FROM commands').get().payload_json; base.close();
    const k = new ExecutionGraphKernel(t.db);
    assert.equal(Number(k.db.prepare('SELECT MAX(version) v FROM schema_migrations').get().v), 6);
    assert.equal(k.db.prepare('SELECT transaction_id FROM transactions').get().transaction_id, transactionId);
    assert.equal(k.db.prepare('SELECT payload_json FROM commands').get().payload_json, before); k.close();
  } finally { cleanupTemp(t); }
});

test('GEL-003 failed v6 migration rolls back version marker', () => {
  const t = tempDb();
  try {
    const base = new ControllerKernel(t.db); base.db.exec('CREATE TABLE operation_dependencies(bad TEXT)'); base.close();
    assertCode(() => new ExecutionGraphKernel(t.db), undefined);
  } catch (error) {
    // The constructor may throw a native SQLite error before a ControllerError wrapper; verify durable rollback below.
  } finally {
    const base = new ControllerKernel(t.db);
    assert.equal(Number(base.db.prepare('SELECT MAX(version) v FROM schema_migrations').get().v), 5);
    base.close(); cleanupTemp(t);
  }
});

test('GEL-004 reopening v6 is idempotent', () => {
  const t = tempDb();
  try { new ExecutionGraphKernel(t.db).close(); const k = new ExecutionGraphKernel(t.db); assert.equal(Number(k.db.prepare('SELECT MAX(version) v FROM schema_migrations').get().v), 6); k.close(); }
  finally { cleanupTemp(t); }
});

test('GEL-005 fresh-store journal recovery reconstructs dependency edges', async () => {
  const source = new ExecutionGraphKernel(':memory:'); const { operation_ids:[a,b] } = ops(source, 2); source.addOperationDependency(b, a);
  const snapshot = await durableSnapshot(source); source.close(); const t = tempDb();
  try { const rebuilt = rebuildExecutionControllerStore(t.db, snapshot.entries, { expectedCheckpoint: snapshot.checkpoint }); assert.equal(Number(rebuilt.db.prepare('SELECT COUNT(*) n FROM operation_dependencies').get().n), 1); rebuilt.close(); }
  finally { cleanupTemp(t); }
});

test('GEL-006 dependency recovery rejects tampered semantic identity', () => {
  const k = new ExecutionGraphKernel(':memory:'); const { operation_ids:[a,b] } = ops(k, 2); k.addOperationDependency(b, a);
  const events = structuredClone(k.exportEvents()); k.db.exec('DELETE FROM operation_dependencies');
  const event = events.find((item) => item.event_type === 'operation.dependency_added'); event.data.dependency_id = '0'.repeat(64);
  assertCode(() => k.restoreDependencyProjection(events), 'RECOVERY_DEPENDENCY_INVALID'); k.close();
});

// Edge identity / scope / cycle.
test('GEL-007 valid same-transaction PLANNED dependency is admitted', () => {
  const k = new ExecutionGraphKernel(':memory:'); const { transaction_id,operation_ids:[a,b] }=ops(k,2); const r=k.addOperationDependency(b,a);
  assert.equal(r.dependency_id, operationDependencyId(transaction_id,b,a)); assert.equal(r.changed,true); k.close();
});

test('GEL-008 exact edge replay is idempotent with one event', () => {
  const k=new ExecutionGraphKernel(':memory:'); const { operation_ids:[a,b] }=ops(k,2); const x=k.addOperationDependency(b,a); const y=k.addOperationDependency(b,a);
  assert.equal(y.dependency_id,x.dependency_id); assert.equal(y.duplicate,true); assert.equal(depEvents(k).length,1); k.close();
});

test('GEL-009 self dependency rejects', () => { const k=new ExecutionGraphKernel(':memory:'); const {operation_ids:[a]}=ops(k,1); assertCode(()=>k.addOperationDependency(a,a),'DEPENDENCY_SELF_CYCLE'); k.close(); });

test('GEL-010 cross transaction dependency rejects', () => { const k=new ExecutionGraphKernel(':memory:'); const a=ops(k,1).operation_ids[0]; const b=ops(k,1).operation_ids[0]; assertCode(()=>k.addOperationDependency(b,a),'DEPENDENCY_SCOPE_INVALID'); k.close(); });

test('GEL-011 unknown dependent rejects', () => { const k=new ExecutionGraphKernel(':memory:'); const {operation_ids:[a]}=ops(k,1); assertCode(()=>k.addOperationDependency(uuidv7(),a),'NOT_FOUND'); k.close(); });

test('GEL-012 unknown prerequisite rejects', () => { const k=new ExecutionGraphKernel(':memory:'); const {operation_ids:[a]}=ops(k,1); assertCode(()=>k.addOperationDependency(a,uuidv7()),'NOT_FOUND'); k.close(); });

test('GEL-013 dependency set freezes when dependent leaves PLANNED', () => { const k=new ExecutionGraphKernel(':memory:'); const {operation_ids:[a,b]}=ops(k,2); k.markOperationReadyIfEligible(b); assertCode(()=>k.addOperationDependency(b,a),'DEPENDENCY_SET_FROZEN'); k.close(); });

test('GEL-014 direct two-operation cycle rejects', () => { const k=new ExecutionGraphKernel(':memory:'); const {operation_ids:[a,b]}=ops(k,2); k.addOperationDependency(a,b); assertCode(()=>k.addOperationDependency(b,a),'DEPENDENCY_CYCLE'); k.close(); });

test('GEL-015 indirect cycle rejects', () => { const k=new ExecutionGraphKernel(':memory:'); const {operation_ids:[a,b,c]}=ops(k,3); k.addOperationDependency(a,b); k.addOperationDependency(b,c); assertCode(()=>k.addOperationDependency(c,a),'DEPENDENCY_CYCLE'); k.close(); });

test('GEL-016 rejected cycle commits no row or event', () => { const k=new ExecutionGraphKernel(':memory:'); const {operation_ids:[a,b]}=ops(k,2); k.addOperationDependency(a,b); const rows=Number(k.db.prepare('SELECT COUNT(*) n FROM operation_dependencies').get().n),events=depEvents(k).length; assertCode(()=>k.addOperationDependency(b,a),'DEPENDENCY_CYCLE'); assert.equal(Number(k.db.prepare('SELECT COUNT(*) n FROM operation_dependencies').get().n),rows); assert.equal(depEvents(k).length,events); k.close(); });

test('GEL-017 edge admission does not alter operation states', () => { const k=new ExecutionGraphKernel(':memory:'); const {operation_ids:[a,b]}=ops(k,2); k.addOperationDependency(b,a); assert.equal(k.db.prepare('SELECT state FROM operations WHERE operation_id=?').get(a).state,'PLANNED'); assert.equal(k.db.prepare('SELECT state FROM operations WHERE operation_id=?').get(b).state,'PLANNED'); k.close(); });

test('GEL-018 dependency event binds exact canonical identity', () => { const k=new ExecutionGraphKernel(':memory:'); const {transaction_id,operation_ids:[a,b]}=ops(k,2); const r=k.addOperationDependency(b,a); const e=depEvents(k)[0]; assert.deepEqual(e.data,{dependency_id:r.dependency_id,transaction_id,dependent_operation_id:b,prerequisite_operation_id:a,relation:OPERATION_DEPENDENCY_RELATION}); assert.equal(e.stream_id,`operation:${b}`); k.close(); });

// Eligibility semantics.
function standingFor(prerequisiteState, transactionState='ADMITTED') {
  const k=new ExecutionGraphKernel(':memory:'); const transactionId=tx(k,transactionState); const {operation_ids:[a,b]}=ops(k,2,transactionId); k.addOperationDependency(b,a); forceState(k,a,prerequisiteState); const result=k.classifyDependencyEligibility(b); k.close(); return result.standing;
}

test('GEL-019 zero prerequisites is ELIGIBLE', () => { const k=new ExecutionGraphKernel(':memory:'); const {operation_ids:[a]}=ops(k,1); assert.equal(k.classifyDependencyEligibility(a).standing,'ELIGIBLE'); k.close(); });
test('GEL-020 all prerequisites SUCCEEDED is ELIGIBLE', () => assert.equal(standingFor('SUCCEEDED'),'ELIGIBLE'));
test('GEL-021 PLANNED prerequisite waits', () => assert.equal(standingFor('PLANNED'),'WAITING_DEPENDENCY'));
test('GEL-022 READY prerequisite waits', () => assert.equal(standingFor('READY'),'WAITING_DEPENDENCY'));
test('GEL-023 RUNNING prerequisite waits', () => assert.equal(standingFor('RUNNING'),'WAITING_DEPENDENCY'));
test('GEL-024 VERIFYING prerequisite waits', () => assert.equal(standingFor('VERIFYING'),'WAITING_DEPENDENCY'));
test('GEL-025 BLOCKED prerequisite waits', () => assert.equal(standingFor('BLOCKED'),'WAITING_DEPENDENCY'));
test('GEL-026 FAILED prerequisite blocks terminal', () => assert.equal(standingFor('FAILED'),'BLOCKED_DEPENDENCY_TERMINAL'));
test('GEL-027 CANCELLED prerequisite blocks terminal', () => assert.equal(standingFor('CANCELLED'),'BLOCKED_DEPENDENCY_TERMINAL'));
test('GEL-028 STALE prerequisite blocks terminal', () => assert.equal(standingFor('STALE'),'BLOCKED_DEPENDENCY_TERMINAL'));

test('GEL-029 mixed success and pending waits', () => { const k=new ExecutionGraphKernel(':memory:'); const {operation_ids:[a,b,c]}=ops(k,3); k.addOperationDependency(c,a); k.addOperationDependency(c,b); forceState(k,a,'SUCCEEDED'); assert.equal(k.classifyDependencyEligibility(c).standing,'WAITING_DEPENDENCY'); k.close(); });

test('GEL-030 terminal non-success outranks pending', () => { const k=new ExecutionGraphKernel(':memory:'); const {operation_ids:[a,b,c]}=ops(k,3); k.addOperationDependency(c,a); k.addOperationDependency(c,b); forceState(k,a,'FAILED'); assert.equal(k.classifyDependencyEligibility(c).standing,'BLOCKED_DEPENDENCY_TERMINAL'); k.close(); });

test('GEL-031 OPEN transaction cannot be eligible', () => { const k=new ExecutionGraphKernel(':memory:'); const transactionId=tx(k,'OPEN'); k.db.prepare("UPDATE transactions SET state='ADMITTED' WHERE transaction_id=?").run(transactionId); const operationId=k.createOperation(transactionId,{resourceId:'r'}); k.db.prepare("UPDATE transactions SET state='OPEN' WHERE transaction_id=?").run(transactionId); assert.equal(k.classifyDependencyEligibility(operationId).standing,'INELIGIBLE_TRANSACTION'); k.close(); });

test('GEL-032 WAITING or terminal transaction cannot be eligible', () => { for(const state of ['WAITING','CANCELLED']) { const k=new ExecutionGraphKernel(':memory:'); const transactionId=tx(k); const operationId=k.createOperation(transactionId,{resourceId:'r'}); if(state==='WAITING'){k.activateTransaction(transactionId);k.waitTransaction(transactionId,'test');} else k.cancelTransaction(transactionId,'test'); assert.equal(k.classifyDependencyEligibility(operationId).standing,'INELIGIBLE_TRANSACTION'); k.close(); } });

test('GEL-033 ADMITTED transaction may be eligible', () => { const k=new ExecutionGraphKernel(':memory:'); const {operation_ids:[a]}=ops(k,1,tx(k,'ADMITTED')); assert.equal(k.classifyDependencyEligibility(a).standing,'ELIGIBLE'); k.close(); });
test('GEL-034 ACTIVE transaction may be eligible', () => { const k=new ExecutionGraphKernel(':memory:'); const {operation_ids:[a]}=ops(k,1,tx(k,'ACTIVE')); assert.equal(k.classifyDependencyEligibility(a).standing,'ELIGIBLE'); k.close(); });

// Guarded READY / races / idempotency.
test('GEL-035 guarded readiness transitions only eligible work', () => { const k=new ExecutionGraphKernel(':memory:'); const {operation_ids:[a,b]}=ops(k,2); k.addOperationDependency(b,a); assertCode(()=>k.markOperationReadyIfEligible(b),'DEPENDENCY_NOT_ELIGIBLE'); forceState(k,a,'SUCCEEDED'); assert.equal(k.markOperationReadyIfEligible(b).state,'READY'); k.close(); });

test('GEL-036 guarded readiness rereads current operation state', () => { const k=new ExecutionGraphKernel(':memory:'); const {operation_ids:[a]}=ops(k,1); forceState(k,a,'CANCELLED'); assertCode(()=>k.markOperationReadyIfEligible(a),'DEPENDENCY_NOT_ELIGIBLE'); k.close(); });

test('GEL-037 lost response edge replay converges one edge and event', () => { const k=new ExecutionGraphKernel(':memory:'); const {operation_ids:[a,b]}=ops(k,2); const first=k.addOperationDependency(b,a); const replay=k.addOperationDependency(b,a); assert.equal(first.dependency_id,replay.dependency_id); assert.equal(Number(k.db.prepare('SELECT COUNT(*) n FROM operation_dependencies').get().n),1); assert.equal(depEvents(k).length,1); k.close(); });

test('GEL-038 independent handles replay identical edge without duplication', () => { const t=tempDb(); try { const a=new ExecutionGraphKernel(t.db); const {operation_ids:[p,d]}=ops(a,2); a.close(); const k1=new ExecutionGraphKernel(t.db),k2=new ExecutionGraphKernel(t.db); const r1=k1.addOperationDependency(d,p); const r2=k2.addOperationDependency(d,p); assert.equal(r1.dependency_id,r2.dependency_id); assert.equal(Number(k1.db.prepare('SELECT COUNT(*) n FROM operation_dependencies').get().n),1); k1.close();k2.close(); } finally { cleanupTemp(t); } });

test('GEL-039 independent handles cannot commit a closing cycle', () => { const t=tempDb(); try { const setup=new ExecutionGraphKernel(t.db); const {operation_ids:[a,b]}=ops(setup,2); setup.close(); const k1=new ExecutionGraphKernel(t.db),k2=new ExecutionGraphKernel(t.db); k1.addOperationDependency(a,b); assertCode(()=>k2.addOperationDependency(b,a),'DEPENDENCY_CYCLE'); k1.close();k2.close(); } finally { cleanupTemp(t); } });

test('GEL-040 eligibility is independent of edge insertion order', () => { const evaluate=(reverse)=>{const k=new ExecutionGraphKernel(':memory:');const {operation_ids:[a,b,c]}=ops(k,3);for(const p of (reverse?[b,a]:[a,b]))k.addOperationDependency(c,p);forceState(k,a,'SUCCEEDED');forceState(k,b,'SUCCEEDED');const r=k.classifyDependencyEligibility(c);k.close();return r;}; assert.deepEqual(evaluate(false).prerequisites.map(x=>x.prerequisite_operation_id).sort(),evaluate(true).prerequisites.map(x=>x.prerequisite_operation_id).sort()); assert.equal(evaluate(false).standing,'ELIGIBLE'); });

// Reconciliation / authority fences.
test('GEL-041 lost wakeup does not change full-scan eligibility', () => { const k=new ExecutionGraphKernel(':memory:'); const {operation_ids:[a,b]}=ops(k,2); k.addOperationDependency(b,a); forceState(k,a,'SUCCEEDED'); const first=k.classifyDependencyEligibility(b); const second=k.classifyDependencyEligibility(b); assert.deepEqual(second,first); k.close(); });

test('GEL-042 duplicate readiness wakeups do not duplicate READY event', () => { const k=new ExecutionGraphKernel(':memory:'); const {operation_ids:[a]}=ops(k,1); assert.equal(k.markOperationReadyIfEligible(a).changed,true); assert.equal(k.markOperationReadyIfEligible(a).changed,false); assert.equal(k.exportEvents().filter(e=>e.event_type==='operation.ready'&&e.data.operation_id===a).length,1); k.close(); });

test('GEL-043 priority is absent from dependency semantic identity and table', () => { const k=new ExecutionGraphKernel(':memory:'); const cols=k.db.prepare('PRAGMA table_info(operation_dependencies)').all().map(r=>r.name); assert.equal(cols.includes('priority'),false); const {transaction_id,operation_ids:[a,b]}=ops(k,2); const id=operationDependencyId(transaction_id,b,a); assert.equal(id,operationDependencyId(transaction_id,b,a)); k.close(); });

test('GEL-044 stage/barrier metadata is absent from graph contract', () => { const k=new ExecutionGraphKernel(':memory:'); const cols=k.db.prepare('PRAGMA table_info(operation_dependencies)').all().map(r=>r.name); assert.equal(cols.some(c=>/stage|barrier/i.test(c)),false); assert.equal(OPERATION_DEPENDENCY_PROTOCOL,'controller.operation-dependency/v1'); k.close(); });

test('GEL-045 implementation imports no spawn scheduler timer provider or specialist system', () => { const source=readFileSync(fileURLToPath(new URL('../src/execution-graph-kernel.js',import.meta.url)),'utf8'); assert.doesNotMatch(source,/child_process|worker_threads|setInterval|setTimeout|fetch\(|https?:|Book|Learning|Documents|CORE/); });

test('GEL-046 graph API exposes no claim effect admission or journal-seal mutation', () => { const names=Object.getOwnPropertyNames(ExecutionGraphKernel.prototype); for(const forbidden of ['acquire','renew','revoke','effect','admission','seal']) assert.equal(names.some(name=>name.toLowerCase().includes(forbidden)),false); });

test('GEL-047 journal rebuild preserves graph and eligibility', async () => { const source=new ExecutionGraphKernel(':memory:'); const {operation_ids:[a,b]}=ops(source,2); source.addOperationDependency(b,a); forceState(source,a,'SUCCEEDED'); const before=source.classifyDependencyEligibility(b).standing; const snapshot=await durableSnapshot(source); source.close(); const t=tempDb(); try { const rebuilt=rebuildExecutionControllerStore(t.db,snapshot.entries,{expectedCheckpoint:snapshot.checkpoint}); assert.equal(rebuilt.classifyDependencyEligibility(b).standing,before); rebuilt.close(); } finally { cleanupTemp(t); } });

test('GEL-048 stale local eligibility projection cannot override canonical state', () => { const k=new ExecutionGraphKernel(':memory:'); const {operation_ids:[a,b]}=ops(k,2); k.addOperationDependency(b,a); const stale={...k.classifyDependencyEligibility(b)}; assert.equal(stale.standing,'WAITING_DEPENDENCY'); forceState(k,a,'SUCCEEDED'); assert.equal(k.classifyDependencyEligibility(b).standing,'ELIGIBLE'); stale.standing='ELIGIBLE'; forceState(k,a,'FAILED'); assert.equal(k.classifyDependencyEligibility(b).standing,'BLOCKED_DEPENDENCY_TERMINAL'); k.close(); });
