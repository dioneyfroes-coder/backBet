import { WalletRepository } from '../../repositories/WalletRepository';
import { Wallet } from '../../entities/Wallet';

describe('WalletRepository', () => {
  let repository: WalletRepository;
  let wallet: Wallet;

  beforeEach(() => {
    repository = new WalletRepository();
    wallet = new Wallet('user-1', 'BRL');
    wallet.deposit(100);
  });

  it('persists, finds and updates wallets', async () => {
    await repository.save(wallet);
    expect(await repository.findByUserId('user-1')).toEqual(wallet);

    wallet.deposit(50);
    await repository.update(wallet);
    expect((await repository.findByUserId('user-1'))?.balance).toBe(150);

    await repository.delete('user-1');
    expect(await repository.findByUserId('user-1')).toBeNull();
  });

  it('returns empty history when wallet does not exist', async () => {
    const history = await repository.getHistory('missing');
    expect(history).toEqual({ transactions: [], total: 0 });
  });

  it('returns paginated history for an existing wallet', async () => {
    await repository.save(wallet);
    wallet.withdraw(10, 'first');
    wallet.withdraw(20, 'second');

    const history = await repository.getHistory('user-1', 1, 0);
    expect(history.total).toBe(3); // initial deposit + 2 withdraws
    expect(history.transactions).toHaveLength(1);
  });
});
