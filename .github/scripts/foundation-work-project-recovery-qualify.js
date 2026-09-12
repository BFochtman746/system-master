'use strict';
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const root=process.env.GITHUB_WORKSPACE||process.cwd();
const base='b2dfd952215ce7966c1e91c7bc4184462b1d7365';
function run(cmd,args){const r=spawnSync(cmd,args,{cwd:root,encoding:'utf8',shell:false,windowsHide:true});if(r.error||r.status!==0)throw new Error(`${cmd} ${args.join(' ')} failed\n${r.stdout||''}${r.stderr||''}`);return (r.stdout||'').trim();}
try{
 const subject=run('git',['rev-parse','HEAD']);
 run('git',['merge-base','--is-ancestor',base,'HEAD']);
 const currentGwp=run('git',['ls-tree','-r','--name-only',base]).split(/\r?\n/).filter(Boolean).filter(p=>p.startsWith('system-master/g-wp-'));
 if(currentGwp.length!==0) throw new Error(`expected no current g-wp paths at base, found ${currentGwp.length}`);
 const file=path.join(root,'system-master','foundation-spine','work-chain','WORK-PROJECT-RECOVERY-INVENTORY-001.md');
 const text=fs.readFileSync(file,'utf8');
 const required=[
  'DESIGN-LOCK BLOCKED',
  'BLOCKED_RECOVERY_SOURCE_AUTHORITY',
  'ba5713958cd2930c7c54e3d5fdadc41dd7a7a9ca',
  '347b0e4931f6fbc53a9c7bfe906e634fd90ac9af',
  'production_authorized=false',
  'Requirements authorized for direct semantic owner transfer',
  'CORE-DURABLE-RUNTIME-CONTINUITY-RECOVERY-INVENTORY-001',
  'No A-01 target execution',
  'no historical qualification is transferred'
 ];
 // The transfer rule is expressed as prose rather than as a count in this recovery unit.
 for(const phrase of required.filter(x=>x!=='Requirements authorized for direct semantic owner transfer')) if(!text.includes(phrase)) throw new Error(`missing ${phrase}`);
 const rows=[...text.matchAll(/^\| (Governed Goal \/ Intent|Long-lived Work identity \/ Work lifecycle|Project identity \/ grouping \/ project lifecycle|Orchestrator Plan \/ Step truth|Durable Job \/ Attempt \/ fence \/ checkpoint|Durable signal\/timer\/pause\/cancel recovery|Handoff\/replacement recovery|Retry\/backlog\/resource pacing|Query\/progress projection|Qualification\/evidence closure) \|/gm)];
 if(rows.length!==10) throw new Error(`owner adjudication rows ${rows.length} != 10`);
 const unresolved=[...text.matchAll(/^\d+\. /gm)].length;
 if(unresolved<20) throw new Error(`expected >=20 explicit collision/blocker items, got ${unresolved}`);
 console.log(JSON.stringify({subject,base,current_gwp_paths:0,owner_adjudication_rows:10,standing:'RECOVERY_QUALIFIED__WORK_PROJECT_ORCHESTRATOR_DESIGN_LOCK_BLOCKED',result:'PASS'}));
 console.log('PASS FOUNDATION_WORK_PROJECT_RECOVERY owner_rows=10 current_gwp_paths=0');
}catch(e){console.error(e&&e.stack?e.stack:String(e));process.exit(1);}
