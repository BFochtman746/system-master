'use strict';
const crypto=require('crypto'),fs=require('fs'),path=require('path'); const {spawnSync}=require('child_process');
const ws=process.env.GITHUB_WORKSPACE||process.cwd(), root='system-master/f-wp-011', runId=process.env.GITHUB_RUN_ID||'local';
const evidenceDir=path.join(process.env.RUNNER_TEMP||path.join(ws,'.tmp'),`system-master-fwp011-${runId}`); fs.mkdirSync(evidenceDir,{recursive:true});
const write=(n,v)=>fs.writeFileSync(path.join(evidenceDir,n),String(v).endsWith('\n')?String(v):String(v)+'\n','utf8');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function git(args,encoding='utf8'){const r=spawnSync('git',['-c',`safe.directory=${ws}`,...args],{cwd:ws,encoding,shell:false,windowsHide:true});if(r.error||r.status!==0)throw new Error(`GIT_FAILED:${args.join(' ')}:${r.error?r.error.message:String(r.stderr||r.stdout)}`);return r.stdout;}
function run(cmd,args){const r=spawnSync(cmd,args,{cwd:ws,encoding:'utf8',shell:false,windowsHide:true});const out=`${r.stdout||''}${r.stderr||''}`;if(r.error||r.status!==0)throw new Error(`${cmd.toUpperCase()}_FAILED:${r.error?r.error.message:out}`);return out;}
function seteq(a,b,n){a=[...a].sort();b=[...b].sort();if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${n}_MISMATCH:${a}:${b}`);}
try{
 const head=git(['rev-parse','HEAD']).trim(); const base=JSON.parse(fs.readFileSync(path.join(ws,root,'control','BASELINE-BINDING.json'),'utf8'));
 if(base.lineage_predecessor.qualified_commit!=='755c482ba0211b0dc44dd3399c1eb6fa149c677b')throw new Error('F_WP_010_BASELINE_MISMATCH');
 git(['merge-base','--is-ancestor',base.lineage_predecessor.qualified_commit,'HEAD']);
 const req=JSON.parse(fs.readFileSync(path.join(ws,root,'control','REQUIREMENTS.json'),'utf8')); seteq(req.requirements.map(x=>x.id),['F-RQ-037','F-RQ-038','F-RQ-045'],'F_WP_011_REQUIREMENTS');
 const mf=JSON.parse(fs.readFileSync(path.join(ws,root,'control','SOURCE-SLICE-MANIFEST.json'),'utf8'));
 if(mf.expected_test_count!==38||mf.expected_requirement_count!==3||mf.production_authorized!==false)throw new Error('MANIFEST_METADATA_MISMATCH');
 for(const e of mf.files){const repoPath=`${root}/${e.path}`, bytes=git(['show',`HEAD:${repoPath}`],null);if(bytes.length!==e.size)throw new Error(`SEALED_SIZE_MISMATCH:${e.path}:${bytes.length}:${e.size}`);const h=hash(bytes);if(h!==e.sha256)throw new Error(`SEALED_HASH_MISMATCH:${e.path}:${h}:${e.sha256}`);}
 const prior=run('node',['.github/scripts/fwp010-qualify.js']); if(!prior.includes('PASS F-WP-010 tests=47 requirements=7'))throw new Error(`F_WP_010_REGRESSION_NOT_PROVEN:${prior}`); write('dependency-fwp010.txt',prior);
 const classes=path.join(evidenceDir,'classes');fs.mkdirSync(classes,{recursive:true});const src=path.join(ws,root,'src','main','java','org','systemmaster','core');const test=path.join(ws,root,'src','test','java','org','systemmaster','core','Fwp011QualificationTest.java');
 const files=['ChangeQueryContracts.java','ChangeQueryService.java'].map(x=>path.join(src,x)); write('compile.txt',run('javac',['-encoding','UTF-8','-d',classes,...files,test])||'javac=PASS');
 const out=run('java',['-cp',classes,'org.systemmaster.core.Fwp011QualificationTest']); write('qualification.txt',out); if(!out.includes('PASS F-WP-011 tests=38 requirements=3'))throw new Error(`QUALIFICATION_SENTINEL_MISSING:${out}`);
 write('subject.txt',[`objective=${base.objective}`,`commit=${head}`,`branch=${process.env.GITHUB_REF_NAME||''}`,`runner=${process.env.RUNNER_NAME||''}`,`machine=${process.env.COMPUTERNAME||''}`,`predecessor_commit=${base.lineage_predecessor.qualified_commit}`,`predecessor_run=${base.lineage_predecessor.workflow_run_id}`,`predecessor_evidence_sha256=${base.lineage_predecessor.evidence_artifact_sha256}`].join('\n'));
 write('result.txt','result=PASS\ntests=38\nrequirements=3\nfwp010_regression=PASS\nprojection_authority=READ_ONLY\nproduction_authorized=false'); console.log('PASS F-WP-011 tests=38 requirements=3');console.log(`evidence_dir=${evidenceDir}`);
}catch(e){const d=e&&e.stack?e.stack:String(e);write('failure.txt',d);write('result.txt','result=FAIL_OR_INCOMPLETE');console.error(d);process.exit(1);}
