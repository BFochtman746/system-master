import { createHash } from 'node:crypto';

export const REPAIR_MUTATION_READINESS_PROTOCOL = 'control-gateway.a01-repository-repair-mutation-readiness.v1';
export const GITHUB_NATIVE_COMMAND_PROTOCOL = 'control-gateway.github-native-command.v1';
export const GITHUB_MUTATION_REQUEST_PROTOCOL = 'control-gateway.github-mutation-request.v1';
export const GITHUB_PRODUCTION_MUTATION_PLAN_PROTOCOL = 'control-gateway.github-production-mutation-plan.v1';

const SHA1 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/;
const REPO = /^[^/\s]+\/[^/\s]+$/;
const REF = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;
const ACTIVE_LANES = new Set(['CORE','LEARNING','BOOK','DOCUMENTS','SPREADSHEET_DATA','MEDIA','CONNECTED_ACTIONS','RESEARCH_KNOWLEDGE','PROGRAMMING']);
const PROTECTED_PATHS = new Set([
  'governance/CURRENT-AUTHORITY.json',
  'governance/SYSTEM-TOPOLOGY-007.json',
  'governance/SYSTEM-PROGRAM-JOB-LOCK-001.json',
  '.github/scripts/control-gateway-production-writer.js',
  'control-gateway/src/development-response-governor.js',
  'control-gateway/src/development-response-production-enforcement.js'
]);

export class RepairMutationReadinessError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RepairMutationReadinessError';
    this.code = code;
  }
}
function fail(code, message) { throw new RepairMutationReadinessError(code, message); }
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SCHEMA_INVALID', `${label} must be an object`); return value; }
function exactKeys(value, keys, label) {
  object(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail('SCHEMA_INVALID', `${label} fields must be exact`);
}
function str(value, label, pattern = null) {
  if (typeof value !== 'string' || !value || value.trim() !== value) fail('SCHEMA_INVALID', `${label} must be non-empty trimmed text`);
  if (pattern && !pattern.test(value)) fail('SCHEMA_INVALID', `${label} has invalid format`);
  return value;
}
function exactPath(value, label) {
  str(value, label);
  if (value.startsWith('/') || value.includes('\\') || value.includes('\0')) fail('PATH_INVALID', `${label} is unsafe`);
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || part.includes('*'))) fail('PATH_INVALID', `${label} must be an exact repository path`);
  if (value.startsWith('control-gateway-state/')) fail('PATH_FORBIDDEN', `${label} may not target active-work state storage`);
  if (PROTECTED_PATHS.has(value)) fail('PATH_FORBIDDEN', `${label} is a protected control surface`);
  return value;
}
function sha256(text) { return createHash('sha256').update(text, 'utf8').digest('hex'); }
function sortedUnique(values, label) {
  const sorted = [...values].sort();
  for (let i = 1; i < sorted.length; i += 1) if (sorted[i] === sorted[i - 1]) fail('DUPLICATE_PATH', `${label} contains duplicate ${sorted[i]}`);
  return sorted;
}
function canonical(value) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') { if (!Number.isFinite(value)) fail('SCHEMA_INVALID', 'non-finite number'); return JSON.stringify(value); }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  object(value, 'canonical value');
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}

