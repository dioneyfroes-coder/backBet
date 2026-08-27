import mongoose, { Schema, Document } from 'mongoose';

export interface IWalletDocument extends Document {
  _id: mongoose.Types.ObjectId;
  userId: string;
  version: number;
  balanceCents: number;
  lockedBalanceCents: number;
  currency: string;
  transactions: Array<{
    id: string;
    type: 'deposit' | 'withdraw' | 'lock' | 'unlock' | 'withdraw_locked';
    amountCents: number;
    currency: string;
    userId: string;
    description?: string;
    metadata?: Record<string, unknown> | null;
    createdAt: Date | string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const walletSchema = new Schema<IWalletDocument>(
  {
    userId: {
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
    balanceCents: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    lockedBalanceCents: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      enum: ['BRL', 'USD', 'EUR'],
      default: 'BRL',
    },
    transactions: [
      {
        id: String,
        type: {
          type: String,
          enum: ['deposit', 'withdraw', 'lock', 'unlock', 'withdraw_locked'],
          lowercase: true,
        },
        amountCents: { type: Number, required: true, min: 0 },
        currency: String,
        userId: String,
        description: String,
        metadata: Schema.Types.Mixed,
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

export const WalletModel = mongoose.model<IWalletDocument>('Wallet', walletSchema);
