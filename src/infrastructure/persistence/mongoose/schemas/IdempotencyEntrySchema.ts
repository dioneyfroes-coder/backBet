import mongoose, { Document, Schema } from 'mongoose';

export interface IIdempotencyEntryDocument extends Document {
  key: string;
  fingerprint: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  result?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

const idempotencyEntrySchema = new Schema<IIdempotencyEntryDocument>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    fingerprint: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['PROCESSING', 'COMPLETED', 'FAILED'],
      required: true,
    },
    result: { type: Schema.Types.Mixed },
  },
  { timestamps: true, collection: 'idempotencyentries' },
);

export const IdempotencyEntryModel = mongoose.model<IIdempotencyEntryDocument>(
  'IdempotencyEntry',
  idempotencyEntrySchema,
);
