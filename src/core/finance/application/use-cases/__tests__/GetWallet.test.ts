import { GetWallet } from '../GetWallet';
import { WalletService } from '../../../domain/services/WalletService';

describe('GetWallet use case', () => {
  it('delegates to wallet service', async () => {
    const walletService = {
      findByUserId: jest.fn().mockResolvedValue({ userId: 'user-1' }),
    } as unknown as jest.Mocked<WalletService>;
    const useCase = new GetWallet(walletService);

    await useCase.execute('user-1');

    expect(walletService.findByUserId).toHaveBeenCalledWith('user-1');
  });
});
