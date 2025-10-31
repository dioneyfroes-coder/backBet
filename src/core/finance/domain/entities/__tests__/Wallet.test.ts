import { Wallet } from '../Wallet';

describe('Wallet', () => {
  let wallet: Wallet;
  const userId = 'test-user-id';
  const currency = 'BRL';

  beforeEach(() => {
    wallet = new Wallet(userId, currency);
  });

  it('should create a wallet with initial balance of 0', () => {
    expect(wallet.userId).toBe(userId);
    expect(wallet.currency).toBe(currency);
    expect(wallet.balance).toBe(0);
    expect(wallet.lockedBalance).toBe(0);
  });

  describe('deposit', () => {
    it('should add amount to balance', () => {
      const amount = 100;
      wallet.deposit(amount);
      expect(wallet.balance).toBe(amount);
    });

    it('should throw error for negative amount', () => {
      expect(() => wallet.deposit(-100))
        .toThrow('Amount must be positive');
    });
  });

  describe('withdraw', () => {
    beforeEach(() => {
      wallet.deposit(200);  // Initial balance
    });

    it('should subtract amount from balance', () => {
      const amount = 100;
      wallet.withdraw(amount);
      expect(wallet.balance).toBe(100);
    });

    it('should throw error for negative amount', () => {
      expect(() => wallet.withdraw(-100))
        .toThrow('Amount must be positive');
    });

    it('should throw error for insufficient funds', () => {
      expect(() => wallet.withdraw(300))
        .toThrow('Insufficient funds');
    });
  });

  describe('lock', () => {
    beforeEach(() => {
      wallet.deposit(200);  // Initial balance
    });

    it('should move amount from balance to locked balance', () => {
      const amount = 100;
      wallet.lock(amount);
      expect(wallet.balance).toBe(100);
      expect(wallet.lockedBalance).toBe(amount);
    });

    it('should throw error for negative amount', () => {
      expect(() => wallet.lock(-100))
        .toThrow('Amount must be positive');
    });

    it('should throw error for insufficient funds', () => {
      expect(() => wallet.lock(300))
        .toThrow('Insufficient funds');
    });
  });

  describe('unlock', () => {
    beforeEach(() => {
      wallet.deposit(200);  // Initial balance
      wallet.lock(100);  // Lock some funds
    });

    it('should move amount from locked balance to available balance', () => {
      wallet.unlock(50);
      expect(wallet.balance).toBe(150);
      expect(wallet.lockedBalance).toBe(50);
    });

    it('should throw error for negative amount', () => {
      expect(() => wallet.unlock(-100))
        .toThrow('Amount must be positive');
    });

    it('should throw error for insufficient locked funds', () => {
      expect(() => wallet.unlock(200))
        .toThrow('Amount exceeds locked balance');
    });
  });
});