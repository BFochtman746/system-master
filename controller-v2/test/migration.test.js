import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ControllerKernel } from '../src/kernel.js';

const OID='0123456789abcdef0123456789abcdef01234567';
function paths(){const dir=mkdtempSync(join(tmpdir(),'controller-v2-migrate-'));return {dir,db:join(dir,'legacy.sqlite')};}
function cleanup(dir){if(process.platform!=='win32')rmSync(dir,{recursive:true,force:true});}
function columns(db,table){return db.prepare(`PRAGMA table_info(${table})`).all().map(r=>r.name);}
function createLegacyCore(db,version=1,{includePromotions=true}={}){
  db.exec(`
    CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    INSERT INTO schema_migrations VALUES (${version},'2026-09-11T00:00:00.000Z');
    CREATE TABLE transactions(transaction_id TEXT PRIMARY KEY, command_id TEXT NOT NULL UNIQUE, state TEXT NOT NULL, controller_version TEXT NOT NULL, policy_version TEXT NOT NULL, subject_repo TEXT NOT NULL, subject_sha TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL${version>=2?', completion_contract_json TEXT':''});
    CREATE TABLE qualifications(qualification_id TEXT PRIMARY KEY, transaction_id TEXT NOT NULL, subject_sha TEXT NOT NULL, policy_version TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    ${includePromotions?`CREATE TABLE promotions(promotion_id TEXT PRIMARY KEY, transaction_id TEXT NOT NULL, subject_sha TEXT NOT NULL, qualification_id TEXT NOT NULL, state TEXT NOT NULL, authorization_event_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`:''}
  `);
}

test('MG-T001 real v1 rows migrate losslessly through v2, v3, v4 and v5 with implicit SHA-1 made explicit',()=>{
  const {dir,db}=paths();
  try{
    const legacy=new DatabaseSync(db);
    createLegacyCore(legacy,1);
    legacy.prepare('INSERT INTO transactions VALUES (?,?,?,?,?,?,?,?,?)').run('tx1','cmd1','OPEN','legacy','legacy','BFochtman746/system-master',OID,'2026-09-11T00:00:00.000Z','2026-09-11T00:00:00.000Z');
    legacy.prepare('INSERT INTO qualifications VALUES (?,?,?,?,?,?,?)').run('q1','tx1',OID,'p1','PASSED','2026-09-11T00:00:00.000Z','2026-09-11T00:00:00.000Z');
    legacy.prepare('INSERT INTO promotions VALUES (?,?,?,?,?,?,?,?)').run('p1','tx1',OID,'q1','SUCCEEDED',null,'2026-09-11T00:00:00.000Z','2026-09-11T00:00:00.000Z');
    legacy.close();
    const k=new ControllerKernel(db);
    assert.equal(k.db.prepare('SELECT MAX(version) version FROM schema_migrations').get().version,5);
    assert.equal(k.db.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n,5);
    for(const table of ['transactions','qualifications','promotions']){
      const row=k.db.prepare(`SELECT subject_algorithm,subject_oid FROM ${table}`).get();
      assert.equal(row.subject_algorithm,'sha1');
      assert.equal(row.subject_oid,OID);
      assert.equal(columns(k.db,table).includes('subject_sha'),false);
    }
    assert.equal(k.db.prepare('SELECT completion_contract_json FROM transactions').get().completion_contract_json,null);
    assert.ok(k.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='external_effects'").get());
    assert.ok(k.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='external_effect_attempts'").get());
    assert.ok(k.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admission_decisions'").get());
    assert.equal(k.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    k.close();
  }finally{cleanup(dir);}
});

test('MG-T002 failed v2 to v3 migration rolls back every ALTER and version write before v4/v5',()=>{
  const {dir,db}=paths();
  try{
    const legacy=new DatabaseSync(db);
    createLegacyCore(legacy,2,{includePromotions:false});
    legacy.close();
    assert.throws(()=>new ControllerKernel(db));
    const inspect=new DatabaseSync(db);
    assert.equal(inspect.prepare('SELECT MAX(version) version FROM schema_migrations').get().version,2);
    assert.equal(columns(inspect,'transactions').includes('subject_sha'),true);
    assert.equal(columns(inspect,'transactions').includes('subject_oid'),false);
    assert.equal(columns(inspect,'transactions').includes('subject_algorithm'),false);
    assert.equal(columns(inspect,'qualifications').includes('subject_sha'),true);
    assert.equal(columns(inspect,'qualifications').includes('subject_oid'),false);
    assert.equal(inspect.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='external_effects'").get().n,0);
    assert.equal(inspect.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='admission_decisions'").get().n,0);
    inspect.close();
  }finally{cleanup(dir);}
});

test('MG-T003 schema v4 store migrates once to v5, preserves rows and reopens at v5',()=>{
  const {dir,db}=paths();
  try{
    const legacy=new DatabaseSync(db);
    legacy.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT INTO schema_migrations VALUES (1,'2026-09-11T00:00:00.000Z'),(2,'2026-09-11T00:00:01.000Z'),(3,'2026-09-11T00:00:02.000Z'),(4,'2026-09-11T00:00:03.000Z');
      CREATE TABLE commands(command_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE transactions(transaction_id TEXT PRIMARY KEY, command_id TEXT NOT NULL UNIQUE REFERENCES commands(command_id), state TEXT NOT NULL, controller_version TEXT NOT NULL, policy_version TEXT NOT NULL, subject_repo TEXT NOT NULL, subject_oid TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completion_contract_json TEXT, subject_algorithm TEXT NOT NULL DEFAULT 'sha1');
      CREATE TABLE qualifications(qualification_id TEXT PRIMARY KEY, transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id), subject_oid TEXT NOT NULL, policy_version TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, subject_algorithm TEXT NOT NULL DEFAULT 'sha1');
      CREATE TABLE promotions(promotion_id TEXT PRIMARY KEY, transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id), subject_oid TEXT NOT NULL, qualification_id TEXT NOT NULL REFERENCES qualifications(qualification_id), state TEXT NOT NULL, authorization_event_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, subject_algorithm TEXT NOT NULL DEFAULT 'sha1');
      CREATE TABLE operations(operation_id TEXT PRIMARY KEY, transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id), state TEXT NOT NULL, resource_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE resource_generations(resource_id TEXT PRIMARY KEY, generation INTEGER NOT NULL);
      CREATE TABLE leases(lease_id TEXT PRIMARY KEY, operation_id TEXT NOT NULL REFERENCES operations(operation_id), resource_id TEXT NOT NULL, worker_id TEXT NOT NULL, generation INTEGER NOT NULL, status TEXT NOT NULL, issued_at TEXT NOT NULL, expires_at TEXT NOT NULL, last_heartbeat_at TEXT NOT NULL);
      CREATE TABLE events(event_id TEXT PRIMARY KEY, event_schema TEXT NOT NULL, stream_id TEXT NOT NULL, stream_version INTEGER NOT NULL, event_type TEXT NOT NULL, occurred_at TEXT NOT NULL, data_json TEXT NOT NULL, prev_event_digest TEXT, event_digest TEXT NOT NULL, UNIQUE(stream_id,stream_version));
      CREATE TABLE outbox(outbox_id TEXT PRIMARY KEY, event_id TEXT NOT NULL UNIQUE REFERENCES events(event_id), status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at TEXT NOT NULL, sealed_at TEXT);
      CREATE TABLE external_effects(effect_id TEXT PRIMARY KEY,transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id),operation_id TEXT NOT NULL REFERENCES operations(operation_id),provider TEXT NOT NULL,effect_type TEXT NOT NULL,target_key TEXT NOT NULL,idempotency_key TEXT NOT NULL,request_digest TEXT NOT NULL,expected_remote_version TEXT,state TEXT NOT NULL,terminal_evidence_json TEXT,last_error_code TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(provider,idempotency_key));
      CREATE TABLE external_effect_attempts(attempt_id TEXT PRIMARY KEY,effect_id TEXT NOT NULL REFERENCES external_effects(effect_id),attempt_number INTEGER NOT NULL,lease_id TEXT NOT NULL,resource_id TEXT NOT NULL,generation INTEGER NOT NULL,authorized_at TEXT NOT NULL,UNIQUE(effect_id,attempt_number));
    `);
    legacy.prepare('INSERT INTO commands VALUES (?,?,?,?)').run('cmd-v4','f'.repeat(64),'{}','2026-09-11T00:00:00.000Z');
    legacy.prepare('INSERT INTO transactions VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('tx-v4','cmd-v4','OPEN','v4','policy.v1','BFochtman746/system-master',OID,'2026-09-11T00:00:00.000Z','2026-09-11T00:00:00.000Z',null,'sha1');
    legacy.close();

    let k=new ControllerKernel(db);
    assert.equal(k.db.prepare('SELECT MAX(version) version FROM schema_migrations').get().version,5);
    assert.equal(k.db.prepare('SELECT COUNT(*) n FROM schema_migrations WHERE version=5').get().n,1);
    assert.equal(k.db.prepare('SELECT command_id,state,subject_oid,subject_algorithm FROM transactions WHERE transaction_id=?').get('tx-v4').state,'OPEN');
    assert.ok(k.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admission_decisions'").get());
    assert.equal(k.db.prepare('SELECT COUNT(*) n FROM admission_decisions').get().n,0);
    k.close();

    k=new ControllerKernel(db);
    assert.equal(k.db.prepare('SELECT MAX(version) version FROM schema_migrations').get().version,5);
    assert.equal(k.db.prepare('SELECT COUNT(*) n FROM schema_migrations WHERE version=5').get().n,1);
    assert.equal(k.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    k.close();
  }finally{cleanup(dir);}
});
