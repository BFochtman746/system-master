import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { createGitHubAppJwt, GitHubAppInstallationTokenProvider } from '../src/github-app-token-provider.js';

const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const PRIVATE=privateKey.export({type:'pkcs8',format:'pem'}).toString();
function decode(part){return JSON.parse(Buffer.from(part,'base64url').toString('utf8'));}
function response(status,body){return {ok:status>=200&&status<300,status,async text(){return JSON.stringify(body);}};}

test('GAT-T001 JWT is RS256, clock-skewed, <=10 minutes ahead, and signed by configured app key',()=>{
  const now=1789166400000;const {token}=createGitHubAppJwt({issuer:'Iv1.client',privateKeyPem:PRIVATE,nowMs:now});const [h,p,s]=token.split('.');const header=decode(h),payload=decode(p);
  assert.deepEqual(header,{alg:'RS256',typ:'JWT'});assert.equal(payload.iss,'Iv1.client');assert.equal(payload.iat,Math.floor(now/1000)-60);assert.equal(payload.exp,Math.floor(now/1000)+540);assert.ok(payload.exp<=Math.floor(now/1000)+600);
  const verifier=createVerify('RSA-SHA256');verifier.update(`${h}.${p}`);verifier.end();assert.equal(verifier.verify(publicKey,Buffer.from(s,'base64url')),true);
});

test('GAT-T002 installation token request is narrowed to one repository and contents write only',async()=>{
  const calls=[];const now=1789166400000;const provider=new GitHubAppInstallationTokenProvider({appId:101,clientId:'Iv1.client',installationId:303,repositoryId:404,privateKeyProvider:async()=>PRIVATE,now:()=>now,fetchImpl:async(url,options)=>{calls.push({url,options});return response(201,{token:'ghs_new_stateless_format_not_assumed_length',expires_at:new Date(now+3600000).toISOString(),permissions:{contents:'write'},repositories:[{id:404}]});}});
  assert.equal(await provider.getToken(),'ghs_new_stateless_format_not_assumed_length');assert.deepEqual(provider.principal,{kind:'github-app',id:'101'});assert.equal(calls.length,1);assert.match(calls[0].url,/\/app\/installations\/303\/access_tokens$/);const body=JSON.parse(calls[0].options.body);assert.deepEqual(body,{repository_ids:[404],permissions:{contents:'write'}});assert.match(calls[0].options.headers.Authorization,/^Bearer /);
});

test('GAT-T003 cached installation token is reused until safety window then refreshed',async()=>{
  let now=1789166400000,calls=0;const provider=new GitHubAppInstallationTokenProvider({appId:101,installationId:303,repositoryId:404,privateKeyProvider:async()=>PRIVATE,now:()=>now,fetchImpl:async()=>{calls+=1;return response(201,{token:`token-${calls}`,expires_at:new Date(now+3600000).toISOString(),permissions:{contents:'write'},repositories:[{id:404}]});}});
  assert.equal(await provider.getToken(),'token-1');now+=10*60*1000;assert.equal(await provider.getToken(),'token-1');assert.equal(calls,1);now+=46*60*1000;assert.equal(await provider.getToken(),'token-2');assert.equal(calls,2);
});

test('GAT-T004 token with wrong permission or repository fails closed',async()=>{
  for(const body of [{token:'x',expires_at:'2026-09-12T00:00:00.000Z',permissions:{contents:'read'},repositories:[{id:404}]},{token:'x',expires_at:'2026-09-12T00:00:00.000Z',permissions:{contents:'write'},repositories:[{id:999}]}]){
    const provider=new GitHubAppInstallationTokenProvider({appId:101,installationId:303,repositoryId:404,privateKeyProvider:async()=>PRIVATE,now:()=>Date.parse('2026-09-11T22:00:00Z'),fetchImpl:async()=>response(201,body)});
    await assert.rejects(provider.getToken(),e=>['GITHUB_APP_PERMISSION_MISMATCH','GITHUB_APP_REPOSITORY_SCOPE_MISMATCH'].includes(e.code));
  }
});

test('GAT-T005 private key provider is called only when minting, not on cached token reads',async()=>{let keyReads=0,now=1789166400000;const provider=new GitHubAppInstallationTokenProvider({appId:101,installationId:303,repositoryId:404,privateKeyProvider:async()=>{keyReads+=1;return PRIVATE;},now:()=>now,fetchImpl:async()=>response(201,{token:'x',expires_at:new Date(now+3600000).toISOString(),permissions:{contents:'write'},repositories:[{id:404}]})});await provider.getToken();await provider.getToken();assert.equal(keyReads,1);});
