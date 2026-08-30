import { createHash } from 'crypto';
import { WithdrawalRequestService } from '../WithdrawalRequestService';
import { WithdrawalRequest } from '@/core/finance/domain/entities/WithdrawalRequest';
import { Currency } from '@/core/finance/domain/value-objects/Currency';
import { WalletService } from '../WalletService';
import { WalletRepository } from '../../repositories/WalletRepository';
import { InMemoryLedgerRepository } from '../../repositories/InMemoryLedgerRepository';
import { WithdrawalRequestRepository } from '../../repositories/WithdrawalRequestRepository';
import { RequestWithdrawal } from '@/core/finance/application/use-cases/RequestWithdrawal';
import { IdempotencyService, InMemoryIdempotencyStore } from '@/shared/services/IdempotencyService';
import { UserService } from '@/core/user/domain/services/UserService';
import { User } from '@/core/user/domain/entities/User';
import { Email } from '@/core/user/domain/value-objects/Email';

const USER_ID = 'user-1';

const buildActiveUser = (): User =>
  new User(
    USER_ID,
    new Email('user1@example.com'),
    'user1',
    'hash',
    'ACTIVE',
    new Date(),
    new Date(),
    null,
    [],
    {
      emailNotifications: true,
      smsNotifications: false,
      marketingEmails: false,
      requireWithdrawPassword: false,
    },
  );

describe('WithdrawalRequestService — replay/idempotência por requestId determinístico', () => {
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
    jest.resetAllMocks();
  });

  it('replay com o mesmo requestId retorna a solicitação original sem tocar na carteira', async () => {
    const existing = new WithdrawalRequest('existing-1', USER_ID, 100, 'BRL');
    (repository.findById as jest.Mock).mockResolvedValue(existing);

    const service = new WithdrawalRequestService(repository, walletService);
    const result = await service.createRequest(USER_ID, 100, 'BRL', undefined, 'existing-1');

    expect(result).toBe(existing);
    expect(walletService.findByUserId).not.toHaveBeenCalled();
    expect(walletService.lock).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('primeira execução usa o requestId fornecido no hold e na criação', async () => {
    const wallet = { balance: 500 } as any;
    (walletService.findByUserId as jest.Mock).mockResolvedValue(wallet);
    (repository.create as jest.Mock).mockImplementation((req: WithdrawalRequest) =>
      Promise.resolve(req),
    );

    const service = new WithdrawalRequestService(repository, walletService);
    const result = await service.createRequest(USER_ID, 200, 'BRL', undefined, 'fixed-id-1');

    expect(result.id).toBe('fixed-id-1');
    expect(walletService.lock).toHaveBeenCalledWith(
      USER_ID,
      200,
      expect.objectContaining({ type: 'WITHDRAWAL_HOLD', referenceId: 'fixed-id-1' }),
    );
  });

  it('sem requestId mantém o comportamento original (randomUUID)', async () => {
    const wallet = { balance: 500 } as any;
    (walletService.findByUserId as jest.Mock).mockResolvedValue(wallet);
    (repository.create as jest.Mock).mockImplementation((req: WithdrawalRequest) =>
      Promise.resolve(req),
    );

    const service = new WithdrawalRequestService(repository, walletService);
    const result = await service.createRequest(USER_ID, 200, 'BRL');

    expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('RequestWithdrawal deriva um requestId determinístico da Idempotency-Key', async () => {
    const userService = {
      findById: jest.fn().mockResolvedValue(buildActiveUser()),
      activateUser: jest.fn(),
      comparePassword: jest.fn(),
    } as jest.Mocked<Pick<UserService, 'findById' | 'activateUser' | 'comparePassword'>>;

    const createRequest = jest.fn().mockImplementation(async (_, __, ___, ____, id?: string) =>
      new WithdrawalRequest(id ?? 'x', USER_ID, 50, 'BRL'),
    );

    const useCase = new RequestWithdrawal(
      { createRequest } as unknown as WithdrawalRequestService,
      userService as unknown as UserService,
    );

    const expected = createHash('sha256').update(`${USER_ID}:KEY-1`).digest('hex');
    await useCase.execute(USER_ID, 50, 'BRL', undefined, undefined, 'KEY-1');

    expect(createRequest).toHaveBeenCalledWith(USER_ID, 50, 'BRL', undefined, expected);
  });
});

describe('Replay pós-perda da Idempotency-Key (crash após commit) não duplica hold/request', () => {
  const buildHarness = () => {
    const walletRepo = new WalletRepository();
    const ledger = new InMemoryLedgerRepository();
    const walletService = new WalletService(walletRepo, ledger);
    const requestRepo = new WithdrawalRequestRepository();
    const service = new WithdrawalRequestService(requestRepo, walletService);
    const userService = {
      findById: jest.fn().mockResolvedValue(buildActiveUser()),
      activateUser: jest.fn(),
      comparePassword: jest.fn().mockResolvedValue(true),
    } as jest.Mocked<Pick<UserService, 'findById' | 'activateUser' | 'comparePassword'>>;
    const store = new InMemoryIdempotencyStore();
    const idempotency = new IdempotencyService(store);
    const useCase = new RequestWithdrawal(service, userService as unknown as UserService, idempotency);
    return { walletService, ledger, requestRepo, store, useCase };
  };

  it('retry com a mesma chave após armazenamento perdido devolve a mesma solicitação', async () => {
    const { walletService, ledger, requestRepo, store, useCase } = buildHarness();
    await walletService.createWallet({ userId: USER_ID, currency: 'BRL' });
    await walletService.deposit(USER_ID, 250);

    const first = await useCase.execute(USER_ID, 100, 'BRL', undefined, undefined, 'KEY-1');
    expect(first.status).toBe('REQUESTED');
    expect((await walletService.findByUserId(USER_ID))?.balance).toBe(150);
    expect((await walletService.findByUserId(USER_ID))?.lockedBalance).toBe(100);

    await store.delete('backbet:idempotency:user-1:withdrawal-request:KEY-1');

    const second = await useCase.execute(USER_ID, 100, 'BRL', undefined, undefined, 'KEY-1');

    expect(second.id).toBe(first.id);
    expect(second.status).toBe('REQUESTED');
    const wallet = (await walletService.findByUserId(USER_ID))!;
    expect(wallet.balance).toBe(150);
    expect(wallet.lockedBalance).toBe(100);
    const holds = (await ledger.findByUserId(USER_ID)).filter(
      (entry) => entry.type === 'WITHDRAWAL_HOLD',
    );
    expect(holds).toHaveLength(1);
    expect(await requestRepo.findByUserId(USER_ID)).toHaveLength(1);
  });

  it('retry depois de CONCLUÍDO passa pelo cache (replay) sem gerar segunda solicitação', async () => {
    const { walletService, ledger, requestRepo, useCase } = buildHarness();
    await walletService.createWallet({ userId: USER_ID, currency: 'BRL' });
    await walletService.deposit(USER_ID, 250);

    const first = await useCase.execute(USER_ID, 100, 'BRL', undefined, undefined, 'KEY-2');
    const second = await useCase.execute(USER_ID, 100, 'BRL', undefined, undefined, 'KEY-2');

    expect(second.id).toBe(first.id);
    expect((await walletService.findByUserId(USER_ID))?.balance).toBe(150);
    expect((await walletService.findByUserId(USER_ID))?.lockedBalance).toBe(100);
    expect(
      (await ledger.findByUserId(USER_ID)).filter((entry) => entry.type === 'WITHDRAWAL_HOLD'),
    ).toHaveLength(1);
    expect(await requestRepo.findByUserId(USER_ID)).toHaveLength(1);
  });
});