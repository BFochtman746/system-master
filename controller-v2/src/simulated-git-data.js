import { canonicalize, sha256 } from './canonical.js';

function oid(kind,value){return sha256(`${kind}\0${typeof value==='string'?value:canonicalize(value)}`).slice(0,40);}
function httpError(status,message,{ambiguous=false,code=null}={}){const e=new Error(message);e.status=status;e.ambiguous=ambiguous;if(code)e.code=code;return e;}

export class SimulatedGitDataApi {
  constructor(){
    this.blobs=new Map();this.trees=new Map();this.commits=new Map();this.refs=new Map();this.calls=[];this.faults=[];
  }
  injectFault({method,when='before',times=1,status=500,code=null,ambiguous=false,message=`simulated ${method} failure`}){
    this.faults.push({method,when,times,status,code,ambiguous,message});
  }
  _fault(method,when){
    const f=this.faults.find(x=>x.method===method&&x.when===when&&x.times>0);
    if(!f)return;f.times-=1;throw httpError(f.status,f.message,{ambiguous:f.ambiguous,code:f.code});
  }
  _call(method,args){this.calls.push({method,args:structuredClone(args)});this._fault(method,'before');}
  _after(method){this._fault(method,'after');}

  async createBlob(content){this._call('createBlob',{content});const id=oid('blob',content);this.blobs.set(id,String(content));this._after('createBlob');return id;}
  async getBlob(id){this._call('getBlob',{id});if(!this.blobs.has(id))throw httpError(404,'blob not found');const value=this.blobs.get(id);this._after('getBlob');return value;}

  async createTree(baseTreeOid,changes){
    this._call('createTree',{baseTreeOid,changes});
    const files=baseTreeOid?(this.trees.get(baseTreeOid)?.files):{};
    if(baseTreeOid&&!files)throw httpError(404,'base tree not found');
    const next={...(files??{})};
    for(const [path,blobOid] of Object.entries(changes??{})){if(!this.blobs.has(blobOid))throw httpError(404,`blob missing for ${path}`);next[path]=blobOid;}
    const tree={files:next};const id=oid('tree',tree);this.trees.set(id,structuredClone(tree));this._after('createTree');return id;
  }
  async getTree(id){this._call('getTree',{id});const tree=this.trees.get(id);if(!tree)throw httpError(404,'tree not found');this._after('getTree');return structuredClone(tree);}

  async createCommit({message,tree,parents=[]}){
    this._call('createCommit',{message,tree,parents});if(!this.trees.has(tree))throw httpError(404,'tree not found');for(const p of parents)if(!this.commits.has(p))throw httpError(404,'parent not found');
    const commit={message,tree,parents:[...parents]};const id=oid('commit',commit);this.commits.set(id,structuredClone(commit));this._after('createCommit');return id;
  }
  async getCommit(id){this._call('getCommit',{id});const c=this.commits.get(id);if(!c)throw httpError(404,'commit not found');this._after('getCommit');return structuredClone(c);}

  async createRef(ref,commitOid){this._call('createRef',{ref,commitOid});if(this.refs.has(ref))throw httpError(422,'ref already exists');if(!this.commits.has(commitOid))throw httpError(404,'commit not found');this.refs.set(ref,commitOid);this._after('createRef');return commitOid;}
  async getRef(ref){this._call('getRef',{ref});if(!this.refs.has(ref))throw httpError(404,'ref missing');const id=this.refs.get(ref);this._after('getRef');return id;}

  _isAncestor(ancestor,descendant){let cursor=descendant,guard=0;while(cursor&&guard++<100000){if(cursor===ancestor)return true;const c=this.commits.get(cursor);cursor=c?.parents?.[0]??null;}return false;}
  async updateRef(ref,commitOid,{force=false,expectedOldOid=null}={}){
    this._call('updateRef',{ref,commitOid,force,expectedOldOid});
    if(!this.refs.has(ref))throw httpError(404,'ref missing');if(!this.commits.has(commitOid))throw httpError(404,'commit not found');
    const current=this.refs.get(ref);
    if(expectedOldOid&&current!==expectedOldOid)throw httpError(409,'stale expected head',{code:'NON_FAST_FORWARD'});
    if(!force&&!this._isAncestor(current,commitOid))throw httpError(409,'non-fast-forward',{code:'NON_FAST_FORWARD'});
    this.refs.set(ref,commitOid);
    this._after('updateRef');
    return commitOid;
  }

  forceSetRef(ref,commitOid){if(!this.commits.has(commitOid))throw new Error('commit not found');this.refs.set(ref,commitOid);}
  deleteRef(ref){this.refs.delete(ref);}
  mutateBlobForTest(blobOid,newContent){if(!this.blobs.has(blobOid))throw new Error('blob not found');this.blobs.set(blobOid,newContent);}
  removeBlobForTest(blobOid){this.blobs.delete(blobOid);}
  resetCalls(){this.calls=[];}
}