function validateAuthority(a) {
  exactKeys(a, ['mission_version','workstream_id','authority_epoch','authority_publication_commit_sha','authority_packet_digest','authoritative_subject','repository','target_ref','operation_id','predecessor_receipt_id'], 'authority');
  str(a.mission_version, 'authority.mission_version');
  str(a.workstream_id, 'authority.workstream_id', ID);
  if (!Number.isSafeInteger(a.authority_epoch) || a.authority_epoch < 1) fail('AUTHORITY_INVALID', 'authority_epoch must be positive');
  str(a.authority_publication_commit_sha, 'authority.authority_publication_commit_sha', SHA1);
  str(a.authority_packet_digest, 'authority.authority_packet_digest', SHA256);
  exactKeys(a.authoritative_subject, ['algorithm','oid'], 'authority.authoritative_subject');
  if (a.authoritative_subject.algorithm !== 'sha1') fail('AUTHORITY_INVALID', 'authoritative subject must use sha1');
  str(a.authoritative_subject.oid, 'authority.authoritative_subject.oid', SHA1);
  str(a.repository, 'authority.repository', REPO);
  str(a.target_ref, 'authority.target_ref', REF);
  str(a.operation_id, 'authority.operation_id', ID);
  if (a.predecessor_receipt_id !== null) str(a.predecessor_receipt_id, 'authority.predecessor_receipt_id', ID);
}
function validateClaim(c) {
  exactKeys(c, ['lane','delegation_id','lease_id','dispatch_id','idempotency_key','fencing_token','control_head'], 'claim');
  if (!ACTIVE_LANES.has(c.lane)) fail('CLAIM_INVALID', `unsupported lane ${String(c.lane)}`);
  for (const key of ['delegation_id','lease_id','dispatch_id','idempotency_key']) str(c[key], `claim.${key}`);
  if (!Number.isSafeInteger(c.fencing_token) || c.fencing_token < 1) fail('CLAIM_INVALID', 'fencing_token must be positive');
  str(c.control_head, 'claim.control_head', SHA1);
}
function validatePreflight(p) {
  exactKeys(p, ['standing','repository_commit_sha'], 'preflight');
  if (p.standing !== 'SAFE_TO_REPAIR') fail('PREFLIGHT_BLOCKED', 'repository repair preflight is not SAFE_TO_REPAIR');
  str(p.repository_commit_sha, 'preflight.repository_commit_sha', SHA1);
}
function validateQualification(q) {
  exactKeys(q, ['result_class','subject_sha','evidence_pointer','promotion_authorized'], 'qualification');
  if (q.result_class !== 'PASS') fail('QUALIFICATION_REQUIRED', 'exact-subject qualification must PASS');
  str(q.subject_sha, 'qualification.subject_sha', SHA1);
  str(q.evidence_pointer, 'qualification.evidence_pointer');
  if (q.promotion_authorized !== false) fail('PROMOTION_FORBIDDEN', 'A-01 qualification may not self-authorize promotion');
}
function validatePlan(plan) {
  exactKeys(plan, ['protocol_version','mutation_id','repository','target_kind','target_ref','expected_predecessor_sha','commit_message','writes','deletes'], 'mutation_plan');
  if (plan.protocol_version !== GITHUB_PRODUCTION_MUTATION_PLAN_PROTOCOL) fail('PLAN_INVALID', 'mutation plan protocol mismatch');
  str(plan.mutation_id, 'mutation_plan.mutation_id', ID);
  str(plan.repository, 'mutation_plan.repository', REPO);
  if (plan.target_kind !== 'WORK_REF') fail('PLAN_INVALID', 'repository cleanup may mutate only a work ref');
  str(plan.target_ref, 'mutation_plan.target_ref', REF);
  str(plan.expected_predecessor_sha, 'mutation_plan.expected_predecessor_sha', SHA1);
  str(plan.commit_message, 'mutation_plan.commit_message');
  if (plan.commit_message.length > 4096) fail('PLAN_INVALID', 'commit message too long');
  if (!Array.isArray(plan.writes) || !Array.isArray(plan.deletes)) fail('PLAN_INVALID', 'writes/deletes must be arrays');
  if (plan.writes.length + plan.deletes.length < 1 || plan.writes.length + plan.deletes.length > 12) fail('PLAN_INVALID', 'bounded cleanup requires 1..12 exact paths per mutation');
  let bytes = 0;
  const paths = [];
  for (const [index, write] of plan.writes.entries()) {
    exactKeys(write, ['path','content_utf8','content_sha256'], `mutation_plan.writes[${index}]`);
    exactPath(write.path, `mutation_plan.writes[${index}].path`);
    if (typeof write.content_utf8 !== 'string') fail('PLAN_INVALID', `mutation_plan.writes[${index}].content_utf8 must be text`);
    str(write.content_sha256, `mutation_plan.writes[${index}].content_sha256`, SHA256);
    if (sha256(write.content_utf8) !== write.content_sha256) fail('PLAN_INVALID', `content digest mismatch for ${write.path}`);
    bytes += Buffer.byteLength(write.content_utf8, 'utf8');
    paths.push(write.path);
  }
  for (const [index, p] of plan.deletes.entries()) { exactPath(p, `mutation_plan.deletes[${index}]`); paths.push(p); }
  if (bytes > 262144) fail('PLAN_INVALID', 'bounded cleanup write payload exceeds 256 KiB');
  return sortedUnique(paths, 'mutation plan paths');
}
function validateResponse(receipt, responseBase64) {
  str(responseBase64, 'development_response_base64');
  exactKeys(receipt, ['protocol_version','contract_id','contract_digest','response_class','response_digest','authority_context_digest','compliance','receipt_digest'], 'development_response_receipt');
  if (receipt.protocol_version !== 'control-gateway.development-response-receipt.v1' || receipt.contract_id !== 'SYSTEM-MASTER-DEVELOPMENT-RESPONSE-GOVERNOR-001' || receipt.compliance !== 'PASS') fail('RESPONSE_RECEIPT_REQUIRED', 'current PASS development-response receipt required');
  for (const k of ['contract_digest','response_digest','authority_context_digest','receipt_digest']) str(receipt[k], `development_response_receipt.${k}`, SHA256);
}

