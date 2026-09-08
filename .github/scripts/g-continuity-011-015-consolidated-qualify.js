'use strict';
const fs=require('fs'),path=require('path');
const {spawnSync}=require('child_process');
const ws=process.env.GITHUB_WORKSPACE||process.cwd();
const runId=process.env.GITHUB_RUN_ID||'local';
const evidenceDir=path.join(process.env.RUNNER_TEMP||path.join(ws,'.tmp'),`system-master-continuity-011-015-${runId}`);
fs.mkdirSync(evidenceDir,{recursive:true});
const write=(name,value)=>fs.writeFileSync(path.join(evidenceDir,name),String(value).endsWith('\n')?String(value):String(value)+'\n','utf8');
function git(args,encoding='utf8'){const r=spawnSync('git',['-c',`safe.directory=${ws}`,...args],{cwd:ws,encoding,shell:false,windowsHide:true});if(r.error||r.status!==0)throw new Error(`GIT_FAILED:${args.join(' ')}:${r.error?r.error.message:String(r.stderr||r.stdout)}`);return r.stdout;}
function run(cmd,args){const r=spawnSync(cmd,args,{cwd:ws,encoding:'utf8',shell:false,windowsHide:true,env:process.env});const out=`${r.stdout||''}${r.stderr||''}`;if(r.error||r.status!==0)throw new Error(`${cmd.toUpperCase()}_FAILED:${r.error?r.error.message:out}`);return out;}
function seteq(actual,expected,name){const a=[...actual].sort(),b=[...expected].sort();if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${name}_MISMATCH:${a.join(',')}:${b.join(',')}`);}
function readJson(rel){return JSON.parse(fs.readFileSync(path.join(ws,rel),'utf8'));}
try{
  const head=git(['rev-parse','HEAD']).trim();
  const branch=process.env.GITHUB_REF_NAME||'';
  const subject=readJson('system-master/g-continuity-011-015/control/CONSOLIDATED-INTEGRATION-SUBJECT.json');
  if(subject.objective!=='CONTINUITY-G-WP-011-015-CONSOLIDATED-INTEGRATION-QUALIFICATION')throw new Error('OBJECTIVE_MISMATCH');
  if(subject.branch!=='system-master/g-wp-011-015-continuity-slice')throw new Error('SUBJECT_BRANCH_MISMATCH');
  if(branch&&branch!==subject.branch)throw new Error(`EXECUTION_BRANCH_MISMATCH:${branch}`);
  if(subject.accumulated_scope_commit!=='9c040550f05356403da29f2900b3829241821ce3')throw new Error('ACCUMULATED_SCOPE_COMMIT_MISMATCH');
  if(subject.qualified_predecessor.commit!=='ba5713958cd2930c7c54e3d5fdadc41dd7a7a9ca'||subject.qualified_predecessor.workflow_run_id!==34281081879||subject.qualified_predecessor.artifact_id!==10078287685||subject.qualified_predecessor.artifact_sha256!=='f6b465a862f5b90d211f878607370326eacd29cf03ebfac390cfac6353007d65')throw new Error('QUALIFIED_PREDECESSOR_EVIDENCE_MISMATCH');
  git(['merge-base','--is-ancestor',subject.qualified_predecessor.commit,'HEAD']);
  git(['merge-base','--is-ancestor',subject.accumulated_scope_commit,'HEAD']);

  const expected=['G-RQ-023','G-RQ-024','G-RQ-044','G-RQ-057','G-RQ-058','G-RQ-059','G-RQ-060','G-RQ-061','G-RQ-014','G-RQ-015','G-RQ-049','G-RQ-050','G-RQ-062','G-RQ-063','G-RQ-064','G-RQ-016','G-RQ-041','G-RQ-042','G-RQ-065','G-RQ-066','G-RQ-067','G-RQ-068','G-RQ-006','G-RQ-069','G-RQ-070','G-RQ-071','G-RQ-072','G-RQ-073','G-RQ-074'];
  const reqs=[];
  for(const wp of ['011','012','013','014','015']){
    const doc=readJson(`system-master/g-wp-${wp}/control/REQUIREMENTS.json`);
    if(!Array.isArray(doc.requirements))throw new Error(`REQUIREMENTS_NOT_ARRAY:G-WP-${wp}`);
    reqs.push(...doc.requirements.map(x=>x.id));
  }
  if(new Set(reqs).size!==29)throw new Error(`NEW_SCOPE_REQUIREMENT_UNIQUENESS_MISMATCH:${new Set(reqs).size}`);
  seteq(reqs,expected,'G_WP_011_015_REQUIREMENTS');

  const build=readJson('system-master/g-continuity-011-015/control/BUILD-STATE.json');
  if(build.new_requirements_since_last_a01!==29||build.qualification_matrix.mapped!==76||build.qualification_matrix.total!==76||build.qualification_matrix.mapping_complete!==true)throw new Error('BUILD_STATE_MISMATCH');
  const closure=readJson('system-master/g-wp-015/control/PORTABLE-CLOSURE-QUALIFICATION.json');
  if(closure.requirements['G-RQ-071']!=='PASS'||closure.requirements['G-RQ-074']!=='PASS')throw new Error('TRACEABILITY_META_NOT_PASS');
  if(closure.requirements['G-RQ-072']!=='NOT_STARTED_TARGET_WINDOWS_AND_IOS')throw new Error('TARGET_EVIDENCE_WAS_FALSELY_ADVANCED');
  if(closure.requirements['G-RQ-073']!=='NOT_STARTED_EMPIRICAL_HUMAN')throw new Error('HUMAN_EVIDENCE_WAS_FALSELY_ADVANCED');
  if(subject.this_gate_evidence_class!=='A01_ORDINARY_INTEGRATION')throw new Error('ORDINARY_A01_CLASSIFICATION_MISMATCH');
  seteq(subject.not_satisfied_by_this_gate,['TARGET_WINDOWS_REBOOT','TARGET_IOS_CLIENT_SUSPEND_RESUME','EMPIRICAL_HUMAN_EVIDENCE'],'PENDING_EVIDENCE_CLASSES');

  const classes=path.join(evidenceDir,'classes');fs.mkdirSync(classes,{recursive:true});
  const dirs=[];for(let n=2;n<=15;n++)dirs.push(path.join(ws,'system-master',`g-wp-${String(n).padStart(3,'0')}`,'src','main','java','org','systemmaster','continuity'));
  let sources=[];for(const dir of dirs){if(fs.existsSync(dir))sources.push(...fs.readdirSync(dir).filter(x=>x.endsWith('.java')).sort().map(x=>path.join(dir,x)));}
  if(sources.length===0)throw new Error('NO_CONTINUITY_SOURCES_FOUND');
  const tests=[
    ['system-master/g-continuity-008-010/src/test/java/org/systemmaster/continuity/ContinuityRecoverySliceQualificationTest.java','org.systemmaster.continuity.ContinuityRecoverySliceQualificationTest','ASSERTIONS=96','PASS CONTINUITY-REPLACEMENT-SIGNALS-COMPAT requirements=13','qualification-008-010.txt'],
    ['system-master/g-continuity-011-013/src/test/java/org/systemmaster/continuity/ContinuityRecoveryIntegrityVisibilityAdmissionQualificationTest.java','org.systemmaster.continuity.ContinuityRecoveryIntegrityVisibilityAdmissionQualificationTest','ASSERTIONS=30','PASS CONTINUITY-INTEGRITY-VISIBILITY-ADMISSION requirements=22','qualification-011-013.txt'],
    ['system-master/g-wp-014/src/test/java/org/systemmaster/continuity/LegacyRecoveryMigrationQualificationTest.java','org.systemmaster.continuity.LegacyRecoveryMigrationQualificationTest','ASSERTIONS=7','PASS CONTINUITY-LEGACY-MIGRATION-EXPORT requirements=3','qualification-014.txt'],
    ['system-master/g-wp-015/src/test/java/org/systemmaster/continuity/ContinuityQualificationLedgerTest.java','org.systemmaster.continuity.ContinuityQualificationLedgerTest','ASSERTIONS=10','PASS CONTINUITY-QUALIFICATION-CLOSURE portable_meta=2 target_pending=1 human_pending=1','qualification-015.txt']
  ];
  const testPaths=tests.map(t=>path.join(ws,t[0]));
  write('java-version.txt',run('java',['-version']));
  write('javac-version.txt',run('javac',['-version']));
  write('compile.txt',run('javac',['-encoding','UTF-8','-d',classes,...sources,...testPaths])||'javac=PASS');
  let totalAssertions=0;
  for(const [rel,klass,assertionSentinel,passSentinel,outFile] of tests){
    const out=run('java',['-cp',classes,klass]);write(outFile,out);
    if(!out.includes(assertionSentinel)||!out.includes(passSentinel))throw new Error(`QUALIFICATION_SENTINEL_MISSING:${rel}:${out}`);
    totalAssertions+=Number(assertionSentinel.split('=')[1]);
  }
  if(totalAssertions!==143)throw new Error(`ASSERTION_TOTAL_MISMATCH:${totalAssertions}`);

  write('evidence-classification.txt',[
    'A01_ORDINARY_INTEGRATION=PASS',
    'TARGET_WINDOWS_REBOOT=NOT_STARTED',
    'TARGET_IOS_CLIENT_SUSPEND_RESUME=NOT_STARTED',
    'EMPIRICAL_HUMAN_EVIDENCE=NOT_STARTED',
    'rule=ordinary A-01 execution on Windows is not Windows-reboot evidence because this workflow performs no reboot',
    'rule=ordinary A-01 execution cannot satisfy iOS suspend/resume or empirical human handoff evidence'
  ].join('\n'));
  write('subject.txt',[
    'system=System Master — Continuity & Recovery System',
    'objective=CONTINUITY-G-WP-011-015-CONSOLIDATED-INTEGRATION-QUALIFICATION',
    `commit=${head}`,
    `branch=${branch}`,
    `runner=${process.env.RUNNER_NAME||''}`,
    `machine=${process.env.COMPUTERNAME||''}`,
    `qualified_predecessor_commit=${subject.qualified_predecessor.commit}`,
    `qualified_predecessor_run=${subject.qualified_predecessor.workflow_run_id}`,
    `accumulated_scope_commit=${subject.accumulated_scope_commit}`
  ].join('\n'));
  write('result.txt',[
    'result=PASS',
    'evidence_class=A01_ORDINARY_INTEGRATION',
    'assertions=143',
    'predecessor_regression_assertions=96',
    'new_scope_assertions=47',
    'new_scope_requirements=29',
    'gwp011_013=PASS',
    'gwp014=PASS',
    'gwp015_portable_meta=PASS',
    'target_windows_reboot=NOT_STARTED',
    'target_ios_client_suspend_resume=NOT_STARTED',
    'empirical_human_evidence=NOT_STARTED',
    'production_authorized=false'
  ].join('\n'));
  console.log('PASS CONTINUITY-G-WP-011-015-CONSOLIDATED-INTEGRATION assertions=143 new_requirements=29 evidence=A01_ORDINARY_INTEGRATION target_and_human_pending=3');
  console.log(`evidence_dir=${evidenceDir}`);
}catch(e){
  const detail=e&&e.stack?e.stack:String(e);write('failure.txt',detail);write('result.txt','result=FAIL_OR_INCOMPLETE\nproduction_authorized=false');console.error(detail);process.exit(1);
}
