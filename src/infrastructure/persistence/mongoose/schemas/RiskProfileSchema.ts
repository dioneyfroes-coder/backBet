import mongoose, { Schema, Document } from 'mongoose';

export interface IRiskProfileDocument extends Document {
  _id: mongoose.Types.ObjectId;
  userId: string;
  exposureCents: number;
  maxExposureCents: number;
  createdAt: Date;
  updatedAt: Date;
}

const riskProfileSchema = new Schema<IRiskProfileDocument>(
  {
    userId: { type: String, required: true, unique: true },
    exposureCents: { type: Number, required: true, default: 0, min: 0 },
    maxExposureCents: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true },
);

export const RiskProfileModel = mongoose.model<IRiskProfileDocument>(
  'RiskProfile',
  riskProfileSchema,
);
