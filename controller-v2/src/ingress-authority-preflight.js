import { ControllerError } from './errors.js';
import { COMMAND_INBOX_NAMESPACE } from './github-command-inbox-transport.js';
import { CONTROL_STATE_ACTIVATION_PROTOCOL } from './control-state-activation-closure.js';

function positiveId(value,label){const s=String(value??'');if(!/^[1-9][0-9]*$/.test(s))throw new ControllerError('INGRESS_CONFIG_INVALID',`${label} must be a positive canonical integer`);return s;}
function principal(value){if(!value||value.kind!=='github-app')throw new ControllerError('INGRESS_CONFIG_INVALID','ingress principal must be a GitHub App');return {kind:'github-app',id:positiveId(value.id,'principal.id')};}
function active(rule){return rule?.enforcement==='active'||rule?.active===true;}
function types(rule){return new Set((rule?.rules??[]).map(r=>typeof r==='string'?r:r?.type).filter(Boolean));}
function bypass(rule){return (rule?.bypass_actors??rule?.bypassActors??[]).map(a=>({actor_type:a.actor_type??a.type,actor_id:a.actor_id===undefined||a.actor_id===null?null:String(a.actor_id),bypass_mode:a.bypass_mode??a.mode??'always'}));}
function matchesApp(actor,app){return actor.actor_type==='Integration'&&actor.actor_id===app.id&&actor.bypass_mode==='always';}

export function assertAuthoritativeIngressPreflight({activationReceipt,config,observation,transport}){
  if(!activationReceipt||activationReceipt.protocol_version!==CONTROL_STATE_ACTIVATION_PROTOCOL)throw new ControllerError('INGRESS_ACTIVATION_REQUIRED','qualified C1 control-state activation receipt required');
  if(!config||config.mode!=='authoritative')throw new ControllerError('INGRESS_CONFIG_INVALID','authoritative ingress mode required');
  if(config.namespace!==COMMAND_INBOX_NAMESPACE)throw new ControllerError('INGRESS_CONFIG_INVALID',`namespace must be ${COMMAND_INBOX_NAMESPACE}`);
  const app=principal(config.principal);
  const expectedRepo=activationReceipt.authority?.control_state_repository;
  const expectedRepoId=positiveId(activationReceipt.authority?.control_state_repository_id,'activationReceipt.authority.control_state_repository_id');
  if(!observation?.repository_exists)throw new ControllerError('INGRESS_REPOSITORY_MISSING','activated control-state repository is not observable');
  if(String(observation.repository_full_name??'').toLowerCase()!==String(expectedRepo??'').toLowerCase()||positiveId(observation.repository_id,'observation.repository_id')!==expectedRepoId)throw new ControllerError('INGRESS_REPOSITORY_MISMATCH','ingress must use the exact C1-activated control-state repository');
  const creation=(observation.creation_rulesets??[]).filter(active).filter(r=>types(r).has('creation'));
  if(!creation.some(r=>{const a=bypass(r);return a.length===1&&matchesApp(a[0],app);}))throw new ControllerError('INGRESS_CREATION_PROTECTION_INVALID','active creation restriction must authorize exactly the configured GitHub App');
  const immutable=(observation.immutability_rulesets??[]).filter(active);
  if(!immutable.some(r=>types(r).has('update')&&bypass(r).length===0))throw new ControllerError('INGRESS_UPDATE_PROTECTION_MISSING','active update restriction with no bypass is required');
  if(!immutable.some(r=>types(r).has('deletion')&&bypass(r).length===0))throw new ControllerError('INGRESS_DELETE_PROTECTION_MISSING','active deletion restriction with no bypass is required');
  for(const r of immutable)for(const actor of bypass(r))if(actor.bypass_mode==='always')throw new ControllerError('INGRESS_IMMUTABILITY_BYPASS_PRESENT','immutability rules may not have always-bypass actors');
  const token=transport?.git?.tokenProvider??transport?.tokenProvider;
  if(!token)throw new ControllerError('INGRESS_RUNTIME_BINDING_INVALID','runtime token provider required');
  if(token.principal?.kind!=='github-app'||String(token.principal?.id)!==app.id)throw new ControllerError('INGRESS_RUNTIME_PRINCIPAL_MISMATCH','runtime token provider does not match configured ingress App');
  if(String(token.repositoryId)!==expectedRepoId)throw new ControllerError('INGRESS_RUNTIME_REPOSITORY_MISMATCH','runtime token provider is not scoped to activated control-state repository');
  const runtimeRepo=`${transport?.git?.owner??transport?.owner??''}/${transport?.git?.repo??transport?.repo??''}`.toLowerCase();
  if(runtimeRepo!==String(expectedRepo).toLowerCase())throw new ControllerError('INGRESS_RUNTIME_REPOSITORY_MISMATCH','runtime transport targets the wrong repository');
  return Object.freeze({authoritative:true,namespace:COMMAND_INBOX_NAMESPACE,repository:expectedRepo,repository_id:expectedRepoId,principal:app});
}
