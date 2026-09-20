'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const AUTHORITY_REL = 'governance/CURRENT-AUTHORITY.json';
const BASE_REL = 'governance/contracts/CAPABILITY-FOUNDATION-CONTRACT-BASE-001.md';
const CONTRACT_DIR = 'governance/contracts';
const PLACEHOLDER = /\b(UNPOPULATED|TBD|TO BE DETERMINED)\b|<UNSET>/i;
const SECTION_RE = /^##\s+([1-9])\.\s+(.+)$/gm;

function readJson(rel) { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }
function fail(code, detail) {
  process.stderr.write(`FOUNDATION_CAPABILITY_SPEC=FAIL code=${code}${detail ? ` detail=${detail}` : ''}\n`);
  process.exit(2);
}
function sectionBodies(text) {
  const matches = [...text.matchAll(SECTION_RE)];
  const out = new Map();
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    out.set(Number(matches[i][1]), text.slice(start, end).trim());
  }
  return out;
}
function slug(moduleKey) { return moduleKey.toLowerCase().replaceAll('_', '-'); }
function requireAll(failures, moduleKey, code, text, needles) {
  if (needles.some((needle) => !text.includes(needle))) failures.push(`${moduleKey}:${code}`);
}
function validateSpecializedContract(entry, text, sections, failures) {
  if (entry.module_key === 'CHAT') {
    requireAll(failures, 'CHAT', 'SPECIALIZED_IDENTITY_INCOMPLETE', text, [
      'C04',
      'SYSTEM-MASTER-DEVELOPMENT-RESPONSE-GOVERNOR-001'
    ]);
    requireAll(failures, 'CHAT', 'SPECIALIZED_WRITER_RULE_INCOMPLETE', sections.get(4) || '', [
      'canonical durable definition',
      'second canonical project-state writer'
    ]);
    requireAll(failures, 'CHAT', 'SPECIALIZED_DEPENDENCY_BASELINE_INCOMPLETE', sections.get(5) || '', [
      'governance/CURRENT-AUTHORITY.json',
      'control-gateway/src/github-mutation-admission.js',
      'control-gateway/src/a01-supervisor-handoff.js'
    ]);
    const s6 = sections.get(6) || '';
    if (!/fail-closed/i.test(s6) || !/idempotent/i.test(s6)) failures.push('CHAT:SPECIALIZED_FAILURE_IDEMPOTENCY_INCOMPLETE');
    requireAll(failures, 'CHAT', 'SPECIALIZED_EVIDENCE_TARGET_INCOMPLETE', sections.get(7) || '', [
      'control-gateway/src/development-response-governor.js',
      'control-gateway/src/governed-execution-admission.js',
      '.github/scripts/development-response-governor-qualify.js'
    ]);
    requireAll(failures, 'CHAT', 'SPECIALIZED_ACCEPTANCE_COMMAND_INCOMPLETE', sections.get(8) || '', [
      'node --test',
      'node .github/scripts/development-response-governor-qualify.js'
    ]);
    if (!(sections.get(9) || '').includes('C04/CORE')) failures.push('CHAT:SPECIALIZED_OWNER_BOUNDARY_MISSING');
    return true;
  }

  if (entry.module_key === 'EXPECTATION') {
    requireAll(failures, 'EXPECTATION', 'SPECIALIZED_IDENTITY_INCOMPLETE', text, [
      'C11',
      'RESPONSE-EXPECTATION-ENGINE-001'
    ]);
    requireAll(failures, 'EXPECTATION', 'SPECIALIZED_WRITER_RULE_INCOMPLETE', sections.get(4) || '', [
      'no new canonical state writer',
      'control-gateway/src/response-expectation-engine.js'
    ]);
    requireAll(failures, 'EXPECTATION', 'SPECIALIZED_DEPENDENCY_BASELINE_INCOMPLETE', sections.get(5) || '', [
      'control-gateway/src/response-expectation-engine.js',
      'control-gateway/src/development-response-governor.js',
      'verify.sh'
    ]);
    const s6 = sections.get(6) || '';
    if (!/fail-closed/i.test(s6) || !/deterministic/i.test(s6) || !/idempotent/i.test(s6)) failures.push('EXPECTATION:SPECIALIZED_FAILURE_IDEMPOTENCY_INCOMPLETE');
    requireAll(failures, 'EXPECTATION', 'SPECIALIZED_EVIDENCE_TARGET_INCOMPLETE', sections.get(7) || '', [
      '.github/scripts/response-expectation-engine-qualify.js',
      'development-response-governor-qualify.js',
      'verify.sh'
    ]);
    requireAll(failures, 'EXPECTATION', 'SPECIALIZED_ACCEPTANCE_COMMAND_INCOMPLETE', sections.get(8) || '', [
      'node .github/scripts/response-expectation-engine-qualify.js',
      'bash ./verify.sh'
    ]);
    if (!(sections.get(9) || '').includes('C11/CORE')) failures.push('EXPECTATION:SPECIALIZED_OWNER_BOUNDARY_MISSING');
    return true;
  }

  return false;
}

