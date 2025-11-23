import { CreditPackage } from '../CreditPackage';
import { Currency } from '../../value-objects/Currency';

describe('CreditPackage entity', () => {
  const currency: Currency = 'BRL';

  it('computes total credits and DTO', () => {
    const pkg = new CreditPackage('pkg-1', 'CODE', 'Starter', 100, 20, currency, 99.9, 'desc');

    expect(pkg.totalCredits).toBe(120);
    expect(pkg.toDTO()).toMatchObject({ totalCredits: 120, currency });
  });

  it('throws when values are negative', () => {
    expect(() => new CreditPackage('id', 'C', 'Label', -1, 0, currency, 10)).toThrow(
      'Valores inválidos para pacote de créditos',
    );
  });
});
