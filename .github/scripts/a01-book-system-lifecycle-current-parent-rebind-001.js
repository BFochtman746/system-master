'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const subjectRoot = process.env.A01_SUBJECT_ROOT || process.env.GITHUB_WORKSPACE || process.cwd();
const evidenceRoot = process.env.A01_EVIDENCE_DIR || process.env.RUNNER_TEMP;
if (!evidenceRoot) {
  console.error('A01_EVIDENCE_DIR_OR_RUNNER_TEMP_REQUIRED');
  process.exit(2);
}

const qualifier = path.join(subjectRoot, '.github', 'scripts', 'book-system-lifecycle-current-parent-rebind-001-qualify.js');
const result = spawnSync(process.execPath, [qualifier], {
  cwd: subjectRoot,
  env: {
    ...process.env,
    GITHUB_WORKSPACE: subjectRoot,
    A01_EVIDENCE_DIR: evidenceRoot,
    RUNNER_TEMP: evidenceRoot,
  },
  encoding: 'utf8',
  windowsHide: true,
  shell: false,
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) {
  console.error(`BOOK_SYSTEM_LIFECYCLE_CURRENT_PARENT_REBIND_001_WRAPPER_SPAWN_ERROR:${result.error.message}`);
  process.exit(2);
}
process.exit(typeof result.status === 'number' ? result.status : 1);
