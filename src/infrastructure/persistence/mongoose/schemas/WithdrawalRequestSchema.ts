import mongoose, { Document, Schema } from 'mongoose';
import { ApprovalAction, WithdrawalStatus } from '@/core/finance/domain/entities/WithdrawalRequest';
import type { Currency } from '@/core/finance/domain/value-objects/Currency';

export interface IWithdrawalRequestDocument extends Document {
  requestId: string;
  userId: string;
  amount: number;
  currency: Currency;
  status: WithdrawalStatus;
  requestedAt: Date;
  processedAt?: Date;
  notes?: string;
  approvalLogs: Array<{
    adminId: string;
    action: ApprovalAction;
    notes?: string;
    createdAt: Date;
  }>;
}

const withdrawalRequestSchema = new Schema<IWithdrawalRequestDocument>(
  {
    requestId: {
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
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      enum: ['BRL', 'USD', 'EUR'],
      required: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
    },
    requestedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    processedAt: Date,
    notes: String,
    approvalLogs: [
      {
        adminId: String,
        action: { type: String, enum: ['APPROVED', 'REJECTED'] },
        notes: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

export const WithdrawalRequestModel = mongoose.model<IWithdrawalRequestDocument>(
  'WithdrawalRequest',
  withdrawalRequestSchema,
);
