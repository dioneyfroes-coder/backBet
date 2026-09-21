import { WalletService } from '../WalletService';
import { WalletRepository } from '../../repositories/WalletRepository';
import { InMemoryLedgerRepository } from '../../repositories/InMemoryLedgerRepository';
import { Wallet } from '../../entities/Wallet';

/**
 * Item #7 do plano: a Wallet não mantém mais histórico embutido
 * (`transactions[]`); o extrato é derivado do Ledger (append-only). Estes
 * testes garantem que saldo continua correto, o Ledger continua completo e a
 * API de histórico continua funcionando lendo do Ledger.
 */
describe('Wallet history derived from Ledger (item #7)', () => {
  let walletRepository: WalletRepository;
  let ledgerRepository: InMemoryLedgerRepository;
  let walletService: WalletService;

  beforeEach(() => {
    walletRepository = new WalletRepository();
    ledgerRepository = new InMemoryLedgerRepository();
    walletService = new WalletService(walletRepository, ledgerRepository);
  });

  it('Wallet não expõe mais histórico embutido', () => {
    const wallet = new Wallet('user-1', 'BRL');
    expect('getTransactions' in wallet).toBe(false);
    expect((wallet as unknown as { _transactions?: unknown })._transactions).toBeUndefined();
  });

  it('saldo permanece correto e o Ledger registra todas as operações', async () => {
    await walletService.createWallet({ userId: 'user-1', currency: 'BRL' });
    await walletService.deposit('user-1', 100);
    await walletService.withdraw('user-1', 30);

    const wallet = await walletRepository.findByUserId('user-1');
    expect(wallet?.balance).toBe(70);
    expect(wallet?.lockedBalance).toBe(0);

    const entries = await ledgerRepository.findByUserId('user-1');
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.type).sort()).toEqual(['DEPOSIT', 'WITHDRAWAL_COMPLETED']);
    expect(await ledgerRepository.countByUserId('user-1')).toBe(2);
  });

  it('getHistory serve o extrato a partir do Ledger com o mesmo contrato', async () => {
    await walletService.createWallet({ userId: 'user-2', currency: 'BRL' });
    await walletService.deposit('user-2', 100);
    await walletService.withdraw('user-2', 30);

    const history = await walletService.getHistory('user-2', 10, 0);

    expect(history.total).toBe(2);
    expect(history.transactions).toHaveLength(2);
    expect(history.transactions.map((tx) => tx.type).sort()).toEqual([
      'DEPOSIT',
      'WITHDRAWAL_COMPLETED',
    ]);
    expect(history.transactions.reduce((sum, tx) => sum + tx.amount, 0)).toBe(130);
  });

  it('usuário sem movimentos tem histórico vazio', async () => {
    const history = await walletService.getHistory('user-sem-ledger');
    expect(history).toEqual({ transactions: [], total: 0 });
  });
});
