import { Money } from '../Money';

describe('Money Value Object', () => {
  describe('constructor and validation', () => {
    it('should create a Money instance with valid amount and currency', () => {
      const money = new Money(100, 'BRL');
      expect(money.amount).toBe(100);
      expect(money.currency).toBe('BRL');
    });

    it('should support all valid currencies', () => {
      const currencies: Array<'BRL' | 'USD' | 'EUR'> = ['BRL', 'USD', 'EUR'];
      currencies.forEach((currency) => {
        const money = new Money(50, currency);
        expect(money.currency).toBe(currency);
      });
    });

    it('should throw error for invalid currency', () => {
      expect(() => new Money(100, 'GBP' as any)).toThrow('Invalid currency');
      expect(() => new Money(100, 'JPY' as any)).toThrow('Invalid currency');
    });

    it('should throw error for negative amount', () => {
      expect(() => new Money(-100, 'BRL')).toThrow('Invalid money amount');
    });

    it('should throw error for non-number amount', () => {
      expect(() => new Money(NaN, 'BRL')).toThrow('Invalid money amount');
      expect(() => new Money(undefined as any, 'BRL')).toThrow('Invalid money amount');
    });

    it('should accept zero amount', () => {
      const money = new Money(0, 'BRL');
      expect(money.amount).toBe(0);
    });

    it('should accept decimal amounts with up to 2 places', () => {
      const money = new Money(99.99, 'BRL');
      expect(money.amount).toBe(99.99);
    });

    it('should keep arithmetic exact to the cent', () => {
      const result = new Money(0.1, 'BRL').add(new Money(0.2, 'BRL'));
      expect(result.amount).toBe(0.3);
    });

    it('should reject amounts with more than 2 decimal places', () => {
      expect(() => new Money(10.999, 'BRL')).toThrow('Money amount must have at most 2 decimal places');
      expect(() => new Money(1.234, 'BRL')).toThrow('Money amount must have at most 2 decimal places');
      expect(() => new Money(0.001, 'BRL')).toThrow('Money amount must have at most 2 decimal places');
    });

    it('should reject amounts with more than 2 decimals expressed in scientific notation', () => {
      expect(() => new Money(0.0001, 'BRL')).toThrow(
        'Money amount must have at most 2 decimal places',
      );
      expect(() => new Money(1e-7, 'BRL')).toThrow(
        'Money amount must have at most 2 decimal places',
      );
      expect(() => new Money(1.23456789, 'BRL')).toThrow(
        'Money amount must have at most 2 decimal places',
      );
    });

    it('should accept small valid amounts without silent rounding', () => {
      const money = new Money(0.01, 'BRL');
      expect(money.amount).toBe(0.01);
      expect(money.getCents()).toBe(1);
    });

    it('should accept amounts with exactly 2 decimal places', () => {
      const money = new Money(10.99, 'BRL');
      expect(money.amount).toBe(10.99);
    });

    it('should accept amounts with 1 decimal place', () => {
      const money = new Money(10.5, 'BRL');
      expect(money.amount).toBe(10.5);
    });
  });

  describe('fromCents and getCents', () => {
    it('should create Money from integer cents', () => {
      const money = Money.fromCents(15783, 'BRL');
      expect(money.amount).toBe(157.83);
      expect(money.currency).toBe('BRL');
    });

    it('should create Money from zero cents', () => {
      const money = Money.fromCents(0, 'BRL');
      expect(money.amount).toBe(0);
    });

    it('should return the same cents via getCents', () => {
      const money = new Money(157.83, 'BRL');
      expect(money.getCents()).toBe(15783);
    });

    it('should round-trip between constructor and fromCents', () => {
      const original = new Money(42.5, 'USD');
      const fromCents = Money.fromCents(original.getCents(), original.currency);
      expect(fromCents.amount).toBe(original.amount);
      expect(fromCents.equals(original)).toBe(true);
    });

    it('should throw for non-integer cents in fromCents', () => {
      expect(() => Money.fromCents(10.5, 'BRL')).toThrow('Cents must be a finite integer');
    });

    it('should throw for NaN cents in fromCents', () => {
      expect(() => Money.fromCents(NaN, 'BRL')).toThrow('Cents must be a finite integer');
    });

    it('should throw for Infinity cents in fromCents', () => {
      expect(() => Money.fromCents(Infinity, 'BRL')).toThrow('Cents must be a finite integer');
    });
  });

  describe('calculateLiability', () => {
    it('should calculate liability for stake × (odds - 1)', () => {
      const stake = new Money(100, 'BRL');
      const liability = stake.calculateLiability(2.0);
      expect(liability.amount).toBe(100); // 100 × (2.0 - 1) = 100
      expect(liability.currency).toBe('BRL');
    });

    it('should calculate liability for low odds', () => {
      const stake = new Money(10, 'BRL');
      const liability = stake.calculateLiability(1.1);
      expect(liability.amount).toBe(1); // 10 × 0.1 = 1
    });

    it('should calculate liability for high odds', () => {
      const stake = new Money(100, 'BRL');
      const liability = stake.calculateLiability(10.0);
      expect(liability.amount).toBe(900); // 100 × 9 = 900
    });

    it('should calculate liability for minimum odds', () => {
      const stake = new Money(100, 'BRL');
      const liability = stake.calculateLiability(1.01);
      expect(liability.amount).toBe(1); // 100 × 0.01 = 1
    });

    it('should calculate liability with exact cents (no drift)', () => {
      const stake = new Money(10, 'BRL');
      const liability = stake.calculateLiability(1.15);
      // 1000 cents × 0.15 = 150 cents = 1.50
      expect(liability.amount).toBe(1.5);
      expect(liability.getCents()).toBe(150);
    });

    it('should round liability to nearest cent', () => {
      const stake = new Money(10, 'BRL');
      const liability = stake.calculateLiability(1.33);
      // 1000 cents × 0.33 = 330 cents = 3.30
      expect(liability.amount).toBe(3.3);
    });

    it('should handle fractional cent results by rounding', () => {
      const stake = new Money(1, 'BRL');
      const liability = stake.calculateLiability(1.5);
      // 100 cents × 0.5 = 50 cents = 0.50
      expect(liability.amount).toBe(0.5);
    });

    it('should throw for odds below 1.01', () => {
      const stake = new Money(10, 'BRL');
      expect(() => stake.calculateLiability(1.0)).toThrow('Odds must be >= 1.01');
      expect(() => stake.calculateLiability(0.5)).toThrow('Odds must be >= 1.01');
    });

    it('should throw for non-finite odds', () => {
      const stake = new Money(10, 'BRL');
      expect(() => stake.calculateLiability(NaN)).toThrow('Odds must be >= 1.01');
      expect(() => stake.calculateLiability(Infinity)).toThrow('Odds must be >= 1.01');
    });

    it('should return same currency as stake', () => {
      const stake = new Money(100, 'USD');
      const liability = stake.calculateLiability(2.0);
      expect(liability.currency).toBe('USD');
    });
  });

  describe('add method', () => {
    it('should add two Money instances with same currency', () => {
      const money1 = new Money(100, 'BRL');
      const money2 = new Money(50, 'BRL');
      const result = money1.add(money2);

      expect(result.amount).toBe(150);
      expect(result.currency).toBe('BRL');
    });

    it('should throw error when adding different currencies', () => {
      const money1 = new Money(100, 'BRL');
      const money2 = new Money(50, 'USD');
      expect(() => money1.add(money2)).toThrow('Cannot add money with different currencies');
    });

    it('should return new instance (immutable)', () => {
      const money1 = new Money(100, 'BRL');
      const money2 = new Money(50, 'BRL');
      const result = money1.add(money2);

      expect(money1.amount).toBe(100);
      expect(money2.amount).toBe(50);
      expect(result).not.toBe(money1);
      expect(result).not.toBe(money2);
    });
  });

  describe('subtract method', () => {
    it('should subtract two Money instances with same currency', () => {
      const money1 = new Money(100, 'BRL');
      const money2 = new Money(30, 'BRL');
      const result = money1.subtract(money2);

      expect(result.amount).toBe(70);
      expect(result.currency).toBe('BRL');
    });

    it('should throw error when result would be negative', () => {
      const money1 = new Money(50, 'BRL');
      const money2 = new Money(100, 'BRL');
      expect(() => money1.subtract(money2)).toThrow('Result would be negative');
    });

    it('should throw error when subtracting different currencies', () => {
      const money1 = new Money(100, 'BRL');
      const money2 = new Money(50, 'USD');
      expect(() => money1.subtract(money2)).toThrow(
        'Cannot subtract money with different currencies',
      );
    });

    it('should allow subtracting exact amount', () => {
      const money1 = new Money(100, 'BRL');
      const money2 = new Money(100, 'BRL');
      const result = money1.subtract(money2);

      expect(result.amount).toBe(0);
    });
  });

  describe('multiply method', () => {
    it('should multiply Money by a positive factor', () => {
      const money = new Money(50, 'BRL');
      const result = money.multiply(3);

      expect(result.amount).toBe(150);
      expect(result.currency).toBe('BRL');
    });

    it('should multiply by 1 (identity)', () => {
      const money = new Money(100, 'BRL');
      const result = money.multiply(1);

      expect(result.amount).toBe(100);
    });

    it('should multiply by 0', () => {
      const money = new Money(100, 'BRL');
      const result = money.multiply(0);

      expect(result.amount).toBe(0);
    });

    it('should multiply by decimal factor', () => {
      const money = new Money(100, 'BRL');
      const result = money.multiply(1.5);

      expect(result.amount).toBe(150);
    });

    it('should throw error for negative factor', () => {
      const money = new Money(100, 'BRL');
      expect(() => money.multiply(-2)).toThrow('Cannot multiply by negative factor');
    });

    it('should return new instance (immutable)', () => {
      const money = new Money(100, 'BRL');
      const result = money.multiply(2);

      expect(money.amount).toBe(100);
      expect(result).not.toBe(money);
    });
  });

  describe('comparison methods', () => {
    it('should determine if Money is greater than another', () => {
      const money1 = new Money(100, 'BRL');
      const money2 = new Money(50, 'BRL');

      expect(money1.isGreaterThan(money2)).toBe(true);
      expect(money2.isGreaterThan(money1)).toBe(false);
      expect(money1.isGreaterThan(money1)).toBe(false);
    });

    it('should determine if Money is less than another', () => {
      const money1 = new Money(50, 'BRL');
      const money2 = new Money(100, 'BRL');

      expect(money1.isLessThan(money2)).toBe(true);
      expect(money2.isLessThan(money1)).toBe(false);
      expect(money1.isLessThan(money1)).toBe(false);
    });

    it('should throw error when comparing different currencies', () => {
      const money1 = new Money(100, 'BRL');
      const money2 = new Money(50, 'USD');

      expect(() => money1.isGreaterThan(money2)).toThrow(
        'Cannot compare money with different currencies',
      );
      expect(() => money1.isLessThan(money2)).toThrow(
        'Cannot compare money with different currencies',
      );
    });
  });

  describe('equals method', () => {
    it('should return true for equal Money instances', () => {
      const money1 = new Money(100, 'BRL');
      const money2 = new Money(100, 'BRL');

      expect(money1.equals(money2)).toBe(true);
    });

    it('should return false for different amounts', () => {
      const money1 = new Money(100, 'BRL');
      const money2 = new Money(50, 'BRL');

      expect(money1.equals(money2)).toBe(false);
    });

    it('should return false for different currencies', () => {
      const money1 = new Money(100, 'BRL');
      const money2 = new Money(100, 'USD');

      expect(money1.equals(money2)).toBe(false);
    });

    it('should return true for Money created fromCents', () => {
      const m1 = new Money(10.5, 'BRL');
      const m2 = Money.fromCents(1050, 'BRL');
      expect(m1.equals(m2)).toBe(true);
    });
  });

  describe('toString method', () => {
    it('should format Money as string with currency and amount', () => {
      const money = new Money(100.5, 'BRL');
      expect(money.toString()).toBe('BRL 100.50');
    });

    it('should format with two decimal places', () => {
      const money = new Money(100, 'USD');
      expect(money.toString()).toBe('USD 100.00');
    });

    it('should handle large amounts', () => {
      const money = new Money(1000000.99, 'EUR');
      expect(money.toString()).toBe('EUR 1000000.99');
    });
  });

  describe('toJSON method', () => {
    it('should return amount and currency', () => {
      const money = new Money(42.5, 'BRL');
      expect(money.toJSON()).toEqual({ amount: 42.5, currency: 'BRL' });
    });
  });
});
