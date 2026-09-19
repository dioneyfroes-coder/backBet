// src/shared/errors/AppError.ts

/**
 * Erro de fronteira/tranporte: carrega código de domínio + status HTTP para
 * serialização nas rotas/controllers. É o único erro que deve "atravessar" a
 * camada HTTP. Erros de invariante de domínio nascem como `DomainError` e são
 * mapeados para `AppError` na aplicação (ver core/shared/application/errors).
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details: Record<string, unknown> | undefined;

  constructor(
    code: string,
    message: string,
    statusCode = 500,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this);
  }
}
