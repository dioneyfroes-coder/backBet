import { Email } from '../Email';

describe('Email Value Object', () => {
  const validEmails = [
    'test@example.com',
    'user@domain.co.uk',
    'first.last@example.com',
    'user+label@example.com',
    'user123@domain.co',
    'user-name@domain.com',
  ];

  const invalidEmails = [
    'invalid',
    'invalid@',
    '@invalid',
    'invalid@invalid',
    'invalid.com',
    '@invalid.com',
    'user@',
    '@domain.com',
    'user name@domain.com',
    'user@domain..com',
  ];

  describe('constructor', () => {
    it('should create an Email with valid email addresses', () => {
      validEmails.forEach(validEmail => {
        const email = new Email(validEmail);
        expect(email.value).toBe(validEmail);
      });
    });

    it('should throw error for invalid email addresses', () => {
      invalidEmails.forEach(invalidEmail => {
        expect(() => new Email(invalidEmail)).toThrow('Invalid email format');
      });
    });
  });

  describe('toString', () => {
    it('should return the email address string', () => {
      const emailStr = 'test@example.com';
      const email = new Email(emailStr);
      expect(email.toString()).toBe(emailStr);
    });

    it('should be equivalent to value property', () => {
      const emailStr = 'test@example.com';
      const email = new Email(emailStr);
      expect(email.toString()).toBe(emailStr);
    });
  });

  describe('validation', () => {
    it('should reject undefined or null emails', () => {
      expect(() => new Email(undefined as any)).toThrow('Invalid email format');
      expect(() => new Email(null as any)).toThrow('Invalid email format');
    });

    it('should reject non-string inputs', () => {
      expect(() => new Email(123 as any)).toThrow('Invalid email format');
      expect(() => new Email({} as any)).toThrow('Invalid email format');
      expect(() => new Email([] as any)).toThrow('Invalid email format');
    });

    it('should reject emails with spaces', () => {
      expect(() => new Email('user @domain.com')).toThrow('Invalid email format');
      expect(() => new Email('user@ domain.com')).toThrow('Invalid email format');
      expect(() => new Email(' user@domain.com')).toThrow('Invalid email format');
      expect(() => new Email('user@domain.com ')).toThrow('Invalid email format');
    });

    it('should reject emails with invalid domain parts', () => {
      expect(() => new Email('user@.com')).toThrow('Invalid email format');
      expect(() => new Email('user@domain.')).toThrow('Invalid email format');
      expect(() => new Email('user@.domain.com')).toThrow('Invalid email format');
      expect(() => new Email('user@domain..com')).toThrow('Invalid email format');
    });

    it('should reject emails with missing parts', () => {
      expect(() => new Email('@')).toThrow('Invalid email format');
      expect(() => new Email('.@domain.com')).toThrow('Invalid email format');
      expect(() => new Email('user@.')).toThrow('Invalid email format');
      expect(() => new Email('.@.')).toThrow('Invalid email format');
    });

    it('should accept complex but valid domain names', () => {
      const email = new Email('user@sub1.sub2.sub3.domain.co.uk');
      expect(email.value).toBe('user@sub1.sub2.sub3.domain.co.uk');
    });

    it('should accept email with special characters in local part', () => {
      const email = new Email('user.name+tag-123@domain.com');
      expect(email.value).toBe('user.name+tag-123@domain.com');
    });
  });
});