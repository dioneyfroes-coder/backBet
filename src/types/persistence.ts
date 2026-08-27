import { BetStatus, BetType } from '@/core/betting/types/bet.types';
import { TransactionType } from '@/core/finance/domain/entities/Transaction';
import {
  TreasuryLedgerDirection,
  TreasuryLedgerType,
} from '@/core/treasury/domain/entities/TreasuryLedgerEntry';

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
  version: number;
  userId: string;
  eventId: string;
  marketId: string;
  oddId: string;
  amountCents: number;
  odds: number;
  potentialReturnCents: number;
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
  amountCents: number;
  currency: string;
  userId: string;
  description?: string;
  createdAt: Date | string;
  metadata?: Record<string, unknown> | null;
}

export interface WalletRecord {
  _id: MongoId;
  userId: string;
  version: number;
  balanceCents: number;
  lockedBalanceCents: number;
  currency: string;
  transactions: WalletTransactionRecord[];
  createdAt: Date;
  updatedAt: Date;
}

export interface RiskProfileRecord {
  _id: MongoId;
  userId: string;
  exposureCents: number;
  maxExposureCents: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TreasuryLedgerRecord {
  id: string;
  type: TreasuryLedgerType;
  direction: TreasuryLedgerDirection;
  amountCents: number;
  currency: string;
  profitBalanceAfterCents: number;
  prizeReserveBalanceAfterCents: number;
  source?: string | null;
  referenceId?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date | string;
}

export interface HouseTreasuryRecord {
  _id: MongoId;
  walletId: string;
  version: number;
  currency: string;
  profitBalanceCents: number;
  prizeReserveBalanceCents: number;
  ledger: TreasuryLedgerRecord[];
  createdAt: Date;
  updatedAt: Date;
}
