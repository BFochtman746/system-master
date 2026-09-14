'use strict';

/**
 * scaffold-foundation-contracts.js
 *
 * Writes one foundation contract stub per owned module, pre-filled with
 * everything the repository already knows: owner, lane, boundary rules in force,
 * declared interaction direction, and the census standing that put the module in
 * ACTIVE_GAP. The eight sections the census requires are left empty and marked,
 * because those are the ones that need a human who knows the module.
 *
 * Deliberately does not invent content. A stub that guessed at failure semantics
 * would read as populated to the matrix and to a reviewer, which is worse than an
 * empty section — the census forbids inferring completion from planning volume,
 * and a plausible guess is the most expensive kind of planning volume.
 *
 *   node .github/scripts/scaffold-foundation-contracts.js --dry-run
 *   node .github/scripts/scaffold-foundation-contracts.js --lane DOCUMENTS
 *   node .github/scripts/scaffold-foundation-contracts.js --write
 *
 * Never overwrites an existing contract. Exit 0 ok, 1 nothing to do, 2 inputs missing.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const AUTHORITY = 'governance/CURRENT-AUTHORITY.json';
const P6 = 'governance/census/SYSTEM-MASTER-COMPLETION-CENSUS-002-P6-PRODUCT-MODULE-ALLOCATION.json';
const OUT_DIR = 'governance/contracts';
const TEMPLATE = 'governance/FOUNDATION-CONTRACT-TEMPLATE-001.md';

const SECTIONS = [
  ['1. Contract / interface', 'What this module promises callers: named operations, inputs, outputs, and what is explicitly not offered.'],
  ['2. Ingress routes', 'Every way work enters. Name the caller, the transport, and the authority that admits it. A route with no named admitting authority is a gap, not a route.'],
  ['3. Egress routes', 'Every way results leave: return values, emitted artifacts, notifications, side effects on other modules.'],
  ['4. Persistence and canonical writer', 'Exactly one component may write each piece of durable state. Name it, name the store, and name what happens to a write arriving from anywhere else.'],
  ['5. Dependencies', 'Modules and shared infrastructure required, and the direction of each. Flag any that cross a boundary rule below.'],
  ['6. Failure semantics', 'What happens when each ingress route fails, a dependency is unavailable, or a write is refused. State fail-closed or fail-open, and justify any fail-open. Include the idempotency rule.'],
  ['7. Evidence target', 'The artifact that proves this module did what it claimed: path, format, required contents. A log line is not evidence.'],
  ['8. Acceptance target', 'The exact command returning PASS or FAIL, and the PASS condition. Must be runnable by someone who did not write the module.']
];

// Piping to head/less closes stdout early; that is normal shell use, not an error.
process.stdout.on('error', (error) => { if (error.code === 'EPIPE') process.exit(0); throw error; });

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}
function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function load() {
  if (!exists(AUTHORITY)) { process.stderr.write('SCAFFOLD=FAIL code=AUTHORITY_ABSENT\n'); process.exit(2); }
  const authority = readJson(AUTHORITY);
  const allocRel = authority.headless_tool_owner_allocation;
  if (!allocRel || !exists(allocRel)) { process.stderr.write('SCAFFOLD=FAIL code=ALLOCATION_ABSENT\n'); process.exit(2); }
  const alloc = readJson(allocRel);
  const p6 = exists(P6) ? readJson(P6) : { modules: [] };
  const census = new Map(p6.modules.map((m) => [m.module_key, m]));
  return { authority, alloc, allocRel, census };
}

function render(moduleKey, ownerPath, ctx, platformEntry) {
  const lane = (ownerPath || '').split('/').pop();
  const record = ctx.census.get(moduleKey);
  const today = new Date().toISOString().slice(0, 10);

  const L = [];
  L.push(`# ${moduleKey} — Foundation Contract 001`);
  L.push('');
  if (platformEntry) {
    L.push(`**Owner** \`${ownerPath}\` · **Capability** ${moduleKey} ${platformEntry.requirement} · **Effective** <UNSET>`);
  } else {
    L.push(`**Owner** \`${ownerPath}\` · **Lane** ${lane} · **Effective** <UNSET>`);
  }
  L.push(`**Authority** \`${ctx.allocRel}\``);
  L.push(`**Scaffolded** ${today} from \`.github/scripts/scaffold-foundation-contracts.js\``);
  L.push('');
  L.push('> **This contract is a stub.** Sections 1–8 are the census gap-forcing columns and');
  L.push('> are empty on purpose. A section containing "TBD", a placeholder, or a plausible');
  L.push('> guess counts as unpopulated — the census forbids inferring completion from');
  L.push('> planning volume. Delete this block when all eight are genuinely filled.');
  L.push('');

  if (platformEntry) {
    L.push('## Known from the crosswalk');
    L.push('');
    L.push(`- **Requirement:** ${platformEntry.requirement}`);
    L.push(`- **Present in repo as:** ${platformEntry.implementation ? '`' + platformEntry.implementation + '`' : '**nothing — this requirement has no implementation**'}`);
    L.push('');
    if (!platformEntry.implementation) {
      L.push('This platform requirement was invisible until the crosswalk named it. Section 1');
      L.push('must decide whether it is built, deferred with authority, or absorbed elsewhere.');
      L.push('');
    }
  }

  if (record) {
    L.push('## Known from the census');
    L.push('');
    L.push(`- **Module name:** ${record.module_name || '(unnamed)'}`);
    if (record.interaction_direction) L.push(`- **Interaction direction:** ${record.interaction_direction}`);
    if (record.current_standing) L.push(`- **Census standing:** \`${record.current_standing}\``);
    if (record.evidence_summary) L.push(`- **Census evidence summary:** ${record.evidence_summary}`);
    L.push('');
    L.push('This is what P6 recorded. It is background, not a populated section.');
    L.push('');
  }

  const rules = (ctx.alloc.boundary_rules || []).filter((r) => r.includes(lane) || r.includes(moduleKey));
  if (rules.length) {
    L.push('## Boundary rules touching this module');
    L.push('');
    for (const r of rules) L.push(`- ${r}`);
    L.push('');
    L.push('Crossing any of these is an `owner` decision, never lane discretion.');
    L.push('');
  }

  for (const [heading, guidance] of SECTIONS) {
    L.push(`## ${heading}`);
    L.push('');
    L.push(`<!-- ${guidance} -->`);
    L.push('');
    L.push('**UNPOPULATED**');
    L.push('');
  }

  L.push('## 9. Authority boundary');
  L.push('');
  L.push('<!-- What this module may decide alone vs. what needs the owner. Mirrors');
  L.push('     governance/DECISION-RIGHTS-001.md, scoped to this module. -->');
  L.push('');
  L.push('**UNPOPULATED**');
  L.push('');
  L.push('## 10. Open gaps');
  L.push('');
  L.push('- Sections 1–9 are unpopulated. This module remains `ACTIVE_GAP` in');
  L.push('  Foundation Closure Census 001 until they are filled.');
  L.push('');
  return L.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const laneIdx = args.indexOf('--lane');
  const laneFilter = laneIdx >= 0 ? (args[laneIdx + 1] || '').toUpperCase() : null;
  const ctx = load();

  if (!exists(TEMPLATE)) {
    process.stderr.write(`SCAFFOLD=WARN code=TEMPLATE_ABSENT path=${TEMPLATE}\n`);
  }

  // Platform requirements from the ratified crosswalk are scaffolded alongside
  // modules: the census owes a contract for each, and P00-P15 were invisible until
  // the crosswalk named them.
  const platform = [];
  const crosswalkRel = ctx.authority.capability_crosswalk;
  if (crosswalkRel && exists(crosswalkRel)) {
    for (const entry of readJson(crosswalkRel).platform_requirements || []) {
      platform.push({ module_key: entry.platform_id, owner_path: entry.owner_path, _platform: entry });
    }
  }

  const rows = [...(ctx.alloc.module_ownership || []), ...platform]
    .filter((r) => !laneFilter || (r.owner_path || '').split('/').pop() === laneFilter)
    .sort((a, b) => a.module_key.localeCompare(b.module_key));

  if (!rows.length) {
    process.stderr.write(`SCAFFOLD=FAIL code=NO_MODULES lane=${laneFilter || 'ALL'}\n`);
    process.exit(1);
  }

  const created = [];
  const skipped = [];
  for (const row of rows) {
    const rel = path.join(OUT_DIR, `${row.module_key}-FOUNDATION-CONTRACT-001.md`);
    if (exists(rel)) { skipped.push(rel); continue; }
    const body = render(row.module_key, row.owner_path, ctx, row._platform);
    if (write) {
      const abs = path.join(ROOT, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, `${body}\n`, 'utf8');
    }
    created.push(rel);
  }

  process.stdout.write(`${write ? 'Wrote' : 'Would write'} ${created.length} contract stub(s)`);
  process.stdout.write(skipped.length ? `, left ${skipped.length} existing untouched\n` : '\n');
  for (const c of created) process.stdout.write(`  + ${c}\n`);
  for (const s of skipped) process.stdout.write(`  = ${s} (exists)\n`);
  if (!write) process.stdout.write('\nRe-run with --write to create them.\n');
}

main();
