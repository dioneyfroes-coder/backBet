import mongoose, { Document, Schema } from 'mongoose';
import {
  ResponsibleGamblingPeriod,
  ResponsibleGamblingLimit,
} from '@/core/responsibleGambling/domain/entities/ResponsibleGamblingProfile';

export interface IResponsibleGamblingProfileDocument extends Document {
  userId: string;
  selfExcluded: boolean;
  selfExclusionUntil?: Date | null;
  timeOutUntil?: Date | null;
  depositLimit?: ResponsibleGamblingLimit | null;
  betLimit?: ResponsibleGamblingLimit | null;
  depositPeriodStart: Date;
  depositUsedCents: number;
  betPeriodStart: Date;
  betUsedCents: number;
  updatedAt: Date;
}

const responsibleGamblingLimitSchema = new Schema(
  {
    amountCents: { type: Number, required: true, min: 1 },
    period: { type: String, enum: ['DAY', 'WEEK', 'MONTH'], required: true },
  },
  { _id: false },
);

const responsibleGamblingProfileSchema = new Schema<IResponsibleGamblingProfileDocument>(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    selfExcluded: {
      type: Boolean,
      required: true,
      default: false,
    },
    selfExclusionUntil: Date,
    timeOutUntil: Date,
    depositLimit: { type: responsibleGamblingLimitSchema, default: null },
    betLimit: { type: responsibleGamblingLimitSchema, default: null },
    depositPeriodStart: {
      type: Date,
      required: true,
      default: Date.now,
    },
    depositUsedCents: {
      type: Number,
      required: true,
      default: 0,
    },
    betPeriodStart: {
      type: Date,
      required: true,
      default: Date.now,
    },
    betUsedCents: {
      type: Number,
      required: true,
      default: 0,
    },
    updatedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { timestamps: false },
);

export const ResponsibleGamblingProfileModel = mongoose.model<IResponsibleGamblingProfileDocument>(
  'ResponsibleGamblingProfile',
  responsibleGamblingProfileSchema,
);