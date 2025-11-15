import mongoose, { Schema, Document } from 'mongoose';

export interface IWalletDocument extends Document {
  _id: mongoose.Types.ObjectId;
  userId: string;
  balance: number;
  lockedBalance: number;
  currency: string;
  transactions: Array<{
    id: string;
    type: 'DEPOSIT' | 'WITHDRAW' | 'LOCK' | 'UNLOCK';
    amount: number;
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
        type: { type: String, enum: ['DEPOSIT', 'WITHDRAW', 'LOCK', 'UNLOCK'] },
        amount: Number,
        description: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export const WalletModel = mongoose.model<IWalletDocument>('Wallet', walletSchema);
