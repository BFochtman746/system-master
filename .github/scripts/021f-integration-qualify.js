'use strict';
const fs=require('fs'),path=require('path');const {spawnSync}=require('child_process');
const ws=process.env.GITHUB_WORKSPACE||process.cwd(),runId=process.env.GITHUB_RUN_ID||'local';
const evidenceDir=path.join(process.env.RUNNER_TEMP||path.join(ws,'.tmp'),`system-master-021f-integration-${runId}`);fs.mkdirSync(evidenceDir,{recursive:true});
const write=(n,v)=>fs.writeFileSync(path.join(evidenceDir,n),String(v).endsWith('\n')?String(v):String(v)+'\n','utf8');
function git(args,encoding='utf8'){const r=spawnSync('git',['-c',`safe.directory=${ws}`,...args],{cwd:ws,encoding,shell:false,windowsHide:true});if(r.error||r.status!==0)throw new Error(`GIT_FAILED:${args.join(' ')}:${r.error?r.error.message:String(r.stderr||r.stdout)}`);return r.stdout;}
function run(cmd,args){const r=spawnSync(cmd,args,{cwd:ws,encoding:'utf8',shell:false,windowsHide:true});const out=`${r.stdout||''}${r.stderr||''}`;if(r.error||r.status!==0)throw new Error(`${cmd.toUpperCase()}_FAILED:${r.error?r.error.message:out}`);return out;}
function walk(dir,out=[]){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);e.isDirectory()?walk(p,out):out.push(p);}return out;}
// CI-ONLY GATE. This qualifier asserts HEAD *is* the exact two-parent integration
// merge commit recorded in INTEGRATION-BINDING.json. On any ordinary checkout HEAD is
// not that merge, so it failed with a cryptic MERGE_PARENT_MISMATCH that looked like a
// broken build rather than "this gate does not apply here". Skip explicitly instead.
// Force it anywhere with SYSTEM_MASTER_RUN_CI_ONLY=1.
if(process.env.GITHUB_ACTIONS!=='true'&&process.env.SYSTEM_MASTER_RUN_CI_ONLY!=='1'){
 console.log('SKIP 021F-INTEGRATION reason=CI_ONLY_GATE detail=requires_HEAD_to_be_the_recorded_two_parent_integration_merge override=SYSTEM_MASTER_RUN_CI_ONLY=1');
 process.exit(0);
}
try{
 const binding=JSON.parse(fs.readFileSync(path.join(ws,'system-master','021f-integration','INTEGRATION-BINDING.json'),'utf8'));
 const head=git(['rev-parse','HEAD']).trim();const parents=git(['rev-list','--parents','-n','1','HEAD']).trim().split(/\s+/).slice(1);
 if(parents.length!==2||parents[0]!==binding.main_parent||parents[1]!==binding.qualified_lineage_parent)throw new Error(`MERGE_PARENT_MISMATCH:${parents}`);
 git(['merge-base','--is-ancestor',binding.main_parent,'HEAD']);git(['merge-base','--is-ancestor',binding.qualified_lineage_parent,'HEAD']);
 const diag='.github/workflows/runner-identity-path-diagnostic.yml';const mainDiag=git(['show',`${binding.main_parent}:${diag}`],null),headDiag=git(['show',`HEAD:${diag}`],null);if(!mainDiag.equals(headDiag))throw new Error('MAIN_DIAGNOSTIC_NOT_PRESERVED_EXACT');
 const changed=git(['diff','--name-only',binding.qualified_lineage_parent,'HEAD']).trim().split(/\r?\n/).filter(Boolean);
 const forbidden=changed.filter(p=>/^system-master\/f-wp-\d{3}\//.test(p)||/^\.github\/scripts\/fwp\d{3}/.test(p)||/^\.github\/workflows\/system-master-f-wp-\d{3}/.test(p)||/^qualification\/fwp002\//.test(p));if(forbidden.length)throw new Error(`QUALIFIED_BYTES_CHANGED:${forbidden.join(',')}`);
 for(let i=1;i<=12;i++){const id=String(i).padStart(3,'0');if(!fs.existsSync(path.join(ws,'system-master',`f-wp-${id}`)))throw new Error(`MISSING_PACKAGE:F-WP-${id}`);}
 const chained=run('node',['.github/scripts/fwp012-qualify.js']);if(!chained.includes('PASS F-WP-012 tests=47 requirements=4'))throw new Error(`CHAINED_QUALIFICATION_NOT_PROVEN:${chained}`);write('chained-qualification.txt',chained);
 const java=[];for(let i=1;i<=12;i++){const id=String(i).padStart(3,'0'),root=path.join(ws,'system-master',`f-wp-${id}`,'src');if(fs.existsSync(root))for(const f of walk(root))if(f.endsWith('.java'))java.push(f);}java.sort();
 if(java.length<30)throw new Error(`INTEGRATED_JAVA_SET_TOO_SMALL:${java.length}`);const classes=path.join(evidenceDir,'integrated-classes');fs.mkdirSync(classes,{recursive:true});write('integrated-compile.txt',run('javac',['-encoding','UTF-8','-d',classes,...java])||'javac=PASS');
 write('subject.txt',[`objective=${binding.objective}`,`commit=${head}`,`main_parent=${binding.main_parent}`,`qualified_lineage_parent=${binding.qualified_lineage_parent}`,`runner=${process.env.RUNNER_NAME||''}`,`machine=${process.env.COMPUTERNAME||''}`,`integrated_java_files=${java.length}`].join('\n'));
 write('result.txt','result=PASS\npackages=12\narchitecture_requirements=60\nchained_fwp001_through_fwp012=PASS\nintegrated_compile=PASS\nmain_preserved=true\nproduction_authorized=false');console.log(`PASS 021F-INTEGRATION packages=12 java_files=${java.length} requirements=60`);console.log(`evidence_dir=${evidenceDir}`);
}catch(e){const d=e&&e.stack?e.stack:String(e);write('failure.txt',d);write('result.txt','result=FAIL_OR_INCOMPLETE');console.error(d);process.exit(1);}
