import mongoose, { Document, Schema } from 'mongoose';
import { Currency } from '@/core/finance/domain/value-objects/Currency';

export interface ICreditPackageDocument extends Document {
  code: string;
  label: string;
  baseAmount: number;
  bonusAmount: number;
  currency: Currency;
  price: number;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const creditPackageSchema = new Schema<ICreditPackageDocument>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    label: {
      type: String,
      required: true,
    },
    baseAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    bonusAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    currency: {
      type: String,
      enum: ['BRL', 'USD', 'EUR'],
      default: 'BRL',
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    description: {
      type: String,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export const CreditPackageModel = mongoose.model<ICreditPackageDocument>('CreditPackage', creditPackageSchema);
