import { Withdraw } from '../Withdraw';
import { WalletService } from '../../../domain/services/WalletService';
import { PixProviderPort } from '../../../domain/ports/PixProviderPort';
import { Currency } from '../../../domain/value-objects/Currency';

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
});
