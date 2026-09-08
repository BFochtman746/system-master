'use strict';
const crypto=require('crypto'),fs=require('fs'),path=require('path'); const {spawnSync}=require('child_process');
const ws=process.env.GITHUB_WORKSPACE||process.cwd(), root='system-master/f-wp-012', runId=process.env.GITHUB_RUN_ID||'local';
const evidenceDir=path.join(process.env.RUNNER_TEMP||path.join(ws,'.tmp'),`system-master-fwp012-${runId}`); fs.mkdirSync(evidenceDir,{recursive:true});
const write=(n,v)=>fs.writeFileSync(path.join(evidenceDir,n),String(v).endsWith('\n')?String(v):String(v)+'\n','utf8');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function git(args,encoding='utf8'){const r=spawnSync('git',['-c',`safe.directory=${ws}`,...args],{cwd:ws,encoding,shell:false,windowsHide:true});if(r.error||r.status!==0)throw new Error(`GIT_FAILED:${args.join(' ')}:${r.error?r.error.message:String(r.stderr||r.stdout)}`);return r.stdout;}
function run(cmd,args){const r=spawnSync(cmd,args,{cwd:ws,encoding:'utf8',shell:false,windowsHide:true});const out=`${r.stdout||''}${r.stderr||''}`;if(r.error||r.status!==0)throw new Error(`${cmd.toUpperCase()}_FAILED:${r.error?r.error.message:out}`);return out;}
function seteq(a,b,n){a=[...a].sort();b=[...b].sort();if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${n}_MISMATCH:${a}:${b}`);}
try{
 const head=git(['rev-parse','HEAD']).trim(); const base=JSON.parse(fs.readFileSync(path.join(ws,root,'control','BASELINE-BINDING.json'),'utf8'));
 if(base.lineage_predecessor.qualified_commit!=='6551c91d0e1462ab9bee1e62dfba68a9f2a5eb67')throw new Error('F_WP_011_BASELINE_MISMATCH');
 git(['merge-base','--is-ancestor',base.lineage_predecessor.qualified_commit,'HEAD']);
 const req=JSON.parse(fs.readFileSync(path.join(ws,root,'control','REQUIREMENTS.json'),'utf8')); seteq(req.requirements.map(x=>x.id),['F-RQ-054','F-RQ-055','F-RQ-056','F-RQ-057'],'F_WP_012_REQUIREMENTS');
 const mf=JSON.parse(fs.readFileSync(path.join(ws,root,'control','SOURCE-SLICE-MANIFEST.json'),'utf8')); if(mf.expected_test_count!==47||mf.expected_requirement_count!==4||mf.production_authorized!==false)throw new Error('MANIFEST_METADATA_MISMATCH');
 for(const e of mf.files){const repoPath=`${root}/${e.path}`,bytes=git(['show',`HEAD:${repoPath}`],null);if(bytes.length!==e.size)throw new Error(`SEALED_SIZE_MISMATCH:${e.path}:${bytes.length}:${e.size}`);const h=hash(bytes);if(h!==e.sha256)throw new Error(`SEALED_HASH_MISMATCH:${e.path}:${h}:${e.sha256}`);}
 const prior=run('node',['.github/scripts/fwp011-qualify.js']); if(!prior.includes('PASS F-WP-011 tests=38 requirements=3'))throw new Error(`F_WP_011_REGRESSION_NOT_PROVEN:${prior}`); write('dependency-fwp011.txt',prior);
 const classes=path.join(evidenceDir,'classes');fs.mkdirSync(classes,{recursive:true});const src=path.join(ws,root,'src','main','java','org','systemmaster','core');const test=path.join(ws,root,'src','test','java','org','systemmaster','core','Fwp012QualificationTest.java');
 const files=['ContractRegistry.java','LegacyCrosswalkService.java','MigrationService.java','PortabilityService.java'].map(x=>path.join(src,x)); write('compile.txt',run('javac',['-encoding','UTF-8','-d',classes,...files,test])||'javac=PASS');
 const out=run('java',['-cp',classes,'org.systemmaster.core.Fwp012QualificationTest']); write('qualification.txt',out); if(!out.includes('PASS F-WP-012 tests=47 requirements=4'))throw new Error(`QUALIFICATION_SENTINEL_MISSING:${out}`);
 write('subject.txt',[`objective=${base.objective}`,`commit=${head}`,`branch=${process.env.GITHUB_REF_NAME||''}`,`runner=${process.env.RUNNER_NAME||''}`,`machine=${process.env.COMPUTERNAME||''}`,`predecessor_commit=${base.lineage_predecessor.qualified_commit}`,`predecessor_run=${base.lineage_predecessor.workflow_run_id}`,`predecessor_evidence_sha256=${base.lineage_predecessor.evidence_artifact_sha256}`].join('\n'));
 write('result.txt','result=PASS\ntests=47\nrequirements=4\nfwp011_regression=PASS\ncontracts_stabilized=true\nproduction_authorized=false'); console.log('PASS F-WP-012 tests=47 requirements=4');console.log(`evidence_dir=${evidenceDir}`);
}catch(e){const d=e&&e.stack?e.stack:String(e);write('failure.txt',d);write('result.txt','result=FAIL_OR_INCOMPLETE');console.error(d);process.exit(1);}
