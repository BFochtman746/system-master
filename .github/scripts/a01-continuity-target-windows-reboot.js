'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.resolve(process.env.A01_SUBJECT_ROOT || process.env.GITHUB_WORKSPACE || path.resolve(__dirname, '..', '..'));
const controlPath = path.join(root, 'system-master', 'g-target-windows-reboot', 'control', 'QUALIFICATION-SUBJECT.json');
const evidenceDir = process.env.A01_EVIDENCE_DIR;

function fail(message) {
  if (evidenceDir) {
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, 'wrapper-failure.txt'), `${message}\n`);
  }
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(controlPath)) fail(`CONTROL_SUBJECT_MISSING:${controlPath}`);
const control = JSON.parse(fs.readFileSync(controlPath, 'utf8'));
if (!['ARM', 'VERIFY'].includes(control.phase)) fail(`INVALID_PHASE:${control.phase}`);
if (!/^CONTINUITY-WINREBOOT-/.test(String(control.qualification_id || ''))) fail('INVALID_CONTINUITY_QUALIFICATION_ID');

const env = { ...process.env, GITHUB_WORKSPACE: root };
if (control.phase === 'ARM') env.A01_PREPARE_ONLY = '1';

const script = path.join(root, '.github', 'scripts', 'g-continuity-target-windows-reboot.ps1');
if (!fs.existsSync(script)) fail(`QUALIFIER_SCRIPT_MISSING:${script}`);
const child = cp.spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
  cwd: root,
  encoding: 'utf8',
  shell: false,
  env
});
if (child.stdout) process.stdout.write(child.stdout);
if (child.stderr) process.stderr.write(child.stderr);
if (child.error) fail(`POWERSHELL_LAUNCH_FAILED:${child.error.message}`);
if (child.status !== 0) process.exit(typeof child.status === 'number' ? child.status : 1);

if (control.phase === 'ARM') {
  const marker = evidenceDir ? path.join(evidenceDir, 'post-action.txt') : null;
  if (!marker || !fs.existsSync(marker) || fs.readFileSync(marker, 'utf8').trim() !== 'windows_reboot') {
    fail('ARM_POST_ACTION_MARKER_MISSING');
  }
}

console.log(`A01_CONTINUITY_TARGET_WINDOWS_REBOOT=${control.phase}:PASS qualification_id=${control.qualification_id}`);