export function buildRepositoryRepairMutationCommand(input) {
  exactKeys(input, ['protocol_version','command_id','state_ref','authority','preflight','claim','qualification','mutation_plan','effects','development_response_base64','development_response_receipt'], 'input');
  if (input.protocol_version !== REPAIR_MUTATION_READINESS_PROTOCOL) fail('PROTOCOL_INVALID', 'repair mutation readiness protocol mismatch');
  str(input.command_id, 'command_id', ID);
  str(input.state_ref, 'state_ref', REF);
  if (!input.state_ref.startsWith('control-gateway-state/active-work/')) fail('AUTHORITY_INVALID', 'state_ref must be active-work authority');
  validateAuthority(input.authority);
  validatePreflight(input.preflight);
  validateClaim(input.claim);
  validateQualification(input.qualification);
  const paths = validatePlan(input.mutation_plan);
  validateResponse(input.development_response_receipt, input.development_response_base64);
  if (!Array.isArray(input.effects) || input.effects.length < 1) fail('SCHEMA_INVALID', 'effects must be a non-empty array');
  const effects = sortedUnique(input.effects.map((v, i) => str(v, `effects[${i}]`, ID)), 'effects');

  const a = input.authority;
  const p = input.preflight;
  const q = input.qualification;
  const plan = input.mutation_plan;
  if (a.repository !== plan.repository || a.target_ref !== plan.target_ref) fail('BINDING_MISMATCH', 'plan repository/ref differs from authority');
  if (p.repository_commit_sha !== plan.expected_predecessor_sha) fail('BINDING_MISMATCH', 'preflight subject differs from mutation predecessor');
  if (a.authoritative_subject.oid !== p.repository_commit_sha) fail('BINDING_MISMATCH', 'authority subject differs from repair preflight subject');
  if (q.subject_sha !== p.repository_commit_sha) fail('BINDING_MISMATCH', 'qualification subject differs from repair preflight subject');
  if (!effects.includes('CONTROL_GATEWAY_DEVELOPMENT_WRITE')) fail('EFFECT_REQUIRED', 'cleanup mutation must remain behind control-gateway development write authority');

  const request = {
    protocol_version: GITHUB_MUTATION_REQUEST_PROTOCOL,
    mutation_id: plan.mutation_id,
    mission_version: a.mission_version,
    workstream_id: a.workstream_id,
    authority_epoch: a.authority_epoch,
    authority_publication_commit_sha: a.authority_publication_commit_sha,
    authority_packet_digest: a.authority_packet_digest,
    authoritative_subject: structuredClone(a.authoritative_subject),
    repository: a.repository,
    target_kind: 'WORK_REF',
    target_ref: a.target_ref,
    expected_predecessor_sha: plan.expected_predecessor_sha,
    operation_id: a.operation_id,
    predecessor_receipt_id: a.predecessor_receipt_id,
    paths,
    effects
  };
  const command = {
    protocol_version: GITHUB_NATIVE_COMMAND_PROTOCOL,
    command_id: input.command_id,
    kind: 'PRODUCTION_MUTATION',
    state_ref: input.state_ref,
    mutation_request: request,
    mutation_plan: structuredClone(plan),
    development_response_base64: input.development_response_base64,
    development_response_receipt: structuredClone(input.development_response_receipt)
  };
  return Object.freeze({
    standing: 'MUTATION_READY_FOR_EXISTING_PRODUCTION_WRITER',
    direct_github_write_authority: false,
    promotion_authority: false,
    branch_deletion_authority: false,
    claim: Object.freeze(structuredClone(input.claim)),
    command: Object.freeze(command),
    command_digest: sha256(canonical(command))
  });
}
