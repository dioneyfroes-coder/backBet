import { WithdrawalRequestService } from '../WithdrawalRequestService';
import { WithdrawalRequest } from '@/core/finance/domain/entities/WithdrawalRequest';
import { Currency } from '@/core/finance/domain/value-objects/Currency';
import { ApprovalAction } from '@/core/finance/domain/entities/WithdrawalRequest';

describe('WithdrawalRequestService', () => {
  const walletService = {
    findByUserId: jest.fn(),
    lock: jest.fn(),
    unlock: jest.fn(),
    withdrawLocked: jest.fn(),
  } as any;

  const repository = {
    create: jest.fn(),
    update: jest.fn(),
    findById: jest.fn(),
    findByUserId: jest.fn(),
    listPending: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a withdrawal request and locks the amount', async () => {
    const wallet = { balance: 500 } as any;
    (walletService.findByUserId as jest.Mock).mockResolvedValue(wallet);
    (repository.create as jest.Mock).mockImplementation((req: WithdrawalRequest) =>
      Promise.resolve(req),
    );

    const service = new WithdrawalRequestService(repository, walletService);
    const request = await service.createRequest('user-1', 200, 'BRL' as Currency, 'test');

    expect(walletService.lock).toHaveBeenCalledWith(
      'user-1',
      200,
      expect.objectContaining({ type: 'WITHDRAWAL_HOLD', source: 'WITHDRAWAL' }),
    );
    expect(repository.create).toHaveBeenCalled();
    expect(request.status).toBe('PENDING');
  });

  it('throws when balance is insufficient', async () => {
    const wallet = { balance: 50 } as any;
    (walletService.findByUserId as jest.Mock).mockResolvedValue(wallet);
    const service = new WithdrawalRequestService(repository, walletService);

    await expect(service.createRequest('user-1', 100, 'BRL' as Currency)).rejects.toThrow(
      'Saldo insuficiente',
    );
    expect(walletService.lock).not.toHaveBeenCalled();
  });

  it('validates amount and wallet existence before creating request', async () => {
    const service = new WithdrawalRequestService(repository, walletService);

    await expect(service.createRequest('user-1', 0, 'BRL' as Currency)).rejects.toThrow(
      'Amount must be positive',
    );

    (walletService.findByUserId as jest.Mock).mockResolvedValue(null);
    await expect(service.createRequest('user-1', 10, 'BRL' as Currency)).rejects.toThrow(
      'Wallet not found',
    );
  });

  it('approves a pending request', async () => {
    const request = new WithdrawalRequest('req-1', 'user-1', 100, 'BRL');
    (repository.findById as jest.Mock).mockResolvedValue(request);
    (repository.update as jest.Mock).mockImplementation((req: WithdrawalRequest) =>
      Promise.resolve(req),
    );

    const service = new WithdrawalRequestService(repository, walletService);
    const result = await service.processRequest(
      'req-1',
      'admin',
      'APPROVED' as ApprovalAction,
      'ok',
    );

    expect(walletService.withdrawLocked).toHaveBeenCalledWith(
      'user-1',
      100,
      expect.objectContaining({ type: 'WITHDRAWAL_COMPLETED', source: 'WITHDRAWAL' }),
    );
    expect(result.status).toBe('APPROVED');
    expect(repository.update).toHaveBeenCalledWith(result);
  });

  it('rejects a pending request', async () => {
    const request = new WithdrawalRequest('req-2', 'user-1', 150, 'BRL');
    (repository.findById as jest.Mock).mockResolvedValue(request);
    (repository.update as jest.Mock).mockImplementation((req: WithdrawalRequest) =>
      Promise.resolve(req),
    );

    const service = new WithdrawalRequestService(repository, walletService);
    const result = await service.processRequest(
      'req-2',
      'admin',
      'REJECTED' as ApprovalAction,
      'bloqueado',
    );

    expect(walletService.unlock).toHaveBeenCalledWith(
      'user-1',
      150,
      expect.objectContaining({ type: 'WITHDRAWAL_REVERSED', source: 'WITHDRAWAL' }),
    );
    expect(result.status).toBe('REJECTED');
    expect(repository.update).toHaveBeenCalledWith(result);
  });

  it('lists requests by user', async () => {
    const list = [new WithdrawalRequest('req-3', 'user-2', 50, 'BRL')];
    (repository.findByUserId as jest.Mock).mockResolvedValue(list);
    const service = new WithdrawalRequestService(repository, walletService);

    const response = await service.listByUser('user-2');
    expect(response).toEqual(list);
  });

  it('lists pending requests', async () => {
    const pending = [new WithdrawalRequest('req-4', 'user-3', 70, 'BRL')];
    (repository.listPending as jest.Mock).mockResolvedValue(pending);
    const service = new WithdrawalRequestService(repository, walletService);

    const response = await service.listPending(5, 0);
    expect(response).toEqual(pending);
  });

  it('validates request existence and status before processing', async () => {
    (repository.findById as jest.Mock).mockResolvedValue(null);
    const service = new WithdrawalRequestService(repository, walletService);

    await expect(service.processRequest('missing', 'admin', 'APPROVED')).rejects.toThrow(
      'Withdrawal request not found',
    );

    const processed = new WithdrawalRequest('req-5', 'user', 10, 'BRL');
    processed.approve('admin');
    (repository.findById as jest.Mock).mockResolvedValue(processed);

    await expect(service.processRequest('req-5', 'admin', 'APPROVED')).rejects.toThrow(
      'Withdrawal request already processed',
    );
  });
});
