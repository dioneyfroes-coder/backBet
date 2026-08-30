import { randomUUID } from 'crypto';
import { AppError } from '@/shared/errors/AppError';
import { Currency } from '../value-objects/Currency';
import { WithdrawalRequest, ApprovalAction } from '../entities/WithdrawalRequest';
import { IWithdrawalRequestRepository } from '../repositories/IWithdrawalRequestRepository';
import { WalletService } from './WalletService';
import IWithdrawalQueue from '../ports/IWithdrawalQueue';
import {
  withdrawalRequestCreatedCounter,
  withdrawalRequestApprovedCounter,
  withdrawalRequestProcessingFailedCounter,
} from '@/infrastructure/observability/metrics';

export class WithdrawalRequestService {
  constructor(
    private readonly withdrawalRequestRepository: IWithdrawalRequestRepository,
    private readonly walletService: WalletService,
    private readonly withdrawalQueue?: IWithdrawalQueue,
  ) {}

  async createRequest(
    userId: string,
    amount: number,
    currency: Currency,
    notes?: string,
    requestId?: string,
  ): Promise<WithdrawalRequest> {
    if (amount <= 0) {
      throw new AppError('VALIDATION_ERROR', 'Amount must be positive', 400);
    }

    const id = requestId ?? randomUUID();

    if (requestId) {
      const existing = await this.withdrawalRequestRepository.findById(id);
      if (existing) {
        return existing;
      }
    }

    const wallet = await this.walletService.findByUserId(userId);
    if (!wallet) {
      throw new AppError('NOT_FOUND', 'Wallet not found', 404);
    }

    if (wallet.balanceCents < Math.round(amount * 100)) {
      throw new AppError('BAD_REQUEST', 'Saldo insuficiente', 400);
    }

    const request = new WithdrawalRequest(
      id,
      userId,
      amount,
      currency,
      new Date(),
      'REQUESTED',
      undefined,
      notes,
    );

    // Lock + persistência da WithdrawalRequest rodam na MESMA transação quando o
    // repository suporta (Mongo): crash no meio reverte tudo, sem hold órfão.
    const persist = async (session?: unknown): Promise<WithdrawalRequest> => {
      const context = {
        type: 'WITHDRAWAL_HOLD',
        referenceId: request.id,
        source: 'WITHDRAWAL',
      } as const;
      if (session) {
        await this.walletService.lock(userId, amount, context, { session });
        return this.withdrawalRequestRepository.create(request, { session });
      }
      await this.walletService.lock(userId, amount, context);
      return this.withdrawalRequestRepository.create(request);
    };

    try {
      const runner = this.withdrawalRequestRepository.withTransaction;
      const created = runner ? await runner(persist) : await persist(undefined);
      try {
        withdrawalRequestCreatedCounter.inc();
      } catch (e) {
        console.debug('withdrawalRequestCreatedCounter inc failed', e);
      }
      return created;
    } catch (err) {
      // Com transação, lock e request já foram revertidos juntos (nada a desfazer).
      // Sem transação, o lock já commitou e precisa de compensação explícita.
      if (!this.withdrawalRequestRepository.withTransaction) {
        try {
          await this.walletService.unlock(userId, amount, {
            type: 'WITHDRAWAL_REVERSED',
            referenceId: request.id,
            source: 'WITHDRAWAL',
          });
        } catch (unlockErr) {
          console.error('Failed to unlock wallet after withdrawal request persistence failure', {
            userId,
            amount,
            error: unlockErr,
          });
        }
      }
      throw err;
    }
  }

