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
      currency: 'BRL'
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

      await expect(walletService.createWallet(createWalletDto))
        .rejects
        .toThrow('Wallet already exists for user');
      expect(mockWalletRepository.save).not.toHaveBeenCalled();
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

      await expect(walletService.deposit(userId, amount))
        .rejects
        .toThrow('Wallet not found');
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

      await expect(walletService.withdraw(userId, amount))
        .rejects
        .toThrow('Wallet not found');
      expect(mockWalletRepository.update).not.toHaveBeenCalled();
    });

    it('should throw error when insufficient funds', async () => {
      const wallet = new Wallet(userId, 'BRL');
      wallet.deposit(50);  // Less than withdrawal amount
      mockWalletRepository.findByUserId.mockResolvedValue(wallet);

      await expect(walletService.withdraw(userId, amount))
        .rejects
        .toThrow('Insufficient funds');
      expect(mockWalletRepository.update).not.toHaveBeenCalled();
    });
  });
});