'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const BINDING_PATH = path.join(ROOT, 'qualification/book-system/lifecycle/BOOK-LIFECYCLE-IMPLEMENTATION-BINDING-001.json');
const LIFECYCLE_PATH = path.join(ROOT, 'qualification/book-system/lifecycle/BOOK-LIFECYCLE-STATE-MACHINE-001.json');
const ROWS_PATH = path.join(ROOT, 'qualification/book-system/lifecycle/BOOK-LIFECYCLE-IMPLEMENTATION-BINDING-001.rows.json');
const EXPECTED_BASELINE = '30c98afe510b2a41e0fbb23e78036023cde5b78e';
const EXPECTED_LIFECYCLE_BLOB = '70dd9818b33aca19a7ff2cdd4b889db1068ded6a';
const EXPECTED_WORKBOOK_SHA256 = '6d3948cfb67a28e55b747108746fa2e67cd9ec47acb5575270775edf034b1bbf';
const EXPECTED_REQUIREMENT_SET_SHA256 = 'bc694eb9e1ee512c84a546032aa3a11cfe04c67d740908c90020804ffedfd839';
const EXPECTED_BINDING_PROJECTION = '028d813f4d59296ed8737ec060d84d3340449f05e92e67cbe618f62c39c0bf91';
const EXPECTED_CLASS_TOTALS = Object.freeze({IMPLEMENTED:0, PARTIAL:30, UNIMPLEMENTED:150, PEER_DEPENDENCY:34, HUMAN_EXTERNAL:13});
const PHASE_ORDER = Object.freeze(['INTAKE','INTENT','RESEARCH','KNOWLEDGE_CANON','ARCHITECTURE','UNIT_DESIGN','DRAFT','MACRO_REVISION','DEVELOPMENTAL','LINE_STYLE','COPY','FACT_CITATION','RIGHTS','PROOF','PUBLICATION_BUILD','RELEASE','DISTRIBUTION','PRESERVATION','REENTRY_EDITION','SUBMISSION_HANDOFF']);
const PHASE_COUNTS = Object.freeze({INTAKE:41,INTENT:18,RESEARCH:11,KNOWLEDGE_CANON:11,ARCHITECTURE:11,UNIT_DESIGN:10,DRAFT:12,MACRO_REVISION:9,DEVELOPMENTAL:9,LINE_STYLE:9,COPY:9,FACT_CITATION:7,RIGHTS:5,PROOF:9,PUBLICATION_BUILD:28,RELEASE:8,DISTRIBUTION:3,PRESERVATION:8,REENTRY_EDITION:7,SUBMISSION_HANDOFF:2});
const LEGACY_COUNTS = Object.freeze({P00:10,P01:31,P02:9,P03:9,P04:11,P05:11,P06:11,P07:10,P08:12,P09:9,P10:9,P11:9,P12:11,P13:9,P14:9,P15:11,P16:11,P17:11,P18:9,P19:8,P20:7});
const CLASSES = new Set(Object.keys(EXPECTED_CLASS_TOTALS));
const PEERS = new Set(['CORE','LEARNING','BOOK','DOCUMENTS','SPREADSHEET_DATA','MEDIA','CONNECTED_ACTIONS','RESEARCH_KNOWLEDGE','PROGRAMMING']);
const COMPONENTS = new Set(Array.from({length:13},(_,i)=>`BOOK-COMP-${String(i+1).padStart(2,'0')}`));
const BUNDLES = new Set(['LIFECYCLE_CONTROL','CONTEXT_COMPILER','WORKFLOW_COORDINATION','CAPABILITY_ROUTING']);
const ROW_SCHEMA = ['source_id','frozen_phase_id','atomic_implementation_class','peer_dependencies','evidence_bundle_ids','human_external_kind_or_null'];

