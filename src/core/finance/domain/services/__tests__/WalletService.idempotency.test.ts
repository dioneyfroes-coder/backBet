import { WalletService } from '../WalletService';
import { WalletRepository } from '../../repositories/WalletRepository';
import { InMemoryLedgerRepository } from '../../repositories/InMemoryLedgerRepository';

describe('WalletService ledger-level idempotency', () => {
  let walletService: WalletService;
  let walletRepository: WalletRepository;
  let ledgerRepository: InMemoryLedgerRepository;

  beforeEach(async () => {
    walletRepository = new WalletRepository();
    ledgerRepository = new InMemoryLedgerRepository();
    walletService = new WalletService(walletRepository, ledgerRepository);

    await walletService.createWallet({ userId: 'user-1', currency: 'BRL' });
  });

  it('does not double-credit a deposit replayed with the same referenceId', async () => {
    const context = { type: 'DEPOSIT' as const, referenceId: 'deposit-1', source: 'DEPOSIT' };
    await walletService.deposit('user-1', 100, context);
    await walletService.deposit('user-1', 100, context);

    const wallet = await walletService.findByUserId('user-1');
    expect(wallet?.balance).toBe(100);
  });

  it('does not double-debit a withdrawal replayed with the same referenceId', async () => {
    await walletService.deposit('user-1', 100);
    const context = { type: 'BET_DEBIT' as const, referenceId: 'bet-1', source: 'BET' };
    await walletService.withdraw('user-1', 40, context);
    await walletService.withdraw('user-1', 40, context);

    const wallet = await walletService.findByUserId('user-1');
    expect(wallet?.balance).toBe(60);
  });

  it('does not double-refund after an idempotent cancel replay', async () => {
    await walletService.deposit('user-1', 100);
    const debit = { type: 'BET_DEBIT' as const, referenceId: 'bet-2', source: 'BET' };
    const refund = { type: 'BET_REFUND' as const, referenceId: 'bet-2', source: 'BET' };

    await walletService.withdraw('user-1', 40, debit);
    await walletService.deposit('user-1', 40, refund);
    // replay do cancelamento (fora do middleware / após TTL)
    await walletService.deposit('user-1', 40, refund);

    const wallet = await walletService.findByUserId('user-1');
    expect(wallet?.balance).toBe(100);
  });

  it('distinct referenceIds still apply both operations', async () => {
    const a = { type: 'BET_WIN' as const, referenceId: 'bet-a', source: 'BET' };
    const b = { type: 'BET_WIN' as const, referenceId: 'bet-b', source: 'BET' };
    await walletService.deposit('user-1', 10, a);
    await walletService.deposit('user-1', 20, b);

    const wallet = await walletService.findByUserId('user-1');
    expect(wallet?.balance).toBe(30);
  });
});
