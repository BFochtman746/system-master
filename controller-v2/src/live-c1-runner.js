import { GitHubGitDataClient } from './github-git-data-client.js';
import { preflightLiveJournalQualification } from './live-journal-qualification.js';
import { canonicalize, sha256 } from './canonical.js';
import { ControllerError } from './errors.js';

function fail(code,message,details={}){throw new ControllerError(code,message,details);}
function lowerHex(value,length){const v=String(value??'').trim().toLowerCase();return new RegExp(`^[0-9a-f]{${length}}$`).test(v)?v:null;}

export function c1ConfigFromEnv(env={}){
  const qualificationId=String(env.CONTROLLER_C1_QUALIFICATION_ID??'').trim();
  const token=String(env.CONTROLLER_C1_GITHUB_TOKEN??env.GITHUB_TOKEN??'').trim();
  const controllerCommit=lowerHex(env.CONTROLLER_C1_CONTROLLER_COMMIT??env.GITHUB_SHA,40);
  const policyDigest=lowerHex(env.CONTROLLER_C1_POLICY_DIGEST,64);
  if(!token)fail('LIVE_GITHUB_TOKEN_REQUIRED','CONTROLLER_C1_GITHUB_TOKEN or GITHUB_TOKEN is required');
  if(!qualificationId)fail('LIVE_QUALIFICATION_ID_REQUIRED','CONTROLLER_C1_QUALIFICATION_ID is required');
  if(!controllerCommit)fail('LIVE_CONTROLLER_COMMIT_REQUIRED','CONTROLLER_C1_CONTROLLER_COMMIT or GITHUB_SHA must be a lowercase/normalizable 40-hex Git commit id');
  if(!policyDigest)fail('LIVE_POLICY_DIGEST_REQUIRED','CONTROLLER_C1_POLICY_DIGEST must be a 64-hex SHA-256 digest');
  return {
    token,controllerCommit,policyDigest,
    config:{
      journalRepository:'BFochtman746/system-master-controller-journal',
      subjectRepository:'BFochtman746/system-master',
      expectedOwner:'BFochtman746',
      destructiveQualification:String(env.CONTROLLER_C1_DESTRUCTIVE_OPT_IN??'').trim()==='I-UNDERSTAND-C1-WILL-QUALIFY-FOR-LATER-MUTATION',
      qualificationId
    }
  };
}

export function digestC1Receipt(receipt){
  const copy=structuredClone(receipt);
  delete copy.receipt_digest;
  return sha256(canonicalize(copy));
}

export async function runC1Preflight({env=process.env,fetchImpl=globalThis.fetch}={}){
  const {token,config,controllerCommit,policyDigest}=c1ConfigFromEnv(env);
  const [owner,repo]=config.journalRepository.split('/');
  const client=new GitHubGitDataClient({owner,repo,tokenProvider:async()=>token,fetchImpl});
  const result=await preflightLiveJournalQualification({
    config,
    repositoryReader:async()=>client.getRepositoryMetadata(),
    journalClient:client
  });
  const receipt={
    schema:'controller://qualification/c1-preflight/v2',
    qualification_id:result.qualificationId,
    result:'PASS',
    qualified_for_live_journal_mutation:true,
    controller_commit:controllerCommit,
    policy_digest:policyDigest,
    journal_repository:result.journalRepository,
    journal_repository_id:result.journalRepositoryId,
    subject_repository:result.subjectRepository,
    default_branch:result.defaultBranch,
    seed_head:result.seedHead
  };
  return {...receipt,receipt_digest:digestC1Receipt(receipt)};
}

export function serializeC1Failure(error){
  return {
    schema:'controller://qualification/c1-preflight/v2',
    result:'FAIL',
    error_code:error?.code??'LIVE_C1_UNEXPECTED_ERROR',
    message:String(error?.message??error),
    details:error?.details??{}
  };
}
