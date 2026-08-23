import mongoose, { Schema, Document } from 'mongoose';

export interface IBetDocument extends Document {
  _id: mongoose.Types.ObjectId;
  version: number;
  userId: string;
  eventId: string;
  marketId: string;
  oddId: string;
  amount: number;
  odds: number;
  potentialReturn: number;
  status: 'PENDING' | 'WON' | 'LOST' | 'CANCELED';
  type: 'SINGLE' | 'MULTIPLE';
  currency: string;
  createdAt: Date;
  resolvedAt?: Date;
  cancellationReason?: string;
  updatedAt: Date;
}

const betSchema = new Schema<IBetDocument>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    version: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    eventId: {
      type: String,
      required: true,
      index: true,
    },
    marketId: {
      type: String,
      required: true,
    },
    oddId: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    odds: {
      type: Number,
      required: true,
      min: 1.0,
    },
    potentialReturn: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['PENDING', 'WON', 'LOST', 'CANCELED'],
      default: 'PENDING',
      index: true,
    },
    type: {
      type: String,
      enum: ['SINGLE', 'MULTIPLE'],
      default: 'SINGLE',
    },
    currency: {
      type: String,
      enum: ['BRL', 'USD', 'EUR'],
      default: 'BRL',
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    cancellationReason: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

export const BetModel = mongoose.model<IBetDocument>('Bet', betSchema);
