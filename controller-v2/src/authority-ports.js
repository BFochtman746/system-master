import { ControllerError } from './errors.js';

function requireMethod(kernel,name){
  if(!kernel||typeof kernel[name]!=='function')throw new ControllerError('KERNEL_PORT_INVALID',`kernel method ${name} required`);
}

export function createWorkerPort(kernel,{leaseId,generation,operationId}){
  requireMethod(kernel,'heartbeatLease');
  requireMethod(kernel,'submitWorkerResult');
  if(typeof leaseId!=='string'||leaseId.length===0)throw new ControllerError('WORKER_PORT_INVALID','leaseId required');
  if(!Number.isInteger(generation)||generation<1)throw new ControllerError('WORKER_PORT_INVALID','positive fencing generation required');
  if(typeof operationId!=='string'||operationId.length===0)throw new ControllerError('WORKER_PORT_INVALID','operationId required');
  const port={
    heartbeat(nowMs=Date.now()){
      return kernel.heartbeatLease(leaseId,generation,nowMs);
    },
    submitResult({result,evidence=null,nowMs=Date.now()}){
      return kernel.submitWorkerResult({leaseId,generation,operationId,result,evidence,nowMs});
    }
  };
  return Object.freeze(port);
}

export function describeWorkerAuthority(){
  return Object.freeze({
    allowed:Object.freeze(['heartbeat','submitResult']),
    forbidden:Object.freeze(['db','outbox-seal','transaction-transition','qualification','promotion','policy-mutation','subject-mutation'])
  });
}
