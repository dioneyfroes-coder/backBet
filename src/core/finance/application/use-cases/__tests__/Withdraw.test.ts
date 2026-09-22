import { Withdraw } from '../Withdraw';
import { WalletService } from '../../../domain/services/WalletService';
import { PixProviderPort } from '../../../domain/ports/PixProviderPort';
import { Currency } from '../../../domain/value-objects/Currency';
import { MoneySecurityService } from '../../../domain/services/MoneySecurityService';

const buildMocks = () => {
  const walletService = {
    withdraw: jest.fn(),
  } as unknown as jest.Mocked<Pick<WalletService, 'withdraw'>>;

  const pixProvider = {
    initiatePayout: jest.fn(),
  } as unknown as jest.Mocked<Pick<PixProviderPort, 'initiatePayout'>>;

  return { walletService, pixProvider };
};

describe('Withdraw use case', () => {
  it('initiates Pix payout and records metadata on wallet withdrawal', async () => {
    const { walletService, pixProvider } = buildMocks();
    const payout = {
      payoutId: 'payout-1',
      reference: 'pix-ref-payout',
      status: 'COMPLETED' as const,
      provider: 'mock',
      processedAt: new Date('2025-01-01T00:02:00.000Z'),
    };
    pixProvider.initiatePayout.mockResolvedValue(payout);
    walletService.withdraw.mockResolvedValue({
      userId: 'user-1',
      balance: 50,
      lockedBalance: 0,
      currency: 'BRL',
    } as any);

    const useCase = new Withdraw(
      walletService as unknown as WalletService,
      pixProvider as unknown as PixProviderPort,
    );
    const result = await useCase.execute('user-1', 50, 'BRL' as Currency, 'user@pix', 'Cashout');

    expect(pixProvider.initiatePayout).toHaveBeenCalledWith({
      userId: 'user-1',
      amount: 50,
      currency: 'BRL',
      pixKey: 'user@pix',
      description: 'Cashout',
    });
    expect(walletService.withdraw).toHaveBeenCalledWith(
      'user-1',
      50,
      expect.objectContaining({
        description: 'Cashout',
        metadata: expect.objectContaining({
          pixPayoutId: 'payout-1',
          pixReference: 'pix-ref-payout',
          pixProvider: 'mock',
          pixKey: 'user@pix',
        }),
      }),
    );
    expect(result.pixPayout.payoutId).toBe('payout-1');
    expect(result.pixPayout.status).toBe('COMPLETED');
  });

  it('rejects sub-cent precision via Money BEFORE contacting the PSP', async () => {
    const { walletService, pixProvider } = buildMocks();
    pixProvider.initiatePayout.mockResolvedValue({
      payoutId: 'payout-x',
      reference: 'ref',
      status: 'COMPLETED' as const,
      provider: 'mock',
      processedAt: new Date(),
    });

    const useCase = new Withdraw(
      walletService as unknown as WalletService,
      pixProvider as unknown as PixProviderPort,
    );

    await expect(
      useCase.execute('user-1', 0.30000000000000004, 'BRL' as Currency, 'user@pix'),
    ).rejects.toThrow();
    expect(pixProvider.initiatePayout).not.toHaveBeenCalled();
    expect(walletService.withdraw).not.toHaveBeenCalled();
  });

  it('submete a transação ao moneySecurity quando ele está presente', async () => {
    const { walletService, pixProvider } = buildMocks();
    pixProvider.initiatePayout.mockResolvedValue({
      payoutId: 'payout-sec',
      reference: 'ref-sec',
      status: 'COMPLETED' as const,
      provider: 'mock',
      processedAt: new Date(),
    });
    walletService.withdraw.mockResolvedValue({} as any);
    const moneySecurity = {
      assertWithdrawalAllowed: jest.fn().mockResolvedValue(undefined),
    } as unknown as MoneySecurityService;

    const useCase = new Withdraw(
      walletService as unknown as WalletService,
      pixProvider as unknown as PixProviderPort,
      undefined,
      moneySecurity,
    );

    await useCase.execute('user-1', 50, 'BRL' as Currency, 'user@pix');

    expect(moneySecurity.assertWithdrawalAllowed).toHaveBeenCalledWith('user-1', 50, 'user@pix');
    expect(pixProvider.initiatePayout).toHaveBeenCalled();
  });

  it('sem moneySecurity, segue direto para o PSP', async () => {
    const { walletService, pixProvider } = buildMocks();
    pixProvider.initiatePayout.mockResolvedValue({
      payoutId: 'payout-plain',
      reference: 'ref-plain',
      status: 'COMPLETED' as const,
      provider: 'mock',
      processedAt: new Date(),
    });
    walletService.withdraw.mockResolvedValue({} as any);

    const useCase = new Withdraw(
      walletService as unknown as WalletService,
      pixProvider as unknown as PixProviderPort,
    );

    await useCase.execute('user-1', 50, 'BRL' as Currency, 'user@pix');

    expect(pixProvider.initiatePayout).toHaveBeenCalled();
    expect(walletService.withdraw).toHaveBeenCalledWith(
      'user-1',
      50,
      expect.objectContaining({ referenceId: 'payout-plain' }),
    );
  });

  it('com idempotência e chave, executa via executeWithMeta', async () => {
    const { walletService, pixProvider } = buildMocks();
    const payout = {
      payoutId: 'payout-idem',
      reference: 'ref-idem',
      status: 'COMPLETED' as const,
      provider: 'mock',
      processedAt: new Date(),
    };
    pixProvider.initiatePayout.mockResolvedValue(payout);
    const wallet = { userId: 'user-1', balance: 0 } as any;
    walletService.withdraw.mockResolvedValue(wallet);
    const idempotency = {
      executeWithMeta: jest.fn(async (_key: string, _fp: unknown, op: () => unknown) => ({
        value: await op(),
        replayed: false,
      })),
    } as any;

    const useCase = new Withdraw(
      walletService as unknown as WalletService,
      pixProvider as unknown as PixProviderPort,
      idempotency,
    );

    const result = await useCase.execute('user-1', 50, 'BRL' as Currency, 'user@pix', 'Cashout', 'key-1');

    expect(idempotency.executeWithMeta).toHaveBeenCalledWith(
      'user-1:withdraw:key-1',
      expect.any(String),
      expect.any(Function),
    );
    expect(result).toEqual({ wallet, pixPayout: payout, replayed: false });
  });

  it('replay idempotente devolve o valor em cache sem re-executar a operação', async () => {
    const { walletService, pixProvider } = buildMocks();
    const cached = { wallet: { userId: 'user-1' }, pixPayout: { payoutId: 'cached' } } as any;
    const idempotency = {
      executeWithMeta: jest.fn(async () => ({ value: cached, replayed: true })),
    } as any;

    const useCase = new Withdraw(
      walletService as unknown as WalletService,
      pixProvider as unknown as PixProviderPort,
      idempotency,
    );

    const result = await useCase.execute('user-1', 50, 'BRL' as Currency, 'user@pix', undefined, 'key-1');

    expect(result).toEqual({ ...cached, replayed: true });
    expect(pixProvider.initiatePayout).not.toHaveBeenCalled();
    expect(walletService.withdraw).not.toHaveBeenCalled();
  });
});
