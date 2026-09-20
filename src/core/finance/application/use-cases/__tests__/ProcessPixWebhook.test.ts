import { ProcessPixWebhook } from '../ProcessPixWebhook';
import { WalletService } from '../../../domain/services/WalletService';
import { PixWebhookEvent, PixChargeSnapshot, PixProviderPort } from '../../../domain/ports/PixProviderPort';
import { AppError } from '@/shared/errors/AppError';

const buildMocks = () => {
  const walletService = {
    deposit: jest.fn(),
    withdraw: jest.fn(),
  } as unknown as jest.Mocked<Pick<WalletService, 'deposit' | 'withdraw'>>;

  const pixProvider = {
    verifyWebhookSignature: jest.fn(),
    getCharge: jest.fn(),
    confirmPayment: jest.fn(),
    refundCharge: jest.fn(),
  } as unknown as jest.Mocked<PixProviderPort>;

  return { walletService, pixProvider };
};

const charge = (overrides: Partial<PixChargeSnapshot> = {}): PixChargeSnapshot => ({
  chargeId: 'charge-1',
  reference: 'pix_reference_abc',
  userId: 'user-1',
  amount: 100,
  currency: 'BRL',
  status: 'PENDING',
  expiresAt: new Date(Date.now() + 60_000),
  createdAt: new Date(Date.now() - 10_000),
  provider: 'backbet-mock-pix',
  ...overrides,
});

const event = (overrides: Partial<PixWebhookEvent> = {}): PixWebhookEvent => ({
  type: 'PIX_PAID',
  chargeId: 'charge-1',
  reference: 'pix_reference_abc',
  amount: 100,
  currency: 'BRL',
  rawBody: '{"type":"PIX_PAID","chargeId":"charge-1"}',
  signature: 'good-signature',
  ...overrides,
});

