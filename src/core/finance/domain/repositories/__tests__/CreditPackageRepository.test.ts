import { CreditPackageRepository } from '../CreditPackageRepository';
import { CreditPackage } from '@/core/finance/domain/entities/CreditPackage';

function packageFixture(id: string, isActive = true) {
  return new CreditPackage(id, `code-${id}`, `Pacote ${id}`, 10000, 1000, 'BRL', 9000, undefined, isActive);
}

describe('CreditPackageRepository (in-memory)', () => {
  it('save + findById: cria e recupera o pacote; id desconhecido devolve null', async () => {
    const repo = new CreditPackageRepository();
    const pkg = packageFixture('pkg-1');

    await repo.save(pkg);

    await expect(repo.findById('pkg-1')).resolves.toBe(pkg);
    await expect(repo.findById('missing')).resolves.toBeNull();
  });

  it('save substitui pacote existente (mesmo id)', async () => {
    const repo = new CreditPackageRepository();
    await repo.save(packageFixture('pkg-1'));

    const updated = packageFixture('pkg-1', false);
    await repo.save(updated);

    const found = await repo.findById('pkg-1');
    expect(found).toBe(updated);
    expect(found?.isActive).toBe(false);
  });

  it('listActive filtra apenas pacotes ativos', async () => {
    const repo = new CreditPackageRepository();
    await repo.save(packageFixture('pkg-active', true));
    await repo.save(packageFixture('pkg-inactive', false));

    const list = await repo.listActive();
    expect(list.map((p) => p.id)).toEqual(['pkg-active']);
  });
});