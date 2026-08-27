/**
 * Shared Domain - Exports
 *
 * Agregue todas as abstrações e tipos compartilhados aqui para facilitar imports.
 * Exemplo: import { IRepository, Money, UniqueId } from '@/core/shared';
 */

// ============ Repositories ============
export type { IRepository } from './domain/repositories/IRepository';

// ============ Entities ============
export { BaseAggregateRoot } from './domain/entities/AggregateRoot';
export type { AggregateRoot } from './domain/entities/AggregateRoot';

// ============ Value Objects ============
export { UniqueId } from './domain/value-objects/UniqueId';
export { Money } from './domain/value-objects/Money';
export type { SupportedCurrency } from './domain/value-objects/Money';

// ============ Types ============
export type {
  ResourceStatus,
  DomainError,
  Result,
  PaginatedDTO,
  FilterDTO,
} from './types/domain.types';
