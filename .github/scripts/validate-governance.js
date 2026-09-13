'use strict';

/**
 * validate-governance.js — schema-check the load-bearing governance files and
 * fail closed when Foundation-critical authority pointers disappear.
 *
 * Four root governance documents are schema-validated. Additional canonical
 * Foundation surfaces (for example the capability crosswalk) retain their own
 * semantic validators, but CURRENT-AUTHORITY must still name resolvable local
 * pointers to them so the estate cannot silently lose its execution truth.
 *
 *   node .github/scripts/validate-governance.js
 *   node .github/scripts/validate-governance.js --json
 *
 * Exit codes: 0 valid, 1 validation failure, 2 CURRENT-AUTHORITY unreadable.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA_DIR = 'governance/schemas';
const AUTHORITY = 'governance/CURRENT-AUTHORITY.json';
const POINTER_PATTERN = /^[A-Za-z0-9.][A-Za-z0-9._/-]*\.(json|md|js|ya?ml)$/;

const TARGETS = [
  { schema: 'CURRENT-AUTHORITY-001.schema.json', pointer: null, label: 'authority' },
  { schema: 'WORK-OBLIGATION-REGISTRY-001.schema.json', pointer: 'obligation_registry', label: 'obligations' },
  { schema: 'SYSTEM-TOPOLOGY-001.schema.json', pointer: 'topology', label: 'topology' },
  { schema: 'TOOL-OWNER-ALLOCATION-001.schema.json', pointer: 'headless_tool_owner_allocation', label: 'allocation' }
];

const FOUNDATION_CRITICAL_POINTERS = [
  'obligation_registry',
  'topology',
  'system_completion_status',
  'headless_tool_owner_allocation',
  'capability_crosswalk',
  'foundation_closure_census',
  'foundation_closure_matrix_generator',
  'governance_validator'
];

process.stdout.on('error', (error) => { if (error.code === 'EPIPE') process.exit(0); throw error; });

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function validate(value, schema, pointer, errors) {
  if (schema.type) {
    const actual = typeOf(value);
    const wanted = schema.type === 'integer' ? 'number' : schema.type;
    if (actual !== wanted || (schema.type === 'integer' && !Number.isInteger(value))) {
      errors.push(`${pointer || '/'}: expected ${schema.type}, got ${actual}`);
      return;
    }
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${pointer}: "${value}" is not one of ${schema.enum.join(', ')}`);
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${pointer}: must not be empty`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${pointer}: "${value}" does not match ${schema.pattern}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${pointer}: needs at least ${schema.minItems} item(s), has ${value.length}`);
    if (schema.items) value.forEach((item, i) => validate(item, schema.items, `${pointer}[${i}]`, errors));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required || []) if (!(key in value)) errors.push(`${pointer || '/'}: missing required property "${key}"`);
    for (const [key, sub] of Object.entries(schema.properties || {})) if (key in value) validate(value[key], sub, `${pointer}/${key}`, errors);
  }
}

function run() {
  const report = { checked: [], errors: [], warnings: [], critical_pointers: [] };
  let authority;
  try {
    authority = readJson(AUTHORITY);
  } catch (error) {
    report.errors.push(`${AUTHORITY}: unreadable — ${error.message}`);
    return { report, code: 2 };
  }

  for (const pointer of FOUNDATION_CRITICAL_POINTERS) {
    const rel = authority[pointer];
    if (typeof rel !== 'string' || !POINTER_PATTERN.test(rel)) {
      report.errors.push(`${AUTHORITY}: Foundation-critical pointer "${pointer}" is absent or not a repository artifact path`);
      continue;
    }
    const present = fs.existsSync(path.join(ROOT, rel));
    report.critical_pointers.push({ pointer, file: rel, present });
    if (!present) report.errors.push(`${AUTHORITY}: Foundation-critical pointer "${pointer}" points to missing file ${rel}`);
  }

  for (const target of TARGETS) {
    const rel = target.pointer ? authority[target.pointer] : AUTHORITY;
    if (!rel) {
      report.errors.push(`${AUTHORITY}: declares no "${target.pointer}"`);
      continue;
    }
    const schemaPath = path.join(SCHEMA_DIR, target.schema);
    let schema;
    let document;
    try { schema = readJson(schemaPath); }
    catch (error) { report.errors.push(`${schemaPath}: unreadable — ${error.message}`); continue; }
    try { document = readJson(rel); }
    catch (error) { report.errors.push(`${rel}: unreadable — ${error.message}`); continue; }
    const errors = [];
    validate(document, schema, '', errors);
    report.checked.push({ label: target.label, file: rel, schema: schemaPath, errors: errors.length });
    for (const message of errors) report.errors.push(`${rel} ${message}`);
  }

  try {
    const alloc = readJson(authority.headless_tool_owner_allocation);
    const registry = readJson(authority.obligation_registry);
    const lanes = new Set((alloc.module_ownership || []).map((r) => r.owner_path));
    for (const o of registry.obligations || []) {
      const owner = o.owner_path;
      if (owner && !lanes.has(owner)) report.warnings.push(`${o.obligation_id}: owner_path "${owner}" owns no modules in the allocation`);
    }
  } catch {
    // Read/shape defects are already emitted through target/pointer validation.
  }

  return { report, code: report.errors.length ? 1 : 0 };
}

function main() {
  const { report, code } = run();
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exit(code);
  }
  for (const c of report.checked) process.stdout.write(`${c.errors === 0 ? 'PASS' : 'FAIL'}  ${c.label.padEnd(14)} ${c.file}\n`);
  if (report.warnings.length) {
    process.stdout.write('\nWarnings (not failures):\n');
    for (const w of report.warnings) process.stdout.write(`  ! ${w}\n`);
  }
  if (report.errors.length) {
    process.stdout.write('\nErrors:\n');
    for (const e of report.errors) process.stdout.write(`  x ${e}\n`);
    process.stdout.write(`\nGOVERNANCE_VALIDATION=FAIL errors=${report.errors.length}\n`);
  } else {
    process.stdout.write('\nGOVERNANCE_VALIDATION=PASS\n');
  }
  process.exit(code);
}

main();
