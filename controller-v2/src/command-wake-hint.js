import { ControllerError } from './errors.js';

export async function resolveCommandWakeHint(inbox,hint){
  if(!inbox||typeof inbox.get!=='function')throw new ControllerError('WAKE_HINT_INVALID','durable command inbox required');
  if(!hint||typeof hint!=='object'||Array.isArray(hint))throw new ControllerError('WAKE_HINT_INVALID','wake hint object required');
  const keys=Object.keys(hint);for(const key of keys)if(!['command_id','ref'].includes(key))throw new ControllerError('WAKE_HINT_INVALID',`unknown wake hint field ${key}`);
  if(typeof hint.command_id!=='string'||hint.command_id.length===0)throw new ControllerError('WAKE_HINT_INVALID','command_id required');
  const candidate=await inbox.get(hint.command_id);
  if(!candidate)return Object.freeze({found:false,command_id:hint.command_id});
  if(hint.ref!==undefined&&hint.ref!==candidate.ref)throw new ControllerError('WAKE_HINT_REF_MISMATCH','wake hint ref does not match re-read durable command ref');
  return Object.freeze({found:true,command_id:hint.command_id,ref:candidate.ref,candidate});
}

// Deliberately no ControllerKernel dependency and no transaction/admission method.
// A wake signal can only cause a durable inbox re-read. Semantic admission remains a separate call.
