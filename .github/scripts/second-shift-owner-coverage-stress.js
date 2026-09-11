'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const repoRoot = path.resolve(__dirname, '..', '..');
const registryRel = 'governance/second-shift/SECOND-SHIFT-REGISTRY-001.json';
const schemaRel = 'governance/second-shift/SECOND-SHIFT-UTILIZATION-EVENT-SCHEMA-001.json';
const coverageRel = '.github/scripts/second-shift-owner-coverage.js';
function read(root, rel){ return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); }
function write(root, rel, obj){ fs.writeFileSync(path.join(root, rel), JSON.stringify(obj,null,2)+'\n'); }
function fixture(){
  const dest=fs.mkdtempSync(path.join(os.tmpdir(),'ss-coverage-'));
  fs.cpSync(path.join(repoRoot,'governance'),path.join(dest,'governance'),{recursive:true});
  let src=fs.readFileSync(path.join(repoRoot,coverageRel),'utf8');
  src=src.replace("const root = path.resolve(__dirname, '..', '..');",`const root = ${JSON.stringify(dest)};`);
  const p=path.join(dest,coverageRel); fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,src); return dest;
}
function run(root){
  const r=cp.spawnSync(process.execPath,[path.join(root,coverageRel),'--no-live'],{cwd:root,encoding:'utf8'});
  const marker='\nSECOND_SHIFT_OWNER_COVERAGE_'; const idx=r.stdout.lastIndexOf(marker);
  const jsonText=(idx>=0?r.stdout.slice(0,idx):r.stdout).trim();
  const report=JSON.parse(jsonText); return {status:r.status, report, types:new Set((report.findings||[]).map(x=>x.type))};
}
const cases=[];
function test(name,expected,mutate){ const root=fixture(); try{ mutate(root); const r=run(root); cases.push({name,expected,detected:r.types.has(expected),types:[...r.types].sort(),status:r.status}); } finally{fs.rmSync(root,{recursive:true,force:true});}}
test('topology peer missing from owner_files','SECOND_SHIFT_PEER_COVERAGE_MISSING',root=>{const r=read(root,registryRel); delete r.owner_files.DOCUMENTS; write(root,registryRel,r);});
test('retired PROSE provisioned','RETIRED_SYSTEM_PROVISIONED',root=>{const r=read(root,registryRel); r.owner_files.PROSE=r.owner_files.BOOK; write(root,registryRel,r);});
test('registry lane absent from telemetry schema','SECOND_SHIFT_TELEMETRY_LANE_MISSING',root=>{const s=read(root,schemaRel); s.allowed_lanes=s.allowed_lanes.filter(x=>x!=='DOCUMENTS'); write(root,schemaRel,s);});
test('telemetry orphan lane','SECOND_SHIFT_TELEMETRY_LANE_ORPHANED',root=>{const s=read(root,schemaRel); s.allowed_lanes.push('GHOST'); write(root,schemaRel,s);});
test('owner file missing','MISSING_OWNER_FILE',root=>{const r=read(root,registryRel); fs.unlinkSync(path.join(root,r.owner_files.CORE));});
const failures=cases.filter(x=>!x.detected); console.log(JSON.stringify({cases,failures},null,2)); process.exit(failures.length?1:0);
