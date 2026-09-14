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

// The selected topology is whatever governance/CURRENT-AUTHORITY.json points at.
// Hardcoding a version here is what let this validator enforce retired topology 002
// while authority had already moved to 005.
const authorityPath = path.join(policyRoot, 'governance', 'CURRENT-AUTHORITY.json');
if (!fs.existsSync(authorityPath)) fail('governance/CURRENT-AUTHORITY.json missing from policy root');
let authority;
try {
  authority = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
} catch (error) {
  fail(`CURRENT-AUTHORITY.json is invalid JSON: ${error.message}`);
}
if (!authority.topology) fail('CURRENT-AUTHORITY.json does not select a topology');
const topologyPath = path.join(policyRoot, ...authority.topology.split('/'));
if (!fs.existsSync(topologyPath)) fail(`selected topology missing at ${authority.topology}`);
let topology;
try {
  topology = JSON.parse(fs.readFileSync(topologyPath, 'utf8'));
} catch (error) {
  fail(`${authority.topology} is invalid JSON: ${error.message}`);
}
if ((topology.product_root || {}).product_id !== 'SYSTEM_MASTER') fail('policy topology must declare SYSTEM_MASTER product root');
const expectedByBranch = Object.fromEntries((topology.canonical_internal_systems || []).map((entry) => [entry.control_ref, entry]));
const system = expectedByBranch[branch];
if (!system) fail(`branch ${branch} is not a canonical internal-system control ref`);

const recordPath = path.join(subjectRoot, ...system.control_record.split('/'));
if (!fs.existsSync(recordPath)) fail(`${system.system_id} control record missing at ${system.control_record}`);

const raw = fs.readFileSync(recordPath, 'utf8');

if (recordPath.endsWith('.json')) {
  let data;
  try { data = JSON.parse(raw); } catch (error) { fail(`${system.system_id} control record is invalid JSON: ${error.message}`); }
  if (system.system_id === 'BOOK') {
    if (data.owner_path !== 'SYSTEM_MASTER/BOOK') fail('BOOK control must declare owner_path=SYSTEM_MASTER/BOOK');
    if ((data.parent_product || {}).product_id !== 'SYSTEM_MASTER') fail('BOOK control must bind parent product SYSTEM_MASTER');
    if ((data.book_system || {}).system_id !== 'BOOK') fail('BOOK control must declare book_system.system_id=BOOK');
    const prose = (data.child_systems || []).find((entry) => entry.system_id === 'PROSE');
    if (!prose || prose.owner_path !== 'SYSTEM_MASTER/BOOK/PROSE') fail('BOOK control must bind PROSE at SYSTEM_MASTER/BOOK/PROSE');
  } else if (system.system_id === 'PROSE') {
    if (data.owner_path !== 'SYSTEM_MASTER/BOOK/PROSE') fail('PROSE control must declare owner_path=SYSTEM_MASTER/BOOK/PROSE');
    if ((data.system || {}).system_id !== 'PROSE') fail('PROSE control must declare system.system_id=PROSE');
    if ((data.parent || {}).system_id !== 'BOOK') fail('PROSE control must declare parent.system_id=BOOK');
    if ((data.root_product || {}).product_id !== 'SYSTEM_MASTER') fail('PROSE control must declare root_product SYSTEM_MASTER');
  }
} else {
  const upper = raw.toUpperCase();
  if (system.system_id === 'CORE') {
    if (!upper.includes('PRIMARY CORE CONTROL AUTHORITY')) fail('CORE record must identify itself as primary Core control authority');
    if (!upper.includes('OWNER PATH: `SYSTEM_MASTER/CORE`')) fail('CORE record must bind owner path SYSTEM_MASTER/CORE');
    if (!upper.includes('PARENT PRODUCT: `SYSTEM_MASTER`')) fail('CORE record must bind parent product SYSTEM_MASTER');
  } else if (system.system_id === 'LEARNING') {
    if (!upper.includes('PRIMARY LEARNING CONTROL AUTHORITY')) fail('LEARNING record must identify itself as primary Learning control authority');
    if (!upper.includes('OWNER PATH: `SYSTEM_MASTER/LEARNING`')) fail('LEARNING record must bind owner path SYSTEM_MASTER/LEARNING');
    if (!upper.includes('PARENT PRODUCT: `SYSTEM_MASTER`')) fail('LEARNING record must bind parent product SYSTEM_MASTER');
  }
}

console.log('SYSTEM_CONTROL_DRIFT_PASS');
console.log('product_root=SYSTEM_MASTER');
console.log(`system_id=${system.system_id}`);
console.log(`owner_path=${system.parent_id === 'BOOK' ? 'SYSTEM_MASTER/BOOK/' + system.system_id : 'SYSTEM_MASTER/' + system.system_id}`);
console.log(`branch=${branch}`);
console.log(`control_record=${system.control_record}`);
