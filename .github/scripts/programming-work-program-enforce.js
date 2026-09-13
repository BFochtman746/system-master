'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
function fail(message){ console.error(`PROGRAMMING_WORK_PROGRAM_ENFORCEMENT_FAIL: ${message}`); process.exit(1); }
function assert(ok,message){ if(!ok) fail(message); }
function readJson(rel){ const p=path.join(root,rel); assert(fs.existsSync(p),`missing ${rel}`); try{return JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));}catch(e){fail(`invalid JSON ${rel}: ${e.message}`);} }
function readText(rel){ const p=path.join(root,rel); assert(fs.existsSync(p),`missing ${rel}`); return fs.readFileSync(p,'utf8'); }
function assertFile(rel){ assert(fs.existsSync(path.join(root,rel)),`missing ${rel}`); }

const authority=readJson('governance/CURRENT-AUTHORITY.json');
for(const f of ['topology','program_job_lock','programming_work_program_lock','programming_system_packet','programming_control_record','system_completion_status','obligation_registry','second_shift_registry','capability_crosswalk','morning_bootstrap_schema','chat_start_command_contract']) assert(authority[f],`CURRENT-AUTHORITY must select ${f}`);
const topology=readJson(authority.topology);
const programLock=readJson(authority.programming_work_program_lock);
const packet=readJson(authority.programming_system_packet);
const control=readJson(authority.programming_control_record);
const jobLock=readJson(authority.program_job_lock);
const completion=readJson(authority.system_completion_status);
const obligations=readJson(authority.obligation_registry);
const secondShift=readJson(authority.second_shift_registry);
const crosswalk=readJson(authority.capability_crosswalk);
const bootstrap=readJson(authority.morning_bootstrap_schema);
const start=readText(authority.chat_start_command_contract);

assert(topology.topology_id==='SYSTEM-TOPOLOGY-007','Programming admission must be bound to Topology 007');
assert(programLock.program_id==='PROGRAMMING','Programming continuity-lock ID mismatch');
assert(programLock.current_topology===authority.topology,'Programming continuity lock has stale topology binding');
assert(programLock.system_packet===authority.programming_system_packet,'Programming system packet pointer mismatch');
assert(programLock.control_record===authority.programming_control_record,'Programming control record pointer mismatch');
assert(programLock.classification==='ACTIVE_PEER_SYSTEM__ADMITTED_FROM_PRESERVED_WORK_PROGRAM','Programming continuity lock must describe admitted peer');
assert(programLock.execution_lane?.separate_peer_second_shift_lane===true,'Programming must have peer Second Shift lane after admission');
assert(Array.isArray(programLock.preserve_and_reuse)&&programLock.preserve_and_reuse.length>0,'Programming preserved evidence lineage missing');
assert(String(programLock.topology_effect||'').includes('TOPOLOGY_007'),'Programming topology effect must bind Topology 007');

const system=(topology.canonical_internal_systems||[]).find(x=>x.system_id==='PROGRAMMING');
assert(system,'Programming missing from canonical internal systems');
assert((topology.peer_system_ids||[]).includes('PROGRAMMING'),'Programming missing from peer_system_ids');
assert((topology.execution_readiness?.execution_ready_peer_system_ids||[]).includes('PROGRAMMING'),'Programming must be execution-ready after admission');
assert(system.parent_id==='SYSTEM_MASTER'&&system.control_ref==='programming/control-v1','Programming topology owner/control mismatch');
assert(system.control_record===authority.programming_control_record,'Programming topology control-record pointer mismatch');
assert(control.system_id==='PROGRAMMING'&&control.owner_path==='SYSTEM_MASTER/PROGRAMMING','Programming control record identity mismatch');
assert(control.control_ref===system.control_ref,'Programming control ref mismatch');

const job=jobLock.programs?.PROGRAMMING;
assert(job?.owner_path==='SYSTEM_MASTER/PROGRAMMING','Programming job owner mismatch');
assert(String(job.classification||'').includes('ACTIVE_PEER_SYSTEM'),'Programming job classification must be peer');
assert(job.integrates_upward_to==='SYSTEM_MASTER','Programming must integrate upward into System Master');
assert(job.program_lock===authority.programming_work_program_lock,'Programming job continuity-lock mismatch');
assert(job.system_packet===authority.programming_system_packet,'Programming job packet mismatch');

