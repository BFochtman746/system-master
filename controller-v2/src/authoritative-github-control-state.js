import { ControllerError } from './errors.js';
import { GitHubApiError } from './github-git-transport.js';
import { GitHubDurableJournal } from './github-durable-journal.js';
import { GitHubCheckpointAnchor } from './github-checkpoint-anchor.js';
import { assertAuthoritativePreflight } from './authority-preflight.js';

function repoKey(transport){return `${transport?.owner??''}/${transport?.repo??''}`.toLowerCase();}
function principalKey(value){return value?`${value.kind}:${String(value.id)}`:null;}
function requireTransportBinding(label,transport,authority,expectedPrincipal){
  if(!transport||repoKey(transport)!==authority.controlStateRepository)throw new ControllerError('AUTH_RUNTIME_REPOSITORY_MISMATCH',`${label} transport does not target the control-state repository`);
  const provider=transport.tokenProvider;const actualPrincipal=provider?.principal;const actualRepositoryId=provider?.repositoryId;
  if(principalKey(actualPrincipal)!==principalKey(expectedPrincipal))throw new ControllerError('AUTH_RUNTIME_PRINCIPAL_MISMATCH',`${label} token provider principal does not match activated GitHub App`);
  if(String(actualRepositoryId)!==String(authority.controlStateRepositoryId))throw new ControllerError('AUTH_RUNTIME_TOKEN_SCOPE_MISMATCH',`${label} token provider is not scoped to the activated repository ID`);
}

function existingRefOnly(transport,missingCode){
  return new Proxy(transport,{get(target,prop,receiver){
    if(prop==='createRef')return async()=>{throw new ControllerError('AUTH_RUNTIME_REF_CREATION_DENIED','authoritative runtime may not create controller authority refs');};
    if(prop==='getRef')return async(branch)=>{try{return await target.getRef(branch);}catch(e){if(e instanceof GitHubApiError&&e.status===404)throw new ControllerError(missingCode,`required authoritative ref ${branch} is missing`);throw e;}};
    const value=Reflect.get(target,prop,receiver);return typeof value==='function'?value.bind(target):value;
  }});
}

export async function createAuthoritativeGitHubControlState({config,observation,journalTransport,anchorTransport,genesisSha,maxBatchEvents=50}){
  const authority=assertAuthoritativePreflight(config,observation);
  requireTransportBinding('journal',journalTransport,authority,authority.journalPrincipal);
  requireTransportBinding('anchor',anchorTransport,authority,authority.anchorPrincipal);
  if(journalTransport.tokenProvider===anchorTransport.tokenProvider)throw new ControllerError('AUTH_RUNTIME_PRINCIPAL_COLLISION','journal and anchor must not share one token provider instance');
  if(typeof genesisSha!=='string'||!/^[0-9a-f]{40,64}$/.test(genesisSha))throw new ControllerError('AUTH_CONFIG_INVALID','control-state genesisSha must be a lowercase Git object id');

  const journalRuntimeTransport=existingRefOnly(journalTransport,'JOURNAL_REF_MISSING');
  const anchorRuntimeTransport=existingRefOnly(anchorTransport,'ANCHOR_REF_MISSING');
  const journal=new GitHubDurableJournal({transport:journalRuntimeTransport,branch:authority.journalBranch,genesisSha,maxBatchEvents});
  const anchor=new GitHubCheckpointAnchor({anchorTransport:anchorRuntimeTransport,journalTransport:journalRuntimeTransport,anchorBranch:authority.anchorBranch,anchorGenesisSha:genesisSha,journalRepository:authority.controlStateRepository,journalBranch:authority.journalBranch});

  // Activation is not complete merely because configuration passed. Verify the actual durable bytes.
  const journalVerification=await journal.verify();
  const anchorRecords=await anchor.list();
  const anchoredExtension=await anchor.verifyJournalExtendsLatest(journal);
  return Object.freeze({authority,journal,anchor,journalVerification,anchorCount:anchorRecords.length,anchoredExtension});
}
