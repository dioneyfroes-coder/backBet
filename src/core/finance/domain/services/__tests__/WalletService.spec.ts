import { WalletService } from '@/core/finance/domain/services/WalletService';
import { IWalletRepository } from '@/core/finance/domain/repositories/IWalletRepository';
import { Wallet } from '@/core/finance/domain/entities/Wallet';
import { ICreateWalletDTO } from '@/core/finance/types/wallet.types';

describe('WalletService', () => {
  let walletService: WalletService;
  let mockWalletRepository: jest.Mocked<IWalletRepository>;

  beforeEach(() => {
    mockWalletRepository = {
      findByUserId: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    };
    walletService = new WalletService(mockWalletRepository);
  });

  describe('createWallet', () => {
    const createWalletDTO: ICreateWalletDTO = {
      userId: '1',
      currency: 'BRL'
    };

    it('deve criar uma nova carteira com sucesso', async () => {
      mockWalletRepository.findByUserId.mockResolvedValue(null);
      mockWalletRepository.save.mockResolvedValue(undefined);

      const result = await walletService.createWallet(createWalletDTO);

      expect(result).toBeInstanceOf(Wallet);
      expect(result.userId).toBe('1');
      expect(result.currency).toBe('BRL');
      expect(mockWalletRepository.save).toHaveBeenCalledWith(expect.any(Wallet));
    });

    it('deve criar uma nova carteira com moeda específica', async () => {
      mockWalletRepository.findByUserId.mockResolvedValue(null);
      mockWalletRepository.save.mockResolvedValue(undefined);

      const result = await walletService.createWallet({
        ...createWalletDTO,
        currency: 'USD'
      });

      expect(result.currency).toBe('USD');
    });

    it('deve lançar erro se já existir uma carteira para o usuário', async () => {
      mockWalletRepository.findByUserId.mockResolvedValue(new Wallet('1', 'BRL'));

      await expect(walletService.createWallet(createWalletDTO))
        .rejects
        .toThrow('Wallet already exists for user');
    });
  });

  describe('deposit', () => {
    it('deve realizar um depósito com sucesso', async () => {
      const wallet = new Wallet('1', 'BRL');
      mockWalletRepository.findByUserId.mockResolvedValue(wallet);
      mockWalletRepository.update.mockResolvedValue(undefined);

      const result = await walletService.deposit('1', 100);

      expect(result.balance).toBe(100);
      expect(mockWalletRepository.update).toHaveBeenCalledWith(wallet);
    });

    it('deve lançar erro se a carteira não existir', async () => {
      mockWalletRepository.findByUserId.mockResolvedValue(null);

      await expect(walletService.deposit('1', 100))
        .rejects
        .toThrow('Wallet not found');
    });
  });

  describe('withdraw', () => {
    it('deve realizar um saque com sucesso', async () => {
      const wallet = new Wallet('1', 'BRL');
      wallet.deposit(100);
      mockWalletRepository.findByUserId.mockResolvedValue(wallet);
      mockWalletRepository.update.mockResolvedValue(undefined);

      const result = await walletService.withdraw('1', 50);

      expect(result.balance).toBe(50);
      expect(mockWalletRepository.update).toHaveBeenCalledWith(wallet);
    });

    it('deve lançar erro se a carteira não existir', async () => {
      mockWalletRepository.findByUserId.mockResolvedValue(null);

      await expect(walletService.withdraw('1', 50))
        .rejects
        .toThrow('Wallet not found');
    });

    it('deve lançar erro se tentar sacar mais do que o saldo', async () => {
      const wallet = new Wallet('1', 'BRL');
      wallet.deposit(100);
      mockWalletRepository.findByUserId.mockResolvedValue(wallet);

      await expect(walletService.withdraw('1', 150))
        .rejects
        .toThrow('Insufficient funds');
    });
  });
});