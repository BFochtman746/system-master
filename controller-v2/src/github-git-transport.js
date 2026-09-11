import { ControllerError } from './errors.js';

const API_VERSION = '2026-03-10';

function encodeRefPath(branch) {
  return branch.split('/').map(encodeURIComponent).join('/');
}

function encodeContentPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function errorCode(status) {
  if (status === 401) return 'GITHUB_AUTH_FAILED';
  if (status === 403) return 'GITHUB_FORBIDDEN';
  if (status === 404) return 'GITHUB_NOT_FOUND';
  if (status === 409 || status === 422) return 'GITHUB_HEAD_CONFLICT';
  if (status === 429) return 'GITHUB_RATE_LIMITED';
  if (status >= 500) return 'GITHUB_UNAVAILABLE';
  return 'GITHUB_API_ERROR';
}

export class GitHubApiError extends ControllerError {
  constructor(code, message, { status = null, body = null, cause = null } = {}) {
    super(code, message, { status, body });
    this.name = 'GitHubApiError';
    this.status = status;
    this.body = body;
    if (cause) this.cause = cause;
  }
}

export class GitHubGitDatabaseTransport {
  constructor({ owner, repo, tokenProvider, fetchImpl = globalThis.fetch, apiBase = 'https://api.github.com' }) {
    if (!owner || !repo) throw new TypeError('owner and repo are required');
    if (typeof tokenProvider !== 'function') throw new TypeError('tokenProvider function required');
    if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation required');
    this.owner = owner;
    this.repo = repo;
    this.tokenProvider = tokenProvider;
    this.fetchImpl = fetchImpl;
    this.apiBase = apiBase.replace(/\/$/, '');
  }

  async request(method, path, body = undefined) {
    const token = await this.tokenProvider();
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': API_VERSION
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await this.fetchImpl(`${this.apiBase}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (cause) {
      throw new GitHubApiError('GITHUB_NETWORK_AMBIGUOUS', 'GitHub request failed before a definitive response', { cause });
    }
    const text = await response.text();
    let parsed = null;
    if (text) {
      try { parsed = JSON.parse(text); } catch { parsed = text; }
    }
    if (!response.ok) {
      const code = errorCode(response.status);
      const message = typeof parsed === 'object' && parsed?.message ? parsed.message : `GitHub API ${response.status}`;
      throw new GitHubApiError(code, message, { status: response.status, body: parsed });
    }
    return parsed;
  }

  async getRef(branch) {
    const ref = await this.request('GET', `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/git/ref/heads/${encodeRefPath(branch)}`);
    return { sha: ref.object.sha };
  }

  async createRef(branch, sha) {
    const result = await this.request('POST', `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/git/refs`, {
      ref: `refs/heads/${branch}`,
      sha
    });
    return { sha: result.object.sha };
  }

  async getCommit(sha) {
    const commit = await this.request('GET', `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/git/commits/${encodeURIComponent(sha)}`);
    return {
      sha: commit.sha,
      tree_sha: commit.tree.sha,
      parents: (commit.parents || []).map((p) => p.sha)
    };
  }

  async readFile(commitSha, path) {
    try {
      const result = await this.request('GET', `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/contents/${encodeContentPath(path)}?ref=${encodeURIComponent(commitSha)}`);
      if (!result || result.type !== 'file' || result.encoding !== 'base64') throw new GitHubApiError('GITHUB_CONTENT_INVALID', `unexpected content response for ${path}`);
      return Buffer.from(String(result.content).replace(/\n/g, ''), 'base64').toString('utf8');
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) return null;
      throw error;
    }
  }

  async createBlob(content) {
    const blob = await this.request('POST', `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/git/blobs`, {
      content,
      encoding: 'utf-8'
    });
    return blob.sha;
  }

  async createCommitFromFiles({ parentSha, files, message }) {
    const parent = await this.getCommit(parentSha);
    const tree = [];
    for (const [path, content] of Object.entries(files)) {
      const sha = await this.createBlob(content);
      tree.push({ path, mode: '100644', type: 'blob', sha });
    }
    const createdTree = await this.request('POST', `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/git/trees`, {
      base_tree: parent.tree_sha,
      tree
    });
    const commit = await this.request('POST', `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/git/commits`, {
      message,
      tree: createdTree.sha,
      parents: [parentSha]
    });
    return { sha: commit.sha, tree_sha: createdTree.sha };
  }

  async updateRefFastForward(branch, sha) {
    try {
      const result = await this.request('PATCH', `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/git/refs/heads/${encodeRefPath(branch)}`, {
        sha,
        force: false
      });
      return { sha: result.object.sha };
    } catch (error) {
      if (error instanceof GitHubApiError && (error.status === 409 || error.status === 422)) {
        throw new GitHubApiError('JOURNAL_HEAD_CONFLICT', 'GitHub rejected non-fast-forward journal ref update', {
          status: error.status,
          body: error.body,
          cause: error
        });
      }
      throw error;
    }
  }
}