  async processRequest(
    requestId: string,
    adminId: string,
    action: ApprovalAction,
    notes?: string,
  ): Promise<WithdrawalRequest> {
    const request = await this.withdrawalRequestRepository.findById(requestId);
    if (!request) {
      throw new AppError('NOT_FOUND', 'Withdrawal request not found', 404);
    }

    if (request.status !== 'REQUESTED' && request.status !== 'VALIDATING') {
      throw new AppError('BAD_REQUEST', 'Withdrawal request already processed', 400);
    }

    // Validation step: REQUESTED -> VALIDATING
    request.validateBy(adminId);

    if (action === 'APPROVED') {
      // Approval keeps the amount LOCKED (never disappears). The definitive
      // debit happens only when the payout is completed by the worker.
      request.approve(adminId, notes);

      // persist approval before enqueuing the payout job (so workers see approved state)
      await this.withdrawalRequestRepository.update(request);

      if (this.withdrawalQueue) {
        try {
          await this.withdrawalQueue.enqueuePayout({
            requestId: request.id,
            userId: request.userId,
            amount: request.amount,
            currency: request.currency,
          });
        } catch (err) {
          // enqueue failed — metrics increment and log
          try {
            withdrawalRequestProcessingFailedCounter.inc();
          } catch (incErr) {
            console.debug('withdrawalRequestProcessingFailedCounter inc failed', incErr);
          }
          console.error('Failed to enqueue withdrawal payout job', { requestId: request.id, err });
          throw err;
        }
      } else {
        console.warn('No withdrawalQueue configured; payout will not be executed automatically', {
          requestId: request.id,
        });
      }
      try {
        withdrawalRequestApprovedCounter.inc();
      } catch (incErr) {
        console.debug('withdrawalRequestApprovedCounter inc failed', incErr);
      }
    } else {
      try {
        await this.walletService.unlock(request.userId, request.amount, {
          type: 'WITHDRAWAL_REVERSED',
          referenceId: request.id,
          source: 'WITHDRAWAL',
        });
      } catch (err) {
        try {
          withdrawalRequestProcessingFailedCounter.inc();
        } catch (incErr) {
          console.debug('withdrawalRequestProcessingFailedCounter inc failed', incErr);
        }
        throw err;
      }
      request.reject(adminId, notes);
    }

    return this.withdrawalRequestRepository.update(request);
  }

  async markProcessing(requestId: string): Promise<WithdrawalRequest> {
    const request = await this.withdrawalRequestRepository.findById(requestId);
    if (!request) {
      throw new AppError('NOT_FOUND', 'Withdrawal request not found', 404);
    }
    request.markProcessing();
    return this.withdrawalRequestRepository.update(request);
  }

  async completePayout(requestId: string): Promise<WithdrawalRequest> {
    const request = await this.withdrawalRequestRepository.findById(requestId);
    if (!request) {
      throw new AppError('NOT_FOUND', 'Withdrawal request not found', 404);
    }
    // Debit the locked amount only now, when the payout actually succeeded.
    try {
      await this.walletService.withdrawLocked(request.userId, request.amount, {
        type: 'WITHDRAWAL_COMPLETED',
        referenceId: request.id,
        source: 'WITHDRAWAL',
      });
    } catch (err) {
      try {
        withdrawalRequestProcessingFailedCounter.inc();
      } catch (incErr) {
        console.debug('withdrawalRequestProcessingFailedCounter inc failed', incErr);
      }
      throw err;
    }
    request.completePayout();
    return this.withdrawalRequestRepository.update(request);
  }

  async failPayout(requestId: string): Promise<WithdrawalRequest> {
    const request = await this.withdrawalRequestRepository.findById(requestId);
    if (!request) {
      throw new AppError('NOT_FOUND', 'Withdrawal request not found', 404);
    }
    // Return the held amount to the available balance; payout never happened.
    try {
      await this.walletService.unlock(request.userId, request.amount, {
        type: 'WITHDRAWAL_REVERSED',
        referenceId: request.id,
        source: 'WITHDRAWAL',
      });
      withdrawalRequestProcessingFailedCounter.inc();
    } catch (err) {
      try {
        withdrawalRequestProcessingFailedCounter.inc();
      } catch (incErr) {
        console.debug('withdrawalRequestProcessingFailedCounter inc failed', incErr);
      }
      throw err;
    }
    request.failPayout();
    return this.withdrawalRequestRepository.update(request);
  }

  async cancelWithdrawal(requestId: string): Promise<WithdrawalRequest> {
    const request = await this.withdrawalRequestRepository.findById(requestId);
    if (!request) {
      throw new AppError('NOT_FOUND', 'Withdrawal request not found', 404);
    }
    await this.walletService.unlock(request.userId, request.amount, {
      type: 'WITHDRAWAL_REVERSED',
      referenceId: request.id,
      source: 'WITHDRAWAL',
    });
    request.cancel();
    return this.withdrawalRequestRepository.update(request);
  }

  async listByUser(userId: string): Promise<WithdrawalRequest[]> {
    return this.withdrawalRequestRepository.findByUserId(userId);
  }

  async listPending(limit?: number, offset?: number): Promise<WithdrawalRequest[]> {
    return this.withdrawalRequestRepository.listPending(limit, offset);
  }
}
