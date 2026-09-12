import { ControllerKernel, ControllerError } from './kernel.js';
import { canonicalize } from './canonical.js';
import { createOperationPlan, validateOperationPlan, assertPlanMatchesTransaction } from './operation-plan.js';

const SCHEMA_VERSION=4;
function fail(code,message,details={}){throw new ControllerError(code,message,details);}

export class ControllerKernelV4 extends ControllerKernel {
  migrate(){
    this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
    let current=Number(this.db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_migrations').get().version);
    if(current>SCHEMA_VERSION)fail('SCHEMA_TOO_NEW',`database schema ${current} is newer than supported ${SCHEMA_VERSION}`);
    if(current<=3){super.migrate();current=Number(this.db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_migrations').get().version);}
    if(current<4){
      this.db.exec('BEGIN IMMEDIATE');
      try{
        this.db.exec(`
          CREATE TABLE operation_plans(
            operation_id TEXT PRIMARY KEY REFERENCES operations(operation_id),
            plan_id TEXT NOT NULL UNIQUE,
            plan_digest TEXT NOT NULL UNIQUE,
            plan_json TEXT NOT NULL,
            bound_at TEXT NOT NULL
          );
        `);
        this.db.prepare("INSERT INTO schema_migrations(version,applied_at) VALUES (4,strftime('%Y-%m-%dT%H:%M:%fZ','now'))").run();
        this.db.exec('COMMIT');
      }catch(error){if(this.db.isTransaction)this.db.exec('ROLLBACK');throw error;}
    }
  }

  schemaVersion(){return Number(this.db.prepare('SELECT COALESCE(MAX(version),0) version FROM schema_migrations').get().version);}

  createPlannedOperation(planInput,nowMs=Date.now()){
    const plan=createOperationPlan(planInput);
    return this.atomic(()=>{
      const tx=this.db.prepare('SELECT * FROM transactions WHERE transaction_id=?').get(plan.transaction_id);
      if(!tx)fail('NOT_FOUND','transaction not found');
      if(!['ADMITTED','ACTIVE'].includes(tx.state))fail('TRANSACTION_NOT_ADMITTED','operation planning requires ADMITTED or ACTIVE transaction');
      assertPlanMatchesTransaction(plan,{transactionId:tx.transaction_id,operationId:plan.operation_id,subjectRepository:tx.subject_repo,subject:{algorithm:tx.subject_algorithm,oid:tx.subject_oid},resourceId:plan.resource_id});
      if(this.db.prepare('SELECT 1 ok FROM operations WHERE operation_id=?').get(plan.operation_id))fail('OPERATION_ID_CONFLICT','operation id already exists');
      const now=new Date(nowMs).toISOString();
      this.db.prepare('INSERT INTO operations VALUES (?,?,?,?,?,?)').run(plan.operation_id,plan.transaction_id,'PLANNED',plan.resource_id,now,now);
      this.db.prepare('INSERT INTO operation_plans(operation_id,plan_id,plan_digest,plan_json,bound_at) VALUES (?,?,?,?,?)').run(plan.operation_id,plan.plan_id,plan.plan_digest,canonicalize(plan),now);
      this.appendEvent(`operation:${plan.operation_id}`,0,'operation.planned',{operation_id:plan.operation_id,transaction_id:plan.transaction_id,resource_id:plan.resource_id,plan},now);
      return {operation_id:plan.operation_id,plan_id:plan.plan_id,plan_digest:plan.plan_digest};
    });
  }

  getOperationPlan(operationId){
    const row=this.db.prepare('SELECT plan_json,plan_digest FROM operation_plans WHERE operation_id=?').get(operationId);
    if(!row)fail('OPERATION_PLAN_NOT_BOUND','operation has no bound execution plan',{operation_id:operationId});
    let plan;try{plan=JSON.parse(row.plan_json);}catch{fail('OPERATION_PLAN_CORRUPT','stored operation plan is not valid JSON',{operation_id:operationId});}
    validateOperationPlan(plan);
    if(plan.plan_digest!==row.plan_digest)fail('OPERATION_PLAN_CORRUPT','stored plan digest column does not match plan',{operation_id:operationId});
    return structuredClone(plan);
  }

  getOperationSnapshot(operationId){
    const row=this.db.prepare(`SELECT o.*,t.subject_repo,t.subject_algorithm,t.subject_oid,t.controller_version,t.policy_version,t.state transaction_state
      FROM operations o JOIN transactions t ON t.transaction_id=o.transaction_id WHERE o.operation_id=?`).get(operationId);
    if(!row)fail('NOT_FOUND','operation not found');
    return {
      operation_id:row.operation_id,transaction_id:row.transaction_id,state:row.state,resource_id:row.resource_id,
      subject_repository:row.subject_repo,subject:{algorithm:row.subject_algorithm,oid:row.subject_oid},
      controller_version:row.controller_version,policy_version:row.policy_version,transaction_state:row.transaction_state,
      created_at:row.created_at,updated_at:row.updated_at
    };
  }

  listReadyOperationSnapshots(){
    const rows=this.db.prepare(`SELECT o.operation_id FROM operations o JOIN operation_plans p ON p.operation_id=o.operation_id WHERE o.state='READY'`).all();
    return rows.map(r=>({snapshot:this.getOperationSnapshot(r.operation_id),plan:this.getOperationPlan(r.operation_id)}));
  }

  leaseAttemptCount(operationId){return Number(this.db.prepare('SELECT COUNT(*) n FROM leases WHERE operation_id=?').get(operationId).n);}

  transitionOperation(operationId,to,expectedFrom=null){
    if(to==='READY'){
      const snapshot=this.getOperationSnapshot(operationId);
      const plan=this.getOperationPlan(operationId);
      assertPlanMatchesTransaction(plan,{transactionId:snapshot.transaction_id,operationId:snapshot.operation_id,subjectRepository:snapshot.subject_repository,subject:snapshot.subject,resourceId:snapshot.resource_id});
    }
    return super.transitionOperation(operationId,to,expectedFrom);
  }

  createOperation(){fail('OPERATION_PLAN_REQUIRED','schema v4 requires createPlannedOperation with an immutable execution plan');}
}

export const KERNEL_V4_INVARIANTS=Object.freeze({schema_version:4,plan_bound_before_ready:true,plan_in_semantic_event:true,legacy_unplanned_creation_forbidden:true,old_kernel_fails_closed_on_v4:true});
