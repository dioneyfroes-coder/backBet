import { GetHistory } from '../GetHistory';
import { WalletService } from '../../../domain/services/WalletService';

describe('GetHistory use case', () => {
  it('delegates to wallet service with defaults', async () => {
    const walletService = {
      getHistory: jest.fn().mockResolvedValue({ transactions: [], total: 0 }),
    } as unknown as jest.Mocked<WalletService>;
    const useCase = new GetHistory(walletService);

    await useCase.execute('user-1');

    expect(walletService.getHistory).toHaveBeenCalledWith('user-1', 10, 0);
  });

  it('passes custom pagination parameters', async () => {
    const walletService = {
      getHistory: jest.fn().mockResolvedValue({ transactions: [], total: 0 }),
    } as unknown as jest.Mocked<WalletService>;
    const useCase = new GetHistory(walletService);

    await useCase.execute('user-1', 5, 5);

    expect(walletService.getHistory).toHaveBeenCalledWith('user-1', 5, 5);
  });
});
