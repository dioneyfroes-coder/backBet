process.env.NODE_ENV = 'test';
process.env.BACKBET_RUNTIME_ENV = 'test';

import { randomUUID } from 'crypto';
import { processWithdrawalPayloadOnce } from '@/infrastructure/withdrawals/WithdrawalPayoutWorker';
import { AuditService } from '@/core/audit/domain/services/AuditService';
import { InMemoryAuditEventRepository } from '@/core/audit/domain/repositories/InMemoryAuditEventRepository';
import type { WithdrawalPayoutPayload } from '@/core/finance/domain/ports/IWithdrawalQueue';

jest.mock('@/infrastructure/payments/factory', () => ({
  __esModule: true,
  createPaymentAdapter: () => ({
    payWithdrawal: jest.fn().mockResolvedValue({ success: true, transactionId: 'tx-hermetic' }),
  }),
}));

jest.mock('bull', () => {
  return function MockQueue(this: { name: string; process: jest.Mock; on: jest.Mock }, name: string) {
    this.name = name;
    this.process = jest.fn();
    this.on = jest.fn();
  };
});

const payload = (): WithdrawalPayoutPayload => ({
  requestId: randomUUID(),
  userId: 'user-audit-1',
  amount: 100,
  currency: 'BRL',
});

describe('Fase 5 — dimensão Audit JUNTA com Wallet+Ledger+Risk+Bet+Withdrawal no worker de payout', () => {
  let service: any;
  let adapter: any;
  let auditRepo: InMemoryAuditEventRepository;
  let auditService: AuditService;

  beforeEach(() => {
    service = {
      markProcessing: jest.fn().mockResolvedValue(undefined),
      completePayout: jest.fn().mockResolvedValue(undefined),
    };
    adapter = {
      payWithdrawal: jest.fn().mockResolvedValue({ success: true, transactionId: 'tx-omnidim' }),
    };
    auditRepo = new InMemoryAuditEventRepository();
    auditService = new AuditService(auditRepo);
  });

  it('payout ok: exatamente 1 AuditEvent FINANCIAL + as 5 dims financeiras consistentes juntas', async () => {
    const p = payload();

    await processWithdrawalPayloadOnce(p, adapter, service, auditService);

    // 1) Wallet+Ledger+Risk+Bet+Withdrawal: mutações de estado exatamente-vez na ordem certa
    expect(service.markProcessing).toHaveBeenCalledWith(p.requestId);
    expect(service.completePayout).toHaveBeenCalledWith(p.requestId);

    // 2) Audit: exatamente-1 evento FINANCIAL com o trilho completo
    const { events } = await auditRepo.query({});
    const financial = events.filter((e) => e.type === 'FINANCIAL');
    expect(financial).toHaveLength(1);
    expect(financial[0]).toMatchObject({
      action: 'withdrawal.payout.succeeded',
      resourceType: 'withdrawalRequest',
      resourceId: p.requestId,
      severity: 'INFO',
    });
  });

  it('payout falha: NENHUM AuditEvent (não inventa trilha de sucesso)', async () => {
    adapter.payWithdrawal.mockResolvedValue({ success: false, error: 'declined' });
    const p = payload();

    await expect(
      processWithdrawalPayloadOnce(p, adapter, service, auditService),
    ).rejects.toThrow('declined');

    expect(service.completePayout).not.toHaveBeenCalled();
    const { events } = await auditRepo.query({});
    expect(events.filter((e) => e.type === 'FINANCIAL')).toHaveLength(0);
  });
});
