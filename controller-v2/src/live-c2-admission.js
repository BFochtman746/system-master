import { digestC1Receipt } from './live-c1-runner.js';
import { CANONICAL_JOURNAL_REPOSITORY, CANONICAL_SUBJECT_REPOSITORY, preflightLiveJournalQualification } from './live-journal-qualification.js';
import { ControllerError } from './errors.js';

const C1_SCHEMA='controller://qualification/c1-preflight/v2';
const ALLOWED_RECEIPT_FIELDS=new Set(['schema','qualification_id','result','qualified_for_live_journal_mutation','controller_commit','policy_digest','journal_repository','journal_repository_id','subject_repository','default_branch','seed_head','receipt_digest']);
function fail(code,message,details={}){throw new ControllerError(code,message,details);}
function hex(value,n){return new RegExp(`^[0-9a-f]{${n}}$`).test(String(value??''));}

export function validateC1ReceiptForC2(receipt,{expectedControllerCommit,expectedPolicyDigest}={}){
  if(!receipt||typeof receipt!=='object'||Array.isArray(receipt))fail('C2_C1_RECEIPT_REQUIRED','C1 PASS receipt is required');
  for(const key of Object.keys(receipt))if(!ALLOWED_RECEIPT_FIELDS.has(key))fail('C2_C1_RECEIPT_UNKNOWN_FIELD',`unknown C1 receipt field: ${key}`);
  if(receipt.schema!==C1_SCHEMA)fail('C2_C1_RECEIPT_SCHEMA_MISMATCH','C1 receipt schema is not supported');
  if(receipt.result!=='PASS'||receipt.qualified_for_live_journal_mutation!==true)fail('C2_C1_RECEIPT_NOT_PASS','C1 receipt does not authorize progression');
  if(receipt.journal_repository!==CANONICAL_JOURNAL_REPOSITORY||receipt.subject_repository!==CANONICAL_SUBJECT_REPOSITORY)fail('C2_C1_REPOSITORY_BINDING_MISMATCH','C1 receipt repository binding is not canonical');
  if(!Number.isInteger(receipt.journal_repository_id)||receipt.journal_repository_id<=0)fail('C2_C1_REPOSITORY_ID_INVALID','C1 receipt repository id is invalid');
  if(receipt.default_branch!=='main')fail('C2_C1_DEFAULT_BRANCH_MISMATCH','C1 receipt default branch is not main');
  if(!hex(receipt.seed_head,40))fail('C2_C1_SEED_HEAD_INVALID','C1 receipt seed head is invalid');
  if(!hex(receipt.controller_commit,40))fail('C2_C1_CONTROLLER_COMMIT_INVALID','C1 receipt controller commit is invalid');
  if(!hex(receipt.policy_digest,64))fail('C2_C1_POLICY_DIGEST_INVALID','C1 receipt policy digest is invalid');
  if(!hex(receipt.receipt_digest,64)||digestC1Receipt(receipt)!==receipt.receipt_digest)fail('C2_C1_RECEIPT_DIGEST_MISMATCH','C1 receipt digest does not verify');
  if(receipt.controller_commit!==String(expectedControllerCommit??'').toLowerCase())fail('C2_CONTROLLER_VERSION_MISMATCH','C2 controller commit differs from the C1-qualified controller');
  if(receipt.policy_digest!==String(expectedPolicyDigest??'').toLowerCase())fail('C2_POLICY_VERSION_MISMATCH','C2 policy digest differs from the C1-qualified policy');
  return structuredClone(receipt);
}

export async function authorizeC2Initialization({receipt,expectedControllerCommit,expectedPolicyDigest,repositoryReader,journalClient}){
  const verified=validateC1ReceiptForC2(receipt,{expectedControllerCommit,expectedPolicyDigest});
  const observed=await preflightLiveJournalQualification({
    config:{journalRepository:verified.journal_repository,subjectRepository:verified.subject_repository,expectedOwner:'BFochtman746',destructiveQualification:true,qualificationId:verified.qualification_id},
    repositoryReader,
    journalClient
  });
  if(observed.journalRepositoryId!==verified.journal_repository_id)fail('C2_REPOSITORY_ID_CHANGED','journal repository numeric identity changed since C1',{expected:verified.journal_repository_id,actual:observed.journalRepositoryId});
  if(observed.seedHead!==verified.seed_head)fail('C2_SEED_HEAD_CHANGED','journal seed head changed since C1',{expected:verified.seed_head,actual:observed.seedHead});
  return {
    schema:'controller://authorization/c2-initialize/v1',
    authorized:true,
    c1_qualification_id:verified.qualification_id,
    c1_receipt_digest:verified.receipt_digest,
    controller_commit:verified.controller_commit,
    policy_digest:verified.policy_digest,
    journal_repository:verified.journal_repository,
    journal_repository_id:verified.journal_repository_id,
    subject_repository:verified.subject_repository,
    seed_head:verified.seed_head
  };
}
