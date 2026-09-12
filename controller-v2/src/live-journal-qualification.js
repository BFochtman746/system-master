import { ControllerError } from './errors.js';

export const CANONICAL_JOURNAL_REPOSITORY='bfochtman746/system-master-controller-journal';
export const CANONICAL_SUBJECT_REPOSITORY='bfochtman746/system-master';
export const CANONICAL_DEFAULT_BRANCH='main';
export const CANONICAL_SEED_PATH='README.md';

function fail(code,message,details={}){throw new ControllerError(code,message,details);}
function normalizeRepo(value){return String(value??'').trim().toLowerCase();}

export function validateLiveQualificationConfig(config={}){
  const journalRepository=normalizeRepo(config.journalRepository);
  const subjectRepository=normalizeRepo(config.subjectRepository);
  if(!journalRepository||!journalRepository.includes('/'))fail('LIVE_JOURNAL_REPOSITORY_REQUIRED','journalRepository must be owner/name');
  if(!subjectRepository||!subjectRepository.includes('/'))fail('LIVE_SUBJECT_REPOSITORY_REQUIRED','subjectRepository must be owner/name');
  if(journalRepository===subjectRepository)fail('LIVE_JOURNAL_SUBJECT_COLLISION','journal repository must be independent from subject repository');
  if(journalRepository==='bfochtman746/system-master')fail('LIVE_SYSTEM_MASTER_JOURNAL_FORBIDDEN','System Master may never be used as the controller journal repository');
  if(journalRepository!==CANONICAL_JOURNAL_REPOSITORY)fail('LIVE_JOURNAL_REPOSITORY_NOT_CANONICAL','journal repository does not match the frozen C1 target',{expected:CANONICAL_JOURNAL_REPOSITORY,actual:journalRepository});
  if(subjectRepository!==CANONICAL_SUBJECT_REPOSITORY)fail('LIVE_SUBJECT_REPOSITORY_NOT_CANONICAL','subject repository does not match the frozen C1 target',{expected:CANONICAL_SUBJECT_REPOSITORY,actual:subjectRepository});
  if(config.destructiveQualification!==true)fail('LIVE_DESTRUCTIVE_OPT_IN_REQUIRED','destructiveQualification must be explicitly true');
  if(config.expectedOwner&&journalRepository.split('/')[0]!==String(config.expectedOwner).trim().toLowerCase())fail('LIVE_REPOSITORY_OWNER_MISMATCH','journal repository owner does not match expected owner');
  if(!config.qualificationId||typeof config.qualificationId!=='string')fail('LIVE_QUALIFICATION_ID_REQUIRED','qualificationId is required');
  return {journalRepository,subjectRepository,qualificationId:config.qualificationId};
}

export async function preflightLiveJournalQualification({config,repositoryReader,journalClient}){
  const normalized=validateLiveQualificationConfig(config);
  if(typeof repositoryReader!=='function')fail('LIVE_REPOSITORY_READER_REQUIRED','repositoryReader is required');
  if(!journalClient||typeof journalClient.getRef!=='function'||typeof journalClient.getCommit!=='function'||typeof journalClient.getTree!=='function')fail('LIVE_JOURNAL_CLIENT_REQUIRED','journalClient with ref/commit/tree reads is required');
  const [owner,repo]=normalized.journalRepository.split('/');
  const metadata=await repositoryReader({owner,repo});
  if(!metadata)fail('LIVE_REPOSITORY_NOT_FOUND','dedicated journal repository was not found');
  const actualIdentity=normalizeRepo(metadata.full_name??`${metadata.owner?.login??owner}/${metadata.name??repo}`);
  if(actualIdentity!==normalized.journalRepository)fail('LIVE_REPOSITORY_IDENTITY_MISMATCH','resolved repository identity differs from configured journal repository',{expected:normalized.journalRepository,actual:actualIdentity});
  if(!Number.isInteger(metadata.id)||metadata.id<=0)fail('LIVE_REPOSITORY_NUMERIC_ID_REQUIRED','repository metadata must expose a stable positive numeric id');
  if(metadata.archived===true)fail('LIVE_REPOSITORY_ARCHIVED','journal repository may not be archived');
  if(metadata.private!==true)fail('LIVE_REPOSITORY_MUST_BE_PRIVATE','dedicated journal repository must be private');
  if(!metadata.default_branch)fail('LIVE_REPOSITORY_UNSEEDED','journal repository requires one seed branch/commit before qualification');
  if(metadata.default_branch!==CANONICAL_DEFAULT_BRANCH)fail('LIVE_DEFAULT_BRANCH_MISMATCH','journal repository default branch must be main',{expected:CANONICAL_DEFAULT_BRANCH,actual:metadata.default_branch});
  if(metadata.permissions&&metadata.permissions.push===false)fail('LIVE_REPOSITORY_WRITE_PERMISSION_MISSING','qualification principal lacks repository write access');

  const seedHead=await journalClient.getRef(`heads/${CANONICAL_DEFAULT_BRANCH}`);
  const seedCommit=await journalClient.getCommit(seedHead);
  if(seedCommit.parents.length!==0)fail('LIVE_SEED_HISTORY_NOT_MINIMAL','seed repository must contain exactly one root commit',{parent_count:seedCommit.parents.length});
  const seedTree=await journalClient.getTree(seedCommit.tree);
  const seedPaths=Object.keys(seedTree.files).sort();
  if(seedPaths.length!==1||seedPaths[0]!==CANONICAL_SEED_PATH)fail('LIVE_SEED_TREE_NOT_MINIMAL','seed root must contain exactly README.md',{paths:seedPaths});

  let journalRef=null;
  try{journalRef=await journalClient.getRef('heads/journal');}
  catch(error){if(error?.status!==404&&error?.code!=='GITHUB_NOT_FOUND')throw error;}
  if(journalRef!==null)fail('LIVE_JOURNAL_REF_ALREADY_EXISTS','destructive qualification requires a fresh repository without heads/journal',{journalRef});
  return {
    qualified_for_mutation:true,
    journalRepository:normalized.journalRepository,
    journalRepositoryId:metadata.id,
    subjectRepository:normalized.subjectRepository,
    defaultBranch:metadata.default_branch,
    seedHead,
    qualificationId:normalized.qualificationId
  };
}
