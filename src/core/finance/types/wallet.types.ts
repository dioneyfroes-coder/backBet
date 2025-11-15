export interface IWalletDTO {
  userId: string;
  balance: number;
  lockedBalance: number;
  currency: string;
}

export interface ICreateWalletDTO {
  userId: string;
  currency: string;
}

export interface ITransactionDTO {
  id: string;
  userId: string;
  type: 'deposit' | 'withdraw';
  amount: number;
  currency: string;
  description?: string;
  createdAt: Date;
}

export interface ITransactionHistory {
  transactions: ITransactionDTO[];
  total: number;
}
