import { PurchaseCreditPackage } from '../PurchaseCreditPackage';
import { CreditPackage } from '@/core/finance/domain/entities/CreditPackage';

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
    const creditPackage = new CreditPackage('pkg-id', 'bronze', 'Bronze', 100, 10, 'BRL', 90);
    (mockCreditPackageService.getById as jest.Mock).mockResolvedValue(creditPackage);
    const updatedWallet = { userId: 'user-123', balance: 110 } as any;
    (mockWalletService.deposit as jest.Mock).mockResolvedValue(updatedWallet);

    const useCase = new PurchaseCreditPackage(mockCreditPackageService, mockWalletService);

    const response = await useCase.execute('user-123', 'pkg-id');

    expect(mockWalletService.deposit).toHaveBeenCalledWith('user-123', 110);
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
});
