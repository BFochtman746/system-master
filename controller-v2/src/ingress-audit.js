import { sha256 } from './canonical.js';
import { ControllerError } from './errors.js';
import { flushDurabilityBarrier } from './github-journal-publisher.js';

export const INGRESS_REJECTION_REASONS = Object.freeze(new Set([
  'INVALID_REF','TAG_IDENTITY_MISMATCH','TAG_TARGET_INVALID','COMMAND_JSON_INVALID',
  'COMMAND_NONCANONICAL','COMMAND_SCHEMA_INVALID','COMMAND_ID_MISMATCH',
  'FINGERPRINT_INVALID','COMMAND_TOO_LARGE','AUTHORITY_INVALID','UNKNOWN'
]));

const CODE_TO_REASON = Object.freeze({
  INBOX_REF_INVALID:'INVALID_REF',
  INBOX_TAG_IDENTITY_MISMATCH:'TAG_IDENTITY_MISMATCH',
  INBOX_TAG_TARGET_INVALID:'TAG_TARGET_INVALID',
  INBOX_COMMAND_JSON_INVALID:'COMMAND_JSON_INVALID',
  INBOX_COMMAND_NONCANONICAL:'COMMAND_NONCANONICAL',
  SCHEMA_INVALID:'COMMAND_SCHEMA_INVALID',
  SCHEMA_UNKNOWN_FIELD:'COMMAND_SCHEMA_INVALID',
  SCHEMA_MISSING_FIELD:'COMMAND_SCHEMA_INVALID',
  UNSUPPORTED_PROTOCOL:'COMMAND_SCHEMA_INVALID',
  UNSUPPORTED_SCHEMA:'COMMAND_SCHEMA_INVALID',
  INBOX_COMMAND_ID_MISMATCH:'COMMAND_ID_MISMATCH',
  INBOX_FINGERPRINT_INVALID:'FINGERPRINT_INVALID',
  FINGERPRINT_MISMATCH:'FINGERPRINT_INVALID',
  INBOX_COMMAND_TOO_LARGE:'COMMAND_TOO_LARGE'
});

function oid(value){return typeof value==='string'&&/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value)?value:null;}
function boundedRef(value){if(typeof value!=='string'||value.length===0||value.length>512)throw new ControllerError('INGRESS_AUDIT_INVALID','bounded source ref required');return value;}
export function ingressRejectionReason(error){if(String(error?.code??'').startsWith('INGRESS_'))return 'AUTHORITY_INVALID';return CODE_TO_REASON[error?.code]??'UNKNOWN';}

export async function recordDurableIngressRejection({kernel,journal,ref,tagSha=null,blobSha=null,error=null,reasonCode=null,occurredAt=new Date().toISOString()}){
  if(!kernel?.atomic||!kernel?.appendEvent||!kernel?.currentStreamVersion)throw new ControllerError('INGRESS_AUDIT_INVALID','ControllerKernel required');
  if(!journal?.getCheckpoint||!journal?.appendBatch)throw new ControllerError('INGRESS_AUDIT_INVALID','durable journal required');
  const sourceRef=boundedRef(ref);
  const reason=reasonCode??ingressRejectionReason(error);
  if(!INGRESS_REJECTION_REASONS.has(reason))throw new ControllerError('INGRESS_AUDIT_INVALID','unrecognized bounded rejection reason');
  const streamId=`ingress:${sha256(sourceRef)}`;
  const data={source_ref:sourceRef,tag_sha:oid(tagSha),blob_sha:oid(blobSha),reason_code:reason};
  const event=kernel.atomic(()=>kernel.appendEvent(streamId,kernel.currentStreamVersion(streamId),'ingress.rejected',data,occurredAt));
  const durability=await flushDurabilityBarrier(kernel,journal);
  return Object.freeze({event_id:event.event_id,event_digest:event.event_digest,stream_id:streamId,reason_code:reason,durability});
}
