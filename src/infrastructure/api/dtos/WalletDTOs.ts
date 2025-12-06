import { z } from 'zod';
import { appConfig } from '@/shared/config/appConfig';

const { minDeposit, minWithdraw } = appConfig.wallet.limits;
const depositMinMessage = `Depósito mínimo: ${minDeposit} BRL`;
const withdrawMinMessage = `Saque mínimo: ${minWithdraw} BRL`;

/**
 * DTO para depósito na carteira
 * Valida: amount (número positivo), currency (moeda)
 */
export const DepositDTO = z.object({
  amount: z.number().positive().min(minDeposit, depositMinMessage),
  currency: z.enum(['BRL', 'USD', 'EUR']).default('BRL'),
  description: z.string().optional(),
});

export type DepositDTOType = z.infer<typeof DepositDTO>;

/**
 * DTO para saque da carteira
 * Valida: amount (número positivo), currency (moeda)
 */
export const WithdrawDTO = z.object({
  amount: z.number().positive().min(minWithdraw, withdrawMinMessage),
  currency: z.enum(['BRL', 'USD', 'EUR']).default('BRL'),
  description: z.string().optional(),
  pixKey: z.string().min(5, 'Chave Pix obrigatória'),
});

export type WithdrawDTOType = z.infer<typeof WithdrawDTO>;

/**
 * DTO para transação
 * Representa uma transação no histórico
 */
export const TransactionDTO = z.object({
  id: z.string().uuid(),
  walletId: z.string().uuid(),
  type: z.enum(['DEPOSIT', 'WITHDRAW', 'BET', 'WINNINGS']),
  amount: z.number().positive(),
  currency: z.enum(['BRL', 'USD', 'EUR']),
  description: z.string(),
  status: z.enum(['PENDING', 'COMPLETED', 'FAILED']),
  createdAt: z.date(),
});

export type TransactionDTOType = z.infer<typeof TransactionDTO>;

/**
 * DTO para resposta de carteira
 * Retorna dados completos da carteira
 */
export const WalletResponseDTO = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  balance: z.object({
    amount: z.number().nonnegative(),
    currency: z.enum(['BRL', 'USD', 'EUR']),
  }),
  createdAt: z.date(),
});

export type WalletResponseDTOType = z.infer<typeof WalletResponseDTO>;
