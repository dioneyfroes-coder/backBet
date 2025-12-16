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
  ): Promise<WithdrawalRequest> {
    if (amount <= 0) {
      throw new AppError('VALIDATION_ERROR', 'Amount must be positive', 400);
    }

    const wallet = await this.walletService.findByUserId(userId);
    if (!wallet) {
      throw new AppError('NOT_FOUND', 'Wallet not found', 404);
    }

    if (wallet.balance < amount) {
      throw new AppError('BAD_REQUEST', 'Saldo insuficiente', 400);
    }

    await this.walletService.lock(userId, amount);

    const request = new WithdrawalRequest(
      randomUUID(),
      userId,
      amount,
      currency,
      new Date(),
      'PENDING',
      undefined,
      notes,
    );

    try {
      const created = await this.withdrawalRequestRepository.create(request);
      try {
        withdrawalRequestCreatedCounter.inc();
      } catch (e) {
        console.debug('withdrawalRequestCreatedCounter inc failed', e);
      }
      return created;
    } catch (err) {
      // Persistence failed, ensure we unlock the amount so it doesn't stay blocked
      try {
        await this.walletService.unlock(userId, amount);
      } catch (unlockErr) {
        console.error('Failed to unlock wallet after withdrawal request persistence failure', {
          userId,
          amount,
          error: unlockErr,
        });
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

    if (request.status !== 'PENDING') {
      throw new AppError('BAD_REQUEST', 'Withdrawal request already processed', 400);
    }

    if (action === 'APPROVED') {
      try {
        await this.walletService.withdrawLocked(request.userId, request.amount);
      } catch (err) {
        try {
          withdrawalRequestProcessingFailedCounter.inc();
        } catch (incErr) {
          console.debug('withdrawalRequestProcessingFailedCounter inc failed', incErr);
        }
        throw err;
      }

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
        await this.walletService.unlock(request.userId, request.amount);
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

  async listByUser(userId: string): Promise<WithdrawalRequest[]> {
    return this.withdrawalRequestRepository.findByUserId(userId);
  }

  async listPending(limit?: number, offset?: number): Promise<WithdrawalRequest[]> {
    return this.withdrawalRequestRepository.listPending(limit, offset);
  }
}
