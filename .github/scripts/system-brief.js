'use strict';

/**
 * system-brief.js — render the System Master state of record as one page.
 *
 * The authoritative state already exists in this repository. It is spread across
 * CURRENT-AUTHORITY.json and everything that file points at, which means no human
 * and no chat session can hold it. This script resolves the pointer chain once and
 * emits a single artifact.
 *
 *   node .github/scripts/system-brief.js                 # markdown to stdout
 *   node .github/scripts/system-brief.js --json          # machine-readable
 *   node .github/scripts/system-brief.js --out brief.md  # write to a file
 *   node .github/scripts/system-brief.js --strict        # exit 1 on broken pointers
 *
 * Exit codes: 0 ok, 1 strict-mode pointer breakage, 2 authority unreadable.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const AUTHORITY = path.join(ROOT, 'governance', 'CURRENT-AUTHORITY.json');

// A pointer value is a repo-relative path, not prose. Doctrine sentences live in the
// same file and must not be mistaken for missing artifacts.
const POINTER_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]*\.(json|md|js|ya?ml)$/;

const ACTIVE_STATES = ['ACTIVE', 'READY'];
const ATTENTION_STATES = ['BLOCKED', 'HOLD'];

// Piping to head/less closes stdout early; that is normal shell use, not an error.
process.stdout.on('error', (error) => { if (error.code === 'EPIPE') process.exit(0); throw error; });

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function tryReadJson(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return { ok: false, reason: 'ABSENT_ON_THIS_REF' };
  try {
    return { ok: true, value: readJson(abs) };
  } catch (error) {
    return { ok: false, reason: `UNPARSEABLE: ${error.message}` };
  }
}

function collectPointers(node, acc = []) {
  if (typeof node === 'string') {
    if (POINTER_RE.test(node)) acc.push(node);
  } else if (Array.isArray(node)) {
    node.forEach((child) => collectPointers(child, acc));
  } else if (node && typeof node === 'object') {
    Object.values(node).forEach((child) => collectPointers(child, acc));
  }
  return acc;
}

function classifyPointers(pointers) {
  const resolved = [];
  const unresolved = [];
  for (const p of pointers) {
    if (fs.existsSync(path.join(ROOT, p))) resolved.push(p);
    else unresolved.push(p);
  }
  return { resolved, unresolved };
}

function obligationRow(o) {
  return {
    id: o.obligation_id || o.id || '(unidentified)',
    state: o.state || o.standing || 'UNSTATED',
    owner: o.owner_path || o.owner || o.system || '',
    statement: (o.title || o.objective || o.statement || o.job || '').trim()
  };
}

function truncate(text, max) {
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function build() {
  if (!fs.existsSync(AUTHORITY)) {
    process.stderr.write(`SYSTEM_BRIEF=FAIL code=AUTHORITY_ABSENT path=governance/CURRENT-AUTHORITY.json\n`);
    process.exit(2);
  }
  const authority = readJson(AUTHORITY);

  const pointers = classifyPointers(collectPointers(authority));

  const registryPath = authority.obligation_registry;
  const registryRead = registryPath ? tryReadJson(registryPath) : { ok: false, reason: 'NOT_DECLARED' };
  const registry = registryRead.ok ? registryRead.value : null;

  const statusPath = authority.system_completion_status;
  const statusRead = statusPath ? tryReadJson(statusPath) : { ok: false, reason: 'NOT_DECLARED' };
  const status = statusRead.ok ? statusRead.value : null;

  const obligations = (registry?.obligations || []).map(obligationRow);
  const byState = (states) => obligations.filter((o) => states.includes(o.state));

  return {
    generated_at: new Date().toISOString(),
    authority: {
      id: authority.authority_id || null,
      effective_date: authority.effective_date || null,
      standing: authority.standing || null,
      product_root: authority.product_root || null
    },
    central_next_objective: registry?.central_next_objective || null,
    highest_discretionary_objective: registry?.highest_discretionary_objective || null,
    registry: {
      path: registryPath || null,
      id: registry?.registry_id || null,
      effective_date: registry?.effective_date || null,
      readable: registryRead.ok,
      reason: registryRead.ok ? null : registryRead.reason
    },
    systems: (status?.systems || []).map((s) => ({
      id: s.system_id,
      standing: s.standing,
      complete: Boolean(s.complete),
      job: s.job || ''
    })),
    retired_systems: (status?.retired_systems || []).map((s) => s.system_id),
    obligations,
    counts: {
      total: obligations.length,
      active: byState(['ACTIVE']).length,
      ready: byState(['READY']).length,
      blocked: byState(['BLOCKED']).length,
      hold: byState(['HOLD']).length,
      closed: byState(['CLOSED']).length
    },
    pointer_integrity: {
      resolved: pointers.resolved.length,
      unresolved: pointers.unresolved
    }
  };
}

function renderMarkdown(b) {
  const L = [];
  const pct = b.systems.length
    ? `${b.systems.filter((s) => s.complete).length}/${b.systems.length}`
    : 'n/a';

  L.push('# System Master — State of Record');
  L.push('');
  L.push(`Generated ${b.generated_at}`);
  L.push('');
  L.push(`**Authority** ${b.authority.id || '(none)'} · effective ${b.authority.effective_date || '(undated)'}`);
  L.push(`**Obligation registry** ${b.registry.id || '(unreadable)'} · effective ${b.registry.effective_date || '(undated)'}`);
  L.push('');
  L.push('## Do this next');
  L.push('');
  L.push(`- **Central objective:** ${b.central_next_objective || '(not declared)'}`);
  L.push(`- **Highest discretionary:** ${b.highest_discretionary_objective || '(not declared)'}`);
  L.push('');
  L.push('## Systems');
  L.push('');
  L.push(`Complete: ${pct}`);
  L.push('');
  for (const s of b.systems) {
    L.push(`- **${s.id}** — ${s.complete ? 'COMPLETE' : 'incomplete'} · \`${s.standing}\``);
  }
  if (b.retired_systems.length) {
    L.push('');
    L.push(`Retired: ${b.retired_systems.join(', ')}`);
  }
  L.push('');
  L.push('## Work in flight');
  L.push('');
  const c = b.counts;
  L.push(`${c.active} active · ${c.ready} ready · ${c.blocked} blocked · ${c.hold} hold · ${c.closed} closed (${c.total} total)`);
  L.push('');

  const section = (label, states) => {
    const rows = b.obligations.filter((o) => states.includes(o.state));
    if (!rows.length) return;
    L.push(`### ${label}`);
    L.push('');
    for (const o of rows) {
      L.push(`- \`${o.id}\`${o.owner ? ` — ${o.owner}` : ''}`);
      if (o.statement) L.push(`  - ${truncate(o.statement, 200)}`);
    }
    L.push('');
  };
  section('Moving now', ACTIVE_STATES);
  section('Needs a decision or an external unblock', ATTENTION_STATES);

  L.push('## Pointer integrity');
  L.push('');
  L.push(`${b.pointer_integrity.resolved} artifact pointers resolve on this ref.`);
  if (b.pointer_integrity.unresolved.length) {
    L.push('');
    L.push('Declared but **absent on this ref** — these live on control branches, so the');
    L.push('state of record is not readable from any single checkout:');
    L.push('');
    for (const p of b.pointer_integrity.unresolved) L.push(`- \`${p}\``);
  } else {
    L.push('');
    L.push('All declared artifacts are present on this ref.');
  }
  L.push('');
  return L.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const strict = args.includes('--strict');
  const outIndex = args.indexOf('--out');
  const outPath = outIndex >= 0 ? args[outIndex + 1] : null;

  const brief = build();
  const text = asJson ? `${JSON.stringify(brief, null, 2)}\n` : `${renderMarkdown(brief)}\n`;

  if (outPath) {
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.writeFileSync(path.resolve(outPath), text, 'utf8');
    process.stderr.write(`SYSTEM_BRIEF=WROTE path=${outPath}\n`);
  } else {
    process.stdout.write(text);
  }

  if (!brief.registry.readable) {
    process.stderr.write(`SYSTEM_BRIEF=DEGRADED code=REGISTRY_UNREADABLE reason=${brief.registry.reason}\n`);
    if (strict) process.exit(1);
  }
  if (strict && brief.pointer_integrity.unresolved.length) {
    process.stderr.write(`SYSTEM_BRIEF=FAIL code=POINTERS_UNRESOLVED count=${brief.pointer_integrity.unresolved.length}\n`);
    process.exit(1);
  }
}

main();
