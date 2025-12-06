import { Deposit } from '../Deposit';
import { WalletService } from '../../../domain/services/WalletService';
import { PixProviderPort } from '../../../domain/ports/PixProviderPort';
import { Currency } from '../../../domain/value-objects/Currency';

const buildMocks = () => {
  const walletService = {
    deposit: jest.fn(),
  } as unknown as jest.Mocked<Pick<WalletService, 'deposit'>>;

  const pixProvider = {
    createCharge: jest.fn(),
    confirmPayment: jest.fn(),
  } as unknown as jest.Mocked<PixProviderPort>;

  return { walletService, pixProvider };
};

describe('Deposit use case', () => {
  it('creates Pix charge, confirms payment, and records metadata on wallet deposit', async () => {
    const { walletService, pixProvider } = buildMocks();
    const charge = {
      chargeId: 'charge-1',
      reference: 'pix-ref-charge',
      status: 'PENDING' as const,
      provider: 'mock',
      qrCode: 'qr-code',
      expiresAt: new Date('2025-01-01T00:05:00.000Z'),
    };
    const confirmation = {
      chargeId: 'charge-1',
      reference: 'pix-ref-charge',
      status: 'PAID' as const,
      provider: 'mock',
      confirmedAt: new Date('2025-01-01T00:01:00.000Z'),
    };
    pixProvider.createCharge.mockResolvedValue(charge);
    pixProvider.confirmPayment.mockResolvedValue(confirmation);
    walletService.deposit.mockResolvedValue({
      userId: 'user-1',
      balance: 100,
      lockedBalance: 0,
      currency: 'BRL',
    } as any);

    const useCase = new Deposit(
      walletService as unknown as WalletService,
      pixProvider as unknown as PixProviderPort,
    );
    const result = await useCase.execute('user-1', 100, 'BRL' as Currency, 'Top up');

    expect(pixProvider.createCharge).toHaveBeenCalledWith({
      userId: 'user-1',
      amount: 100,
      currency: 'BRL',
      description: 'Top up',
    });
    expect(pixProvider.confirmPayment).toHaveBeenCalledWith('charge-1');
    expect(walletService.deposit).toHaveBeenCalledWith(
      'user-1',
      100,
      expect.objectContaining({
        description: 'Top up',
        metadata: expect.objectContaining({
          channel: 'PIX',
          pixChargeId: 'charge-1',
          pixReference: 'pix-ref-charge',
          pixProvider: 'mock',
        }),
      }),
    );
    expect(result.pixCharge.chargeId).toBe('charge-1');
    expect(result.pixConfirmation.status).toBe('PAID');
  });
});
