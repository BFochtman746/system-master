import { authorizeC2Initialization } from './live-c2-admission.js';
import { GitDataJournalAdapter } from './git-data-journal.js';
import { canonicalize, sha256 } from './canonical.js';
import { ControllerError } from './errors.js';

function fail(code,message,details={}){throw new ControllerError(code,message,details);}
export function digestC2InitializationReceipt(receipt){const copy=structuredClone(receipt);delete copy.receipt_digest;return sha256(canonicalize(copy));}

export async function executeC2Initialization({receipt,expectedControllerCommit,expectedPolicyDigest,repositoryReader,journalClient,journalFactory=null}){
  const authorization=await authorizeC2Initialization({receipt,expectedControllerCommit,expectedPolicyDigest,repositoryReader,journalClient});
  const factory=journalFactory??((client)=>new GitDataJournalAdapter(client,{repositoryIdentity:authorization.journal_repository,subjectRepositoryIdentity:authorization.subject_repository}));
  const journal=factory(journalClient,authorization);
  if(!journal||typeof journal.initialize!=='function'||typeof journal.verifyHead!=='function'||typeof journal.witnessFrom!=='function')fail('C2_JOURNAL_ADAPTER_INVALID','journal adapter must provide initialize, verifyHead, and witnessFrom');

  const initialized=await journal.initialize();
  const verified=await journal.verifyHead();
  if(verified.commit_oid!==initialized.commit_oid)fail('C2_INITIALIZED_HEAD_MISMATCH','verified journal head differs from initialized commit',{initialized:initialized.commit_oid,verified:verified.commit_oid});
  if(verified.checkpoint?.size!==0||verified.checkpoint?.head_digest!==null)fail('C2_INITIAL_CHECKPOINT_INVALID','new journal root must verify as empty');
  const witness=journal.witnessFrom(verified);
  if(witness.commit_oid!==initialized.commit_oid||witness.size!==0||witness.head_digest!==null)fail('C2_INITIAL_WITNESS_INVALID','initial witness does not bind the verified empty journal root');

  const result={
    schema:'controller://qualification/c2-initialization/v1',
    result:'PASS',
    c1_qualification_id:authorization.c1_qualification_id,
    c1_receipt_digest:authorization.c1_receipt_digest,
    controller_commit:authorization.controller_commit,
    policy_digest:authorization.policy_digest,
    journal_repository:authorization.journal_repository,
    journal_repository_id:authorization.journal_repository_id,
    subject_repository:authorization.subject_repository,
    seed_head:authorization.seed_head,
    journal_root_commit:initialized.commit_oid,
    witness
  };
  return {...result,receipt_digest:digestC2InitializationReceipt(result)};
}
