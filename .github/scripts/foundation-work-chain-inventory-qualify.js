'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.env.GITHUB_WORKSPACE || process.cwd();
const ownerBase = '8308c2861e0bc9a95f7cae9531a68b365f4014c2';
const inventoryPath = path.join(root, 'system-master', 'foundation-spine', 'work-chain', 'WORK-CHAIN-RECOVERY-INVENTORY-001.md');

function fail(message) { throw new Error(message); }
function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', shell: false, windowsHide: true });
  if (r.error || r.status !== 0) fail(`${cmd} ${args.join(' ')} failed: ${r.error ? r.error.message : `exit ${r.status}`}\n${r.stdout || ''}${r.stderr || ''}`);
  return (r.stdout || '').trim();
}
function readJson(rel) { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); }

try {
  const subject = run('git', ['rev-parse', 'HEAD']);
  run('git', ['merge-base', '--is-ancestor', ownerBase, 'HEAD']);
  if (!fs.existsSync(inventoryPath)) fail('inventory missing');
  const inventory = fs.readFileSync(inventoryPath, 'utf8');

  const tableIds = [...inventory.matchAll(/^\| (F-RQ-\d{3}) \|/gm)].map(m => m[1]);
  if (tableIds.length !== 60) fail(`inventory table denominator ${tableIds.length} != 60`);
  const uniqueTable = new Set(tableIds);
  if (uniqueTable.size !== 60) fail('duplicate F-RQ rows in inventory table');
  for (let i = 1; i <= 60; i++) {
    const id = `F-RQ-${String(i).padStart(3, '0')}`;
    if (!uniqueTable.has(id)) fail(`missing inventory row ${id}`);
  }

  const declared = new Set();
  for (let p = 2; p <= 12; p++) {
    const pkg = `system-master/f-wp-${String(p).padStart(3, '0')}/control/REQUIREMENTS.json`;
    const data = readJson(pkg);
    if (!Array.isArray(data.requirements)) fail(`${pkg} requirements missing`);
    for (const req of data.requirements) {
      if (!/^F-RQ-\d{3}$/.test(req.id)) fail(`${pkg} bad id ${req.id}`);
      if (declared.has(req.id)) fail(`duplicate source requirement ${req.id}`);
      declared.add(req.id);
    }
  }
  const fwp001Manifest = readJson('system-master/f-wp-001/control/SOURCE-SLICE-MANIFEST.json');
  for (const id of fwp001Manifest.atomic_requirement_ids || []) {
    if (declared.has(id)) fail(`duplicate source requirement ${id}`);
    declared.add(id);
  }
  if (declared.size !== 60) fail(`source requirement denominator ${declared.size} != 60`);
  for (const id of uniqueTable) if (!declared.has(id)) fail(`inventory id not sourced ${id}`);

  const requiredPhrases = [
    'Requirements authorized for direct semantic owner transfer to a fresh Foundation component: **0**',
    'Unaccounted historical F-WP IDs: **0**',
    'Historical F-WP qualification is donor provenance and is not transferred',
    'A-01 target execution',
    'native behavior',
    'production admission',
    'CORE-WORK-PROJECT-RECOVERY-INVENTORY-001',
    'Governed Goal / Intent',
    'Work / Project',
    'Capability Route',
    'Durable Job',
    'Effect Receipt',
    '| Completion |',
    '| Recovery |'
  ];
  for (const phrase of requiredPhrases) if (!inventory.includes(phrase)) fail(`missing required phrase: ${phrase}`);

  const stageRows = [...inventory.matchAll(/^\| (Governed Goal \/ Intent|Work \/ Project|Plan \/ Step|Policy Decision Set|Provisional Admission|Capability Route|Resource Grant|Assignment \/ Placement|Durable Job|Attempt \/ Fence|Context|Invocation|Effect Receipt|Resulting State \/ Artifact|Evidence|Completion|Recovery|Transport \/ Delivery) \|/gm)].map(m => m[1]);
  if (new Set(stageRows).size !== 18) fail(`canonical stage coverage ${new Set(stageRows).size} != 18`);

  const keelFreeze = fs.readFileSync(path.join(root, 'system-master', 'foundation-spine', 'keel', 'KEEL-FREEZE-001.md'), 'utf8');
  if (!keelFreeze.includes('32/32 bounded Keel invariants with zero unaccounted rows')) fail('fresh Keel freeze not bound');
  if (!keelFreeze.includes('CORE-WORK-CHAIN-RECOVERY-INVENTORY-001')) fail('Keel successor does not bind this operation');

  const result = {
    subject,
    owner_base: ownerBase,
    operation: 'CORE-WORK-CHAIN-RECOVERY-INVENTORY-001',
    recovered_historical_requirement_count: 60,
    recovered_historical_requirement_unaccounted: 0,
    canonical_stage_count: 18,
    direct_semantic_owner_transfers_authorized: 0,
    standing: 'RECOVERY_INVENTORY_QUALIFIED__DOWNSTREAM_DESIGN_LOCK_BLOCKED_PENDING_OWNER_RECOVERY',
    a01_native_production: 'NOT_CLAIMED',
    result: 'PASS'
  };
  console.log(JSON.stringify(result));
  console.log('PASS FOUNDATION_WORK_CHAIN_RECOVERY_INVENTORY requirements=60 stages=18 unaccounted=0');
} catch (e) {
  console.error(e && e.stack ? e.stack : String(e));
  process.exit(1);
}
