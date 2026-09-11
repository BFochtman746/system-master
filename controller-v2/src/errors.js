export class ControllerError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ControllerError';
    this.code = code;
    this.details = details;
  }
}
