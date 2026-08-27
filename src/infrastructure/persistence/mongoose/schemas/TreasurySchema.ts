import mongoose, { Document, Schema } from 'mongoose';
import {
  TreasuryLedgerDirection,
  TreasuryLedgerType,
} from '@/core/treasury/domain/entities/TreasuryLedgerEntry';

export interface IHouseTreasuryDocument extends Document {
  _id: mongoose.Types.ObjectId;
  walletId: string;
  version: number;
  currency: string;
  profitBalanceCents: number;
  prizeReserveBalanceCents: number;
  ledger: Array<{
    id: string;
    type: TreasuryLedgerType;
    direction: TreasuryLedgerDirection;
    amountCents: number;
    currency: string;
    profitBalanceAfterCents: number;
    prizeReserveBalanceAfterCents: number;
    source?: string;
    referenceId?: string;
    description?: string;
    metadata?: Record<string, unknown>;
    createdAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const ledgerSchema = new Schema(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: ['PROFIT_INFLOW', 'PRIZE_TOP_UP', 'PRIZE_RELEASE'],
      required: true,
    },
    direction: {
      type: String,
      enum: ['CREDIT', 'DEBIT'],
      required: true,
    },
    amountCents: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true },
    profitBalanceAfterCents: { type: Number, required: true, min: 0 },
    prizeReserveBalanceAfterCents: { type: Number, required: true, min: 0 },
    source: { type: String },
    referenceId: { type: String },
    description: { type: String },
    metadata: { type: Schema.Types.Mixed, default: undefined },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const houseTreasurySchema = new Schema<IHouseTreasuryDocument>(
  {
    walletId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    version: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    currency: {
      type: String,
      enum: ['BRL', 'USD', 'EUR'],
      default: 'BRL',
    },
    profitBalanceCents: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    prizeReserveBalanceCents: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    ledger: {
      type: [ledgerSchema],
      default: [],
    },
  },
  { timestamps: true },
);

export const HouseTreasuryModel = mongoose.model<IHouseTreasuryDocument>(
  'HouseTreasury',
  houseTreasurySchema,
);
