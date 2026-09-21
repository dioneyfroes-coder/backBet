import mongoose, { Schema, Document } from 'mongoose';

export interface IWalletDocument extends Document {
  _id: mongoose.Types.ObjectId;
  userId: string;
  version: number;
  balanceCents: number;
  lockedBalanceCents: number;
  currency: string;
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
  },
  { timestamps: true },
);

export const WalletModel = mongoose.model<IWalletDocument>('Wallet', walletSchema);