describe('ProcessPixWebhook use case', () => {
  it('P4: PIX_PAID válido credita o depósito na carteira', async () => {
    const { walletService, pixProvider } = buildMocks();
    pixProvider.verifyWebhookSignature.mockResolvedValue(true);
    pixProvider.getCharge.mockResolvedValue(charge());
    walletService.deposit.mockResolvedValue({
      userId: 'user-1',
      balance: 100,
      lockedBalance: 0,
      currency: 'BRL',
    } as never);

    const useCase = new ProcessPixWebhook(
      walletService as unknown as WalletService,
      pixProvider as unknown as PixProviderPort,
    );
    const result = await useCase.execute(event());

    expect(result.action).toBe('credited');
    expect(walletService.deposit).toHaveBeenCalledWith(
      'user-1',
      100,
      expect.objectContaining({
        type: 'DEPOSIT',
        source: 'PIX',
        referenceId: 'charge-1',
        metadata: expect.objectContaining({ confirmedBy: 'webhook', pixChargeId: 'charge-1' }),
      }),
    );
    expect(pixProvider.confirmPayment).toHaveBeenCalledWith('charge-1');
  });

  it('P2: assinatura inválida é rejeitada (401)', async () => {
    const { walletService, pixProvider } = buildMocks();
    pixProvider.verifyWebhookSignature.mockResolvedValue(false);
    pixProvider.getCharge.mockResolvedValue(charge());

    const useCase = new ProcessPixWebhook(
      walletService as unknown as WalletService,
      pixProvider as unknown as PixProviderPort,
    );
    await expect(useCase.execute(event({ signature: 'corrupted' }))).rejects.toMatchObject({
      code: 'PIX_WEBHOOK_SIGNATURE_INVALID',
      statusCode: 401,
    });
    expect(walletService.deposit).not.toHaveBeenCalled();
  });

  it('P1: charge já paga (webhook duplicado) não credita de novo', async () => {
    const { walletService, pixProvider } = buildMocks();
    pixProvider.verifyWebhookSignature.mockResolvedValue(true);
    pixProvider.getCharge.mockResolvedValue(charge({ status: 'PAID' }));

    const useCase = new ProcessPixWebhook(
      walletService as unknown as WalletService,
      pixProvider as unknown as PixProviderPort,
    );
    const result = await useCase.execute(event());

    expect(result.action).toBe('replayed');
    expect(walletService.deposit).not.toHaveBeenCalled();
  });

  it('P3: charge expirada ignora a confirmação sem creditar', async () => {
    const { walletService, pixProvider } = buildMocks();
    pixProvider.verifyWebhookSignature.mockResolvedValue(true);
    pixProvider.getCharge.mockResolvedValue(
      charge({ status: 'EXPIRED', expiresAt: new Date(Date.now() - 60_000) }),
    );

    const useCase = new ProcessPixWebhook(
      walletService as unknown as WalletService,
      pixProvider as unknown as PixProviderPort,
    );
    const result = await useCase.execute(event());

    expect(result.action).toBe('expired_ignored');
    expect(walletService.deposit).not.toHaveBeenCalled();
  });

  it('P5: PIX_REFUNDED após crédito faz estorno (PIX_REFUND)', async () => {
    const { walletService, pixProvider } = buildMocks();
    pixProvider.verifyWebhookSignature.mockResolvedValue(true);
    pixProvider.getCharge.mockResolvedValue(charge({ status: 'PAID' }));
    pixProvider.refundCharge.mockResolvedValue(charge({ status: 'REFUNDED' }));
    walletService.withdraw.mockResolvedValue({
      userId: 'user-1',
      balance: 0,
      lockedBalance: 0,
      currency: 'BRL',
    } as never);

    const useCase = new ProcessPixWebhook(
      walletService as unknown as WalletService,
      pixProvider as unknown as PixProviderPort,
    );
    const result = await useCase.execute(event({ type: 'PIX_REFUNDED' }));

    expect(result.action).toBe('refunded');
    expect(walletService.withdraw).toHaveBeenCalledWith(
      'user-1',
      100,
      expect.objectContaining({
        type: 'PIX_REFUND',
        source: 'PIX',
        referenceId: 'charge-1',
      }),
    );
    expect(pixProvider.refundCharge).toHaveBeenCalledWith('charge-1');
  });

  it('P5: PIX_CANCELED de charge nunca paga não debita nada', async () => {
    const { walletService, pixProvider } = buildMocks();
    pixProvider.verifyWebhookSignature.mockResolvedValue(true);
    pixProvider.getCharge.mockResolvedValue(charge({ status: 'PENDING' }));
    pixProvider.refundCharge.mockResolvedValue(charge({ status: 'REFUNDED' }));

    const useCase = new ProcessPixWebhook(
      walletService as unknown as WalletService,
      pixProvider as unknown as PixProviderPort,
    );
    const result = await useCase.execute(event({ type: 'PIX_CANCELED' }));

    expect(result.action).toBe('canceled');
    expect(walletService.withdraw).not.toHaveBeenCalled();
    expect(pixProvider.refundCharge).toHaveBeenCalledWith('charge-1');
  });

  it('P6: amount divergente é rejeitado (422)', async () => {
    const { walletService, pixProvider } = buildMocks();
    pixProvider.verifyWebhookSignature.mockResolvedValue(true);
    pixProvider.getCharge.mockResolvedValue(charge({ amount: 100 }));

    const useCase = new ProcessPixWebhook(
      walletService as unknown as WalletService,
      pixProvider as unknown as PixProviderPort,
    );
    await expect(
      useCase.execute(event({ amount: 150 })),
    ).rejects.toMatchObject({
      code: 'PIX_WEBHOOK_AMOUNT_MISMATCH',
      statusCode: 422,
    });
    expect(walletService.deposit).not.toHaveBeenCalled();
  });

  it('P7: reference divergente é rejeitado (422)', async () => {
    const { walletService, pixProvider } = buildMocks();
    pixProvider.verifyWebhookSignature.mockResolvedValue(true);
    pixProvider.getCharge.mockResolvedValue(charge({ reference: 'pix_reference_abc' }));

    const useCase = new ProcessPixWebhook(
      walletService as unknown as WalletService,
      pixProvider as unknown as PixProviderPort,
    );
    await expect(
      useCase.execute(event({ reference: 'nope' })),
    ).rejects.toMatchObject({
      code: 'PIX_WEBHOOK_REFERENCE_MISMATCH',
      statusCode: 422,
    });
    expect(walletService.deposit).not.toHaveBeenCalled();
  });

  it('charge inexistente retorna 404', async () => {
    const { walletService, pixProvider } = buildMocks();
    pixProvider.verifyWebhookSignature.mockResolvedValue(true);
    pixProvider.getCharge.mockResolvedValue(null);

    const useCase = new ProcessPixWebhook(
      walletService as unknown as WalletService,
      pixProvider as unknown as PixProviderPort,
    );
    await expect(useCase.execute(event())).rejects.toBeInstanceOf(AppError);
    expect(walletService.deposit).not.toHaveBeenCalled();
  });
});