import { createSign } from 'node:crypto';
import { ControllerError } from './errors.js';

const API_VERSION='2026-03-10';
function b64url(value){return Buffer.from(value).toString('base64url');}
function json64(value){return b64url(JSON.stringify(value));}

export function createGitHubAppJwt({issuer,privateKeyPem,nowMs=Date.now()}){
  if((typeof issuer!=='string'&&typeof issuer!=='number')||String(issuer).length===0)throw new ControllerError('GITHUB_APP_CONFIG_INVALID','GitHub App issuer required');
  if(typeof privateKeyPem!=='string'||!privateKeyPem.includes('PRIVATE KEY'))throw new ControllerError('GITHUB_APP_KEY_INVALID','GitHub App private key PEM required');
  const now=Math.floor(nowMs/1000);const header={alg:'RS256',typ:'JWT'};const payload={iat:now-60,exp:now+540,iss:String(issuer)};
  const signingInput=`${json64(header)}.${json64(payload)}`;
  const signer=createSign('RSA-SHA256');signer.update(signingInput);signer.end();
  const signature=signer.sign(privateKeyPem).toString('base64url');
  return {token:`${signingInput}.${signature}`,header,payload};
}

export class GitHubAppInstallationTokenProvider {
  constructor({appId,clientId=null,installationId,repositoryId,privateKeyProvider,fetchImpl=globalThis.fetch,apiBase='https://api.github.com',now=()=>Date.now(),refreshSkewMs=5*60*1000}){
    for(const [name,value] of Object.entries({appId,installationId,repositoryId}))if(!Number.isSafeInteger(Number(value))||Number(value)<=0)throw new ControllerError('GITHUB_APP_CONFIG_INVALID',`${name} must be a positive integer`);
    if(typeof privateKeyProvider!=='function')throw new ControllerError('GITHUB_APP_CONFIG_INVALID','privateKeyProvider function required');
    if(typeof fetchImpl!=='function')throw new ControllerError('GITHUB_APP_CONFIG_INVALID','fetch implementation required');
    this.appId=Number(appId);this.clientId=clientId===null?null:String(clientId);this.installationId=Number(installationId);this.repositoryId=Number(repositoryId);this.privateKeyProvider=privateKeyProvider;this.fetchImpl=fetchImpl;this.apiBase=apiBase.replace(/\/$/,'');this.now=now;this.refreshSkewMs=refreshSkewMs;this.cached=null;
    this.principal=Object.freeze({kind:'github-app',id:String(this.appId)});
  }

  async mint(){
    const privateKeyPem=await this.privateKeyProvider();
    const {token:jwt}=createGitHubAppJwt({issuer:this.clientId??this.appId,privateKeyPem,nowMs:this.now()});
    let response;
    try{response=await this.fetchImpl(`${this.apiBase}/app/installations/${this.installationId}/access_tokens`,{method:'POST',headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${jwt}`,'X-GitHub-Api-Version':API_VERSION,'Content-Type':'application/json'},body:JSON.stringify({repository_ids:[this.repositoryId],permissions:{contents:'write'}})});}catch(cause){throw new ControllerError('GITHUB_APP_TOKEN_NETWORK_FAILURE','installation token request failed',{cause:String(cause?.message??cause)});}
    const text=await response.text();let body=null;try{body=text?JSON.parse(text):null;}catch{body=text;}
    if(!response.ok)throw new ControllerError('GITHUB_APP_TOKEN_FAILED',`GitHub installation token request failed: ${response.status}`,{status:response.status,body});
    if(typeof body?.token!=='string'||body.token.length===0)throw new ControllerError('GITHUB_APP_TOKEN_INVALID','installation token response missing token');
    const expiresAt=Date.parse(body.expires_at);if(!Number.isFinite(expiresAt)||expiresAt<=this.now())throw new ControllerError('GITHUB_APP_TOKEN_INVALID','installation token response has invalid expiry');
    if(body.permissions?.contents!=='write')throw new ControllerError('GITHUB_APP_PERMISSION_MISMATCH','installation token did not receive contents:write');
    if(Array.isArray(body.repositories)&&!body.repositories.some(r=>Number(r.id)===this.repositoryId))throw new ControllerError('GITHUB_APP_REPOSITORY_SCOPE_MISMATCH','installation token response does not include configured control-state repository');
    this.cached={token:body.token,expiresAt};return this.cached;
  }

  async getToken(){
    if(this.cached&&this.cached.expiresAt-this.now()>this.refreshSkewMs)return this.cached.token;
    return (await this.mint()).token;
  }

  asTokenProvider(){const fn=this.getToken.bind(this);fn.principal=this.principal;fn.repositoryId=this.repositoryId;return fn;}
}
