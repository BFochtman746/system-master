import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canonicalize, CG001_MISSION_VERSION, finalizeActiveWorkPacket } from '../src/active-work-state.js';
import { DEFAULT_ACTIVE_WORK_HEAD_PATH, publicationRevisionPath } from '../src/github-active-work-publication.js';
import {
  GENESIS_PUBLICATION_BUILDER_PROTOCOL,
  GitHubGenesisPublicationBuilder,
  deriveAuthorityBootstrapRequest,
  validateGenesisPublicationBuildRequest
} from '../src/github-genesis-publication-builder.js';

const sha = (ch) => ch.repeat(40);
const PRE = sha('a');
const STATE_REF = 'control-gateway-state/active-work/foundation-c20-model-dispatch-001';
const WORKSTREAM = 'FOUNDATION-C20-MODEL-DISPATCH';
const REPO = 'BFochtman746/system-master';

function packet(overrides={}) {
  return {
    protocol_version:'control-gateway.active-work.v1',
    mission_version:CG001_MISSION_VERSION,
    workstream_id:WORKSTREAM,
    authority_epoch:1,
    authority_rebind_receipt_id:null,
    authoritative_subject:{algorithm:'sha1',oid:'05fdb2acc5d331289bcc6d5b26387d4da615ec72'},
    repository:REPO,
    branch_or_ref:'foundation/c20-model-dispatch-001',
    allowed_paths_or_effects:{
      paths:['tools/model_dispatch.py','tests/test_system_master_localai_model_dispatch.py','control-gateway/python/a01_execution_worker.py','control-gateway/python/test_a01_execution_worker_model_dispatch.py','.github/scripts/localai-model-dispatch-qualify.py','SYSTEM-MAP.md'],
      effects:['CONTROL_GATEWAY_DEVELOPMENT_WRITE']
    },
    dependency_graph:{version:1,edges:[]},
    qualification_state:'PASSED',
    github_admission_state:'ADMITTED',
    a01_state:'NOT_REQUIRED',
    current_operation:{operation_id:'FOUNDATION-C20-MODEL-DISPATCH-001',predecessor_receipt_id:'FOUNDATION-C20-MODEL-DISPATCH-BOOTSTRAP-AUTHORIZATION',state:'ACTIVE'},
    last_terminal_receipt:null,
    receipt_index:[],
    successor_candidates:[],
    next_legal_operation:{kind:'CONTINUE_CURRENT',operation_id:'FOUNDATION-C20-MODEL-DISPATCH-001',predecessor_receipt_id:'FOUNDATION-C20-MODEL-DISPATCH-BOOTSTRAP-AUTHORIZATION',reason:'CURRENT_OPERATION_NONTERMINAL'},
    ...overrides
  };
}
function request(overrides={}) {
  return {
    protocol_version:GENESIS_PUBLICATION_BUILDER_PROTOCOL,
    operation:'CONTROL-GATEWAY-AUTHORITY-BOOTSTRAP-001',
    repository:REPO,
    state_ref:STATE_REF,
    workstream_id:WORKSTREAM,
    mission_version:CG001_MISSION_VERSION,
    expected_predecessor_sha:PRE,
    initial_packet:packet(),
    ...overrides
  };
}