assert(packet.system_id==='PROGRAMMING'&&packet.candidate_system_id==='PROGRAMMING','Programming packet identity mismatch');
assert(packet.architecture_authority===true,'Programming packet must reflect explicit admission authority');
assert(String(packet.lifecycle||'').includes('ACTIVE_INCOMPLETE_PEER_SYSTEM'),'Programming packet must reflect peer lifecycle');
assert(packet.work_program_lock===authority.programming_work_program_lock,'Programming packet continuity-lock mismatch');
const owned=new Map((packet.owned_capabilities||[]).map(x=>[x.capability_id,x]));
assert(owned.get('C01')?.module_key==='AUTOMATION'&&owned.get('C05')?.module_key==='CODE'&&owned.get('C40')?.module_key==='WEBSITE_BUILDING','Programming packet capability ownership incomplete');

const status=(completion.systems||[]).find(x=>x.system_id==='PROGRAMMING');
assert(status&&status.complete===false&&status.owner_path==='SYSTEM_MASTER/PROGRAMMING','Programming must be active/incomplete in system completion truth');
assert(!(completion.non_system_programs||[]).some(x=>x.program_id==='PROGRAMMING'),'Programming must not remain a non-system program after admission');

const current=(obligations.obligations||[]).find(x=>x.obligation_id==='PROGRAMMING-WORK-PROGRAM-CONTINUATION-001');
assert(current&&['READY','ACTIVE'].includes(current.state),'Programming continuation obligation must remain executable');
assert(current.owner_path==='SYSTEM_MASTER/PROGRAMMING','Programming continuation must be Programming-owned');
assert(current.program_lock===authority.programming_work_program_lock,'Programming continuation continuity-lock mismatch');
assert(/ACTIVE_PEER_LANE/.test(String(current.second_shift_state||'')),'Programming continuation must declare peer lane execution state');

const support=(obligations.obligations||[]).find(x=>x.obligation_id===authority.highest_discretionary_objective);
assert(support?.parent_program_id==='PROGRAMMING','selected Programming support objective must remain subordinate to Programming');
assert(support?.owner_path==='SYSTEM_MASTER/CORE','Programming Knowledge Recovery must remain Core-administered');

const ownerFile=secondShift.owner_files?.PROGRAMMING;
assert(ownerFile,'Programming Second Shift owner file missing');
const owner=readJson(ownerFile);
assert(owner.owner_system_id==='PROGRAMMING'&&owner.owner_path==='SYSTEM_MASTER/PROGRAMMING','Programming Second Shift identity mismatch');
assert(owner.control_binding?.path===authority.programming_control_record,'Programming Second Shift control binding mismatch');
assert(owner.last_known_control_head===obligations.owner_head_snapshot?.PROGRAMMING,'Programming Second Shift head must match obligation snapshot');

const c40=(crosswalk.capability_entries||[]).find(x=>x.capability_id==='C40');
assert(c40?.module_key==='WEBSITE_BUILDING'&&c40.owner_path==='SYSTEM_MASTER/PROGRAMMING','C40 must be Website Building owned by Programming');
assert(String(c40.disposition||'').includes('NOT_PEER_SYSTEM'),'Website Building must not become a tenth peer system');
assert(topology.explicit_non_systems?.WEBSITE_BUILDING==='PROGRAMMING_CAPABILITY_NOT_PEER_SYSTEM','Topology must preserve Website Building non-system classification');

