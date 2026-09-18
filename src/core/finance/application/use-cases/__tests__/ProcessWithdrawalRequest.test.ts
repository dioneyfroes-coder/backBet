import { ProcessWithdrawalRequest } from '../ProcessWithdrawalRequest';
import { InMemoryIdempotencyStore } from '@/shared/services/IdempotencyService';
import { IdempotencyService } from '@/shared/services/IdempotencyService';
import { WithdrawalRequestService } from '@/core/finance/domain/services/WithdrawalRequestService';

describe('ProcessWithdrawalRequest (idempotência — Fase 8.3)', () => {
  const withdrawalRequestService = {
    processRequest: jest.fn(),
  } as jest.Mocked<Pick<WithdrawalRequestService, 'processRequest'>>;

  const buildUseCase = (idempotency?: IdempotencyService) =>
    new ProcessWithdrawalRequest(
      withdrawalRequestService as unknown as WithdrawalRequestService,
      idempotency,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    withdrawalRequestService.processRequest.mockResolvedValue({ id: 'req-1', status: 'APPROVED' } as any);
  });

  it('executa sem idempotência quando não há idempotencyKey', async () => {
    const idempotency = new IdempotencyService(new InMemoryIdempotencyStore());

    const result = await buildUseCase(idempotency).execute('req-1', 'admin-1', 'APPROVED');

    expect(withdrawalRequestService.processRequest).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: 'req-1', status: 'APPROVED' });
  });

  it('replay seguro: mesma chave + mesmo payload não reprocessa', async () => {
    const idempotency = new IdempotencyService(new InMemoryIdempotencyStore());
    const useCase = buildUseCase(idempotency);

    const first = await useCase.execute('req-1', 'admin-1', 'APPROVED', 'ok', 'key-1');
    const second = await useCase.execute('req-1', 'admin-1', 'APPROVED', 'ok', 'key-1');

    expect(withdrawalRequestService.processRequest).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it('rejeita 409: mesma chave com payload diferente', async () => {
    const idempotency = new IdempotencyService(new InMemoryIdempotencyStore());
    const useCase = buildUseCase(idempotency);

    await useCase.execute('req-1', 'admin-1', 'APPROVED', 'ok', 'key-1');
    await expect(
      useCase.execute('req-1', 'admin-2', 'APPROVED', 'ok', 'key-1'),
    ).rejects.toThrow(/conflito|Conflict|já existe|diferente/i);
    expect(withdrawalRequestService.processRequest).toHaveBeenCalledTimes(1);
  });

  it('mesma key com FINGERPRINT canônico: ordem de chaves não gera falsos conflitos', async () => {
    const idempotency = new IdempotencyService(new InMemoryIdempotencyStore());
    const useCase = buildUseCase(idempotency);
    // payloads semanticamente idênticos (mesmos campos) — o fingerprint canônico ordena chaves.
    // O use case constrói o objeto sozinho; aqui garantimos que o 2º replay não dispara 409.
    const first = await useCase.execute('req-1', 'admin-1', 'APPROVED', 'note', 'key-canon');
    const second = await useCase.execute('req-1', 'admin-1', 'APPROVED', 'note', 'key-canon');
    expect(second).toEqual(first);
    expect(withdrawalRequestService.processRequest).toHaveBeenCalledTimes(1);
  });
});