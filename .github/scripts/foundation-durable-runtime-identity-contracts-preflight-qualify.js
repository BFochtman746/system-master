'use strict';

const fs=require('fs'), os=require('os'), path=require('path'), crypto=require('crypto');
const {spawnSync}=require('child_process');
const root=process.env.GITHUB_WORKSPACE||process.cwd();
const evidence=fs.mkdtempSync(path.join(process.env.RUNNER_TEMP||os.tmpdir(),'foundation-durable-runtime-ic-preflight-'));
const classes=path.join(evidence,'classes'); fs.mkdirSync(classes,{recursive:true});
const base='170860ea430da7b1a26a402512b1d54fb89b5a69';

function run(cmd,args,file){
  const r=spawnSync(cmd,args,{cwd:root,encoding:'utf8',shell:false,windowsHide:true,env:process.env});
  const out=(r.stdout||'')+(r.stderr||'');
  if(file)fs.writeFileSync(path.join(evidence,file),out,'utf8');
  if(r.error||r.status!==0)throw new Error(`${cmd} ${args.join(' ')} failed: ${r.error?r.error.message:`exit ${r.status}`}\n${out}`);
  return out.trim();
}
function java(dir){let out=[];for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())out=out.concat(java(p));else if(e.isFile()&&e.name.endsWith('.java'))out.push(p);}return out.sort();}
function shaFile(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}
function present(p){return fs.existsSync(path.join(root,p));}

try{
  const subject=run('git',['rev-parse','HEAD']);
  run('git',['merge-base','--is-ancestor',base,'HEAD']);
  run('java',['-version'],'java-version.txt'); run('javac',['-version'],'javac-version.txt');

  const dirs=[
    'system-master/foundation-spine/system-root/src/main/java',
    'system-master/foundation-spine/identity/src/main/java',
    'system-master/foundation-spine/contracts/src/main/java',
    'system-master/foundation-spine/durable-runtime/src/main/java',
    'system-master/foundation-spine/durable-runtime/src/test/java'
  ].map(p=>path.join(root,p));
  const all=dirs.flatMap(java);
  fs.writeFileSync(path.join(evidence,'source-digests.json'),JSON.stringify(Object.fromEntries(all.map(f=>[path.relative(root,f),shaFile(f)])),null,2)+'\n');
  run('javac',['--release','21','-Xlint:all,-try','-Werror','-d',classes,...all],'compile.txt');
  const isolated=run('java',['-cp',classes,'org.systemmaster.foundation.runtime.IdentityContractsPreflightAdapterQualificationTest'],'adapter-26-case.txt');
  if(!isolated.includes('PASS FOUNDATION_DURABLE_RUNTIME_IDENTITY_CONTRACTS_PREFLIGHT cases=26'))throw new Error('26-case predicate missing');

  const cumulative=run('node',['.github/scripts/foundation-contracts-versioning-qualify.js'],'root-identity-contracts-cumulative.txt');
  if(!cumulative.includes('PASS FOUNDATION_ROOT_IDENTITY_CONTRACTS_CUMULATIVE'))throw new Error('Root/Identity/Contracts cumulative predicate missing');

  const f003Required=[
    'src/main/java/org/systemmaster/core/DurableRuntime.java',
    'src/main/java/org/systemmaster/core/JdbcDurableRuntime.java',
    'src/test/java/org/systemmaster/core/Foundation003AuthorityTests.java',
    'src/test/java/org/systemmaster/core/Foundation003JdbcContractPortableTests.java',
    'tools/verify_foundation003_contract_parity.py'
  ];
  const f003Present=f003Required.every(present);
  fs.writeFileSync(path.join(evidence,'f003-availability.txt'),[
    `candidate_tree=${subject}`,
    `required_paths_present=${f003Present}`,
    `standing=${f003Present?'AVAILABLE_REQUIRES_SEPARATE_DECLARED_SUBJECT_EXECUTION':'NOT_PRESENT_ON_GIT_SUBJECT_NO_PASS_TRANSFER'}`,
    'live_postgresql=NOT_CLAIMED',
    'a01_native_production=NOT_CLAIMED',''
  ].join('\n'));

  fs.writeFileSync(path.join(evidence,'result.txt'),[
    'result=PASS_BOUNDED_ADAPTER_AND_AVAILABLE_CUMULATIVE',
    'changed_subject_cases=26',
    'root_identity_contracts_cumulative=PASS',
    `f003_candidate_paths_present=${f003Present}`,
    `f003_status=${f003Present?'REQUIRES_DECLARED_F003_EXECUTION':'SOURCE_NOT_PRESENT_ON_GIT_SUBJECT'}`,
    'whole_continuity=NOT_CLAIMED',
    'a01_native_production=NOT_CLAIMED',''
  ].join('\n'));
  console.log(isolated);
  console.log('PASS FOUNDATION_DURABLE_RUNTIME_IC_PREFLIGHT_CHANGED_SUBJECT');
  console.log('PASS FOUNDATION_DURABLE_RUNTIME_IC_PREFLIGHT_AVAILABLE_CUMULATIVE');
  console.log(`F003_CANDIDATE_PATHS_PRESENT=${f003Present}`);
  console.log(`evidence_dir=${evidence}`);
}catch(e){
  fs.writeFileSync(path.join(evidence,'result.txt'),'result=FAIL_OR_INCOMPLETE\n');
  fs.writeFileSync(path.join(evidence,'failure.txt'),`${e&&e.stack?e.stack:String(e)}\n`);
  console.error(e&&e.stack?e.stack:e); console.error(`evidence_dir=${evidence}`); process.exit(1);
}
