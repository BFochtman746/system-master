'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'qualification-output', 'p00-foundation-1.0.json');

const EXPECTED = Object.freeze({
  authorityId: 'CURRENT-AUTHORITY-005',
  topologyId: 'SYSTEM-TOPOLOGY-007',
  allocationId: 'SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006',
  crosswalkId: 'SYSTEM-MASTER-CAPABILITY-CROSSWALK-003',
  owner: 'SYSTEM_MASTER/CORE'
});

const PATHS = Object.freeze({
  authority: 'governance/CURRENT-AUTHORITY.json',
  census: 'governance/census/SYSTEM-MASTER-FOUNDATION-CLOSURE-CENSUS-001.json',
  contract: 'governance/contracts/P00-FOUNDATION-CONTRACT-001.md',
  validateGovernance: '.github/scripts/validate-governance.js',
  systemBrief: '.github/scripts/system-brief.js',
  script: '.github/scripts/p00-authority-pointer-foundation-qualify.js',
  workflow: '.github/workflows/p00-authority-pointer-foundation-qualification.yml'
});

const EXPECTED_PEERS = [
  'CORE', 'LEARNING', 'BOOK', 'DOCUMENTS', 'SPREADSHEET_DATA',
  'MEDIA', 'CONNECTED_ACTIONS', 'RESEARCH_KNOWLEDGE', 'PROGRAMMING'
];

