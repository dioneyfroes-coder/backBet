import mongoose, { Document, Schema, Model } from 'mongoose';

export interface ISessionDocument extends Document {
  sessionId: string;
  userId: string;
  jwtId: string;
  status: 'ACTIVE' | 'REVOKED';
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  revokedReason?: string;
}

const sessionSchema = new Schema<ISessionDocument>(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    jwtId: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'REVOKED'],
      required: true,
      default: 'ACTIVE',
    },
    createdAt: { type: Date, required: true, default: Date.now },
    lastUsedAt: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    revokedReason: String,
  },
  { timestamps: true },
);

sessionSchema.index({ userId: 1, status: 1 });

export const SessionModel: Model<ISessionDocument> = mongoose.model<ISessionDocument>(
  'Session',
  sessionSchema,
);