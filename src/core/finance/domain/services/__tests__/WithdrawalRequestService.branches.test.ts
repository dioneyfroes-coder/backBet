import { WithdrawalRequestService } from '../WithdrawalRequestService';
import { WithdrawalRequest } from '@/core/finance/domain/entities/WithdrawalRequest';
import { Currency } from '@/core/finance/domain/value-objects/Currency';
import { ApprovalAction } from '@/core/finance/domain/entities/WithdrawalRequest';

function metrics() {
  return {
    withdrawalRequestCreated: { inc: jest.fn() },
    withdrawalRequestApproved: { inc: jest.fn() },
    withdrawalRequestProcessingFailed: { inc: jest.fn() },
  } as any;
}

function baseMocks() {
  return {
    walletService: {
      findByUserId: jest.fn(),
      lock: jest.fn(),
      unlock: jest.fn(),
      withdrawLocked: jest.fn(),
    } as any,
    repository: {
      create: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      listPending: jest.fn(),
      claimForProcessing: jest.fn(),
    } as any,
  };
}

const SESSION = { sessionId: 's1' };
const runWithSession = (work: (session: unknown) => Promise<unknown>) => work(SESSION);

describe('WithdrawalRequestService — branches de idempotência/não-encontrado/fila/sessão', () => {
  let mocks: ReturnType<typeof baseMocks>;
  let counter: ReturnType<typeof metrics>;
  let service: WithdrawalRequestService;

  beforeEach(() => {
    jest.clearAllMocks();
    mocks = baseMocks();
    counter = metrics();
    service = new WithdrawalRequestService(mocks.repository, mocks.walletService, undefined, counter);
  });

  it('createRequest com requestId existente devolve o registro prévio (replay)', async () => {
    const existing = new WithdrawalRequest('req-existing', 'user-1', 10, 'BRL');
    mocks.repository.findById.mockResolvedValue(existing);

    const result = await service.createRequest('user-1', 10, 'BRL' as Currency, undefined, 'req-existing');

    expect(result).toBe(existing);
    expect(mocks.walletService.findByUserId).not.toHaveBeenCalled();
    expect(mocks.repository.create).not.toHaveBeenCalled();
  });

  it('createRequest com requestId novo segue o fluxo normal com esse id', async () => {
    mocks.repository.findById.mockResolvedValue(null);
    mocks.walletService.findByUserId.mockResolvedValue({ balanceCents: 100000 });
    mocks.repository.create.mockImplementation((req: WithdrawalRequest) => Promise.resolve(req));

    const result = await service.createRequest('user-1', 50, 'BRL' as Currency, 'note', 'req-fresh');

    expect(mocks.walletService.lock).toHaveBeenCalledWith(
      'user-1',
      50,
      expect.objectContaining({ referenceId: 'req-fresh' }),
    );
    expect(result.id).toBe('req-fresh');
  });

  it('com transação, o lock e a persistência usam o session (createRequest)', async () => {
    mocks.repository.withTransaction = runWithSession;
    mocks.walletService.findByUserId.mockResolvedValue({ balanceCents: 100000 });
    mocks.repository.create.mockImplementation((req: WithdrawalRequest) => Promise.resolve(req));

    await service.createRequest('user-1', 50, 'BRL' as Currency);

    expect(mocks.walletService.lock).toHaveBeenCalledWith(
      'user-1',
      50,
      expect.anything(),
      expect.objectContaining({ session: expect.anything() }),
    );
    expect(mocks.repository.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ session: expect.anything() }),
    );
  });

  it('falha no inc do contador created é absorvida (sem derrubar a criação)', async () => {
    counter.withdrawalRequestCreated.inc.mockImplementation(() => {
      throw new Error('metrics down');
    });
    const debug = jest.spyOn(console, 'debug').mockImplementation(() => {});
    mocks.walletService.findByUserId.mockResolvedValue({ balanceCents: 100000 });
    mocks.repository.create.mockImplementation((req: WithdrawalRequest) => Promise.resolve(req));

    await expect(service.createRequest('user-1', 50, 'BRL' as Currency)).resolves.toBeDefined();
    expect(debug).toHaveBeenCalledWith('withdrawalRequestCreatedCounter inc failed', expect.anything());
    debug.mockRestore();
  });

  it('falha ao persistir sem transação: unlock compensatório; erro no unlock não mascara o original', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    mocks.walletService.findByUserId.mockResolvedValue({ balanceCents: 100000 });
    mocks.repository.create.mockRejectedValue(new Error('create down'));
    mocks.walletService.unlock.mockRejectedValue(new Error('unlock down'));

    await expect(service.createRequest('user-1', 50, 'BRL' as Currency)).rejects.toThrow('create down');
    expect(mocks.walletService.unlock).toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      'Failed to unlock wallet after withdrawal request persistence failure',
      expect.objectContaining({ userId: 'user-1', amount: 50 }),
    );
    error.mockRestore();
  });

  it('processRequest APPROVED sem fila: avisa que payout não será automático', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const request = new WithdrawalRequest('req-warn', 'user-1', 10, 'BRL');
    mocks.repository.findById.mockResolvedValue(request);
    mocks.repository.update.mockImplementation((req: WithdrawalRequest) => Promise.resolve(req));

    await service.processRequest('req-warn', 'admin', 'APPROVED' as ApprovalAction);
    expect(warn).toHaveBeenCalledWith(
      'No withdrawalQueue configured; payout will not be executed automatically',
      expect.objectContaining({ requestId: 'req-warn' }),
    );
    expect(counter.withdrawalRequestApproved.inc).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('processRequest APPROVED com fila: enfileira o payout após o CAS', async () => {
    const queue = { enqueuePayout: jest.fn().mockResolvedValue(undefined) } as any;
    const request = new WithdrawalRequest('req-q', 'user-1', 10, 'BRL');
    mocks.repository.findById.mockResolvedValue(request);
    mocks.repository.update.mockImplementation((req: WithdrawalRequest) => Promise.resolve(req));

    service = new WithdrawalRequestService(mocks.repository, mocks.walletService, queue, counter);
    await service.processRequest('req-q', 'admin', 'APPROVED' as ApprovalAction);

    expect(queue.enqueuePayout).toHaveBeenCalledWith({
      requestId: 'req-q',
      userId: 'user-1',
      amount: 10,
      currency: 'BRL',
    });
  });

  it('processRequest APPROVED: falha ao enfileirar registra métrica e relança o erro', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const queue = { enqueuePayout: jest.fn().mockRejectedValue(new Error('redis down')) } as any;
    const request = new WithdrawalRequest('req-qfail', 'user-1', 10, 'BRL');
    mocks.repository.findById.mockResolvedValue(request);
    mocks.repository.update.mockImplementation((req: WithdrawalRequest) => Promise.resolve(req));

    service = new WithdrawalRequestService(mocks.repository, mocks.walletService, queue, counter);
    await expect(service.processRequest('req-qfail', 'admin', 'APPROVED' as ApprovalAction)).rejects.toThrow(
      'redis down',
    );
    expect(counter.withdrawalRequestProcessingFailed.inc).toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      'Failed to enqueue withdrawal payout job',
      expect.objectContaining({ requestId: 'req-qfail' }),
    );
    error.mockRestore();
  });

  it('processRequest REJECTED com transação: unlock e update usam o session', async () => {
    mocks.repository.withTransaction = runWithSession;
    const request = new WithdrawalRequest('req-rx', 'user-1', 10, 'BRL');
    mocks.repository.findById.mockResolvedValue(request);
    mocks.repository.update.mockImplementation((req: WithdrawalRequest) => Promise.resolve(req));

    const result = await service.processRequest('req-rx', 'admin', 'REJECTED' as ApprovalAction, 'nok');

    expect(result.status).toBe('REJECTED');
    expect(mocks.walletService.unlock).toHaveBeenCalledWith(
      'user-1',
      10,
      expect.anything(),
      expect.objectContaining({ session: expect.anything() }),
    );
    expect(mocks.repository.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ session: expect.anything() }),
    );
  });

  it('not-found em processRequest, markProcessing, completePayout, failPayout e cancelWithdrawal', async () => {
    mocks.repository.findById.mockResolvedValue(null);

    await expect(service.processRequest('x', 'admin', 'APPROVED')).rejects.toThrow('Withdrawal request not found');
    await expect(service.markProcessing('x')).rejects.toThrow('Withdrawal request not found');
    await expect(service.completePayout('x')).rejects.toThrow('Withdrawal request not found');
    await expect(service.failPayout('x')).rejects.toThrow('Withdrawal request not found');
    await expect(service.cancelWithdrawal('x')).rejects.toThrow('Withdrawal request not found');
  });

  it('completePayout com transação: debita o saldo travado no session', async () => {
    mocks.repository.withTransaction = runWithSession;
    const request = new WithdrawalRequest('req-cs', 'user-1', 10, 'BRL');
    request.validateBy('admin');
    request.approve('admin');
    request.markProcessing();
    mocks.repository.findById.mockResolvedValue(request);
    mocks.repository.update.mockImplementation((req: WithdrawalRequest) => Promise.resolve(req));

    const result = await service.completePayout('req-cs');

    expect(result.status).toBe('COMPLETED');
    expect(mocks.walletService.withdrawLocked).toHaveBeenCalledWith(
      'user-1',
      10,
      expect.anything(),
      expect.objectContaining({ session: expect.anything() }),
    );
    expect(mocks.repository.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ session: expect.anything() }),
    );
  });

  it('failPayout com transação: devolve o saldo travado no session', async () => {
    mocks.repository.withTransaction = runWithSession;
    const request = new WithdrawalRequest('req-fs', 'user-1', 10, 'BRL');
    request.validateBy('admin');
    request.approve('admin');
    request.markProcessing();
    mocks.repository.findById.mockResolvedValue(request);
    mocks.repository.update.mockImplementation((req: WithdrawalRequest) => Promise.resolve(req));

    const result = await service.failPayout('req-fs');

    expect(result.status).toBe('FAILED');
    expect(mocks.walletService.unlock).toHaveBeenCalledWith(
      'user-1',
      10,
      expect.anything(),
      expect.objectContaining({ session: expect.anything() }),
    );
  });

  it('cancelWithdrawal com transação: libera o valor no session', async () => {
    mocks.repository.withTransaction = runWithSession;
    const request = new WithdrawalRequest('req-cz', 'user-1', 10, 'BRL');
    mocks.repository.findById.mockResolvedValue(request);
    mocks.repository.update.mockImplementation((req: WithdrawalRequest) => Promise.resolve(req));

    const result = await service.cancelWithdrawal('req-cz');

    expect(result.status).toBe('CANCELED');
    expect(mocks.walletService.unlock).toHaveBeenCalledWith(
      'user-1',
      10,
      expect.anything(),
      expect.objectContaining({ session: expect.anything() }),
    );
  });

  it('claimForProcessing repassa para o repositório', async () => {
    const request = new WithdrawalRequest('req-claim', 'user-1', 10, 'BRL');
    mocks.repository.claimForProcessing.mockResolvedValue(request);

    await expect(service.claimForProcessing('req-claim')).resolves.toBe(request);
  });
});