import mongoose, { Document, Schema } from 'mongoose';
import {
  LedgerOperationType,
  LedgerStatus,
} from '@/core/finance/domain/entities/LedgerEntry';

export interface ILedgerEntryDocument extends Document {
  transactionId: string;
  userId: string;
  type: LedgerOperationType;
  amountCents: number;
  currency: string;
  referenceId?: string;
  source?: string;
  status: LedgerStatus;
  createdAt: Date;
  metadata?: Record<string, unknown> | null;
}

const ledgerEntrySchema = new Schema<ILedgerEntryDocument>(
  {
    transactionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'DEPOSIT',
        'BET_DEBIT',
        'BET_REFUND',
        'BET_WIN',
        'WITHDRAWAL_HOLD',
        'WITHDRAWAL_COMPLETED',
        'WITHDRAWAL_REVERSED',
        'STAKE_LOCK',
        'STAKE_RELEASE',
        'GAME_WIN',
      ],
      required: true,
    },
    amountCents: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      enum: ['BRL', 'USD', 'EUR'],
      required: true,
    },
    referenceId: String,
    source: String,
    status: {
      type: String,
      enum: ['COMPLETED', 'PENDING', 'FAILED', 'REVERSED'],
      default: 'COMPLETED',
    },
    createdAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    metadata: Schema.Types.Mixed,
  },
  { timestamps: true, collection: 'ledgerentries' },
);

ledgerEntrySchema.index({ type: 1, createdAt: 1 });

export const LedgerEntryModel = mongoose.model<ILedgerEntryDocument>(
  'LedgerEntry',
  ledgerEntrySchema,
);
