import { randomUUID } from 'crypto';
import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { Currency } from '@/core/finance/domain/value-objects/Currency';

export type TreasuryLedgerType = 'PROFIT_INFLOW' | 'PRIZE_TOP_UP' | 'PRIZE_RELEASE';

export type TreasuryLedgerMetadata = {
  actorId?: string;
  referenceId?: string;
  context?: string;
  source?: string;
  [key: string]: unknown;
};

export type TreasuryLedgerDTO = {
  id: string;
  type: TreasuryLedgerType;
  amount: number;
  currency: Currency;
  description?: string;
  metadata?: TreasuryLedgerMetadata;
  createdAt: string;
};

export class TreasuryLedgerEntry {
  private readonly _id: string;
  private readonly _createdAt: Date;

  constructor(
    private readonly type: TreasuryLedgerType,
    private readonly amount: number,
    private readonly currency: Currency,
    private readonly description?: string,
    private readonly metadata?: TreasuryLedgerMetadata,
    id?: string,
    createdAt?: Date,
  ) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new DomainError({
        code: 'TREASURY_INVALID_AMOUNT',
        message: 'Ledger amount must be positive',
        details: { amount },
      });
    }

    this._id = id ?? randomUUID();
    this._createdAt = createdAt ?? new Date();
  }

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
      amount: this.amount,
      currency: this.currency,
      description: this.description,
      metadata: this.metadata,
      createdAt: this._createdAt.toISOString(),
    };
  }
}
