import { sha256 } from './active-work-state.js';
import { GitHubMutationAdmissionGate, validateAdmissionReceipt } from './github-mutation-admission.js';
import {
  admitA01Execution,
  buildA01SupervisorHandoff,
  validateA01AdmissionReceipt,
  validateA01SupervisorHandoff
} from './a01-supervisor-handoff.js';
import {
  assertDevelopmentResponseAuthorization,
  developmentResponseReceiptDigest,
  verifyDevelopmentResponseReceipt
} from './development-response-governor.js';

export const GOVERNED_GITHUB_ADMISSION_PROTOCOL = 'control-gateway.governed-github-admission.v1';
export const GOVERNED_A01_ADMISSION_PROTOCOL = 'control-gateway.governed-a01-admission.v1';
export const GOVERNED_A01_HANDOFF_PROTOCOL = 'control-gateway.governed-a01-supervisor-handoff.v1';

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

function digestWithout(value, field) {
  const copy = structuredClone(value);
  delete copy[field];
  return sha256(copy);
}

export function buildGitHubDevelopmentResponseAuthorityContext(request, authority) {
  return {
    channel: 'GITHUB_MUTATION',
    mission_version: authority.mission_version,
    workstream_id: authority.workstream_id,
    authority_epoch: authority.authority_epoch,
    authority_publication_commit_sha: authority.publication_commit_sha,
    authority_packet_digest: authority.packet_digest,
    repository: authority.repository,
    authority_ref: authority.branch_or_ref,
    operation_id: request.operation_id,
    predecessor_receipt_id: request.predecessor_receipt_id
  };
}

export function buildA01DevelopmentResponseAuthorityContext(request, authority) {
  return {
    channel: 'A01_EXECUTION',
    mission_version: authority.mission_version,
    workstream_id: authority.workstream_id,
    authority_epoch: authority.authority_epoch,
    authority_publication_commit_sha: authority.publication_commit_sha,
    authority_packet_digest: authority.packet_digest,
    repository: authority.repository,
    authority_ref: authority.branch_or_ref,
    authority_ref_head_sha: request.authority_ref_head_sha,
    operation_id: request.operation_id,
    predecessor_receipt_id: request.predecessor_receipt_id,
    lane: request.lane,
    owner_path: request.owner_path,
    delegation_id: request.delegation_id,
    objective_id: request.objective_id,
    control_ref: request.control_ref,
    control_head: request.control_head
  };
}

function governedGithubDigest(envelope) { return digestWithout(envelope, 'governed_digest'); }
function governedA01Digest(envelope) { return digestWithout(envelope, 'governed_digest'); }
function governedA01HandoffDigest(envelope) { return digestWithout(envelope, 'governed_digest'); }

export class GovernedGitHubMutationAdmissionGate {
  constructor({ reconstructionAdapter, mutationTransport, rawAdmissionGate = null }) {
    if (!reconstructionAdapter || typeof reconstructionAdapter.reconstructContinuation !== 'function') throw new TypeError('reconstructionAdapter.reconstructContinuation function required');
    this.reconstructionAdapter = reconstructionAdapter;
    this.rawAdmissionGate = rawAdmissionGate ?? new GitHubMutationAdmissionGate({ reconstructionAdapter, mutationTransport });
  }

  async admit(request, { responseText, responseReceipt } = {}) {
    const authority = await this.reconstructionAdapter.reconstructContinuation();
    const authorityContext = buildGitHubDevelopmentResponseAuthorityContext(request, authority);
    assertDevelopmentResponseAuthorization({ responseText, responseReceipt, authorityContext });
    const admissionReceipt = await this.rawAdmissionGate.admit(request);
    validateAdmissionReceipt(admissionReceipt);
    const envelope = {
      protocol_version: GOVERNED_GITHUB_ADMISSION_PROTOCOL,
      response_receipt: structuredClone(responseReceipt),
      response_receipt_digest: developmentResponseReceiptDigest(responseReceipt),
      admission_receipt: structuredClone(admissionReceipt),
      governed_digest: ''
    };
    envelope.governed_digest = governedGithubDigest(envelope);
    return freeze(envelope);
  }

  async verifyGrantFresh(envelope, request, responseText) {
    if (!envelope || envelope.protocol_version !== GOVERNED_GITHUB_ADMISSION_PROTOCOL) throw new TypeError('governed GitHub admission envelope required');
    if (envelope.response_receipt_digest !== developmentResponseReceiptDigest(envelope.response_receipt)) throw new Error('GOVERNED_GITHUB_RESPONSE_RECEIPT_DIGEST_MISMATCH');
    if (envelope.governed_digest !== governedGithubDigest(envelope)) throw new Error('GOVERNED_GITHUB_DIGEST_MISMATCH');
    validateAdmissionReceipt(envelope.admission_receipt);
    const authority = await this.reconstructionAdapter.reconstructContinuation();
    verifyDevelopmentResponseReceipt({ responseText, receipt: envelope.response_receipt, authorityContext: buildGitHubDevelopmentResponseAuthorityContext(request, authority) });
    return this.rawAdmissionGate.verifyGrantFresh(envelope.admission_receipt, request);
  }
}

export function admitGovernedA01Execution({ request, authority, responseText, responseReceipt }) {
  const authorityContext = buildA01DevelopmentResponseAuthorityContext(request, authority);
  assertDevelopmentResponseAuthorization({ responseText, responseReceipt, authorityContext });
  const admissionReceipt = admitA01Execution({ request, authority });
  validateA01AdmissionReceipt(admissionReceipt);
  const envelope = {
    protocol_version: GOVERNED_A01_ADMISSION_PROTOCOL,
    response_receipt: structuredClone(responseReceipt),
    response_receipt_digest: developmentResponseReceiptDigest(responseReceipt),
    admission_receipt: structuredClone(admissionReceipt),
    governed_digest: ''
  };
  envelope.governed_digest = governedA01Digest(envelope);
  return freeze(envelope);
}

export function buildGovernedA01SupervisorHandoff({ request, authority, governedAdmission, responseText, payload = {} }) {
  if (!governedAdmission || governedAdmission.protocol_version !== GOVERNED_A01_ADMISSION_PROTOCOL) throw new TypeError('governed A-01 admission envelope required');
  if (governedAdmission.response_receipt_digest !== developmentResponseReceiptDigest(governedAdmission.response_receipt)) throw new Error('GOVERNED_A01_RESPONSE_RECEIPT_DIGEST_MISMATCH');
  if (governedAdmission.governed_digest !== governedA01Digest(governedAdmission)) throw new Error('GOVERNED_A01_DIGEST_MISMATCH');
  verifyDevelopmentResponseReceipt({ responseText, receipt: governedAdmission.response_receipt, authorityContext: buildA01DevelopmentResponseAuthorityContext(request, authority) });
  validateA01AdmissionReceipt(governedAdmission.admission_receipt);
  const handoff = buildA01SupervisorHandoff({ request, admissionReceipt: governedAdmission.admission_receipt, payload });
  validateA01SupervisorHandoff(handoff);
  const envelope = {
    protocol_version: GOVERNED_A01_HANDOFF_PROTOCOL,
    response_receipt_digest: governedAdmission.response_receipt_digest,
    governed_admission_digest: governedAdmission.governed_digest,
    supervisor_handoff: structuredClone(handoff),
    governed_digest: ''
  };
  envelope.governed_digest = governedA01HandoffDigest(envelope);
  return freeze(envelope);
}
