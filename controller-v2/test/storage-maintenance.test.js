import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ControllerKernel } from '../src/kernel.js';
import { backupControllerStore } from '../src/storage-maintenance.js';
import { uuidv7 } from '../src/canonical.js';

const SHA='0123456789abcdef0123456789abcdef01234567';
function command(task='backup'){return {protocol_version:'1.0',schema:'controller://schemas/command/v1',command_id:uuidv7(),created_at:new Date().toISOString(),issuer:{principal:'user:test',source:'chatgpt'},command_type:'controller.work.submit',target:{repository:'BFochtman746/system-master',expected_subject_sha:SHA},preconditions:{},intent:{task},constraints:{},required_policy_version:null};}
function tempPaths(){const dir=mkdtempSync(join(tmpdir(),'controller-v2-backup-'));return {dir,db:join(dir,'controller.sqlite'),backup:join(dir,'controller.backup.sqlite')};}

test('SM-T001 backup is independently integrity-verified',async()=>{const {dir,db,backup}=tempPaths();try{const k=new ControllerKernel(db);k.acceptCommand(command());const result=await backupControllerStore(k,backup);assert.equal(result.integrity,'ok');assert.equal(result.schema_version,2);assert.equal(result.transactions,1);assert.ok(result.events>=1);k.close();}finally{rmSync(dir,{recursive:true,force:true});}});
test('SM-T002 backup is a point-in-time copy and does not mutate with source',async()=>{const {dir,db,backup}=tempPaths();try{const k=new ControllerKernel(db);k.acceptCommand(command('before'));await backupControllerStore(k,backup);k.acceptCommand(command('after'));assert.equal(k.db.prepare('SELECT COUNT(*) n FROM transactions').get().n,2);const b=new DatabaseSync(backup);assert.equal(b.prepare('SELECT COUNT(*) n FROM transactions').get().n,1);b.close();k.close();}finally{rmSync(dir,{recursive:true,force:true});}});
test('SM-T003 verified backup remains usable after source files are lost',async()=>{const {dir,db,backup}=tempPaths();try{const k=new ControllerKernel(db);const tx=k.acceptCommand(command('recover')).transaction_id;await backupControllerStore(k,backup);k.close();for(const path of [db,`${db}-wal`,`${db}-shm`]) if(existsSync(path)) unlinkSync(path);const recovered=new ControllerKernel(backup);assert.equal(recovered.db.prepare('SELECT transaction_id FROM transactions').get().transaction_id,tx);assert.equal(recovered.db.prepare('SELECT MAX(version) version FROM schema_migrations').get().version,2);assert.equal(recovered.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');recovered.close();}finally{rmSync(dir,{recursive:true,force:true});}});
