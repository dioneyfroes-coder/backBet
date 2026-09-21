import { WalletService } from '../WalletService';
import { IWalletRepository } from '../../repositories/IWalletRepository';
import { Wallet } from '../../entities/Wallet';
import { ICreateWalletDTO } from '@/core/finance/types/wallet.types';

describe('WalletService', () => {
  let walletService: WalletService;
  let mockWalletRepository: jest.Mocked<IWalletRepository>;

  beforeEach(() => {
    mockWalletRepository = {
      findByUserId: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    walletService = new WalletService(mockWalletRepository);
  });

  describe('createWallet', () => {
    const createWalletDto: ICreateWalletDTO = {
      userId: 'test-user-id',
      currency: 'BRL',
    };

    it('should create a new wallet when user does not have one', async () => {
      mockWalletRepository.findByUserId.mockResolvedValue(null);

      const result = await walletService.createWallet(createWalletDto);

      expect(result).toBeInstanceOf(Wallet);
      expect(result.userId).toBe(createWalletDto.userId);
      expect(result.currency).toBe('BRL');
      expect(result.balance).toBe(0);
      expect(mockWalletRepository.save).toHaveBeenCalledWith(result);
    });

    it('should create a wallet with specified currency', async () => {
      mockWalletRepository.findByUserId.mockResolvedValue(null);
      const currencyDto = { ...createWalletDto, currency: 'USD' };

      const result = await walletService.createWallet(currencyDto);

      expect(result).toBeInstanceOf(Wallet);
      expect(result.userId).toBe(createWalletDto.userId);
      expect(result.currency).toBe('USD');
      expect(result.balance).toBe(0);
      expect(mockWalletRepository.save).toHaveBeenCalledWith(result);
    });

    it('should throw error when wallet already exists', async () => {
      const existingWallet = new Wallet(createWalletDto.userId, 'BRL');
      mockWalletRepository.findByUserId.mockResolvedValue(existingWallet);

      await expect(walletService.createWallet(createWalletDto)).rejects.toThrow(
        'Wallet already exists for user',
      );
      expect(mockWalletRepository.save).not.toHaveBeenCalled();
    });

    it('should default to BRL when currency is omitted', async () => {
      mockWalletRepository.findByUserId.mockResolvedValue(null);

      const result = await walletService.createWallet({ userId: 'abc' } as any);

      expect(result.currency).toBe('BRL');
    });
  });

  describe('deposit', () => {
    const userId = 'test-user-id';
    const amount = 100;

    it('should add amount to wallet balance', async () => {
      const wallet = new Wallet(userId, 'BRL');
      mockWalletRepository.findByUserId.mockResolvedValue(wallet);

      const result = await walletService.deposit(userId, amount);

      expect(result.balance).toBe(amount);
      expect(mockWalletRepository.update).toHaveBeenCalledWith(result);
    });

    it('should throw error when wallet is not found', async () => {
      mockWalletRepository.findByUserId.mockResolvedValue(null);

      await expect(walletService.deposit(userId, amount)).rejects.toThrow('Wallet not found');
      expect(mockWalletRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('withdraw', () => {
    const userId = 'test-user-id';
    const initialBalance = 200;
    const amount = 100;

    it('should subtract amount from wallet balance', async () => {
      const wallet = new Wallet(userId, 'BRL');
      wallet.deposit(initialBalance);
      mockWalletRepository.findByUserId.mockResolvedValue(wallet);

      const result = await walletService.withdraw(userId, amount);

      expect(result.balance).toBe(initialBalance - amount);
      expect(mockWalletRepository.update).toHaveBeenCalledWith(result);
    });

    it('should throw error when wallet is not found', async () => {
      mockWalletRepository.findByUserId.mockResolvedValue(null);

      await expect(walletService.withdraw(userId, amount)).rejects.toThrow('Wallet not found');
      expect(mockWalletRepository.update).not.toHaveBeenCalled();
    });

    it('should throw error when insufficient funds', async () => {
      const wallet = new Wallet(userId, 'BRL');
      wallet.deposit(50); // Less than withdrawal amount
      mockWalletRepository.findByUserId.mockResolvedValue(wallet);

      await expect(walletService.withdraw(userId, amount)).rejects.toThrow('Insufficient funds');
      expect(mockWalletRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('lock / unlock / withdrawLocked', () => {
    const userId = 'wallet-user';

    it('locks funds and persists changes', async () => {
      const wallet = new Wallet(userId, 'BRL');
      wallet.deposit(200);
      mockWalletRepository.findByUserId.mockResolvedValue(wallet);

      const result = await walletService.lock(userId, 150);

      expect(result.balance).toBe(50);
      expect(result.lockedBalance).toBe(150);
      expect(mockWalletRepository.update).toHaveBeenCalledWith(result);
    });

    it('throws when trying to lock more than balance', async () => {
      const wallet = new Wallet(userId, 'BRL');
      wallet.deposit(50);
      mockWalletRepository.findByUserId.mockResolvedValue(wallet);

      await expect(walletService.lock(userId, 100)).rejects.toThrow('Insufficient funds');
      expect(mockWalletRepository.update).not.toHaveBeenCalled();
    });

    it('unlocks funds and moves back to balance', async () => {
      const wallet = new Wallet(userId, 'BRL');
      wallet.deposit(100);
      wallet.lock(60);
      mockWalletRepository.findByUserId.mockResolvedValue(wallet);

      const result = await walletService.unlock(userId, 30);

      expect(result.balance).toBe(70);
      expect(result.lockedBalance).toBe(30);
      expect(mockWalletRepository.update).toHaveBeenCalledWith(result);
    });

    it('throws when trying to unlock more than locked balance', async () => {
      const wallet = new Wallet(userId, 'BRL');
      wallet.deposit(100);
      wallet.lock(40);
      mockWalletRepository.findByUserId.mockResolvedValue(wallet);

      await expect(walletService.unlock(userId, 50)).rejects.toThrow(
        'Amount exceeds locked balance',
      );
      expect(mockWalletRepository.update).not.toHaveBeenCalled();
    });

    it('withdraws locked funds and persists state', async () => {
      const wallet = new Wallet(userId, 'BRL');
      wallet.deposit(200);
      wallet.lock(120);
      mockWalletRepository.findByUserId.mockResolvedValue(wallet);

      const result = await walletService.withdrawLocked(userId, 100);

      expect(result.lockedBalance).toBe(20);
      expect(mockWalletRepository.update).toHaveBeenCalledWith(result);
    });

    it('throws when withdrawing locked funds without balance', async () => {
      const wallet = new Wallet(userId, 'BRL');
      wallet.deposit(50);
      wallet.lock(50);
      mockWalletRepository.findByUserId.mockResolvedValue(wallet);

      await expect(walletService.withdrawLocked(userId, 100)).rejects.toThrow(
        'Insufficient locked funds',
      );
    });

    it('throws when wallet does not exist for lock operations', async () => {
      mockWalletRepository.findByUserId.mockResolvedValue(null);

      await expect(walletService.lock(userId, 10)).rejects.toThrow('Wallet not found');
    });
  });

  describe('lookups', () => {
    it('findByUserId delegates to repository', async () => {
      const wallet = new Wallet('lookup', 'BRL');
      mockWalletRepository.findByUserId.mockResolvedValue(wallet);

      await expect(walletService.findByUserId('lookup')).resolves.toBe(wallet);
      expect(mockWalletRepository.findByUserId).toHaveBeenCalledWith('lookup');
    });

    it('getHistory lê o Ledger e preserva os parâmetros de paginação', async () => {
      const entry = {
        toDTO: () => ({
          transactionId: 'tx-1',
          userId: 'user-x',
          type: 'DEPOSIT',
          amount: 25,
          currency: 'BRL',
          referenceId: undefined,
          source: 'pix',
          status: 'COMPLETED',
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          metadata: { description: 'dep' },
        }),
      };
      const ledger = {
        findByUserId: jest.fn().mockResolvedValue([entry]),
        countByUserId: jest.fn().mockResolvedValue(1),
      };
      const service = new WalletService(mockWalletRepository, ledger as never);

      const result = await service.getHistory('user-x', 5, 10);

      expect(ledger.findByUserId).toHaveBeenCalledWith('user-x', { limit: 5, offset: 10 });
      expect(ledger.countByUserId).toHaveBeenCalledWith('user-x');
      expect(result.total).toBe(1);
      expect(result.transactions[0]).toMatchObject({
        id: 'tx-1',
        type: 'DEPOSIT',
        amount: 25,
        description: 'dep',
      });
    });
  });
});
