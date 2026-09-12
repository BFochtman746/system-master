import { ControllerError } from './errors.js';
import { GitHubApiError } from './github-git-transport.js';

export const COMMAND_INBOX_NAMESPACE = 'controller-inbox/v1';

function encodeRefPath(value) {
  return String(value).split('/').map(encodeURIComponent).join('/');
}

function assertObjectId(value, label) {
  if (typeof value !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value)) {
    throw new ControllerError('INBOX_TRANSPORT_INVALID', `${label} must be a lowercase Git object id`);
  }
  return value;
}

function commandTag(commandId) {
  if (typeof commandId !== 'string' || commandId.length === 0 || commandId.includes('/')) {
    throw new ControllerError('INBOX_COMMAND_ID_INVALID', 'command id must be one path-safe segment');
  }
  return `${COMMAND_INBOX_NAMESPACE}/${commandId}`;
}

function isNotFound(error) {
  return error instanceof GitHubApiError && error.status === 404;
}

export class GitHubCommandInboxTransport {
  constructor({ git }) {
    if (!git || typeof git.request !== 'function' || typeof git.createBlob !== 'function') {
      throw new TypeError('GitHub Git database transport required');
    }
    this.git = git;
  }

  async createCommandBlob(canonicalCommandJson) {
    if (typeof canonicalCommandJson !== 'string') throw new ControllerError('INBOX_TRANSPORT_INVALID', 'canonical command JSON string required');
    return assertObjectId(await this.git.createBlob(canonicalCommandJson), 'created command blob');
  }

  async createAnnotatedCommandTag(commandId, blobSha) {
    const tag = commandTag(commandId);
    const result = await this.git.request('POST', `/repos/${encodeURIComponent(this.git.owner)}/${encodeURIComponent(this.git.repo)}/git/tags`, {
      tag,
      message: 'controller durable command inbox v1',
      object: assertObjectId(blobSha, 'command blob sha'),
      type: 'blob'
    });
    return { sha: assertObjectId(result?.sha, 'created tag object'), tag };
  }

  async createCommandRef(commandId, tagSha) {
    const tag = commandTag(commandId);
    const result = await this.git.request('POST', `/repos/${encodeURIComponent(this.git.owner)}/${encodeURIComponent(this.git.repo)}/git/refs`, {
      ref: `refs/tags/${tag}`,
      sha: assertObjectId(tagSha, 'tag object sha')
    });
    return { ref: result?.ref ?? `refs/tags/${tag}`, sha: assertObjectId(result?.object?.sha ?? tagSha, 'created command ref target') };
  }

  async getCommandRef(commandId) {
    const tag = commandTag(commandId);
    try {
      const result = await this.git.request('GET', `/repos/${encodeURIComponent(this.git.owner)}/${encodeURIComponent(this.git.repo)}/git/ref/tags/${encodeRefPath(tag)}`);
      return { ref: result?.ref ?? `refs/tags/${tag}`, sha: assertObjectId(result?.object?.sha, 'command ref target') };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async listCommandRefs() {
    const prefix = `${COMMAND_INBOX_NAMESPACE}/`;
    const result = await this.git.request('GET', `/repos/${encodeURIComponent(this.git.owner)}/${encodeURIComponent(this.git.repo)}/git/matching-refs/tags/${encodeRefPath(prefix)}`);
    if (!Array.isArray(result)) throw new ControllerError('INBOX_TRANSPORT_INVALID', 'matching refs response must be an array');
    return result.map((entry) => ({
      ref: String(entry?.ref ?? ''),
      sha: assertObjectId(entry?.object?.sha, 'command ref target')
    }));
  }

  async getAnnotatedTag(tagSha) {
    const sha = assertObjectId(tagSha, 'tag object sha');
    const result = await this.git.request('GET', `/repos/${encodeURIComponent(this.git.owner)}/${encodeURIComponent(this.git.repo)}/git/tags/${encodeURIComponent(sha)}`);
    return {
      sha: assertObjectId(result?.sha ?? sha, 'tag object sha'),
      tag: String(result?.tag ?? ''),
      message: String(result?.message ?? ''),
      tagger: result?.tagger ?? null,
      object: {
        type: String(result?.object?.type ?? ''),
        sha: assertObjectId(result?.object?.sha, 'tag target sha')
      }
    };
  }

  async getBlobText(blobSha) {
    const sha = assertObjectId(blobSha, 'blob sha');
    const result = await this.git.request('GET', `/repos/${encodeURIComponent(this.git.owner)}/${encodeURIComponent(this.git.repo)}/git/blobs/${encodeURIComponent(sha)}`);
    if (result?.encoding !== 'base64' || typeof result?.content !== 'string') throw new ControllerError('INBOX_BLOB_INVALID', 'command blob must be base64 encoded by GitHub API');
    return Buffer.from(result.content.replace(/\n/g, ''), 'base64').toString('utf8');
  }
}

export const CommandInboxTransportNames = Object.freeze({ commandTag });
