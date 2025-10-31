import { CurrencyValueObject, Currency } from '../Currency';

describe('CurrencyValueObject', () => {
  describe('constructor', () => {
    it('should create currency value object with supported currency', () => {
      expect(new CurrencyValueObject('BRL').toString()).toBe('BRL');
      expect(new CurrencyValueObject('USD').toString()).toBe('USD');
      expect(new CurrencyValueObject('EUR').toString()).toBe('EUR');
    });

    it('should throw error for unsupported currency', () => {
      expect(() => new CurrencyValueObject('GBP' as Currency))
        .toThrow('Invalid currency');
      expect(() => new CurrencyValueObject('JPY' as Currency))
        .toThrow('Invalid currency');
    });

    it('should throw error for invalid inputs', () => {
      expect(() => new CurrencyValueObject('' as Currency))
        .toThrow('Invalid currency');
      expect(() => new CurrencyValueObject('brl' as Currency))
        .toThrow('Invalid currency');
      expect(() => new CurrencyValueObject('BRL ' as Currency))
        .toThrow('Invalid currency');
      expect(() => new CurrencyValueObject(' BRL' as Currency))
        .toThrow('Invalid currency');
    });
  });

  describe('toString', () => {
    it('should return the currency code', () => {
      const supportedCurrencies: Currency[] = ['BRL', 'USD', 'EUR'];
      
      supportedCurrencies.forEach(code => {
        const currency = new CurrencyValueObject(code);
        expect(currency.toString()).toBe(code);
      });
    });
  });
});