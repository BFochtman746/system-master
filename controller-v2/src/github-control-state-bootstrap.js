import { canonicalize } from './canonical.js';
import { ControllerError } from './errors.js';
import { GitHubApiError } from './github-git-transport.js';
import { GitHubJournalPaths } from './github-durable-journal.js';
import { GitHubAnchorPaths, EmptyAnchorHead } from './github-checkpoint-anchor.js';

export const EmptyJournalCheckpoint=Object.freeze({protocol_version:'controller-journal.v1',size:0,head_digest:null,last_batch_path:null,last_batch_digest:null});

async function existingRef(transport,branch){try{return await transport.getRef(branch);}catch(e){if(e instanceof GitHubApiError&&e.status===404)return null;throw e;}}

async function bootstrapRef(transport,{branch,baseSha,files,message}){
  const existing=await existingRef(transport,branch);if(existing)return {created:false,sha:existing.sha};
  const commit=await transport.createCommitFromFiles({parentSha:baseSha,files,message});
  try{return {created:true,...await transport.createRef(branch,commit.sha)};}catch(e){
    if(e instanceof GitHubApiError&&(e.status===409||e.status===422)){
      const observed=await existingRef(transport,branch);if(observed)return {created:false,raced:true,sha:observed.sha};
    }
    throw e;
  }
}

export async function bootstrapControlStateRefs({transport,baseSha,journalBranch='controller-journal/v1',anchorBranch='controller-anchor/v1'}){
  if(!transport||typeof transport.createCommitFromFiles!=='function'||typeof transport.createRef!=='function')throw new ControllerError('BOOTSTRAP_TRANSPORT_INVALID','privileged Git transport required');
  if(typeof baseSha!=='string'||!/^[0-9a-f]{40,64}$/.test(baseSha))throw new ControllerError('BOOTSTRAP_BASE_INVALID','baseSha must be a lowercase Git object id');
  if(journalBranch===anchorBranch)throw new ControllerError('BOOTSTRAP_REF_COLLISION','journal and anchor refs must be different');
  const journal=await bootstrapRef(transport,{branch:journalBranch,baseSha,files:{[GitHubJournalPaths.checkpoint]:canonicalize(EmptyJournalCheckpoint)},message:'controller control-state: bootstrap empty journal authority'});
  const anchor=await bootstrapRef(transport,{branch:anchorBranch,baseSha,files:{[GitHubAnchorPaths.head]:canonicalize(EmptyAnchorHead)},message:'controller control-state: bootstrap empty anchor authority'});
  return {journal,anchor};
}