function abs(rel) { return path.join(ROOT, rel); }
function exists(rel) { return Boolean(rel) && fs.existsSync(abs(rel)); }
function readJson(rel) { return JSON.parse(fs.readFileSync(abs(rel), 'utf8')); }
function fail(code, detail = '') { throw new Error(`${code}${detail ? ` detail=${detail}` : ''}`); }
function assert(condition, code, detail = '') { if (!condition) fail(code, detail); }
function git(...args) { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); }
function blob(rel) { return git('rev-parse', `HEAD:${rel}`); }
function sorted(values) { return [...values].sort(); }
function sameSet(a, b) { return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b)); }
function sha256File(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function runAcceptanceTarget(rel, logFile) {
  let output;
  try {
    output = execFileSync(process.execPath, [abs(rel)], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (error) {
    const stderr = String(error.stderr || '').trim().replace(/\s+/g, ' ').slice(0, 500);
    fail('P00_ACCEPTANCE_TARGET_FAILED', `${rel}${stderr ? `:${stderr}` : ''}`);
  }
  assert(output.trim().length > 0, 'P00_ACCEPTANCE_LOG_EMPTY', rel);
  fs.writeFileSync(logFile, output.endsWith('\n') ? output : `${output}\n`, 'utf8');
}

function main() {
  const authority = readJson(PATHS.authority);
  const census = readJson(PATHS.census);

  assert(authority.authority_id === EXPECTED.authorityId, 'P00_AUTHORITY_ID', authority.authority_id);
  assert(census.current_authority_id === EXPECTED.authorityId, 'P00_CENSUS_AUTHORITY', census.current_authority_id);
  assert(authority.topology === census.current_topology_ref, 'P00_TOPOLOGY_POINTER_CENSUS_MISMATCH');
  assert(authority.headless_tool_owner_allocation === census.current_owner_allocation_ref, 'P00_ALLOCATION_POINTER_CENSUS_MISMATCH');
  assert(authority.capability_crosswalk === census.current_capability_crosswalk_ref, 'P00_CROSSWALK_POINTER_CENSUS_MISMATCH');

  for (const [name, rel] of Object.entries({
    topology: authority.topology,
    allocation: authority.headless_tool_owner_allocation,
    crosswalk: authority.capability_crosswalk,
    obligation_registry: authority.obligation_registry,
    completion: authority.system_completion_status
  })) assert(exists(rel), 'P00_SELECTED_POINTER_ABSENT', `${name}:${rel}`);

  const topology = readJson(authority.topology);
  const allocation = readJson(authority.headless_tool_owner_allocation);
  const crosswalk = readJson(authority.capability_crosswalk);
  const obligation = readJson(authority.obligation_registry);

  assert(topology.topology_id === EXPECTED.topologyId, 'P00_TOPOLOGY_ID', topology.topology_id);
  assert(allocation.allocation_id === EXPECTED.allocationId, 'P00_ALLOCATION_ID', allocation.allocation_id);
  assert(crosswalk.crosswalk_id === EXPECTED.crosswalkId, 'P00_CROSSWALK_ID', crosswalk.crosswalk_id);
  assert(census.current_topology_id === EXPECTED.topologyId, 'P00_CENSUS_TOPOLOGY_ID');
  assert(census.current_owner_allocation_id === EXPECTED.allocationId, 'P00_CENSUS_ALLOCATION_ID');
  assert(census.current_capability_crosswalk_id === EXPECTED.crosswalkId, 'P00_CENSUS_CROSSWALK_ID');
  assert(sameSet(topology.peer_system_ids || [], EXPECTED_PEERS), 'P00_NINE_PEER_SET');
  assert(sameSet(topology.execution_readiness?.execution_ready_peer_system_ids || [], EXPECTED_PEERS), 'P00_EXECUTION_READY_PEER_SET');

  const programming = (topology.canonical_internal_systems || []).find((row) => row.system_id === 'PROGRAMMING');
  assert(programming && (programming.owns_modules || []).includes('WEBSITE_BUILDING'), 'P00_PROGRAMMING_C40_OWNERSHIP');
  assert(topology.explicit_non_systems?.WEBSITE_BUILDING === 'PROGRAMMING_CAPABILITY_NOT_PEER_SYSTEM', 'P00_WEBSITE_BUILDING_NOT_PEER');
  const prose = (topology.retired_systems || []).find((row) => row.system_id === 'PROSE');
  assert(prose?.lifecycle === 'RETIRED_TERMINAL' && prose.current_execution_lane === null, 'P00_PROSE_TERMINAL_RETIREMENT');

  const p00 = (crosswalk.platform_requirements || []).find((row) => row.platform_id === 'P00');
  assert(p00?.owner_path === EXPECTED.owner && p00?.disposition === 'OWED', 'P00_CROSSWALK_BINDING');
  assert(typeof obligation.registry_id === 'string' || Array.isArray(obligation.obligations), 'P00_OBLIGATION_REGISTRY_SHAPE');

  const contract = fs.readFileSync(abs(PATHS.contract), 'utf8');
  for (const required of [
    'CURRENT-AUTHORITY-005',
    'SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json',
    'FOUNDATION-CLOSURE-EVIDENCE-REGISTRY-001.json',
    'A previous run, previous authority, or previous subject blob is not transferable PASS.'
  ]) assert(contract.includes(required), 'P00_CONTRACT_REQUIRED_BINDING', required);
  for (const forbidden of [
    'SYSTEM-MASTER-CAPABILITY-CROSSWALK-001.json',
    'CURRENT-AUTHORITY-004',
    'WORK-OBLIGATION-REGISTRY-013.json'
  ]) assert(!contract.includes(forbidden), 'P00_CONTRACT_STALE_BINDING', forbidden);
  for (let section = 1; section <= 9; section += 1) {
    assert(new RegExp(`^##\\s+${section}\\.`, 'm').test(contract), 'P00_CONTRACT_SECTION_ABSENT', String(section));
  }

  const subjectSha = git('rev-parse', 'HEAD');
  if (process.env.P00_SUBJECT_SHA) {
    assert(process.env.P00_SUBJECT_SHA === subjectSha, 'P00_SUBJECT_SHA_ENV_MISMATCH', `${process.env.P00_SUBJECT_SHA}:${subjectSha}`);
  }

  const subjectPaths = [
    PATHS.authority,
    PATHS.contract,
    authority.topology,
    authority.headless_tool_owner_allocation,
    authority.capability_crosswalk,
    authority.obligation_registry,
    PATHS.census,
    PATHS.validateGovernance,
    PATHS.systemBrief,
    PATHS.script,
    PATHS.workflow
  ];
  for (const rel of subjectPaths) assert(exists(rel), 'P00_SUBJECT_ABSENT', rel);

  const logFiles = {
    validate_governance_sha256: '/tmp/p00-validate-governance.log',
    system_brief_sha256: '/tmp/p00-system-brief.log'
  };
  runAcceptanceTarget(PATHS.validateGovernance, logFiles.validate_governance_sha256);
  runAcceptanceTarget(PATHS.systemBrief, logFiles.system_brief_sha256);

  const result = {
    evidence_schema: '2.0',
    qualification_id: 'P00-AUTHORITY-POINTER-FOUNDATION-QUALIFICATION-003',
    contract_id: 'P00-FOUNDATION-1.0',
    requirement_or_capability_id: 'P00',
    owner_path: EXPECTED.owner,
    authority_id: authority.authority_id,
    topology_id: topology.topology_id,
    allocation_id: allocation.allocation_id,
    crosswalk_id: crosswalk.crosswalk_id,
    obligation_registry: authority.obligation_registry,
    status: 'PASS',
    subject_sha: subjectSha,
    subjects: subjectPaths.map((rel) => ({ path: rel, git_blob_sha: blob(rel) })),
    logs: Object.fromEntries(Object.entries(logFiles).map(([key, file]) => [key, sha256File(file)])),
    assertions: {
      canonical_selector: 'PASS',
      current_authority_inputs: 'PASS',
      nine_peer_topology: 'PASS',
      programming_owns_website_building_c40: 'PASS',
      prose_terminal_retirement: 'PASS',
      p00_contract_current_bindings: 'PASS',
      acceptance_targets_self_contained: 'PASS',
      historical_receipt_relabeling: false
    }
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`P00_FOUNDATION_QUALIFICATION=PASS subject_sha=${subjectSha} authority=${authority.authority_id} topology=${topology.topology_id}\n`);
}

try { main(); }
catch (error) {
  process.stderr.write(`P00_FOUNDATION_QUALIFICATION=FAIL ${error.message}\n`);
  process.exit(2);
}
