import mongoose, { Schema, Document } from 'mongoose';
import { randomUUID } from 'crypto';

export interface IUserDocument extends Document<string> {
  _id: string;
  email: string;
  username: string;
  passwordHash: string;
  status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED';
  createdAt: Date;
  updatedAt: Date;
  pixKey?: string | null;
  documents?: Array<{
    id: string;
    type?: string | null;
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    url: string;
    uploadedAt: string;
    verified?: boolean;
  }>;
  preferences?: {
    emailNotifications: boolean;
    smsNotifications: boolean;
    marketingEmails: boolean;
    requireWithdrawPassword?: boolean | null;
  };
}

export const userSchema = new Schema<IUserDocument>(
  {
    _id: {
      type: String,
      required: true,
      default: () => randomUUID(),
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      minlength: 3,
      maxlength: 50,
    },
    passwordHash: {
      type: String,
      required: false,
      default: '',
    },
    status: {
      type: String,
      enum: ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED'],
      default: 'PENDING_VERIFICATION',
    },
    pixKey: {
      type: String,
      default: null,
    },
    preferences: {
      type: {
        emailNotifications: { type: Boolean, default: true },
        smsNotifications: { type: Boolean, default: false },
        marketingEmails: { type: Boolean, default: false },
        requireWithdrawPassword: { type: Boolean, default: null },
      },
      default: {
        emailNotifications: true,
        smsNotifications: false,
        marketingEmails: false,
        requireWithdrawPassword: null,
      },
    },
    documents: {
      type: [
        {
          id: { type: String, required: true },
          type: { type: String, default: null },
          filename: { type: String, required: true },
          originalName: { type: String, required: true },
          mimeType: { type: String, required: true },
          size: { type: Number, required: true },
          url: { type: String, required: true },
          uploadedAt: { type: String, required: true },
          verified: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

export const UserModel = mongoose.model<IUserDocument>('User', userSchema);
