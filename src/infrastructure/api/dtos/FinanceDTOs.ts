import { z } from 'zod';

export const CreditPackagePurchaseDTO = z.object({
  packageId: z.string().nonempty(),
});

export const CreateWithdrawalRequestDTO = z.object({
  amount: z.number().positive().min(0.01),
  currency: z.enum(['BRL', 'USD', 'EUR']),
  notes: z.string().optional(),
  password: z.string().optional(),
});

export const ProcessWithdrawalRequestDTO = z.object({
  action: z.enum(['APPROVED', 'REJECTED']),
  notes: z.string().optional(),
});

export const CreditPackageResponseDTO = z.object({
  id: z.string(),
  code: z.string(),
  label: z.string(),
  baseAmount: z.number().nonnegative(),
  bonusAmount: z.number().nonnegative(),
  totalCredits: z.number().nonnegative(),
  currency: z.enum(['BRL', 'USD', 'EUR']),
  price: z.number().nonnegative(),
  description: z.string().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const WithdrawalRequestResponseDTO = z.object({
  id: z.string(),
  userId: z.string(),
  amount: z.number().positive(),
  currency: z.enum(['BRL', 'USD', 'EUR']),
  status: z.enum([
    'REQUESTED',
    'VALIDATING',
    'APPROVED',
    'REJECTED',
    'PROCESSING',
    'COMPLETED',
    'CANCELED',
    'FAILED',
    'REVERSED',
  ]),
  requestedAt: z.string(),
  processedAt: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  approvalLogs: z.array(
    z.object({
      adminId: z.string(),
      action: z.enum(['APPROVED', 'REJECTED']),
      notes: z.string().nullable().optional(),
      createdAt: z.string(),
    }),
  ),
});
