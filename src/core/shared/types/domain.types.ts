/**
 * Tipos comuns a todo o domínio de negócio.
 * Usados por betting, finance, user e outros cores.
 */

/**
 * Moedas suportadas pela plataforma.
 */
export type SupportedCurrency = 'BRL' | 'USD' | 'EUR';

/**
 * Estados genéricos de recursos.
 */
export type ResourceStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'SUSPENDED' | 'DELETED';

/**
 * Resposta padrão de erro do domínio.
 */
export interface DomainError {
  code: string;
  message: string;
  timestamp: Date;
  context?: Record<string, unknown>;
}

/**
 * Resultado de operação (para aplicações usando Result pattern).
 */
export type Result<T> = { isSuccess: true; value: T } | { isSuccess: false; error: DomainError };

/**
 * DTO base para todas as respostas paginadas.
 */
export interface PaginatedDTO<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * DTO base para filtros genéricos.
 */
export interface FilterDTO {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}
