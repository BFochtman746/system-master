#!/usr/bin/env node
'use strict';
const fs=require('fs'); const path=require('path'); const ROOT=path.resolve(__dirname,'..','..');
function readJson(rel){return JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));} function readText(rel){return fs.readFileSync(path.join(ROOT,rel),'utf8');} function fail(m){throw new Error(`SECOND_SHIFT_EXECUTION_CONTROL_DRIFT: ${m}`);}
function exactSet(label,actual,expected){if(!Array.isArray(actual))fail(`${label} must be an array`);const a=[...new Set(actual)].sort(),e=[...new Set(expected)].sort();if(a.length!==actual.length)fail(`${label} contains duplicates`);if(JSON.stringify(a)!==JSON.stringify(e))fail(`${label} mismatch; expected=${JSON.stringify(e)} actual=${JSON.stringify(a)}`);}
function machine(text){const m=text.match(/<!-- SECOND_SHIFT_MACHINE_CONTRACT_START -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- SECOND_SHIFT_MACHINE_CONTRACT_END -->/);if(!m)fail('machine contract block missing');try{return JSON.parse(m[1]);}catch(e){fail(`machine contract invalid JSON: ${e.message}`);}}

function requireTrue(value,label){if(value!==true)fail(`${label} must be true`);}
function requireFalse(value,label){if(value!==false)fail(`${label} must be false`);}
function validateMasteryContract({authority,topology,registry,mastery,delegationSchema}){
 const ready=topology.execution_readiness?.execution_ready_peer_system_ids;if(!Array.isArray(ready)||ready.length===0)fail('selected topology has no execution-ready peer set');
 const masteryPath='governance/second-shift/SECOND-SHIFT-MASTERY-CURRENT-AUTHORITY-CONTRACT-002.json',schemaPath='governance/second-shift/SECOND-SHIFT-DELEGATION-SCHEMA-003.json';
 if(registry.mastery_current_contract!==masteryPath)fail('registry mastery_current_contract pointer mismatch');
 if(registry.schema!==schemaPath)fail('registry delegation schema pointer mismatch');
 if(mastery.contract_id!=='SECOND-SHIFT-MASTERY-CURRENT-AUTHORITY-CONTRACT-002')fail(`unexpected mastery contract ${mastery.contract_id}`);
 if(mastery.status!=='ACTIVE__VALIDATION_ADAPTER_ONLY__NO_SECOND_TRUTH_STORE')fail(`unexpected mastery status ${mastery.status}`);
 const model=mastery.authority_model||{};
 if(model.current_authority!=='governance/CURRENT-AUTHORITY.json')fail('mastery current_authority pointer mismatch');
 if(model.topology!==authority.topology)fail('mastery topology pointer mismatch');
 if(model.registry!==authority.second_shift_registry)fail('mastery registry pointer mismatch');
 if(model.execution_control!==authority.second_shift_execution_control)fail('mastery execution-control pointer mismatch');
 if(model.delegation_schema!==registry.schema)fail('mastery delegation-schema pointer mismatch');
 if(mastery.portfolio_model!=='OWNER_DRIVEN_NINE_LANE')fail('mastery portfolio model mismatch');
 exactSet('mastery.execution_ready_peer_system_ids',mastery.execution_ready_peer_system_ids,ready);
 const cc=mastery.concurrency_contract||{};
 requireFalse(cc.global_primary_system_exclusivity,'mastery concurrency.global_primary_system_exclusivity');
 if(cc.mutation_wip_per_lane!==1)fail('mastery concurrency.mutation_wip_per_lane must equal 1');
 requireTrue(cc.same_lane_conflicting_mutation_serialized,'mastery concurrency.same_lane_conflicting_mutation_serialized');
 requireTrue(cc.independent_nonconflicting_lanes_may_progress,'mastery concurrency.independent_nonconflicting_lanes_may_progress');
 requireTrue(cc.blocked_lane_does_not_block_independent_safe_other_lane,'mastery concurrency.blocked_lane_does_not_block_independent_safe_other_lane');
 requireTrue(cc.cross_lane_claim_forbidden,'mastery concurrency.cross_lane_claim_forbidden');
 const evaluation=mastery.evaluation_contract||{};
 requireTrue(evaluation.independent_evaluation_required_for_mutation_candidate,'mastery evaluation.independent_evaluation_required_for_mutation_candidate');
 if(evaluation.runtime_state!=='VALIDATING')fail('mastery evaluation.runtime_state must be VALIDATING');
 requireTrue(evaluation.worker_self_approval_forbidden,'mastery evaluation.worker_self_approval_forbidden');
 requireTrue(evaluation.exact_candidate_digest_required,'mastery evaluation.exact_candidate_digest_required');
 requireTrue(evaluation.durable_idempotent_verdict_required,'mastery evaluation.durable_idempotent_verdict_required');
 requireTrue(evaluation.same_lane_successor_before_verdict_forbidden,'mastery evaluation.same_lane_successor_before_verdict_forbidden');
 requireTrue(evaluation.authority_change_or_timeout_fences_candidate,'mastery evaluation.authority_change_or_timeout_fences_candidate');
 const successor=mastery.successor_contract||{};
 for(const key of ['re_read_current_authority','re_read_live_owner_head','preserve_same_lane_owner_job','dependency_valid_successor_only','all_eight_rungs_exhausted_required_before_idle'])requireTrue(successor[key],`mastery successor.${key}`);
 if(mastery.retirement_contract?.PROSE!=='COMPLETE_RETIRED_TERMINAL__NON_DISPATCHABLE')fail('mastery PROSE retirement boundary mismatch');
 if(mastery.retirement_contract?.WEBSITE_BUILDING!=='PROGRAMMING_CAPABILITY__NOT_PEER_LANE')fail('mastery Website Building ownership boundary mismatch');
 const historical=new Map((mastery.historical_mastery_dispositions||[]).map((item)=>[item.id,item]));
 for(const id of ['SECOND-SHIFT-NIGHT-SELECTION-GATE-SCHEMA-001','SECOND-SHIFT-ASSIGNMENT-CONTRACT-SCHEMA-003']){const disposition=historical.get(id);if(!disposition||disposition.disposition!=='PROVENANCE_ONLY__DO_NOT_ACTIVATE')fail(`historical mastery ${id} must remain provenance-only`);}
 if(delegationSchema.schema_id!=='SECOND-SHIFT-DELEGATION-SCHEMA-003')fail('delegation schema id mismatch');
 const runtime=delegationSchema.independent_evaluation_runtime_rule||{};
 if(runtime.coordination_store!=='SupervisorStore'||runtime.state!=='VALIDATING')fail('delegation evaluator runtime binding mismatch');
 if(runtime.required_when_payload_flag!=='independent_evaluation_required')fail('delegation evaluator required flag mismatch');
 requireTrue(runtime.worker_self_approval_forbidden,'delegation evaluator.worker_self_approval_forbidden');
 requireTrue(runtime.accepted_mutation_requires_independent_pass,'delegation evaluator.accepted_mutation_requires_independent_pass');
 requireFalse(runtime.same_lane_successor_while_validating,'delegation evaluator.same_lane_successor_while_validating');
 requireTrue(runtime.independent_other_lane_work_may_continue,'delegation evaluator.independent_other_lane_work_may_continue');
 requireTrue(runtime.exact_candidate_digest_required,'delegation evaluator.exact_candidate_digest_required');
 requireTrue(runtime.durable_verdict_idempotency_required,'delegation evaluator.durable_verdict_idempotency_required');
 const mapping=runtime.verdict_mapping||{};if(mapping.PASS!=='COMPLETED'||mapping.BLOCKED!=='BLOCKED'||mapping.REWORK!=='BLOCKED'||mapping.DRIFT!=='BLOCKED')fail('delegation evaluator verdict mapping mismatch');
 if(runtime.stale_authority_result!=='STALE')fail('delegation evaluator stale-authority result mismatch');
 return {contract_id:mastery.contract_id,status:mastery.status,portfolio_model:mastery.portfolio_model,peer_count:ready.length,mutation_wip_per_lane:cc.mutation_wip_per_lane,evaluation_state:evaluation.runtime_state};
}
function main(){
 const authority=readJson('governance/CURRENT-AUTHORITY.json'); for(const f of ['topology','second_shift_registry','second_shift_execution_control'])if(!authority[f])fail(`CURRENT-AUTHORITY.${f} missing`);
 const topology=readJson(authority.topology), registry=readJson(authority.second_shift_registry), text=readText(authority.second_shift_execution_control), contract=machine(text);
 const mastery=readJson(registry.mastery_current_contract), delegationSchema=readJson(registry.schema), masteryReport=validateMasteryContract({authority,topology,registry,mastery,delegationSchema});
 const ready=topology.execution_readiness?.execution_ready_peer_system_ids; if(!Array.isArray(ready)||ready.length===0)fail('selected topology has no execution-ready peer set');
 exactSet('topology.peer_system_ids',topology.peer_system_ids,ready); exactSet('CURRENT-AUTHORITY.active_peer_execution_lanes',authority.active_peer_execution_lanes,ready); exactSet('topology.second_shift_autoprovision_rule.active_peer_set',topology.second_shift_autoprovision_rule?.active_peer_set,ready);
 if(registry.topology!==authority.topology)fail(`registry topology ${registry.topology} != authority topology ${authority.topology}`); if(registry.execution_control!==authority.second_shift_execution_control)fail('registry execution_control pointer mismatch');
 const ownerFiles=registry.owner_files||{}; exactSet('registry.owner_files keys',Object.keys(ownerFiles),ready); for(const lane of ready){const rel=ownerFiles[lane];if(typeof rel!=='string'||!rel.trim())fail(`owner file missing for ${lane}`);if(!fs.existsSync(path.join(ROOT,rel)))fail(`owner file does not exist for ${lane}: ${rel}`);}
 exactSet('registry expected_active_peers',registry.auto_provisioning_invariant?.expected_active_peers,ready);
 if(contract.execution_control_id!=='SECOND-SHIFT-EXECUTION-CONTROL-001')fail(`unexpected execution_control_id ${contract.execution_control_id}`); if(contract.topology_id!==topology.topology_id)fail(`contract topology ${contract.topology_id} != ${topology.topology_id}`); if(contract.registry_id!==registry.registry_id)fail(`contract registry ${contract.registry_id} != ${registry.registry_id}`); exactSet('contract.peer_system_ids',contract.peer_system_ids,ready);
 const stale=['4-System Architecture','exactly four peer systems','current active lane set is exactly CORE, LEARNING, BOOK and DOCUMENTS','Active peer ledgers are CORE, LEARNING, BOOK and DOCUMENTS only','SYSTEM-TOPOLOGY-005.json::peer_system_ids','Programming has no peer claim domain','Programming product work has no peer utilization ledger']; for(const token of stale)if(text.includes(token))fail(`stale execution-contract token remains: ${token}`);
 const report={status:'PASS',authority_id:authority.authority_id,topology_id:topology.topology_id,registry_id:registry.registry_id,execution_control_id:contract.execution_control_id,execution_control_revision:contract.revision,execution_ready_peer_count:ready.length,execution_ready_peer_system_ids:ready,mastery:masteryReport,checks:{authority_lane_set_matches_topology:true,registry_owner_files_match_topology:true,registry_expected_peers_match_topology:true,owner_files_exist:true,machine_contract_matches_topology:true,legacy_peer_count_assumptions_absent:true,current_mastery_contract_valid:true}}; process.stdout.write(`${JSON.stringify(report,null,2)}\n`);
}
if(require.main===module){try{main();}catch(e){console.error(e?.stack||e);process.exit(1);}}\nmodule.exports={validateMasteryContract};\n