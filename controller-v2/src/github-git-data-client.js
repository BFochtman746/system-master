import { ControllerError } from './errors.js';

const DEFAULT_API_VERSION='2026-03-10';
const JSON_ACCEPT='application/vnd.github+json';

function fail(code,message,details={}){throw new ControllerError(code,message,details);}
function encodeRef(ref){return ref.split('/').map(encodeURIComponent).join('/');}
function header(response,name){return response.headers?.get?.(name)??response.headers?.get?.(name.toLowerCase())??null;}

async function responsePayload(response){
  const text=await response.text();
  if(!text)return null;
  try{return JSON.parse(text);}catch{return {message:text};}
}

export class GitHubGitDataClient {
  constructor({owner,repo,tokenProvider,fetchImpl=globalThis.fetch,baseUrl='https://api.github.com',apiVersion=DEFAULT_API_VERSION}={}){
    if(!owner||!repo)fail('GITHUB_REPOSITORY_REQUIRED','owner and repo are required');
    if(typeof tokenProvider!=='function')fail('GITHUB_TOKEN_PROVIDER_REQUIRED','tokenProvider function is required');
    if(typeof fetchImpl!=='function')fail('GITHUB_FETCH_REQUIRED','fetch implementation is required');
    this.owner=owner;this.repo=repo;this.tokenProvider=tokenProvider;this.fetchImpl=fetchImpl;this.baseUrl=baseUrl.replace(/\/$/,'');this.apiVersion=apiVersion;
  }

  async _token(forceRefresh=false){
    const supplied=await this.tokenProvider({forceRefresh});
    const token=typeof supplied==='string'?supplied:supplied?.token;
    if(!token)fail('GITHUB_TOKEN_UNAVAILABLE','token provider returned no token');
    return token;
  }

  _url(path){return `${this.baseUrl}/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}${path}`;}

  async _request(method,path,{body=null,accept=JSON_ACCEPT,retryAuth=true}={}){
    const token=await this._token(false);
    let response;
    try{
      response=await this.fetchImpl(this._url(path),{method,headers:{Accept:accept,Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':this.apiVersion,'Content-Type':'application/json'},body:body===null?undefined:JSON.stringify(body)});
    }catch(error){
      fail('GITHUB_REMOTE_STATE_UNKNOWN',`network failure during ${method} ${path}`,{method,path,cause:String(error?.message??error),ambiguous:method!=='GET'});
    }
    if(response.ok)return accept==='application/vnd.github.raw+json'?response.text():responsePayload(response);
    const payload=await responsePayload(response);
    const message=payload?.message??`GitHub HTTP ${response.status}`;
    const retryAfter=header(response,'retry-after');
    const remaining=header(response,'x-ratelimit-remaining');
    const reset=header(response,'x-ratelimit-reset');
    if(response.status===401&&retryAuth){
      const refreshed=await this._token(true);
      let second;
      try{
        second=await this.fetchImpl(this._url(path),{method,headers:{Accept:accept,Authorization:`Bearer ${refreshed}`,'X-GitHub-Api-Version':this.apiVersion,'Content-Type':'application/json'},body:body===null?undefined:JSON.stringify(body)});
      }catch(error){
        fail('GITHUB_REMOTE_STATE_UNKNOWN',`network failure after credential refresh during ${method} ${path}`,{method,path,cause:String(error?.message??error),ambiguous:method!=='GET'});
      }
      if(second.ok)return accept==='application/vnd.github.raw+json'?second.text():responsePayload(second);
      const p2=await responsePayload(second);
      fail('GITHUB_AUTHENTICATION_FAILED',p2?.message??'GitHub authentication failed after token refresh',{status:second.status,method,path});
    }
    if(response.status===429||(response.status===403&&(retryAfter!==null||remaining==='0'||/rate limit/i.test(message)))){
      fail('GITHUB_RATE_LIMITED',message,{status:response.status,retry_after_seconds:retryAfter===null?null:Number(retryAfter),rate_limit_reset_epoch:reset===null?null:Number(reset),method,path});
    }
    if(response.status===403)fail('GITHUB_PERMISSION_DENIED',message,{status:403,accepted_permissions:header(response,'x-accepted-github-permissions'),method,path});
    if(response.status===404)fail('GITHUB_NOT_FOUND',message,{status:404,method,path});
    if(response.status===409)fail('NON_FAST_FORWARD',message,{status:409,method,path});
    if(response.status===422)fail('GITHUB_VALIDATION_FAILED',message,{status:422,method,path,errors:payload?.errors??null});
    fail('GITHUB_API_ERROR',message,{status:response.status,method,path});
  }

  async createBlob(content){const r=await this._request('POST','/git/blobs',{body:{content:String(content),encoding:'utf-8'}});if(!r?.sha)fail('GITHUB_RESPONSE_INVALID','create blob response missing sha');return r.sha;}
  async getBlob(sha){return this._request('GET',`/git/blobs/${encodeURIComponent(sha)}`,{accept:'application/vnd.github.raw+json'});}

  async createTree(baseTreeOid,changes){
    const tree=Object.entries(changes??{}).map(([path,sha])=>({path,mode:'100644',type:'blob',sha}));
    const body={tree};if(baseTreeOid)body.base_tree=baseTreeOid;
    const r=await this._request('POST','/git/trees',{body});if(!r?.sha)fail('GITHUB_RESPONSE_INVALID','create tree response missing sha');return r.sha;
  }
  async getTree(sha){
    const r=await this._request('GET',`/git/trees/${encodeURIComponent(sha)}?recursive=1`);
    if(r?.truncated)fail('GITHUB_TREE_TRUNCATED','recursive Git tree response was truncated');
    if(!Array.isArray(r?.tree))fail('GITHUB_RESPONSE_INVALID','tree response missing entries');
    const files={};
    for(const entry of r.tree){if(entry.type==='blob')files[entry.path]=entry.sha;}
    return {files};
  }

  async createCommit({message,tree,parents=[]}){const r=await this._request('POST','/git/commits',{body:{message,tree,parents}});if(!r?.sha)fail('GITHUB_RESPONSE_INVALID','create commit response missing sha');return r.sha;}
  async getCommit(sha){const r=await this._request('GET',`/git/commits/${encodeURIComponent(sha)}`);if(!r?.tree?.sha||!Array.isArray(r?.parents))fail('GITHUB_RESPONSE_INVALID','commit response incomplete');return {message:r.message??'',tree:r.tree.sha,parents:r.parents.map(p=>p.sha)};}

  async createRef(ref,commitOid){const r=await this._request('POST','/git/refs',{body:{ref:`refs/${ref}`,sha:commitOid}});return r?.object?.sha??commitOid;}
  async getRef(ref){const r=await this._request('GET',`/git/ref/${encodeRef(ref)}`);if(!r?.object?.sha)fail('GITHUB_RESPONSE_INVALID','ref response missing object sha');return r.object.sha;}

  async updateRef(ref,commitOid,{force=false,expectedOldOid=null}={}){
    if(force!==false)fail('GITHUB_FORCE_UPDATE_FORBIDDEN','journal client never permits force ref updates');
    if(expectedOldOid){const observed=await this.getRef(ref);if(observed!==expectedOldOid)fail('NON_FAST_FORWARD','observed ref no longer equals expected old head',{expected:expectedOldOid,observed});}
    const r=await this._request('PATCH',`/git/refs/${encodeRef(ref)}`,{body:{sha:commitOid,force:false}});
    if(!r?.object?.sha)fail('GITHUB_RESPONSE_INVALID','updated ref response missing object sha');
    return r.object.sha;
  }
}
