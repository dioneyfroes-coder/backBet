import mongoose, { Schema, Document } from 'mongoose';

export interface IWalletDocument extends Document {
  _id: mongoose.Types.ObjectId;
  userId: string;
  version: number;
  balance: number;
  lockedBalance: number;
  currency: string;
  transactions: Array<{
    id: string;
    type: 'deposit' | 'withdraw' | 'lock' | 'unlock' | 'withdraw_locked';
    amount: number;
    currency: string;
    userId: string;
    description?: string;
    createdAt: Date;
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
    balance: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    lockedBalance: {
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
        amount: Number,
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