class FakeTransport {
  constructor() {
    this.refs=new Map();
    this.commits=new Map([[PRE,{sha:PRE,parents:[],files:{}}]]);
    this.counter=1;
    this.tamper=null;
  }
  async getRefOrNull(ref){return this.refs.has(ref)?{sha:this.refs.get(ref)}:null;}
  async getCommit(shaValue){const c=this.commits.get(shaValue);return c?{sha:c.sha,parents:[...c.parents],tree_sha:sha('b')}:null;}
  async readFile(commitSha,path){const c=this.commits.get(commitSha);if(!c) return null;return Object.hasOwn(c.files,path)?c.files[path]:null;}
  async createCommitFromFiles({parentSha,files}){
    const parent=this.commits.get(parentSha);if(!parent) throw new Error('missing parent');
    const id=this.counter.toString(16).padStart(40,'0');this.counter+=1;
    const out={...parent.files,...files};
    if(this.tamper==='head'){const k=DEFAULT_ACTIVE_WORK_HEAD_PATH;out[k]=out[k].replace(WORKSTREAM,'EVIL-WORKSTREAM');}
    const parents=this.tamper==='parent'?[sha('f')]:[parentSha];
    this.commits.set(id,{sha:id,parents,files:out});
    return {sha:id,tree_sha:sha('c')};
  }
}

async function build(r=request(), t=new FakeTransport()) {
  return {receipt:await new GitHubGenesisPublicationBuilder({transport:t}).build(r),transport:t};
}

async function expectCode(promise, code){await assert.rejects(promise,e=>e?.code===code);}

