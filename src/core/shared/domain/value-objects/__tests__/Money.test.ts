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
      currencies.forEach(currency => {
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

    it('should accept decimal amounts', () => {
      const money = new Money(99.99, 'BRL');
      expect(money.amount).toBe(99.99);
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
      expect(() => money1.subtract(money2)).toThrow('Cannot subtract money with different currencies');
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

      expect(() => money1.isGreaterThan(money2)).toThrow('Cannot compare money with different currencies');
      expect(() => money1.isLessThan(money2)).toThrow('Cannot compare money with different currencies');
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
  });

  describe('toString method', () => {
    it('should format Money as string with currency and amount', () => {
      const money = new Money(100.50, 'BRL');
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
});