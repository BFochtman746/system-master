'use strict';
const fs=require('fs'); const path=require('path'); const cp=require('child_process');
const root=path.resolve(process.env.A01_SUBJECT_ROOT || process.env.GITHUB_WORKSPACE || process.cwd());
const evidence=path.resolve(process.env.A01_EVIDENCE_DIR || path.join(process.env.RUNNER_TEMP || root,'literary-a01-evidence'));
fs.mkdirSync(evidence,{recursive:true});
const script=path.join(root,'qualification','literary-prose-engine-001','overnight-research','deep_harvest.py');
const seeds=path.join(root,'qualification','literary-prose-engine-001','overnight-research','LITERARY-RESEARCH-DEEP-SEEDS-v1.json');
if(!fs.existsSync(script) || !fs.existsSync(seeds)) throw new Error('LITERARY_DEEP_HARVEST_SUBJECT_FILES_MISSING');
function probe(cmd,args){ const r=cp.spawnSync(cmd,args,{encoding:'utf8',shell:false}); return !r.error && r.status===0; }
let py=null, prefix=[];
if(probe('python',['--version'])) py='python';
else if(probe('py',['-3','--version'])) { py='py'; prefix=['-3']; }
if(!py) throw new Error('PYTHON_NOT_FOUND_ON_A01');
const prequal=process.env.A01_PREQUALIFY_ONLY==='1';
const args=[...prefix,script,'--seeds',seeds,'--output',evidence,'--budget-seconds',prequal?'1':'1320'];
if(prequal) args.push('--plan-only');
fs.writeFileSync(path.join(evidence,'wrapper-plan.json'),JSON.stringify({wrapper:'a01-literary-research-deep-harvest.js',python:py,prequal,budget_seconds:prequal?1:1320,subject_sha:process.env.GITHUB_SHA||null,full_text_acquisition:false},null,2)+'\n');
const child=cp.spawnSync(py,args,{cwd:root,encoding:'utf8',shell:false,env:{...process.env,PYTHONUNBUFFERED:'1'},maxBuffer:16*1024*1024});
fs.writeFileSync(path.join(evidence,'harvester-stdout.txt'),child.stdout||''); fs.writeFileSync(path.join(evidence,'harvester-stderr.txt'),child.stderr||'');
if(child.stdout) process.stdout.write(child.stdout); if(child.stderr) process.stderr.write(child.stderr);
if(child.error) throw child.error; if(child.status!==0) process.exit(child.status||1);
const summaryPath=path.join(evidence,'harvest_summary.json'); if(!fs.existsSync(summaryPath)) throw new Error('HARVEST_SUMMARY_MISSING');
const summary=JSON.parse(fs.readFileSync(summaryPath,'utf8'));
if(summary.full_text_acquisition===true || summary.full_text_book_acquisition_performed===true || summary.raw_article_or_book_bodies_persisted===true || summary.named_author_imitation_target===true) throw new Error('LITERARY_RIGHTS_OR_IMITATION_BOUNDARY_VIOLATION');
fs.writeFileSync(path.join(evidence,'qualification-summary.json'),JSON.stringify({standing:summary.standing,stop_reason:summary.stop_reason||null,requests_attempted:summary.requests_attempted||0,openalex_unique_works:summary.openalex_unique_works||0,crossref_unique_works:summary.crossref_unique_works||0,rights_status:summary.rights_status||null,prequal},null,2)+'\n');
console.log(`LITERARY_A01_DEEP_HARVEST_WRAPPER=${summary.standing}`);