test('wrong bootstrap operation fails closed',()=>expectCode(Promise.resolve().then(()=>validateGenesisPublicationBuildRequest(request({operation:'OTHER'}))),'GENESIS_BUILD_OPERATION_INVALID'));
test('valid request is accepted',()=>assert.equal(validateGenesisPublicationBuildRequest(request()).workstream_id,WORKSTREAM));
test('builder writes exact revision-1 head and immutable mirror',async()=>{const {receipt,transport}=await build();const head=JSON.parse(await transport.readFile(receipt.publication_commit_sha,DEFAULT_ACTIVE_WORK_HEAD_PATH));assert.equal(head.publication_revision,1);assert.equal(head.predecessor_commit_sha,PRE);assert.equal(head.predecessor_packet_digest,null);assert.equal(head.predecessor_publication_digest,null);const mirror=await transport.readFile(receipt.publication_commit_sha,publicationRevisionPath(1,head.packet_digest));assert.equal(canonicalize(JSON.parse(mirror)),canonicalize(head));});
test('builder never creates the authority ref',async()=>{const {transport}=await build();assert.equal(await transport.getRefOrNull(STATE_REF),null);});
test('duplicate state ref fails before creating an orphan commit',async()=>{const t=new FakeTransport();t.refs.set(STATE_REF,sha('d'));const before=t.counter;await expectCode(new GitHubGenesisPublicationBuilder({transport:t}).build(request()),'GENESIS_BUILD_STATE_REF_EXISTS');assert.equal(t.counter,before);});
test('predecessor with active-work head is rejected',async()=>{const t=new FakeTransport();t.commits.get(PRE).files[DEFAULT_ACTIVE_WORK_HEAD_PATH]='{}';await expectCode(new GitHubGenesisPublicationBuilder({transport:t}).build(request()),'GENESIS_BUILD_PREDECESSOR_NOT_CLEAN');});
test('workstream mismatch fails closed',()=>expectCode(Promise.resolve().then(()=>validateGenesisPublicationBuildRequest(request({initial_packet:packet({workstream_id:'OTHER'})}))),'GENESIS_BUILD_PACKET_MISMATCH'));
test('repository mismatch fails closed',()=>expectCode(Promise.resolve().then(()=>validateGenesisPublicationBuildRequest(request({initial_packet:packet({repository:'evil/repo'})}))),'GENESIS_BUILD_PACKET_MISMATCH'));
test('mission mismatch fails closed',()=>expectCode(Promise.resolve().then(()=>validateGenesisPublicationBuildRequest(request({initial_packet:packet({mission_version:'bad/v1'})}))),'GENESIS_BUILD_PACKET_MISMATCH'));
test('qualification must already be PASSED',()=>expectCode(Promise.resolve().then(()=>validateGenesisPublicationBuildRequest(request({initial_packet:packet({qualification_state:'PENDING'})}))),'GENESIS_BUILD_QUALIFICATION_REQUIRED'));
test('github admission must already be ADMITTED',()=>expectCode(Promise.resolve().then(()=>validateGenesisPublicationBuildRequest(request({initial_packet:packet({github_admission_state:'PENDING'})}))),'GENESIS_BUILD_ADMISSION_REQUIRED'));
test('current operation must be ACTIVE',()=>expectCode(Promise.resolve().then(()=>validateGenesisPublicationBuildRequest(request({initial_packet:finalizeActiveWorkPacket(packet({current_operation:{operation_id:'FOUNDATION-C20-MODEL-DISPATCH-001',predecessor_receipt_id:'X',state:'BLOCKED'}}))}))),'GENESIS_BUILD_OPERATION_NOT_ACTIVE'));
test('allowed paths may not be empty',()=>expectCode(Promise.resolve().then(()=>validateGenesisPublicationBuildRequest(request({initial_packet:packet({allowed_paths_or_effects:{paths:[],effects:['CONTROL_GATEWAY_DEVELOPMENT_WRITE']}})}))),'GENESIS_BUILD_PATHS_REQUIRED'));
test('wrong predecessor identity is rejected',async()=>{const t=new FakeTransport();t.commits.delete(PRE);await expectCode(new GitHubGenesisPublicationBuilder({transport:t}).build(request()),'GENESIS_BUILD_PREDECESSOR_MISMATCH');});
test('post-write wrong parent is rejected',async()=>{const t=new FakeTransport();t.tamper='parent';await expectCode(new GitHubGenesisPublicationBuilder({transport:t}).build(request()),'GENESIS_BUILD_POSTWRITE_PARENT_MISMATCH');});
test('post-write envelope tamper is rejected',async()=>{const t=new FakeTransport();t.tamper='head';await assert.rejects(new GitHubGenesisPublicationBuilder({transport:t}).build(request()));});
test('derived legacy bootstrap request is fully bound to builder receipt',async()=>{const {receipt}=await build();const legacy=deriveAuthorityBootstrapRequest(receipt);assert.equal(legacy.operation,'CONTROL-GATEWAY-AUTHORITY-BOOTSTRAP-001');assert.equal(legacy.publication_commit_sha,receipt.publication_commit_sha);assert.equal(legacy.expected_predecessor_sha,PRE);assert.equal(legacy.expected_packet_digest,receipt.packet_digest);assert.equal(legacy.expected_publication_digest,receipt.publication_digest);assert.equal(legacy.expected_subject_sha,packet().authoritative_subject.oid);assert.deepEqual(legacy.expected_allowed_paths,packet().allowed_paths_or_effects.paths);});
test('invalid builder receipt cannot be converted into bootstrap authority',()=>expectCode(Promise.resolve().then(()=>deriveAuthorityBootstrapRequest({protocol_version:GENESIS_PUBLICATION_BUILDER_PROTOCOL,state:'UNVERIFIED'})),'GENESIS_BUILD_RECEIPT_INVALID'));
test('unknown request field fails closed',()=>expectCode(Promise.resolve().then(()=>validateGenesisPublicationBuildRequest({...request(),extra:true})),'GENESIS_BUILD_REQUEST_INVALID'));
test('state ref outside active-work namespace fails closed',()=>expectCode(Promise.resolve().then(()=>validateGenesisPublicationBuildRequest(request({state_ref:'foundation/c20'}))),'GENESIS_BUILD_STATE_REF_FORBIDDEN'));

test('bootstrap script authorizes response and writer before genesis commit creation',()=>{const text=fs.readFileSync(new URL('../../.github/scripts/control-gateway-authority-bootstrap.js',import.meta.url),'utf8');const auth=text.indexOf('assertDevelopmentResponseAuthorization({');const writer=text.indexOf('validateBootstrapWriterCredential(writerCredential);');const build=text.indexOf('builder.build(rawRequest)');assert.ok(auth>=0&&writer>auth&&build>writer);});







