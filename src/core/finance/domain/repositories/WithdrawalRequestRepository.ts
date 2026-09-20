import { WithdrawalRequest } from '../entities/WithdrawalRequest';
import {
  IWithdrawalRequestRepository,
  WithdrawalRequestRepositoryOptions,
} from './IWithdrawalRequestRepository';
import { AppError } from '@/shared/errors/AppError';

export class WithdrawalRequestRepository implements IWithdrawalRequestRepository {
  private requests: WithdrawalRequest[] = [];

  async create(request: WithdrawalRequest): Promise<WithdrawalRequest> {
    // Mongo persiste documento independente (lean-doc); o repo precisa preservar
    // o snapshot persistido isolado da instância que o service muta in-place
    // (approve/claim), senão o guard CAS compara contra o objeto já alterado e
    // dispara conflito sintético — Mongo nunca faz isso porque o doc é isolado.
    this.requests.push(request.clone());
    return request.clone();
  }

  async update(
    request: WithdrawalRequest,
    options?: WithdrawalRequestRepositoryOptions,
  ): Promise<WithdrawalRequest> {
    const index = this.requests.findIndex((r) => r.id === request.id);
    if (index < 0) {
      return request;
    }

    if (options?.guard) {
      // CAS: compara contra o SNAPSHOT PERSISTIDO (clone isolado da instância que
      // o service já mutou), como o Mongo compara contra o documento do banco.
      const current = this.requests[index];
      const versionMismatch =
        typeof options.guard.version === 'number' && current.version !== options.guard.version;
      if (current.status !== options.guard.status || versionMismatch) {
        throw new AppError('CONFLICT', 'Withdrawal request changed concurrently', 409, {
          requestId: request.id,
        });
      }
    }

    this.requests[index] = request.clone();
    this.requests[index].version += 1;
    return this.requests[index].clone();
  }

  async claimForProcessing(requestId: string): Promise<WithdrawalRequest | null> {
    const index = this.requests.findIndex((r) => r.id === requestId);
    if (index < 0) {
      return null;
    }
    const currentStatus = this.requests[index].status;
    // APPROVED/FAILED -> PROCESSING (primeira claim). PROCESSING já é RETRY
    // legítimo pós-timeout: o débito nunca aconteceu (ledger bloqueia o duplo
    // em completePayout), então re-claimar PROCESSING só re-executa o payout.
    // Estados terminais (COMPLETED) ou de validação não são claimáveis.
    if (!['APPROVED', 'FAILED', 'PROCESSING'].includes(currentStatus)) {
      return null;
    }
    const claimed = this.requests[index].clone();
    claimed.status = 'PROCESSING';
    claimed.processingAt = claimed.processingAt ?? new Date();
    claimed.version += 1;
    this.requests[index] = claimed.clone();
    return claimed.clone();
  }

  async findById(id: string): Promise<WithdrawalRequest | null> {
    const found = this.requests.find((r) => r.id === id);
    // Mongo devolve lean-doc isolado a cada read; clone evita que a mutação
    // in-place do service alcance o snapshot PERSISTIDO que o guard CAS usa.
    return found ? found.clone() : null;
  }

  async findByUserId(userId: string): Promise<WithdrawalRequest[]> {
    return this.requests.filter((r) => r.userId === userId).map((r) => r.clone());
  }

  async listPending(limit?: number, offset?: number): Promise<WithdrawalRequest[]> {
    const pending = this.requests.filter(
      (r) => r.status === 'REQUESTED' || r.status === 'VALIDATING',
    );
    return pending.slice(offset || 0, (offset || 0) + (limit || pending.length));
  }

  async listStuckProcessing(processingBefore: Date, limit?: number): Promise<WithdrawalRequest[]> {
    const stuck = this.requests.filter(
      (r) =>
        r.status === 'PROCESSING' &&
        r.processingAt !== undefined &&
        r.processingAt < processingBefore,
    );
    return stuck.slice(0, limit ?? stuck.length);
  }

  async listStuckApproved(approvedBefore: Date, limit?: number): Promise<WithdrawalRequest[]> {
    const stuck = this.requests
      .filter(
        (r) =>
          r.status === 'APPROVED' &&
          r.processingAt === undefined &&
          r.processedAt !== undefined &&
          r.processedAt < approvedBefore,
      )
      .sort((a, b) => (a.processedAt?.getTime() ?? 0) - (b.processedAt?.getTime() ?? 0));
    return stuck.slice(0, limit ?? stuck.length);
  }
}
