/**
 * LedgerEntry — registro imutável e append-only de um movimento financeiro.
 *
 * Representa cada movimentação de carteira com um motivo de negócio auditável,
 * persistida em coleção própria (ledger) separada do documento Wallet.
 */

export type LedgerOperationType =
  | 'DEPOSIT'
  | 'BET_DEBIT'
  | 'BET_REFUND'
  | 'BET_WIN'
  | 'WITHDRAWAL_HOLD'
  | 'WITHDRAWAL_COMPLETED'
  | 'WITHDRAWAL_REVERSED'
  | 'STAKE_LOCK'
  | 'STAKE_RELEASE'
  | 'GAME_WIN';

export type LedgerStatus = 'COMPLETED' | 'PENDING' | 'FAILED' | 'REVERSED';

export type LedgerSource = string;

export type LedgerMetadata = Record<string, unknown> | undefined;

export interface ILedgerEntryDTO {
  transactionId: string;
  userId: string;
  type: LedgerOperationType;
  amount: number;
  currency: string;
  referenceId: string | undefined;
  source: string | undefined;
  status: LedgerStatus;
  createdAt: Date;
  metadata: LedgerMetadata;
}

export class LedgerEntry {
  constructor(
    public readonly transactionId: string,
    public readonly userId: string,
    public readonly type: LedgerOperationType,
    private readonly _amountCents: number,
    public readonly currency: string,
    public readonly referenceId: string | undefined,
    public readonly source: string | undefined,
    public readonly status: LedgerStatus,
    public readonly createdAt: Date,
    public readonly metadata: LedgerMetadata,
  ) {}

  get amount(): number {
    return this._amountCents / 100;
  }

  get amountCents(): number {
    return this._amountCents;
  }

  toDTO(): ILedgerEntryDTO {
    return {
      transactionId: this.transactionId,
      userId: this.userId,
      type: this.type,
      amount: this.amount,
      currency: this.currency,
      referenceId: this.referenceId,
      source: this.source,
      status: this.status,
      createdAt: this.createdAt,
      metadata: this.metadata,
    };
  }
}
