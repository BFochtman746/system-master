'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.env.GITHUB_WORKSPACE || process.cwd();
const tempRoot = process.env.RUNNER_TEMP || os.tmpdir();
const evidence = fs.mkdtempSync(path.join(tempRoot, 'foundation-system-root-'));
const packageRoot = path.join(root, 'system-master', 'foundation-spine', 'system-root');
const classes = path.join(evidence, 'classes');
fs.mkdirSync(classes, { recursive: true });

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    env: process.env,
  });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  if (options.evidence) fs.writeFileSync(path.join(evidence, options.evidence), stdout + stderr, 'utf8');
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.error ? result.error.message : `exit ${result.status}`}\n${stdout}${stderr}`);
  }
  return stdout.trim();
}

function gitJson(ref, file) {
  const text = run('git', ['show', `${ref}:${file}`]);
  try { return JSON.parse(text); }
  catch (error) { throw new Error(`invalid JSON at ${ref}:${file}: ${error.message}`); }
}

function validateProductBoundary() {
  let ref = 'origin/main';
  let authority;
  try { authority = gitJson(ref, 'governance/CURRENT-AUTHORITY.json'); }
  catch (first) {
    ref = 'main';
    authority = gitJson(ref, 'governance/CURRENT-AUTHORITY.json');
  }
  if (authority.product_root !== 'SYSTEM_MASTER') throw new Error('product boundary: product_root is not SYSTEM_MASTER');
  if (authority.core_control_ref !== 'system-master/control-v2') throw new Error('product boundary: current authority does not bind CORE to system-master/control-v2');
  if (!authority.topology) throw new Error('product boundary: CURRENT-AUTHORITY does not select topology');
  const topology = gitJson(ref, authority.topology);
  if (!topology.product_root || topology.product_root.product_id !== 'SYSTEM_MASTER') throw new Error('product boundary: selected topology product root mismatch');
  const core = (topology.canonical_internal_systems || []).find((entry) => entry.system_id === 'CORE');
  if (!core) throw new Error('product boundary: CORE missing from selected product topology');
  if (core.parent_id !== 'SYSTEM_MASTER') throw new Error('product boundary: CORE parent mismatch');
  if (core.control_ref !== 'system-master/control-v2') throw new Error('product boundary: CORE control ref mismatch');
  const report = {
    ref,
    authority_id: authority.authority_id,
    selected_topology: authority.topology,
    product_root: authority.product_root,
    core_control_ref: authority.core_control_ref,
    core_parent: core.parent_id,
    result: 'PASS',
  };
  fs.writeFileSync(path.join(evidence, 'product-root-boundary.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`PRODUCT_ROOT_BOUNDARY_PASS authority=${authority.authority_id} topology=${authority.topology}`);
}

try {
  const commit = run('git', ['rev-parse', 'HEAD']);
  fs.writeFileSync(path.join(evidence, 'subject.txt'), [
    'component=System Root & Authority Registry',
    `commit=${commit}`,
    'architecture=system-master/foundation-spine/SYSTEM-SPECIFICATION.md',
    'qualification_class=HOSTED_PORTABLE',
    'a01_standing=NOT EXECUTED — ENVIRONMENT UNAVAILABLE',
    '',
  ].join('\n'));

  const javaVersion = run('java', ['-version'], { evidence: 'java-version.txt' });
  const javacVersion = run('javac', ['-version'], { evidence: 'javac-version.txt' });
  void javaVersion; void javacVersion;

  const main = path.join(packageRoot, 'src', 'main', 'java', 'org', 'systemmaster', 'foundation', 'root');
  const test = path.join(packageRoot, 'src', 'test', 'java', 'org', 'systemmaster', 'foundation', 'root');
  const sources = [
    path.join(main, 'AuthorityRegistry.java'),
    path.join(main, 'AuthorityJournal.java'),
    path.join(main, 'FoundationAuthorityBootstrap.java'),
    path.join(test, 'AuthorityRegistryQualificationTest.java'),
    path.join(test, 'AuthorityRegistryPerformanceTest.java'),
  ];
  for (const source of sources) if (!fs.existsSync(source)) throw new Error(`missing source ${path.relative(root, source)}`);

  run('javac', ['--release', '21', '-Xlint:all', '-Werror', '-d', classes, ...sources], { evidence: 'compile.txt' });
  const qualification = run('java', ['-cp', classes, 'org.systemmaster.foundation.root.AuthorityRegistryQualificationTest'], { evidence: 'qualification.txt' });
  if (!qualification.includes('PASS FOUNDATION_SYSTEM_ROOT')) throw new Error('qualification completion predicate missing');

  const performance = run('java', ['-cp', classes, 'org.systemmaster.foundation.root.AuthorityRegistryPerformanceTest'], { evidence: 'performance.txt' });
  if (!performance.includes('PASS FOUNDATION_SYSTEM_ROOT_PERFORMANCE')) throw new Error('performance completion predicate missing');

  validateProductBoundary();
  fs.writeFileSync(path.join(evidence, 'result.txt'), 'result=PASS\n');
  console.log(qualification);
  console.log(performance);
  console.log('PASS FOUNDATION_SYSTEM_ROOT_HOSTED');
  console.log(`evidence_dir=${evidence}`);
} catch (error) {
  fs.writeFileSync(path.join(evidence, 'result.txt'), 'result=FAIL\n');
  fs.writeFileSync(path.join(evidence, 'failure.txt'), `${error && error.stack ? error.stack : String(error)}\n`);
  console.error(error && error.stack ? error.stack : error);
  console.error(`evidence_dir=${evidence}`);
  process.exit(1);
}
