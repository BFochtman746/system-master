'use strict';

/**
 * lane-brief.js — emit a ready-to-paste ChatGPT brief for one owner lane.
 *
 * Hand-maintained lane templates drift the moment ownership changes. This reads
 * the ratified allocation registry and obligation registry through
 * CURRENT-AUTHORITY, so a lane brief cannot disagree with the state of record.
 *
 *   node .github/scripts/lane-brief.js --list
 *   node .github/scripts/lane-brief.js --lane MEDIA
 *   node .github/scripts/lane-brief.js --lane CORE --obligation FOUNDATION-1-0-CLOSURE-001
 *   node .github/scripts/lane-brief.js --lane BOOK --fast-lane --out brief-book.md
 *
 * Exit codes: 0 ok, 1 unknown lane, 2 authority unreadable.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const AUTHORITY = 'governance/CURRENT-AUTHORITY.json';
const CONTRACT = 'governance/CHATGPT-OPERATING-CONTRACT-002.md';
const DECISION_RIGHTS = 'governance/DECISION-RIGHTS-001.md';

// Piping to head/less closes stdout early; that is normal shell use, not an error.
process.stdout.on('error', (error) => { if (error.code === 'EPIPE') process.exit(0); throw error; });

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}
function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}
function die(code, message) {
  process.stderr.write(`LANE_BRIEF=FAIL code=${message}\n`);
  process.exit(code);
}

function load() {
  if (!exists(AUTHORITY)) die(2, 'AUTHORITY_ABSENT');
  const authority = readJson(AUTHORITY);

  const allocRel = authority.headless_tool_owner_allocation;
  if (!allocRel || !exists(allocRel)) die(2, 'ALLOCATION_ABSENT');
  const alloc = readJson(allocRel);

  const regRel = authority.obligation_registry;
  const registry = regRel && exists(regRel) ? readJson(regRel) : null;

  const lanes = new Map();
  for (const row of alloc.module_ownership || []) {
    const lane = row.owner_path.split('/').pop();
    if (!lanes.has(lane)) lanes.set(lane, { owner_path: row.owner_path, modules: [] });
    lanes.get(lane).modules.push(row.module_key);
  }
  for (const v of lanes.values()) v.modules.sort();

  return { authority, alloc, allocRel, registry, regRel, lanes };
}

function obligationsFor(registry, ownerPath) {
  if (!registry) return [];
  return (registry.obligations || []).filter((o) => {
    const owner = o.owner_path || o.owner || '';
    return owner === ownerPath && !['CLOSED', 'RETIRED'].includes(o.state || o.standing || '');
  });
}

function render(ctx, laneName, opts) {
  const lane = ctx.lanes.get(laneName);
  const obligations = obligationsFor(ctx.registry, lane.owner_path);
  const chosen = opts.obligation
    ? obligations.find((o) => (o.obligation_id || o.id) === opts.obligation)
    : obligations.find((o) => (o.state || o.standing) === 'ACTIVE') || obligations[0];

  const otherLanes = [...ctx.lanes.keys()].filter((l) => l !== laneName).sort();
  const L = [];

  L.push(`# LANE BRIEF — ${laneName}`);
  L.push('');
  L.push(`Generated ${new Date().toISOString().slice(0, 10)} from \`${ctx.allocRel}\``);
  L.push('');
  L.push('## Session header');
  L.push('');
  L.push('```');
  L.push(`LANE:        ${laneName}`);
  L.push(`OWNER PATH:  ${lane.owner_path}`);
  L.push(`OBLIGATION:  ${chosen ? (chosen.obligation_id || chosen.id) : 'NONE ASSIGNED'}`);
  L.push(`AUTHORITY:   ${ctx.authority.authority_id} (${ctx.authority.effective_date})`);
  L.push(`REGISTRY:    ${ctx.registry ? ctx.registry.registry_id : 'UNREADABLE'}`);
  L.push(`FAST LANE:   ${opts.fastLane ? 'ENABLED' : 'DISABLED'}`);
  L.push('```');
  L.push('');

  if (chosen) {
    L.push('## Obligation');
    L.push('');
    L.push(`**\`${chosen.obligation_id || chosen.id}\`** — state \`${chosen.state || chosen.standing}\``);
    L.push('');
    if (chosen.title) L.push(chosen.title);
    if (chosen.objective) { L.push(''); L.push(chosen.objective); }
    if (chosen.acceptance_target) { L.push(''); L.push(`**Acceptance:** ${chosen.acceptance_target}`); }
    if (chosen.blocking_finding) { L.push(''); L.push(`**Known blocker:** ${chosen.blocking_finding}`); }
    L.push('');
  }

  L.push('## Scope — this lane owns exactly these modules');
  L.push('');
  L.push(lane.modules.map((m) => `\`${m}\``).join(' · '));
  L.push('');
  L.push('Anything else is another lane\'s work. Other lanes in this program:');
  L.push('');
  L.push(otherLanes.join(', '));
  L.push('');

  if ((ctx.alloc.boundary_rules || []).length) {
    L.push('## Boundary rules in force');
    L.push('');
    for (const r of ctx.alloc.boundary_rules) L.push(`- ${r}`);
    L.push('');
  }

  if (obligations.length > 1) {
    L.push('## Other open obligations for this lane');
    L.push('');
    for (const o of obligations) {
      const id = o.obligation_id || o.id;
      if (chosen && id === (chosen.obligation_id || chosen.id)) continue;
      L.push(`- \`${id}\` (${o.state || o.standing})`);
    }
    L.push('');
  }

  L.push('## Operating contract');
  L.push('');
  if (exists(CONTRACT)) {
    L.push(`Paste the contract from \`${CONTRACT}\` into this Project's instructions once.`);
    L.push(`Decision rights are defined in \`${DECISION_RIGHTS}\` and are part of that contract.`);
  } else {
    L.push(`\`${CONTRACT}\` is missing from this ref. The lane has no operating contract — fix before use.`);
  }
  L.push('');
  L.push('## Opening message to send after the contract');
  L.push('');
  L.push('```');
  L.push(`You are the ${laneName} lane. Work only the modules listed above.`);
  L.push(`Obligation: ${chosen ? (chosen.obligation_id || chosen.id) : 'awaiting assignment'}.`);
  L.push('Confirm the lane and the obligation back to me, then give me the block. Nothing else.');
  L.push('```');
  L.push('');
  return L.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const ctx = load();

  if (args.includes('--list') || args.length === 0) {
    process.stdout.write(`Lanes defined by ${ctx.allocRel}:\n\n`);
    for (const [name, v] of [...ctx.lanes.entries()].sort()) {
      process.stdout.write(`  ${name.padEnd(20)} ${v.modules.length} modules: ${v.modules.join(', ')}\n`);
    }
    process.stdout.write('\nUsage: node .github/scripts/lane-brief.js --lane <LANE>\n');
    return;
  }

  const laneIdx = args.indexOf('--lane');
  const laneName = laneIdx >= 0 ? (args[laneIdx + 1] || '').toUpperCase() : null;
  if (!laneName || !ctx.lanes.has(laneName)) {
    die(1, `UNKNOWN_LANE lane=${laneName} known=${[...ctx.lanes.keys()].join(',')}`);
  }

  const obIdx = args.indexOf('--obligation');
  const text = render(ctx, laneName, {
    fastLane: args.includes('--fast-lane'),
    obligation: obIdx >= 0 ? args[obIdx + 1] : null
  });

  const outIdx = args.indexOf('--out');
  if (outIdx >= 0 && args[outIdx + 1]) {
    const p = path.resolve(ROOT, args[outIdx + 1]);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, `${text}\n`, 'utf8');
    process.stderr.write(`LANE_BRIEF=WROTE lane=${laneName} path=${args[outIdx + 1]}\n`);
  } else {
    process.stdout.write(`${text}\n`);
  }
}

main();
