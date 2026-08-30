import mongoose, { Document, Schema } from 'mongoose';

export interface IIdempotencyEntryDocument extends Document {
  key: string;
  fingerprint: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  result?: unknown;
  processingAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

function resolveTtlSeconds(): number {
  const raw = Number(process.env.IDEMPOTENCY_TTL_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 24 * 60 * 60;
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
    processingAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true, collection: 'idempotencyentries' },
);

// Retenção documentada (24h por padrão, configurável via IDEMPOTENCY_TTL_SECONDS).
// Remove automaticamente entradas COMPLETED/FAILED antigas e permite que uma entry
// PROCESSING "esquecida" (container morto) seja substituída após a expiração.
idempotencyEntrySchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: resolveTtlSeconds() },
);

export const IdempotencyEntryModel = mongoose.model<IIdempotencyEntryDocument>(
  'IdempotencyEntry',
  idempotencyEntrySchema,
);
