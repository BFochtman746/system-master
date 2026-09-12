import { GitHubGitDataClient } from './github-git-data-client.js';
import { preflightLiveJournalQualification } from './live-journal-qualification.js';
import { ControllerError } from './errors.js';

function fail(code,message,details={}){throw new ControllerError(code,message,details);}

export function c1ConfigFromEnv(env={}){
  const qualificationId=String(env.CONTROLLER_C1_QUALIFICATION_ID??'').trim();
  const token=String(env.CONTROLLER_C1_GITHUB_TOKEN??env.GITHUB_TOKEN??'').trim();
  if(!token)fail('LIVE_GITHUB_TOKEN_REQUIRED','CONTROLLER_C1_GITHUB_TOKEN or GITHUB_TOKEN is required');
  if(!qualificationId)fail('LIVE_QUALIFICATION_ID_REQUIRED','CONTROLLER_C1_QUALIFICATION_ID is required');
  return {
    token,
    config:{
      journalRepository:'BFochtman746/system-master-controller-journal',
      subjectRepository:'BFochtman746/system-master',
      expectedOwner:'BFochtman746',
      destructiveQualification:String(env.CONTROLLER_C1_DESTRUCTIVE_OPT_IN??'').trim()==='I-UNDERSTAND-C1-WILL-QUALIFY-FOR-LATER-MUTATION',
      qualificationId
    }
  };
}

export async function runC1Preflight({env=process.env,fetchImpl=globalThis.fetch}={}){
  const {token,config}=c1ConfigFromEnv(env);
  const [owner,repo]=config.journalRepository.split('/');
  const client=new GitHubGitDataClient({owner,repo,tokenProvider:async()=>token,fetchImpl});
  const result=await preflightLiveJournalQualification({
    config,
    repositoryReader:async()=>client.getRepositoryMetadata(),
    journalClient:client
  });
  return {
    schema:'controller://qualification/c1-preflight/v1',
    qualification_id:result.qualificationId,
    result:'PASS',
    qualified_for_live_journal_mutation:true,
    journal_repository:result.journalRepository,
    journal_repository_id:result.journalRepositoryId,
    subject_repository:result.subjectRepository,
    default_branch:result.defaultBranch,
    seed_head:result.seedHead
  };
}

export function serializeC1Failure(error){
  return {
    schema:'controller://qualification/c1-preflight/v1',
    result:'FAIL',
    error_code:error?.code??'LIVE_C1_UNEXPECTED_ERROR',
    message:String(error?.message??error),
    details:error?.details??{}
  };
}
