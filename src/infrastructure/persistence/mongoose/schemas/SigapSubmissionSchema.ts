import mongoose, { Document, Schema } from 'mongoose';
import { SigapFileType, SigapSubmissionStatus } from '@/core/sigap/domain/types/sigap.types';

export interface ISigapSubmissionDocument extends Document {
  submissionId: string;
  operatorId: string;
  fileType: SigapFileType;
  referenceDate: string;
  status: SigapSubmissionStatus;
  provider: string;
  attemptCount: number;
  payloadSummary?: Record<string, unknown> | null;
  ackId?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
  submittedAt?: Date;
}

const sigapSubmissionSchema = new Schema<ISigapSubmissionDocument>(
  {
    submissionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    operatorId: {
      type: String,
      required: true,
      index: true,
    },
    fileType: {
      type: String,
      enum: ['APOSTADOR', 'APOSTAS', 'CARTEIRA', 'OPERADOR_DIARIO', 'OPERADOR_MENSAL'],
      required: true,
      index: true,
    },
    referenceDate: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'TRANSMITTED', 'ACKED', 'REJECTED', 'FAILED', 'RETRY'],
      required: true,
      index: true,
    },
    provider: {
      type: String,
      required: true,
    },
    attemptCount: {
      type: Number,
      required: true,
      default: 0,
    },
    payloadSummary: Schema.Types.Mixed,
    ackId: String,
    errorCode: String,
    errorMessage: String,
    createdAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    updatedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    submittedAt: Date,
  },
  { collection: 'sigapsubmissions' },
);

sigapSubmissionSchema.index({ operatorId: 1, fileType: 1, referenceDate: 1 }, { unique: true });
sigapSubmissionSchema.index({ createdAt: -1 });

export const SigapSubmissionModel = mongoose.model<ISigapSubmissionDocument>(
  'SigapSubmission',
  sigapSubmissionSchema,
);
