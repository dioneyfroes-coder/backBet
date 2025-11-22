import { randomUUID } from 'crypto';
import { AppError } from '@/shared/errors/AppError';
import { Currency } from '../value-objects/Currency';
import { WithdrawalRequest, ApprovalAction } from '../entities/WithdrawalRequest';
import { IWithdrawalRequestRepository } from '../repositories/IWithdrawalRequestRepository';
import { WalletService } from './WalletService';

export class WithdrawalRequestService {
  constructor(
    private readonly withdrawalRequestRepository: IWithdrawalRequestRepository,
    private readonly walletService: WalletService
  ) {}

  async createRequest(userId: string, amount: number, currency: Currency, notes?: string): Promise<WithdrawalRequest> {
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
      notes
    );

    return this.withdrawalRequestRepository.create(request);
  }

  async processRequest(requestId: string, adminId: string, action: ApprovalAction, notes?: string): Promise<WithdrawalRequest> {
    const request = await this.withdrawalRequestRepository.findById(requestId);
    if (!request) {
      throw new AppError('NOT_FOUND', 'Withdrawal request not found', 404);
    }

    if (request.status !== 'PENDING') {
      throw new AppError('BAD_REQUEST', 'Withdrawal request already processed', 400);
    }

    if (action === 'APPROVED') {
      await this.walletService.withdrawLocked(request.userId, request.amount);
      request.approve(adminId, notes);
    } else {
      await this.walletService.unlock(request.userId, request.amount);
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
