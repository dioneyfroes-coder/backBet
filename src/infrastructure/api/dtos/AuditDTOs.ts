import { z } from 'zod';

export const AuditQueryDTO = z.object({
  type: z.enum(['ADMIN_ACTION', 'ACCESS', 'FINANCIAL', 'AUTH', 'SECURITY', 'SYSTEM', 'DATA_RETENTION']).optional(),
  actorUserId: z.string().optional(),
  resourceType: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export type AuditQueryDTOType = z.infer<typeof AuditQueryDTO>;

export const AuditRetentionApplyDTO = z.object({
  retentionDays: z.coerce.number().int().nonnegative().optional(),
});

export type AuditRetentionApplyDTOType = z.infer<typeof AuditRetentionApplyDTO>;
