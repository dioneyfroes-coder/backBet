import { BetStatus, BetType } from '@/core/betting/types/bet.types';
import { TransactionType } from '@/core/finance/domain/entities/Transaction';
import { TreasuryLedgerType } from '@/core/treasury/domain/entities/TreasuryLedgerEntry';

export type MongoId = string;

export interface UserRecord {
  _id: MongoId;
  email: string;
  username: string;
  passwordHash: string;
  firstName?: string | null;
  lastName?: string | null;
  status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED';
  createdAt: Date;
  updatedAt: Date;
}

export interface BetRecord {
  _id: MongoId;
  userId: string;
  eventId: string;
  marketId: string;
  oddId: string;
  amount: number;
  odds: number;
  potentialReturn: number;
  status: BetStatus;
  type: BetType;
  currency: string;
  createdAt: Date;
  resolvedAt?: Date | null;
  cancellationReason?: string | null;
  updatedAt: Date;
}

export interface WalletTransactionRecord {
  id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  userId: string;
  description?: string | null;
  createdAt: Date | string;
  metadata?: Record<string, unknown> | null;
}

export interface WalletRecord {
  _id: MongoId;
  userId: string;
  balance: number;
  lockedBalance: number;
  currency: string;
  transactions: WalletTransactionRecord[];
  createdAt: Date;
  updatedAt: Date;
}

export interface RiskProfileRecord {
  _id: MongoId;
  userId: string;
  exposure: number;
  maxExposure: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TreasuryLedgerRecord {
  id: string;
  type: TreasuryLedgerType;
  amount: number;
  currency: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date | string;
}

export interface HouseTreasuryRecord {
  _id: MongoId;
  walletId: string;
  currency: string;
  profitBalance: number;
  prizeReserveBalance: number;
  ledger: TreasuryLedgerRecord[];
  createdAt: Date;
  updatedAt: Date;
}