function fail(message) { console.error(`BOOK_LIFECYCLE_IMPLEMENTATION_BINDING_001_FAIL ${message}`); process.exit(1); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stable(value[key]);
    return out;
  }
  return value;
}
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex'); }
function same(a,b) { return JSON.stringify(a) === JSON.stringify(b); }
function git(...args) { return cp.execFileSync('git', args, {cwd:ROOT, encoding:'utf8'}).trim(); }
function phaseFor(sourceId) {
  const m = /^P(\d\d)-(\d\d)$/.exec(sourceId);
  if (!m) fail(`INVALID_SOURCE_ID ${sourceId}`);
  const p = Number(m[1]), n = Number(m[2]);
  if (p===0 || p===1) return 'INTAKE';
  if (p===2 || p===3) return 'INTENT';
  if (p===4) return 'RESEARCH';
  if (p===5) return 'KNOWLEDGE_CANON';
  if (p===6) return 'ARCHITECTURE';
  if (p===7) return 'UNIT_DESIGN';
  if (p===8) return 'DRAFT';
  if (p===9) return 'MACRO_REVISION';
  if (p===10) return 'DEVELOPMENTAL';
  if (p===11) return 'LINE_STYLE';
  if (p===12) return [1,2,3,4,5,7,8].includes(n) ? 'FACT_CITATION' : 'RIGHTS';
  if (p===13) return 'COPY';
  if (p===14) return 'PROOF';
  if (p===15) return 'PUBLICATION_BUILD';
  if (p===16) {
    if ([1,2,3,5,7,10].includes(n)) return 'PUBLICATION_BUILD';
    if (n===6) return 'RIGHTS';
    if ([8,11].includes(n)) return 'RELEASE';
    if ([4,9].includes(n)) return 'DISTRIBUTION';
  }
  if (p===17) return 'PUBLICATION_BUILD';
  if (p===18) {
    if ([1,2,3,4,8,9].includes(n)) return 'RELEASE';
    if (n===5) return 'DISTRIBUTION';
    if ([6,7].includes(n)) return 'SUBMISSION_HANDOFF';
  }
  if (p===19) return 'PRESERVATION';
  if (p===20) return 'REENTRY_EDITION';
  fail(`UNMAPPED_SOURCE_ID ${sourceId}`);
}

if (!fs.existsSync(BINDING_PATH) || !fs.existsSync(LIFECYCLE_PATH) || !fs.existsSync(ROWS_PATH)) fail('REQUIRED_FILE_MISSING');
const binding = JSON.parse(fs.readFileSync(BINDING_PATH,'utf8'));
const rows = JSON.parse(fs.readFileSync(ROWS_PATH,'utf8'));
const lifecycle = JSON.parse(fs.readFileSync(LIFECYCLE_PATH,'utf8'));

if (binding.artifact_id !== 'BOOK-LIFECYCLE-IMPLEMENTATION-BINDING-001') fail('ARTIFACT_ID');
if (binding.standing !== 'CURRENT_IMPLEMENTATION_BINDING__ALL_227_CONTROL_BOUND__ATOMIC_EXECUTION_INCOMPLETE') fail('STANDING');
if (binding.owner_path !== 'SYSTEM_MASTER/BOOK' || binding.current_authority_id !== 'CURRENT-AUTHORITY-005') fail('AUTHORITY_BINDING');
if (binding.baseline_repository_commit !== EXPECTED_BASELINE) fail('BASELINE_COMMIT');
try { git('cat-file','-e',`${EXPECTED_BASELINE}^{commit}`); git('merge-base','--is-ancestor',EXPECTED_BASELINE,'HEAD'); } catch { fail('BASELINE_NOT_ANCESTOR'); }
if (lifecycle.contract_id !== 'BOOK-LIFECYCLE-STATE-MACHINE-001' || lifecycle.macro_phase_count !== 20 || !same(lifecycle.phase_order, PHASE_ORDER)) fail('LIFECYCLE_CONTRACT_SHAPE');
if (binding.frozen_lifecycle_contract?.blob_sha !== EXPECTED_LIFECYCLE_BLOB) fail('DECLARED_LIFECYCLE_BLOB');
if (git('hash-object', path.relative(ROOT,LIFECYCLE_PATH)) !== EXPECTED_LIFECYCLE_BLOB) fail('CURRENT_LIFECYCLE_BLOB_DRIFT');
if (!same(binding.frozen_phase_order, PHASE_ORDER) || !same(binding.expected_projection_counts, PHASE_COUNTS)) fail('PHASE_DECLARATIONS');
if (!same(binding.classification_totals, EXPECTED_CLASS_TOTALS)) fail('DECLARED_CLASS_TOTALS');
if (!same(binding.row_schema, ROW_SCHEMA)) fail('ROW_SCHEMA');
if (binding.historical_source?.filename !== 'BOOKS_BUILD_READINESS_003.xlsx' || binding.historical_source?.row_count !== 227 || binding.historical_source?.sha256 !== EXPECTED_WORKBOOK_SHA256 || binding.historical_source?.requirement_set_sha256 !== EXPECTED_REQUIREMENT_SET_SHA256) fail('HISTORICAL_SOURCE_BINDING');
if (binding.binding_projection_sha256 !== EXPECTED_BINDING_PROJECTION || binding.rows_path !== 'qualification/book-system/lifecycle/BOOK-LIFECYCLE-IMPLEMENTATION-BINDING-001.rows.json' || binding.row_count !== 227) fail('DECLARED_BINDING_PROJECTION');
if (!Array.isArray(rows) || rows.length !== 227 || digest(rows) !== EXPECTED_BINDING_PROJECTION) fail('ROW_PROJECTION_DIGEST');

