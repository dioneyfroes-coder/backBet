import mongoose, { Document, Schema } from 'mongoose';
import { IdentityVerificationStatus } from '@/core/compliance/domain/entities/IdentityVerification';

export interface IIdentityVerificationDocument extends Document {
  verificationId: string;
  userId: string;
  status: IdentityVerificationStatus;
  provider: string;
  providerReference: string;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
  verifiedAt?: Date | null;
  rejectedReason?: string | null;
}

const identityVerificationSchema = new Schema<IIdentityVerificationDocument>(
  {
    verificationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'VERIFIED', 'REJECTED'],
      required: true,
      default: 'PENDING',
    },
    provider: {
      type: String,
      required: true,
    },
    providerReference: {
      type: String,
      required: true,
      default: '',
    },
    attempts: {
      type: Number,
      required: true,
      default: 0,
    },
    createdAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    verifiedAt: Date,
    rejectedReason: String,
  },
  { timestamps: false },
);

export const IdentityVerificationModel = mongoose.model<IIdentityVerificationDocument>(
  'IdentityVerification',
  identityVerificationSchema,
);