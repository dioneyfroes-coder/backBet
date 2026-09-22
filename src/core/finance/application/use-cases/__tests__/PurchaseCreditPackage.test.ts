import { PurchaseCreditPackage } from '../PurchaseCreditPackage';
import { CreditPackage } from '@/core/finance/domain/entities/CreditPackage';
import { Wallet } from '@/core/finance/domain/entities/Wallet';

describe('PurchaseCreditPackage', () => {
  const mockCreditPackageService = {
    getById: jest.fn(),
  } as any;
  const mockWalletService = {
    deposit: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deposits base plus bonus credits for the user', async () => {
    const creditPackage = new CreditPackage('pkg-id', 'bronze', 'Bronze', 10000, 1000, 'BRL', 9000);
    (mockCreditPackageService.getById as jest.Mock).mockResolvedValue(creditPackage);
    const updatedWallet = { userId: 'user-123', balance: 110 } as any;
    (mockWalletService.deposit as jest.Mock).mockResolvedValue(updatedWallet);

    const useCase = new PurchaseCreditPackage(mockCreditPackageService, mockWalletService);

    const response = await useCase.execute('user-123', 'pkg-id');

    expect(mockWalletService.deposit).toHaveBeenCalledWith(
      'user-123',
      110,
      expect.objectContaining({ type: 'DEPOSIT', source: 'CREDIT_PACKAGE', referenceId: 'pkg-id' }),
    );
    expect(response.wallet).toBe(updatedWallet);
    expect(response.creditPackage).toBe(creditPackage);
  });

  it('propagates errors when the package is missing', async () => {
    (mockCreditPackageService.getById as jest.Mock).mockImplementation(() => {
      throw new Error('not found');
    });
    const useCase = new PurchaseCreditPackage(mockCreditPackageService, mockWalletService);

    await expect(useCase.execute('user-abc', 'missing')).rejects.toThrow('not found');
  });

  it('com idempotência e chave: executa via idempotency.execute com serializer de re-hidratação', async () => {
    const creditPackage = new CreditPackage('pkg-idem', 'gold', 'Gold', 10000, 2000, 'BRL', 11000, 'caixa');
    const updatedWallet = { userId: 'user-1', currency: 'BRL', balance: 120 };
    (mockCreditPackageService.getById as jest.Mock).mockResolvedValue(creditPackage);
    (mockWalletService.deposit as jest.Mock).mockResolvedValue(updatedWallet);

    const execute = jest.fn(async (_key: string, _fingerprint: unknown, op: () => unknown) => op());
    const idempotency = { execute } as any;

    const useCase = new PurchaseCreditPackage(mockCreditPackageService, mockWalletService, idempotency);

    await useCase.execute('user-1', 'pkg-idem', 'key-1');

    const idemCall = execute.mock.calls[0] as unknown as [
      string,
      string,
      () => unknown,
      (raw: unknown) => { creditPackage: CreditPackage; wallet: Wallet },
      number,
    ];
    expect(idemCall).toBeDefined();
    expect(idemCall[0]).toBe('user-1:package-purchase:key-1');
    expect(idemCall[1]).toEqual(expect.any(String));
    expect(idemCall[2]).toEqual(expect.any(Function));
    expect(idemCall[4]).toEqual(expect.any(Number));

    const serializer = idemCall[3];
    const rehydrated = serializer({
      creditPackage: {
        id: 'pkg-idem',
        code: 'gold',
        label: 'Gold',
        baseAmount: 100,
        bonusAmount: 20,
        currency: 'BRL',
        price: 110,
        description: 'caixa',
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00Z').toISOString(),
        updatedAt: new Date('2026-01-01T00:00:00Z').toISOString(),
      },
      wallet: { userId: 'user-1', currency: 'BRL' },
    });

    expect(rehydrated.creditPackage).toBeInstanceOf(CreditPackage);
    expect(rehydrated.creditPackage.id).toBe('pkg-idem');
    expect(rehydrated.creditPackage.currency).toBe('BRL');
    expect(rehydrated.creditPackage.isActive).toBe(true);
    expect(rehydrated.creditPackage.description).toBe('caixa');
    expect(rehydrated.wallet).toBeInstanceOf(Wallet);
    expect(rehydrated.wallet.userId).toBe('user-1');
  });
});
