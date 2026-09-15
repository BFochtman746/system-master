import {
  createResponseComplianceReceipt,
  validateResponseComplianceReceipt
} from './chat-response-governor.js';

export const CHAT_GOVERNED_MUTATION_PROTOCOL = 'control-gateway.chat-governed-mutation.v1';

export class ChatGovernedMutationAdmissionError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'ChatGovernedMutationAdmissionError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) {
  throw new ChatGovernedMutationAdmissionError(code, message, details);
}

export class ChatGovernedMutationAdmissionGate {
  constructor({ baseGate, responseContextProvider, clock = () => new Date(), receiptMaxAgeMs = 15 * 60 * 1000 }) {
    if (!baseGate || typeof baseGate.admit !== 'function' || typeof baseGate.verifyGrantFresh !== 'function') throw new TypeError('baseGate admit/verifyGrantFresh required');
    if (typeof responseContextProvider !== 'function') throw new TypeError('responseContextProvider function required');
    if (typeof clock !== 'function') throw new TypeError('clock function required');
    this.baseGate = baseGate;
    this.responseContextProvider = responseContextProvider;
    this.clock = clock;
    this.receiptMaxAgeMs = receiptMaxAgeMs;
  }

  async admit({ mutation_request, response_text } = {}) {
    if (!mutation_request || typeof mutation_request !== 'object') fail('CHAT_MUTATION_REQUEST_MISSING', 'mutation_request is required');
    if (typeof response_text !== 'string' || !response_text.trim()) fail('CHAT_RESPONSE_MISSING', 'response_text is required before ChatGPT-originated mutation admission');
    const expected = await this.responseContextProvider(mutation_request);
    if (!expected || typeof expected !== 'object') fail('CHAT_RESPONSE_CONTEXT_MISSING', 'response context provider returned no context');
    const issuedAt = this.clock().toISOString();
    const responseReceipt = createResponseComplianceReceipt(response_text, expected, issuedAt);
    const mutationReceipt = await this.baseGate.admit(mutation_request);
    return Object.freeze({
      protocol_version: CHAT_GOVERNED_MUTATION_PROTOCOL,
      decision: 'GRANTED',
      response_compliance_receipt: responseReceipt,
      mutation_admission_receipt: mutationReceipt
    });
  }

  async verifyGrantFresh(grant, { mutation_request, response_text } = {}) {
    if (!grant || grant.protocol_version !== CHAT_GOVERNED_MUTATION_PROTOCOL || grant.decision !== 'GRANTED') fail('CHAT_GRANT_INVALID', 'chat-governed grant is invalid');
    const expected = await this.responseContextProvider(mutation_request);
    validateResponseComplianceReceipt(grant.response_compliance_receipt, response_text, expected, {
      now: this.clock().getTime(),
      max_age_ms: this.receiptMaxAgeMs
    });
    return this.baseGate.verifyGrantFresh(grant.mutation_admission_receipt, mutation_request);
  }
}
