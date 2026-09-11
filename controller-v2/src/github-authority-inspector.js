import { GitHubApiError } from './github-git-transport.js';

function encodeBranch(branch){return branch.split('/').map(encodeURIComponent).join('/');}
function ruleTypes(ruleset){return new Set((ruleset?.rules??[]).map(r=>r?.type).filter(Boolean));}

export class GitHubAuthorityInspector {
  constructor({transport}){
    if(!transport||typeof transport.request!=='function')throw new TypeError('GitHub transport with request() required');
    this.transport=transport;
  }

  async branchExists(branch){
    try{await this.transport.getRef(branch);return true;}catch(e){if(e instanceof GitHubApiError&&e.status===404)return false;throw e;}
  }

  async applicableRulesets(branch){
    const owner=encodeURIComponent(this.transport.owner);const repo=encodeURIComponent(this.transport.repo);
    const applied=await this.transport.request('GET',`/repos/${owner}/${repo}/rules/branches/${encodeBranch(branch)}`);
    const ids=[...new Set((applied??[]).map(r=>r.ruleset_id).filter(id=>Number.isSafeInteger(id)))];
    const full=[];
    for(const id of ids)full.push(await this.transport.request('GET',`/repos/${owner}/${repo}/rulesets/${id}?includes_parents=true`));
    return full;
  }

  async inspectBranch(branch){
    const rulesets=await this.applicableRulesets(branch);
    const writer_rulesets=[];const integrity_rulesets=[];
    for(const r of rulesets){const types=ruleTypes(r);if(types.has('update'))writer_rulesets.push(r);if(types.has('deletion')||types.has('non_fast_forward'))integrity_rulesets.push(r);}
    return {branch_exists:await this.branchExists(branch),writer_rulesets,integrity_rulesets};
  }

  async inspect({journalBranch,anchorBranch}){
    const owner=encodeURIComponent(this.transport.owner);const repo=encodeURIComponent(this.transport.repo);
    let metadata;
    try{metadata=await this.transport.request('GET',`/repos/${owner}/${repo}`);}catch(e){if(e instanceof GitHubApiError&&e.status===404)return {repository_exists:false,repository_full_name:`${this.transport.owner}/${this.transport.repo}`,repository_id:null,journal:null,anchor:null};throw e;}
    return {
      repository_exists:true,
      repository_full_name:metadata.full_name,
      repository_id:Number(metadata.id),
      journal:await this.inspectBranch(journalBranch),
      anchor:await this.inspectBranch(anchorBranch)
    };
  }
}
