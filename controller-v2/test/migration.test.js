import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ControllerKernel } from '../src/kernel.js';

const OID='0123456789abcdef0123456789abcdef01234567';
function paths(){const dir=mkdtempSync(join(tmpdir(),'controller-v2-migrate-'));return {dir,db:join(dir,'legacy.sqlite')};}
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

test('MG-T001 real v1 rows migrate losslessly through v2, v3 and v4 with implicit SHA-1 made explicit',()=>{
  const {dir,db}=paths();
  try{
    const legacy=new DatabaseSync(db);
    createLegacyCore(legacy,1);
    legacy.prepare('INSERT INTO transactions VALUES (?,?,?,?,?,?,?,?,?)').run('tx1','cmd1','OPEN','legacy','legacy','BFochtman746/system-master',OID,'2026-09-11T00:00:00.000Z','2026-09-11T00:00:00.000Z');
    legacy.prepare('INSERT INTO qualifications VALUES (?,?,?,?,?,?,?)').run('q1','tx1',OID,'p1','PASSED','2026-09-11T00:00:00.000Z','2026-09-11T00:00:00.000Z');
    legacy.prepare('INSERT INTO promotions VALUES (?,?,?,?,?,?,?,?)').run('p1','tx1',OID,'q1','SUCCEEDED',null,'2026-09-11T00:00:00.000Z','2026-09-11T00:00:00.000Z');
    legacy.close();
    const k=new ControllerKernel(db);
    assert.equal(k.db.prepare('SELECT MAX(version) version FROM schema_migrations').get().version,4);
    assert.equal(k.db.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n,4);
    for(const table of ['transactions','qualifications','promotions']){
      const row=k.db.prepare(`SELECT subject_algorithm,subject_oid FROM ${table}`).get();
      assert.equal(row.subject_algorithm,'sha1');
      assert.equal(row.subject_oid,OID);
      assert.equal(columns(k.db,table).includes('subject_sha'),false);
    }
    assert.equal(k.db.prepare('SELECT completion_contract_json FROM transactions').get().completion_contract_json,null);
    assert.ok(k.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='external_effects'").get());
    assert.ok(k.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='external_effect_attempts'").get());
    assert.equal(k.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    k.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('MG-T002 failed v2 to v3 migration rolls back every ALTER and version write before v4',()=>{
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
    inspect.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});
