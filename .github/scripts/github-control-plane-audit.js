#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = process.env.GITHUB_WORKSPACE || process.cwd();
const args = new Set(process.argv.slice(2));
const strict = args.has('--strict');
const selftest = args.has('--selftest');
const outArg = process.argv.find(a => a.startsWith('--out='));
const outPath = outArg ? outArg.slice('--out='.length) : path.join(ROOT, '.control-plane-audit', 'GITHUB-CONTROL-PLANE-AUDIT.json');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function finding(file, severity, code, message, line = null) {
  return { file: file.replace(/\\/g, '/'), severity, code, message, line };
}

function scanWorkflow(file, text, rootDir = ROOT) {
  const rel = path.relative(rootDir, file).replace(/\\/g, '/');
  const f = [];
  const lines = text.split(/\r?\n/);
  const hasPR = /^\s*pull_request\s*:/m.test(text);
  const hasPRTarget = /^\s*pull_request_target\s*:/m.test(text);
  const hasWorkflowRun = /^\s*workflow_run\s*:/m.test(text);
  const hasContentsWrite = /^\s*contents\s*:\s*write\s*(?:#.*)?$/m.test(text);
  const hasWriteAll = /^\s*permissions\s*:\s*write-all\s*(?:#.*)?$/m.test(text);
  const hasTopPermissions = /^permissions\s*:/m.test(text);
  const hasConcurrency = /^concurrency\s*:/m.test(text);
  const hasTimeout = /^\s+timeout-minutes\s*:/m.test(text);
  const selfHosted = /runs-on\s*:\s*(?:\[[^\]]*self-hosted|self-hosted)/m.test(text);
  const persistTrue = /persist-credentials\s*:\s*true/m.test(text);
  const persistFalse = /persist-credentials\s*:\s*false/m.test(text);
  const usesCheckout = /uses\s*:\s*actions\/checkout@/m.test(text);
  const broadTransportPush = /^\s*-\s*['\"]?transport\/[^\n]*\*\*/m.test(text);
  const readySpecific = /transport\/[^\n]*READY/m.test(text);
  const heavyQualification = /(apt-get|libreoffice|javac\b|mvn\b|gradle\b|xcodebuild\b|dotnet test\b|pytest\b)/i.test(text);

  if (hasPRTarget) f.push(finding(rel, 'BLOCKER', 'PULL_REQUEST_TARGET', 'pull_request_target is forbidden unless a future policy explicitly admits a narrowly reviewed exception.'));
  if (hasWriteAll) f.push(finding(rel, 'BLOCKER', 'WRITE_ALL', 'permissions: write-all violates least privilege.'));
  if (selfHosted && (hasPR || hasPRTarget)) f.push(finding(rel, 'BLOCKER', 'UNTRUSTED_SELF_HOSTED', 'Self-hosted runners must not execute pull-request code.'));
  if (hasContentsWrite && (hasPR || hasPRTarget)) f.push(finding(rel, 'BLOCKER', 'WRITE_TOKEN_ON_PR', 'A workflow with contents: write must not run on pull_request or pull_request_target. Split qualification from promotion.'));
  if (hasContentsWrite && !hasConcurrency) f.push(finding(rel, 'ERROR', 'WRITE_WITHOUT_CONCURRENCY', 'Mutation-capable workflow lacks a concurrency guard.'));
  if (!hasTopPermissions) f.push(finding(rel, 'ERROR', 'IMPLICIT_TOKEN_PERMISSIONS', 'Declare top-level permissions explicitly.'));
  if (!hasTimeout) f.push(finding(rel, 'ERROR', 'MISSING_TIMEOUT', 'Every job must have timeout-minutes to bound hangs and runner occupancy.'));
  if (usesCheckout && !hasContentsWrite && !persistFalse) f.push(finding(rel, 'ERROR', 'READ_CHECKOUT_PERSISTS_TOKEN', 'Read-only workflows using checkout must set persist-credentials: false.'));
  if (persistTrue && !hasContentsWrite) f.push(finding(rel, 'ERROR', 'UNNEEDED_PERSISTED_TOKEN', 'persist-credentials: true is not justified in a read-only workflow.'));
  if (broadTransportPush && !readySpecific && heavyQualification) f.push(finding(rel, 'ERROR', 'QUALIFICATION_FANOUT', 'Heavy qualification appears triggerable by broad transport staging paths. Gate expensive qualification on READY/freeze or workflow_dispatch.'));
  if (hasWorkflowRun && hasContentsWrite) f.push(finding(rel, 'WARN', 'PRIVILEGED_WORKFLOW_RUN', 'Privileged workflow_run requires explicit subject/ref validation before mutation.'));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/\buses\s*:\s*([^\s#]+)/);
    if (m) {
      const ref = m[1].replace(/^['\"]|['\"]$/g, '');
      if (ref.startsWith('./') || ref.startsWith('$/')) continue;
      if (ref.startsWith('docker://')) {
        if (!/@sha256:[0-9a-f]{64}$/i.test(ref)) f.push(finding(rel, 'ERROR', 'UNPINNED_DOCKER_ACTION', `Docker action is not digest pinned: ${ref}`, i + 1));
        continue;
      }
      const at = ref.lastIndexOf('@');
      if (at < 1 || !/^[0-9a-f]{40}$/i.test(ref.slice(at + 1))) {
        f.push(finding(rel, 'ERROR', 'UNPINNED_ACTION', `External action must be pinned to a full 40-character commit SHA: ${ref}`, i + 1));
      }
    }
    if (/\$\{\{\s*github\.event\.[^}]+\}\}/.test(line) && /^\s*(run:|[^#].*)/.test(line)) {
      f.push(finding(rel, 'WARN', 'EVENT_CONTEXT_IN_SCRIPT', 'GitHub event data is interpolated in workflow text; route untrusted values through env and quote them before shell use.', i + 1));
    }
  }

  return f;
}

function scan(rootDir = ROOT) {
  const workflowDir = path.join(rootDir, '.github', 'workflows');
  const files = walk(workflowDir).filter(p => /\.ya?ml$/i.test(p));
  const findings = [];
  for (const file of files) findings.push(...scanWorkflow(file, fs.readFileSync(file, 'utf8'), rootDir));

  const secondShiftRequired = [
    'governance/second-shift/SECOND-SHIFT-REGISTRY-001.json',
    'governance/second-shift/SYSTEM-MASTER-DELEGATIONS.json',
    '.github/scripts/second-shift-owner-coverage.js',
    '.github/workflows/second-shift-enforcement.yml'
  ];
  for (const p of secondShiftRequired) {
    if (!fs.existsSync(path.join(rootDir, p))) findings.push(finding(p, 'BLOCKER', 'SECOND_SHIFT_CONTROL_MISSING', 'Required reusable Second Shift root control is missing.'));
  }

  const counts = { BLOCKER: 0, ERROR: 0, WARN: 0, INFO: 0 };
  for (const x of findings) counts[x.severity] = (counts[x.severity] || 0) + 1;
  return {
    schema: 'GITHUB-CONTROL-PLANE-AUDIT-001',
    generated_at: new Date().toISOString(),
    repository_root: rootDir,
    workflows_scanned: files.length,
    strict,
    standing: counts.BLOCKER > 0 || (strict && counts.ERROR > 0) ? 'DRIFT_DETECTED' : 'PASS_WITH_ADVISORIES',
    counts,
    findings
  };
}

function runSelftest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghcp-audit-'));
  fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'governance', 'second-shift'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.github', 'scripts'), { recursive: true });
  for (const p of [
    'governance/second-shift/SECOND-SHIFT-REGISTRY-001.json',
    'governance/second-shift/SYSTEM-MASTER-DELEGATIONS.json',
    '.github/scripts/second-shift-owner-coverage.js'
  ]) fs.writeFileSync(path.join(dir, p), '{}');
  fs.writeFileSync(path.join(dir, '.github', 'workflows', 'second-shift-enforcement.yml'), 'name: second\npermissions:\n  contents: read\njobs:\n  test:\n    runs-on: ubuntu-latest\n    timeout-minutes: 1\n    steps:\n      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262\n        with:\n          persist-credentials: false\n');
  let report = scan(dir);
  if (report.counts.BLOCKER !== 0 || report.counts.ERROR !== 0) throw new Error(`safe fixture failed: ${JSON.stringify(report.findings)}`);
  fs.writeFileSync(path.join(dir, '.github', 'workflows', 'bad.yml'), 'name: bad\non:\n  pull_request_target:\npermissions: write-all\njobs:\n  pwn:\n    runs-on: self-hosted\n    steps:\n      - uses: actions/checkout@main\n');
  report = scan(dir);
  const codes = new Set(report.findings.map(x => x.code));
  for (const code of ['PULL_REQUEST_TARGET', 'WRITE_ALL', 'UNTRUSTED_SELF_HOSTED', 'UNPINNED_ACTION']) {
    if (!codes.has(code)) throw new Error(`selftest did not detect ${code}`);
  }
  console.log('GITHUB_CONTROL_PLANE_AUDIT_SELFTEST_PASS');
}

if (selftest) {
  runSelftest();
  process.exit(0);
}

const report = scan();
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
const fail = report.counts.BLOCKER > 0 || (strict && report.counts.ERROR > 0);
process.exit(fail ? 1 : 0);
