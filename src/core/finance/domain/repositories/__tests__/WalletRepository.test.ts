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
    const found = await repository.findByUserId('user-1');
    expect(found).not.toBeNull();
    expect(found?.balance).toBe(wallet.balance);
    expect(found?.currency).toBe(wallet.currency);

    wallet.deposit(50);
    wallet.incrementVersion();
    await repository.update(wallet);
    expect((await repository.findByUserId('user-1'))?.balance).toBe(150);

    await repository.delete('user-1');
    expect(await repository.findByUserId('user-1')).toBeNull();
  });

  it('returns empty history when wallet does not exist', async () => {
    const history = await repository.getHistory('missing');
    expect(history).toEqual({ transactions: [], total: 0 });
  });

  it('rejects a stale concurrent wallet update', async () => {
    await repository.save(wallet);
    const firstRead = await repository.findByUserId('user-1');
    const secondRead = await repository.findByUserId('user-1');

    firstRead!.deposit(25);
    firstRead!.incrementVersion();
    secondRead!.deposit(40);
    secondRead!.incrementVersion();

    await repository.update(firstRead!);
    await expect(repository.update(secondRead!)).rejects.toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
    });

    const persisted = await repository.findByUserId('user-1');
    expect(persisted?.balance).toBe(125);
    expect(persisted?.version).toBe(2);
  });

  it('returns paginated history for an existing wallet', async () => {
    await repository.save(wallet);
    wallet.withdraw(10, { description: 'first' });
    wallet.incrementVersion();
    await repository.update(wallet);
    wallet.withdraw(20, { description: 'second' });
    wallet.incrementVersion();
    await repository.update(wallet);

    const history = await repository.getHistory('user-1', 1, 0);
    expect(history.total).toBe(3); // initial deposit + 2 withdraws
    expect(history.transactions).toHaveLength(1);
  });
});
