'use strict';

const fs = require('fs');
const path = require('path');

function fail(message) {
  console.error(`SYSTEM_CONTROL_DRIFT_ERROR: ${message}`);
  process.exit(1);
}

const policyRoot = process.env.SYSTEM_POLICY_ROOT;
const subjectRoot = process.env.SYSTEM_CONTROL_SUBJECT_ROOT;
const branch = process.env.SYSTEM_CONTROL_BRANCH;
if (!policyRoot || !subjectRoot || !branch) fail('SYSTEM_POLICY_ROOT, SYSTEM_CONTROL_SUBJECT_ROOT and SYSTEM_CONTROL_BRANCH are required');

const topology = JSON.parse(fs.readFileSync(path.join(policyRoot, 'governance', 'SYSTEM-TOPOLOGY-001.json'), 'utf8'));
const expectedByBranch = Object.fromEntries((topology.systems || []).map((entry) => [entry.control_ref, entry]));
const system = expectedByBranch[branch];
if (!system) fail(`branch ${branch} is not a canonical system control ref`);

const recordPath = path.join(subjectRoot, ...system.control_record.split('/'));
if (!fs.existsSync(recordPath)) fail(`${system.system_id} control record missing at ${system.control_record}`);

const raw = fs.readFileSync(recordPath, 'utf8');

if (recordPath.endsWith('.json')) {
  let data;
  try { data = JSON.parse(raw); } catch (error) { fail(`${system.system_id} control record is invalid JSON: ${error.message}`); }
  if (system.system_id === 'BOOK') {
    const parent = data.parent_system || {};
    if (parent.system_id !== 'BOOK') fail('BOOK hierarchy must declare parent_system.system_id=BOOK');
    const prose = (data.child_systems || []).find((entry) => entry.system_id === 'PROSE');
    if (!prose || prose.parent_system_id !== 'BOOK') fail('BOOK hierarchy must bind PROSE as child of BOOK');
  } else if (system.system_id === 'PROSE') {
    const proseSystem = data.system || {};
    const parent = data.parent || {};
    if (proseSystem.system_id !== 'PROSE') fail('PROSE binding must declare system.system_id=PROSE');
    if (parent.system_id !== 'BOOK') fail('PROSE binding must declare parent.system_id=BOOK');
    if (data.standing && !String(data.standing).includes('CANONICAL')) fail('PROSE parent binding must remain canonical');
  }
} else {
  const upper = raw.toUpperCase();
  if (system.system_id === 'MASTER') {
    if (!upper.includes('PRIMARY MASTER SYSTEM CONTROL AUTHORITY')) fail('MASTER record must identify itself as primary MASTER system control authority');
    if (!upper.includes('DOES **NOT** OWN THE LEARNING SYSTEM') && !upper.includes('DOES NOT OWN THE LEARNING SYSTEM')) fail('MASTER record must preserve peer-system non-ownership boundary');
  } else if (system.system_id === 'LEARNING') {
    if (!upper.includes('PRIMARY LEARNING CONTROL AUTHORITY')) fail('LEARNING record must identify itself as primary Learning control authority');
    if (!upper.includes('EXACTLY FOUR CANONICAL SYSTEMS')) fail('LEARNING record must preserve four-system topology boundary');
  }
}

console.log('SYSTEM_CONTROL_DRIFT_PASS');
console.log(`system_id=${system.system_id}`);
console.log(`branch=${branch}`);
console.log(`control_record=${system.control_record}`);
