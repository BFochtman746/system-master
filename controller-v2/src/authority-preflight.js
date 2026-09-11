import { ControllerError } from './errors.js';

function repoName(value,label){
  if(typeof value!=='string'||!/^[^/\s]+\/[^/\s]+$/.test(value))throw new ControllerError('AUTH_CONFIG_INVALID',`${label} must be owner/repo`);
  return value.toLowerCase();
}
function branchName(value,label){if(typeof value!=='string'||value.length===0||value.startsWith('refs/'))throw new ControllerError('AUTH_CONFIG_INVALID',`${label} must be a branch name without refs/heads/`);return value;}
function principal(value,label){
  if(!value||value.kind!=='github-app'||(!Number.isSafeInteger(value.id)&&typeof value.id!=='string'))throw new ControllerError('AUTH_CONFIG_INVALID',`${label} must identify a GitHub App`);
  return {kind:'github-app',id:String(value.id)};
}
function principalKey(p){return `${p.kind}:${p.id}`;}
function active(rule){return rule?.enforcement==='active'||rule?.active===true;}
function ruleTypes(rule){return new Set((rule?.rules??[]).map(r=>typeof r==='string'?r:r?.type).filter(Boolean));}
function bypass(rule){return (rule?.bypass_actors??rule?.bypassActors??[]).map(a=>({actor_type:a.actor_type??a.type,actor_id:a.actor_id===null||a.actor_id===undefined?null:String(a.actor_id),bypass_mode:a.bypass_mode??a.mode??'always'}));}
function appMatches(actor,app){return actor.actor_type==='Integration'&&actor.actor_id===String(app.id)&&actor.bypass_mode==='always';}

export function validateAuthorityConfiguration(config){
  if(!config||config.mode!=='authoritative')throw new ControllerError('AUTH_CONFIG_INVALID','production preflight requires mode=authoritative');
  const subjectRepository=repoName(config.subjectRepository,'subjectRepository');
  const controlStateRepository=repoName(config.controlStateRepository,'controlStateRepository');
  if(subjectRepository===controlStateRepository)throw new ControllerError('AUTH_SUBJECT_CONTROL_COLLISION','control-state repository must be separate from the subject repository');
  const journalBranch=branchName(config.journal?.branch,'journal.branch');
  const anchorBranch=branchName(config.anchor?.branch,'anchor.branch');
  if(journalBranch===anchorBranch)throw new ControllerError('AUTH_REF_COLLISION','journal and anchor must use different refs');
  const journalPrincipal=principal(config.journal?.principal,'journal.principal');
  const anchorPrincipal=principal(config.anchor?.principal,'anchor.principal');
  if(principalKey(journalPrincipal)===principalKey(anchorPrincipal))throw new ControllerError('AUTH_PRINCIPAL_COLLISION','journal writer and anchor authority must be different GitHub Apps');
  return {subjectRepository,controlStateRepository,journalBranch,anchorBranch,journalPrincipal,anchorPrincipal};
}

function validateBranchLayers(label,layers,expectedApp){
  if(!layers||!Array.isArray(layers.writer_rulesets)||!Array.isArray(layers.integrity_rulesets))throw new ControllerError('AUTH_PROTECTION_INCOMPLETE',`${label} protection observation missing`);
  const writer=layers.writer_rulesets.filter(active).filter(r=>ruleTypes(r).has('update'));
  if(writer.length===0)throw new ControllerError('AUTH_UPDATE_RESTRICTION_MISSING',`${label} requires an active restrict-updates ruleset`);
  const authorizedWriter=writer.find(r=>{
    const actors=bypass(r);
    return actors.length===1&&appMatches(actors[0],expectedApp);
  });
  if(!authorizedWriter)throw new ControllerError('AUTH_WRITER_BYPASS_INVALID',`${label} update restriction must have exactly the designated GitHub App as always-bypass actor`);

  const integrity=layers.integrity_rulesets.filter(active);
  const deletion=integrity.find(r=>ruleTypes(r).has('deletion')&&bypass(r).length===0);
  if(!deletion)throw new ControllerError('AUTH_DELETION_PROTECTION_MISSING',`${label} requires an active deletion rule with no bypass actors`);
  const nonFastForward=integrity.find(r=>ruleTypes(r).has('non_fast_forward')&&bypass(r).length===0);
  if(!nonFastForward)throw new ControllerError('AUTH_FORCE_PUSH_PROTECTION_MISSING',`${label} requires an active non-fast-forward rule with no bypass actors`);

  // A broad always-bypass actor on an integrity ruleset would defeat the independent append-only boundary.
  for(const r of integrity){
    for(const actor of bypass(r)){
      if(actor.bypass_mode==='always')throw new ControllerError('AUTH_INTEGRITY_BYPASS_PRESENT',`${label} integrity rulesets may not contain always-bypass actors`);
    }
  }
  return true;
}

export function assertAuthoritativePreflight(config,observation){
  const normalized=validateAuthorityConfiguration(config);
  if(!observation?.repository_exists)throw new ControllerError('AUTH_CONTROL_REPOSITORY_MISSING','dedicated control-state repository does not exist or is not accessible');
  if(String(observation.repository_full_name??'').toLowerCase()!==normalized.controlStateRepository)throw new ControllerError('AUTH_REPOSITORY_IDENTITY_MISMATCH','observed repository does not match configured control-state repository');
  validateBranchLayers('journal',observation.journal,normalized.journalPrincipal);
  validateBranchLayers('anchor',observation.anchor,normalized.anchorPrincipal);
  if(observation.journal?.branch_exists!==true||observation.anchor?.branch_exists!==true)throw new ControllerError('AUTH_BRANCH_MISSING','journal and anchor refs must be bootstrapped before authoritative activation');
  return Object.freeze({...normalized,authoritative:true});
}

export const AuthorityPreflight = Object.freeze({validateAuthorityConfiguration,assertAuthoritativePreflight});
