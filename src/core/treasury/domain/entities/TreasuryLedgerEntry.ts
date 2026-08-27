import { randomUUID } from 'crypto';
import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { Currency } from '@/core/finance/domain/value-objects/Currency';

export type TreasuryLedgerType = 'PROFIT_INFLOW' | 'PRIZE_TOP_UP' | 'PRIZE_RELEASE';

/**
 * Direção de uma movimentação em relação à conta operacional da casa (profit):
 * - CREDIT: entrada de valor no saldo de lucro (PROFIT_INFLOW e PRIZE_RELEASE);
 * - DEBIT:  saída de valor do saldo de lucro (PRIZE_TOP_UP, ao reforçar a reserva).
 * Em transferências entre as duas contas (TOP_UP/RELEASE), o efeito na reserva
 * fica explícito em prizeReserveBalanceAfterCents.
 */
export type TreasuryLedgerDirection = 'CREDIT' | 'DEBIT';

export const DIRECTION_BY_TREASURY_TYPE: Record<TreasuryLedgerType, TreasuryLedgerDirection> = {
  PROFIT_INFLOW: 'CREDIT',
  PRIZE_TOP_UP: 'DEBIT',
  PRIZE_RELEASE: 'CREDIT',
};

export const treasuryDirectionForType = (type: TreasuryLedgerType): TreasuryLedgerDirection =>
  DIRECTION_BY_TREASURY_TYPE[type];

export type TreasuryLedgerMetadata = {
  actorId?: string;
  referenceId?: string;
  context?: string;
  source?: string;
  [key: string]: unknown;
};

export type TreasuryLedgerEntryParams = {
  type: TreasuryLedgerType;
  amountCents: number;
  currency: Currency;
  direction: TreasuryLedgerDirection;
  /** Saldo de lucro (profit) após a operação — base para reconciliação. */
  profitBalanceAfterCents: number;
  /** Saldo da reserva de prêmios após a operação — base para reconciliação. */
  prizeReserveBalanceAfterCents: number;
  description?: string;
  metadata?: TreasuryLedgerMetadata;
  /** Origem da movimentação (ex.: 'manual', 'manual-topup', 'rebalance', PIX/settlement futuro). */
  source?: string;
  /** Referência externa da operação (ex.: betId, withdrawalRequestId, seed). */
  referenceId?: string;
  id?: string;
  createdAt?: Date;
};

export type TreasuryLedgerDTO = {
  id: string;
  type: TreasuryLedgerType;
  direction: TreasuryLedgerDirection;
  amountCents: number;
  currency: Currency;
  profitBalanceAfterCents: number;
  prizeReserveBalanceAfterCents: number;
  source?: string;
  referenceId?: string;
  description?: string;
  metadata?: TreasuryLedgerMetadata;
  createdAt: string;
};

export class TreasuryLedgerEntry {
  private readonly _id: string;
  private readonly _createdAt: Date;

  constructor(params: TreasuryLedgerEntryParams) {
    const { type, amountCents, currency, direction } = params;

    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new DomainError({
        code: 'TREASURY_INVALID_AMOUNT',
        message: 'Ledger amount must be positive',
        details: { amountCents },
      });
    }
    if (!Number.isFinite(params.profitBalanceAfterCents) || params.profitBalanceAfterCents < 0) {
      throw new DomainError({
        code: 'TREASURY_INVALID_BALANCE',
        message: 'Balance after operation must be non-negative',
        details: { profitBalanceAfterCents: params.profitBalanceAfterCents },
      });
    }
    if (
      !Number.isFinite(params.prizeReserveBalanceAfterCents) ||
      params.prizeReserveBalanceAfterCents < 0
    ) {
      throw new DomainError({
        code: 'TREASURY_INVALID_BALANCE',
        message: 'Prize reserve balance after operation must be non-negative',
        details: { prizeReserveBalanceAfterCents: params.prizeReserveBalanceAfterCents },
      });
    }

    this._id = params.id ?? randomUUID();
    this._createdAt = params.createdAt ?? new Date();

    this.type = type;
    this.direction = direction;
    this.amountCents = amountCents;
    this.currency = currency;
    this.profitBalanceAfterCents = params.profitBalanceAfterCents;
    this.prizeReserveBalanceAfterCents = params.prizeReserveBalanceAfterCents;
    this.description = params.description;
    this.metadata = params.metadata;
    this.source = params.source;
    this.referenceId = params.referenceId;
  }

  readonly type: TreasuryLedgerType;
  readonly direction: TreasuryLedgerDirection;
  readonly amountCents: number;
  readonly currency: Currency;
  readonly profitBalanceAfterCents: number;
  readonly prizeReserveBalanceAfterCents: number;
  readonly description?: string;
  readonly metadata?: TreasuryLedgerMetadata;
  readonly source?: string;
  readonly referenceId?: string;

  get id(): string {
    return this._id;
  }

  get createdAt(): Date {
    return new Date(this._createdAt);
  }

  toDTO(): TreasuryLedgerDTO {
    return {
      id: this._id,
      type: this.type,
      direction: this.direction,
      amountCents: this.amountCents,
      currency: this.currency,
      profitBalanceAfterCents: this.profitBalanceAfterCents,
      prizeReserveBalanceAfterCents: this.prizeReserveBalanceAfterCents,
      source: this.source,
      referenceId: this.referenceId,
      description: this.description,
      metadata: this.metadata,
      createdAt: this._createdAt.toISOString(),
    };
  }
}