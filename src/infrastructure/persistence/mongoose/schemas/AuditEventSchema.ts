import mongoose, { Document, Schema } from 'mongoose';
import { AuditEventType, AuditSeverity } from '@/core/audit/domain/entities/AuditEvent';

export interface IAuditEventDocument extends Document {
  eventId: string;
  type: AuditEventType;
  action: string;
  actorUserId: string;
  actorRole: string;
  resourceType: string;
  resourceId?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string;
  ip?: string;
  requestId?: string;
  severity: AuditSeverity;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
}

const auditEventSchema = new Schema<IAuditEventDocument>(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['ADMIN_ACTION', 'ACCESS', 'FINANCIAL', 'AUTH', 'SECURITY', 'SYSTEM', 'DATA_RETENTION'],
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    actorUserId: {
      type: String,
      required: true,
      index: true,
    },
    actorRole: {
      type: String,
      required: true,
    },
    resourceType: {
      type: String,
      required: true,
      index: true,
    },
    resourceId: String,
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    reason: String,
    ip: String,
    requestId: String,
    severity: {
      type: String,
      enum: ['INFO', 'WARNING', 'ERROR', 'CRITICAL'],
      default: 'INFO',
    },
    metadata: Schema.Types.Mixed,
    createdAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true, collection: 'auditevents' },
);

auditEventSchema.index({ createdAt: 1 });

export const AuditEventModel = mongoose.model<IAuditEventDocument>(
  'AuditEvent',
  auditEventSchema,
);