for (const phase of PHASE_ORDER) {
  const comps = binding.phase_component_bindings?.[phase];
  if (!Array.isArray(comps) || comps.length===0 || comps.some(x=>!COMPONENTS.has(x))) fail(`PHASE_COMPONENT_BINDING ${phase}`);
}
for (const [bundleId, refs] of Object.entries(binding.evidence_bundles||{})) {
  if (!BUNDLES.has(bundleId) || !Array.isArray(refs) || refs.length===0 || refs.some(x=>typeof x!=='string' || !x)) fail(`EVIDENCE_BUNDLE ${bundleId}`);
}
for (const requiredBundle of BUNDLES) if (!Object.prototype.hasOwnProperty.call(binding.evidence_bundles||{},requiredBundle)) fail(`MISSING_EVIDENCE_BUNDLE ${requiredBundle}`);

const expectedIds=[];
for (const [legacy,count] of Object.entries(LEGACY_COUNTS)) for (let i=1;i<=count;i++) expectedIds.push(`${legacy}-${String(i).padStart(2,'0')}`);
const ids=rows.map(r=>r[0]);
if (new Set(ids).size!==227 || !same([...ids].sort(),[...expectedIds].sort())) fail('SOURCE_ID_COVERAGE');

const classTotals=Object.fromEntries(Object.keys(EXPECTED_CLASS_TOTALS).map(k=>[k,0]));
const phaseTotals=Object.fromEntries(PHASE_ORDER.map(p=>[p,0]));
for (const row of rows) {
  if (!Array.isArray(row) || row.length!==6) fail('ROW_SHAPE');
  const [sourceId, phase, cls, peers, evidenceBundles, humanKind] = row;
  if (phase !== phaseFor(sourceId)) fail(`FROZEN_PHASE_MAPPING ${sourceId}`);
  if (!CLASSES.has(cls)) fail(`IMPLEMENTATION_CLASS ${sourceId}`);
  if (!Array.isArray(peers) || peers.some(x=>!PEERS.has(x))) fail(`PEERS ${sourceId}`);
  if (!Array.isArray(evidenceBundles) || evidenceBundles.some(x=>!BUNDLES.has(x))) fail(`EVIDENCE_BUNDLES ${sourceId}`);
  if (JSON.stringify(row).includes('PROSE')) fail(`RETIRED_PROSE_ROW ${sourceId}`);
  if (cls==='IMPLEMENTED' && evidenceBundles.length===0) fail(`IMPLEMENTED_WITHOUT_EVIDENCE ${sourceId}`);
  if (cls==='PARTIAL' && evidenceBundles.length===0) fail(`PARTIAL_WITHOUT_EVIDENCE ${sourceId}`);
  if (cls==='PEER_DEPENDENCY' && !peers.some(x=>x!=='BOOK')) fail(`PEER_DEPENDENCY_WITHOUT_PEER ${sourceId}`);
  if (cls==='HUMAN_EXTERNAL' && (typeof humanKind!=='string' || !humanKind)) fail(`HUMAN_EXTERNAL_KIND ${sourceId}`);
  if (cls!=='HUMAN_EXTERNAL' && humanKind!==null) fail(`UNEXPECTED_HUMAN_KIND ${sourceId}`);
  classTotals[cls] += 1; phaseTotals[phase] += 1;
}
if (!same(classTotals, EXPECTED_CLASS_TOTALS) || !same(phaseTotals, PHASE_COUNTS)) fail('RECOMPUTED_TOTALS');
for (const phase of PHASE_ORDER) {
  const declared=binding.phase_gap_summary?.[phase];
  if (!declared || declared.total!==PHASE_COUNTS[phase]) fail(`PHASE_SUMMARY_TOTAL ${phase}`);
  for (const cls of Object.keys(EXPECTED_CLASS_TOTALS)) {
    const recomputed=rows.filter(r=>r[1]===phase && r[2]===cls).length;
    if (declared[cls]!==recomputed) fail(`PHASE_SUMMARY_CLASS ${phase}:${cls}`);
  }
}
if (binding.selected_program_objective_preserved?.objective_id!=='BOOK-ENG-009-SEMANTIC-RECOVERY-PROFILE-001' || binding.selected_program_objective_preserved?.component_id!=='BOOK-COMP-12') fail('PROGRAM_OBJECTIVE_PRESERVATION');

console.log(`BOOK_LIFECYCLE_IMPLEMENTATION_BINDING_001_PASS rows=227 implemented=${classTotals.IMPLEMENTED} partial=${classTotals.PARTIAL} unimplemented=${classTotals.UNIMPLEMENTED} peer_dependency=${classTotals.PEER_DEPENDENCY} human_external=${classTotals.HUMAN_EXTERNAL}`);
