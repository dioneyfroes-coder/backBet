import mongoose, { Schema, Document } from 'mongoose';

export interface IUserDocument extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED';
  createdAt: Date;
  updatedAt: Date;
}

export const userSchema = new Schema<IUserDocument>(
  {
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
    firstName: {
      type: String,
      default: null,
    },
    lastName: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED'],
      default: 'PENDING_VERIFICATION',
    },
  },
  { timestamps: true }
);

export const UserModel = mongoose.model<IUserDocument>('User', userSchema);
