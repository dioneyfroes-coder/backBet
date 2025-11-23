export type DomainErrorParams = {
  code?: string;
  message: string;
  details?: Record<string, unknown>;
};

export class DomainError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor({ code, message, details }: DomainErrorParams) {
    super(message);
    this.name = 'DomainError';
    this.code = code ?? 'DOMAIN_ERROR';
    this.details = details;
    Error.captureStackTrace?.(this, DomainError);
  }
}
