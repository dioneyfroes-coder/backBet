import { WalletService } from '../WalletService';
import { Wallet } from '@/core/finance/domain/entities/Wallet';

describe('WalletService extra scenarios', () => {
  const mockRepo = {
    findByUserId: jest.fn(),
    update: jest.fn(),
  } as any;
  const walletService = new WalletService(mockRepo as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const makeWallet = (): Wallet => {
    const wallet = new Wallet('user-1', 'BRL');
    wallet.deposit(200);
    return wallet;
  };

  it('locks funds and updates once', async () => {
    const wallet = makeWallet();
    mockRepo.findByUserId.mockResolvedValue(wallet);

    await walletService.lock(wallet.userId, 120);

    expect(wallet.lockedBalance).toBe(120);
    expect(wallet.balance).toBe(80);
    expect(mockRepo.update).toHaveBeenCalledTimes(1);
  });

  it('throws when trying to lock more than the balance', async () => {
    const wallet = new Wallet('user-1', 'BRL');
    wallet.deposit(50);
    mockRepo.findByUserId.mockResolvedValue(wallet);

    await expect(walletService.lock(wallet.userId, 100)).rejects.toThrow('Insufficient funds');
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it('unlocks funds and refunds to balance', async () => {
    const wallet = makeWallet();
    wallet.lock(150);
    mockRepo.findByUserId.mockResolvedValue(wallet);

    await walletService.unlock(wallet.userId, 90);

    expect(wallet.lockedBalance).toBe(60);
    expect(wallet.balance).toBe(140);
    expect(mockRepo.update).toHaveBeenCalledTimes(1);
  });

  it('throws when unlocking more than locked amount', async () => {
    const wallet = makeWallet();
    wallet.lock(70);
    mockRepo.findByUserId.mockResolvedValue(wallet);

    await expect(walletService.unlock(wallet.userId, 120)).rejects.toThrow('Amount exceeds locked balance');
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it('withdraws locked funds after approval', async () => {
    const wallet = makeWallet();
    wallet.lock(100);
    mockRepo.findByUserId.mockResolvedValue(wallet);

    await walletService.withdrawLocked(wallet.userId, 100);

    expect(wallet.lockedBalance).toBe(0);
    expect(mockRepo.update).toHaveBeenCalledTimes(1);
  });

  it('throws when there are not enough locked funds for withdrawLocked', async () => {
    const wallet = makeWallet();
    wallet.lock(50);
    mockRepo.findByUserId.mockResolvedValue(wallet);

    await expect(walletService.withdrawLocked(wallet.userId, 100)).rejects.toThrow('Insufficient locked funds');
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it(' refuses operations when the wallet is missing', async () => {
    mockRepo.findByUserId.mockResolvedValue(null);

    const ops = [
      walletService.lock('user-1', 1),
      walletService.unlock('user-1', 1),
      walletService.withdrawLocked('user-1', 1),
    ];

    for (const op of ops) {
      await expect(op).rejects.toThrow('Wallet not found');
    }
    expect(mockRepo.update).not.toHaveBeenCalled();
  });
});
