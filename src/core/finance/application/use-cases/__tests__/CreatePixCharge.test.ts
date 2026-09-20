import { CreatePixCharge } from '../CreatePixCharge';
import { PixProviderPort } from '../../../domain/ports/PixProviderPort';
import { MoneySecurityService } from '../../../domain/services/MoneySecurityService';
import { Currency } from '../../../domain/value-objects/Currency';

const buildMocks = () => {
  const pixProvider = {
    createCharge: jest.fn(),
  } as unknown as jest.Mocked<PixProviderPort>;

  const moneySecurity = {
    assertDepositAllowed: jest.fn(),
  } as unknown as jest.Mocked<Pick<MoneySecurityService, 'assertDepositAllowed'>>;

  return { pixProvider, moneySecurity };
};

describe('CreatePixCharge use case', () => {
  it('cria charge PENDING e NÃO credita a carteira (fluxo assíncrono)', async () => {
    const { pixProvider, moneySecurity } = buildMocks();
    pixProvider.createCharge.mockResolvedValue({
      chargeId: 'charge-9',
      reference: 'pix_reference_9',
      status: 'PENDING',
      qrCode: '000201010212...',
      expiresAt: new Date(Date.now() + 300_000),
      provider: 'backbet-mock-pix',
    });

    const useCase = new CreatePixCharge(
      pixProvider as unknown as PixProviderPort,
      moneySecurity as unknown as MoneySecurityService,
    );
    const result = await useCase.execute('user-1', 100, 'BRL' as Currency, 'Depósito');

    expect(moneySecurity.assertDepositAllowed).toHaveBeenCalledWith('user-1', 100);
    expect(pixProvider.createCharge).toHaveBeenCalledWith({
      userId: 'user-1',
      amount: 100,
      currency: 'BRL',
      description: 'Depósito',
    });
    expect(result.pixCharge.status).toBe('PENDING');
  });
});