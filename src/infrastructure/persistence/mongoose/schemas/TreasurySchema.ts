import mongoose, { Document, Schema } from 'mongoose';
import { TreasuryLedgerType } from '@/core/treasury/domain/entities/TreasuryLedgerEntry';

export interface IHouseTreasuryDocument extends Document {
  _id: mongoose.Types.ObjectId;
  walletId: string;
  currency: string;
  profitBalance: number;
  prizeReserveBalance: number;
  ledger: Array<{
    id: string;
    type: TreasuryLedgerType;
    amount: number;
    currency: string;
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
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true },
    description: { type: String },
    metadata: { type: Schema.Types.Mixed },
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
    currency: {
      type: String,
      enum: ['BRL', 'USD', 'EUR'],
      default: 'BRL',
    },
    profitBalance: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    prizeReserveBalance: {
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
