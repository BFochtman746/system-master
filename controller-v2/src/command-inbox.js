import { canonicalize } from './canonical.js';
import { ControllerError } from './errors.js';
import { validateCommand, commandFingerprint } from './kernel.js';

function fail(code,message,details={}){throw new ControllerError(code,message,details);}
function clone(value){return structuredClone(value);}

export class InMemoryDurableCommandInbox {
  constructor(){this.entries=new Map();}

  async put(command){
    validateCommand(command);
    const fingerprint=commandFingerprint(command);
    if(command.fingerprint&&command.fingerprint!==fingerprint) fail('FINGERPRINT_MISMATCH','command fingerprint mismatch');
    const normalized={...clone(command),fingerprint};
    const prior=this.entries.get(command.command_id);
    if(prior){
      if(prior.fingerprint!==fingerprint) fail('INBOX_IDEMPOTENCY_CONFLICT','command id already exists with different semantic contents',{command_id:command.command_id});
      return {created:false,command_id:command.command_id,fingerprint};
    }
    this.entries.set(command.command_id,{command:normalized,fingerprint,bytes:canonicalize(normalized)});
    return {created:true,command_id:command.command_id,fingerprint};
  }

  async get(commandId){
    const entry=this.entries.get(commandId);
    return entry?clone(entry.command):null;
  }

  async list(){
    return [...this.entries.values()].map(entry=>clone(entry.command)).sort((a,b)=>a.command_id.localeCompare(b.command_id));
  }

  async count(){return this.entries.size;}

  // Test-only corruption hook representing hostile/out-of-band remote modification.
  mutateForTest(commandId,mutator){
    const entry=this.entries.get(commandId);
    if(!entry) throw new Error('command not found');
    mutator(entry.command);
  }
}

export class CommandAdmissionPoller {
  constructor({inbox,kernel,controllerVersion='dev',policyVersion='dev'}={}){
    if(!inbox||typeof inbox.list!=='function') fail('INBOX_REQUIRED','durable inbox with list() is required');
    if(!kernel||typeof kernel.acceptCommand!=='function') fail('KERNEL_REQUIRED','controller kernel is required');
    this.inbox=inbox;this.kernel=kernel;this.controllerVersion=controllerVersion;this.policyVersion=policyVersion;
  }

  async pollOnce(){
    const commands=await this.inbox.list();
    if(!Array.isArray(commands)) fail('INBOX_RESPONSE_INVALID','inbox list() must return an array');
    const result={scanned:commands.length,accepted:[],duplicates:[],rejected:[]};
    for(const command of commands){
      try{
        validateCommand(command);
        const expected=commandFingerprint(command);
        if(command.fingerprint!==expected) fail('INBOX_CONTENT_TAMPERED','stored command fingerprint does not match semantic contents',{command_id:command.command_id});
        const accepted=this.kernel.acceptCommand(command,{controllerVersion:this.controllerVersion,policyVersion:this.policyVersion});
        const item={command_id:command.command_id,transaction_id:accepted.transaction_id,fingerprint:accepted.fingerprint};
        (accepted.duplicate?result.duplicates:result.accepted).push(item);
      }catch(error){
        result.rejected.push({command_id:command?.command_id??null,code:error?.code??'INBOX_COMMAND_INVALID',message:String(error?.message??error)});
      }
    }
    return result;
  }
}

export const COMMAND_INGRESS_INVARIANTS=Object.freeze({
  durable_object_is_authority:true,
  notification_is_hint_only:true,
  delete_after_ingest:false,
  ordering_required:false,
  admission_automatic:false,
  replay_expected:true
});
