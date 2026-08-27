import mongoose, { Document, Schema } from 'mongoose';
import { Currency } from '@/core/finance/domain/value-objects/Currency';

export interface ICreditPackageDocument extends Document {
  code: string;
  label: string;
  baseAmountCents: number;
  bonusAmountCents: number;
  currency: Currency;
  priceCents: number;
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
    baseAmountCents: {
      type: Number,
      required: true,
      min: 0,
    },
    bonusAmountCents: {
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
    priceCents: {
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
  { timestamps: true },
);

export const CreditPackageModel = mongoose.model<ICreditPackageDocument>(
  'CreditPackage',
  creditPackageSchema,
);