const authority = readJson(AUTHORITY_REL);
if (!authority.capability_crosswalk) fail('CROSSWALK_POINTER_ABSENT');
const crosswalk = readJson(authority.capability_crosswalk);
if (!fs.existsSync(path.join(ROOT, BASE_REL))) fail('BASE_CONTRACT_ABSENT');

const target = process.argv[2] ? process.argv[2].toUpperCase() : null;
const owned = (crosswalk.capability_entries || []).filter((e) =>
  e.owner_path && !String(e.disposition || '').startsWith('EXPLICITLY_OUT_OF_SCOPE') && e.disposition !== 'RESERVED_UNALLOCATED'
);
const rows = target ? owned.filter((e) => e.module_key === target) : owned;
if (!rows.length) fail('UNKNOWN_OR_NONPROGRAMMED_CAPABILITY', target || 'ALL');

const failures = [];
for (const entry of rows) {
  const rel = `${CONTRACT_DIR}/${entry.module_key}-FOUNDATION-CONTRACT-001.md`;
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { failures.push(`${entry.module_key}:CONTRACT_ABSENT`); continue; }
  const text = fs.readFileSync(abs, 'utf8');
  const sections = sectionBodies(text);
  if (PLACEHOLDER.test(text)) failures.push(`${entry.module_key}:PLACEHOLDER_PRESENT`);
  if (!text.includes(`**Owner** \`${entry.owner_path}\``)) failures.push(`${entry.module_key}:OWNER_MISMATCH`);
  if (!text.includes('`governance/CURRENT-AUTHORITY.json`')) failures.push(`${entry.module_key}:AUTHORITY_SELECTOR_MISSING`);
  for (let n = 1; n <= 9; n++) {
    if (!sections.has(n) || !sections.get(n)) failures.push(`${entry.module_key}:SECTION_${n}_EMPTY`);
  }

  if (validateSpecializedContract(entry, text, sections, failures)) continue;

  if (!text.includes(`**Capability** \`${entry.capability_id}\``)) failures.push(`${entry.module_key}:CAPABILITY_ID_MISMATCH`);
  if (!text.includes(`\`${authority.capability_crosswalk}\``)) failures.push(`${entry.module_key}:CURRENT_CROSSWALK_MISSING`);
  const s4 = sections.get(4) || '';
  if (!s4.includes('Canonical semantic writer:') || !s4.includes('Physical persistence:')) failures.push(`${entry.module_key}:WRITER_RULE_INCOMPLETE`);
  const s5 = sections.get(5) || '';
  if (!s5.includes('P00') || !s5.includes('P12') || !s5.includes('P15')) failures.push(`${entry.module_key}:PLATFORM_BASELINE_MISSING`);
  const s6 = sections.get(6) || '';
  if (!/Fail closed/i.test(s6) || !s6.includes('idempotency_key')) failures.push(`${entry.module_key}:FAILURE_IDEMPOTENCY_INCOMPLETE`);
  const expectedEvidence = `qualification/foundation/${slug(entry.module_key)}-foundation-001.json`;
  if (!(sections.get(7) || '').includes(expectedEvidence)) failures.push(`${entry.module_key}:EVIDENCE_TARGET_MISMATCH`);
  const expectedSpec = `node .github/scripts/foundation-capability-contract-spec-check.js ${entry.module_key}`;
  const expectedAcceptance = `node .github/scripts/foundation-capability-acceptance.js ${entry.module_key}`;
  const s8 = sections.get(8) || '';
  if (!s8.includes(expectedSpec) || !s8.includes(expectedAcceptance)) failures.push(`${entry.module_key}:ACCEPTANCE_COMMAND_MISMATCH`);
  if (!(sections.get(9) || '').includes(`\`${entry.owner_path}\``)) failures.push(`${entry.module_key}:OWNER_BOUNDARY_MISSING`);
}
if (failures.length) fail('CONTRACT_SPEC_INCOMPLETE', failures.join(','));
process.stdout.write(`FOUNDATION_CAPABILITY_SPEC=PASS count=${rows.length} inventory=${authority.capability_crosswalk}\n`);
