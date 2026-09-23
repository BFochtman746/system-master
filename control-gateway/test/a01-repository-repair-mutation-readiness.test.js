import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { buildRepositoryRepairMutationCommand, RepairMutationReadinessError, REPAIR_MUTATION_READINESS_PROTOCOL } from './a01-repository-repair-mutation-readiness.js';

const sha = (c) => c.repeat(40);
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const receipt = {
  protocol_version: 'control-gateway.development-response-receipt.v1',
  contract_id: 'SYSTEM-MASTER-DEVELOPMENT-RESPONSE-GOVERNOR-001',
  contract_digest: 'a'.repeat(64), response_class: 'CONTINUATION', response_digest: 'b'.repeat(64),
  authority_context_digest: 'c'.repeat(64), compliance: 'PASS', receipt_digest: 'd'.repeat(64)
};
function input() {
  const content = 'cleaned\n';
  return {
    protocol_version: REPAIR_MUTATION_READINESS_PROTOCOL,
    command_id: 'GATE4-TEST-001',
    state_ref: 'control-gateway-state/active-work/second-shift-production-master-completion-001h-main-reconciliation-001',
    authority: {
      mission_version: 'SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v1.0', workstream_id: 'SECOND-SHIFT-PRODUCTION-MASTER-COMPLETION', authority_epoch: 62,
      authority_publication_commit_sha: sha('1'), authority_packet_digest: '2'.repeat(64), authoritative_subject: { algorithm: 'sha1', oid: sha('3') },
      repository: 'BFochtman746/system-master', target_ref: 'main', operation_id: 'SECOND-SHIFT-PRODUCTION-MASTER-COMPLETION-001H', predecessor_receipt_id: 'SECOND-SHIFT-PRODUCTION-MASTER-COMPLETION-001G-RECEIPT'
    },
    preflight: { standing: 'SAFE_TO_REPAIR', repository_commit_sha: sha('3') },
    claim: { lane: 'CORE', delegation_id: 'd-1', lease_id: 'lease-1', dispatch_id: 'dispatch-1', idempotency_key: 'idem-1', fencing_token: 7, control_head: sha('4') },
    qualification: { result_class: 'PASS', subject_sha: sha('3'), evidence_pointer: 'artifact:test', promotion_authorized: false },
    mutation_plan: {
      protocol_version: 'control-gateway.github-production-mutation-plan.v1', mutation_id: 'GATE4-TEST-MUTATION-001', repository: 'BFochtman746/system-master', target_kind: 'WORK_REF', target_ref: 'main', expected_predecessor_sha: sha('3'), commit_message: 'cleanup: bounded test',
      writes: [{ path: 'tests/cleanup-target.txt', content_utf8: content, content_sha256: sha256(content) }], deletes: []
    },
    effects: ['CONTROL_GATEWAY_DEVELOPMENT_WRITE'], development_response_base64: 'IyMgU1RBVFVT', development_response_receipt: structuredClone(receipt)
  };
}
function code(fn) { try { fn(); assert.fail('expected failure'); } catch (e) { assert.ok(e instanceof RepairMutationReadinessError); return e.code; } }

test('builds a mutation command but grants no direct writer authority', () => {
  const out = buildRepositoryRepairMutationCommand(input());
  assert.equal(out.standing, 'MUTATION_READY_FOR_EXISTING_PRODUCTION_WRITER');
  assert.equal(out.direct_github_write_authority, false);
  assert.equal(out.command.kind, 'PRODUCTION_MUTATION');
  assert.equal(out.command.mutation_request.expected_predecessor_sha, sha('3'));
  assert.deepEqual(out.command.mutation_request.paths, ['tests/cleanup-target.txt']);
  assert.match(out.command_digest, /^[0-9a-f]{64}$/);
});

test('blocks stale repair preflight', () => { const v=input(); v.preflight.standing='REPAIR_BLOCKED_BY_STALE_CONTROL_TRUTH'; assert.equal(code(()=>buildRepositoryRepairMutationCommand(v)), 'PREFLIGHT_BLOCKED'); });
test('blocks stale authority subject', () => { const v=input(); v.authority.authoritative_subject.oid=sha('5'); assert.equal(code(()=>buildRepositoryRepairMutationCommand(v)), 'BINDING_MISMATCH'); });
test('blocks qualification on a different exact subject', () => { const v=input(); v.qualification.subject_sha=sha('5'); assert.equal(code(()=>buildRepositoryRepairMutationCommand(v)), 'BINDING_MISMATCH'); });
test('blocks worker promotion authority', () => { const v=input(); v.qualification.promotion_authorized=true; assert.equal(code(()=>buildRepositoryRepairMutationCommand(v)), 'PROMOTION_FORBIDDEN'); });
test('blocks invalid fencing token', () => { const v=input(); v.claim.fencing_token=0; assert.equal(code(()=>buildRepositoryRepairMutationCommand(v)), 'CLAIM_INVALID'); });
test('blocks protected authority files', () => { const v=input(); const c='x\n'; v.mutation_plan.writes=[{path:'governance/CURRENT-AUTHORITY.json',content_utf8:c,content_sha256:sha256(c)}]; assert.equal(code(()=>buildRepositoryRepairMutationCommand(v)), 'PATH_FORBIDDEN'); });
test('blocks active-work state writes', () => { const v=input(); const c='x\n'; v.mutation_plan.writes=[{path:'control-gateway-state/active-work/head.json',content_utf8:c,content_sha256:sha256(c)}]; assert.equal(code(()=>buildRepositoryRepairMutationCommand(v)), 'PATH_FORBIDDEN'); });
test('blocks arbitrary extra command fields', () => { const v=input(); v.run='rm -rf /'; assert.equal(code(()=>buildRepositoryRepairMutationCommand(v)), 'SCHEMA_INVALID'); });
test('blocks mutation batches over twelve paths', () => { const v=input(); v.mutation_plan.deletes=Array.from({length:13},(_,i)=>`archive/dead-${i}.txt`); v.mutation_plan.writes=[]; assert.equal(code(()=>buildRepositoryRepairMutationCommand(v)), 'PLAN_INVALID'); });
test('requires the existing production-writer effect', () => { const v=input(); v.effects=['SECOND_SHIFT_CONTROLLER_INTEGRATION']; assert.equal(code(()=>buildRepositoryRepairMutationCommand(v)), 'EFFECT_REQUIRED'); });
test('blocks tampered write content digest', () => { const v=input(); v.mutation_plan.writes[0].content_sha256='0'.repeat(64); assert.equal(code(()=>buildRepositoryRepairMutationCommand(v)), 'PLAN_INVALID'); });
