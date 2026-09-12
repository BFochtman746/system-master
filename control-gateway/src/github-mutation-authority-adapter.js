import { GitHubMutationAdmissionError } from './github-mutation-admission.js';

function fail(code, message) {
  throw new GitHubMutationAdmissionError(code, message);
}

export class GitHubMutationAuthorityAdapter {
  constructor({ chatReconstructionAdapter }) {
    if (!chatReconstructionAdapter || typeof chatReconstructionAdapter.reconstructContinuation !== 'function') throw new TypeError('chatReconstructionAdapter.reconstructContinuation function required');
    if (!chatReconstructionAdapter.publisher || typeof chatReconstructionAdapter.publisher.reconstruct !== 'function') throw new TypeError('CG-004 chat reconstruction adapter with publisher.reconstruct required');
    this.chatReconstructionAdapter = chatReconstructionAdapter;
  }

  async reconstructContinuation() {
    const chat = await this.chatReconstructionAdapter.reconstructContinuation();
    const publication = await this.chatReconstructionAdapter.publisher.reconstruct();
    if (chat.publication_ref !== publication.ref || chat.publication_commit_sha !== publication.head_commit_sha || chat.packet_digest !== publication.packet_digest) {
      fail('AUTHORITY_RECONSTRUCTION_MOVED', 'CG-004 chat reconstruction and publication packet do not resolve to the same stable authority snapshot');
    }
    const packet = publication.envelope.packet;
    if (chat.mission_version !== packet.mission_version || chat.workstream_id !== packet.workstream_id || chat.repository !== packet.repository || chat.branch_or_ref !== packet.branch_or_ref) {
      fail('AUTHORITY_RECONSTRUCTION_MISMATCH', 'CG-004 continuation summary differs from verified publication packet');
    }
    return Object.freeze({
      ...chat,
      authority_epoch: packet.authority_epoch,
      allowed_paths_or_effects: structuredClone(packet.allowed_paths_or_effects),
      successor_candidates: structuredClone(packet.successor_candidates)
    });
  }
}
