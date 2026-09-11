import { sha256 } from '../src/canonical.js';
import { GitHubApiError } from '../src/github-git-transport.js';

function cloneFiles(files) { return new Map([...files.entries()].map(([k,v]) => [k,String(v)])); }

export class FakeGitTransport {
  constructor() {
    this.commits = new Map();
    this.refs = new Map();
    this.counter = 0;
    this.failBeforeRefUpdate = 0;
    this.failAfterRefUpdate = 0;
    this.beforeRefUpdate = null;
    this.genesisSha = this.seedCommit({});
  }

  nextSha(seed) { this.counter += 1; return sha256({seed,counter:this.counter}).slice(0,40); }
  seedCommit(files = {}, parentSha = null) { const sha=this.nextSha({parentSha,files});this.commits.set(sha,{sha,parentSha,files:new Map(Object.entries(files).map(([k,v])=>[k,String(v)]))});return sha; }

  async getRef(branch) { if(!this.refs.has(branch))throw new GitHubApiError('GITHUB_NOT_FOUND','ref not found',{status:404});return {sha:this.refs.get(branch)}; }

  async createRef(branch,sha) {
    if(this.refs.has(branch))throw new GitHubApiError('GITHUB_HEAD_CONFLICT','ref exists',{status:422});
    if(!this.commits.has(sha))throw new GitHubApiError('GITHUB_NOT_FOUND','commit not found',{status:404});
    if(typeof this.beforeRefUpdate==='function')await this.beforeRefUpdate({branch,sha,create:true});
    if(this.failBeforeRefUpdate>0){this.failBeforeRefUpdate-=1;throw new GitHubApiError('GITHUB_NETWORK_AMBIGUOUS','simulated network failure before create',{cause:new Error('offline')});}
    // Re-check after the interleaving hook: GitHub ref creation is atomic and a concurrent creator may have won.
    if(this.refs.has(branch))throw new GitHubApiError('GITHUB_HEAD_CONFLICT','ref created concurrently',{status:422});
    this.refs.set(branch,sha);
    if(this.failAfterRefUpdate>0){this.failAfterRefUpdate-=1;throw new GitHubApiError('GITHUB_NETWORK_AMBIGUOUS','simulated lost create acknowledgement',{cause:new Error('lost ack')});}
    return {sha};
  }

  async getCommit(sha) { const c=this.commits.get(sha);if(!c)throw new GitHubApiError('GITHUB_NOT_FOUND','commit not found',{status:404});return {sha:c.sha,tree_sha:`tree-${c.sha}`,parents:c.parentSha?[c.parentSha]:[]}; }
  async readFile(commitSha,path) { const c=this.commits.get(commitSha);if(!c)throw new GitHubApiError('GITHUB_NOT_FOUND','commit not found',{status:404});return c.files.has(path)?c.files.get(path):null; }

  async createCommitFromFiles({parentSha,files,message}) {
    const parent=this.commits.get(parentSha);if(!parent)throw new GitHubApiError('GITHUB_NOT_FOUND','parent commit not found',{status:404});
    const next=cloneFiles(parent.files);for(const [path,content] of Object.entries(files))next.set(path,String(content));
    const sha=this.nextSha({parentSha,message,files:Object.entries(files)});this.commits.set(sha,{sha,parentSha,files:next,message});return {sha,tree_sha:`tree-${sha}`};
  }

  isAncestor(ancestor,descendant) { let current=descendant;const seen=new Set();while(current){if(current===ancestor)return true;if(seen.has(current))return false;seen.add(current);current=this.commits.get(current)?.parentSha??null;}return false; }

  async updateRefFastForward(branch,sha) {
    if(!this.refs.has(branch))throw new GitHubApiError('GITHUB_NOT_FOUND','ref not found',{status:404});
    if(!this.commits.has(sha))throw new GitHubApiError('GITHUB_NOT_FOUND','commit not found',{status:404});
    if(typeof this.beforeRefUpdate==='function')await this.beforeRefUpdate({branch,sha,create:false});
    if(this.failBeforeRefUpdate>0){this.failBeforeRefUpdate-=1;throw new GitHubApiError('GITHUB_NETWORK_AMBIGUOUS','simulated network failure before patch',{cause:new Error('offline')});}
    const current=this.refs.get(branch);if(!this.isAncestor(current,sha))throw new GitHubApiError('JOURNAL_HEAD_CONFLICT','non-fast-forward',{status:422});
    this.refs.set(branch,sha);
    if(this.failAfterRefUpdate>0){this.failAfterRefUpdate-=1;throw new GitHubApiError('GITHUB_NETWORK_AMBIGUOUS','simulated lost patch acknowledgement',{cause:new Error('lost ack')});}
    return {sha};
  }

  corruptFileAtRef(branch,path,mutator) { const sha=this.refs.get(branch);if(!sha)throw new Error('ref missing');const commit=this.commits.get(sha);const current=commit.files.get(path);if(current===undefined)throw new Error(`file missing ${path}`);commit.files.set(path,typeof mutator==='function'?String(mutator(current)):String(mutator)); }
  deleteFileAtRef(branch,path) { const sha=this.refs.get(branch);if(!sha)throw new Error('ref missing');this.commits.get(sha).files.delete(path); }
  rewindRef(branch,sha) { if(!this.commits.has(sha))throw new Error('commit missing');this.refs.set(branch,sha); }
}
