import mongoose, { Schema, Document } from 'mongoose';

export interface IRiskProfileDocument extends Document {
  _id: mongoose.Types.ObjectId;
  userId: string;
  exposure: number;
  maxExposure: number;
  createdAt: Date;
  updatedAt: Date;
}

const riskProfileSchema = new Schema<IRiskProfileDocument>(
  {
    userId: { type: String, required: true, unique: true },
    exposure: { type: Number, required: true, default: 0 },
    maxExposure: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

export const RiskProfileModel = mongoose.model<IRiskProfileDocument>('RiskProfile', riskProfileSchema);
