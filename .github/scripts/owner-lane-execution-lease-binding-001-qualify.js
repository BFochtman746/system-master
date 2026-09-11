'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.env.GITHUB_WORKSPACE || process.cwd();
const temp = process.env.RUNNER_TEMP || path.join(root, '.tmp');
const outDir = path.join(temp, `owner-lane-execution-lease-binding-${process.env.GITHUB_RUN_ID || 'local'}`);
fs.mkdirSync(outDir, { recursive: true });

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', shell: false });
  const output = `${r.stdout || ''}${r.stderr || ''}`;
  if (r.error || r.status !== 0) throw new Error(`${cmd.toUpperCase()}_FAILED:${r.error ? r.error.message : output}`);
  return output;
}
function write(name, value) {
  fs.writeFileSync(path.join(outDir, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', 'utf8');
}

try {
  const subjectSha = run('git', ['rev-parse', 'HEAD']).trim();
  const contract = JSON.parse(fs.readFileSync(path.join(root, 'governance/execution/SYSTEM-MASTER-OWNER-LANE-EXECUTION-LEASE-BINDING-001.json'), 'utf8'));
  if (contract.contract_id !== 'SYSTEM-MASTER-OWNER-LANE-EXECUTION-LEASE-BINDING-001') throw new Error('CONTRACT_ID_MISMATCH');
  if (contract.existing_authority_reused.new_lease_authority_created !== false) throw new Error('DUPLICATE_LEASE_AUTHORITY_CREATED');
  if (contract.durable_adoption_requirement.this_contract_alone_proves_cross_process_exclusion !== false) throw new Error('FALSE_DURABLE_ENFORCEMENT_CLAIM');
  if (!contract.active_owner_lanes.includes('SYSTEM_MASTER/BOOK') || contract.active_owner_lanes.includes('SYSTEM_MASTER/PROSE')) throw new Error('OWNER_LANE_SET_INVALID');

  const src = path.join(root, 'system-master/f-wp-007/src/main/java/org/systemmaster/core');
  const tests = path.join(root, 'system-master/f-wp-007/src/test/java/org/systemmaster/core');
  const classes = path.join(outDir, 'classes');
  fs.mkdirSync(classes, { recursive: true });
  const sources = [
    'CoordinationContracts.java',
    'ExecutionLeaseManager.java',
    'ConflictDetector.java',
    'ChangeCoordinator.java',
    'OwnerLaneExecutionLeaseCoordinator.java'
  ].map(f => path.join(src, f));
  const testSources = [
    path.join(tests, 'Fwp007QualificationTest.java'),
    path.join(tests, 'OwnerLaneExecutionLeaseCoordinatorTest.java')
  ];

  const compile = run('javac', ['-encoding', 'UTF-8', '-d', classes, ...sources, ...testSources]);
  write('compile.txt', compile || 'javac=PASS\n');

  const fwp007 = run('java', ['-cp', classes, 'org.systemmaster.core.Fwp007QualificationTest']);
  if (!fwp007.includes('PASS F-WP-007 tests=46 requirements=9')) throw new Error(`FWP007_REGRESSION_FAILED:${fwp007}`);
  write('fwp007-regression.txt', fwp007);

  const binding = run('java', ['-cp', classes, 'org.systemmaster.core.OwnerLaneExecutionLeaseCoordinatorTest']);
  if (!binding.includes('PASS OWNER-LANE-EXECUTION-LEASE-BINDING tests=27')) throw new Error(`BINDING_QUALIFICATION_SENTINEL_MISSING:${binding}`);
  write('binding-qualification.txt', binding);

  const summary = {
    qualification_id: 'SYSTEM-MASTER-OWNER-LANE-EXECUTION-LEASE-BINDING-001-QUALIFICATION',
    result: 'PASS',
    subject_sha: subjectSha,
    fixture_class: 'HOSTED_SYNTHETIC_OWNER_LANE_COORDINATION',
    binding_tests: 27,
    fwp007_regression_tests: 46,
    total_tests: 73,
    active_owner_lanes: contract.active_owner_lanes,
    foreground_second_shift_mutual_exclusion_proven_in_model: true,
    branch_head_drift_rejected: true,
    packet_drift_rejected: true,
    stale_fence_rejected: true,
    expired_claim_new_epoch_proven: true,
    read_only_inspection_without_mutation_claim_proven: true,
    durable_cross_process_registry_proven: false,
    foreground_chat_adoption_proven: false,
    second_shift_adoption_proven: false,
    a01_target_pass_claimed: false,
    semantic_authority_broadened: false,
    exact_successor: contract.exact_successor_if_qualified
  };
  write('summary.json', summary);
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  const detail = error && error.stack ? error.stack : String(error);
  write('failure.txt', detail + '\n');
  write('summary.json', { qualification_id: 'SYSTEM-MASTER-OWNER-LANE-EXECUTION-LEASE-BINDING-001-QUALIFICATION', result: 'FAIL', detail });
  console.error(detail);
  process.exit(1);
}
