export type TransactionType = 'deposit' | 'withdraw' | 'lock' | 'unlock' | 'withdraw_locked';

export type TransactionMetadata = Record<string, unknown> | undefined;

export interface ITransactionDTO {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  currency: string;
  description: string | undefined;
  createdAt: Date;
  metadata?: TransactionMetadata;
}

export class Transaction {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly type: TransactionType,
    public readonly amount: number,
    public readonly currency: string,
    public readonly description: string | undefined,
    public readonly createdAt: Date,
    public readonly metadata?: TransactionMetadata,
  ) {}

  toDTO(): ITransactionDTO {
    return {
      id: this.id,
      userId: this.userId,
      type: this.type,
      amount: this.amount,
      currency: this.currency,
      description: this.description,
      createdAt: this.createdAt,
      metadata: this.metadata,
    };
  }
}
