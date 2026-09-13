'use strict';

/**
 * validate-governance.js — schema-check the load-bearing governance files.
 *
 * These four files are the estate's entry point. Nothing validated them, so a
 * typo in a pointer or a missing owner_path broke consumers silently, at the
 * moment they were needed. This runs in CI on every change to governance/.
 *
 * Implements the JSON Schema subset the schemas actually use — type, required,
 * properties, items, enum, pattern, minLength, minItems. No dependencies on
 * purpose: a governance gate that needs an install step is a gate that gets
 * skipped.
 *
 *   node .github/scripts/validate-governance.js
 *   node .github/scripts/validate-governance.js --json
 *
 * Exit codes: 0 valid, 1 validation failure, 2 a required file is unreadable.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA_DIR = 'governance/schemas';
const AUTHORITY = 'governance/CURRENT-AUTHORITY.json';

// Each target resolves through CURRENT-AUTHORITY, so the gate follows the live
// pointer chain rather than a hardcoded list that would rot.
const TARGETS = [
  { schema: 'CURRENT-AUTHORITY-001.schema.json', pointer: null, label: 'authority' },
  { schema: 'WORK-OBLIGATION-REGISTRY-001.schema.json', pointer: 'obligation_registry', label: 'obligations' },
  { schema: 'SYSTEM-TOPOLOGY-001.schema.json', pointer: 'topology', label: 'topology' },
  { schema: 'TOOL-OWNER-ALLOCATION-001.schema.json', pointer: 'headless_tool_owner_allocation', label: 'allocation' }
];

// Piping to head/less closes stdout early; that is normal shell use, not an error.
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
      return; // further checks would cascade meaninglessly
    }
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${pointer}: "${value}" is not one of ${schema.enum.join(', ')}`);
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${pointer}: must not be empty`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${pointer}: "${value}" does not match ${schema.pattern}`);
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${pointer}: needs at least ${schema.minItems} item(s), has ${value.length}`);
    }
    if (schema.items) value.forEach((item, i) => validate(item, schema.items, `${pointer}[${i}]`, errors));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required || []) {
      if (!(key in value)) errors.push(`${pointer || '/'}: missing required property "${key}"`);
    }
    for (const [key, sub] of Object.entries(schema.properties || {})) {
      if (key in value) validate(value[key], sub, `${pointer}/${key}`, errors);
    }
  }
}

function run() {
  const report = { checked: [], errors: [], warnings: [] };

  let authority;
  try {
    authority = readJson(AUTHORITY);
  } catch (error) {
    report.errors.push(`${AUTHORITY}: unreadable — ${error.message}`);
    return { report, code: 2 };
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
    try {
      schema = readJson(schemaPath);
    } catch (error) {
      report.errors.push(`${schemaPath}: unreadable — ${error.message}`);
      continue;
    }
    try {
      document = readJson(rel);
    } catch (error) {
      report.errors.push(`${rel}: unreadable — ${error.message}`);
      continue;
    }

    const errors = [];
    validate(document, schema, '', errors);
    report.checked.push({ label: target.label, file: rel, schema: schemaPath, errors: errors.length });
    for (const message of errors) report.errors.push(`${rel} ${message}`);
  }

  // Cross-file consistency: an owner_path on an obligation must name a lane that
  // the allocation actually defines. Schema alone cannot see across files.
  try {
    const alloc = readJson(authority.headless_tool_owner_allocation);
    const registry = readJson(authority.obligation_registry);
    const lanes = new Set((alloc.module_ownership || []).map((r) => r.owner_path));
    for (const o of registry.obligations || []) {
      const owner = o.owner_path;
      if (owner && !lanes.has(owner)) {
        report.warnings.push(`${o.obligation_id}: owner_path "${owner}" owns no modules in the allocation`);
      }
    }
  } catch {
    // Already reported above if unreadable.
  }

  return { report, code: report.errors.length ? 1 : 0 };
}

function main() {
  const { report, code } = run();
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exit(code);
  }

  for (const c of report.checked) {
    process.stdout.write(`${c.errors === 0 ? 'PASS' : 'FAIL'}  ${c.label.padEnd(14)} ${c.file}\n`);
  }
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
