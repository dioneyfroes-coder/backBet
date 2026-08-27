import mongoose, { Schema, Document } from 'mongoose';

export interface IRiskExposureCounterDocument extends Document {
  _id: mongoose.Types.ObjectId;
  scope: 'EVENT' | 'MARKET';
  refId: string;
  exposureCents: number;
  maxExposureCents: number;
  createdAt: Date;
  updatedAt: Date;
}

const riskExposureCounterSchema = new Schema<IRiskExposureCounterDocument>(
  {
    scope: { type: String, required: true, enum: ['EVENT', 'MARKET'] },
    refId: { type: String, required: true },
    exposureCents: { type: Number, required: true, default: 0, min: 0 },
    maxExposureCents: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true },
);

riskExposureCounterSchema.index({ scope: 1, refId: 1 }, { unique: true });

export const RiskExposureCounterModel = mongoose.model<IRiskExposureCounterDocument>(
  'RiskExposureCounter',
  riskExposureCounterSchema,
);