const foundation=control.website_building_boundary?.foundation_1_0;
const lockFoundation=programLock.website_building?.foundation_1_0;
const packetFoundation=owned.get('C40')?.foundation_1_0;
const foundationContract=programLock.website_building?.foundation_contract;
assert(foundation?.contract_id==='WEBSITE-BUILDING-FOUNDATION-1.0','C40 Foundation 1.0 contract binding missing from Programming control');
assert(foundation.status==='QUALIFIED_DETERMINISTIC_STATIC_FOUNDATION','C40 Foundation 1.0 must be qualified in Programming control');
assert(foundation.implementation==='tools/website_builder.py','C40 implementation path drift');
assert(foundation.qualification_command==='python3 .github/scripts/website-building-foundation-qualify.py','C40 qualification command drift');
assert(foundation.qualification_corpus==='qualification/website-building/corpus/static-basic','C40 qualification corpus drift');
assert(foundation.qualification_workflow==='.github/workflows/website-building-foundation-qualification.yml','C40 qualification workflow drift');
assert(foundation.external_side_effects===false&&foundation.network_access===false,'C40 Foundation 1.0 must be local and side-effect bounded');
assert(foundation.publication_authority==='NOT_GRANTED'&&foundation.production_deployment_authority==='NOT_GRANTED','C40 Foundation 1.0 may not self-grant publication/deployment');
assert(lockFoundation?.contract_id===foundation.contract_id&&lockFoundation.implementation===foundation.implementation,'C40 continuity lock must bind Foundation 1.0 implementation');
assert(lockFoundation.qualification_command===foundation.qualification_command&&lockFoundation.qualification_corpus===foundation.qualification_corpus,'C40 continuity lock qualification binding drift');
assert(packetFoundation?.contract_id===foundation.contract_id&&packetFoundation.status===foundation.status,'C40 system packet Foundation 1.0 status drift');
assert(foundationContract==='governance/contracts/WEBSITE-BUILDING-FOUNDATION-CONTRACT-001.md','C40 foundation contract pointer drift');

const requiredFoundationFiles=[
  foundationContract,
  foundation.implementation,
  '.github/scripts/website-building-foundation-qualify.py',
  'tests/test_website_builder.py',
  'qualification/website-building/corpus/static-basic/index.html',
  'qualification/website-building/corpus/static-basic/styles.css',
  'qualification/website-building/corpus/static-basic/app.js',
  foundation.qualification_workflow
];
for(const rel of requiredFoundationFiles) assertFile(rel);

const foundationText=readText(foundationContract);
assert(foundationText.includes('Foundation 1.0 implementation accepted'),'C40 foundation contract must record accepted implementation scope');
assert(foundationText.includes(foundation.qualification_command),'C40 foundation contract missing qualification command');
assert(foundationText.includes(foundation.qualification_corpus),'C40 foundation contract missing representative corpus');
assert(foundationText.includes('does not grant browser, credential, publication, provider, domain/DNS or production-deployment authority'),'C40 foundation contract must preserve external authority fence');

const c40Workflow=readText(foundation.qualification_workflow);
assert(c40Workflow.includes('python3 -m unittest tests.test_website_builder'),'C40 workflow must execute Website Building tests');
assert(c40Workflow.includes('python3 .github/scripts/website-building-foundation-qualify.py'),'C40 workflow must execute qualification command');
assert(c40Workflow.includes('website-building-foundation-1.0-evidence'),'C40 workflow must preserve machine-readable qualification evidence');

const programmingWorkflow=readText('.github/workflows/programming-work-program-enforcement.yml');
for(const rel of [foundationContract,foundation.implementation,'.github/scripts/website-building-foundation-qualify.py','tests/test_website_builder.py','qualification/website-building/**',foundation.qualification_workflow]) {
  assert(programmingWorkflow.includes(rel),`Programming enforcement workflow is not coupled to ${rel}`);
}

assert((bootstrap.allowed_chat_roles||[]).includes('PROGRAMMING'),'Morning bootstrap missing PROGRAMMING peer role');
assert(bootstrap.historical_role_aliases?.PROGRAMMING_WORK_PROGRAM==='PROGRAMMING','historical Programming chat role alias missing');
assert(start.includes("Start today's Programming chat."),'Programming start command missing');
assert(start.includes('-> `PROGRAMMING`'),'Programming start command must resolve to PROGRAMMING peer role');

console.log('PROGRAMMING_WORK_PROGRAM_ENFORCEMENT_PASS');
console.log(`topology=${topology.topology_id}`);
console.log('programming=ACTIVE_EXECUTION_READY_PEER_CONTINUITY_PRESERVED');
console.log('website_building=C40_PROGRAMMING_CAPABILITY_NOT_PEER');
console.log('website_building_foundation_1_0=QUALIFIED_DETERMINISTIC_STATIC_FOUNDATION');
console.log(`support_objective=${authority.highest_discretionary_objective}`);
