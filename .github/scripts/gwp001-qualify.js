'use strict';
const crypto=require('crypto'),fs=require('fs'),path=require('path'),zlib=require('zlib');const {spawnSync}=require('child_process');
const ws=process.env.GITHUB_WORKSPACE||process.cwd(),root='system-master/g-wp-001',runId=process.env.GITHUB_RUN_ID||'local';
const evidenceDir=path.join(process.env.RUNNER_TEMP||path.join(ws,'.tmp'),`system-master-gwp001-${runId}`);fs.mkdirSync(evidenceDir,{recursive:true});
const write=(n,v)=>fs.writeFileSync(path.join(evidenceDir,n),String(v).endsWith('\n')?String(v):String(v)+'\n','utf8');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function git(args,encoding='utf8'){const r=spawnSync('git',['-c',`safe.directory=${ws}`,...args],{cwd:ws,encoding,shell:false,windowsHide:true});if(r.error||r.status!==0)throw new Error(`GIT_FAILED:${args.join(' ')}:${r.error?r.error.message:String(r.stderr||r.stdout)}`);return r.stdout;}
function run(cmd,args){const r=spawnSync(cmd,args,{cwd:ws,encoding:'utf8',shell:false,windowsHide:true});const out=`${r.stdout||''}${r.stderr||''}`;if(r.error||r.status!==0)throw new Error(`${cmd.toUpperCase()}_FAILED:${r.error?r.error.message:out}`);return out;}
function arr(v){return Array.isArray(v)?v:[v];}
try{
 const head=git(['rev-parse','HEAD']).trim(),base=JSON.parse(fs.readFileSync(path.join(ws,root,'control','BASELINE-BINDING.json'),'utf8'));
 const pred=base.canonical_predecessor.main_commit;if(pred!=='b86447d0f5dce1028c59daab41f3fed85c22c030')throw new Error('021F_BASELINE_MISMATCH');git(['merge-base','--is-ancestor',pred,'HEAD']);
 const pkg=JSON.parse(fs.readFileSync(path.join(ws,root,'control','PACKAGE-CONTRACT.json'),'utf8'));if(pkg.id!=='G-WP-001'||pkg.objective!=='Freeze 021G contracts, requirement schema, authority crosswalk and architecture validation gates.')throw new Error('PACKAGE_CONTRACT_DRIFT');
 if(JSON.stringify(pkg.prerequisites)!==JSON.stringify(['021F-R1 closed'])||JSON.stringify(pkg.components)!==JSON.stringify(['ContinuityPolicyRegistry'])||JSON.stringify(pkg.data)!==JSON.stringify(['ContinuityPolicy']))throw new Error('PACKAGE_SCOPE_DRIFT');
 if(JSON.stringify(pkg.contracts)!==JSON.stringify(['RegisterContinuityPolicy','GetContinuityPolicy']))throw new Error('PACKAGE_API_DRIFT');
 const schema=JSON.parse(fs.readFileSync(path.join(ws,root,'control','CONTRACT-SCHEMA.json'),'utf8'));const fields=schema.ContinuityPolicy.fields;
 for(const f of ['work_class','recoverability_class_defaults','checkpoint_policy','max_progress_loss','retry_budget','handoff_requirements','history_rollover_policy','effective_at','digest'])if(!fields.includes(f))throw new Error(`POLICY_FIELD_MISSING:${f}`);
 const names=schema.commands.map(x=>x.name).sort();if(JSON.stringify(names)!==JSON.stringify(['GetContinuityPolicy','RegisterContinuityPolicy']))throw new Error('COMMAND_SET_DRIFT');
 const ledger=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ws,root,'control','TRACEABILITY-LEDGER.json.gz'))).toString('utf8'));if(ledger.count!==76||ledger.rows.length!==76)throw new Error('TRACE_COUNT_MISMATCH');
 const ids=new Set(),required=['id','research_basis','design_decision','canonical_owner','implementing_components','data_state','command_query_api','invariant_validator','failure_recovery_rule','future_test_family','implementation_work_package'];
 for(const r of ledger.rows){if(ids.has(r.id))throw new Error(`DUPLICATE_REQUIREMENT:${r.id}`);ids.add(r.id);for(const k of required){const v=r[k];if(v==null||(typeof v==='string'&&!v.trim())||(Array.isArray(v)&&(v.length===0||v.some(x=>!String(x).trim()))))throw new Error(`ORPHAN_MAPPING:${r.id}:${k}`);}}
 const owned=ledger.rows.filter(x=>x.implementation_work_package==='G-WP-001').map(x=>x.id).sort();if(JSON.stringify(owned)!==JSON.stringify(['G-RQ-075','G-RQ-076']))throw new Error(`GWP001_REQUIREMENTS_DRIFT:${owned}`);
 const req=JSON.parse(fs.readFileSync(path.join(ws,root,'control','REQUIREMENTS.json'),'utf8'));if(req.requirements.length!==2)throw new Error('REQUIREMENTS_COUNT');
 const mf=JSON.parse(fs.readFileSync(path.join(ws,root,'control','SOURCE-SLICE-MANIFEST.json'),'utf8'));if(mf.expected_test_count!==35||mf.trace_requirement_count!==76||mf.contract_version!=='021G-continuity-policy/v1')throw new Error('MANIFEST_METADATA');
 for(const e of mf.files){const bytes=git(['show',`HEAD:${root}/${e.path}`],null);if(bytes.length!==e.size)throw new Error(`SEALED_SIZE_MISMATCH:${e.path}`);if(hash(bytes)!==e.sha256)throw new Error(`SEALED_HASH_MISMATCH:${e.path}`);}
 // Re-prove canonical 021F integration before consuming it.
 const prior=run('node',['.github/scripts/021f-integration-qualify.js']);if(!prior.includes('PASS 021F-INTEGRATION packages=12 java_files=51 requirements=60'))throw new Error(`021F_REGRESSION_NOT_PROVEN:${prior}`);write('dependency-021f.txt',prior);
 const classes=path.join(evidenceDir,'classes');fs.mkdirSync(classes,{recursive:true});const src=path.join(ws,root,'src','main','java','org','systemmaster','continuity'),test=path.join(ws,root,'src','test','java','org','systemmaster','continuity','Gwp001QualificationTest.java');
 write('compile.txt',run('javac',['-encoding','UTF-8','-d',classes,path.join(src,'ContinuityPolicyRegistry.java'),path.join(src,'ContinuityGovernanceValidator.java'),test])||'javac=PASS');
 const out=run('java',['-cp',classes,'org.systemmaster.continuity.Gwp001QualificationTest']);write('qualification.txt',out);if(!out.includes('PASS G-WP-001 tests=35 requirements=2 trace_requirements=76'))throw new Error(`QUALIFICATION_SENTINEL_MISSING:${out}`);
 write('subject.txt',[`objective=${base.objective}`,`commit=${head}`,`branch=${process.env.GITHUB_REF_NAME||''}`,`runner=${process.env.RUNNER_NAME||''}`,`predecessor_main=${pred}`,`predecessor_integration_run=${base.canonical_predecessor.integration_run_id}`,`predecessor_evidence_sha256=${base.canonical_predecessor.integration_evidence_sha256}`].join('\n'));
 write('result.txt','result=PASS\ntests=35\nrequirements=2\ntrace_requirements=76\ncontract_version=021G-continuity-policy/v1\n021f_regression=PASS\nproduction_authorized=false');console.log('PASS G-WP-001 tests=35 requirements=2 trace_requirements=76');console.log(`evidence_dir=${evidenceDir}`);
}catch(e){const d=e&&e.stack?e.stack:String(e);write('failure.txt',d);write('result.txt','result=FAIL_OR_INCOMPLETE');console.error(d);process.exit(1);}
